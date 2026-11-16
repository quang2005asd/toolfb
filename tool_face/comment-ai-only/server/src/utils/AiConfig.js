const { getSettings } = require('./SettingsService');

async function getAiConfig() {
  const settings = await getSettings().catch((error) => {
    console.warn('[AI Settings] Không đọc được cấu hình trong database:', error.message);
    return {};
  });
  let apiKey = settings.ai_api_key || process.env.AI_API_KEY;
  let model = settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
  let baseUrl = (settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  if (apiKey?.startsWith('gsk_')) {
    if (baseUrl.includes('api.openai.com')) baseUrl = 'https://api.groq.com/openai/v1';
    if (model === 'llama-3.3-70b-versatile' || model === 'gpt-4o-mini') model = 'openai/gpt-oss-120b';
  }

  return { apiKey, model, baseUrl };
}

module.exports = { getAiConfig };
