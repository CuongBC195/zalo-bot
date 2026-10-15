/**
 * Pipeline Orchestrator
 * Điều phối luồng xử lý 7 Tầng:
 * Tầng 0: Tiền xử lý nội bộ (0ms, lọc rác, lọc SQL injection, bung viết tắt)
 * Tầng Jev Router (0ms, phân loại ý định, chặn sớm)
 * Tầng Cache Read (0-5ms, Response Cache HIT < 10ms, 0 token)
 * Tầng 1: Gemini API Key 1 (Timeout 2.5s, Cross-Borrowing, Fail-open) + LEGACY_REPLACEMENT_MAP
 * Tầng RAG Search (PostgreSQL Supabase)
 * Tầng Jev Filter & Cắt tỉa ngữ cảnh (< 6500 ký tự)
 * Tầng 2: Gemini API Key 2 + Jev Guardrail & Lưu Cache
 */

const jev = require('./jev');
const rag = require('./rag');
const gemini = require('./gemini');
const db = require('./db');
const config = require('./config');

const { expandAbbreviations, buildCacheKey, extractDocNumbers, extractDocSignatures } = require('./rag/abbreviations');

// Bảng ánh xạ tự động mở rộng truy vấn từ văn bản hết hiệu lực sang văn bản hiện hành (Legacy Replacement Map)
const LEGACY_REPLACEMENT_MAP = [
  { pattern: /(24-q[đd]|232-q[đd]|294-q[đd]|quy\s*[đd][iị]nh\s*24\b|quy\s*[đd][iị]nh\s*232\b)/i, expansion: ' 208-QĐ/TW ' },
  { pattern: /(37-q[đd]|quy\s*[đd][iị]nh\s*37\b|kh[oô]ng\s*[đd][uư][oợ]c\s*l[aà]m|19\s*[đd]i[eề]u|[đd][aá]nh\s*b[aạ]c)/i, expansion: ' 207-QĐ/TW ' },
  { pattern: /(22-q[đd]|296-q[đd]|quy\s*[đd][iị]nh\s*22\b)/i, expansion: ' 21-QĐ/TW ' },
  { pattern: /(342-q[đd]|quy[eế]t\s*[đd][iị]nh\s*342\b)/i, expansion: ' 01-QĐ/TW ' },
  { pattern: /(35-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*35\b)/i, expansion: ' 24-HD/VPTW ' },
  { pattern: /(36-h[dđ]|66-q[đd]|h[uư][oơ]ng\s*d[aẫ]n\s*36\b)/i, expansion: ' 05-HD/VPTW 399-QĐ/TW ' },
  { pattern: /(01-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*01\b)/i, expansion: ' 02-HD/TW ' },
  { pattern: /(12-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*12\b)/i, expansion: ' 42-HD/BTCTW ' },
  { pattern: /(124-q[đd]|quy\s*[đd][iị]nh\s*124\b)/i, expansion: ' 366-QĐ/TW ' },
  // Ánh xạ chuyên đề nghiệp vụ cấp xã
  { pattern: /(ph[oô]ng\s*l[uư]u\s*tr[uữ]|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i).*?(c[aấ]p\s*x[aã]|x[aã]|ph[uư][oờ]ng)/i, expansion: ' 17-HD/VPTW ' },
  { pattern: /(tr[iì]nh\s*b[aày]\s*th[eể]\s*th[uứ]c|[đd][oó]ng\s*d[aấ]u\s*v[aă]n\s*b[aả]n)/i, expansion: ' 05-HD/VPTW 399-QĐ/TW ' },
  // Ánh xạ nghiệp vụ chi tiết: Giấy mời / Công văn triệu tập / Thư mời họp
  { pattern: /(gi[aấ]y\s*m[oờ]i|th[uư]\s*m[oờ]i|tri[eệ]u\s*t[aậ]p\s*h[oọ]p|c[oô]ng\s*v[aă]n\s*tri[eệ]u\s*t[aậ]p)/i, expansion: ' công văn triệu tập danh sách đại biểu khách mời hồ sơ hội nghị đại hội đảng bộ cấp xã 24-HD/VPTW ' },
  // Ánh xạ nghiệp vụ chi tiết: Phông chữ / Cỡ chữ (size) / Kiểu chữ / Căn lề thể thức Đảng
  { pattern: /(ph[oô]ng\s*ch[uữ]|c[oỡ]\s*ch[uữ]|size\s*ch[uữ]|ki[eể]u\s*ch[uữ]|c[aă]n\s*l[eề]|kh[oổ]\s*gi[aấ]y)/i, expansion: ' phông chữ cỡ chữ kiểu chữ Times New Roman thể thức và kỹ thuật trình bày văn bản Đảng 05-HD/VPTW ' },
];

function expandLegacyQuery(queryText) {
  let expanded = queryText;
  for (const item of LEGACY_REPLACEMENT_MAP) {
    if (item.pattern.test(queryText)) {
      expanded += item.expansion;
    }
  }

  // Phân biệt ngữ cảnh thời hạn bảo quản: Mặt trận / Đoàn thể (30-HD) vs Cấp tỉnh / Cấp xã (24-HD)
  const isThoiHan = /(th[oờ]i\s*h[aạ]n\s*b[aả]o\s*qu[aả]n|th[oờ]i\s*h[aạ]n\s*l[uư]u\s*tr[uữ]|b[aả]ng\s*th[oờ]i\s*h[aạ]n)/i.test(queryText);
  if (isThoiHan) {
    if (/(m[aặ]t\s*tr[aậ]n|mttq|[đd]o[aà]n\s*th[eể]|ch[ií]nh\s*tr[iị]\s*-\s*x[aã]\s*h[oộ]i)/i.test(queryText)) {
      expanded += ' 30-HD/VPTW ';
    } else if (/(c[aấ]p\s*x[aã]|c[aấ]p\s*t[iỉ]nh|x[aã]|ph[uư][oờ]ng|t[iỉ]nh\s*u[yỷ]|[đd][aả]ng\s*u[yỷ]|[đd][aả]ng\s*b[oộ]|vptw)/i.test(queryText)) {
      expanded += ' 24-HD/VPTW ';
    }
  }

  return expanded;
}

class PipelineResult {
  constructor(answer, intent, retrievedDocs = [], fromCache = false) {
    this.answer = answer;
    this.intent = intent;
    this.retrievedDocs = retrievedDocs;
    this.fromCache = fromCache;
  }

  toString() {
    return this.answer;
  }

  includes(...args) {
    return this.answer.includes(...args);
  }

  get length() {
    return this.answer.length;
  }

  toLowerCase() {
    return this.answer.toLowerCase();
  }

  toUpperCase() {
    return this.answer.toUpperCase();
  }

  slice(...args) {
    return this.answer.slice(...args);
  }
}

class PipelineOrchestrator {
  constructor() {
    this.rag = rag;
    this.jev = jev;
    this.gemini = gemini;
    this.db = db;
  }

  /**
   * Khởi chạy nạp tài liệu cho pipeline
   */
  async init() {
    await this.rag.init();
  }

  /**
   * Xử lý một tin nhắn từ người dùng theo chuẩn Luồng Thực Thi 7 Tầng:
   * Tầng 0 (0ms): Tiền xử lý nội bộ (Lọc rỗng, lệnh nhanh, lọc chuỗi rác, lọc SQL injection, bung viết tắt)
   * Tầng Jev Router (0ms): Phán đoán intent (chào hỏi / ngoài phạm vi trả về ngay)
   * Tầng Cache Read (0-5ms): Tra cứu Response Cache (hit trả về ngay < 10ms, 0 token)
   * Tầng 1: Gemini API Key 1 (Timeout 2.5s, Cross-Borrowing, Fail-open) + LEGACY_REPLACEMENT_MAP
   * Tầng RAG Search: Truy xuất tài liệu từ Supabase PostgreSQL
   * Tầng Jev Filter & Context Trimming: Lọc độ liên quan và định dạng context (< 6500 ký tự)
   * Tầng 2: Gemini API Key 2 sinh câu trả lời + Jev Guardrail & Lưu Response Cache
   * @param {object} param0
   * @returns {Promise<PipelineResult>} Kết quả câu trả lời kèm metadata
   */
  async processMessage({ text = '', senderName = 'Đồng chí', skipCache = false }) {
    const rawQuery = (text || '').trim();
    if (!rawQuery) {
      return new PipelineResult('Vui lòng nhập câu hỏi hoặc nội dung quy định cần tra cứu.', 'empty', []);
    }

    // =========================================================================
    // TẦNG 0: TIỀN XỬ LÝ NỘI BỘ (0ms, 0đ token)
    // =========================================================================
    // 0.1. Xử lý các lệnh nhanh
    if (rawQuery.startsWith('/')) {
      const cmdAnswer = await this._handleCommand(rawQuery);
      return new PipelineResult(cmdAnswer, 'command', []);
    }

    // 0.2. Chốt chặn chuỗi rác / ký tự đặc biệt / độ dài không đủ
    if (rawQuery.length < 3 || /^[\d\s\W_]+$/i.test(rawQuery)) {
      const invalidText = (
        `Chào ${senderName},\n\n` +
        `Nội dung tra cứu chưa rõ ràng. Đồng chí vui lòng nhập câu hỏi hoặc số hiệu văn bản cụ thể cần tìm hiểu ` +
        `(ví dụ: "Thẩm quyền ký T/M", "Quy định 37 về 19 điều cấm", "Thời hạn nộp lưu hồ sơ").`
      );
      return new PipelineResult(invalidText, 'invalid_or_empty', []);
    }

    // 0.3. Lọc bỏ mã độc SQL rác nếu có
    const sqlInjectionPattern = /(union\s+select|insert\s+into|drop\s+table|delete\s+from|update\s+\w+\s+set|exec\s*\(|execute\s*\(|--|\bselect\s+.*?\s+from)/i;
    if (sqlInjectionPattern.test(rawQuery)) {
      const secNotice = (
        `Chào ${senderName},\n\n` +
        `Yêu cầu tra cứu không hợp lệ theo quy chế an toàn thông tin. Đồng chí vui lòng nhập câu hỏi nghiệp vụ hoặc số hiệu văn bản Đảng cụ thể.`
      );
      return new PipelineResult(secNotice, 'invalid_or_empty', []);
    }

    // 0.4. Bung từ viết tắt nội bộ bằng từ điển ABBR_MAP
    const expandedLocal = expandAbbreviations(rawQuery);

    // =========================================================================
    // TẦNG JEV ROUTER (0ms, 0đ token)
    // =========================================================================
    const route = await this.jev.routeIntent(expandedLocal);
    console.log(`[Pipeline] Ý định nhận diện: ${route.intent} (độ tin cậy: ${Math.round(route.confidence * 100)}%)`);

    if (route.intent === 'invalid_or_empty') {
      const invalidText = (
        `Chào ${senderName},\n\n` +
        `Nội dung tra cứu chưa rõ ràng. Đồng chí vui lòng nhập câu hỏi hoặc số hiệu văn bản cụ thể cần tìm hiểu ` +
        `(ví dụ: "Thẩm quyền ký T/M", "Quy định 37 về 19 điều cấm", "Thời hạn nộp lưu hồ sơ").`
      );
      return new PipelineResult(invalidText, route.intent, []);
    }

    if (route.intent === 'greeting_or_help') {
      return new PipelineResult(this._buildGreeting(senderName), route.intent, []);
    }

    if (route.intent === 'out_of_scope') {
      const outText = (
        `Chào ${senderName},\n\n` +
        `Tôi là Trợ lý AI chuyên trách hỗ trợ tra cứu về Cương lĩnh, Điều lệ, Quy định của Đảng, Thể thức văn bản và Công tác văn thư lưu trữ.\n\n` +
        `Nội dung câu hỏi của đồng chí nằm ngoài phạm vi nghiệp vụ được phân công. Đồng chí vui lòng đặt các câu hỏi thuộc các lĩnh vực sau:\n` +
        `• Thể thức và kỹ thuật trình bày văn bản Đảng (HD 05-HD/VPTW ngày 27/05/2026, QĐ 399-QĐ/TW, thẩm quyền ký T/M, K/T, con dấu, chữ ký số...)\n` +
        `• Công tác văn thư và lưu trữ cơ quan Đảng (HD 06-HD/VPTW ngày 29/05/2026, QĐ 383-QĐ/TW về Phông lưu trữ Đảng, Luật Lưu trữ 2024, nộp lưu hồ sơ...)\n` +
        `• Điều lệ, kỷ luật và nghiệp vụ công tác Đảng (Quy định 208-QĐ/TW, Quy định 207-QĐ/TW, Hướng dẫn 02-HD/TW, Quy định 21-QĐ/TW, Quy định 01-QĐ/TW...)`
      );
      return new PipelineResult(outText, route.intent, []);
    }

    // =========================================================================
    // TẦNG CACHE READ (0 - 5ms, 0đ token)
    // =========================================================================
    const cacheKey = buildCacheKey(expandedLocal);
    if (!skipCache) {
      const cached = await this.db.getCachedResponse(cacheKey);
      if (cached && cached.response_text) {
        console.log(`[Pipeline] Cache hit cho key "${cacheKey}" (lượt truy cập thứ: ${cached.hit_count})`);
        return new PipelineResult(cached.response_text, cached.intent || route.intent, cached.retrieved_doc_codes || [], true);
      }
    }

    // =========================================================================
    // TẦNG 1: GEMINI API KEY 1 (Timeout 2.5s, Fail-open) + LEGACY_REPLACEMENT_MAP
    // =========================================================================
    console.log(`[Pipeline] Tầng 1: Đang chuẩn hóa và mở rộng từ khóa với Gemini Key 1: "${rawQuery}"...`);
    let rewrittenQuery = expandedLocal;
    try {
      rewrittenQuery = await this.gemini.rewriteQuery(rawQuery, expandedLocal);
    } catch (normErr) {
      console.warn(`[Pipeline] Tầng 1 gặp lỗi nhẹ, dùng expandedLocal fallback:`, normErr.message);
      rewrittenQuery = expandedLocal;
    }

    // Kết hợp câu hỏi gốc với kết quả chuẩn hóa từ Key 1 để tăng độ phủ Full-Text Search
    let searchTarget = `${expandedLocal} ${rewrittenQuery}`.trim();

    // Tự động bổ sung định danh khung phân loại nếu hỏi về phân loại hồ sơ chuyên ngành
    if (
      /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(searchTarget) &&
      /(ban\s*t[oổ]\s*ch[uứ]c|u[yỷ]\s*ban\s*ki[eể]m\s*tra|ubkt|tuy[eê]n\s*gi[aá]o|tr[uư][oờ]ng\s*ch[ií]nh\s*tr[iị]|m[aặ]t\s*tr[aậ]n|mttq|li[eê]n\s*[đd]o[aà]n\s*lao\s*[đd][oộ]ng|l[đd]l[đd]|n[oô]ng\s*d[aâ]n|ph[uụ]\s*n[uữ]|c[uự]u\s*chi[eế]n\s*binh|[đd]o[aà]n\s*thanh\s*ni[eê]n|[đd]o[aà]n\s*tncs|qu[aâ]n\s*s[uự]|c[oô]ng\s*an)/i.test(searchTarget)
    ) {
      if (!searchTarget.includes('KHUNG-PHAN-LOAI-VPTW')) {
        searchTarget += ' KHUNG-PHAN-LOAI-VPTW';
      }
    }

    const searchQuery = expandLegacyQuery(searchTarget);
    console.log(`[Pipeline] Tầng RAG: Đang truy xuất tài liệu với truy vấn: "${searchQuery}"`);

    // =========================================================================
    // TẦNG RAG SEARCH (PostgreSQL Supabase)
    // =========================================================================
    let candidatePassages = await this.rag.search(searchQuery, { topK: config.rag.topK || 8 });

    // Hỗ trợ câu hỏi đa lĩnh vực / có đánh số mục (1)... (2)...
    const matchSubParts = expandedLocal.match(/(?:(?:\(1\)|1\.|thứ nhất)\s*)([\s\S]*?)(?:(?:\(2\)|2\.|thứ hai)\s*)([\s\S]*)/i);
    const hasFormatting = /(thể\s*thức|đóng\s*dấu|chữ\s*ký\s*số|thẩm\s*quyền\s*ký)/i.test(expandedLocal);
    const hasArchiving = /(lưu\s*trữ|phông|chỉnh\s*lý|thời\s*hạn\s*bảo\s*quản|thời\s*hạn\s*lưu|danh\s*mục\s*hồ\s*sơ)/i.test(expandedLocal);

    if (matchSubParts) {
      const q1 = expandLegacyQuery(expandAbbreviations(matchSubParts[1]));
      const q2 = expandLegacyQuery(expandAbbreviations(matchSubParts[2]));
      const [r1, r2] = await Promise.all([
        this.rag.search(q1, { topK: 6 }),
        this.rag.search(q2, { topK: 6 }),
      ]);
      const combined = [];
      const maxLen = Math.max((r1 || []).length, (r2 || []).length);
      for (let i = 0; i < maxLen; i++) {
        if (r1 && r1[i]) combined.push(r1[i]);
        if (r2 && r2[i]) combined.push(r2[i]);
      }
      if (candidatePassages) combined.push(...candidatePassages);
      const seen = new Set();
      const merged = [];
      for (const p of combined) {
        const uid = `${p.documentCode || p.documentId}_${p.articleNumber}`;
        if (!seen.has(uid)) {
          seen.add(uid);
          merged.push(p);
        }
      }
      candidatePassages = merged;
    } else if (hasFormatting && hasArchiving && candidatePassages.length < 8) {
      const qFormat = expandLegacyQuery('thể thức và kỹ thuật trình bày văn bản Đảng đóng dấu văn bản');
      const extraRes = await this.rag.search(qFormat, { topK: 4 });
      const combined = [...(candidatePassages || []), ...(extraRes || [])];
      const seen = new Set();
      const merged = [];
      for (const p of combined) {
        const uid = `${p.documentCode || p.documentId}_${p.articleNumber}`;
        if (!seen.has(uid)) {
          seen.add(uid);
          merged.push(p);
        }
      }
      candidatePassages = merged;
    }

    // Điều kiện Lazy Retry nếu vẫn bị miss tài liệu
    if (!candidatePassages || candidatePassages.length === 0) {
      console.log(`[Pipeline] RAG chưa có kết quả, kích hoạt Retry với câu gốc...`);
      candidatePassages = await this.rag.search(expandLegacyQuery(expandedLocal), { topK: 8 });
    }

    if (!candidatePassages || !candidatePassages.length) {
      const notFoundText = (
        `Chào ${senderName},\n\n` +
        `Hiện tại trong kho dữ liệu văn bản Đảng của hệ thống chưa tìm thấy quy định nào điều chỉnh trực tiếp nội dung:\n` +
        `"${rawQuery}"\n\n` +
        `Gợi ý:\n` +
        `• Đồng chí có thể thử tìm bằng từ khóa cụ thể hơn (ví dụ: "tuổi kết nạp", "quy định 37", "thời hạn dự bị").\n` +
        `• Gõ /docs để xem danh mục các văn bản Đảng hiện có trong kho dữ liệu.`
      );
      return new PipelineResult(notFoundText, route.intent, []);
    }

    // =========================================================================
    // TẦNG JEV FILTER & CẮT TỈA NGỮ CẢNH (< 6500 ký tự)
    // =========================================================================
    console.log(`[Pipeline] Jev đang lọc ${candidatePassages.length} đoạn trích liên quan...`);
    const filteredPassages = await this.jev.filterRelevantPassages(expandedLocal, candidatePassages);
    let rawPassages = filteredPassages.length > 0 ? filteredPassages : candidatePassages.slice(0, 8);

    // Document Diversity: Giới hạn tối đa trích đoạn trên mỗi văn bản để đảm bảo tính đa dạng
    const isKhungPhanLoai = /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(expandedLocal);
    const docNumbersInQuery = extractDocNumbers(expandedLocal).filter(n => !(parseInt(n, 10) > 1900 && parseInt(n, 10) < 2100));
    const isSingleDocQuery = docNumbersInQuery.length === 1;

    const docPassageCount = {};
    let diversified = [];
    for (const p of rawPassages) {
      const c = p.documentCode || p.documentId;
      docPassageCount[c] = (docPassageCount[c] || 0) + 1;
      let maxCapForDoc = 3;
      if (c === 'KHUNG-PHAN-LOAI-VPTW' && isKhungPhanLoai) {
        maxCapForDoc = 6;
      } else if (isSingleDocQuery) {
        maxCapForDoc = 6;
      }
      if (docPassageCount[c] <= maxCapForDoc) {
        diversified.push(p);
      }
    }
    if (diversified.length < 6) {
      for (const p of rawPassages) {
        if (!diversified.includes(p)) {
          diversified.push(p);
          if (diversified.length >= 8) break;
        }
      }
    }
    let finalPassages = diversified.slice(0, 8);
    const docCodes = [...new Set(finalPassages.map(p => p.documentCode || p.documentId).filter(Boolean))];

    console.log(`[Pipeline] Giữ lại ${finalPassages.length} đoạn trích đạt chuẩn.`);
    const context = this.rag.formatContext(finalPassages);

    // =========================================================================
    // TẦNG 2: GEMINI API KEY 2 + TẦNG JEV GUARDRAIL & LƯU CACHE
    // =========================================================================
    // Dùng expandedLocal (câu hỏi rõ nghĩa của người dùng) làm trọng tâm trả lời để tránh bị nhiễu bởi các từ khóa mở rộng
    console.log(`[Pipeline] Đang gửi context tới Gemini Key 2 để sinh câu trả lời...`);
    let answer = await this.gemini.generateAnswer(expandedLocal, context);

    // Kiểm tra tính xác thực (Faithfulness Check)
    let isFaithful = true;
    if (config.jev.enableGuardrails) {
      console.log(`[Pipeline] Jev đang kiểm tra tính xác thực (Guardrail)...`);
      const check = await this.jev.checkFaithfulness(context, answer);
      isFaithful = check.isFaithful;
      if (!check.isFaithful) {
        console.warn(`[Pipeline] Cảnh báo: Câu trả lời có nguy cơ không khớp tài liệu trích dẫn!`);
        answer += `\n\nLưu ý: Nội dung trên được tổng hợp tự động; đồng chí vui lòng đối chiếu lại văn bản gốc trước khi áp dụng chính thức.`;
      }
    }

    // Lưu Response Cache (TTL 48 giờ) nếu câu trả lời hợp lệ
    const isNetworkOrFallback = (
      answer.includes('Lưu ý: Hệ thống đang hoạt động ở chế độ dự phòng') ||
      answer.includes('Hiện tại các API Key cấu hình cho Gemini đều tạm thời bị giới hạn') ||
      answer.includes('Lỗi hệ thống khi tạo câu trả lời') ||
      answer.includes('chưa có thông tin quy định chi tiết')
    );

    if (isFaithful && !isNetworkOrFallback) {
      await this.db.setCachedResponse({
        cacheKey,
        originalQuery: rawQuery,
        intent: route.intent,
        retrievedDocs: docCodes,
        responseText: answer,
        ttlHours: 48,
      });
      console.log(`[Pipeline] Đã lưu câu trả lời vào Response Cache với key: "${cacheKey}"`);
    }

    return new PipelineResult(answer, route.intent, docCodes, false);
  }

  /**
   * Xử lý các lệnh nhanh bắt đầu bằng /
   */
  async _handleCommand(command) {
    const cmd = command.toLowerCase().trim().split(/\s+/)[0];

    if (cmd === '/docs') {
      const chunks = this.rag.chunks || [];
      const docMap = new Map();
      for (const c of chunks) {
        const code = c.documentCode || c.documentId;
        if (code && !docMap.has(code)) {
          docMap.set(code, {
            code,
            name: c.documentName,
            issuer: c.issuer,
            status: c.status || 'Còn hiệu lực',
          });
        }
      }

      let list = '';
      let idx = 1;
      for (const d of docMap.values()) {
        list += `${idx++}. [${d.code}] ${d.name}\n   • Cơ quan: ${d.issuer} | Hiệu lực: ${d.status}\n`;
      }

      return (
        `DANH MỤC VĂN BẢN ĐẢNG & VĂN THƯ LƯU TRỮ TRONG CƠ SỞ DỮ LIỆU:\n\n` +
        list +
        `\nTổng cộng: ${docMap.size} văn bản. Đồng chí có thể tra cứu theo số hiệu (ví dụ: "05-HD/VPTW", "399-QĐ/TW", "24-HD/VPTW").`
      );
    }

    if (cmd === '/help') {
      return (
        `HƯỚNG DẪN TRA CỨU QUY ĐỊNH ĐẢNG & VĂN THƯ LƯU TRỮ:\n\n` +
        `Đồng chí có thể đặt câu hỏi bằng ngôn ngữ tự nhiên về các chuyên đề:\n` +
        `1. Thể thức và kỹ thuật trình bày văn bản Đảng (QĐ 399-QĐ/TW, HD 05-HD/VPTW: thẩm quyền ký T/M, K/T, đóng dấu, phông chữ...)\n` +
        `2. Thời hạn lưu trữ hồ sơ tài liệu cơ quan Đảng (HD 24-HD/VPTW, Luật Lưu trữ 2024)\n` +
        `3. Điều lệ và kỷ luật Đảng (QĐ 208-QĐ/TW, QĐ 207-QĐ/TW về 19 điều cấm, QĐ 21-QĐ/TW, QĐ 144-QĐ/TW)\n` +
        `4. Lập hồ sơ, nộp lưu tài liệu và chỉnh lý phông lưu trữ (HD 06-HD/VPTW, HD 17-HD/VPTW, HD 50-HD/VPTW)\n\n` +
        `Một số lệnh hỗ trợ:\n` +
        `• /docs: Xem danh mục văn bản trong hệ thống\n` +
        `• /ping: Kiểm tra trạng thái máy chủ bot\n` +
        `• /help: Xem hướng dẫn sử dụng`
      );
    }

    if (cmd === '/ping') {
      const docCount = this.rag.chunks ? this.rag.chunks.length : 0;
      return (
        `TRẠNG THÁI HỆ THỐNG ZALO BOT:\n` +
        `• Máy chủ: Hoạt động bình thường\n` +
        `• Số điều khoản văn bản Đảng đã nạp: ${docCount}\n` +
        `• Thời gian phản hồi: Bình thường\n` +
        `• Đơn vị vận hành: Đảng ủy xã Thạnh Phú`
      );
    }

    return (
      `Lệnh "${command}" không được nhận dạng. Gõ /help để xem các lệnh hỗ trợ hoặc đặt câu hỏi tra cứu trực tiếp.`
    );
  }

  /**
   * Tạo thông điệp chào mừng và hướng dẫn
   */
  _buildGreeting(senderName) {
    return (
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `ĐẢNG BỘ TỈNH ĐỒNG NAI\n` +
      `ĐẢNG ỦY XÃ THẠNH PHÚ\n` +
      `HỆ THỐNG TRỢ LÝ AI TRA CỨU QUY ĐỊNH ĐẢNG\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Chào ${senderName},\n\n` +
      `Tôi là trợ lý AI chuyên giải đáp các thắc mắc về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng Cộng sản Việt Nam.\n\n` +
      `CÁC CHUYÊN MỤC HỖ TRỢ CHÍNH (CẬP NHẬT MỚI NHẤT ĐẾN THÁNG 10/2026):\n` +
      `• Thể thức và kỹ thuật trình bày văn bản Đảng (Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 và Quy định số 399-QĐ/TW ngày 09/01/2026: thẩm quyền ký T/M, K/T, con dấu, chữ ký số, 25 thể loại văn bản...).\n` +
      `• Công tác văn thư và lưu trữ cơ quan Đảng (Hướng dẫn số 06-HD/VPTW ngày 29/05/2026, Quy định số 383-QĐ/TW ngày 19/11/2025 về Phông lưu trữ Đảng, Luật Lưu trữ số 33/2024/QH15 hiệu lực từ 01/07/2025).\n` +
      `• Điều lệ, kỷ cương và đạo đức đảng viên (Quy định số 208-QĐ/TW năm 2026 thi hành Điều lệ Đảng; Quy định số 207-QĐ/TW năm 2026 về 19 điều đảng viên không được làm; Quy định số 01-QĐ/TW năm 2026 về chế độ đảng phí; Quy định 144-QĐ/TW về chuẩn mực đạo đức cách mạng; Chỉ thị 45-CT/TW về Đại hội XIV).\n\n` +
      `MỘT SỐ CÂU HỎI MẪU:\n` +
      `• "Thẩm quyền ký thay mặt T/M và ký thay K/T theo Hướng dẫn 05/2026 quy định thế nào?"\n` +
      `• "Hệ thống 25 thể loại văn bản của Đảng theo Quy định 399-QĐ/TW gồm những gì?"\n` +
      `• "Quy chuẩn kỹ thuật chữ ký số trên văn bản điện tử của Đảng theo Hướng dẫn 05/2026?"\n` +
      `• "Mức đóng đảng phí theo Quy định số 01-QĐ/TW năm 2026 được tính như thế nào?"\n` +
      `• "Những điều đảng viên không được làm theo Quy định mới 207-QĐ/TW năm 2026?"\n` +
      `• "Quy định về thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành theo Hướng dẫn 06/2026?"\n\n` +
      `Gõ /docs để tra cứu toàn bộ danh mục văn bản hiện có trong cơ sở dữ liệu.`
    );
  }
}

module.exports = new PipelineOrchestrator();
