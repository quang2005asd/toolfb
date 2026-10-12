import { useEffect, useState } from 'react';
import messengerApi from '../services/messengerApi';

// Số tin chưa đọc dùng chung cho menu: giữ giá trị giữa các lần chuyển trang để badge không nhấp nháy
let cachedTotal = 0;
const listeners = new Set();

function publish(total) {
  cachedTotal = total;
  listeners.forEach((listener) => listener(total));
}

export function refreshMessengerUnread() {
  return messengerApi.unread()
    .then((result) => publish(Number(result.total) || 0))
    .catch(() => {});
}

export function resetMessengerUnread() {
  publish(0);
}

export default function useMessengerUnread(enabled = true) {
  const [total, setTotal] = useState(cachedTotal);

  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setTotal);
    refreshMessengerUnread();
    const timer = setInterval(() => {
      if (!document.hidden) refreshMessengerUnread();
    }, 60000);
    return () => {
      listeners.delete(setTotal);
      clearInterval(timer);
    };
  }, [enabled]);

  return total;
}
