/**
 * ReportService.js
 * Số liệu trang Báo cáo kênh (Facebook Page Insights, bộ chỉ số "Lượt xem / Người xem" mới của Meta):
 *   - Lượt xem            page_media_view (theo ngày)
 *   - Trả phí / tự nhiên  page_media_view, breakdown is_from_ads
 *   - Người theo dõi / lạ page_media_view, breakdown is_from_followers
 *   - Người xem           page_total_media_view_unique
 *   - Tương tác           page_post_engagements
 *   - Người theo dõi      page_follows (tổng) và page_daily_follows_unique (mới mỗi ngày)
 * Cần token Fanpage có quyền read_insights + pages_read_engagement.
 * Mỗi lần lấy cả kỳ đang xem và kỳ liền trước (để tính % thay đổi); kết quả mỗi Fanpage được nhớ tạm 30 phút.
 * Chỉ số Facebook không trả (thiếu quyền, Page nhỏ, Meta đổi chỉ số…) được đánh dấu "không có" — không bao giờ tự điền 0.
 */
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');

const CACHE_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
const ALLOWED_DAYS = [7, 14, 30];
const BASE_METRICS = ['page_media_view', 'page_total_media_view_unique', 'page_post_engagements', 'page_follows', 'page_daily_follows_unique'];
const METRIC_KEYS = {
  page_media_view: 'views',
  page_total_media_view_unique: 'viewers',
  page_post_engagements: 'engagements',
  page_follows: 'followers',
  page_daily_follows_unique: 'newFollows'
};
// Chỉ số cộng dồn theo ngày (tổng kỳ = tổng các ngày); followers là số tổng tại mỗi ngày (lấy giá trị ngày cuối)
const SUM_KEYS = ['views', 'viewers', 'engagements', 'newFollows', 'paid', 'organic', 'fromFollowers', 'fromNonFollowers', 'posts'];

const pageCache = new Map(); // `${pageId}:${days}` -> { at, value }

function graphVersion() {
  return process.env.FB_GRAPH_VERSION || 'v19.0';
}

function graphError(error) {
  const fb = error.response?.data?.error;
  return fb ? { code: fb.code || null, message: fb.message || 'Lỗi Facebook' } : { code: null, message: error.message };
}

// Ngày (YYYY-MM-DD) theo giờ Việt Nam
function dayKey(date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

// Facebook ghi end_time = 0 giờ ngày hôm sau theo giờ Thái Bình Dương (vd. 2026-11-02T07:00:00+0000 là số liệu
// ngày 01/11); lùi 12 giờ rồi lấy ngày UTC để ra đúng ngày của số liệu
function valueDay(endTime) {
  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) return null;
  return new Date(end.getTime() - 12 * 3600000).toISOString().slice(0, 10);
}

function buildDays(days, now = new Date()) {
  // Hai kỳ liền nhau: [kỳ trước][kỳ đang xem], kỳ đang xem kết thúc hôm nay
  const list = [];
  for (let index = days * 2 - 1; index >= 0; index -= 1) list.push(dayKey(new Date(now.getTime() - index * DAY_MS)));
  return { all: list, previous: list.slice(0, days), current: list.slice(days) };
}

async function getInsights(pageId, token, metric, sinceSec, untilSec, breakdown = null) {
  const params = { metric, period: 'day', since: sinceSec, until: untilSec, access_token: token };
  if (breakdown) params.breakdown = breakdown;
  const response = await axios.get(`https://graph.facebook.com/${graphVersion()}/${pageId}/insights`, { params, timeout: 25000 });
  return Array.isArray(response.data?.data) ? response.data.data : [];
}

function seriesFrom(item) {
  const map = new Map();
  for (const point of item?.values || []) {
    const day = valueDay(point.end_time);
    const value = Number(point.value);
    if (day && Number.isFinite(value)) map.set(day, (map.get(day) || 0) + value);
  }
  return map;
}

// Giá trị một nhánh của breakdown là "có" (từ quảng cáo / từ người theo dõi) hay "không"
function isYes(label) {
  const text = String(label ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'paid', 'ads', 'follower', 'followers', 'is_from_ads', 'is_from_followers'].includes(text)) return true;
  if (['0', 'false', 'no', 'organic', 'non_follower', 'non_followers', 'not_follower'].includes(text)) return false;
  return null;
}

/**
 * Đọc kết quả breakdown theo nhiều dạng Facebook có thể trả:
 *  A. mỗi điểm: { value: { "1": n, "0": m } } (hoặc "true"/"false")
 *  B. nhiều phần tử data, mỗi phần tử một nhánh: { breakdowns/dimension_values: …, values: [{ value: n }] }
 *  C. total_value.breakdowns[].results[] { dimension_values: ["1"], value } (chỉ có tổng, không có theo ngày)
 * Trả về { yes: Map(ngày→số), no: Map } hoặc { totalYes, totalNo } (dạng C) hoặc null khi không nhận ra.
 */
function parseBreakdown(data) {
  const yes = new Map();
  const no = new Map();
  let recognized = false;
  const add = (map, day, value) => {
    const number = Number(value);
    if (day && Number.isFinite(number)) map.set(day, (map.get(day) || 0) + number);
  };

  for (const item of data) {
    // Dạng C
    const totalBreakdowns = item?.total_value?.breakdowns;
    if (Array.isArray(totalBreakdowns)) {
      let totalYes = 0;
      let totalNo = 0;
      let found = false;
      for (const group of totalBreakdowns) {
        for (const result of group?.results || []) {
          const flag = isYes(Array.isArray(result.dimension_values) ? result.dimension_values[0] : result.dimension_value);
          if (flag === null) continue;
          found = true;
          if (flag) totalYes += Number(result.value) || 0;
          else totalNo += Number(result.value) || 0;
        }
      }
      if (found) return { totalYes, totalNo };
    }

    // Dạng B: nhánh ghi ở cấp phần tử
    const itemLabel = Array.isArray(item?.dimension_values) ? item.dimension_values[0]
      : item?.breakdowns && typeof item.breakdowns === 'object' ? Object.values(item.breakdowns)[0]
        : item?.breakdown_value ?? null;
    const itemFlag = itemLabel === null || itemLabel === undefined ? null : isYes(itemLabel);

    for (const point of item?.values || []) {
      const day = valueDay(point.end_time);
      if (point.value && typeof point.value === 'object') {
        // Dạng A
        for (const [label, value] of Object.entries(point.value)) {
          const flag = isYes(label);
          if (flag === null) continue;
          recognized = true;
          add(flag ? yes : no, day, value);
        }
      } else if (itemFlag !== null) {
        recognized = true;
        add(itemFlag ? yes : no, day, point.value);
      }
    }
  }
  return recognized ? { yes, no } : null;
}

// Lấy số liệu một Fanpage cho 2 kỳ (nhớ tạm 30 phút)
async function loadPage(page, days, { force = false } = {}) {
  const cacheKey = `${page.id}:${days}`;
  const cached = pageCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return { ...cached.value, cached: true };

  const now = new Date();
  const range = buildDays(days, now);
  const sinceSec = Math.floor((now.getTime() - days * 2 * DAY_MS) / 1000);
  const untilSec = Math.floor(now.getTime() / 1000);
  const value = { id: String(page.id), name: page.name, ok: false, error: null, metrics: {}, unavailable: [], fetchedAt: now.toISOString() };

  let token;
  try {
    token = await getFacebookPageAccessToken(page.id);
  } catch (error) {
    value.error = `Không lấy được token Fanpage: ${error.message}`;
    return value;
  }

  // 1. Các chỉ số cơ bản: thử gọi gộp một lần, chỉ số nào lỗi thì gọi riêng từng chỉ số
  const base = {};
  try {
    for (const item of await getInsights(page.id, token, BASE_METRICS.join(','), sinceSec, untilSec)) {
      if (METRIC_KEYS[item.name]) base[METRIC_KEYS[item.name]] = seriesFrom(item);
    }
  } catch (error) {
    const fb = graphError(error);
    if (fb.code === 190) {
      value.error = 'Token Fanpage đã hết hạn — kết nối lại Facebook ở trang Kênh.';
      return value;
    }
    for (const metric of BASE_METRICS) {
      try {
        const data = await getInsights(page.id, token, metric, sinceSec, untilSec);
        const item = data.find((entry) => entry.name === metric) || data[0];
        if (item) base[METRIC_KEYS[metric]] = seriesFrom(item);
      } catch (inner) {
        value.unavailable.push({ metric: METRIC_KEYS[metric], reason: graphError(inner).message });
      }
    }
  }
  for (const key of Object.values(METRIC_KEYS)) {
    if (base[key]) value.metrics[key] = base[key];
    else if (!value.unavailable.some((entry) => entry.metric === key)) value.unavailable.push({ metric: key, reason: 'Facebook không trả số liệu' });
  }

  // 2. Lượt xem tách theo nguồn
  for (const [breakdown, yesKey, noKey] of [['is_from_ads', 'paid', 'organic'], ['is_from_followers', 'fromFollowers', 'fromNonFollowers']]) {
    try {
      const parsed = parseBreakdown(await getInsights(page.id, token, 'page_media_view', sinceSec, untilSec, breakdown));
      if (parsed?.yes) {
        value.metrics[yesKey] = parsed.yes;
        value.metrics[noKey] = parsed.no;
      } else if (parsed && Number.isFinite(parsed.totalYes)) {
        // Chỉ có tổng của khoảng thời gian (không theo ngày)
        value.metrics[`${yesKey}Total`] = parsed.totalYes;
        value.metrics[`${noKey}Total`] = parsed.totalNo;
      } else {
        value.unavailable.push({ metric: yesKey, reason: 'Facebook chưa trả số liệu tách nguồn' });
      }
    } catch (error) {
      value.unavailable.push({ metric: yesKey, reason: graphError(error).message });
    }
  }

  value.ok = Object.keys(value.metrics).length > 0;
  if (!value.ok && !value.error) value.error = value.unavailable[0]?.reason || 'Facebook không trả số liệu cho Fanpage này.';
  value.days = range.all;
  pageCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

// Số bài đã đăng mỗi ngày (theo dữ liệu của tool)
async function loadPostedCounts(pageIds, sinceDate) {
  const counts = new Map();
  if (!pageIds.length) return counts;
  const pool = await getPool();
  const request = pool.request().input('since', sql.DateTime2, sinceDate);
  const names = pageIds.slice(0, 200).map((id, index) => {
    request.input(`p${index}`, sql.VarChar(64), String(id));
    return `@p${index}`;
  });
  const result = await request.query(`
    SELECT published_at FROM Posts
     WHERE status = 'published' AND page_id IN (${names.join(', ')}) AND published_at IS NOT NULL AND published_at >= @since
  `);
  for (const row of result.recordset) {
    const date = new Date(String(row.published_at).replace(' ', 'T'));
    if (!Number.isNaN(date.getTime())) counts.set(dayKey(date), (counts.get(dayKey(date)) || 0) + 1);
  }
  return counts;
}

function sumRange(series, list) {
  return list.reduce((total, day) => total + (series.get(day) || 0), 0);
}

/**
 * Báo cáo tổng hợp cho một hoặc nhiều Fanpage.
 * pages: [{ id, name }] (đã kiểm tra quyền), days: 7 | 14 | 30
 */
async function getOverview(pages, days, { force = false } = {}) {
  const span = ALLOWED_DAYS.includes(Number(days)) ? Number(days) : 14;
  const unique = [...new Map(pages.map((page) => [String(page.id), page])).values()];
  const results = [];
  for (const page of unique) {
    // Gọi lần lượt để không dồn nhiều yêu cầu cùng lúc lên Facebook
    results.push(await loadPage(page, span, { force }).catch((error) => ({ id: String(page.id), name: page.name, ok: false, error: error.message, metrics: {}, unavailable: [] })));
  }

  const range = buildDays(span);
  const keys = ['views', 'viewers', 'engagements', 'newFollows', 'followers', 'paid', 'organic', 'fromFollowers', 'fromNonFollowers'];
  const merged = Object.fromEntries(keys.map((key) => [key, new Map()]));
  const available = Object.fromEntries(keys.map((key) => [key, false]));
  const totalsOnly = { paid: 0, organic: 0, fromFollowers: 0, fromNonFollowers: 0 };
  let hasTotalsOnly = false;
  for (const result of results) {
    for (const key of keys) {
      const series = result.metrics?.[key];
      if (series instanceof Map) {
        available[key] = true;
        for (const [day, value] of series) merged[key].set(day, (merged[key].get(day) || 0) + value);
      }
    }
    for (const key of Object.keys(totalsOnly)) {
      if (Number.isFinite(result.metrics?.[`${key}Total`])) {
        totalsOnly[key] += result.metrics[`${key}Total`];
        hasTotalsOnly = true;
      }
    }
  }

  const sinceDate = new Date(Date.now() - span * 2 * DAY_MS);
  merged.posts = await loadPostedCounts(unique.map((page) => page.id), sinceDate).catch(() => new Map());
  available.posts = true;

  const series = range.current.map((day) => {
    const point = { date: day };
    for (const key of [...keys, 'posts']) point[key] = available[key] ? (merged[key].get(day) ?? 0) : null;
    return point;
  });

  const totals = {};
  const previous = {};
  for (const key of SUM_KEYS) {
    totals[key] = available[key] ? sumRange(merged[key], range.current) : null;
    previous[key] = available[key] ? sumRange(merged[key], range.previous) : null;
  }
  // Người theo dõi: tổng hiện tại = ngày gần nhất có số liệu; kỳ trước = ngày cuối kỳ trước
  const lastValue = (list) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (merged.followers.has(list[index])) return merged.followers.get(list[index]);
    }
    return null;
  };
  totals.followers = available.followers ? lastValue(range.current) : null;
  previous.followers = available.followers ? lastValue(range.previous) : null;
  // Breakdown chỉ có tổng của cả khoảng 2 kỳ: không tách được kỳ trước → chỉ báo tỉ lệ, không báo % thay đổi
  if (hasTotalsOnly) {
    for (const key of Object.keys(totalsOnly)) {
      if (totals[key] === null) {
        totals[key] = totalsOnly[key];
        previous[key] = null;
        available[key] = 'total';
      }
    }
  }

  const fetchedTimes = results.map((result) => new Date(result.fetchedAt || Date.now()).getTime()).filter(Number.isFinite);
  const updatedAt = new Date(fetchedTimes.length ? Math.min(...fetchedTimes) : Date.now());
  return {
    days: span,
    range: { since: range.current[0], until: range.current[range.current.length - 1] },
    updatedAt: updatedAt.toISOString(),
    nextUpdateAt: new Date(updatedAt.getTime() + CACHE_MS).toISOString(),
    pages: results.map((result) => ({ id: result.id, name: result.name, ok: result.ok, error: result.error || null, unavailable: result.unavailable || [] })),
    available,
    series,
    totals,
    previous
  };
}

module.exports = { getOverview, parseBreakdown, ALLOWED_DAYS };
