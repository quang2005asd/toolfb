/**
 * ssrfValidator.js
 * Chống Server-Side Request Forgery (SSRF) toàn diện:
 * 1. Chặn IP thập phân/hex/octal
 * 2. Phân giải DNS (DNS Resolution) để lấy IP thật
 * 3. Chặn toàn bộ dải IP Private/Loopback/Link-local/Metadata cả IPv4 và IPv6
 * 4. GHIM IP AN TOÀN VÀO AXIOS AGENT (PINNING IP): Tránh hoàn toàn lỗi DNS Rebinding
 * 5. maxRedirects: 0 chặn chuyển hướng ngầm
 */
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const axios = require('axios');

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // Dạng IP bất thường -> chặn
  }

  const [b0, b1] = parts;
  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private 172.16.0.0 – 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // Multicast (224.0.0.0/4) & Broadcast (255.255.255.255)
  if (b0 >= 224) return true;

  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
  // Unspecified ::
  if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
  // Unique local fc00::/7 (fc00 - fdff)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // Link-local fe80::/10 (fe80 - febf)
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
  // IPv4-mapped IPv6 ::ffff:127.0.0.1
  if (lower.startsWith('::ffff:')) {
    const ipv4 = lower.slice('::ffff:'.length);
    if (net.isIPv4(ipv4)) return isPrivateIPv4(ipv4);
    return true;
  }
  return false;
}

/**
 * Phân giải hostname và kiểm tra tính an toàn của IP
 * @param {string} hostname 
 * @returns {Promise<{ ip: string, family: number }>}
 */
async function resolveAndValidateIp(hostname) {
  // 1. Chặn hostname chuỗi cơ bản
  const blockedHosts = [
    'localhost',
    'metadata.google.internal',
    'instance-data',
    '169.254.169.254'
  ];
  if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Yêu cầu bị chặn do bảo mật mạng nội bộ (SSRF Hostname): ${hostname}`);
  }

  // 2. Chặn các thủ thuật biểu diễn số nguyên/hex/octal
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname) || /^0[0-7]+$/.test(hostname)) {
    throw new Error(`Phát hiện định dạng IP số nguyên/hex/octal bị cấm (SSRF): ${hostname}`);
  }

  // 3. Nếu hostname là IP trực tiếp (IPv4 hoặc IPv6)
  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error(`Truy cập dải IPv4 riêng tư bị từ chối (SSRF): ${hostname}`);
    }
    return { ip: hostname, family: 4 };
  }

  if (net.isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      throw new Error(`Truy cập dải IPv6 riêng tư bị từ chối (SSRF): ${hostname}`);
    }
    return { ip: hostname, family: 6 };
  }

  // 4. DNS Resolution (Chống DNS Rebinding)
  let lookupResult;
  try {
    lookupResult = await dns.lookup(hostname, { all: true });
  } catch (dnsErr) {
    throw new Error(`Không thể phân giải tên miền "${hostname}": ${dnsErr.message}`);
  }

  if (!lookupResult || lookupResult.length === 0) {
    throw new Error(`Tên miền "${hostname}" không có bản ghi DNS hợp lệ.`);
  }

  for (const record of lookupResult) {
    if (record.family === 4 && isPrivateIPv4(record.address)) {
      throw new Error(`Hostname "${hostname}" phân giải về IPv4 nội bộ (${record.address}) - Bị chặn (SSRF).`);
    }
    if (record.family === 6 && isPrivateIPv6(record.address)) {
      throw new Error(`Hostname "${hostname}" phân giải về IPv6 nội bộ (${record.address}) - Bị chặn (SSRF).`);
    }
  }

  return { ip: lookupResult[0].address, family: lookupResult[0].family };
}

/**
 * Tạo HTTP/HTTPS Agent ghim cố định IP đã xác thực (Ghim IP chống DNS Rebinding)
 */
function createPinnedAgent(resolvedIp, family) {
  const customLookup = (hostname, options, callback) => {
    callback(null, resolvedIp, family);
  };
  return {
    httpAgent: new http.Agent({ lookup: customLookup, keepAlive: false }),
    httpsAgent: new https.Agent({ lookup: customLookup, keepAlive: false })
  };
}

/**
 * Xác thực URL media an toàn chống SSRF
 */
async function validateMediaUrlSafe(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('URL media không hợp lệ.');
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(`Cấu trúc URL không hợp lệ: "${url}"`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Giao thức không được hỗ trợ (chỉ chấp nhận http/https): ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  await resolveAndValidateIp(hostname);
  return url.trim();
}

/**
 * Tải an toàn nội dung tệp Media từ URL ngoài với IP ghim cố định và maxRedirects: 0
 */
async function safeFetchMediaBuffer(url, options = {}) {
  const cleanUrl = await validateMediaUrlSafe(url);
  const parsed = new URL(cleanUrl);
  const { ip, family } = await resolveAndValidateIp(parsed.hostname.toLowerCase().trim());
  const { httpAgent, httpsAgent } = createPinnedAgent(ip, family);

  const response = await axios.get(cleanUrl, {
    responseType: 'arraybuffer',
    timeout: options.timeout || 60000,
    maxRedirects: 0,
    httpAgent,
    httpsAgent
  });

  return Buffer.from(response.data);
}

module.exports = {
  validateMediaUrlSafe,
  safeFetchMediaBuffer,
  resolveAndValidateIp,
  createPinnedAgent,
  isPrivateIPv4,
  isPrivateIPv6
};
