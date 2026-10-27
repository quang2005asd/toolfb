import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Check,
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  Calendar,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  Layers,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Trash2
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import postApi from '../../services/postApi';
import channelApi from '../../services/channelApi';

export default function BulkUpload() {
  const [file, setFile] = useState(null);
  const [channels, setChannels] = useState([]);
  const [tiktokAccounts, setTiktokAccounts] = useState([]);
  const [selectedDefaultPageId, setSelectedDefaultPageId] = useState('');
  const [selectedDefaultTiktokId, setSelectedDefaultTiktokId] = useState('');
  const [activeChannelTab, setActiveChannelTab] = useState('fb'); // 'fb' | 'tiktok'
  const [platformFilter, setPlatformFilter] = useState('all'); // 'all' | 'facebook' | 'tiktok' | 'valid' | 'invalid'
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [errorsList, setErrorsList] = useState([]);
  const fileInputRef = useRef(null);

  // Fetch channels list for default page selector & helper reference
  useEffect(() => {
    channelApi
      .list()
      .then((res) => {
        const list = res.channels || [];
        setChannels(list);
        if (list.length > 0) {
          setSelectedDefaultPageId(String(list[0].id));
        }
      })
      .catch((err) => console.error('Fetch channels error:', err));

    channelApi
      .tiktokAccounts()
      .then((res) => {
        const list = res.accounts || [];
        setTiktokAccounts(list);
        if (list.length > 0) {
          setSelectedDefaultTiktokId(String(list[0].id));
        }
      })
      .catch((err) => console.error('Fetch tiktok accounts error:', err));
  }, []);

  // Copy helper
  const handleCopyText = (text) => {
    navigator.clipboard.writeText(String(text));
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPageId = (id) => handleCopyText(id);

  // Preview parsing
  const processPreview = async (selectedFile, defaultPage, defaultTiktok) => {
    if (!selectedFile) return;
    setPreviewLoading(true);
    setResultMessage(null);
    setErrorsList([]);

    const pageId = defaultPage !== undefined ? defaultPage : selectedDefaultPageId;
    const tiktokId = defaultTiktok !== undefined ? defaultTiktok : selectedDefaultTiktokId;

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (pageId) formData.append('defaultPageId', pageId);
    if (tiktokId) formData.append('defaultTiktokAccountId', tiktokId);

    try {
      const data = await postApi.bulkPreview(formData);
      setPreviewData(data);
    } catch (err) {
      setPreviewData(null);
      setResultMessage({
        type: 'error',
        text: `Lỗi đọc file: ${err.response?.data?.message || err.message}`
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      processPreview(selected, selectedDefaultPageId, selectedDefaultTiktokId);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      setFile(droppedFile);
      processPreview(droppedFile, selectedDefaultPageId, selectedDefaultTiktokId);
    } else {
      alert('Vui lòng chọn file Excel có định dạng .xlsx hoặc .xls!');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleClearFile = () => {
    setFile(null);
    setPreviewData(null);
    setResultMessage(null);
    setErrorsList([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDefaultPageChange = (e) => {
    const newPageId = e.target.value;
    setSelectedDefaultPageId(newPageId);
    if (file) {
      processPreview(file, newPageId, selectedDefaultTiktokId);
    }
  };

  const handleDefaultTiktokChange = (e) => {
    const newTiktokId = e.target.value;
    setSelectedDefaultTiktokId(newTiktokId);
    if (file) {
      processPreview(file, selectedDefaultPageId, newTiktokId);
    }
  };

  // Handle final bulk upload
  const handleUpload = async () => {
    if (!file) {
      alert('Vui lòng chọn file Excel trước!');
      return;
    }

    if (previewData && previewData.validCount === 0) {
      alert('Không có bài viết nào hợp lệ trong file Excel để lên lịch. Vui lòng kiểm tra lại dữ liệu!');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (selectedDefaultPageId) {
      formData.append('defaultPageId', selectedDefaultPageId);
    }
    if (selectedDefaultTiktokId) {
      formData.append('defaultTiktokAccountId', selectedDefaultTiktokId);
    }

    setUploadLoading(true);
    setResultMessage(null);
    setErrorsList([]);

    try {
      const res = await postApi.bulkUpload(formData);
      const errors = res.errors || [];
      setErrorsList(errors);

      if (res.success || res.data?.length > 0) {
        setResultMessage({
          type: errors.length === 0 ? 'success' : 'warning',
          text: res.message || `Đã lên lịch thành công ${res.data?.length || 0} bài đăng!`
        });
      } else {
        setResultMessage({
          type: 'error',
          text: res.message || 'Không thể xếp lịch bài đăng nào từ file này.'
        });
      }
    } catch (err) {
      setResultMessage({
        type: 'error',
        text: `Lỗi upload: ${err.response?.data?.message || err.message}`
      });
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <MainLayout title="Tải bài đăng hàng loạt">
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Quay lại trang chủ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Link href="/" className="back-nav-chip">
            <ArrowLeft size={15} /> Quay lại Trang chủ
          </Link>
          <span className="muted" style={{ fontSize: '12px' }}>
            Không gian làm việc &gt; Tải Excel lên lịch tự động
          </span>
        </div>

        <div className="upload-layout">
          {/* Left Column: Upload & Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
          {/* Panel 1: File Dropzone & Configuration */}
          <section className="panel" style={{ padding: '24px' }}>
            <div className="panel-heading" style={{ marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                  Nhập lịch đăng bài từ Excel
                </h2>
                <span className="muted" style={{ fontSize: '13px' }}>
                  Hỗ trợ định dạng .xlsx, .xls • Tự động phân tích & lên lịch hàng loạt
                </span>
              </div>
              <a
                className="button button-secondary"
                href={postApi.templateUrl}
                download="Mau_Upload_Bai_Dang_ToolFB.xlsx"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
              >
                <Download size={15} /> Tải file mẫu (.xlsx)
              </a>
            </div>

            {/* Default Channel Fallback Selectors */}
            <div
              style={{
                background: 'var(--panel)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--line)',
                borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                borderRadius: '14px',
                padding: '16px 18px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
                boxShadow: '0 4px 14px rgba(70, 55, 40, 0.03), inset 0 1px 1px rgba(255, 255, 255, 0.8)'
              }}
            >
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>📘 Fanpage Facebook mặc định:</span>
                </label>
                <span className="muted" style={{ fontSize: '11.5px', display: 'block', marginBottom: '8px' }}>
                  Dùng khi dòng FB không chỉ định Page ID
                </span>
                <select
                  value={selectedDefaultPageId}
                  onChange={handleDefaultPageChange}
                  style={{
                    width: '100%',
                    background: 'var(--field-bg)',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  {channels.length === 0 ? (
                    <option value="">Chưa kết nối Fanpage nào</option>
                  ) : (
                    channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name} ({ch.id})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>🎵 Kênh TikTok mặc định:</span>
                </label>
                <span className="muted" style={{ fontSize: '11.5px', display: 'block', marginBottom: '8px' }}>
                  Dùng khi dòng TikTok không chỉ định kênh
                </span>
                <select
                  value={selectedDefaultTiktokId}
                  onChange={handleDefaultTiktokChange}
                  style={{
                    width: '100%',
                    background: 'var(--field-bg)',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  {tiktokAccounts.length === 0 ? (
                    <option value="">Chưa kết nối tài khoản TikTok nào</option>
                  ) : (
                    tiktokAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.nickname || acc.username || `TikTok #${acc.id}`} (@{acc.username || acc.id})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              className={`file-drop ${isDragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                transition: 'all 0.22s ease',
                border: isDragOver
                  ? '2px dashed #2563eb'
                  : file
                  ? '1.5px solid rgba(37, 99, 235, 0.45)'
                  : '1.5px dashed rgba(220, 214, 202, 0.85)',
                background: isDragOver
                  ? 'rgba(37, 99, 235, 0.08)'
                  : file
                  ? 'rgba(37, 99, 235, 0.03)'
                  : 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '16px',
                padding: '32px 20px',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (!file && fileInputRef.current) fileInputRef.current.click();
              }}
            >
              {file ? (
                <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
                  <div
                    className="file-icon"
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      color: '#22c55e',
                      boxShadow: '0 0 16px rgba(34, 197, 94, 0.25)'
                    }}
                  >
                    <FileSpreadsheet size={26} />
                  </div>
                  <strong style={{ fontSize: '16px', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    {file.name}
                  </strong>
                  <span className="muted" style={{ fontSize: '13px' }}>
                    {(file.size / 1024).toFixed(1)} KB • Sẵn sàng xử lý
                  </span>
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      style={{ fontSize: '12.5px', padding: '6px 14px' }}
                    >
                      Đổi file khác
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearFile();
                      }}
                      style={{ fontSize: '12.5px', padding: '6px 14px', color: '#f87171' }}
                    >
                      <Trash2 size={13} style={{ marginRight: '4px' }} /> Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="file-icon">
                    <UploadCloud size={26} />
                  </span>
                  <strong style={{ fontSize: '15px', color: 'var(--ink)', display: 'block', marginBottom: '6px' }}>
                    Kéo và thả tệp Excel vào đây
                  </strong>
                  <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                    hoặc <label htmlFor="excel-upload" style={{ color: '#00f2fe', cursor: 'pointer' }}>chọn tệp từ máy tính</label>
                  </p>
                  <span className="muted" style={{ display: 'block', marginTop: '10px', fontSize: '11.5px', opacity: 0.7 }}>
                    Hỗ trợ .XLSX, .XLS • Tối đa 20 MB
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                id="excel-upload"
                hidden
              />
            </div>

            {/* Results / Feedback Message */}
            {resultMessage && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background:
                    resultMessage.type === 'success'
                      ? 'rgba(34, 197, 94, 0.1)'
                      : resultMessage.type === 'warning'
                      ? 'rgba(234, 179, 8, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${
                    resultMessage.type === 'success'
                      ? 'rgba(34, 197, 94, 0.3)'
                      : resultMessage.type === 'warning'
                      ? 'rgba(234, 179, 8, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                  }`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                {resultMessage.type === 'success' ? (
                  <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertCircle
                    size={20}
                    color={resultMessage.type === 'warning' ? '#eab308' : '#ef4444'}
                    style={{ flexShrink: 0, marginTop: '2px' }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color:
                        resultMessage.type === 'success'
                          ? '#4ade80'
                          : resultMessage.type === 'warning'
                          ? '#facc15'
                          : '#f87171'
                    }}
                  >
                    {resultMessage.text}
                  </div>
                  {errorsList.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#fca5a5', fontSize: '12.5px' }}>
                      {errorsList.map((err, idx) => (
                        <li key={idx}>
                          Dòng {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {resultMessage.type === 'success' && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                      <Link href="/post-planner/list" className="button button-primary" style={{ fontSize: '13px' }}>
                        Xem danh sách bài đăng <ArrowRight size={14} />
                      </Link>
                      <Link href="/post-planner/calendar" className="button button-secondary" style={{ fontSize: '13px' }}>
                        <Calendar size={14} /> Mở lịch đăng
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Panel 2: Excel Preview Table */}
          {previewLoading && (
            <div
              className="panel"
              style={{ padding: '36px', textAlign: 'center', color: 'var(--blue)' }}
            >
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Đang phân tích dữ liệu tệp Excel...</div>
              <span className="muted" style={{ fontSize: '12.5px' }}>Kiểm tra định dạng ngày giờ, nội dung và quyền Fanpage</span>
            </div>
          )}

          {previewData && !previewLoading && (
            <section className="panel" style={{ padding: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                    Xem trước danh sách bài đăng ({previewData.total} dòng)
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setPlatformFilter('all')}
                      style={{
                        background: platformFilter === 'all' ? 'var(--blue)' : 'var(--panel)',
                        color: platformFilter === 'all' ? '#fff' : 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: '20px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Tất cả ({previewData.posts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatformFilter('facebook')}
                      style={{
                        background: platformFilter === 'facebook' ? '#2563eb' : 'var(--panel)',
                        color: platformFilter === 'facebook' ? '#fff' : 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: '20px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      📘 Facebook ({previewData.posts.filter((p) => p.platform === 'facebook').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatformFilter('tiktok')}
                      style={{
                        background: platformFilter === 'tiktok' ? '#fe2c55' : 'var(--panel)',
                        color: platformFilter === 'tiktok' ? '#fff' : 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: '20px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      🎵 TikTok ({previewData.posts.filter((p) => p.platform === 'tiktok').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatformFilter('valid')}
                      style={{
                        background: platformFilter === 'valid' ? '#16a34a' : 'var(--panel)',
                        color: platformFilter === 'valid' ? '#fff' : '#4ade80',
                        border: '1px solid var(--line)',
                        borderRadius: '20px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Hợp lệ ({previewData.validCount})
                    </button>
                    {previewData.invalidCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPlatformFilter('invalid')}
                        style={{
                          background: platformFilter === 'invalid' ? '#dc2626' : 'var(--panel)',
                          color: platformFilter === 'invalid' ? '#fff' : '#f87171',
                          border: '1px solid var(--line)',
                          borderRadius: '20px',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ✕ Lỗi ({previewData.invalidCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  className="button button-primary"
                  onClick={handleUpload}
                  disabled={uploadLoading || previewData.validCount === 0}
                  type="button"
                  style={{
                    padding: '10px 22px',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {uploadLoading ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Đang lên lịch...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Xác nhận lên lịch ({previewData.validCount} bài)
                    </>
                  )}
                </button>
              </div>

              {/* Table Container */}
              <div
                style={{
                  overflowX: 'auto',
                  borderRadius: '14px',
                  border: '1px solid var(--line)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                  background: 'var(--panel)',
                  backdropFilter: 'blur(24px) saturate(190%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(190%)',
                  boxShadow: '0 8px 24px -4px rgba(70, 55, 40, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.8)'
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '13px'
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderBottom: '1px solid var(--line)',
                        color: 'var(--muted)',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      <th style={{ padding: '12px 14px', width: '50px' }}>Dòng</th>
                      <th style={{ padding: '12px 14px', width: '110px' }}>Nền tảng</th>
                      <th style={{ padding: '12px 14px', width: '100px' }}>Trạng thái</th>
                      <th style={{ padding: '12px 14px', width: '180px' }}>Kênh đăng</th>
                      <th style={{ padding: '12px 14px', minWidth: '240px' }}>Nội dung bài viết</th>
                      <th style={{ padding: '12px 14px', width: '160px' }}>Lịch đăng</th>
                      <th style={{ padding: '12px 14px', width: '100px' }}>Media</th>
                      <th style={{ padding: '12px 14px', width: '90px' }}>Seeding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.posts
                      .filter((post) => {
                        if (platformFilter === 'facebook') return post.platform === 'facebook';
                        if (platformFilter === 'tiktok') return post.platform === 'tiktok';
                        if (platformFilter === 'valid') return post.valid;
                        if (platformFilter === 'invalid') return !post.valid;
                        return true;
                      })
                      .map((post, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: post.valid
                            ? 'transparent'
                            : 'rgba(239, 68, 68, 0.04)'
                        }}
                      >
                        <td style={{ padding: '12px 14px', color: 'var(--muted)', fontWeight: 600 }}>
                          #{post.rowIndex}{post.subRow ? ` (${post.subRow})` : ''}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {post.platform === 'tiktok' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(254, 44, 85, 0.12)',
                                color: '#fe2c55',
                                border: '1px solid rgba(254, 44, 85, 0.25)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}
                            >
                              🎵 TikTok
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(37, 99, 235, 0.12)',
                                color: '#3b82f6',
                                border: '1px solid rgba(37, 99, 235, 0.25)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}
                            >
                              📘 Facebook
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {post.valid ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                                padding: '3px 8px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}
                            >
                              ✓ Hợp lệ
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                padding: '3px 8px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}
                              title={post.error}
                            >
                              ✕ {post.error}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '13px' }}>
                            {post.pageName}
                          </div>
                          <span
                            className="muted"
                            style={{ fontSize: '11px', fontFamily: 'monospace' }}
                          >
                            ID: {post.pageId || '---'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <p
                            style={{
                              margin: 0,
                              color: 'var(--ink)',
                              lineHeight: 1.45,
                              maxWidth: '360px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={post.content}
                          >
                            {post.content}
                          </p>
                        </td>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--blue)' }}>
                            <Calendar size={13} />
                            {new Date(post.scheduledAt).toLocaleString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {post.mediaType === 'video' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#c084fc',
                                fontSize: '12px'
                              }}
                            >
                              <Video size={13} /> Video
                            </span>
                          ) : post.mediaType === 'image' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#38bdf8',
                                fontSize: '12px'
                              }}
                            >
                              <ImageIcon size={13} /> Ảnh ({post.mediaLinks?.length || 1})
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Văn bản</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {post.platform === 'tiktok' ? (
                            <span className="muted" title="TikTok không áp dụng comment seeding">—</span>
                          ) : post.commentsCount > 0 ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#f59e0b',
                                fontSize: '12px',
                                fontWeight: 700
                              }}
                            >
                              <MessageSquare size={12} /> {post.commentsCount}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Helper / Connected Channels & Instructions */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Box 1: Connected Fanpages & Quick Copy ID */}
          {/* Box 1: Connected Channels (Facebook & TikTok Tabs) */}
          <div className="panel" style={{ padding: '20px' }}>
            <div className="panel-heading" style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                Kênh kết nối của bạn
              </h3>
            </div>

            {/* Platform Switcher Tabs */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0,0,0,0.04)',
                borderRadius: '8px',
                padding: '3px',
                marginBottom: '14px'
              }}
            >
              <button
                type="button"
                onClick={() => setActiveChannelTab('fb')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeChannelTab === 'fb' ? '#2563eb' : 'transparent',
                  color: activeChannelTab === 'fb' ? '#fff' : 'var(--muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                📘 Facebook ({channels.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveChannelTab('tiktok')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeChannelTab === 'tiktok' ? '#fe2c55' : 'transparent',
                  color: activeChannelTab === 'tiktok' ? '#fff' : 'var(--muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                🎵 TikTok ({tiktokAccounts.length})
              </button>
            </div>

            {activeChannelTab === 'fb' ? (
              <>
                <p className="muted" style={{ fontSize: '12px', marginBottom: '12px', lineHeight: 1.45 }}>
                  Sao chép <strong>Page ID</strong> để điền vào cột Kênh đăng:
                </p>
                {channels.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                    Chưa có Fanpage nào được kết nối.
                    <div style={{ marginTop: '10px' }}>
                      <Link href="/channels" className="button button-primary" style={{ fontSize: '12px' }}>
                        Kết nối Fanpage
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {channels.map((ch) => (
                      <div
                        key={ch.id}
                        style={{
                          background: 'var(--panel)',
                          backdropFilter: 'blur(16px)',
                          WebkitBackdropFilter: 'blur(16px)',
                          border: '1px solid var(--line)',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color: 'var(--ink)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {ch.name}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--muted)',
                              fontFamily: 'monospace',
                              marginTop: '2px'
                            }}
                          >
                            {ch.id}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPageId(ch.id)}
                          className="button button-secondary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                          }}
                          title="Sao chép ID vào clipboard"
                        >
                          {copiedId === ch.id ? (
                            <>
                              <Check size={12} color="#22c55e" /> Đã chép
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Chép ID
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="muted" style={{ fontSize: '12px', marginBottom: '12px', lineHeight: 1.45 }}>
                  Sao chép <strong>ID</strong> hoặc <strong>@username</strong> để điền vào cột Kênh đăng:
                </p>
                {tiktokAccounts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                    Chưa có tài khoản TikTok nào.
                    <div style={{ marginTop: '10px' }}>
                      <Link href="/channels" className="button button-primary" style={{ fontSize: '12px', background: '#fe2c55', borderColor: '#fe2c55' }}>
                        Thêm TikTok
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {tiktokAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        style={{
                          background: 'var(--panel)',
                          backdropFilter: 'blur(16px)',
                          WebkitBackdropFilter: 'blur(16px)',
                          border: '1px solid var(--line)',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color: 'var(--ink)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {acc.nickname || acc.username || `TikTok #${acc.id}`}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#fe2c55',
                              fontFamily: 'monospace',
                              marginTop: '2px'
                            }}
                          >
                            ID: {acc.id} {acc.username ? `• @${acc.username}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleCopyText(acc.id)}
                            className="button button-secondary"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            title="Sao chép ID số"
                          >
                            {copiedId === acc.id ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                            ID
                          </button>
                          {acc.username && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(`@${acc.username}`)}
                              className="button button-secondary"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Sao chép @username"
                            >
                              {copiedId === `@${acc.username}` ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                              @User
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Box 2: Instructions & Rules */}
          <div className="panel" style={{ padding: '20px' }}>
            <div className="panel-heading" style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                Quy tắc file Excel (FB + TikTok)
              </h3>
            </div>
            <div className="upload-tips" style={{ gap: '14px' }}>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  Sheet chứa dữ liệu bắt buộc đặt tên là <strong>MAIN SHEET</strong>.
                </div>
              </div>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  Cột <strong>Nền tảng</strong>: Điền <code>Facebook</code>, <code>TikTok</code> hoặc <code>Cả hai</code> (nếu để trống hệ thống tự nhận diện).
                </div>
              </div>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  Cột <strong>Kênh đăng</strong>: Điền <code>Tên | ID</code> (Fanpage) hoặc <code>ID</code> / <code>@username</code> (TikTok).
                </div>
              </div>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  Cột <strong>Schedule</strong>: <code>Đăng ngay</code> hoặc <code>DD/MM/YYYY_HH:mm</code> (VD: <code>05/10/2026_09:00</code>).
                </div>
              </div>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  <strong>TikTok</strong>: Bắt buộc đính kèm link video (.mp4, .mov) ở cột <code>Media Link</code>.
                </div>
              </div>
              <div className="tip-line">
                <Check size={16} className="tip-check" />
                <div>
                  <strong>Facebook</strong>: Hỗ trợ văn bản, ảnh, video và tối đa <strong>5 bình luận Seeding</strong>.
                </div>
              </div>

              <div style={{ marginTop: '8px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
                <a
                  className="button button-secondary"
                  href={postApi.templateUrl}
                  download="Mau_Upload_Bai_Dang_ToolFB_TikTok.xlsx"
                  style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <FileSpreadsheet size={16} /> Tải file Excel mẫu chuẩn (FB + TikTok)
                </a>
              </div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </MainLayout>
  );
}