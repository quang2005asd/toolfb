import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/comment-ai'); }, [router]);
  return <main className="page-area"><section className="panel" style={{ padding: 24 }}>Đang mở AI bình luận...</section></main>;
}
