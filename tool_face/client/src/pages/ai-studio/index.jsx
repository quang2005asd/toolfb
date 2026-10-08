import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Bot,
  MessageSquare,
  Send,
  Sparkles,
  PenSquare,
  Copy,
  Check,
  Layers,
  Zap,
  Lightbulb,
  RotateCcw,
  User,
  MessageCircle,
  ArrowRight,
  X,
  Trash2,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquarePlus,
  Wand2,
  Image as ImageIcon,
  Stamp
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import AiImageStudioModal, { resolveMediaUrl } from '../../components/AiImageStudioModal';
import aiApi from '../../services/aiApi';

/* ── Prompt Templates ── */
const promptTemplates = [
  {
    category: 'Viết bài',
    icon: PenSquare,
    color: '#00f2fe',
    items: [
      { label: 'Bài bán hàng thu hút', prompt: 'Viết 1 bài đăng Facebook bán hàng hấp dẫn, thu hút khách hàng click xem chi tiết sản phẩm. Sản phẩm: [Tên sản phẩm]. Giọng văn tự nhiên, có emoji, kêu gọi hành động rõ ràng.' },
      { label: 'Bài viral chia sẻ nhiều', prompt: 'Viết 1 bài đăng Facebook dạng viral, dễ chia sẻ và thu hút nhiều tương tác. Chủ đề: [Chủ đề]. Sử dụng storytelling, tạo cảm xúc mạnh.' },
      { label: 'Bài review sản phẩm', prompt: 'Viết 1 bài review sản phẩm chân thực, tự nhiên như một khách hàng thật. Sản phẩm: [Tên sản phẩm]. Có ưu và nhược điểm, kết luận nên mua không.' },
      { label: 'Bài chúc mừng/sự kiện', prompt: 'Viết 1 bài đăng Facebook chúc mừng dịp [Tên sự kiện]. Giọng văn ấm áp, gần gũi, có lời chúc ý nghĩa và kêu gọi tương tác.' }
    ]
  },
  {
    category: 'Ý tưởng nội dung',
    icon: Lightbulb,
    color: '#f59e0b',
    items: [
      { label: 'Kế hoạch nội dung 1 tuần', prompt: 'Lên kế hoạch nội dung Fanpage Facebook trong 7 ngày với đa dạng chủ đề: giáo dục, giải trí, bán hàng, tương tác. Mỗi ngày 1-2 bài, có gợi ý giờ đăng.' },
      { label: '10 ý tưởng bài đăng', prompt: 'Gợi ý 10 ý tưởng bài đăng Facebook độc đáo, sáng tạo cho Fanpage về lĩnh vực [Lĩnh vực]. Mỗi ý tưởng có tiêu đề và mô tả ngắn.' },
      { label: 'Chuỗi bài theo chủ đề', prompt: 'Tạo chuỗi 5 bài đăng Facebook xoay quanh chủ đề [Chủ đề], mỗi bài khai thác một góc nhìn khác nhau, tạo thành series hấp dẫn.' }
    ]
  },
  {
    category: 'Seeding & Tương tác',
    icon: MessageCircle,
    color: '#a855f7',
    items: [
      { label: 'Sinh bình luận seeding', prompt: 'Viết 5 bình luận seeding tự nhiên, đa dạng giọng văn (nam/nữ, trẻ/trung niên) cho bài đăng có nội dung: [Nội dung bài]. Bình luận phải thật tự nhiên như người dùng thật.' },
      { label: 'Câu hỏi tương tác', prompt: 'Gợi ý 5 câu hỏi tương tác cuối bài đăng Facebook để tăng comment. Chủ đề bài viết: [Chủ đề]. Câu hỏi dễ trả lời, gợi mở, khiến người đọc muốn bình luận.' },
      { label: 'Kịch bản trả lời comment', prompt: 'Viết 5 mẫu trả lời comment khách hàng trên Fanpage một cách chuyên nghiệp, thân thiện. Bao gồm: cảm ơn, giải đáp thắc mắc, xử lý phàn nàn.' }
    ]
  }
];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function AIStudioPage() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiModel, setAiModel] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Conversations history state
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const router = useRouter();
  const [studioOpen, setStudioOpen] = useState(false);
  const [activeDraftForStudio, setActiveDraftForStudio] = useState(null);

  const handleOpenStudioForMessage = (messageText) => {
    const cleanTitle = messageText ? messageText.slice(0, 80).replace(/\n/g, ' ') : '';
    setActiveDraftForStudio({
      title: cleanTitle,
      content: messageText || '',
      topic: cleanTitle
    });
    setStudioOpen(true);
  };

  const handleApplyStudioMedia = (mediaItem) => {
    const newMsg = {
      role: 'assistant',
      text: '✨ Đã tạo ảnh minh họa cho nội dung bài viết!',
      media: mediaItem,
      sourceContent: activeDraftForStudio?.content || ''
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const conversationRef = useRef(null);
  const textareaRef = useRef(null);

  // Load status and conversation history
  const loadConversations = async () => {
    try {
      const res = await aiApi.getConversations();
      if (res.success && Array.isArray(res.conversations)) {
        setConversations(res.conversations);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  useEffect(() => {
    aiApi
      .status()
      .then((result) => {
        setAiConfigured(result.configured);
        setAiModel(result.model || '');
      })
      .catch(() => setAiConfigured(false));

    loadConversations();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Select a conversation from history
  const handleSelectConversation = async (conv) => {
    if (conv.id === currentConversationId) return;
    setLoadingConv(true);
    setCurrentConversationId(conv.id);
    setCurrentTitle(conv.title);
    setShowTemplates(false);
    try {
      const res = await aiApi.getConversation(conv.id);
      if (res.success && res.conversation) {
        const msgs = (res.conversation.messages || []).map((m) => ({
          role: m.role,
          text: m.content || m.text || ''
        }));
        setMessages(msgs);
        setCurrentTitle(res.conversation.title);
      }
    } catch (err) {
      console.error('Failed to load conversation details', err);
    } finally {
      setLoadingConv(false);
    }
  };

  // Start new conversation
  const handleNewChat = () => {
    setCurrentConversationId(null);
    setCurrentTitle('');
    setMessages([]);
    setPrompt('');
    setShowTemplates(false);
    if (textareaRef.current) textareaRef.current.focus();
  };

  // Delete a conversation
  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xoá cuộc hội thoại này?')) return;
    try {
      await aiApi.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  // Send prompt
  const sendPrompt = async (value = prompt) => {
    if (!value.trim() || sending) return;
    const message = value.trim();
    const history = messages.map((item) => ({ role: item.role, content: item.text }));

    setMessages((current) => [...current, { role: 'user', text: message }]);
    setPrompt('');
    setSending(true);
    setShowTemplates(false);

    try {
      const result = await aiApi.chat(message, history, currentConversationId);
      setMessages((current) => [...current, { role: 'assistant', text: result.reply }]);

      if (result.conversation_id) {
        setCurrentConversationId(result.conversation_id);
        if (result.conversation_title) {
          setCurrentTitle(result.conversation_title);
        }
        await loadConversations();
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: error.response?.data?.message || 'Không gọi được AI provider. Kiểm tra API Key trong Cài đặt.',
          isError: true
        }
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  const handleUseTemplate = (templatePrompt) => {
    setPrompt(templatePrompt);
    setShowTemplates(false);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const quickChips = [
    'Viết bài giới thiệu sản phẩm mới',
    'Tạo 5 bình luận seeding tự nhiên',
    'Lên kế hoạch nội dung tuần này',
    'Viết caption ảnh sản phẩm hấp dẫn'
  ];

  return (
    <MainLayout title="AI Studio">
      <div className={`ai-studio-shell ${!sidebarOpen ? 'sidebar-closed' : ''}`}>
        {/* ── Left History Sidebar ── */}
        <aside className="ai-sidebar">
          <div className="ai-sidebar-header">
            <div className="ai-sidebar-title-row">
              <span className="ai-sidebar-title">
                <MessageSquare size={14} /> Lịch sử hội thoại
                {conversations.length > 0 && (
                  <span className="ai-sidebar-count-badge">{conversations.length}</span>
                )}
              </span>
              <button
                type="button"
                className="ai-sidebar-toggle-btn"
                title="Thu gọn danh sách"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <button
              type="button"
              className="ai-btn-new-chat"
              onClick={handleNewChat}
            >
              <Plus size={16} /> Cuộc trò chuyện mới
            </button>
          </div>

          <div className="ai-history-list">
            {conversations.length === 0 ? (
              <div className="ai-history-empty">
                <MessageSquarePlus size={28} />
                <span>Chưa có cuộc trò chuyện nào. Hãy gửi câu hỏi đầu tiên!</span>
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = conv.id === currentConversationId;
                return (
                  <div
                    key={conv.id}
                    className={`ai-history-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectConversation(conv)}
                  >
                    <div className="ai-history-item-left">
                      <div className="ai-history-item-icon">
                        <MessageSquare size={15} />
                      </div>
                      <div className="ai-history-item-content">
                        <span className="ai-history-item-title" title={conv.title}>
                          {conv.title}
                        </span>
                        <div className="ai-history-item-date">
                          {formatTime(conv.updated_at || conv.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="ai-history-item-actions">
                      <button
                        type="button"
                        className="ai-history-del-btn"
                        title="Xoá cuộc trò chuyện"
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Right Chat Panel ── */}
        <main className="ai-chat-panel">
          {/* Header */}
          <header className="ai-header">
            <div className="ai-header-left">
              {!sidebarOpen && (
                <button
                  type="button"
                  className="ai-toggle-sidebar-btn"
                  title="Mở lịch sử trò chuyện"
                  onClick={() => setSidebarOpen(true)}
                >
                  <PanelLeftOpen size={18} />
                </button>
              )}
              <div className="ai-header-icon">
                <Sparkles size={19} />
              </div>
              <div>
                <h2>
                  AI Studio
                  {currentTitle && (
                    <span className="ai-header-current-chat">
                      / {currentTitle}
                    </span>
                  )}
                </h2>
                <span className="ai-header-meta">
                  {aiConfigured ? (
                    <>
                      <span className="ai-status-dot online" />
                      {aiModel || 'Đã kết nối'}
                    </>
                  ) : (
                    <>
                      <span className="ai-status-dot offline" />
                      Chưa cấu hình — <Link href="/settings" style={{ color: '#00f2fe' }}>Cài đặt API Key</Link>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="ai-header-actions">
              <button
                type="button"
                className="ai-btn-ghost"
                onClick={() => handleOpenStudioForMessage(prompt || '')}
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(0, 242, 254, 0.15))',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: '#c084fc',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Sparkles size={14} color="#00f2fe" /> AI Vẽ ảnh & Watermark
              </button>
              <Link
                href="/ai-studio/generate"
                className="ai-btn-ghost"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(79, 172, 254, 0.15))',
                  border: '1px solid rgba(0, 242, 254, 0.35)',
                  color: '#00f2fe',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Wand2 size={14} /> Tạo hàng loạt bài viết
              </Link>
              <button
                type="button"
                className={`ai-btn-ghost ${showTemplates ? 'active' : ''}`}
                onClick={() => setShowTemplates((v) => !v)}
              >
                <Layers size={14} /> Mẫu Prompt
              </button>
              {messages.length > 0 && (
                <button className="ai-btn-ghost" type="button" onClick={handleNewChat}>
                  <RotateCcw size={14} /> Hội thoại mới
                </button>
              )}
            </div>
          </header>

          {/* Conversation Messages */}
          <div className="ai-conversation" ref={conversationRef}>
            {loadingConv ? (
              <div className="ai-empty-state">
                <p>Đang tải nội dung cuộc hội thoại...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="ai-empty-state">
                <div className="ai-empty-icon">
                  <Sparkles size={40} />
                </div>
                <h2>
                  Trợ lý AI sáng tạo <span>nội dung</span>
                </h2>
                <p>
                  Viết bài đăng, sinh bình luận seeding, lên kế hoạch nội dung — tất cả chỉ với 1 câu lệnh.
                </p>
                <div className="ai-quick-chips">
                  {quickChips.map((text) => (
                    <button
                      type="button"
                      className="ai-chip"
                      key={text}
                      onClick={() => sendPrompt(text)}
                    >
                      <Zap size={13} />
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div className={`ai-msg ${msg.role}`} key={idx}>
                  <div className="ai-msg-avatar">
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className="ai-msg-body">
                    <div className="ai-msg-label">
                      {msg.role === 'user' ? 'Bạn' : 'AI Studio'}
                    </div>
                    <div
                      className={`ai-msg-content ${msg.isError ? 'error' : ''}`}
                    >
                      {msg.text}
                    </div>

                    {/* AI Generated / Watermarked Media Card in Chat */}
                    {msg.media && (
                      <div style={{
                        marginTop: 10, marginBottom: 10, borderRadius: 12, overflow: 'hidden',
                        border: '1px solid rgba(0,242,254,0.35)', maxWidth: 420,
                        background: 'rgba(2, 6, 23, 0.75)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                      }}>
                        <img
                          src={resolveMediaUrl(msg.media.previewUrl || msg.media.mediaLink)}
                          alt="AI Visual"
                          style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block', background: 'rgba(0,0,0,0.4)' }}
                        />
                        <div style={{
                          padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center',
                          background: 'rgba(5, 10, 25, 0.85)', backdropFilter: 'blur(8px)',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}>
                          <Link
                            href={`/post-planner/compose?content=${encodeURIComponent(msg.sourceContent || msg.text || '')}&mediaLink=${encodeURIComponent(msg.media.mediaLink)}&previewUrl=${encodeURIComponent(resolveMediaUrl(msg.media.previewUrl))}`}
                            className="ai-action-btn primary"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' }}
                          >
                            <PenSquare size={13} /> Tạo bài viết với ảnh này
                          </Link>
                          <button
                            type="button"
                            className="ai-action-btn"
                            onClick={() => {
                              setActiveDraftForStudio({
                                title: msg.text?.slice(0, 60),
                                content: msg.sourceContent || msg.text,
                                mediaList: [msg.media]
                              });
                              setStudioOpen(true);
                            }}
                            title="Chỉnh sửa hoặc đóng dấu bản quyền cho ảnh này"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Stamp size={13} /> Đóng dấu
                          </button>
                        </div>
                      </div>
                    )}

                    {msg.role === 'assistant' && !msg.isError && (
                      <div className="ai-msg-actions">
                        <button
                          type="button"
                          className="ai-action-btn"
                          onClick={() => handleCopy(msg.text, idx)}
                        >
                          {copiedIdx === idx ? (
                            <><Check size={13} /> Đã chép</>
                          ) : (
                            <><Copy size={13} /> Sao chép</>
                          )}
                        </button>
                        <button
                          type="button"
                          className="ai-action-btn"
                          style={{ color: '#00f2fe', borderColor: 'rgba(0,242,254,0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => handleOpenStudioForMessage(msg.text)}
                          title="Tự động vẽ ảnh minh họa AI phù hợp với bài viết này"
                        >
                          <Sparkles size={13} color="#00f2fe" /> Vẽ ảnh AI
                        </button>
                        <Link
                          href={`/post-planner/compose?content=${encodeURIComponent(msg.text)}`}
                          className="ai-action-btn primary"
                        >
                          <PenSquare size={13} /> Tạo bài viết
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="ai-msg assistant">
                <div className="ai-msg-avatar"><Bot size={16} /></div>
                <div className="ai-msg-body">
                  <div className="ai-msg-label">AI Studio</div>
                  <div className="ai-typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="ai-composer-wrap">
            {/* Template Panel */}
            {showTemplates && (
              <div className="ai-template-panel">
                <div className="ai-template-header">
                  <strong><Layers size={15} /> Mẫu Prompt có sẵn</strong>
                  <button type="button" onClick={() => setShowTemplates(false)} className="ai-btn-close">
                    <X size={16} />
                  </button>
                </div>
                <div className="ai-template-grid">
                  {promptTemplates.map((cat) => (
                    <div key={cat.category} className="ai-template-cat">
                      <div className="ai-template-cat-title" style={{ color: cat.color }}>
                        <cat.icon size={14} /> {cat.category}
                      </div>
                      {cat.items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="ai-template-item"
                          onClick={() => handleUseTemplate(item.prompt)}
                        >
                          <span>{item.label}</span>
                          <ArrowRight size={13} />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form
              className="ai-composer"
              onSubmit={(e) => {
                e.preventDefault();
                sendPrompt();
              }}
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập yêu cầu sáng tạo nội dung (Enter để gửi, Shift + Enter xuống dòng)..."
                rows={2}
                disabled={sending}
              />
              <div className="ai-composer-bar">
                <div className="ai-composer-tools">
                  <button
                    type="button"
                    className={`ai-tool-btn ${showTemplates ? 'active' : ''}`}
                    onClick={() => setShowTemplates((v) => !v)}
                  >
                    <Layers size={14} />
                    Mẫu gợi ý
                  </button>
                  <button
                    type="button"
                    className="ai-tool-btn"
                    onClick={() => handleOpenStudioForMessage(prompt || '')}
                    title="Mở studio vẽ ảnh AI và đóng dấu bản quyền"
                    style={{ color: '#00f2fe' }}
                  >
                    <ImageIcon size={14} />
                    Vẽ ảnh & Watermark
                  </button>
                </div>
                <div className="ai-composer-right">
                  <span className="ai-composer-hint">Enter gửi • Shift+Enter xuống dòng</span>
                  <button
                    type="submit"
                    className="ai-send-btn"
                    disabled={!prompt.trim() || sending}
                    title="Gửi tin nhắn"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* ═══ AI IMAGE & WATERMARK STUDIO MODAL ═══ */}
      <AiImageStudioModal
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        initialDraft={activeDraftForStudio}
        onApplyMedia={handleApplyStudioMedia}
      />
    </MainLayout>
  );
}