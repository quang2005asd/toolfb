-- =============================================
-- migrate-tiktok.sql
-- Migration: Thêm hỗ trợ TikTok vào hệ thống
-- Chạy bằng: sqlcmd -S localhost -d tool_face_db -i server/scripts/migrate-tiktok.sql -C
-- =============================================

USE tool_face_db;
GO

-- 1. Thêm cột platform vào bảng Posts (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Posts') AND name = 'platform'
)
BEGIN
  ALTER TABLE Posts ADD platform VARCHAR(50) NOT NULL DEFAULT 'facebook';
  PRINT N'✅ Đã thêm cột [platform] vào bảng [Posts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Cột [platform] đã tồn tại trong bảng [Posts]';
END
GO

-- 2. Thêm cột tiktok_account_id vào bảng Posts (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Posts') AND name = 'tiktok_account_id'
)
BEGIN
  ALTER TABLE Posts ADD tiktok_account_id VARCHAR(50) NULL;
  PRINT N'✅ Đã thêm cột [tiktok_account_id] vào bảng [Posts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Cột [tiktok_account_id] đã tồn tại trong bảng [Posts]';
END
GO

-- 3. Thêm cột created_by_user_id vào bảng Posts (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Posts') AND name = 'created_by_user_id'
)
BEGIN
  ALTER TABLE Posts ADD created_by_user_id VARCHAR(64) NULL;
  PRINT N'✅ Đã thêm cột [created_by_user_id] vào bảng [Posts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Cột [created_by_user_id] đã tồn tại trong bảng [Posts]';
END
GO

-- 4. Thêm cột published_at vào bảng Posts (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Posts') AND name = 'published_at'
)
BEGIN
  ALTER TABLE Posts ADD published_at DATETIME2 NULL;
  PRINT N'✅ Đã thêm cột [published_at] vào bảng [Posts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Cột [published_at] đã tồn tại trong bảng [Posts]';
END
GO

-- 5. Thêm cột error_message vào bảng Posts (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Posts') AND name = 'error_message'
)
BEGIN
  ALTER TABLE Posts ADD error_message NVARCHAR(MAX) NULL;
  PRINT N'✅ Đã thêm cột [error_message] vào bảng [Posts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Cột [error_message] đã tồn tại trong bảng [Posts]';
END
GO

-- 6. Tạo bảng TikTokAccounts (nếu chưa có)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TikTokAccounts')
BEGIN
  CREATE TABLE TikTokAccounts (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       VARCHAR(64)       NULL,
    username      VARCHAR(150)      NOT NULL,
    nickname      NVARCHAR(200)     NULL,
    avatar_url    NVARCHAR(1000)    NULL,
    session_id    VARCHAR(255)      NULL,
    cookies_json  NTEXT             NULL,
    status        VARCHAR(50)       NOT NULL DEFAULT 'active',
    error_message NVARCHAR(500)     NULL,
    created_at    VARCHAR(50)       NOT NULL,
    updated_at    VARCHAR(50)       NOT NULL
  );
  PRINT N'✅ Đã tạo bảng [TikTokAccounts]';
END
ELSE
BEGIN
  PRINT N'ℹ️  Bảng [TikTokAccounts] đã tồn tại';
END
GO

-- 7. Index cho TikTokAccounts
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TikTokAccounts_username')
BEGIN
  CREATE INDEX IX_TikTokAccounts_username ON TikTokAccounts(username);
  PRINT N'✅ Đã tạo index [IX_TikTokAccounts_username]';
END
GO

-- 8. Thêm cột parent_comment_id và facebook_comment_id vào PostComments (nếu chưa có)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('PostComments') AND name = 'parent_comment_id'
)
BEGIN
  ALTER TABLE PostComments ADD parent_comment_id INT NULL;
  PRINT N'✅ Đã thêm cột [parent_comment_id] vào bảng [PostComments]';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('PostComments') AND name = 'facebook_comment_id'
)
BEGIN
  ALTER TABLE PostComments ADD facebook_comment_id NVARCHAR(128) NULL;
  PRINT N'✅ Đã thêm cột [facebook_comment_id] vào bảng [PostComments]';
END
GO

PRINT N'';
PRINT N'🎉 Migration TikTok hoàn tất!';
GO
