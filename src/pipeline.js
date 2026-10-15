/**
 * Pipeline Orchestrator
 * Điều phối toàn bộ luồng Jev (System 1) + RAG + Gemini (System 2)
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
  // Hướng dẫn 35-HD/VPTW năm 2010 về thời hạn bảo quản tài liệu -> thay thế bởi 24-HD/VPTW ngày 03/10/2026
  { pattern: /(35-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*35\b)/i, expansion: ' 24-HD/VPTW ' },
  // 17-HD/VPTW ngày 31/07/2026 là văn bản hiện hành về lập phông và phân loại cấp xã (KHÔNG chuyển hướng sang thể thức)
  // Chỉ chuyển hướng 36-HD/VPTW 2018 và 66-QĐ/TW về thể thức sang 05-HD/VPTW và 399-QĐ/TW
  { pattern: /(36-h[dđ]|66-q[đd]|h[uư][oơ]ng\s*d[aẫ]n\s*36\b)/i, expansion: ' 05-HD/VPTW 399-QĐ/TW ' },
  { pattern: /(01-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*01\b)/i, expansion: ' 02-HD/TW ' },
  { pattern: /(12-h[dđ]|h[uư][oơ]ng\s*d[aẫ]n\s*12\b)/i, expansion: ' 42-HD/BTCTW ' },
  { pattern: /(124-q[đd]|quy\s*[đd][iị]nh\s*124\b)/i, expansion: ' 366-QĐ/TW ' },
  // Ánh xạ chuyên đề nghiệp vụ cấp xã
  { pattern: /(ph[oô]ng\s*l[uư]u\s*tr[uữ]|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i).*?(c[aấ]p\s*x[aã]|x[aã]|ph[uư][oờ]ng)/i, expansion: ' 17-HD/VPTW ' },
  { pattern: /(tr[iì]nh\s*b[aày]\s*th[eể]\s*th[uứ]c|[đd][oó]ng\s*d[aấ]u\s*v[aă]n\s*b[aả]n)/i, expansion: ' 05-HD/VPTW 399-QĐ/TW ' },
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
   * Xử lý một tin nhắn từ người dùng theo kiến trúc tối ưu 5 bước:
   * Bước 0 (0ms): Kiểm tra lệnh / và chuỗi rác/chuỗi rỗng
   * Bước 1 (0ms): Bung từ viết tắt nội bộ bằng expandAbbreviations
   * Bước 2 (0ms): Phán đoán intent với Jev (chào hỏi / ngoài phạm vi trả về ngay)
   * Bước 3 (0-5ms): Tra cứu Response Cache (hit trả về ngay < 10ms, tốn 0 token)
   * Bước 4: Truy xuất RAG Lượt 1 + Lazy Rewriting nếu hụt tài liệu
   * Bước 5: Lọc Jev + Sinh câu trả lời Gemini + Guardrail + Lưu Response Cache
   * @param {object} param0
   * @returns {Promise<PipelineResult>} Kết quả câu trả lời kèm metadata
   */
  async processMessage({ text = '', senderName = 'Đồng chí' }) {
    const rawQuery = text.trim();
    if (!rawQuery) {
      return new PipelineResult('Vui lòng nhập câu hỏi hoặc nội dung quy định cần tra cứu.', 'empty', []);
    }

    // Bước 0. Xử lý các lệnh nhanh
    if (rawQuery.startsWith('/')) {
      const cmdAnswer = await this._handleCommand(rawQuery);
      return new PipelineResult(cmdAnswer, 'command', []);
    }

    // Bước 0. CHỐT CHẶN CHUỖI RÁC / KÝ TỰ ĐẶC BIỆT (Early return: 0ms, 0đ token)
    if (rawQuery.length < 3 || /^[\d\s\W_]+$/i.test(rawQuery)) {
      const invalidText = (
        `Chào ${senderName},\n\n` +
        `Nội dung tra cứu chưa rõ ràng. Đồng chí vui lòng nhập câu hỏi hoặc số hiệu văn bản cụ thể cần tìm hiểu ` +
        `(ví dụ: "Thẩm quyền ký T/M", "Quy định 37 về 19 điều cấm", "Thời hạn nộp lưu hồ sơ").`
      );
      return new PipelineResult(invalidText, 'invalid_or_empty', []);
    }

    // Bước 1. BUNG TỪ VIẾT TẮT NỘI BỘ (0ms, 0đ token)
    let expandedQuery = expandAbbreviations(rawQuery);

    // Bước 2. TẦNG JEV: Phân loại ý định & Chặn sớm chào hỏi / ngoài phạm vi (0ms, 0đ token)
    const route = await this.jev.routeIntent(expandedQuery);
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

    // Bước 3. TRA CỨU RESPONSE CACHE (0 - 5ms, 0đ token)
    const cacheKey = buildCacheKey(expandedQuery);
    const cached = await this.db.getCachedResponse(cacheKey);
    if (cached && cached.response_text) {
      console.log(`[Pipeline] Cache hit cho key "${cacheKey}" (lượt truy cập thứ: ${cached.hit_count})`);
      return new PipelineResult(cached.response_text, cached.intent || route.intent, cached.retrieved_doc_codes || [], true);
    }

    // Tự động mở rộng truy vấn nếu hỏi về khung phân loại / phương án phân loại của các cơ quan địa phương
    if (
      /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(expandedQuery) &&
      /(ban\s*t[oổ]\s*ch[uứ]c|u[yỷ]\s*ban\s*ki[eể]m\s*tra|ubkt|tuy[eê]n\s*gi[aá]o|tr[uư][oờ]ng\s*ch[ií]nh\s*tr[iị]|m[aặ]t\s*tr[aậ]n|mttq|li[eê]n\s*[đd]o[aà]n\s*lao\s*[đd][oộ]ng|l[đd]l[đd]|n[oô]ng\s*d[aâ]n|ph[uụ]\s*n[uữ]|c[uự]u\s*chi[eế]n\s*binh|[đd]o[aà]n\s*thanh\s*ni[eê]n|[đd]o[aà]n\s*tncs|qu[aâ]n\s*s[uự]|c[oô]ng\s*an)/i.test(expandedQuery)
    ) {
      if (!expandedQuery.includes('KHUNG-PHAN-LOAI-VPTW')) {
        expandedQuery += ' KHUNG-PHAN-LOAI-VPTW';
      }
    }

    // Bước 4. TẦNG RAG LƯỢT 1 & LAZY REWRITING (Fallback-on-Miss)
    const searchQuery = expandLegacyQuery(expandedQuery);
    console.log(`[Pipeline] Đang truy xuất tài liệu từ RAG lượt 1: "${searchQuery}"`);
    let candidatePassages = await this.rag.search(searchQuery, { topK: 8 });
    let effectiveQuery = expandedQuery;

    // Hỗ trợ câu hỏi đa lĩnh vực / có đánh số mục (1)... (2)...
    const matchSubParts = expandedQuery.match(/(?:(?:\(1\)|1\.|thứ nhất)\s*)([\s\S]*?)(?:(?:\(2\)|2\.|thứ hai)\s*)([\s\S]*)/i);
    const hasFormatting = /(thể\s*thức|đóng\s*dấu|chữ\s*ký\s*số|thẩm\s*quyền\s*ký)/i.test(expandedQuery);
    const hasArchiving = /(lưu\s*trữ|phông|chỉnh\s*lý|thời\s*hạn\s*bảo\s*quản|thời\s*hạn\s*lưu|danh\s*mục\s*hồ\s*sơ)/i.test(expandedQuery);

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

    // Điều kiện Lazy Rewriting:
    // 1. Câu hỏi tiếng Việt không dấu VÀ kết quả RAG lượt 1 có điểm khớp thấp, HOẶC
    // 2. Kết quả RAG lượt 1 trả về rỗng (candidatePassages.length === 0) do người dùng gõ sai chính tả nặng
    const hasVietnameseAccent = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(rawQuery);
    const firstScore = Number(candidatePassages?.[0]?.rank ?? candidatePassages?.[0]?.score ?? 0);
    const isLowScoreMatch = !candidatePassages || candidatePassages.length === 0 || firstScore < 5.0;
    const isMiss = !candidatePassages || candidatePassages.length === 0;

    if ((!hasVietnameseAccent && isLowScoreMatch) || isMiss) {
      console.log(`[Pipeline] Kích hoạt Lazy Query Rewriting (tiếng Việt không dấu hoặc hụt tài liệu)...`);
      const rewritten = await this.gemini.rewriteQuery(rawQuery);
      if (rewritten && rewritten !== rawQuery) {
        effectiveQuery = rewritten;
        const retrySearchQuery = expandLegacyQuery(expandAbbreviations(rewritten));
        console.log(`[Pipeline] Đang truy xuất tài liệu từ RAG lượt 2 với truy vấn chuẩn hóa: "${retrySearchQuery}"`);
        candidatePassages = await this.rag.search(retrySearchQuery, { topK: 8 });
      }
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

    // Bước 5. TẦNG JEV: Lọc và Rerank các đoạn trích (System One Relevance Filter)
    console.log(`[Pipeline] Jev đang lọc ${candidatePassages.length} đoạn trích liên quan...`);
    const filteredPassages = await this.jev.filterRelevantPassages(effectiveQuery, candidatePassages);
    let rawPassages = filteredPassages.length > 0 ? filteredPassages : candidatePassages.slice(0, 8);

    // Document Diversity: Cho phép lấy tối đa 6 điều khoản cho KHUNG-PHAN-LOAI-VPTW hoặc câu hỏi 1 văn bản đích danh
    const isKhungPhanLoai = /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(expandedQuery);
    const docNumbersInQuery = extractDocNumbers(expandedQuery).filter(n => !(parseInt(n, 10) > 1900 && parseInt(n, 10) < 2100));
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

    // Bước 5. TẦNG GEMINI: Tổng hợp câu trả lời chuẩn hành chính Đảng
    console.log(`[Pipeline] Đang gửi context tới Gemini để sinh câu trả lời...`);
    let answer = await this.gemini.generateAnswer(effectiveQuery, context);

    // Bước 5. TẦNG JEV GUARDRAIL: Kiểm tra tính trung thực (Faithfulness Check)
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

    // Bước 5. LƯU RESPONSE CACHE (TTL 48 giờ) nếu câu trả lời hợp lệ
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

  async _handleCommand(command) {
    const cmd = command.toLowerCase().split(/\s+/)[0];

    switch (cmd) {
      case '/start':
      case '/help':
        return this._buildGreeting();

      case '/docs': {
        const chunks = this.rag.chunks || [];
        const docMap = new Map();
        for (const c of chunks) {
          const code = c.documentCode || c.documentId;
          if (code && !docMap.has(code)) {
            docMap.set(code, {
              code,
              name: c.documentName,
              issuer: c.issuer,
              issueDate: c.issueDate,
              status: c.status || 'Còn hiệu lực',
            });
          }
        }

        let listText = '';
        let i = 1;
        for (const doc of docMap.values()) {
          listText += `${i++}. [${doc.status}] ${doc.code} (${doc.issueDate || 'Ban hành'}): ${doc.name} - Cơ quan: ${doc.issuer || 'N/A'}\n`;
        }

        if (!listText) {
          listText = (
            `1. 05-HD/VPTW (27/05/2026): Thể thức và kỹ thuật trình bày văn bản Đảng (văn bản điện tử, chữ ký số)\n` +
            `2. 399-QĐ/TW (09/01/2026): Thể loại, thẩm quyền ban hành và thể thức văn bản của Đảng (25 thể loại)\n` +
            `3. 05-HD/VPTW-VT (26/12/2014): Hướng dẫn công tác văn thư trong cơ quan Đảng\n` +
            `4. 06-HD/VPTW (26/12/2014): Lập hồ sơ và nộp lưu hồ sơ vào Lưu trữ cơ quan Đảng\n` +
            `5. 02/2019/TT-BNV (24/01/2019): Tiêu chuẩn dữ liệu thông tin và lưu trữ điện tử\n` +
            `6. 24-QĐ/TW (30/07/2021): Thi hành Điều lệ Đảng\n` +
            `7. 37-QĐ/TW (25/10/2021): Quy định về những điều đảng viên không được làm\n` +
            `8. 01-HD/TW (28/09/2021): Một số vấn đề cụ thể thi hành Điều lệ Đảng\n` +
            `9. 22-QĐ/TW (28/07/2021): Công tác kiểm tra, giám sát và kỷ luật của Đảng\n`
          );
        }

        return (
          `DANH MỤC VĂN BẢN ĐẢNG TRONG KHO DỮ LIỆU (${docMap.size || 9} VĂN BẢN):\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          listText +
          `\nLưu ý: Đồng chí có thể nạp thêm văn bản mới qua Web Admin Dashboard hoặc thư mục /data/regulations/`
        );
      }

      case '/ping':
        return `Pong! Hệ thống AI (Jev + RAG + Gemini) đang hoạt động ổn định.`;

      default:
        return `Lệnh ${cmd} không hợp lệ. Gõ /help để xem hướng dẫn.`;
    }
  }

  _buildGreeting(senderName = 'Đồng chí') {
    return (
      `HỆ THỐNG TRỢ LÝ VĂN BẢN ĐẢNG & ZALO AI\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Chào ${senderName},\n\n` +
      `Tôi là trợ lý AI chuyên giải đáp các thắc mắc về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng Cộng sản Việt Nam.\n\n` +
      `CÁC CHUYÊN MỤC HỖ TRỢ CHÍNH (CẬP NHẬT MỚI NHẤT ĐẾN THÁNG 10/2026):\n` +
      `• Thể thức và kỹ thuật trình bày văn bản Đảng (Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 và Quy định số 399-QĐ/TW ngày 09/01/2026: thẩm quyền ký T/M, K/T, con dấu, chữ ký số, 25 thể loại văn bản...).\n` +
      `• Công tác văn thư và lưu trữ cơ quan Đảng (Hướng dẫn số 06-HD/VPTW ngày 29/05/2026, Quy định số 383-QĐ/TW ngày 19/11/2025 về Phông lưu trữ Đảng, Luật Lưu trữ số 33/2024/QH15 hiệu lực từ 01/07/2025).\n` +
      `• Điều lệ, kỷ cương và đạo đức đảng viên (Quy định số 232-QĐ/TW năm 2025 thi hành Điều lệ Đảng; Quy định số 207-QĐ/TW năm 2026 về 19 điều đảng viên không được làm; Quy định số 01-QĐ/TW năm 2026 về chế độ đảng phí; Quy định 144-QĐ/TW về 5 chuẩn mực đạo đức cách mạng; Chỉ thị 45-CT/TW về Đại hội XIV).\n\n` +
      `MỘT SỐ CÂU HỎI MẪU:\n` +
      `• "Thẩm quyền ký thay mặt T/M và ký thay K/T theo Hướng dẫn 05/2026 quy định thế nào?"\n` +
      `• "Hệ thống 25 thể loại văn bản của Đảng theo Quy định 399-QĐ/TW gồm những gì?"\n` +
      `• "Quy chuẩn kỹ thuật chữ ký số trên văn bản điện tử của Đảng theo Hướng dẫn 05/2026?"\n` +
      `• "Mức đóng đảng phí theo Quy định số 01-QĐ/TW năm 2026 được tính như thế nào?"\n` +
      `• "Những điều đảng viên không được làm theo Quy định mới 207-QĐ/TW năm 2026?"\n` +
      `• "Quy định về thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành theo Hướng dẫn 06/2026?"\n\n` +
      `Gõ /docs để tra cứu toàn bộ danh mục 32 văn bản hiện có trong cơ sở dữ liệu.`
    );
  }
}

module.exports = new PipelineOrchestrator();
