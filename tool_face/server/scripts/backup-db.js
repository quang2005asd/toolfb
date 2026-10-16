/**
 * Sao lưu CSDL SQLite an toàn khi server đang chạy (VACUUM INTO tạo bản chụp nhất quán).
 * Chạy trên VPS:  docker compose -f docker-compose.prod.yml exec -T server node scripts/backup-db.js
 * Bản sao nằm ở /app/data/backups (volume server_data), giữ BACKUP_KEEP_DAYS ngày gần nhất (mặc định 14).
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const dataDir = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'tool_face.sqlite');
const backupDir = path.join(dataDir, 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);

if (!fs.existsSync(dbFile)) {
  console.error(`Không tìm thấy CSDL: ${dbFile}`);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = path.join(backupDir, `tool_face-${stamp}.sqlite`);
const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY);

db.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`, (error) => {
  db.close();
  if (error) {
    console.error('Sao lưu thất bại:', error.message);
    process.exit(1);
  }
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(backupDir)) {
    const file = path.join(backupDir, name);
    if (/^tool_face-.*\.sqlite$/.test(name) && fs.statSync(file).mtimeMs < cutoff) {
      fs.unlinkSync(file);
      removed += 1;
    }
  }
  const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`Đã sao lưu ${target} (${sizeMb} MB). Xóa ${removed} bản cũ hơn ${keepDays} ngày.`);
});
