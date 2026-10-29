/**
 * Đổi SESSION_SECRET mà không mất token Facebook / App Secret đã lưu:
 * quét mọi cột chứa giá trị mã hóa "v1.<salt>.<iv>.<tag>.<data>", giải mã bằng khóa cũ rồi mã hóa lại bằng khóa mới.
 * Chạy khi server và worker ĐANG DỪNG:
 *   OLD_SESSION_SECRET=<khóa cũ> SESSION_SECRET=<khóa mới> node scripts/rotate-session-secret.js
 */
const crypto = require('crypto');
const path = require('path');
const sqlite3 = require('sqlite3');

const OLD = process.env.OLD_SESSION_SECRET || '';
const NEW = process.env.SESSION_SECRET || '';
if (OLD.length < 32 || NEW.length < 32 || OLD === NEW) {
  console.error('Cần OLD_SESSION_SECRET và SESSION_SECRET (mỗi khóa ≥ 32 ký tự, khác nhau).');
  process.exit(1);
}

const dbFile = path.join(process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data'), 'tool_face.sqlite');
const ENCRYPTED = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function decrypt(value, secret) {
  try {
    const [, saltValue, ivValue, tagValue, dataValue] = value.split('.');
    const salt = Buffer.from(saltValue, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(secret, salt, 32), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataValue, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Cùng định dạng với encryptToken trong src/utils/FacebookPageConnections.js
function encrypt(text, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(secret, salt, 32), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return ['v1', salt, iv, cipher.getAuthTag(), data].map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part)).join('.');
}

const db = new sqlite3.Database(dbFile);
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

(async () => {
  const report = [];
  let failed = 0;
  await run('BEGIN');
  try {
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    for (const { name: table } of tables) {
      const columns = (await all(`PRAGMA table_info("${table}")`)).map((col) => col.name);
      for (const column of columns) {
        const rows = await all(`SELECT rowid AS rid, "${column}" AS value FROM "${table}" WHERE typeof("${column}")='text' AND "${column}" LIKE 'v1.%'`);
        let rotated = 0;
        let already = 0;
        for (const row of rows) {
          if (!ENCRYPTED.test(row.value)) continue;
          const plain = decrypt(row.value, OLD);
          if (plain === null) {
            if (decrypt(row.value, NEW) !== null) already += 1; else failed += 1;
            continue;
          }
          await run(`UPDATE "${table}" SET "${column}" = ? WHERE rowid = ?`, [encrypt(plain, NEW), row.rid]);
          rotated += 1;
        }
        if (rotated || already) report.push(`${table}.${column}: mã hóa lại ${rotated}${already ? `, đã dùng khóa mới ${already}` : ''}`);
      }
    }
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK').catch(() => {});
    console.error('Lỗi, đã hoàn tác:', error.message);
    process.exit(1);
  }
  report.forEach((line) => console.log(line));
  console.log(failed ? `${failed} giá trị không giải mã được bằng khóa cũ (giữ nguyên).` : 'Không có giá trị lỗi.');
  db.close();
})();
