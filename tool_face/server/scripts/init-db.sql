-- =============================================
-- Tool Face Tuan - Khởi tạo Database
-- Chạy bằng: sqlcmd -S localhost -i server/scripts/init-db.sql -C
-- =============================================

-- 1. Tạo database nếu chưa có
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'tool_face_db')
BEGIN
    CREATE DATABASE tool_face_db;
    PRINT N'✅ Đã tạo database [tool_face_db]';
END
ELSE
BEGIN
    PRINT N'ℹ️  Database [tool_face_db] đã tồn tại';
END
GO

USE tool_face_db;
GO

-- 2. Tạo bảng Posts
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Posts')
BEGIN
    CREATE TABLE Posts (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        page_id         VARCHAR(50)       NOT NULL,
        content         NVARCHAR(MAX)     NOT NULL,
        media_type      VARCHAR(20)       NOT NULL DEFAULT 'text',
        media_links     NVARCHAR(MAX)     NULL,
        media_thumb     VARCHAR(500)      NULL,
        scheduled_at    DATETIME2         NOT NULL,
        status          VARCHAR(20)       NOT NULL DEFAULT 'pending',
        facebook_post_id NVARCHAR(200)    NULL,
        created_at      DATETIME2         NOT NULL DEFAULT GETDATE(),
        updated_at      DATETIME2         NOT NULL DEFAULT GETDATE()
    );
    PRINT N'✅ Đã tạo bảng [Posts]';
END
ELSE
BEGIN
    PRINT N'ℹ️  Bảng [Posts] đã tồn tại';
END
GO

-- 3. Tạo bảng PostComments
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PostComments')
BEGIN
    CREATE TABLE PostComments (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        post_id         INT               NOT NULL,
        comment_index   INT               NOT NULL DEFAULT 1,
        content         NVARCHAR(MAX)     NOT NULL,
        delay_minutes   INT               NOT NULL DEFAULT 0,
        media_url       VARCHAR(500)      NULL,
        status          VARCHAR(20)       NOT NULL DEFAULT 'pending',
        created_at      DATETIME2         NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_PostComments_Posts FOREIGN KEY (post_id)
            REFERENCES Posts(id) ON DELETE CASCADE
    );
    PRINT N'✅ Đã tạo bảng [PostComments]';
END
ELSE
BEGIN
    PRINT N'ℹ️  Bảng [PostComments] đã tồn tại';
END
GO

-- 4. Tạo Index
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Posts_status_scheduled')
BEGIN
    CREATE INDEX IX_Posts_status_scheduled ON Posts(status, scheduled_at DESC);
    PRINT N'✅ Đã tạo index [IX_Posts_status_scheduled]';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PostComments_post_id')
BEGIN
    CREATE INDEX IX_PostComments_post_id ON PostComments(post_id);
    PRINT N'✅ Đã tạo index [IX_PostComments_post_id]';
END
GO

PRINT N'';
PRINT N'🎉 Khởi tạo database hoàn tất!';
GO
