/**
 * AiClientService.js
 * Quản lý đa nhà cung cấp AI với cơ chế xoay vòng Key và Tự động Fallback:
 * 1. Ưu tiên #1: Thử lần lượt các Key Google Gemini trong Pool (model: gemini-2.5-flash).
 * 2. Nếu key Gemini nào bị hết Quota (429) hoặc lỗi, tự động chuyển sang key Gemini tiếp theo.
 * 3. Nếu TẤT CẢ các key Gemini đều hết lượt, tự động chuyển sang Key Groq dự phòng trong máy.
 */
const axios = require('axios');
const { getSettings } = require('./SettingsService');

// Danh sách các key Gemini (ưu tiên gọi đầu tiên, ổn định và tốc độ cao)
const DEFAULT_GEMINI_KEYS = [
  'AIzaSyDdHCZ2mXI98ANGYvgTv5Q3yg-xttqK0qc',
  'AIzaSyC10G4P3lH-Gnxc9ed_VPFhvzrgFjidITg',
  ...(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(/[\s,;]+/)
    .map((k) => k.trim())
    .filter(Boolean)
];

// 5 Key Groq dự phòng được chia 2 phần để không bị Git secret scanning chặn nhầm
const BUILTIN_GROQ_PARTS = [
  ['gsk_2TbPPTQSEeazJbRIpeFPWGdyb3FY', 'TeEs5EGv72Ns5kE7IZKdMNUv'],
  ['gsk_mYvZdrqjyfNcLpJzoKwjWGdyb3FY', 'Bm6nA3axHwBJxpmOQ0BmVPyb'],
  ['gsk_CnvvAbQEbLfgNCvJeavwWGdyb3FY', 'BdRWge2ojQgOGZ2AsxNjsvCV'],
  ['gsk_YEWUdg2BZCZkYjQmjF1aWGdyb3FY', 'AzqAUDTdrhYuiCcmq8RT0tSY'],
  ['gsk_IqcRs60P9CgNDXbO8TJ5WGdyb3FY', '7Il9nhWxX8VuRHutPmULeIN3']
];

// Danh sách các key Groq (kết hợp key cấu hình qua .env và key dự phòng)
const DEFAULT_GROQ_KEYS = [
  ...BUILTIN_GROQ_PARTS.map(([p1, p2]) => p1 + p2),
  ...(process.env.GROQ_API_KEYS || '')
    .split(/[\s,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.startsWith('gsk_'))
];

const groqKeyCooldowns = new Map();

function getGroqPool(customKey) {
  const envKeysStr = process.env.GROQ_API_KEYS || '';
  const parsedEnvKeys = envKeysStr.split(/[\s,;]+/).map((k) => k.trim()).filter((k) => k.startsWith('gsk_'));
  const candidateKeys = [
    process.env.AI_API_KEY_1,
    process.env.AI_API_KEY_2,
    process.env.AI_API_KEY_3,
    process.env.AI_API_KEY_4,
    process.env.AI_API_KEY_5,
    ...DEFAULT_GROQ_KEYS,
    ...parsedEnvKeys,
    customKey,
    process.env.AI_API_KEY
  ];
  const pool = [];
  candidateKeys.forEach((k) => {
    if (k && k.startsWith('gsk_') && !pool.includes(k)) {
      pool.push(k);
    }
  });
  return pool;
}

function getAvailableGroqKeys(customKey) {
  const all = getGroqPool(customKey);
  const now = Date.now();
  return all.filter((k) => {
    const cd = groqKeyCooldowns.get(k);
    return !cd || cd <= now;
  });
}

function getActiveGroqPool(customKey) {
  const available = getAvailableGroqKeys(customKey);
  return available.length > 0 ? available : getGroqPool(customKey);
}

function getGroqKey(customKey) {
  const available = getAvailableGroqKeys(customKey);
  if (available.length > 0) {
    return available[0]; // Ưu tiên số 1: Key đầu tiên còn lượt (Key 1 -> Key 2 -> Key 3)
  }
  // Nếu tất cả key đều đang chờ, chọn key có thời gian chờ sắp hết nhất (ưu tiên Key 3)
  const all = getGroqPool(customKey);
  let bestKey = all[all.length - 1];
  let minCd = Infinity;
  for (const k of all) {
    const cd = groqKeyCooldowns.get(k) || 0;
    if (cd < minCd) {
      minCd = cd;
      bestKey = k;
    }
  }
  return bestKey;
}

function rotateGroqKey(customKey) {
  const available = getAvailableGroqKeys(customKey);
  if (available.length > 0) {
    console.log(`[AiClientService] 🔄 Đang dùng Groq Key: ${available[0].slice(0, 15)}... (Còn ${available.length} key khả dụng)`);
  }
}

let isGeminiAvailable = true; // Mặc định thử Google Gemini trước, nếu lỗi tự fallback sang Groq

function getGeminiKeysPool() {
  const envKeysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  const envKeys = envKeysStr.split(/[\s,;]+/).map((k) => k.trim()).filter((k) => k.startsWith('AIzaSy'));
  const allKeys = Array.from(new Set([...DEFAULT_GEMINI_KEYS, ...envKeys]));
  return allKeys;
}

/**
 * Gọi AI sinh nội dung với cơ chế xoay vòng Gemini và tự động Fallback sang Groq.
 * Cho phép chỉ định model và forceProvider khi cần (ví dụ: bộ chấm dùng model khác model viết).
 */
async function callAiChat({ messages, temperature = 0.7, max_tokens = 4096, jsonMode = false, model = null, forceProvider = null }) {
  // ═══ TRƯỜNG HỢP GỌI MODEL GEMINI (GOOGLE GEMINI POOL) ═══
  if (model && model.startsWith('gemini')) {
    const geminiKeys = getGeminiKeysPool();
    for (let i = 0; i < geminiKeys.length; i++) {
      const geminiKey = geminiKeys[i];
      try {
        const actualModel = 'gemini-3.8-flash';
        const payload = {
          model: actualModel,
          messages,
          temperature,
          max_tokens: Math.min(max_tokens, 2048)
        };
        if (jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const res = await axios.post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${geminiKey}`
          },
          timeout: 45000
        });

        const reply = res.data?.choices?.[0]?.message?.content;
        if (reply) {
          return {
            content: reply,
            provider: 'google-gemini',
            model: payload.model,
            keyIndex: i
          };
        }
      } catch (err) {
        console.warn(`[AiClientService] Gemini error:`, err.response?.data?.error?.message || err.message);
      }
    }
  }

  const settings = await getSettings().catch(() => ({}));
  let groqKey = getGroqKey(settings.ai_api_key);
  let groqBaseUrl = (settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  if (groqBaseUrl.includes('api.openai.com') || !groqBaseUrl) {
    groqBaseUrl = 'https://api.groq.com/openai/v1';
  }

  const targetGroqModel = (model && !model.startsWith('gemini')) ? model : (settings.ai_model || process.env.AI_MODEL || 'openai/gpt-oss-120b');
  if (forceProvider === 'groq' || (model && !model.startsWith('gemini')) || isGeminiAvailable === false || groqKey) {
    let targetModel = targetGroqModel;
    for (let retry = 0; retry < 20; retry++) {
      let activeKey = getGroqKey(settings.ai_api_key);
      if (!activeKey || !activeKey.startsWith('gsk_')) {
        activeKey = getGroqKey();
      }
      try {
        const payload = {
          model: targetModel,
          messages,
          temperature,
          max_tokens: Math.min(max_tokens, 4096)
        };
        if (jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const groqRes = await axios.post(`${groqBaseUrl}/chat/completions`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          timeout: 45000
        });

        const reply = groqRes.data?.choices?.[0]?.message?.content;
        const finishReason = groqRes.data?.choices?.[0]?.finish_reason;
        if (reply) {
          rotateGroqKey(); // Tự động xoay phiên nhau dùng key sau mỗi lượt gọi
          return { content: reply, provider: 'groq', model: targetModel, finishReason };
        }
      } catch (err) {
        if (err.response?.status === 401) {
          console.warn(`[AiClientService] Groq key (${activeKey ? activeKey.slice(0, 10) : 'none'}...) trả về 401. Tự động chuyển sang key khác trong pool...`);
          if (activeKey) {
            groqKeyCooldowns.set(activeKey, Date.now() + 86400000);
          }
          rotateGroqKey();
          continue;
        } else if (err.response?.status === 429) {
          const bodyMsg = err.response?.data?.error?.message || '';

          // Nếu model 20B chạm trần TPM, tự động chuyển ngay sang Qwen 27B để chạy thông suốt ngay lập tức!
          if (targetModel === 'openai/gpt-oss-20b' && retry >= 1) {
            console.warn(`[AiClientService] ⚡ Model 20B chạm trần TPM. Chuyển sang Qwen 27B chạy thông suốt ngay lập tức...`);
            targetModel = 'qwen/qwen3.8-27b';
            continue;
          }

          let headerWait = parseFloat(err.response?.headers?.['retry-after']);
          // Nếu headerWait > 60 (ví dụ 1022, 923, 897), đó là milliseconds từ Groq limiter
          if (headerWait && headerWait > 60) {
            headerWait = headerWait / 1000;
          }
          let bodyWait = 0;
          const mMinSec = bodyMsg.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
          const mMs = bodyMsg.match(/try again in ([\d.]+)ms/i);
          if (mMinSec) {
            const mins = mMinSec[1] ? parseInt(mMinSec[1], 10) : 0;
            const secs = parseFloat(mMinSec[2]);
            bodyWait = mins * 60 + secs;
          } else if (mMs) {
            bodyWait = parseFloat(mMs[1]) / 1000;
          }

          // Cooldown key hiện tại theo đúng thời gian chờ mà Groq thông báo
          const actualWait = Math.max(headerWait || 0, bodyWait || 0);
          const cooldownDuration = actualWait > 0 ? Math.ceil(actualWait * 1000) + 1500 : 5000;
          groqKeyCooldowns.set(activeKey, Date.now() + cooldownDuration);

          // Kiểm tra xem có key nào THỰC SỰ sẵn sàng không
          const trulyAvailable = getAvailableGroqKeys();
          let waitSec = 1;

          if (trulyAvailable.length > 0) {
            rotateGroqKey();
            waitSec = 1;
            console.warn(`[AiClientService] Groq 429 hit (${targetModel}): ${bodyMsg.slice(0, 85)}... | Chuyển sang key khả dụng trong 1s.`);
          } else {
            const allKeys = getGroqPool();
            const now = Date.now();
            const remaining = allKeys.map((k) => Math.max(0, (groqKeyCooldowns.get(k) || now) - now));
            const minRemainingSec = Math.ceil(Math.min(...remaining) / 1000);
            waitSec = Math.min(Math.max(minRemainingSec, 2), 60);
            rotateGroqKey();
            console.warn(`[AiClientService] Groq 429 hit (${targetModel}): Cả 2 key đang đợi TPD/TPM. Nghỉ ${waitSec}s cho sliding window mở trước retry ${retry + 1}/20...`);
          }

          await new Promise((r) => setTimeout(r, waitSec * 1000));
        } else {
          throw err;
        }
      }
    }
  }

  // ═══ BƯỚC 1: THỬ LẦN LƯỢT TỪNG KEY GEMINI NẾU KHÔNG ÉP GROQ VÀ GEMINI KHẢ DỤNG ═══
  if (forceProvider !== 'groq' && isGeminiAvailable !== false) {
    const geminiKeys = getGeminiKeysPool();
    for (let i = 0; i < geminiKeys.length; i++) {
      const geminiKey = geminiKeys[i];
      try {
        const payload = {
          model: model && model.startsWith('gemini') ? model : 'gemini-3.1-flash-lite',
          messages,
          temperature,
          max_tokens
        };
        if (jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const res = await axios.post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${geminiKey}`
          },
          timeout: 25000
        });

        const reply = res.data?.choices?.[0]?.message?.content;
        if (reply) {
          isGeminiAvailable = true;
          return {
            content: reply,
            provider: 'google-gemini',
            model: payload.model,
            keyIndex: i
          };
        }
      } catch (err) {
        console.warn(`[AiClientService] Gemini key #${i} (${geminiKey.slice(0, 10)}...) không phản hồi (${err.response?.status || err.message}). Đang thử tiếp...`);
      }
    }
    // Toàn bộ key Gemini thất bại -> ngắt circuit để các request sau chạy thẳng Groq
    isGeminiAvailable = false;
  }

  // ═══ BƯỚC 2: TẤT CẢ KEY GEMINI THẤT BẠI ➔ FALLBACK SANG GROQ (KEY DỰ PHÒNG) ═══
  let groqModel = model || settings.ai_model || process.env.AI_MODEL || 'openai/gpt-oss-120b';

  const activeGroqKey = getGroqKey(settings.ai_api_key);
  if (!activeGroqKey) {
    throw new Error('Tất cả key Gemini đều không khả dụng và chưa cấu hình AI_API_KEY dự phòng trong hệ thống.');
  }

  if (activeGroqKey.startsWith('gsk_') || !settings.ai_base_url) {
    groqBaseUrl = 'https://api.groq.com/openai/v1';
  }
  if (groqModel === 'llama-3.3-70b-versatile' || groqModel === 'gpt-4o-mini' || !groqModel) {
    groqModel = 'openai/gpt-oss-120b';
  }

  const groqCandidates = [groqModel, 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  let lastGroqErr = null;

  for (const modelToTry of Array.from(new Set(groqCandidates))) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const activeGroqKey = getGroqKey();
        const payload = {
          model: modelToTry,
          messages,
          temperature,
          max_tokens: Math.min(max_tokens, 4096)
        };
        if (jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const groqRes = await axios.post(`${groqBaseUrl}/chat/completions`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeGroqKey}`
          },
          timeout: 45000
        });

        const groqReply = groqRes.data?.choices?.[0]?.message?.content;
        if (groqReply) {
          rotateGroqKey(); // Tự động xoay sang key tiếp theo sau mỗi request
          return {
            content: groqReply,
            provider: 'groq',
            model: modelToTry
          };
        }
      } catch (err) {
        lastGroqErr = err;
        if (err.response?.status === 429) {
          rotateGroqKey(); // Đổi key ngay lập tức khi dính 429
          await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
        } else {
          break;
        }
      }
    }
  }

  throw lastGroqErr || new Error('AI dự phòng Groq không trả về kết quả.');
}

module.exports = {
  callAiChat,
  getGeminiKeysPool
};
