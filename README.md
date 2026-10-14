# 🇻🇳 Zalo Đảng AI Bot (v2.0)

Chatbot Zalo thông minh chuyên trách **giải đáp thắc mắc về Thể thức văn bản, Nghiệp vụ Văn thư - Lưu trữ và Cương lĩnh, Điều lệ, Quy định, Thông tư của Đảng**.

Hệ thống tích hợp:
* **Jev (TypeSafe `jev-1.13`) - System One:** Mô hình phán đoán nhanh đóng vai trò định tuyến ý định (`Choice`), lọc/rerank đoạn trích liên quan (`Noul`) và kiểm duyệt tính trung thực, chống ảo giác (`Faithfulness Guardrail`).
* **PostgreSQL Database + RAG Engine:** Cơ sở dữ liệu quan hệ động lưu trữ toàn bộ văn bản và điều khoản, hỗ trợ Full-Text Search (TSVector) và bóc tách theo Chương/Điều/Khoản. Tự động hỗ trợ Local In-Memory Fallback khi chưa kết nối Database.
* **Web Admin Dashboard (Cổng quản trị trực quan):** Giao diện web hiện đại quản lý thêm/sửa/xóa văn bản, công cụ bóc tách tự động (Auto Parser) từ văn bản thô, và AI Playground thử nghiệm truy vấn RAG tức thì.
* **Google Gemini API - System Two:** Mô hình ngôn ngữ lớn tổng hợp câu trả lời theo chuẩn mực văn phong hành chính của Đảng, bắt buộc viện dẫn Căn cứ pháp lý (Số hiệu văn bản, Điều, Khoản).

---

## 🏗️ Kiến trúc luồng xử lý (Pipeline)

```text
       ┌────────────────────────────────────────────────────────┐
       │             WEB ADMIN DASHBOARD (Port 3000)            │
       │  - Thêm / Sửa / Xóa văn bản & Điều khoản               │
       │  - Tự động bóc tách (Parser) văn bản từ văn bản thô   │
       │  - AI Playground: Test thử nghiệm RAG trực quan        │
       └──────────────────────────┬─────────────────────────────┘
                                  │ Đọc / Ghi
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │             POSTGRESQL DATABASE (Hoặc Local JSON)      │
       │  - Bảng `documents`: Số hiệu, Tên, Cơ quan, Thể loại   │
       │  - Bảng `articles`: Điều, Khoản, Nội dung, TSVector    │
       └──────────────────────────┬─────────────────────────────┘
                                  │
[Tin nhắn từ Zalo]                │ Truy xuất thời gian thực
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ 1. Jev Router │ ──────► │ 2. RAG Engine │ ──────► │ 3. Jev Filter │
└───────────────┘         └───────────────┘         └───────┬───────┘
                                                            │
                                                            ▼
┌───────────────┐         ┌────────────────┐        ┌───────────────┐
│ Gửi về Zalo   │ ◄────── │ 5. Guardrail   │ ◄───── │ 4. Gemini     │
└───────────────┘         └────────────────┘        └───────────────┘
```

---

## 📚 Kho dữ liệu văn bản Đảng & Thể thức tích hợp sẵn

| Số hiệu văn bản | Cơ quan ban hành | Chuyên mục | Nội dung trọng tâm |
| :--- | :--- | :--- | :--- |
| **17-HD/VPTW** | Văn phòng Trung ương Đảng | **Thể thức văn bản** | Thể thức bắt buộc, thẩm quyền ký (T/M, K/T, T/L, T/U), con dấu, cỡ chữ, phông chữ, canh lề |
| **05-HD/VPTW** | Văn phòng Trung ương Đảng | **Văn thư & Lưu trữ** | Lập hồ sơ công việc, thời hạn nộp lưu hồ sơ vào Lưu trữ cơ quan (sau 1 năm) |
| **06-HD/VPTW** | Văn phòng Trung ương Đảng | **Văn thư & Lưu trữ** | Xây dựng danh mục hồ sơ, thời hạn bảo quản (vĩnh viễn / có thời hạn), quy trình tiêu hủy tài liệu |
| **02/2019/TT-BNV**| Bộ Nội vụ | **Lưu trữ điện tử** | Tiêu chuẩn định dạng số hóa (PDF/A), siêu dữ liệu (metadata), tính toàn vẹn tài liệu điện tử |
| **24-QĐ/TW** | Ban Chấp hành Trung ương | **Quy định Đảng** | Thi hành Điều lệ Đảng (Tuổi đời, học vấn, đảng viên dự bị, tính tuổi đảng, sinh hoạt chi bộ...) |
| **37-QĐ/TW** | Ban Chấp hành Trung ương | **Quy định Đảng** | Về 19 điều đảng viên không được làm |
| **01-HD/TW** | Ban Bí thư | **Quy định Đảng** | Hướng dẫn thi hành Điều lệ Đảng (Hồ sơ kết nạp, thẩm tra lý lịch, chuyển sinh hoạt...) |
| **22-QĐ/TW** | Ban Chấp hành Trung ương | **Quy định Đảng** | Kiểm tra, giám sát và kỷ luật Đảng (Hình thức kỷ luật, thẩm quyền chi bộ, thời hiệu...) |

---

## 🌐 Web Admin Dashboard (Quản trị dữ liệu)

Khởi chạy máy chủ Web Admin:
```bash
npm run admin
```
Mở trình duyệt tại: `http://localhost:3000`

### Tính năng trên Web Admin:
1. **Tổng quan & Thống kê:** Theo dõi số lượng văn bản, tổng số điều khoản, phân loại thể thức, văn thư lưu trữ và trạng thái kết nối PostgreSQL.
2. **Quản lý Văn bản:** Tìm kiếm, lọc theo chuyên mục, xem chi tiết từng Điều/Khoản, xóa văn bản tức thời.
3. **Thêm văn bản & Bóc tách tự động (Auto Parser):** Dán văn bản toàn văn, hệ thống tự động bóc tách thành các Điều/Khoản có tiêu đề và nội dung để lưu vào DB.
4. **AI Playground:** Thử nghiệm câu hỏi ngay trên web để xem các Điều/Khoản nào được RAG truy xuất và chấm điểm.
5. **Nạp dữ liệu mẫu một chạm:** Đồng bộ ngay toàn bộ văn bản mẫu chuẩn vào PostgreSQL.

---

## 🐘 Cấu hình PostgreSQL

Để kích hoạt PostgreSQL, mở file `.env` và khai báo:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/zalo_dang_bot
```

Chạy lệnh khởi tạo bảng và nạp dữ liệu:
```bash
# Khởi tạo bảng schema
npm run db:init

# Đồng bộ toàn bộ văn bản mẫu vào PostgreSQL
npm run db:seed
```
*(Nếu chưa cấu hình PostgreSQL, hệ thống tự động chạy ở chế độ In-Memory / File JSON mà không phát sinh lỗi).*

---

## 🚀 Khởi chạy Bot Zalo

```bash
# 1. Kiểm tra tính toàn vẹn (Cú pháp & Smoke Test)
npm run check
npm test

# 2. Thử nghiệm hỏi đáp trên dòng lệnh (CLI)
npm run ask "Thẩm quyền ký T/M và K/T theo hướng dẫn 17 VPTW?"
npm run ask "Thời hạn nộp lưu hồ sơ vào lưu trữ cơ quan theo hướng dẫn 05 VPTW?"
npm run ask "Tiêu chuẩn định dạng văn bản nộp lưu theo thông tư 02 BNV?"
npm run ask "Đảng viên dự bị có quyền biểu quyết không?"

# 3. Khởi chạy Bot Zalo chính thức (Local Long Polling)
npm start
```

---

## ☁️ Triển khai lên Vercel (Miễn phí 0đ - Chạy 24/7 Webhook & Web Admin)

Hệ thống đã được đóng gói sẵn để chạy trọn vẹn cả **Zalo Bot Webhook** và **Web Admin Dashboard** trên Vercel:

### 1. Đẩy dự án lên Vercel
1. Đăng nhập [vercel.com](https://vercel.com) bằng tài khoản GitHub của bạn.
2. Bấm **Add New** $\rightarrow$ **Project** $\rightarrow$ Chọn repo `CuongBC195/zalo-bot`.
3. Trong phần **Environment Variables**, thêm các biến sau:
   * `DATABASE_URL`: Chuỗi kết nối PostgreSQL từ Supabase.
   * `ZALO_BOT_TOKEN`: Token Zalo Bot của bạn.
   * `GEMINI_API_KEY`: API Key Gemini của bạn.
   * `ADMIN_PASSWORD`: Mật khẩu đăng nhập Web Admin (ví dụ: `Admin@2026`).
4. Bấm **Deploy**. Sau ~1 phút, bạn sẽ nhận được đường dẫn dạng:
   `https://zalo-dang-bot.vercel.app`

### 2. Kích hoạt Webhook với Zalo Bot
Mở terminal trên máy và chạy lệnh sau (thay bằng URL Vercel của bạn):
```bash
npm run webhook:set https://zalo-dang-bot.vercel.app/api/webhook
```
*(Nếu muốn hủy Webhook để chuyển lại chạy máy cá nhân: `npm run webhook:delete`)*.

### 3. Truy cập Web Admin Dashboard:
Mở trình duyệt: `https://zalo-dang-bot.vercel.app` để quản lý văn bản Đảng, tài khoản và theo dõi lịch sử hỏi đáp trực tiếp trên đám mây!


---

## 📂 Cấu trúc thư mục

```text
zalo-bot/
├── .env.example              # Mẫu cấu hình (Zalo, DB, Gemini, Jev)
├── .gitignore                # Bảo mật token, biến môi trường và log
├── package.json              # Scripts và dependencies
├── data/
│   └── regulations/          # Kho văn bản chuẩn bị sẵn (JSON)
│       ├── hd-17-vptw.json   # Thể thức văn bản Đảng
│       ├── hd-05-vptw.json   # Văn thư & Nộp lưu hồ sơ Đảng
│       ├── hd-06-vptw.json   # Danh mục hồ sơ & Hủy tài liệu
│       ├── tt-02-2019-bnv.json # Lưu trữ điện tử
│       ├── qd-24-tw-2021.json
│       ├── qd-37-tw-2021.json
│       ├── hd-01-hd-tw.json
│       └── qd-22-tw-2021.json
├── src/
│   ├── index.js              # Entry point Bot Zalo
│   ├── config.js             # Cấu hình tập trung
│   ├── pipeline.js           # Điều phối Jev + RAG + Gemini
│   ├── db/                   # Quản trị PostgreSQL & Schema
│   │   ├── index.js          # Service DB CRUD & Full-text Search
│   │   └── schema.sql        # Cấu trúc bảng documents & articles
│   ├── admin/                # Web Admin Dashboard
│   │   ├── server.js         # Express REST API server
│   │   └── public/           # Giao diện Web (HTML, CSS, JS)
│   ├── jev/                  # TypeSafe Jev System 1
│   ├── rag/                  # RAG Engine (Postgres + Memory Fallback)
│   ├── gemini/               # Google Gemini System 2
│   └── zalo/                 # Zalo API Adapter & Polling
├── scripts/
│   ├── init-db.js            # Khởi tạo bảng PostgreSQL (npm run db:init)
│   ├── seed-db.js            # Đồng bộ dữ liệu vào PostgreSQL (npm run db:seed)
│   ├── test-pipeline.js      # CLI hỏi đáp trực tiếp (npm run ask)
│   └── ingest.js             # CLI kiểm tra kho dữ liệu (npm run ingest)
└── test/
    └── smoke.test.js         # Smoke test kiểm tra toàn diện
```
