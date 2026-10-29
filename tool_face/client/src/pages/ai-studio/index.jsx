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
import channelApi from '../../services/channelApi';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

function stripAsterisks(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim();
}

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
  const [commentTemplateOpen, setCommentTemplateOpen] = useState(false);
  const [commentTemplatePages, setCommentTemplatePages] = useState([]);
  const [commentTemplatePageId, setCommentTemplatePageId] = useState('');
  const [commentTemplateTopic, setCommentTemplateTopic] = useState('');
  const [commentTemplateCount, setCommentTemplateCount] = useState(5);
  const [commentTemplateDrafts, setCommentTemplateDrafts] = useState([]);
  const [commentTemplateDraftPageId, setCommentTemplateDraftPageId] = useState('');
  const [commentTemplateLoadingPages, setCommentTemplateLoadingPages] = useState(false);
  const [commentTemplateGenerating, setCommentTemplateGenerating] = useState(false);
  const [commentTemplateSaving, setCommentTemplateSaving] = useState(false);
  const [commentTemplateNotice, setCommentTemplateNotice] = useState(null);
  const [savedCommentTemplateCount, setSavedCommentTemplateCount] = useState(0);
  const [savedCommentTemplatePageId, setSavedCommentTemplatePageId] = useState('');

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
          text: m.role === 'assistant' ? stripAsterisks(m.content || m.text || '') : (m.content || m.text || '')
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
      const cleanReply = stripAsterisks(result.reply);
      setMessages((current) => [...current, { role: 'assistant', text: cleanReply }]);

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

  const handleOpenCommentTemplateGenerator = async () => {
    setCommentTemplateOpen(true);
    setShowTemplates(false);
    setCommentTemplateNotice(null);
    if (commentTemplatePages.length) return;
    setCommentTemplateLoadingPages(true);
    try {
      const res = await channelApi.list(true);
      const responsePages = res?.channels || res?.pages || [];
      const pages = Array.isArray(responsePages) ? responsePages : [];
      setCommentTemplatePages(pages);
      const savedPageId = window.localStorage.getItem('commentAiPageId') || '';
      const selected = pages.some((page) => String(page.id) === savedPageId)
        ? savedPageId
        : String(pages[0]?.id || '');
      setCommentTemplatePageId(selected);
      if (!selected) setCommentTemplateNotice({ type: 'error', text: 'Chưa có Fanpage nào được kết nối.' });
    } catch (err) {
      setCommentTemplateNotice({ type: 'error', text: apiMessage(err, 'Không tải được danh sách Fanpage.') });
    } finally {
      setCommentTemplateLoadingPages(false);
    }
  };

  const handleGenerateCommentTemplateDrafts = async () => {
    if (!commentTemplatePageId || commentTemplateGenerating) return;
    setCommentTemplateGenerating(true);
    setCommentTemplateNotice(null);
    setSavedCommentTemplateCount(0);
    try {
      const res = await commentAiApi.generateTemplateDrafts(commentTemplatePageId, {
        topic: commentTemplateTopic,
        count: commentTemplateCount
      });
      const drafts = (res.drafts || []).map((draft, index) => ({
        ...draft,
        id: `${Date.now()}-${index}`,
        selected: true
      }));
      setCommentTemplateDrafts(drafts);
      setCommentTemplateDraftPageId(commentTemplatePageId);
      setCommentTemplateNotice(drafts.length
        ? { type: 'success', text: `AI đã tạo ${drafts.length} bản nháp. Hãy chỉnh sửa hoặc bỏ chọn trước khi lưu.` }
        : { type: 'error', text: 'AI chưa tạo được bản nháp nào.' });
    } catch (err) {
      setCommentTemplateNotice({ type: 'error', text: apiMessage(err, 'Không tạo được mẫu trả lời.') });
    } finally {
      setCommentTemplateGenerating(false);
    }
  };

  const handleSaveCommentTemplateDrafts = async () => {
    const selected = commentTemplateDrafts.filter((draft) => draft.selected);
    if (!selected.length || commentTemplateSaving) return;
    if (commentTemplateDraftPageId !== commentTemplatePageId) {
      setCommentTemplateNotice({ type: 'error', text: 'Các bản nháp được tạo cho Fanpage khác. Hãy chọn lại Fanpage đó hoặc tạo bản nháp mới.' });
      return;
    }
    setCommentTemplateSaving(true);
    setCommentTemplateNotice(null);
    try {
      window.localStorage.setItem('commentAiPageId', commentTemplatePageId);
      const savedIds = [];
      const results = [];
      for (const draft of selected) {
        try {
          const res = await commentAiApi.createTemplate(commentTemplatePageId, {
            name: draft.name,
            keywords: draft.keywords,
            content: draft.content,
            mode: draft.mode
          });
          savedIds.push(draft.id);
          results.push({ status: res.template?.status });
        } catch (err) {
          results.push({ error: `${draft.name}: ${apiMessage(err, 'Không lưu được mẫu.')}` });
        }
      }
      setCommentTemplateDrafts((current) => current.filter((draft) => !savedIds.includes(draft.id)));
      setSavedCommentTemplateCount(savedIds.length);
      setSavedCommentTemplatePageId(savedIds.length ? commentTemplatePageId : '');
      const pending = results.filter((result) => result.status === 'pending').length;
      const approved = results.filter((result) => result.status === 'approved').length;
      const failures = results.filter((result) => result.error).map((result) => result.error);
      const summary = `Đã lưu ${savedIds.length} mẫu (${approved} đã duyệt, ${pending} chờ duyệt).`;
      setCommentTemplateNotice({
        type: failures.length ? 'error' : 'success',
        text: failures.length ? `${summary} Lỗi: ${failures.join(' · ')}` : summary
      });
    } catch (err) {
      setCommentTemplateNotice({ type: 'error', text: apiMessage(err, 'Không lưu được các mẫu đã chọn.') });
    } finally {
      setCommentTemplateSaving(false);
    }
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
                      Chưa cấu hình — <Link href="/settings" style={{ color: 'var(--blue)' }}>Cài đặt API Key</Link>
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
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(37, 99, 235, 0.12))',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  color: 'var(--purple)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Sparkles size={14} color="var(--purple)" /> AI Vẽ ảnh & Watermark
              </button>
              <Link
                href="/ai-studio/generate"
                className="ai-btn-ghost"
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(79, 172, 254, 0.12))',
                  border: '1px solid rgba(37, 99, 235, 0.35)',
                  color: 'var(--blue)',
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
                      {msg.role === 'assistant' ? stripAsterisks(msg.text) : msg.text}
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
                            href={`/post-planner/compose?content=${encodeURIComponent(stripAsterisks(msg.sourceContent || msg.text || ''))}&mediaLink=${encodeURIComponent(msg.media.mediaLink)}&previewUrl=${encodeURIComponent(resolveMediaUrl(msg.media.previewUrl))}`}
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
                                title: stripAsterisks(msg.text)?.slice(0, 60),
                                content: stripAsterisks(msg.sourceContent || msg.text),
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
                          onClick={() => handleCopy(stripAsterisks(msg.text), idx)}
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
                          onClick={() => handleOpenStudioForMessage(stripAsterisks(msg.text))}
                          title="Tự động vẽ ảnh minh họa AI phù hợp với bài viết này"
                        >
                          <Sparkles size={13} color="#00f2fe" /> Vẽ ảnh AI
                        </button>
                        <Link
                          href={`/post-planner/compose?content=${encodeURIComponent(stripAsterisks(msg.text))}`}
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
            {commentTemplateOpen && (
              <section className="panel" style={{ marginBottom: 12 }}>
                <div className="panel-heading">
                  <h3 style={{ margin: 0 }}>Tạo mẫu trả lời cho Fanpage</h3>
                  <button type="button" className="button button-quiet" aria-label="Đóng tạo mẫu" onClick={() => setCommentTemplateOpen(false)}>
                    <X size={15} />
                  </button>
                </div>
                <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
                  {commentTemplateNotice && (
                    <div className="notice" style={{
                      borderColor: commentTemplateNotice.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
                      color: commentTemplateNotice.type === 'error' ? '#ef4444' : '#10b981'
                    }}>
                      {commentTemplateNotice.text}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    <label>
                      <span className="field-label">Fanpage</span>
                      <select
                        className="field"
                        value={commentTemplatePageId}
                        onChange={(e) => setCommentTemplatePageId(e.target.value)}
                        disabled={commentTemplateLoadingPages}
                      >
                        <option value="">{commentTemplateLoadingPages ? 'Đang tải Fanpage...' : 'Chọn Fanpage'}</option>
                        {commentTemplatePages.map((page) => (
                          <option key={page.id} value={String(page.id)}>{page.name || page.page_name || page.id}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Số mẫu (tối đa 10)</span>
                      <input
                        className="field"
                        type="number"
                        min="1"
                        max="10"
                        value={commentTemplateCount}
                        onChange={(e) => setCommentTemplateCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                      />
                    </label>
                  </div>
                  <label>
                    <span className="field-label">Chủ đề hoặc nội dung bài đăng (không bắt buộc)</span>
                    <textarea
                      className="field"
                      rows={3}
                      value={commentTemplateTopic}
                      onChange={(e) => setCommentTemplateTopic(e.target.value)}
                      placeholder="Ví dụ: bài giới thiệu dòng sản phẩm mới hoặc dán nội dung bài đăng..."
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={handleGenerateCommentTemplateDrafts}
                      disabled={!commentTemplatePageId || commentTemplateLoadingPages || commentTemplateGenerating}
                    >
                      <Sparkles size={14} /> {commentTemplateGenerating ? 'Đang tạo...' : 'Tạo bản nháp'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={handleSaveCommentTemplateDrafts}
                      disabled={commentTemplateSaving || commentTemplateDraftPageId !== commentTemplatePageId || !commentTemplateDrafts.some((draft) => draft.selected)}
                    >
                      <Check size={14} /> {commentTemplateSaving ? 'Đang lưu...' : 'Lưu vào mẫu'}
                    </button>
                    {savedCommentTemplateCount > 0 && (
                      <Link
                        href="/comment-ai/templates"
                        className="button button-secondary"
                        onClick={() => window.localStorage.setItem('commentAiPageId', savedCommentTemplatePageId)}
                        style={{ textDecoration: 'none' }}
                      >
                        Mở Mẫu trả lời
                      </Link>
                    )}
                  </div>
                  {commentTemplateDrafts.length > 0 && commentTemplateDraftPageId !== commentTemplatePageId && (
                    <small className="muted">Bản nháp thuộc Fanpage đã chọn lúc tạo; chọn lại Fanpage đó để lưu.</small>
                  )}
                  {commentTemplateDrafts.map((draft) => (
                    <article key={draft.id} className="panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={(e) => setCommentTemplateDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, selected: e.target.checked } : item))}
                        />
                        <strong>Dùng mẫu này</strong>
                      </label>
                      <input
                        className="field"
                        aria-label="Tên mẫu"
                        value={draft.name}
                        onChange={(e) => setCommentTemplateDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, name: e.target.value } : item))}
                        placeholder="Tên mẫu"
                      />
                      <input
                        className="field"
                        aria-label="Từ khóa"
                        value={draft.keywords}
                        onChange={(e) => setCommentTemplateDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, keywords: e.target.value } : item))}
                        placeholder="Từ khóa, phân tách bằng dấu phẩy"
                      />
                      <textarea
                        className="field"
                        aria-label="Nội dung mẫu"
                        rows={3}
                        value={draft.content}
                        onChange={(e) => setCommentTemplateDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, content: e.target.value } : item))}
                      />
                      <select
                        className="field"
                        aria-label="Cách dùng mẫu"
                        value={draft.mode}
                        onChange={(e) => setCommentTemplateDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, mode: e.target.value } : item))}
                      >
                        <option value="guided">AI viết lại theo mẫu (khi AI bật)</option>
                        <option value="exact">Gửi nguyên văn mẫu</option>
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            )}

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
                        <div key={item.label} style={{ display: 'grid', gap: 6 }}>
                          <button
                            type="button"
                            className="ai-template-item"
                            onClick={() => handleUseTemplate(item.prompt)}
                          >
                            <span>{item.label}</span>
                            <ArrowRight size={13} />
                          </button>
                          {item.label === 'Kịch bản trả lời comment' && (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={handleOpenCommentTemplateGenerator}
                              style={{ justifyContent: 'center' }}
                            >
                              <Sparkles size={13} /> Tạo mẫu cho Fanpage
                            </button>
                          )}
                        </div>
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