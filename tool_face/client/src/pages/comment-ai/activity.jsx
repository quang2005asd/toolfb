import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Hoạt động đã gộp vào tab Tổng quan; giữ trang này để đường dẫn cũ không bị lỗi.
export default function CommentAiActivityRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/comment-ai'); }, [router]);
  return null;
}
