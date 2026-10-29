/**
 * MessengerIceBreakerService.js
 * Câu hỏi gợi ý (Ice Breakers) của Messenger: tối đa 4 câu hiện sẵn khi khách mở đoạn chat mới với Fanpage
 * (vd. "Tôi muốn mua hàng", "Tôi cần hỗ trợ").
 * - Lưu theo từng Fanpage (SystemSettings `messenger_ice_breakers:{pageId}`) và đẩy lên Facebook qua Messenger Profile API.
 * - Khách bấm một câu → câu đó hiện trong đoạn chat như tin khách gửi. Câu có "câu trả lời tự động" thì tool
 *   trả lời ngay (MessengerAutoReplyService), kể cả khi chưa bật trả lời tự động cho mọi tin.
 */
const axios = require('axios');
const messenger = require('./MessengerService');
const { getSettings, saveSetting } = require('./SettingsService');

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}`;
const KEY_PREFIX = 'messenger_ice_breakers:';
const MAX_ITEMS = 4; // giới hạn của Facebook
const MAX_QUESTION_LENGTH = 80;
const MAX_ANSWER_LENGTH = 1000;
// Đồng hồ Facebook và máy chủ có thể lệch chút: tin khách gửi ngay sau khi áp dụng vẫn được nhận
const APPLY_CLOCK_SKEW_MS = 60 * 1000;

const PRESETS = [
  {
    key: 'shop',
    label: 'Bán hàng & hỗ trợ',
    items: [
      { question: 'Tôi muốn mua hàng', answer: 'Dạ {ten_page} chào {ten_khach} ạ! Bạn muốn mua sản phẩm nào, cho shop xin tên sản phẩm và số lượng để shop báo giá, lên đơn ngay nhé.' },
      { question: 'Tôi cần hỗ trợ', answer: 'Dạ {ten_page} đây ạ! Bạn cần hỗ trợ về đơn hàng, bảo hành hay đổi trả? Bạn mô tả giúp shop, nhân viên sẽ phản hồi ngay.' },
      { question: 'Cho tôi xin bảng giá', answer: 'Dạ bạn quan tâm sản phẩm nào ạ? Shop gửi đúng bảng giá và ưu đãi hiện có cho bạn ngay.' },
      { question: 'Tôi muốn được tư vấn', answer: 'Dạ {ten_page} rất sẵn lòng tư vấn ạ! Bạn cho shop biết nhu cầu và ngân sách để shop gợi ý lựa chọn phù hợp nhé.' }
    ]
  },
  {
    key: 'service',
    label: 'Dịch vụ / phần mềm',
    items: [
      { question: 'Dịch vụ có những tính năng gì?', answer: 'Dạ {ten_page} chào {ten_khach} ạ! Bạn đang cần tính năng nào (đăng bài, trả lời tin nhắn, quản lý nhiều Fanpage…)? Shop gửi bạn thông tin chi tiết ngay.' },
      { question: 'Bảng giá dịch vụ', answer: 'Dạ bạn cần dùng cho bao nhiêu Fanpage / tài khoản ạ? Shop gửi bảng giá các gói phù hợp cho bạn nhé.' },
      { question: 'Tôi muốn dùng thử', answer: 'Dạ {ten_page} hỗ trợ dùng thử ạ! Bạn để lại số điện thoại hoặc email, nhân viên sẽ gửi tài khoản dùng thử cho bạn.' },
      { question: 'Tôi cần hỗ trợ sử dụng', answer: 'Dạ bạn đang gặp khó khăn ở bước nào ạ? Bạn gửi ảnh chụp màn hình giúp shop, kỹ thuật viên sẽ hướng dẫn ngay.' }
    ]
  }
];

const normalizeText = (text) => String(text || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const graphMessage = (error) => error.response?.data?.error?.message || error.message;

function normalizeConfig(value) {
  const items = Array.isArray(value?.items)
    ? value.items.map((item) => ({ question: String(item?.question || ''), answer: String(item?.answer || '') })).filter((item) => item.question)
    : [];
  return {
    items: items.slice(0, MAX_ITEMS),
    appliedAt: value?.appliedAt || null,
    applyError: value?.applyError || null
  };
}

// Kiểm tra và làm sạch danh sách câu hỏi người dùng gửi lên (bỏ dòng trống, không trùng câu hỏi)
function cleanItems(items) {
  if (!Array.isArray(items)) throw new messenger.MessengerError('Danh sách câu hỏi không hợp lệ.', 400, 'invalid_items');
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const question = String(item?.question || '').trim().replace(/\s+/g, ' ');
    const answer = String(item?.answer || '').trim();
    if (!question) {
      if (answer) throw new messenger.MessengerError('Có câu trả lời nhưng chưa nhập câu hỏi.', 400, 'question_empty');
      continue;
    }
    if (question.length > MAX_QUESTION_LENGTH) throw new messenger.MessengerError(`Câu hỏi tối đa ${MAX_QUESTION_LENGTH} ký tự: “${question.slice(0, 30)}…”.`, 400, 'question_too_long');
    if (answer.length > MAX_ANSWER_LENGTH) throw new messenger.MessengerError(`Câu trả lời tối đa ${MAX_ANSWER_LENGTH} ký tự.`, 400, 'answer_too_long');
    const key = normalizeText(question);
    if (seen.has(key)) throw new messenger.MessengerError(`Câu hỏi bị trùng: “${question}”.`, 400, 'question_duplicate');
    seen.add(key);
    out.push({ question, answer });
  }
  if (out.length > MAX_ITEMS) throw new messenger.MessengerError(`Facebook cho tối đa ${MAX_ITEMS} câu hỏi gợi ý mỗi Fanpage.`, 400, 'too_many_items');
  return out;
}

async function getConfigMap(pageIds) {
  const settings = await getSettings().catch(() => ({}));
  return new Map(pageIds.map((id) => [String(id), normalizeConfig(settings[`${KEY_PREFIX}${id}`])]));
}

async function getPageConfig(pageId) {
  return (await getConfigMap([pageId])).get(String(pageId));
}

// Gửi danh sách câu hỏi lên Messenger của Fanpage (danh sách rỗng = gỡ hết câu hỏi gợi ý)
async function pushToFacebook(pageId, items) {
  const token = await messenger.getPageToken(pageId);
  if (!items.length) {
    await axios.delete(`${GRAPH}/${pageId}/messenger_profile`, { params: { access_token: token }, data: { fields: ['ice_breakers'] }, timeout: 15000 });
    return;
  }
  await axios.post(`${GRAPH}/${pageId}/messenger_profile`, {
    ice_breakers: [{
      locale: 'default',
      call_to_actions: items.map((item, index) => ({ question: item.question, payload: `TOOLFACE_ICE_${index + 1}` }))
    }]
  }, { params: { access_token: token }, timeout: 15000 });
}

function describeApplyError(error) {
  const fb = error.response?.data?.error;
  if (error instanceof messenger.MessengerError) return error.message;
  if (fb?.code === 190) return 'Token Fanpage đã hết hạn — đăng nhập lại Facebook ở trang Kênh.';
  if ([10, 200, 230].includes(fb?.code)) return `Facebook chưa cho phép đổi cài đặt Messenger của Fanpage (thiếu quyền pages_messaging hoặc chưa phải quản trị viên Fanpage): ${fb.message}`;
  return `Facebook từ chối: ${graphMessage(error)}`;
}

// Lưu và áp dụng cùng một bộ câu hỏi cho nhiều Fanpage; mỗi Fanpage báo kết quả riêng
async function saveIceBreakers({ pageIds, items }) {
  const clean = cleanItems(items);
  const results = [];
  for (const pageId of pageIds) {
    const key = `${KEY_PREFIX}${pageId}`;
    try {
      await pushToFacebook(pageId, clean);
      await saveSetting(key, { items: clean, appliedAt: new Date().toISOString(), applyError: null });
      results.push({ pageId: String(pageId), ok: true });
    } catch (error) {
      const message = describeApplyError(error);
      await saveSetting(key, { items: clean, appliedAt: null, applyError: message });
      results.push({ pageId: String(pageId), ok: false, message });
    }
  }
  return { items: clean, results };
}

// Đọc câu hỏi gợi ý đang thật sự hiện trên Messenger (để đối chiếu với cài đặt trong tool)
async function fetchLive(pageId) {
  try {
    const token = await messenger.getPageToken(pageId);
    const response = await axios.get(`${GRAPH}/${pageId}/messenger_profile`, { params: { fields: 'ice_breakers,get_started', access_token: token }, timeout: 15000 });
    const data = response.data?.data?.[0] || {};
    const blocks = Array.isArray(data.ice_breakers) ? data.ice_breakers : [];
    // Định dạng mới: [{ locale, call_to_actions }]; định dạng cũ: [{ question, payload }]
    const block = blocks.find((item) => item.locale === 'default') || blocks[0];
    const actions = block?.call_to_actions || (block?.question ? blocks : []);
    return { ok: true, questions: actions.map((item) => item.question).filter(Boolean), hasGetStarted: Boolean(data.get_started) };
  } catch (error) {
    return { ok: false, message: describeApplyError(error) };
  }
}

// Tin cuối của khách trùng một câu hỏi gợi ý có câu trả lời (gửi sau lúc áp dụng) → câu trả lời đó
function matchAnswer(config, message) {
  if (!config?.appliedAt || !message || message.isFromPage || !message.text || !message.createdTime) return null;
  if (new Date(message.createdTime).getTime() < new Date(config.appliedAt).getTime() - APPLY_CLOCK_SKEW_MS) return null;
  const text = normalizeText(message.text);
  const item = config.items.find((entry) => entry.answer && normalizeText(entry.question) === text);
  return item ? item.answer : null;
}

function hasAnswers(config) {
  return Boolean(config?.appliedAt && config.items.some((item) => item.answer));
}

module.exports = {
  MAX_ANSWER_LENGTH,
  MAX_ITEMS,
  MAX_QUESTION_LENGTH,
  PRESETS,
  cleanItems,
  fetchLive,
  getConfigMap,
  getPageConfig,
  hasAnswers,
  matchAnswer,
  saveIceBreakers
};
