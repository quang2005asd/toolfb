import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  XCircle
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import PlatformIcon from '../../components/PlatformIcon';
import WriteNav, { BULK_TYPES } from '../../components/write/WriteNav';
import postApi from '../../services/postApi';
import channelApi from '../../services/channelApi';
import channelGroupApi from '../../services/channelGroupApi';

// Cấu hình từng loại đăng hàng loạt
const TYPE_CONFIG = {
  short: {
    accept: 'video/*',
    kinds: ['video'],
    tiktok: true,
    caption: true,
    drop: 'Kéo thả hoặc chọn nhiều video dọc (MP4 / MOV, tối đa 100 MB mỗi video)',
    channelsHint: 'Video đăng dạng Reels lên Fanpage và / hoặc đăng lên TikTok.',
    note: 'YouTube Shorts: tool chưa kết nối YouTube nên chưa đăng được — chọn Fanpage (Reels) và / hoặc TikTok.'
  },
  feed: {
    accept: 'image/*,video/*',
    kinds: ['image', 'video', 'text'],
    tiktok: false,
    caption: true,
    drop: 'Kéo thả hoặc chọn nhiều ảnh / video — mỗi file là một bài',
    channelsHint: 'Mỗi bài đăng lên tất cả Fanpage được chọn.'
  },
  story: {
    accept: 'image/*,video/*',
    kinds: ['image', 'video'],
    tiktok: false,
    caption: false,
    drop: 'Kéo thả hoặc chọn nhiều ảnh / video dọc — mỗi file là một Tin',
    channelsHint: 'Tin hiển thị 24 giờ trên Fanpage, không kèm chữ.'
  }
};
const GAP_UNITS = { minute: 1, hour: 60, day: 1440 };

let uidCounter = 0;
const nextUid = () => `item-${Date.now()}-${uidCounter += 1}`;

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStart() {
  const date = new Date(Date.now() + 30 * 60000);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return toLocalInput(date);
}

function formatWhen(date) {
  return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}`;
}

function kindOf(file) {
  if (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

function ChannelCheck({ checked, disabled, onChange, title, subtitle, warn, platform }) {
  return (
    <label className={`bulk-channel${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <PlatformIcon platform={platform} size={18} />
      <span>
        <strong>{title}</strong>
        <small>{warn ? <span className="bulk-warn">{warn}</span> : subtitle}</small>
      </span>
    </label>
  );
}

export default function BulkWritePage() {
  const router = useRouter();
  const type = TYPE_CONFIG[router.query.type] ? router.query.type : 'short';
  const config = TYPE_CONFIG[type];
  const typeInfo = BULK_TYPES.find((item) => item.id === type);

  const [channels, setChannels] = useState([]);
  const [tiktokAccounts, setTiktokAccounts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [selectedTiktokIds, setSelectedTiktokIds] = useState([]);

  const [items, setItems] = useState([]);
  const [sharedCaption, setSharedCaption] = useState(false);
  const [commonCaption, setCommonCaption] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const previewUrls = useRef(new Set());
  const messagesRef = useRef(null);
  // Thông báo lỗi / kết quả nằm cuối trang: cuộn tới để người dùng thấy ngay
  const revealMessages = () => setTimeout(() => messagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);

  const [scheduleMode, setScheduleMode] = useState('later'); // 'now' | 'later'
  const [startAt, setStartAt] = useState(defaultStart);
  const [gapValue, setGapValue] = useState(60);
  const [gapUnit, setGapUnit] = useState('minute');

  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState([]);
  const [summary, setSummary] = useState(null); // { ok, total }

  useEffect(() => {
    Promise.allSettled([channelApi.list(), channelApi.tiktokAccounts(), channelGroupApi.list()])
      .then(([chanRes, ttRes, groupRes]) => {
        if (chanRes.status === 'fulfilled') setChannels(chanRes.value.channels || []);
        if (ttRes.status === 'fulfilled') setTiktokAccounts(ttRes.value.accounts || []);
        if (groupRes.status === 'fulfilled') setGroups(groupRes.value.groups || []);
      })
      .finally(() => setLoadingChannels(false));
  }, []);

  // Đổi loại: bỏ các file không hợp với loại mới (vd. ảnh khi chuyển sang Video ngắn)
  useEffect(() => {
    setItems((current) => current.filter((item) => config.kinds.includes(item.kind)));
    setSummary(null);
    setSubmitErrors([]);
  }, [type]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateItem = (uid, patch) => setItems((current) => current.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));

  const uploadOne = async (item, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await postApi.uploadMedia(formData);
      updateItem(item.uid, { status: 'ready', mediaLink: res.mediaLink });
    } catch (err) {
      updateItem(item.uid, { status: 'error', error: err.response?.data?.message || 'Tải lên thất bại' });
    }
  };

  const addFiles = async (fileList) => {
    const files = [...fileList];
    const accepted = [];
    const rejected = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind || !config.kinds.includes(kind)) rejected.push(file.name);
      else if (file.size > 100 * 1024 * 1024) rejected.push(`${file.name} (quá 100 MB)`);
      else accepted.push({ file, kind });
    }
    if (rejected.length) setSubmitErrors([`Bỏ qua ${rejected.length} file không hợp lệ cho loại “${typeInfo.label}”: ${rejected.slice(0, 5).join(', ')}${rejected.length > 5 ? '…' : ''}`]);
    const newItems = accepted.map(({ file, kind }) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { uid: nextUid(), name: file.name, kind, previewUrl, mediaLink: null, status: 'uploading', error: '', caption: '', result: null, file };
    });
    setItems((current) => [...current, ...newItems]);
    setSummary(null);
    // Tải lên lần lượt, 2 file cùng lúc
    const queue = [...newItems];
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        await uploadOne(item, item.file);
      }
    };
    await Promise.all([worker(), worker()]);
  };

  const addTextItem = () => setItems((current) => [...current, { uid: nextUid(), name: 'Bài chữ', kind: 'text', previewUrl: null, mediaLink: null, status: 'ready', error: '', caption: '', result: null }]);

  const removeItem = (uid) => setItems((current) => {
    const target = current.find((item) => item.uid === uid);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
      previewUrls.current.delete(target.previewUrl);
    }
    return current.filter((item) => item.uid !== uid);
  });

  const moveItem = (index, delta) => setItems((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const retryUpload = (item) => {
    if (!item.file) return;
    updateItem(item.uid, { status: 'uploading', error: '' });
    uploadOne(item, item.file);
  };

  const togglePage = (id) => setSelectedPageIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const toggleTiktok = (id) => setSelectedTiktokIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const usablePages = channels.filter((channel) => channel.isValid !== false);
  const usableTiktok = tiktokAccounts.filter((account) => account.status === 'active');
  const toggleGroup = (group) => {
    const ids = (group.pageIds || []).filter((id) => usablePages.some((page) => page.id === id));
    const allIn = ids.length > 0 && ids.every((id) => selectedPageIds.includes(id));
    setSelectedPageIds((current) => (allIn ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  };

  // Giờ đăng của từng bài: bắt đầu (ngay hoặc giờ hẹn) + thứ tự × khoảng cách
  const gapMinutes = Math.max(0, Number(gapValue) || 0) * GAP_UNITS[gapUnit];
  const timeFor = (index, base = null) => {
    const start = scheduleMode === 'now' ? (base || new Date()) : new Date(startAt);
    return new Date(start.getTime() + index * gapMinutes * 60000);
  };

  const readyItems = items.filter((item) => item.status === 'ready');
  const uploadingCount = items.filter((item) => item.status === 'uploading').length;
  const channelCount = selectedPageIds.length + (config.tiktok ? selectedTiktokIds.length : 0);
  const totalPublishes = readyItems.length * channelCount;

  const captionOf = (item) => (sharedCaption ? commonCaption : item.caption).trim();

  const validate = () => {
    const errors = [];
    if (!channelCount) errors.push(config.tiktok ? 'Chọn ít nhất một Fanpage hoặc tài khoản TikTok.' : 'Chọn ít nhất một Fanpage.');
    if (!readyItems.some((item) => !item.result?.ok)) errors.push(readyItems.length ? 'Mọi bài đã được xếp lịch — bấm “Tạo đợt mới” để đăng đợt khác.' : 'Thêm ít nhất một bài (file đã tải lên xong).');
    if (uploadingCount) errors.push(`Còn ${uploadingCount} file đang tải lên — chờ tải xong rồi xếp lịch.`);
    if (config.caption) {
      const missing = readyItems.filter((item) => !captionOf(item)).length;
      if (missing) errors.push(sharedCaption ? 'Nhập nội dung dùng chung cho các bài.' : `${missing} bài chưa có nội dung — nhập nội dung hoặc bật “Dùng chung một nội dung”.`);
    }
    if (scheduleMode === 'later') {
      const start = new Date(startAt);
      if (Number.isNaN(start.getTime())) errors.push('Giờ bắt đầu không hợp lệ.');
      else if (start.getTime() < Date.now() - 60000) errors.push('Giờ bắt đầu đã qua — chọn thời điểm trong tương lai hoặc chọn “Đăng ngay”.');
    }
    if (readyItems.length > 1 && gapMinutes === 0) errors.push('Khoảng cách giữa các bài phải lớn hơn 0 để không đăng dồn một lúc.');
    return errors;
  };

  const submit = async () => {
    const errors = validate();
    setSubmitErrors(errors);
    if (errors.length) {
      revealMessages();
      return;
    }
    setSubmitting(true);
    setSummary(null);
    const base = new Date();
    let ok = 0;
    // Bài đã xếp lịch thành công ở lần trước không gửi lại
    const ordered = items.filter((item) => item.status === 'ready' && !item.result?.ok);
    for (const [index, item] of ordered.entries()) {
      const scheduledAt = timeFor(index, base).toISOString();
      const content = config.caption ? captionOf(item) : '';
      const messages = [];
      let failed = false;
      const requests = [];
      if (selectedPageIds.length) {
        const mediaType = type === 'short' ? 'reel' : type === 'story' ? 'story' : item.kind;
        requests.push({ label: 'Facebook', body: { platform: 'facebook', pageIds: selectedPageIds, mediaType, mediaLinks: item.kind === 'text' ? [] : [item.mediaLink], content, scheduledAt } });
      }
      if (config.tiktok && selectedTiktokIds.length) {
        requests.push({ label: 'TikTok', body: { platform: 'tiktok', tiktokAccountIds: selectedTiktokIds, mediaType: 'video', mediaLinks: [item.mediaLink], content, scheduledAt } });
      }
      for (const request of requests) {
        try {
          const res = await postApi.createPost(request.body);
          messages.push(`${request.label}: ${res.count || 1} lượt`);
        } catch (err) {
          failed = true;
          messages.push(`${request.label}: ${err.response?.data?.message || 'lỗi'}`);
        }
      }
      if (!failed) ok += 1;
      updateItem(item.uid, { result: { ok: !failed, text: messages.join(' · '), at: scheduledAt } });
    }
    setSummary({ ok, total: ordered.length });
    setSubmitting(false);
    revealMessages();
  };

  const startNewBatch = () => {
    items.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    previewUrls.current.clear();
    setItems([]);
    setSummary(null);
    setSubmitErrors([]);
    setCommonCaption('');
  };

  const schedulePreview = useMemo(() => readyItems.slice(0, 50).map((item, index) => ({ item, at: timeFor(index) })), [readyItems, scheduleMode, startAt, gapMinutes]);

  return (
    <MainLayout title={`Viết hàng loạt · ${typeInfo.label}`}>
      <WriteNav active="bulk" bulkType={type} />

      <div className="bulk-page">
        {/* BƯỚC 1: KÊNH */}
        <section className="panel bulk-step">
          <header className="bulk-step-head">
            <span className="bulk-step-num">1</span>
            <div>
              <h2>Chọn kênh đăng</h2>
              <p>{config.channelsHint}</p>
            </div>
          </header>
          {loadingChannels ? (
            <p className="bulk-muted"><Loader2 size={15} className="spin" /> Đang tải kênh…</p>
          ) : (
            <div className="bulk-channels">
              <div className="bulk-channel-group">
                <div className="bulk-channel-group-head">
                  <strong>Fanpage Facebook{type === 'short' ? ' (Reels)' : ''}</strong>
                  {usablePages.length > 0 && (
                    <button type="button" className="auth-inline-link" onClick={() => setSelectedPageIds(selectedPageIds.length === usablePages.length ? [] : usablePages.map((page) => page.id))}>
                      {selectedPageIds.length === usablePages.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                    </button>
                  )}
                </div>
                {groups.length > 0 && (
                  <div className="bulk-group-chips" aria-label="Chọn nhanh theo nhóm kênh">
                    {groups.map((group) => (
                      <button key={group.id} type="button" className="bulk-chip" onClick={() => toggleGroup(group)}>
                        <i style={{ background: group.color || 'var(--blue)' }} aria-hidden="true" /> {group.name}
                      </button>
                    ))}
                  </div>
                )}
                {channels.length === 0 ? (
                  <p className="bulk-muted">Chưa có Fanpage nào. <Link href="/channels">Kết nối Facebook</Link></p>
                ) : (
                  <div className="bulk-channel-list">
                    {channels.map((page) => (
                      <ChannelCheck
                        key={page.id}
                        platform="facebook"
                        checked={selectedPageIds.includes(page.id)}
                        disabled={page.isValid === false}
                        onChange={() => togglePage(page.id)}
                        title={page.name}
                        subtitle={page.fbAccountName ? `qua ${page.fbAccountName}` : page.category}
                        warn={page.isValid === false ? 'Mất quyền — cập nhật ở trang Kênh' : null}
                      />
                    ))}
                  </div>
                )}
              </div>

              {config.tiktok && (
                <div className="bulk-channel-group">
                  <div className="bulk-channel-group-head">
                    <strong>Tài khoản TikTok</strong>
                    {usableTiktok.length > 0 && (
                      <button type="button" className="auth-inline-link" onClick={() => setSelectedTiktokIds(selectedTiktokIds.length === usableTiktok.length ? [] : usableTiktok.map((account) => account.id))}>
                        {selectedTiktokIds.length === usableTiktok.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                      </button>
                    )}
                  </div>
                  {tiktokAccounts.length === 0 ? (
                    <p className="bulk-muted">Chưa có tài khoản TikTok. <Link href="/channels?platform=tiktok">Kết nối TikTok</Link></p>
                  ) : (
                    <div className="bulk-channel-list">
                      {tiktokAccounts.map((account) => (
                        <ChannelCheck
                          key={account.id}
                          platform="tiktok"
                          checked={selectedTiktokIds.includes(account.id)}
                          disabled={account.status !== 'active'}
                          onChange={() => toggleTiktok(account.id)}
                          title={account.nickname || account.username}
                          subtitle={`@${account.username}`}
                          warn={account.status !== 'active' ? 'Cookie hết hạn — kết nối lại' : null}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {config.note && <p className="bulk-note">{config.note}</p>}
            </div>
          )}
        </section>

        {/* BƯỚC 2: NỘI DUNG */}
        <section className="panel bulk-step">
          <header className="bulk-step-head">
            <span className="bulk-step-num">2</span>
            <div>
              <h2>Nội dung ({items.length} bài)</h2>
              <p>Mỗi file là một bài. Kéo lên / xuống để đổi thứ tự đăng.</p>
            </div>
          </header>

          <div
            className={`bulk-drop${dragOver ? ' is-over' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => { event.preventDefault(); setDragOver(false); addFiles(event.dataTransfer.files); }}
          >
            <UploadCloud size={26} aria-hidden="true" />
            <p>{config.drop}</p>
            <div className="bulk-drop-actions">
              <button type="button" className="button button-primary" onClick={() => fileInputRef.current?.click()}><Plus size={15} /> Chọn file</button>
              {config.kinds.includes('text') && <button type="button" className="button button-secondary" onClick={addTextItem}><FileText size={15} /> Thêm bài chỉ có chữ</button>}
            </div>
            <input ref={fileInputRef} type="file" accept={config.accept} multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          </div>

          {config.caption && items.length > 0 && (
            <div className="bulk-shared">
              <label className="bulk-switch">
                <input type="checkbox" checked={sharedCaption} onChange={(event) => setSharedCaption(event.target.checked)} />
                <span>Dùng chung một nội dung cho tất cả bài</span>
              </label>
              {sharedCaption && (
                <textarea className="field" rows={4} placeholder="Nội dung / caption + hashtag dùng cho mọi bài" value={commonCaption} onChange={(event) => setCommonCaption(event.target.value)} />
              )}
            </div>
          )}

          {items.length > 0 && (
            <ol className="bulk-items">
              {items.map((item, index) => (
                <li key={item.uid} className={`bulk-item is-${item.status}${item.result ? (item.result.ok ? ' is-done' : ' is-failed') : ''}`}>
                  <div className="bulk-item-order">
                    <span>{index + 1}</span>
                    <button type="button" className="icon-button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Đưa lên"><ArrowUp size={14} /></button>
                    <button type="button" className="icon-button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} aria-label="Đưa xuống"><ArrowDown size={14} /></button>
                  </div>
                  <div className="bulk-item-media">
                    {item.kind === 'image' && item.previewUrl && <img src={item.previewUrl} alt="" />}
                    {item.kind === 'video' && item.previewUrl && <video src={item.previewUrl} muted preload="metadata" />}
                    {item.kind === 'text' && <FileText size={22} aria-hidden="true" />}
                    <span className="bulk-item-kind">{item.kind === 'video' ? <Film size={12} /> : item.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}</span>
                  </div>
                  <div className="bulk-item-body">
                    <div className="bulk-item-meta">
                      <strong title={item.name}>{item.name}</strong>
                      {item.status === 'uploading' && <span className="bulk-badge"><Loader2 size={12} className="spin" /> Đang tải lên</span>}
                      {item.status === 'error' && (
                        <span className="bulk-badge is-error"><XCircle size={12} /> {item.error} <button type="button" className="auth-inline-link" onClick={() => retryUpload(item)}>Thử lại</button></span>
                      )}
                      {item.status === 'ready' && !item.result && <span className="bulk-badge is-time"><Clock size={12} /> {formatWhen(timeFor(readyItems.indexOf(item)))}</span>}
                      {item.result && (
                        <span className={`bulk-badge ${item.result.ok ? 'is-ok' : 'is-error'}`}>{item.result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {item.result.text}</span>
                      )}
                    </div>
                    {config.caption && !sharedCaption && (
                      <textarea
                        className="field"
                        rows={item.kind === 'text' ? 4 : 2}
                        placeholder={type === 'short' ? 'Caption + hashtag cho video này' : 'Nội dung bài viết'}
                        value={item.caption}
                        onChange={(event) => updateItem(item.uid, { caption: event.target.value })}
                      />
                    )}
                  </div>
                  <button type="button" className="icon-button bulk-item-remove" onClick={() => removeItem(item.uid)} aria-label={`Bỏ ${item.name}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* BƯỚC 3: LỊCH ĐĂNG */}
        <section className="panel bulk-step">
          <header className="bulk-step-head">
            <span className="bulk-step-num">3</span>
            <div>
              <h2>Lịch đăng</h2>
              <p>Bài đầu đăng lúc bắt đầu, các bài sau cách nhau đều nhau.</p>
            </div>
          </header>
          <div className="bulk-schedule">
            <div className="report-segment" role="radiogroup" aria-label="Thời điểm bắt đầu">
              <button type="button" role="radio" aria-checked={scheduleMode === 'now'} className={scheduleMode === 'now' ? 'is-active' : ''} onClick={() => setScheduleMode('now')}>Bắt đầu ngay</button>
              <button type="button" role="radio" aria-checked={scheduleMode === 'later'} className={scheduleMode === 'later' ? 'is-active' : ''} onClick={() => setScheduleMode('later')}>Hẹn giờ bắt đầu</button>
            </div>
            {scheduleMode === 'later' && (
              <label className="bulk-field">
                <span className="field-label">Bắt đầu lúc</span>
                <input className="field" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              </label>
            )}
            <label className="bulk-field">
              <span className="field-label">Mỗi bài cách nhau</span>
              <span className="bulk-gap">
                <input className="field" type="number" min={0} max={999} value={gapValue} onChange={(event) => setGapValue(event.target.value)} />
                <select className="field" value={gapUnit} onChange={(event) => setGapUnit(event.target.value)}>
                  <option value="minute">phút</option>
                  <option value="hour">giờ</option>
                  <option value="day">ngày</option>
                </select>
              </span>
            </label>
          </div>
          {schedulePreview.length > 0 && (
            <p className="bulk-muted">
              Bài 1: <strong>{formatWhen(schedulePreview[0].at)}</strong>
              {schedulePreview.length > 1 && <> → bài {schedulePreview.length}: <strong>{formatWhen(schedulePreview[schedulePreview.length - 1].at)}</strong></>}
            </p>
          )}
        </section>

        {/* THÔNG BÁO (không dính) + THANH TỔNG KẾT & NÚT XẾP LỊCH (dính đáy màn hình) */}
        <div className="bulk-messages" ref={messagesRef}>
          {submitErrors.length > 0 && (
            <ul className="bulk-errors" role="alert">
              {submitErrors.map((message) => <li key={message}><AlertTriangle size={14} aria-hidden="true" /> {message}</li>)}
            </ul>
          )}
          {summary && (
            <div className={`bulk-summary ${summary.ok === summary.total ? 'is-ok' : 'is-warn'}`} role="status">
              {summary.ok === summary.total ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>Đã xếp lịch {summary.ok}/{summary.total} bài. {summary.ok < summary.total ? 'Sửa bài lỗi rồi bấm xếp lịch lại — bài đã thành công không bị đăng lại.' : ''}</span>
              <Link href="/post-planner/calendar" className="button button-secondary">Xem lịch đăng</Link>
              <button type="button" className="button button-quiet" onClick={startNewBatch}>Tạo đợt mới</button>
            </div>
          )}
        </div>
        <div className="bulk-footer-bar">
            <span>
              <strong>{readyItems.length}</strong> bài × <strong>{channelCount}</strong> kênh = <strong>{totalPublishes}</strong> lượt đăng
            </span>
            <button type="button" className="button button-primary" onClick={submit} disabled={submitting || !items.length}>
              {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {submitting ? 'Đang xếp lịch…' : scheduleMode === 'now' ? 'Bắt đầu đăng' : 'Xếp lịch đăng'}
            </button>
        </div>
      </div>
    </MainLayout>
  );
}
