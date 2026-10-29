/**
 * ContentValidator.js
 * Bộ xác thực nội dung tất định (Deterministic Rule Engine) kiểm tra theo Nền tảng MXH và Nhóm ngành.
 * Nạp trực tiếp từ file cấu hình: server/src/rules/content-rules.json
 */

const fs = require('fs');
const path = require('path');

// Nạp file cấu hình rules
const RULES_PATH = path.resolve(__dirname, '../rules/content-rules.json');
let contentRules = {};

function loadRules() {
  try {
    if (fs.existsSync(RULES_PATH)) {
      contentRules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[ContentValidator] Lỗi nạp rules từ JSON:', err.message);
  }
}

// Khởi tạo nạp rules ngay khi load module
loadRules();

function removeAccents(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Trích xuất hashtags từ văn bản
 */
function extractHashtags(text = '') {
  const matches = text.match(/#[a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]+/g) || [];
  return matches.map(t => t.trim());
}

/**
 * Kiểm tra xem có chứa URL hay không
 */
function extractUrls(text = '') {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  return text.match(urlRegex) || [];
}

/**
 * Hàm xác thực toàn diện: Nền tảng (Platform) + Ngành nghề (Industry)
 * @param {object} params
 * @param {string} params.title Tiêu đề bài viết
 * @param {string} params.content Nội dung bài viết
 * @param {string} [params.platform='facebook'] Nền tảng đích (facebook, instagram, tiktok, threads, linkedin)
 * @param {string} [params.industryKey='general'] Nhóm ngành (health, mom_and_baby, finance, real_estate, legal, beauty, general)
 */
function validateContent({
  title = '',
  content = '',
  platform = 'facebook',
  industryKey = 'general'
} = {}) {
  // Đảm bảo rules đã được nạp
  if (!contentRules.platforms) {
    loadRules();
  }

  const errors = [];
  const warnings = [];
  let score = 100;

  const fullText = `${title}\n${content}`.trim();
  const fullTextNormalized = removeAccents(fullText);
  const charCount = fullText.length;
  const hashtags = extractHashtags(fullText);
  const urls = extractUrls(fullText);

  // ─────────────────────────────────────────────────────────────
  // 1. KIỂM THỬ THEO NỀN TẢNG (PLATFORM VALIDATION)
  // ─────────────────────────────────────────────────────────────
  const normPlatform = (platform || 'facebook').toLowerCase();
  const platRule = contentRules.platforms?.[normPlatform] || contentRules.platforms?.['facebook'];

  if (platRule) {
    // 1.1 Kiểm tra độ dài tối đa (Max length)
    if (charCount > platRule.maxLength) {
      errors.push({
        code: 'PLATFORM_MAX_LENGTH_EXCEEDED',
        severity: 'CRITICAL',
        message: `Độ dài bài viết (${charCount} ký tự) vượt quá giới hạn tối đa của ${platRule.name} (${platRule.maxLength} ký tự).`
      });
      score -= 30;
    } else if (platRule.recommendedMaxLength && charCount > platRule.recommendedMaxLength) {
      warnings.push({
        code: 'PLATFORM_LENGTH_SUBOPTIMAL',
        severity: 'WARNING',
        message: `Bài viết dài ${charCount} ký tự. Khuyến nghị cho ${platRule.name} là dưới ${platRule.recommendedMaxLength} ký tự để tối ưu giữ chân người xem.`
      });
      score -= 5;
    }

    if (platRule.recommendedMinLength && charCount < platRule.recommendedMinLength) {
      warnings.push({
        code: 'PLATFORM_TOO_SHORT',
        severity: 'WARNING',
        message: `Bài viết khá ngắn (${charCount} ký tự), khuyến nghị tối thiểu ${platRule.recommendedMinLength} ký tự.`
      });
      score -= 5;
    }

    // 1.2 Kiểm tra số lượng Hashtags
    if (platRule.maxHashtags !== undefined && hashtags.length > platRule.maxHashtags) {
      warnings.push({
        code: 'PLATFORM_TOO_MANY_HASHTAGS',
        severity: 'WARNING',
        message: `Bài viết có ${hashtags.length} hashtags. Khuyến nghị cho ${platRule.name} không quá ${platRule.maxHashtags} hashtags để tránh bị thuật toán giảm tương tác.`
      });
      score -= 5;
    }
    if (platRule.minHashtags !== undefined && hashtags.length < platRule.minHashtags) {
      warnings.push({
        code: 'PLATFORM_FEW_HASHTAGS',
        severity: 'WARNING',
        message: `${platRule.name} yêu cầu tối thiểu ${platRule.minHashtags} hashtags (hiện có: ${hashtags.length}).`
      });
      score -= 5;
    }

    // 1.3 Kiểm tra Markdown rác / dấu sao (*)
    if (platRule.disallowMarkdownAsterisks) {
      const hasAsterisks = /\*{1,3}[^*]+\*{1,3}|\*/.test(fullText);
      if (hasAsterisks) {
        errors.push({
          code: 'MARKDOWN_ASTERISKS_FORBIDDEN',
          severity: 'HIGH',
          message: `${platRule.name} không hỗ trợ định dạng Markdown (* hoặc **). Ký tự sẽ hiển thị thô gây xấu giao diện.`
        });
        score -= 15;
      }
    }

    // 1.4 Kiểm tra Link ngoài trong thân bài
    if (urls.length > 0 && platRule.linkInBodyWarning) {
      warnings.push({
        code: 'LINK_IN_BODY_WARNING',
        severity: 'ADVICE',
        message: platRule.linkInBodyWarning
      });
      score -= 5;
    }

    // 1.5 Kiểm tra quy tắc CTA cấm
    if (platRule.ctaRules?.disallowedPatterns?.length) {
      for (const pat of platRule.ctaRules.disallowedPatterns) {
        const regex = new RegExp(pat, 'i');
        if (regex.test(fullTextNormalized)) {
          warnings.push({
            code: 'POOR_CTA_PATTERN',
            severity: 'ADVICE',
            message: platRule.ctaRules.warningMessage || 'Tránh dùng câu hỏi tu từ chung chung nhạt nhẽo làm CTA.'
          });
          score -= 5;
          break;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. TỪ CẤM TOÀN CẦU (GLOBAL FORBIDDEN PHRASES)
  // ─────────────────────────────────────────────────────────────
  const globalPhrases = contentRules.globalForbiddenPhrases || [];
  for (const phrase of globalPhrases) {
    const kwNorm = removeAccents(phrase);
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(kwNorm)}([^a-z0-9]|$)`, 'i');
    if (pattern.test(fullTextNormalized)) {
      errors.push({
        code: 'GLOBAL_FORBIDDEN_PHRASE',
        severity: 'CRITICAL',
        message: `Phát hiện từ khóa/cụm từ cấm nghiêm trọng: "${phrase}".`
      });
      score -= 40;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. KIỂM THỬ THEO NHÓM NGÀNH (INDUSTRY VALIDATION)
  // ─────────────────────────────────────────────────────────────
  const normIndustry = (industryKey || 'general').toLowerCase();
  const indRule = contentRules.industries?.[normIndustry] || contentRules.industries?.['general'];

  if (indRule) {
    // 3.1 Cam kết cấm / Phóng đại (Forbidden Claims)
    if (indRule.forbiddenClaims?.length) {
      for (const claim of indRule.forbiddenClaims) {
        const claimNorm = removeAccents(claim);
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(claimNorm)}([^a-z0-9]|$)`, 'i');
        if (pattern.test(fullTextNormalized)) {
          errors.push({
            code: 'FORBIDDEN_INDUSTRY_CLAIM',
            severity: 'CRITICAL',
            message: `[${indRule.name}] Vi phạm cam kết cấm/phóng đại: "${claim}".`
          });
          score -= 25;
        }
      }
    }

    // 3.2 Hoạt chất / Dược phẩm cấm (Forbidden Substances)
    if (indRule.forbiddenSubstancesOrPrescriptions?.length) {
      for (const sub of indRule.forbiddenSubstancesOrPrescriptions) {
        const subNorm = removeAccents(sub);
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(subNorm)}([^a-z0-9]|$)`, 'i');
        if (pattern.test(fullTextNormalized)) {
          errors.push({
            code: 'FORBIDDEN_SUBSTANCE',
            severity: 'CRITICAL',
            message: `[${indRule.name}] Nội dung đề cập chất hoặc dịch vụ bị cấm/siết chặt: "${sub}".`
          });
          score -= 35;
        }
      }
    }

    // 3.3 Miễn trừ trách nhiệm bắt buộc (Required Disclaimers)
    if (indRule.requiredDisclaimers?.length) {
      for (const disc of indRule.requiredDisclaimers) {
        // Kiểm tra xem bài viết có chứa từ kích hoạt điều kiện hay không
        let isTriggered = false;
        for (const kw of disc.keywordsTrigger) {
          const kwNorm = removeAccents(kw);
          const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(kwNorm)}([^a-z0-9]|$)`, 'i');
          if (pattern.test(fullTextNormalized)) {
            isTriggered = true;
            break;
          }
        }

        if (isTriggered) {
          const requiredTextNorm = removeAccents(disc.textMustContain);
          if (!fullTextNormalized.includes(requiredTextNorm)) {
            if (disc.severity === 'CRITICAL') {
              errors.push({
                code: 'MISSING_REQUIRED_DISCLAIMER',
                severity: 'CRITICAL',
                message: disc.errorMessage
              });
              score -= 25;
            } else {
              warnings.push({
                code: 'RECOMMENDED_DISCLAIMER_MISSING',
                severity: 'WARNING',
                message: disc.errorMessage
              });
              score -= 10;
            }
          }
        }
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    isValid: errors.length === 0,
    score,
    errors,
    warnings,
    platformSummary: {
      platform: platRule?.name || platform,
      charCount,
      hashtagCount: hashtags.length,
      hashtags,
      urlCount: urls.length,
      urls
    },
    industrySummary: {
      industryKey: indRule?.key || industryKey,
      industryName: indRule?.name || industryKey,
      sensitivity: indRule?.sensitivity || 'LOW',
      requiresManualReview: Boolean(indRule?.requiresManualReview)
    }
  };
}

module.exports = {
  validateContent,
  loadRules,
  getContentRules: () => contentRules
};
