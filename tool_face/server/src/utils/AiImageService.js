const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSettings } = require('./SettingsService');

const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// ═══ STYLE PRESETS ═══
const STYLE_MODIFIERS = {
  photorealistic: 'photorealistic, professional commercial photography, natural cinematic lighting, highly detailed 8k',
  '3d': '3d digital art, modern 3d render, octane render, smooth vibrant lighting, studio quality',
  cyberpunk: 'futuristic cyberpunk aesthetic, neon glow, holographic highlights, dark cinematic volumetric lights',
  minimalist: 'minimalist clean aesthetic, soft neutral studio background, elegant composition, high end editorial',
  food: 'delicious gourmet food photography, appetizing commercial plating, shallow depth of field, warm cozy lighting',
  lifestyle: 'authentic lifestyle photography, natural daylight, candid social media aesthetic, vibrant and clean',
  sale: 'commercial retail promotion poster background, vibrant modern marketing visual, clean space for text'
};

// Curated high-res fallbacks for various themes
const THEME_FALLBACKS = {
  food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1080&q=80',
  coffee: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1080&q=80',
  fashion: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1080&q=80',
  tech: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1080&q=80',
  sale: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1080&q=80',
  default: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1080&q=80'
};

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9,.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sử dụng LLM để chuyển đổi tiêu đề/nội dung bài viết tiếng Việt thành prompt vẽ ảnh tiếng Anh tối ưu
 */
async function generateVisualPrompt({ title = '', topic = '', content = '', style = 'photorealistic' }) {
  try {
    const settings = await getSettings().catch(() => ({}));
    let apiKey = settings.ai_api_key || process.env.AI_API_KEY;
    let model = settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
    let baseUrl = (settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

    if (apiKey?.startsWith('gsk_')) {
      if (baseUrl.includes('api.openai.com')) baseUrl = 'https://api.groq.com/openai/v1';
      if (model === 'llama-3.3-70b-versatile' || model === 'gpt-4o-mini') model = 'openai/gpt-oss-120b';
    }

    if (!apiKey) {
      return removeVietnameseTones(topic || title || 'modern vibrant visual');
    }

    const systemPrompt = `You are an AI visual art director. Convert the following social media post into a single concise English image generation prompt (max 20 words).
Rules:
- Write ONLY in plain English words (ASCII characters only).
- Focus on subject, lighting, colors.
- Do NOT include text, letters, quotes, or signs.
- Output ONLY the prompt without quotes.`;

    const userText = `Title: ${title}\nTopic: ${topic}\nContent: ${(content || '').slice(0, 200)}`;

    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      temperature: 0.6,
      max_tokens: 60
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000
    });

    const reply = response.data?.choices?.[0]?.message?.content?.trim();
    return reply ? reply.replace(/^["']|["']$/g, '').replace(/[^a-zA-Z0-9,.\s-]/g, '') : removeVietnameseTones(title || topic || 'commercial product photography');
  } catch (err) {
    console.warn('[AiImageService] Không thể sinh visual prompt qua LLM, dùng fallback:', err.message);
    return removeVietnameseTones(topic || title || 'modern commercial photography');
  }
}

/**
 * Sinh ảnh AI từ prompt và lưu vào thư mục uploads
 */
async function generateImage({ prompt, style = 'photorealistic', ratio = '1:1', model = 'flux' }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Vui lòng cung cấp prompt để tạo ảnh.');
  }

  // Tinh gọn prompt tiếng Anh và bỏ dấu tiếng Việt để Pollinations không bị lỗi 500
  const cleanEnglishPrompt = removeVietnameseTones(prompt.trim());
  const styleKeywords = STYLE_MODIFIERS[style] || STYLE_MODIFIERS.photorealistic;
  const fullPrompt = `${cleanEnglishPrompt}, ${styleKeywords}`;
  const seed = Math.floor(Math.random() * 9999999);

  const fileName = `${crypto.randomUUID()}.jpg`;
  const filePath = path.resolve(uploadsDir, fileName);

  let imageBuffer = null;

  // LƯU Ý: Không truyền width & height vì Pollinations API miễn phí yêu cầu trả phí (402) nếu có width/height.
  // Dùng tham số aspect=1:1, 9:16 hoặc 16:9 hoàn toàn miễn phí và không bị lỗi.
  const validAspect = ['1:1', '9:16', '16:9'].includes(ratio) ? ratio : '1:1';

  // ── THỬ NGUỒN 1: Pollinations (Flux / Turbo) ──
  try {
    const encodedPrompt = encodeURIComponent(fullPrompt.slice(0, 180));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?aspect=${validAspect}&nologo=true&seed=${seed}`;
    
    console.log(`[AiImageService] Đang tạo ảnh từ AI: "${fullPrompt.slice(0, 60)}..."`);
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (res.status === 200 && res.data && res.data.length > 5000) {
      imageBuffer = Buffer.from(res.data);
    }
  } catch (pollinationsErr) {
    console.warn('[AiImageService] Pollinations Flux bận/lỗi, thử Pollinations Turbo:', pollinationsErr.message);
  }

  // ── THỬ NGUỒN 2: Pollinations Turbo ──
  if (!imageBuffer) {
    try {
      const shortPrompt = encodeURIComponent(cleanEnglishPrompt.slice(0, 100));
      const turboUrl = `https://image.pollinations.ai/prompt/${shortPrompt}?model=turbo&aspect=${validAspect}&seed=${seed}`;
      const res = await axios.get(turboUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });
      if (res.status === 200 && res.data && res.data.length > 5000) {
        imageBuffer = Buffer.from(res.data);
      }
    } catch (turboErr) {
      console.warn('[AiImageService] Pollinations Turbo bận, kích hoạt kho ảnh HD thông minh:', turboErr.message);
    }
  }

  // ── THỬ NGUỒN 3: Kho ảnh bản quyền chất lượng cao theo chủ đề ──
  if (!imageBuffer) {
    try {
      const lower = fullPrompt.toLowerCase();
      let fallbackPhotoUrl = THEME_FALLBACKS.default;
      if (lower.includes('coffee') || lower.includes('cafe')) fallbackPhotoUrl = THEME_FALLBACKS.coffee;
      else if (lower.includes('food') || lower.includes('dish') || lower.includes('eat') || lower.includes('restaurant')) fallbackPhotoUrl = THEME_FALLBACKS.food;
      else if (lower.includes('fashion') || lower.includes('cloth') || lower.includes('wear')) fallbackPhotoUrl = THEME_FALLBACKS.fashion;
      else if (lower.includes('tech') || lower.includes('phone') || lower.includes('digital') || lower.includes('ai')) fallbackPhotoUrl = THEME_FALLBACKS.tech;
      else if (lower.includes('sale') || lower.includes('shop') || lower.includes('discount')) fallbackPhotoUrl = THEME_FALLBACKS.sale;

      const fbRes = await axios.get(fallbackPhotoUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });
      if (fbRes.status === 200 && fbRes.data) {
        imageBuffer = Buffer.from(fbRes.data);
      }
    } catch (fallbackErr) {
      console.error('[AiImageService] Lỗi fallback:', fallbackErr.message);
      throw new Error('Không thể kết nối đến máy chủ tạo ảnh AI. Vui lòng thử lại sau giây lát!');
    }
  }

  // Ghi tệp vào thư mục uploads
  await fs.promises.writeFile(filePath, imageBuffer);

  const serverOrigin = process.env.BACKEND_URL || 'http://localhost:5000';

  return {
    success: true,
    fileName,
    mediaLink: `local://${fileName}`,
    previewUrl: `${serverOrigin}/api/media/${fileName}`,
    fullUrl: `${serverOrigin}/api/media/${fileName}`,
    mediaType: 'image',
    prompt: fullPrompt,
    ratio: validAspect,
    style
  };
}

module.exports = {
  STYLE_MODIFIERS,
  generateVisualPrompt,
  generateImage
};
