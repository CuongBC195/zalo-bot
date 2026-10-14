-- ============================================================
-- CẤU TRÚC CƠ SỞ DỮ LIỆU POSTGRESQL CHO HỆ THỐNG VĂN BẢN ĐẢNG
-- Tích hợp Quản lý Văn bản, Quản lý Người dùng & Nhật ký Audit
-- ============================================================

-- 1. Bảng lưu trữ tài khoản Quản trị viên (Admin Users)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'admin', -- 'superadmin', 'admin', 'viewer'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- 2. Bảng lưu trữ người dùng Zalo tương tác với Bot
CREATE TABLE IF NOT EXISTS zalo_users (
    id SERIAL PRIMARY KEY,
    zalo_id VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    chat_id VARCHAR(100),
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    query_count INTEGER NOT NULL DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bảng lưu trữ lịch sử hỏi đáp (Query Logs & Audit Trail)
CREATE TABLE IF NOT EXISTS query_logs (
    id SERIAL PRIMARY KEY,
    zalo_user_id VARCHAR(100),
    user_name VARCHAR(255),
    query_text TEXT NOT NULL,
    intent VARCHAR(50),
    retrieved_doc_codes TEXT[],
    response_text TEXT,
    latency_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bảng lưu trữ thông tin văn bản
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    document_code VARCHAR(100) UNIQUE NOT NULL,
    document_name TEXT NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'quy_dinh_dang',
    issue_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Còn hiệu lực',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Bảng lưu trữ chi tiết các Điều/Khoản của văn bản
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    article_number VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    full_text TEXT,
    tsv TSVECTOR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CHỈ MỤC TỐI ƯU HÓA TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_zalo_users_zalo_id ON zalo_users(zalo_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_user ON query_logs(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_created ON query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_doc_id ON articles(document_id);
CREATE INDEX IF NOT EXISTS idx_articles_tsv ON articles USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_code ON documents(document_code);

-- Trigger tự động cập nhật TSVector phục vụ Full-Text Search tiếng Việt
CREATE OR REPLACE FUNCTION update_article_tsv() RETURNS trigger AS $$
BEGIN
    NEW.full_text := COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '');
    NEW.tsv := to_tsvector('simple', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_tsv ON articles;
CREATE TRIGGER trg_articles_tsv
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_article_tsv();
