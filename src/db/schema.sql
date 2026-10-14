-- ============================================================
-- CẤU TRÚC CƠ SỞ DỮ LIỆU POSTGRESQL CHO HỆ THỐNG VĂN BẢN ĐẢNG
-- ============================================================

-- Bảng lưu trữ thông tin văn bản
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

-- Bảng lưu trữ chi tiết các Điều/Khoản của văn bản
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

-- Chỉ mục tối ưu hóa tìm kiếm
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
