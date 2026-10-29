require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');

async function cleanOldTestPosts() {
    console.log('🧹 BẮT ĐẦU DỌN DẸP BÀI TEST CŨ: PENDING_REVIEW & NEW -> REJECTED...');
    const pool = await getPool();

    // 1. Tìm các bài đang ở PENDING_REVIEW hoặc NEW hoặc READY_FOR_APPROVAL
    const selectRes = await pool.request().query(`
        SELECT id, status, page_id 
        FROM Posts 
        WHERE status IN ('PENDING_REVIEW', 'NEW', 'READY_FOR_APPROVAL')
    `);

    const postsToReject = selectRes.recordset;
    console.log(`📋 Tìm thấy ${postsToReject.length} bài cần chuyển sang REJECTED.`);

    if (postsToReject.length === 0) {
        console.log('✅ Không có bài nào cần dọn.');
        process.exit(0);
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const now = new Date();
        let updatedCount = 0;

        for (const post of postsToReject) {
            // Update Post
            await transaction.request()
                .input('id', sql.Int, post.id)
                .input('now', sql.DateTime, now)
                .query(`
                    UPDATE Posts 
                    SET status = 'REJECTED',
                        approved_hash = NULL,
                        is_permanent_failure = 0,
                        updated_at = @now
                    WHERE id = @id
                `);

            // Insert formal PostAuditLog
            await transaction.request()
                .input('post_id', sql.Int, post.id)
                .input('actor', sql.NVarChar, 'manual_cleanup')
                .input('from_state', sql.NVarChar, post.status)
                .input('to_state', sql.NVarChar, 'REJECTED')
                .input('reason', sql.NVarChar, 'Dọn dẹp bài test cũ trước đợt theo dõi 24h')
                .input('now', sql.DateTime, now)
                .query(`
                    INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at)
                    VALUES (@post_id, @actor, @from_state, @to_state, @reason, @now)
                `);

            updatedCount++;
        }

        await transaction.commit();
        console.log(`✅ Đã chuyển thành công ${updatedCount} bài sang REJECTED kèm PostAuditLog đầy đủ.`);

        // Thống kê lại toàn bộ trạng thái trong Posts
        const statsRes = await pool.request().query(`
            SELECT status, COUNT(*) as count 
            FROM Posts 
            GROUP BY status 
            ORDER BY count DESC
        `);

        console.log('\n📊 THỐNG KÊ TRẠNG THÁI HIỆN TẠI TRONG CSDL:');
        console.table(statsRes.recordset);

    } catch (err) {
        await transaction.rollback();
        console.error('❌ Lỗi dọn dẹp:', err);
    } finally {
        process.exit(0);
    }
}

cleanOldTestPosts();
