/**
 * KbFactsService.js
 * Quản trị Knowledge Base Loại 3: Facts của khách hàng / sản phẩm.
 * - Cách ly khách hàng nghiêm ngặt qua bảng UserCustomers.
 * - Lọc UTC tức thời + job dọn RETIRED định kỳ chống lọt facts quá hạn.
 * - Sửa fact đã CONFIRMED bắt buộc quay về DRAFT, xóa người duyệt, và ghi Audit Log.
 * - Chặn tự duyệt (Người tạo không được tự phê duyệt chính mình).
 */

const { sql, getPool } = require('../../config/db');

let schemaReady = null;

async function ensureKbFactsSchema() {
  if (!schemaReady) {
    schemaReady = getPool().then(async (pool) => {
      if (process.env.USE_SQLITE === 'true') {
        // ── 1. Bảng KbFacts (SQLite) ──
        await pool.request().query(`
          CREATE TABLE IF NOT EXISTS KbFacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            fact_type TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            expires_at TEXT,
            created_by TEXT,
            confirmed_by TEXT,
            confirmed_at TEXT,
            updated_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          );
        `);
        // Bảng KbFacts tạo từ bản cũ chưa có cột updated_by (SQLite không có IF NOT EXISTS cho cột)
        const updatedBy = await pool.request().query("SELECT name FROM pragma_table_info('KbFacts') WHERE name = 'updated_by'");
        if (!updatedBy.recordset.length) await pool.request().query('ALTER TABLE KbFacts ADD COLUMN updated_by TEXT');

        // ── 2. Bảng UserCustomers (Cách ly khách hàng) ──
        await pool.request().query(`
          CREATE TABLE IF NOT EXISTS UserCustomers (
            user_id TEXT NOT NULL,
            customer_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, customer_id)
          );
        `);

        // ── 3. Bảng KbFactsAuditLog (Lịch sử truy vết sửa đổi) ──
        await pool.request().query(`
          CREATE TABLE IF NOT EXISTS KbFactsAuditLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fact_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_role TEXT,
            old_values TEXT,
            new_values TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS PostFactsAuditLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT NOT NULL,
            customer_id TEXT,
            fact_id INTEGER NOT NULL,
            fact_content TEXT NOT NULL,
            fact_source TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );
        `);
      } else {
        // ── 1. Bảng KbFacts (MSSQL) ──
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.KbFacts', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.KbFacts (
              id INT IDENTITY(1,1) PRIMARY KEY,
              customer_id VARCHAR(64) NOT NULL,
              fact_type NVARCHAR(50) NOT NULL,
              content NVARCHAR(MAX) NOT NULL,
              source NVARCHAR(500) NULL,
              status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
              expires_at DATETIME2 NULL,
              created_by VARCHAR(64) NULL,
              updated_by VARCHAR(64) NULL,
              confirmed_by VARCHAR(64) NULL,
              confirmed_at DATETIME2 NULL,
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
              updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_KbFacts_customer_status ON dbo.KbFacts (customer_id, status);
            CREATE INDEX IX_KbFacts_expires_at ON dbo.KbFacts (expires_at);
          END;

          -- Thêm cột created_by & updated_by nếu bảng đã tạo từ trước
          IF COL_LENGTH('dbo.KbFacts', 'created_by') IS NULL
            ALTER TABLE dbo.KbFacts ADD created_by VARCHAR(64) NULL;
          IF COL_LENGTH('dbo.KbFacts', 'updated_by') IS NULL
            ALTER TABLE dbo.KbFacts ADD updated_by VARCHAR(64) NULL;
        `);

        // ── 2. Bảng UserCustomers (Phân quyền cách ly khách hàng) ──
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.UserCustomers', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.UserCustomers (
              user_id VARCHAR(64) NOT NULL,
              customer_id VARCHAR(64) NOT NULL,
              role VARCHAR(30) NOT NULL DEFAULT 'member',
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
              PRIMARY KEY (user_id, customer_id)
            );
            CREATE INDEX IX_UserCustomers_user ON dbo.UserCustomers (user_id);
            CREATE INDEX IX_UserCustomers_customer ON dbo.UserCustomers (customer_id);
          END;
        `);

        // ── 3. Bảng KbFactsAuditLog (Ghi log kiểm toán sửa đổi) ──
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.KbFactsAuditLog', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.KbFactsAuditLog (
              id INT IDENTITY(1,1) PRIMARY KEY,
              fact_id INT NOT NULL,
              action VARCHAR(50) NOT NULL,
              actor_id VARCHAR(64) NOT NULL,
              actor_role VARCHAR(30) NULL,
              old_values NVARCHAR(MAX) NULL,
              new_values NVARCHAR(MAX) NULL,
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_KbFactsAuditLog_fact ON dbo.KbFactsAuditLog (fact_id, created_at DESC);
          END;
        `);

        // ── 4. Bảng PostFactsAuditLog (Truy vết bài viết sử dụng facts nào) ──
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.PostFactsAuditLog', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.PostFactsAuditLog (
              id INT IDENTITY(1,1) PRIMARY KEY,
              post_id VARCHAR(64) NOT NULL,
              customer_id VARCHAR(64) NULL,
              fact_id INT NOT NULL,
              fact_content NVARCHAR(MAX) NOT NULL,
              fact_source NVARCHAR(500) NULL,
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_PostFactsAudit_post ON dbo.PostFactsAuditLog (post_id);
            CREATE INDEX IX_PostFactsAudit_fact ON dbo.PostFactsAuditLog (fact_id);
          END;

          -- Bổ sung cột used_fact_ids & customer_id vào AiGeneratedDrafts & Posts nếu chưa có
          IF OBJECT_ID(N'dbo.AiGeneratedDrafts', N'U') IS NOT NULL
          BEGIN
            IF COL_LENGTH('dbo.AiGeneratedDrafts', 'used_fact_ids') IS NULL
              ALTER TABLE dbo.AiGeneratedDrafts ADD used_fact_ids NVARCHAR(MAX) NULL;
            IF COL_LENGTH('dbo.AiGeneratedDrafts', 'customer_id') IS NULL
              ALTER TABLE dbo.AiGeneratedDrafts ADD customer_id VARCHAR(64) NULL;
          END;

          IF OBJECT_ID(N'dbo.Posts', N'U') IS NOT NULL
          BEGIN
            IF COL_LENGTH('dbo.Posts', 'used_fact_ids') IS NULL
              ALTER TABLE dbo.Posts ADD used_fact_ids NVARCHAR(MAX) NULL;
            IF COL_LENGTH('dbo.Posts', 'customer_id') IS NULL
              ALTER TABLE dbo.Posts ADD customer_id VARCHAR(64) NULL;
          END;
        `);
      }
    }).catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

// ─────────────────────────────────────────────────────────────
// 1. PHÂN QUYỀN & CÁCH LY KHÁCH HÀNG (CUSTOMER ISOLATION)
// ─────────────────────────────────────────────────────────────

/**
 * Kiểm tra xem user có quyền truy cập vào customer_id hay không.
 * Nguyên tắc: Admin có toàn quyền (nhưng truy cập chéo sẽ ghi audit log); user/reviewer khác BẮT BUỘC phải có bản ghi trong UserCustomers.
 */
async function checkUserHasCustomerAccess(userId, customerId, userRole = 'user') {
  if (!customerId) return false;
  const isGlobalAdmin = String(userRole).toLowerCase() === 'admin';
  if (!userId) return false;

  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const query = `
    SELECT role FROM ${isSqlite ? 'UserCustomers' : 'dbo.UserCustomers'}
    WHERE user_id = @user_id AND customer_id = @customer_id
  `;

  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId).trim())
    .input('customer_id', sql.VarChar(64), String(customerId).trim())
    .query(query);

  const hasExplicitMapping = result.recordset && result.recordset.length > 0;

  // Nếu là Admin nhưng truy cập chéo khách hàng (không có bản ghi trong UserCustomers)
  // Vẫn cho phép truy cập nhưng BẮT BUỘC ghi Audit Log kiểm toán (Point 3)
  if (isGlobalAdmin) {
    if (!hasExplicitMapping) {
      await logKbAudit(pool, {
        factId: 0,
        action: 'ADMIN_CROSS_TENANT_ACCESS',
        actorId: userId,
        actorRole: 'admin',
        oldValues: null,
        newValues: { customerId: String(customerId).trim(), note: 'Admin truy cập chéo khách hàng' }
      });
    }
    return true;
  }

  return hasExplicitMapping;
}

/**
 * Lấy vai trò cụ thể của user đối với từng khách hàng (Point 3)
 * Quyền duyệt fact phụ thuộc vào vai trò trong khách đó, không dùng vai trò toàn cục.
 * @returns 'admin' | 'reviewer' | 'member' | null
 */
async function getUserCustomerRole(userId, customerId, globalRole = 'user') {
  if (!customerId || !userId) return null;
  if (String(globalRole).toLowerCase() === 'admin') return 'admin';

  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const query = `
    SELECT role FROM ${isSqlite ? 'UserCustomers' : 'dbo.UserCustomers'}
    WHERE user_id = @user_id AND customer_id = @customer_id
  `;

  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId).trim())
    .input('customer_id', sql.VarChar(64), String(customerId).trim())
    .query(query);

  if (result.recordset && result.recordset.length > 0) {
    return String(result.recordset[0].role || 'member').toLowerCase();
  }
  return null;
}

/**
 * Gán user vào customer (Chỉ Admin / Manager thực hiện)
 */
async function assignUserToCustomer(userId, customerId, role = 'member') {
  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const query = isSqlite
    ? `INSERT OR REPLACE INTO UserCustomers (user_id, customer_id, role, created_at)
       VALUES (@user_id, @customer_id, @role, datetime('now'))`
    : `IF NOT EXISTS (SELECT 1 FROM dbo.UserCustomers WHERE user_id = @user_id AND customer_id = @customer_id)
         INSERT INTO dbo.UserCustomers (user_id, customer_id, role) VALUES (@user_id, @customer_id, @role)
       ELSE
         UPDATE dbo.UserCustomers SET role = @role WHERE user_id = @user_id AND customer_id = @customer_id`;

  await pool.request()
    .input('user_id', sql.VarChar(64), String(userId).trim())
    .input('customer_id', sql.VarChar(64), String(customerId).trim())
    .input('role', sql.VarChar(30), String(role).trim())
    .query(query);

  return { success: true, userId, customerId, role };
}

/**
 * Lấy danh sách khách hàng mà user ĐƯỢC PHÉP TRUY CẬP
 */
async function getKbCustomers(userId, userRole = 'user') {
  await ensureKbFactsSchema();
  const pool = await getPool();
  await autoRetireExpiredFacts(pool);

  const isSqlite = process.env.USE_SQLITE === 'true';
  const isAdmin = String(userRole).toLowerCase() === 'admin';

  let query = '';
  const req = pool.request();

  if (isAdmin) {
    query = `
      SELECT customer_id,
             COUNT(*) as total_facts,
             SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed_facts,
             SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) as draft_facts,
             SUM(CASE WHEN status = 'RETIRED' THEN 1 ELSE 0 END) as retired_facts,
             MAX(updated_at) as last_updated
      FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
      GROUP BY customer_id
      ORDER BY customer_id ASC
    `;
  } else {
    // Chỉ lấy các khách hàng được gán cho user trong UserCustomers
    query = `
      SELECT f.customer_id,
             COUNT(*) as total_facts,
             SUM(CASE WHEN f.status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed_facts,
             SUM(CASE WHEN f.status = 'DRAFT' THEN 1 ELSE 0 END) as draft_facts,
             SUM(CASE WHEN f.status = 'RETIRED' THEN 1 ELSE 0 END) as retired_facts,
             MAX(f.updated_at) as last_updated
      FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} f
      INNER JOIN ${isSqlite ? 'UserCustomers' : 'dbo.UserCustomers'} uc
        ON f.customer_id = uc.customer_id
      WHERE uc.user_id = @user_id
      GROUP BY f.customer_id
      ORDER BY f.customer_id ASC
    `;
    req.input('user_id', sql.VarChar(64), String(userId).trim());
  }

  const result = await req.query(query);
  return result.recordset || [];
}

// ─────────────────────────────────────────────────────────────
// 2. TỰ ĐỘNG CHUYỂN RETIRED VÀ LỌC UTC TỨC THỜI
// ─────────────────────────────────────────────────────────────

/**
 * Dọn dẹp facts hết hạn chuyển sang RETIRED (Chạy định kỳ và kiểm tra múi giờ UTC)
 */
async function autoRetireExpiredFacts(pool) {
  try {
    const isSqlite = process.env.USE_SQLITE === 'true';
    const selectQuery = `
      SELECT id, customer_id, fact_type, content, status
      FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
      WHERE status IN ('CONFIRMED', 'DRAFT')
        AND expires_at IS NOT NULL
        AND expires_at < ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'}
    `;
    const toRetireRes = await pool.request().query(selectQuery);
    const toRetireFacts = toRetireRes.recordset || [];

    if (toRetireFacts.length > 0) {
      if (isSqlite) {
        await pool.request().query(`
          UPDATE KbFacts
          SET status = 'RETIRED', updated_at = datetime('now')
          WHERE status IN ('CONFIRMED', 'DRAFT')
            AND expires_at IS NOT NULL
            AND expires_at < datetime('now');
        `);
      } else {
        await pool.request().query(`
          UPDATE dbo.KbFacts
          SET status = 'RETIRED', updated_at = SYSUTCDATETIME()
          WHERE status IN ('CONFIRMED', 'DRAFT')
            AND expires_at IS NOT NULL
            AND expires_at < SYSUTCDATETIME();
        `);
      }

      // Ghi audit log kiểm toán cho từng fact hết hạn tự động chuyển RETIRED (Point 4)
      for (const f of toRetireFacts) {
        await logKbAudit(pool, {
          factId: f.id,
          action: 'AUTO_EXPIRE_RETIRE',
          actorId: 'system',
          actorRole: 'scheduler',
          oldValues: { status: f.status },
          newValues: { status: 'RETIRED' }
        });
      }
    }
  } catch (err) {
    console.warn('[KbFacts] Lỗi khi auto-retire facts quá hạn:', err.message);
  }
}

/**
 * Lấy các facts CONFIRMED và CÒN HẠN DÙNG để nạp vào prompt sinh bài
 * QUAN TRỌNG: Lọc UTC tức thời (expires_at >= UTC NOW) ngay trong câu SQL để chống lọt facts quá hạn
 */
async function getActiveFactsForPrompt(customerId) {
  if (!customerId) return [];
  await ensureKbFactsSchema();
  const pool = await getPool();
  await autoRetireExpiredFacts(pool);

  const isSqlite = process.env.USE_SQLITE === 'true';
  const query = `
    SELECT * FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
    WHERE customer_id = @customer_id
      AND status = 'CONFIRMED'
      AND (expires_at IS NULL OR expires_at >= ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'})
    ORDER BY fact_type ASC, id ASC
  `;

  const result = await pool.request()
    .input('customer_id', sql.VarChar(64), String(customerId).trim())
    .query(query);

  return (result.recordset || []).map(formatFact);
}

/**
 * Lấy toàn bộ facts của một khách hàng (có kiểm tra quyền cách ly)
 */
async function getFactsByCustomer(customerId, statusFilter = null, userId = null, userRole = 'user') {
  if (!customerId) return [];

  // Kiểm tra cách ly dữ liệu
  if (userId) {
    const hasAccess = await checkUserHasCustomerAccess(userId, customerId, userRole);
    if (!hasAccess) {
      throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có quyền xem dữ liệu của khách hàng '${customerId}'.`);
    }
  }

  await ensureKbFactsSchema();
  const pool = await getPool();
  await autoRetireExpiredFacts(pool);

  const req = pool.request().input('customer_id', sql.VarChar(64), String(customerId).trim());
  let query = `
    SELECT * FROM ${process.env.USE_SQLITE === 'true' ? 'KbFacts' : 'dbo.KbFacts'}
    WHERE customer_id = @customer_id
  `;

  if (statusFilter && statusFilter !== 'ALL') {
    req.input('status', sql.VarChar(30), statusFilter.toUpperCase());
    query += ` AND status = @status`;
  }

  query += ` ORDER BY id DESC`;
  const result = await req.query(query);
  return (result.recordset || []).map(formatFact);
}

// ─────────────────────────────────────────────────────────────
// 3. THÊM, SỬA FACT VÀ GHI AUDIT LOG
// ─────────────────────────────────────────────────────────────

/**
 * Ghi log kiểm toán thao tác với KbFacts
 */
async function logKbAudit(pool, { factId, action, actorId, actorRole, oldValues = null, newValues = null }) {
  try {
    const isSqlite = process.env.USE_SQLITE === 'true';
    await pool.request()
      .input('fact_id', sql.Int, parseInt(factId, 10))
      .input('action', sql.VarChar(50), String(action))
      .input('actor_id', sql.VarChar(64), String(actorId))
      .input('actor_role', sql.VarChar(30), actorRole ? String(actorRole) : null)
      .input('old_values', sql.NVarChar(sql.MAX), oldValues ? JSON.stringify(oldValues) : null)
      .input('new_values', sql.NVarChar(sql.MAX), newValues ? JSON.stringify(newValues) : null)
      .query(`
        INSERT INTO ${isSqlite ? 'KbFactsAuditLog' : 'dbo.KbFactsAuditLog'}
          (fact_id, action, actor_id, actor_role, old_values, new_values)
        VALUES
          (@fact_id, @action, @actor_id, @actor_role, @old_values, @new_values);
      `);
  } catch (err) {
    console.warn('[KbFacts Audit Warning]', err.message);
  }
}

/**
 * Thêm fact mới (Luôn ở trạng thái DRAFT)
 */
async function createFact({
  customerId,
  factType = 'description',
  content,
  source = null,
  expiresAt = null,
  actor = 'user',
  actorRole = 'user'
}) {
  if (!customerId || !content || !content.trim()) {
    throw new Error('Customer ID và nội dung fact không được để trống.');
  }

  // Kiểm tra quyền cách ly của người tạo
  if (actorRole !== 'admin') {
    const hasAccess = await checkUserHasCustomerAccess(actor, customerId, actorRole);
    if (!hasAccess) {
      throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có quyền tạo fact cho khách hàng '${customerId}'.`);
    }
  }

  await ensureKbFactsSchema();
  const pool = await getPool();

  const cleanContent = content.trim();
  if (cleanContent.length > 1000) {
    throw new Error('Nội dung fact không được vượt quá 1000 ký tự (bảo vệ chống cạn kiệt tài nguyên / DoS).');
  }

  // Khử triệt để < và > để chống prompt injection
  const safeContent = cleanContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const validTypes = [
    'price', 'promotion', 'policy', 'description', 'medical_claim', 'financial_policy',
    'giá', 'ưu đãi', 'chính sách', 'mô tả', 'công dụng y tế', 'chính sách tài chính'
  ];
  const normType = String(factType || 'description').trim().toLowerCase();
  const assignedType = validTypes.includes(normType) ? normType : 'description';

  // Bắt buộc source đối với các thông tin nhạy cảm (y tế/công dụng/tài chính)
  const SENSITIVE_FACT_TYPES = ['medical_claim', 'công dụng y tế', 'financial_policy', 'chính sách tài chính'];
  if (SENSITIVE_FACT_TYPES.includes(assignedType)) {
    if (!source || !source.trim()) {
      throw new Error(`Fact loại '${assignedType}' (thông tin y tế / công dụng / tài chính) bắt buộc phải có nguồn chứng thực (source).`);
    }
  }

  // Luôn tạo ở trạng thái DRAFT để ngăn ngừa bypass cổng duyệt
  const status = 'DRAFT';

  // Chuyển đổi expiresAt sang chuẩn ISO UTC
  let parsedExpires = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (!isNaN(d.getTime())) parsedExpires = d;
  }

  const isSqlite = process.env.USE_SQLITE === 'true';
  const req = pool.request()
    .input('customer_id', sql.VarChar(64), String(customerId).trim())
    .input('fact_type', sql.NVarChar(50), assignedType)
    .input('content', sql.NVarChar(sql.MAX), safeContent)
    .input('source', sql.NVarChar(500), source ? String(source).trim() : null)
    .input('status', sql.VarChar(30), status)
    .input('created_by', sql.VarChar(64), String(actor))
    .input('expires_at', sql.DateTime2, parsedExpires);

  let createdRow;
  if (isSqlite) {
    const insertRes = await req.query(`
      INSERT INTO KbFacts (customer_id, fact_type, content, source, status, created_by, expires_at)
      VALUES (@customer_id, @fact_type, @content, @source, @status, @created_by, @expires_at);
      SELECT * FROM KbFacts WHERE id = last_insert_rowid();
    `);
    createdRow = insertRes.recordset[0];
  } else {
    const insertRes = await req.query(`
      INSERT INTO dbo.KbFacts (customer_id, fact_type, content, source, status, created_by, expires_at)
      OUTPUT INSERTED.*
      VALUES (@customer_id, @fact_type, @content, @source, @status, @created_by, @expires_at);
    `);
    createdRow = insertRes.recordset[0];
  }

  const formatted = formatFact(createdRow);
  await logKbAudit(pool, {
    factId: formatted.id,
    action: 'CREATE',
    actorId: actor,
    actorRole,
    newValues: formatted
  });

  return formatted;
}

/**
 * Cập nhật fact:
 * QUY TẮC CỐT LÕI (POINT 3):
 * Khi sửa bất kỳ nội dung/thông số nào của fact:
 * - Bắt buộc quay về trạng thái DRAFT (kể cả trước đó đã CONFIRMED).
 * - Xóa bỏ confirmed_by = NULL, confirmed_at = NULL (tước dấu đã duyệt).
 * - Ghi nhận KbFactsAuditLog lưu trữ đầy đủ giá trị cũ và mới.
 */
async function updateFact(factId, { factType, content, source, expiresAt, actorId = 'user', actorRole = 'user', expectedUpdatedAt = null }) {
  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const existingRes = await pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .query(`SELECT * FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} WHERE id = @id`);

  if (!existingRes.recordset.length) throw new Error('Fact không tồn tại.');
  const existing = existingRes.recordset[0];

  // Kiểm tra quyền cách ly khách hàng
  if (actorRole !== 'admin') {
    const hasAccess = await checkUserHasCustomerAccess(actorId, existing.customer_id, actorRole);
    if (!hasAccess) {
      throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có quyền chỉnh sửa fact của khách hàng '${existing.customer_id}'.`);
    }
  }

  let newType = existing.fact_type;
  if (factType) {
    const validTypes = [
      'price', 'promotion', 'policy', 'description', 'medical_claim', 'financial_policy',
      'giá', 'ưu đãi', 'chính sách', 'mô tả', 'công dụng y tế', 'chính sách tài chính'
    ];
    const normType = String(factType).trim().toLowerCase();
    newType = validTypes.includes(normType) ? normType : existing.fact_type;
  }

  let newContent = existing.content;
  if (content !== undefined) {
    const cleanContent = String(content).trim();
    if (cleanContent.length > 1000) {
      throw new Error('Nội dung fact không được vượt quá 1000 ký tự (Chặn buffer overflow và DoS payload).');
    }
    // Khử triệt để < và > để chống prompt injection
    newContent = cleanContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const newSource = source !== undefined ? (source ? String(source).trim() : null) : existing.source;

  const SENSITIVE_FACT_TYPES = ['medical_claim', 'công dụng y tế', 'financial_policy', 'chính sách tài chính'];
  if (SENSITIVE_FACT_TYPES.includes(newType)) {
    if (!newSource || !newSource.trim()) {
      throw new Error(`Fact loại '${newType}' (thông tin y tế / công dụng / tài chính) bắt buộc phải có nguồn chứng thực (source).`);
    }
  }

  // Chuẩn hóa hạn dùng UTC
  let parsedExpires = existing.expires_at ? new Date(existing.expires_at) : null;
  if (expiresAt !== undefined) {
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (!isNaN(d.getTime())) parsedExpires = d;
    } else {
      parsedExpires = null;
    }
  }

  // QUY TẮC BẢO VỆ: Mọi chỉnh sửa nội dung/loại/hạn dùng đều đẩy trạng thái về DRAFT, hủy approval cũ!
  const nextStatus = 'DRAFT';

  const req = pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .input('fact_type', sql.NVarChar(50), newType)
    .input('content', sql.NVarChar(sql.MAX), newContent)
    .input('source', sql.NVarChar(500), newSource)
    .input('status', sql.VarChar(30), nextStatus)
    .input('updated_by', sql.VarChar(64), String(actorId))
    .input('expires_at', sql.DateTime2, parsedExpires);

  let whereClause = "WHERE id = @id";
  if (expectedUpdatedAt) {
    req.input('expected_updated_at', sql.DateTime2, new Date(expectedUpdatedAt));
    whereClause += " AND updated_at = @expected_updated_at";
  }

  const query = `
    UPDATE ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
    SET fact_type = @fact_type,
        content = @content,
        source = @source,
        status = @status,
        expires_at = @expires_at,
        updated_by = @updated_by,
        confirmed_by = NULL,
        confirmed_at = NULL,
        updated_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'}
    ${isSqlite ? '' : 'OUTPUT INSERTED.*'}
    ${whereClause};
    ${isSqlite ? 'SELECT * FROM KbFacts WHERE id = @id;' : ''}
  `;

  const updatedRes = await req.query(query);
  const updatedRow = updatedRes.recordset && updatedRes.recordset[0];
  if (!updatedRow || (updatedRes.rowsAffected && updatedRes.rowsAffected[0] === 0)) {
    throw new Error('Xung đột đồng thời (409 Conflict): Fact này đã bị thay đổi bởi người khác trong lúc thao tác. Vui lòng tải lại trang.');
  }
  const formatted = formatFact(updatedRow);

  // Ghi Audit Log truy vết
  await logKbAudit(pool, {
    factId,
    action: 'UPDATE',
    actorId,
    actorRole,
    oldValues: formatFact(existing),
    newValues: formatted
  });

  return formatted;
}

/**
 * Phê duyệt fact sang trạng thái CONFIRMED
 * QUY TẮC CHỐNG TỰ DUYỆT & PHÂN QUYỀN THEO KHÁCH (POINT 3 & 4):
 * - Quyền phê duyệt phải dựa theo vai trò TRONG KHÁCH ĐÓ (UserCustomers.role = reviewer / admin).
 * - CẢ NGƯỜI TẠO (created_by) LẪN NGƯỜI SỬA CUỐI CÙNG (updated_by) ĐỀU KHÔNG ĐƯỢC TỰ DUYỆT CHÍNH MÌNH.
 * - Hỗ trợ Optimistic Locking: WHERE status = 'DRAFT' [AND updated_at = @expectedUpdatedAt].
 */
async function confirmFact(factId, { confirmedBy = 'reviewer', confirmedRole = 'reviewer', expectedUpdatedAt = null }) {
  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const existingRes = await pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .query(`SELECT * FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} WHERE id = @id`);

  if (!existingRes.recordset.length) throw new Error('Fact không tồn tại.');
  const existing = existingRes.recordset[0];

  // 1. Phân quyền theo vai trò trong khách hàng đó (Point 3)
  const customerRole = await getUserCustomerRole(confirmedBy, existing.customer_id, confirmedRole);
  if (!['reviewer', 'admin', 'manager'].includes(customerRole)) {
    throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có vai trò kiểm duyệt (reviewer) cho khách hàng '${existing.customer_id}'.`);
  }

  // 2. Chặn tự duyệt (Cả người tạo lẫn người sửa cuối cùng) (Point 3 & 4)
  if (existing.created_by && String(existing.created_by) === String(confirmedBy)) {
    throw new Error('Xung đột quyền lợi: Người tạo fact không được tự phê duyệt chính mình để đảm bảo tính khách quan.');
  }
  if (existing.updated_by && String(existing.updated_by) === String(confirmedBy)) {
    throw new Error('Xung đột quyền lợi: Người chỉnh sửa/cập nhật fact gần nhất không được tự phê duyệt chính mình.');
  }

  // 3. Optimistic Locking chống race condition (Point 5)
  const req = pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .input('confirmed_by', sql.VarChar(64), String(confirmedBy));

  let whereClause = "WHERE id = @id AND status = 'DRAFT'";
  if (expectedUpdatedAt) {
    req.input('expected_updated_at', sql.DateTime2, new Date(expectedUpdatedAt));
    whereClause += " AND updated_at = @expected_updated_at";
  }

  const query = `
    UPDATE ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
    SET status = 'CONFIRMED',
        confirmed_by = @confirmed_by,
        confirmed_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'},
        updated_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'}
    ${isSqlite ? '' : 'OUTPUT INSERTED.*'}
    ${whereClause};
    ${isSqlite ? 'SELECT * FROM KbFacts WHERE id = @id;' : ''}
  `;

  const res = await req.query(query);
  const updatedRow = res.recordset && res.recordset[0];
  if (!updatedRow || (res.rowsAffected && res.rowsAffected[0] === 0)) {
    throw new Error('Xung đột đồng thời (409 Conflict): Fact này đã được duyệt hoặc bị chỉnh sửa bởi người khác trong lúc thao tác. Vui lòng tải lại trang.');
  }

  const formatted = formatFact(updatedRow);

  await logKbAudit(pool, {
    factId,
    action: 'CONFIRM',
    actorId: confirmedBy,
    actorRole: customerRole,
    oldValues: formatFact(existing),
    newValues: formatted
  });

  return formatted;
}

/**
 * Thu hồi fact sang trạng thái RETIRED
 */
async function retireFact(factId, actorId = 'user', actorRole = 'user') {
  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const existingRes = await pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .query(`SELECT * FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} WHERE id = @id`);

  if (!existingRes.recordset.length) throw new Error('Fact không tồn tại.');
  const existing = existingRes.recordset[0];

  if (actorRole !== 'admin') {
    const hasAccess = await checkUserHasCustomerAccess(actorId, existing.customer_id, actorRole);
    if (!hasAccess) {
      throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có quyền thu hồi fact của khách hàng '${existing.customer_id}'.`);
    }
  }

  const req = pool.request().input('id', sql.Int, parseInt(factId, 10));
  const query = `
    UPDATE ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'}
    SET status = 'RETIRED',
        updated_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'}
    ${isSqlite ? '' : 'OUTPUT INSERTED.*'}
    WHERE id = @id;
    ${isSqlite ? 'SELECT * FROM KbFacts WHERE id = @id;' : ''}
  `;

  const res = await req.query(query);
  const formatted = formatFact(res.recordset[0]);

  await logKbAudit(pool, {
    factId,
    action: 'RETIRE',
    actorId,
    actorRole,
    oldValues: formatFact(existing),
    newValues: formatted
  });

  return formatted;
}

/**
 * Xóa fact vĩnh viễn (Chỉ Admin / Manager)
 */
async function deleteFact(factId, actorId = 'user', actorRole = 'user') {
  if (!['admin', 'manager'].includes(String(actorRole).toLowerCase())) {
    throw new Error('Chỉ quản trị viên mới có quyền xóa fact khỏi Knowledge Base.');
  }

  await ensureKbFactsSchema();
  const pool = await getPool();

  const isSqlite = process.env.USE_SQLITE === 'true';
  const existingRes = await pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .query(`SELECT * FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} WHERE id = @id`);

  if (!existingRes.recordset.length) throw new Error('Fact không tồn tại.');
  const existing = existingRes.recordset[0];

  if (actorRole !== 'admin') {
    const hasAccess = await checkUserHasCustomerAccess(actorId, existing.customer_id, actorRole);
    if (!hasAccess) {
      throw new Error(`Quyền truy cập bị từ chối: Tài khoản không có quyền xóa fact của khách hàng '${existing.customer_id}'.`);
    }
  }

  const res = await pool.request()
    .input('id', sql.Int, parseInt(factId, 10))
    .query(`DELETE FROM ${isSqlite ? 'KbFacts' : 'dbo.KbFacts'} WHERE id = @id`);

  await logKbAudit(pool, {
    factId,
    action: 'DELETE',
    actorId,
    actorRole,
    oldValues: formatFact(existing)
  });

  return res.rowsAffected[0] > 0;
}

// ─────────────────────────────────────────────────────────────
// 5. TRUY VẾT BÀI VIẾT VÀ KIỂM TRA EXPIRATION KHI XUẤT BẢN
// ─────────────────────────────────────────────────────────────

/**
 * Ghi nhận lịch sử facts được sử dụng cho một bài viết / bản nháp (Item 5: PostAuditLog & Post trace)
 */
async function recordPostFactsUsage(postId, customerId, facts = []) {
  if (!postId || !facts || facts.length === 0) return;
  await ensureKbFactsSchema();
  const pool = await getPool();
  const isSqlite = process.env.USE_SQLITE === 'true';

  for (const fact of facts) {
    const factId = fact.id || fact;
    const content = fact.content || '';
    const source = fact.source || null;
    try {
      if (isSqlite) {
        await pool.request()
          .input('post_id', sql.VarChar(64), String(postId))
          .input('customer_id', sql.VarChar(64), customerId ? String(customerId) : null)
          .input('fact_id', sql.Int, parseInt(factId, 10))
          .input('fact_content', sql.NVarChar(sql.MAX), content)
          .input('fact_source', sql.NVarChar(500), source)
          .query(`
            INSERT INTO PostFactsAuditLog (post_id, customer_id, fact_id, fact_content, fact_source)
            VALUES (@post_id, @customer_id, @fact_id, @fact_content, @fact_source);
          `);
      } else {
        await pool.request()
          .input('post_id', sql.VarChar(64), String(postId))
          .input('customer_id', sql.VarChar(64), customerId ? String(customerId) : null)
          .input('fact_id', sql.Int, parseInt(factId, 10))
          .input('fact_content', sql.NVarChar(sql.MAX), content)
          .input('fact_source', sql.NVarChar(500), source)
          .query(`
            INSERT INTO dbo.PostFactsAuditLog (post_id, customer_id, fact_id, fact_content, fact_source)
            VALUES (@post_id, @customer_id, @fact_id, @fact_content, @fact_source);
          `);
      }
    } catch (err) {
      console.warn(`[KbFactsService] Ghi PostFactsAuditLog thất bại cho post #${postId}, fact #${factId}:`, err.message);
    }
  }
}

/**
 * Lấy danh sách audit log facts đã dùng cho bài viết (Xem bài nào đăng với facts/giá cũ)
 */
async function getPostFactsAuditLog(postId) {
  if (!postId) return [];
  await ensureKbFactsSchema();
  const pool = await getPool();
  const isSqlite = process.env.USE_SQLITE === 'true';
  const res = await pool.request()
    .input('post_id', sql.VarChar(64), String(postId))
    .query(`SELECT * FROM ${isSqlite ? 'PostFactsAuditLog' : 'dbo.PostFactsAuditLog'} WHERE post_id = @post_id ORDER BY id ASC`);
  return res.recordset || [];
}

/**
 * Kiểm tra xem danh sách facts của bài viết có fact nào đã hết hạn hoặc bị RETIRED hay không
 * (Kiểm tra lại ở bước xuất bản)
 */
async function checkFactsExpiration(factIds = []) {
  if (!Array.isArray(factIds) || factIds.length === 0) {
    return { valid: true, expiredFacts: [] };
  }
  await ensureKbFactsSchema();
  const pool = await getPool();
  const isSqlite = process.env.USE_SQLITE === 'true';

  const cleanIds = factIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (cleanIds.length === 0) return { valid: true, expiredFacts: [] };

  const idListStr = cleanIds.join(',');
  const query = isSqlite
    ? `SELECT id, customer_id, fact_type, content, status, expires_at FROM KbFacts WHERE id IN (${idListStr})`
    : `SELECT id, customer_id, fact_type, content, status, expires_at FROM dbo.KbFacts WHERE id IN (${idListStr})`;

  const res = await pool.request().query(query);
  const facts = res.recordset || [];
  const now = new Date();

  const expiredFacts = [];
  for (const f of facts) {
    const isRetired = String(f.status).toUpperCase() === 'RETIRED';
    let isExpiredDate = false;
    if (f.expires_at) {
      const exp = new Date(f.expires_at);
      if (!isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
        isExpiredDate = true;
      }
    }
    if (isRetired || isExpiredDate) {
      expiredFacts.push({
        id: f.id,
        factType: f.fact_type,
        content: f.content,
        status: f.status,
        expiresAt: f.expires_at
      });
    }
  }

  return {
    valid: expiredFacts.length === 0,
    expiredFacts
  };
}

/**
 * Quét các bài viết đã PUBLISHED mà có facts liên kết đã hết hạn (Point 4)
 * Cảnh báo cho người vận hành để gỡ hoặc đính chính bài viết kịp thời (VD: Giá khuyến mãi hết hạn vẫn hiển thị trên Page).
 */
async function checkPublishedPostsWithExpiredFacts() {
  await ensureKbFactsSchema();
  const pool = await getPool();
  const isSqlite = process.env.USE_SQLITE === 'true';

  const query = `
    SELECT id, page_id, content, status, used_fact_ids, published_at
    FROM ${isSqlite ? 'Posts' : 'dbo.Posts'}
    WHERE status = 'PUBLISHED' AND used_fact_ids IS NOT NULL AND RTRIM(LTRIM(used_fact_ids)) <> ''
    ORDER BY id DESC
  `;

  const res = await pool.request().query(query);
  const alerts = [];

  for (const post of res.recordset) {
    let factIds = [];
    try {
      factIds = typeof post.used_fact_ids === 'string' ? JSON.parse(post.used_fact_ids) : post.used_fact_ids;
    } catch {
      factIds = String(post.used_fact_ids).split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
    }
    if (!Array.isArray(factIds) || factIds.length === 0) continue;

    const check = await checkFactsExpiration(factIds);
    if (!check.valid && check.expiredFacts.length > 0) {
      alerts.push({
        postId: post.id,
        pageId: post.page_id,
        publishedAt: post.published_at,
        expiredFacts: check.expiredFacts
      });
    }
  }

  return alerts;
}

function formatFact(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    factType: row.fact_type,
    content: row.content,
    source: row.source || null,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    confirmedBy: row.confirmed_by || null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    isExpired: row.expires_at ? new Date(row.expires_at) < new Date() : false
  };
}

module.exports = {
  ensureKbFactsSchema,
  checkUserHasCustomerAccess,
  getUserCustomerRole,
  assignUserToCustomer,
  getKbCustomers,
  getFactsByCustomer,
  getActiveFactsForPrompt,
  createFact,
  updateFact,
  confirmFact,
  retireFact,
  deleteFact,
  recordPostFactsUsage,
  getPostFactsAuditLog,
  checkFactsExpiration,
  checkPublishedPostsWithExpiredFacts
};
