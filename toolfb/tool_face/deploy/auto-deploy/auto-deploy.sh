#!/usr/bin/env bash
# ========================================================
# Tự động deploy Tool Social từ GitHub (nhánh main) trên VPS DÙNG CHUNG với site khác.
# systemd timer toolsocial-deploy.timer gọi script này mỗi 3 phút; không có commit mới thì thoát ngay.
#
#   auto-deploy.sh               deploy nếu main có commit mới
#   auto-deploy.sh --build-only  chỉ build thử commit mới nhất, không deploy
#   auto-deploy.sh --force       deploy lại kể cả khi commit không đổi
#   SIMULATE_HEALTH_FAIL=1 ...   giả lập kiểm tra sau deploy thất bại (để thử chức năng tự quay lại)
#
# Cấu hình riêng của máy chủ (KHÔNG đưa lên Git): /opt/toolsocial/.deploy.conf — xem deploy.conf.example
# Nhật ký: /var/log/toolsocial-deploy.log
# ========================================================
set -Euo pipefail

APP_DIR=/opt/toolsocial
REPO_DIR=$APP_DIR/repo
BRANCH=main
LOG=/var/log/toolsocial-deploy.log
STATE_DEPLOYED=$APP_DIR/.deployed-commit
STATE_FAILED=$APP_DIR/.failed-commit
BUILDER=toolsocial-builder
PUBLIC_URL=""
GUARD_URLS=""
[ -f "$APP_DIR/.deploy.conf" ] && . "$APP_DIR/.deploy.conf"

# buildx chỉ cài trong thư mục của tool → không đổi cách build của các dự án khác trên máy chủ
export DOCKER_CONFIG=$APP_DIR/.docker
COMPOSE=(docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.shared.yml")
HOST_PORT=$(grep -E '^HOST_PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)
HOST_PORT=${HOST_PORT:-3100}

MODE=deploy
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --build-only) MODE=build ;;
    --force) FORCE=1 ;;
  esac
done

exec 9>/run/lock/toolsocial-deploy.lock
flock -n 9 || exit 0

log() { echo "$(TZ=Asia/Ho_Chi_Minh date '+%F %T') $*" | tee -a "$LOG"; }

# Site khác trên máy chủ phải giữ đúng mã HTTP như trong .deploy.conf
guard_ok() {
  local url want got bad=0
  while read -r url want; do
    [ -z "${url:-}" ] && continue
    got=$(curl -s -o /dev/null -m 25 -w '%{http_code}' "$url" || true)
    if [ "$got" != "$want" ]; then
      log "  site khác $url: $got (mong đợi $want)"
      bad=1
    fi
  done <<< "$GUARD_URLS"
  return $bad
}

wait_local_health() {
  local _
  for _ in $(seq 1 40); do
    curl -sf -m 5 "http://127.0.0.1:$HOST_PORT/api/health" >/dev/null && return 0
    sleep 3
  done
  return 1
}

check_public() {
  local path code
  [ -z "$PUBLIC_URL" ] && return 0
  for path in /api/health /privacy/ /login/; do
    code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$PUBLIC_URL$path" || true)
    if [ "$code" != 200 ]; then
      log "  $PUBLIC_URL$path → $code"
      return 1
    fi
  done
}

git -C "$REPO_DIR" fetch -q origin "$BRANCH" || { log "Không lấy được code từ GitHub, thử lại lần sau"; exit 1; }
NEW=$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")
CUR=$(cat "$STATE_DEPLOYED" 2>/dev/null || true)
if [ "$MODE" = deploy ] && [ "$FORCE" = 0 ]; then
  [ "$NEW" = "$CUR" ] && exit 0
  [ "$NEW" = "$(cat "$STATE_FAILED" 2>/dev/null || true)" ] && exit 0
fi
SHORT=${NEW:0:7}
CUR_SHORT=${CUR:0:7}
log "===== $( [ "$MODE" = build ] && echo 'Build thử' || echo 'Deploy') commit $SHORT — $(git -C "$REPO_DIR" log -1 --format='%an: %s' "$NEW")"

fail_commit() {
  [ "$MODE" = deploy ] && echo "$NEW" > "$STATE_FAILED"
  log "❌ $1 — giữ nguyên bản đang chạy ${CUR_SHORT:-?} (commit này sẽ không được thử lại)"
  exit 1
}

git -C "$REPO_DIR" checkout -q --force --detach "$NEW" || fail_commit "Không checkout được commit"
SRC=$REPO_DIR/tool_face

if grep -rlE '^(<<<<<<<|>>>>>>>) ' "$SRC" --include='*.js' --include='*.jsx' --include='*.css' --include='*.yml' --include='*.conf' --exclude-dir=node_modules >/dev/null 2>&1; then
  fail_commit "Code còn dấu xung đột Git chưa giải quyết"
fi

if [ "$MODE" = deploy ] && ! guard_ok; then
  log "Site khác đang khác bình thường → hoãn deploy, thử lại lần sau"
  exit 0
fi

build_image() {
  docker buildx build --builder "$BUILDER" --load --provenance=false --sbom=false \
    -t "toolsocial-$1:candidate" "$SRC/$1" >>"$LOG" 2>&1
}
log "Build server (giới hạn CPU/RAM của builder)…"
build_image server || fail_commit "Build server lỗi"
log "Build client…"
build_image client || fail_commit "Build client lỗi"
docker run --rm --entrypoint sh toolsocial-server:candidate -c \
  'find src config queues scripts -name "*.js" -print0 | xargs -0 -n1 node --check' >>"$LOG" 2>&1 \
  || fail_commit "Lỗi cú pháp JavaScript phía server"

if [ "$MODE" = build ]; then
  log "✅ Build thử $SHORT thành công (chưa deploy)"
  exit 0
fi

log "Sao lưu CSDL…"
"${COMPOSE[@]}" exec -T server node scripts/backup-db.js </dev/null >>"$LOG" 2>&1 || log "  cảnh báo: không sao lưu được (server có thể đang tắt)"

OLD_PREV_IDS=""
for svc in server client; do
  OLD_PREV_IDS="$OLD_PREV_IDS $(docker image inspect -f '{{.Id}}' "toolsocial-$svc:prev" 2>/dev/null || true)"
  docker image inspect "toolsocial-$svc:latest" >/dev/null 2>&1 && docker tag "toolsocial-$svc:latest" "toolsocial-$svc:prev"
  docker tag "toolsocial-$svc:candidate" "toolsocial-$svc:latest"
done
git -C "$REPO_DIR" archive "$NEW:tool_face" | tar -x -C "$APP_DIR"
log "Khởi động bản mới…"
"${COMPOSE[@]}" up -d --no-build >>"$LOG" 2>&1

rollback() {
  log "↩️  Kiểm tra sau deploy không đạt → quay về bản trước ${CUR_SHORT:-?}"
  for svc in server client; do
    docker image inspect "toolsocial-$svc:prev" >/dev/null 2>&1 && docker tag "toolsocial-$svc:prev" "toolsocial-$svc:latest"
  done
  [ -n "$CUR" ] && git -C "$REPO_DIR" archive "$CUR:tool_face" | tar -x -C "$APP_DIR"
  "${COMPOSE[@]}" up -d --no-build >>"$LOG" 2>&1
  if wait_local_health; then log "Đã quay về bản trước, tool hoạt động lại"; else log "⚠️ Đã quay về bản trước nhưng tool chưa phản hồi — cần kiểm tra tay"; fi
  guard_ok || log "⚠️ Site khác vẫn khác bình thường sau khi quay về"
  echo "$NEW" > "$STATE_FAILED"
  exit 1
}

if [ "${SIMULATE_HEALTH_FAIL:-0}" = 1 ]; then
  log "  (giả lập kiểm tra sau deploy thất bại)"
  rollback
fi
wait_local_health || { log "  tool không phản hồi /api/health"; rollback; }
check_public || rollback
guard_ok || rollback

echo "$NEW" > "$STATE_DEPLOYED"
rm -f "$STATE_FAILED"
for id in $OLD_PREV_IDS; do docker rmi "$id" >/dev/null 2>&1 || true; done
docker rmi toolsocial-server:candidate toolsocial-client:candidate >/dev/null 2>&1 || true
docker buildx prune --builder "$BUILDER" -f --filter until=336h >/dev/null 2>&1 || true
log "✅ Đã deploy $SHORT"
tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
