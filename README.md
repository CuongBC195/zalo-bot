# 🇻🇳 Zalo Đảng AI Bot (v2.0)

Chatbot Zalo thông minh chuyên trách **giải đáp thắc mắc về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng Cộng sản Việt Nam**.

Dự án áp dụng mô hình kiến trúc hai hệ thống tư duy hiện đại:
* **Jev (TypeSafe `jev-1.13`) - System One:** Mô hình phán đoán nhanh đóng vai trò định tuyến ý định (Intent Routing), lọc/rerank đoạn trích (Relevance Gate) và kiểm duyệt chống ảo giác (Faithfulness Guardrail).
* **RAG (Retrieval-Augmented Generation):** Bóc tách, chỉ mục và truy xuất chính xác từng Chương, Điều, Khoản từ kho dữ liệu văn bản Đảng.
* **Google Gemini API - System Two:** Mô hình ngôn ngữ lớn tổng hợp câu trả lời theo chuẩn mực văn phong hành chính của Đảng, bắt buộc dẫn nguồn số hiệu văn bản, Điều và Khoản.

---

## 🏗️ Kiến trúc luồng xử lý (Pipeline)

```text
[Tin nhắn từ người dùng trên Zalo]
                │
                ▼
      ┌──────────────────┐
      │  Zalo Polling    │
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │ 1. Jev Router    │ ──(Chào hỏi/Help)──────► [Phản hồi hướng dẫn]
      │ (Choice primitive│ ──(Ngoài phạm vi)──────► [Lịch sự từ chối]
      └─────────┬────────┘
                │ (Hỏi quy định/thủ tục Đảng)
                ▼
      ┌──────────────────┐
      │ 2. RAG Engine    │ ──► Tìm kiếm các Điều/Khoản trong kho văn bản Đảng
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │ 3. Jev Reranker  │ ──► Lọc sạch nhiễu, chỉ giữ lại các đoạn trích
      │ (Noul primitive) │     trực tiếp giải đáp câu hỏi
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │ 4. Gemini GenAI  │ ──► Tổng hợp phản hồi trang trọng, chuẩn mực,
      │ (System Two)     │     bắt buộc viện dẫn Căn cứ pháp lý
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │ 5. Jev Guardrail │ ──► Kiểm tra: Có bịa đặt điều khoản ngoài context?
      │ (Noul primitive) │
      └─────────┬────────┘
                │
                ▼
[Gửi phản hồi đã định dạng về Zalo]
```

---

## 📚 Kho dữ liệu văn bản Đảng tích hợp sẵn

Hệ thống đã nạp sẵn cơ sở dữ liệu các văn bản cốt lõi tại thư mục `data/regulations/`:

| Số hiệu văn bản | Cơ quan ban hành | Ngày ban hành | Nội dung chính |
| :--- | :--- | :--- | :--- |
| **Quy định 24-QĐ/TW** | Ban Chấp hành Trung ương | 30/07/2021 | Quy định thi hành Điều lệ Đảng (Tuổi đời, học vấn, đảng viên dự bị, tuổi đảng, sinh hoạt chi bộ...) |
| **Quy định 37-QĐ/TW** | Ban Chấp hành Trung ương | 25/10/2021 | Về những điều đảng viên không được làm (19 điều cấm) |
| **Hướng dẫn 01-HD/TW** | Ban Bí thư | 28/09/2021 | Hướng dẫn cụ thể thi hành Điều lệ Đảng (Hồ sơ kết nạp, thẩm tra lý lịch, chuyển sinh hoạt...) |
| **Quy định 22-QĐ/TW** | Ban Chấp hành Trung ương | 28/07/2021 | Công tác kiểm tra, giám sát và kỷ luật của Đảng (Hình thức kỷ luật, thời hiệu, thẩm quyền...) |

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Cài đặt Dependencies

Yêu cầu Node.js >= 18.0.0.

```bash
npm install
```

### 2. Cấu hình biến môi trường (`.env`)

Sao chép file `.env.example` thành `.env` và điền các khóa API:

```bash
cp .env.example .env
```

Các biến cấu hình chính trong `.env`:
* `ZALO_BOT_TOKEN`: Token của Zalo Bot cấp trên cổng Zalo Developers.
* `GEMINI_API_KEY`: API Key của Google Gemini.
* `JEV_API_KEY`: API Key của TypeSafe Jev (nếu để trống, bot tự kích hoạt chế độ Heuristic Fallback nội bộ mà vẫn chạy mượt mà).

### 3. Kiểm tra tính toàn vẹn (Test & Lint)

```bash
# Kiểm tra cú pháp mã nguồn
npm run check

# Chạy Smoke Test kiểm tra Jev, RAG và Pipeline
npm test

# Kiểm tra kho tài liệu văn bản Đảng đã nạp
npm run ingest
```

### 4. Thử nghiệm hỏi đáp trực tiếp trên dòng lệnh (CLI)

Bạn có thể kiểm tra câu trả lời ngay trên Terminal mà không cần mở Zalo:

```bash
# Cú pháp: npm run ask "<câu hỏi>"
npm run ask "Tuổi đời và trình độ học vấn để được kết nạp Đảng quy định ra sao?"
npm run ask "Đảng viên dự bị có quyền biểu quyết không?"
npm run ask "Quy định 37 về những điều đảng viên không được làm?"
```

### 5. Khởi chạy Bot Zalo

Chế độ thông thường:
```bash
npm start
```

Chế độ Development (tự động reload khi sửa code):
```bash
npm run dev
```

Chạy nền bằng `screen` trên macOS / Linux:
```bash
screen -dmS zalo-dang-bot bash -lc 'npm start >> logs/bot.log 2>&1'
```

---

## 📂 Cấu trúc thư mục

```text
zalo-bot/
├── .env.example              # File mẫu cấu hình biến môi trường
├── .gitignore                # Danh sách loại trừ (bảo vệ bí mật và token)
├── package.json              # Khai báo dependencies và scripts
├── data/
│   └── regulations/          # Kho dữ liệu văn bản Đảng (JSON/Markdown)
│       ├── qd-24-tw-2021.json
│       ├── qd-37-tw-2021.json
│       ├── hd-01-hd-tw.json
│       └── qd-22-tw-2021.json
├── src/
│   ├── index.js              # Entry point khởi động bot
│   ├── config.js             # Quản lý cấu hình tập trung
│   ├── pipeline.js           # Điều phối luồng xử lý Jev + RAG + Gemini
│   ├── jev/                  # Module TypeSafe Jev (System 1)
│   │   ├── index.js          # Service Jev & Local Evaluator Fallback
│   │   ├── primitives.js     # Định nghĩa Choice, Score, Noul
│   │   └── prompts.js        # Các bộ câu hỏi phán đoán chuẩn hóa
│   ├── rag/                  # Module RAG Văn bản Đảng
│   │   ├── index.js          # Search & Retrieval Engine
│   │   └── loader.js         # Bóc tách Điều/Khoản văn bản
│   ├── gemini/               # Module Google Gemini API (System 2)
│   │   ├── index.js          # Client sinh phản hồi
│   │   └── prompts.js        # Chỉ dẫn văn phong hành chính Đảng
│   └── zalo/                 # Module kết nối Zalo Bot API
│       ├── api.js            # Adapter bọc API Zalo (phân đoạn tin nhắn)
│       └── polling.js        # Vòng lặp long-polling tuần tự
├── scripts/
│   ├── ingest.js             # CLI kiểm tra kho văn bản Đảng
│   └── test-pipeline.js      # CLI thử nghiệm hỏi đáp trực tiếp
└── test/
    └── smoke.test.js         # Smoke test toàn diện hệ thống
```

---

## ➕ Cách bổ sung văn bản Đảng mới

Để thêm một văn bản Đảng mới (ví dụ Quy định 69-QĐ/TW), bạn chỉ cần tạo một file JSON mới trong thư mục `data/regulations/` với cấu trúc:

```json
{
  "documentId": "69-QD/TW-2022",
  "documentCode": "69-QĐ/TW",
  "documentName": "Quy định kỷ luật tổ chức đảng, đảng viên vi phạm",
  "issuer": "Bộ Chính trị",
  "issueDate": "2022-07-06",
  "status": "Còn hiệu lực",
  "articles": [
    {
      "articleNumber": "1",
      "title": "Phạm vi điều chỉnh",
      "content": "Quy định này áp dụng đối với tổ chức đảng và đảng viên vi phạm..."
    }
  ]
}
```

Sau đó chạy `npm run ingest`, hệ thống sẽ tự động bóc tách và đưa vào chỉ mục RAG ngay lập tức!
