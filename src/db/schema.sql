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
    NEW.full_text := COALESCE(NEW.full_text, COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    NEW.tsv := to_tsvector('simple', COALESCE(NEW.full_text, '') || ' ' || COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_tsv ON articles;
CREATE TRIGGER trg_articles_tsv
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_article_tsv();

-- 6. Bảng lưu trữ bộ đệm câu trả lời (Smart Response Cache với TTL)
CREATE TABLE IF NOT EXISTS response_cache (
    cache_key VARCHAR(300) PRIMARY KEY,
    original_query TEXT NOT NULL,
    intent VARCHAR(50),
    retrieved_doc_codes TEXT[],
    response_text TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON response_cache(expires_at);

-- ============================================================
-- TRA CỨU SỔ CÔNG VĂN ĐẾN / ĐI
-- ============================================================

-- 7. Lịch sử nhập file Excel sổ văn bản
CREATE TABLE IF NOT EXISTS office_doc_imports (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('den', 'di')),
    file_name VARCHAR(255),
    report_date DATE,
    total_rows INTEGER NOT NULL DEFAULT 0,
    inserted INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    unchanged INTEGER NOT NULL DEFAULT 0,
    skipped_secret INTEGER NOT NULL DEFAULT 0,
    skipped_unpublished INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    imported_by INTEGER,
    imported_by_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_office_doc_imports_dir_created ON office_doc_imports(direction, created_at DESC);

-- 8. Sổ công văn đến / đi (chỉ lưu văn bản Độ mật = "Thường")
CREATE TABLE IF NOT EXISTS office_documents (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('den', 'di')),
    source_id VARCHAR(50) NOT NULL,           -- Cột "ID" của phần mềm quản lý văn bản
    so_ky_hieu VARCHAR(100),
    so_dang_ky INTEGER,
    trich_yeu TEXT,
    so_van_ban VARCHAR(255),
    the_loai VARCHAR(100),
    do_khan VARCHAR(50),
    do_mat VARCHAR(50),
    nguoi_gui VARCHAR(255),
    nguoi_trinh VARCHAR(255),
    nguoi_ky VARCHAR(255),
    y_kien_chuyen TEXT,
    y_kien_chi_dao TEXT,
    noi_nhan TEXT,
    trang_thai_phat_hanh VARCHAR(100),
    ngay_van_ban DATE,
    thoi_gian_nhan DATE,
    han_xu_ly DATE,
    so_trang INTEGER,
    so_ban INTEGER,
    file_names TEXT[] NOT NULL DEFAULT '{}',
    search_norm TEXT NOT NULL DEFAULT '',     -- Chữ thường, bỏ dấu (chuẩn hóa trong Node)
    row_hash VARCHAR(64),
    import_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (direction, source_id)
);
CREATE INDEX IF NOT EXISTS idx_office_docs_dir_date ON office_documents(direction, ngay_van_ban DESC);
CREATE INDEX IF NOT EXISTS idx_office_docs_the_loai ON office_documents(the_loai);
CREATE INDEX IF NOT EXISTS idx_office_docs_so_ky_hieu ON office_documents(LOWER(so_ky_hieu));
-- Ghi vết thêm/sửa tay trên web (NULL = dữ liệu từ file Excel; lần nhập Excel sau ghi đè sẽ đặt lại NULL)
ALTER TABLE office_documents ADD COLUMN IF NOT EXISTS edited_by_name VARCHAR(100);
ALTER TABLE office_documents ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- 9. Quyền tra cứu công văn của người dùng Zalo
ALTER TABLE zalo_users ADD COLUMN IF NOT EXISTS can_lookup_office BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE zalo_users ADD COLUMN IF NOT EXISTS staff_label VARCHAR(150);
ALTER TABLE zalo_users ADD COLUMN IF NOT EXISTS granted_by INTEGER;
ALTER TABLE zalo_users ADD COLUMN IF NOT EXISTS granted_at TIMESTAMP WITH TIME ZONE;

-- 10. Mã kích hoạt dùng một lần (chỉ lưu SHA-256 của mã)
CREATE TABLE IF NOT EXISTS zalo_activation_codes (
    id SERIAL PRIMARY KEY,
    code_hash VARCHAR(64) UNIQUE NOT NULL,
    staff_label VARCHAR(150) NOT NULL,
    created_by INTEGER,
    created_by_name VARCHAR(100),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by_zalo_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Trạng thái hội thoại ngắn hạn (bộ nhớ dạng bộ lọc, không lưu lịch sử chat)
CREATE TABLE IF NOT EXISTS zalo_sessions (
    zalo_id VARCHAR(100) PRIMARY KEY,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    failed_activation_count INTEGER NOT NULL DEFAULT 0,
    failed_activation_window_start TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 12. Dấu phiên bản schema: file không đổi thì cold start bỏ qua chạy lại toàn bộ (nhanh hơn)
CREATE TABLE IF NOT EXISTS app_meta (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
