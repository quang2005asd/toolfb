import Link from 'next/link';

/** Thanh chuyển giữa hai phần của AI Studio: Viết bài / Trả lời bình luận. */
export default function AiStudioSwitch({ current }) {
  return (
    <nav className="step-strip" aria-label="AI Studio" style={{ marginBottom: 14 }}>
      <Link href="/ai-studio" className={`step-button${current === 'write' ? ' is-current' : ''}`}>Viết bài</Link>
      <Link href="/comment-ai" className={`step-button${current === 'comments' ? ' is-current' : ''}`}>Trả lời bình luận</Link>
    </nav>
  );
}
