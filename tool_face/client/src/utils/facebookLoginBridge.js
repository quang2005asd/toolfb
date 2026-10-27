// Cầu nối giữa cửa sổ đăng nhập Facebook (popup) và tab Tool Face đang chờ.
// Trang đăng nhập của Facebook có thể cắt liên kết window.opener (Cross-Origin-Opener-Policy),
// nên kết quả được gửi qua BroadcastChannel + localStorage thay vì chỉ dựa vào opener.
const CHANNEL = 'tool-face-fb-login';
const STORAGE_KEY = 'tool-face-fb-login-result';
const PENDING_KEY = 'tool-face-fb-login-pending';
const PENDING_TTL_MS = 15 * 60 * 1000;

export const POPUP_NAME = 'tool-face-fb-login';

export function publishLoginResult(result) {
  const payload = { ...result, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {}
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    window.opener?.postMessage({ type: CHANNEL, payload }, window.location.origin);
  } catch {}
}

// Nhận kết quả (mỗi kết quả chỉ báo một lần dù đến bằng nhiều đường)
export function subscribeLoginResult(callback) {
  const seen = new Set();
  const deliver = (payload) => {
    if (!payload?.id || seen.has(payload.id)) return;
    seen.add(payload.id);
    callback(payload);
  };
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => deliver(event.data);
  } catch {}
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch {}
  };
  const onMessage = (event) => {
    if (event.origin === window.location.origin && event.data?.type === CHANNEL) deliver(event.data.payload);
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('message', onMessage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMessage);
  };
}

export function openLoginPopup(url) {
  const width = 600;
  const height = 720;
  // Màn hình đủ rộng: đặt cửa sổ Facebook lệch phải để không che hộp thoại hướng dẫn của tool ở giữa
  const roomy = window.outerWidth >= width * 2 + 160;
  const left = Math.max(0, Math.round(window.screenX + (roomy ? window.outerWidth - width - 24 : (window.outerWidth - width) / 2)));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(url, POPUP_NAME, `width=${width},height=${height},left=${left},top=${top}`);
  return popup && !popup.closed ? popup : null;
}

// Trình duyệt chặn cửa sổ phụ thì chuyển cả trang sang Facebook; đánh dấu để khi bấm Quay lại vẫn biết là chưa xong
export function markRedirectLogin() {
  try { sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch {}
}

export function takeRedirectLoginPending() {
  try {
    const at = Number(sessionStorage.getItem(PENDING_KEY));
    sessionStorage.removeItem(PENDING_KEY);
    return Boolean(at) && Date.now() - at < PENDING_TTL_MS;
  } catch {
    return false;
  }
}
