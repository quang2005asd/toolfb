import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Database,
  Plus,
  CheckCircle2,
  Clock,
  Archive,
  Trash2,
  Edit3,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
  Sparkles,
  ArrowLeft,
  Calendar,
  Tag,
  Building2,
  AlertTriangle
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import aiApi from '../../services/aiApi';
import { useAuth } from '../../context/AuthContext';

const FACT_TYPES = [
  { key: 'price', label: 'Giá bán & Gói dịch vụ', color: '#0284c7', bg: '#e0f2fe' },
  { key: 'promotion', label: 'Ưu đãi & Khuyến mãi', color: '#16a34a', bg: '#dcfce7' },
  { key: 'policy', label: 'Chính sách bảo hành / Đổi trả', color: '#9333ea', bg: '#f3e8ff' },
  { key: 'description', label: 'Mô tả & Thông số thực tế', color: '#d97706', bg: '#fef3c7' }
];

export default function KbFactsPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [facts, setFacts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingFact, setEditingFact] = useState(null);

  // Form state
  const [formCustomer, setFormCustomer] = useState('');
  const [formType, setFormType] = useState('description');
  const [formContent, setFormContent] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isReviewerOrAdmin = ['admin', 'manager', 'reviewer'].includes(user?.role?.toLowerCase());

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      loadFacts(selectedCustomer, statusFilter);
    } else {
      setFacts([]);
    }
  }, [selectedCustomer, statusFilter]);

  async function loadCustomers() {
    try {
      const data = await aiApi.getKbCustomers();
      if (data.success) {
        setCustomers(data.customers || []);
        if (data.customers.length > 0 && !selectedCustomer) {
          setSelectedCustomer(data.customers[0].customer_id);
        }
      }
    } catch (err) {
      console.error('Lỗi nạp danh sách khách hàng:', err);
    }
  }

  async function loadFacts(custId, status) {
    setLoading(true);
    try {
      const data = await aiApi.getKbFacts(custId, status);
      if (data.success) {
        setFacts(data.facts || []);
      }
    } catch (err) {
      console.error('Lỗi nạp facts:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingFact(null);
    setFormCustomer(selectedCustomer || 'Brand_A');
    setFormType('description');
    setFormContent('');
    setFormSource('');
    setFormExpiresAt('');
    setErrorMsg('');
    setShowModal(true);
  }

  function handleOpenEdit(fact) {
    setEditingFact(fact);
    setFormCustomer(fact.customerId);
    setFormType(fact.factType || 'description');
    setFormContent(fact.content || '');
    setFormSource(fact.source || '');
    setFormExpiresAt(fact.expiresAt ? fact.expiresAt.slice(0, 10) : '');
    setErrorMsg('');
    setShowModal(true);
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    if (!formContent.trim()) {
      setErrorMsg('Vui lòng nhập nội dung fact thực tế.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingFact) {
        await aiApi.updateKbFact(editingFact.id, {
          fact_type: formType,
          content: formContent.trim(),
          source: formSource.trim() || null,
          expires_at: formExpiresAt || null
        });
      } else {
        await aiApi.createKbFact({
          customer_id: formCustomer.trim(),
          fact_type: formType,
          content: formContent.trim(),
          source: formSource.trim() || null,
          expires_at: formExpiresAt || null
        });
        if (formCustomer.trim() !== selectedCustomer) {
          setSelectedCustomer(formCustomer.trim());
          await loadCustomers();
        }
      }

      setShowModal(false);
      await loadFacts(selectedCustomer, statusFilter);
      await loadCustomers();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(factId) {
    try {
      await aiApi.confirmKbFact(factId);
      await loadFacts(selectedCustomer, statusFilter);
      await loadCustomers();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    }
  }

  async function handleRetire(factId) {
    if (!confirm('Bạn có chắc muốn thu hồi (RETIRED) mục fact này? Mục này sẽ không còn vào prompt AI sinh bài.')) return;
    try {
      await aiApi.retireKbFact(factId);
      await loadFacts(selectedCustomer, statusFilter);
      await loadCustomers();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    }
  }

  async function handleDelete(factId) {
    if (!confirm('Xóa vĩnh viễn fact này khỏi cơ sở dữ liệu?')) return;
    try {
      await aiApi.deleteKbFact(factId);
      await loadFacts(selectedCustomer, statusFilter);
      await loadCustomers();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    }
  }

  return (
    <MainLayout title="Knowledge Base (Facts Khách Hàng) | Tool Face">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Link href="/ai-studio" className="hover:text-blue-600 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> AI Studio
              </Link>
              <span>/</span>
              <span className="text-slate-800 font-medium">Knowledge Base Loại 3</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-7 h-7 text-blue-600" />
              Quản Trị Facts Khách Hàng & Sản Phẩm (KB)
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Lưu trữ sự thật được xác nhận (giá, ưu đãi, chính sách, thông số). AI tự động nạp facts CONFIRMED vào prompt chống bịa đặt.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/ai-studio/generate"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              Đi tới Sinh bài với Facts
            </Link>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Thêm Fact mới
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Cột Trái: Danh sách Khách hàng / Brand */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-fit">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                Khách hàng / Fanpage
              </h2>
              <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                {customers.length}
              </span>
            </div>

            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {customers.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">
                  Chưa có khách hàng nào. Hãy bấm "Thêm Fact mới" để bắt đầu!
                </div>
              ) : (
                customers.map((c) => {
                  const isSelected = selectedCustomer === c.customer_id;
                  return (
                    <button
                      key={c.customer_id}
                      onClick={() => setSelectedCustomer(c.customer_id)}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-xs'
                          : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="font-semibold truncate">{c.customer_id}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="text-emerald-600 font-medium">{c.confirmed_facts || 0} chuẩn</span>
                        <span>•</span>
                        <span className="text-amber-600">{c.draft_facts || 0} nháp</span>
                        {c.retired_facts > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400">{c.retired_facts} hết hạn</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Cột Phải: Danh sách Facts của khách hàng */}
          <div className="lg:col-span-3 space-y-4">
            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-400 px-1">Lọc:</span>
                {['ALL', 'CONFIRMED', 'DRAFT', 'RETIRED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {st === 'ALL' && 'Tất cả'}
                    {st === 'CONFIRMED' && 'Đã duyệt (CONFIRMED)'}
                    {st === 'DRAFT' && 'Chờ duyệt (DRAFT)'}
                    {st === 'RETIRED' && 'Hết hạn / Thu hồi (RETIRED)'}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-500">
                Đang xem khách: <strong className="text-slate-800">{selectedCustomer || 'Chưa chọn'}</strong>
              </div>
            </div>

            {/* List Facts */}
            {loading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                Đang tải dữ liệu facts...
              </div>
            ) : facts.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-700">Chưa có fact nào cho khách hàng này</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Facts là cơ sở thông tin thật bất biến (giá bán, khuyến mãi, nguồn kiểm chứng). Hãy nhập để AI tự động trích dẫn khi viết bài.
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" /> Thêm fact đầu tiên
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {facts.map((fact) => {
                  const typeMeta = FACT_TYPES.find((t) => t.key === fact.factType) || FACT_TYPES[3];
                  const isConfirmed = fact.status === 'CONFIRMED';
                  const isDraft = fact.status === 'DRAFT';
                  const isRetired = fact.status === 'RETIRED';

                  return (
                    <div
                      key={fact.id}
                      className={`bg-white rounded-xl border p-4 shadow-xs transition hover:shadow-sm ${
                        isConfirmed
                          ? 'border-emerald-200 bg-white'
                          : isDraft
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-slate-200 bg-slate-50/40 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Fact Type Badge */}
                          <span
                            className="text-xs font-semibold px-2.5 py-0.5 rounded-md"
                            style={{ backgroundColor: typeMeta.bg, color: typeMeta.color }}
                          >
                            {typeMeta.label}
                          </span>

                          {/* Status Badge */}
                          {isConfirmed && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" /> CONFIRMED (Đã duyệt)
                            </span>
                          )}
                          {isDraft && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                              <Clock className="w-3.5 h-3.5" /> DRAFT (Chờ duyệt)
                            </span>
                          )}
                          {isRetired && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                              <Archive className="w-3.5 h-3.5" /> RETIRED (Hết hạn / Thu hồi)
                            </span>
                          )}

                          {/* Expiration Badge */}
                          {fact.expiresAt && (
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${
                                fact.isExpired
                                  ? 'bg-rose-100 text-rose-700 font-medium'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                              {fact.isExpired ? 'Đã hết hạn: ' : 'Hạn dùng: '}
                              {fact.expiresAt.slice(0, 10)}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isDraft && isReviewerOrAdmin && (
                            <button
                              onClick={() => handleConfirm(fact.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition shadow-xs"
                              title="Xác nhận fact (Cho phép AI nạp vào prompt)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                            </button>
                          )}
                          {isConfirmed && (
                            <button
                              onClick={() => handleRetire(fact.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition"
                              title="Thu hồi fact khi hết hiệu lực"
                            >
                              <Archive className="w-3.5 h-3.5" /> Thu hồi
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(fact)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
                            title="Sửa fact"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {['admin', 'manager'].includes(user?.role?.toLowerCase()) && (
                            <button
                              onClick={() => handleDelete(fact.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Xóa vĩnh viễn"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-sm text-slate-800 font-medium whitespace-pre-line leading-relaxed">
                        {fact.content}
                      </p>

                      {/* Source & Audit Footer */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                        <div>
                          {fact.source ? (
                            <span className="flex items-center gap-1 text-blue-600">
                              <ExternalLink className="w-3 h-3" /> Nguồn: {fact.source}
                            </span>
                          ) : (
                            <span className="italic">Chưa gắn link nguồn</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {fact.confirmedBy && (
                            <span>Người duyệt: <strong>{fact.confirmedBy}</strong></span>
                          )}
                          <span>Cập nhật: {fact.updatedAt?.slice(0, 10)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Thêm / Sửa Fact */}
        {showModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                {editingFact ? 'Cập Nhật Fact' : 'Thêm Fact Mới Cho Khách Hàng'}
              </h2>

              {errorMsg && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="space-y-4">
                {/* Customer ID */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã Khách Hàng / Thương Hiệu (customer_id) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    placeholder="Ví dụ: Brand_Coffee_A, NhaKhoa_SG..."
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                {/* Fact Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Loại Fact *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {FACT_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nội dung Sự thật (Fact Content) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Nhập thông tin thật, cụ thể, không phóng đại. Ví dụ: Giá gói cà phê rang mộc 250g là 125.000đ; Miễn phí vận chuyển toàn quốc cho đơn từ 300.000đ..."
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                {/* Source */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nguồn kiểm chứng (source link / chứng từ)
                  </label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="https://example.com/bang-gia hoặc Hợp đồng số 12/2026"
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                {/* Expiration date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hạn dùng (tùy chọn - tự động chuyển RETIRED khi hết hạn)
                  </label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                {/* Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition"
                  >
                    {submitting ? 'Đang lưu...' : editingFact ? 'Cập nhật' : 'Tạo Fact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
