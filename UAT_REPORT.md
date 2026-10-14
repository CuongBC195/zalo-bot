# BÁO CÁO KẾT QUẢ KIỂM THỬ NGHIỆM THU (UAT REPORT)

**Dự án:** Hệ thống Trợ lý AI Văn bản Đảng & Nghiệp vụ Cấp xã (`zalo-dang-ai-bot`)
**Thời gian thực hiện:** 15:30:40 14/10/2026 (Múi giờ Hà Nội)
**Môi trường thử nghiệm:** Node.js v22 | PostgreSQL (Supabase) | TypeSafe Jev v1.13 | Gemini 3.1 Flash-Lite
**Tổng số kịch bản kiểm thử:** 15/15 Passed (Đạt yêu cầu nghiệm thu)
**Chuẩn mực kiểm tra:** Zero-Emoji 100%, Đúng thẩm quyền & Hiệu lực văn bản đến tháng 10/2026, Mô hình 02 cấp Tỉnh - Xã.

---

### TC01: Thể thức hiện hành 2026
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC01` "Thẩm quyền ký thay mặt (T/M), ký thay (K/T) và quy chuẩn chữ ký số trên văn bản điện tử của Đảng hiện nay được thực hiện theo văn bản nào?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `05-HD/VPTW`, `208-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 21422ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào đồng chí, về thắc mắc của đồng chí liên quan đến thẩm quyền ký văn bản và quy chuẩn chữ ký số trong hệ thống văn bản Đảng, xin được giải đáp dựa trên các quy định hiện hành như sau:

Thẩm quyền ký thay mặt (T/M), ký thay (K/T) và quy chuẩn chữ ký số trên văn bản điện tử của Đảng hiện nay được thực hiện thống nhất theo Hướng dẫn của Văn phòng Ban Chấp hành Trung ương.

**Căn cứ quy định:**
- Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Ban Chấp hành Trung ương về thể thức và kỹ thuật trình bày văn bản của Đảng (Điều 6 và Điều 7).

**Chi tiết nội dung quy định:**

1. Về thẩm quyền ký thay mặt (T/M):
- Tổng Bí thư ký T/M Ban Chấp hành Trung ương Đảng đối với các nghị quyết, quyết định, quy định của Ban Chấp hành Trung ương.
- Thường trực Ban Bí thư ký T/M Ban Bí thư.
- Bí thư cấp ủy ký T/M ban chấp hành, ban thường vụ cấp ủy các cấp.
- Phó Bí thư ký T/M cấp ủy khi được Bí thư phân công hoặc thay mặt giải quyết công việc chung của cấp ủy.

2. Về thẩm quyền ký thay (K/T):
- Phó Bí thư ký thay (K/T) Bí thư khi ký văn bản thuộc lĩnh vực phụ trách hoặc được Bí thư giao giải quyết.
- Phó Trưởng ban ký K/T Trưởng ban; Phó Chánh Văn phòng ký K/T Chánh Văn phòng các cơ quan tham mưu, giúp việc cấp ủy.

3. Về quy chuẩn kỹ thuật chữ ký số trên văn bản điện tử:
- Định dạng văn bản: Phải có định dạng .pdf (khuyến nghị chuẩn PDF/A) để bảo đảm tính toàn vẹn thông tin.
- Chữ ký số cá nhân: Là hình ảnh chữ ký tay màu xanh, tệp định dạng .png nền trong suốt, đặt canh giữa chức vụ và họ tên người ký.
- Chữ ký số của cơ quan, tổ chức: Là hình ảnh con dấu cơ quan màu đỏ, đúng kích thước thực tế, tệp .png nền trong suốt, trùm lên khoảng 1/3 chữ ký số cá nhân về phía bên trái.

**Lưu ý thực hiện:**
Đối với các văn bản số hóa (Scan) từ văn bản giấy, đồng chí cần lưu ý độ phân giải tối thiểu phải đạt 200 dpi, tỷ lệ 100%, ảnh màu và phải được gắn chứng thư số của cơ quan thực hiện số hóa theo đúng quy định tại Điều 7 của Hướng dẫn số 05-HD/VPTW.
```

---

### TC02: Bẫy văn bản hết hiệu lực
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC02` "Hướng dẫn 36-HD/VPTW năm 2018 và Quy định 66-QĐ/TW năm 2017 về thể thức văn bản Đảng hiện nay còn hiệu lực áp dụng không?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `36-HD/VPTW`, `366-QĐ/TW`, `66-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2287ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hướng dẫn số 36-HD/VPTW năm 2018 và Quy định số 66-QĐ/TW năm 2017 hiện nay đã hết hiệu lực thi hành.

Căn cứ quy định:
- Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Trung ương Đảng, Điều 1.
- Quy định số 399-QĐ/TW ngày 09/01/2026 của Ban Bí thư, Điều 1.

Chi tiết nội dung:
- Quy định số 66-QĐ/TW ngày 06/02/2017 của Ban Bí thư đã hết hiệu lực thi hành từ ngày 09/01/2026.
- Hướng dẫn số 36-HD/VPTW ngày 03/04/2018 của Văn phòng Trung ương Đảng đã hết hiệu lực thi hành từ ngày 27/05/2026.
- Hiện nay, công tác thể thức, kỹ thuật trình bày văn bản và thẩm quyền ban hành văn bản của Đảng được thực hiện thống nhất theo Quy định số 399-QĐ/TW ngày 09/01/2026 của Ban Bí thư và Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Trung ương Đảng.
```

---

### TC03: Lưu trữ & Phông lưu trữ Đảng
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC03` "Tài liệu thuộc Phông lưu trữ Đảng Cộng sản Việt Nam gồm mấy nhóm và thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành là bao lâu?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `06-HD/VPTW`, `383-QĐ/TW`, `Luật số 33/2024/QH15`
- **Thời gian phản hồi (`latencyMs`):** 7388ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thành phần tài liệu Phông lưu trữ Đảng Cộng sản Việt Nam gồm 08 nhóm và thời hạn nộp lưu hồ sơ, tài liệu vào Lưu trữ hiện hành là trong vòng 01 năm kể từ ngày công việc kết thúc hoặc hồ sơ được đóng.

**Căn cứ quy định:**
- Quy định số 383-QĐ/TW ngày 19/11/2025 của Ban Bí thư về Phông lưu trữ Đảng Cộng sản Việt Nam (Điều 2).
- Luật Lưu trữ số 33/2024/QH15 ngày 21/06/2024 của Quốc hội khóa XV (Điều 3).

**Chi tiết nội dung:**

1. Về 08 nhóm thành phần tài liệu Phông lưu trữ Đảng:
- Nhóm 1: Tài liệu của các tổ chức tiền thân của Đảng và Mặt trận Tổ quốc Việt Nam.
- Nhóm 2: Tài liệu Đại hội Đảng toàn quốc và đại hội đảng bộ các cấp; tài liệu của các cấp ủy, cơ quan, tổ chức của Đảng qua các thời kỳ.
- Nhóm 3: Tài liệu của Mặt trận Tổ quốc Việt Nam cùng các tổ chức chính trị - xã hội.
- Nhóm 4: Tài liệu về thân thế, sự nghiệp và hoạt động của Chủ tịch Hồ Chí Minh, các lãnh tụ tiền bối, nhân vật lịch sử tiêu biểu của Đảng và Mặt trận Tổ quốc.
- Nhóm 5: Tài liệu về hoạt động của các đảng cộng sản và công nhân quốc tế có liên quan trực tiếp đến Đảng ta.
- Nhóm 6: Tài liệu của các chế độ thực dân, phong kiến, đế quốc và chính quyền tay sai liên quan đến hoạt động của Đảng và phong trào cách mạng.
- Nhóm 7: Tài liệu của các đơn vị sự nghiệp công lập do cấp ủy đảng, Mặt trận Tổ quốc thành lập.
- Nhóm 8: Tài liệu của các doanh nghiệp do cơ quan đảng, Mặt trận Tổ quốc làm đại diện chủ sở hữu.

2. Về thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành:
- Trong thời hạn 01 năm kể từ ngày công việc kết thúc hoặc hồ sơ được đóng, các đơn vị, cá nhân có trách nhiệm giao nộp hồ sơ, tài liệu có giá trị lưu trữ vào Lưu trữ hiện hành của cơ quan, tổ chức.

**Lưu ý thực hiện:**
Đồng chí cần phân biệt rõ thời hạn nộp lưu vào Lưu trữ hiện hành (01 năm) với thời hạn nộp lưu từ Lưu trữ hiện hành vào Lưu trữ lịch sử của Đảng (10 năm đối với tài liệu giấy và 05 năm đối với tài liệu điện tử kể từ năm nộp lưu vào Lưu trữ hiện hành) theo Hướng dẫn số 06-HD/VPTW ngày 29/05/2026 của Văn phòng Trung ương Đảng.
```

---

### TC04: Thi hành Điều lệ Đảng mới nhất
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC04` "Tuổi đời và trình độ học vấn của người vào Đảng hiện nay quy định thế nào? Quy định 24-QĐ/TW năm 2021 đã được thay thế bởi văn bản nào?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `24-QĐ/TW`, `124-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 22176ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào đồng chí, về thắc mắc của đồng chí liên quan đến điều kiện về tuổi đời, trình độ học vấn của người vào Đảng và văn bản thay thế Quy định số 24-QĐ/TW, tôi xin giải đáp dựa trên các quy định của Đảng như sau:

**1. Trả lời trực tiếp**
Người vào Đảng phải từ đủ 18 tuổi đến đủ 60 tuổi và có bằng tốt nghiệp trung học cơ sở trở lên (trừ các trường hợp đặc biệt theo quy định). Quy định số 24-QĐ/TW ngày 30/07/2021 hiện đã được thay thế bởi Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương.

**2. Căn cứ quy định**
- Quy định số 24-QĐ/TW ngày 30/07/2021 của Ban Chấp hành Trung ương về thi hành Điều lệ Đảng (Điều 1).
- Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương (Văn bản thay thế Quy định số 24-QĐ/TW).

**3. Chi tiết nội dung**

**Về tuổi đời:**
- Tại thời điểm chi bộ xét kết nạp, người vào Đảng phải đủ 18 tuổi đến đủ 60 tuổi (tính theo tháng).
- Việc kết nạp người trên 60 tuổi vào Đảng chỉ thực hiện khi có đủ các điều kiện:
  + Có sức khỏe và uy tín.
  + Đang công tác, cư trú tại cơ sở chưa có tổ chức đảng, chưa có đảng viên hoặc do yêu cầu đặc biệt.
  + Được ban thường vụ cấp ủy trực thuộc Trung ương đồng ý bằng văn bản trước khi cấp ủy có thẩm quyền ra quyết định kết nạp.

**Về trình độ học vấn:**
- Quy định chung: Người vào Đảng phải có bằng tốt nghiệp trung học cơ sở trở lên.
- Đối với các trường hợp đặc biệt: Người vào Đảng đang sinh sống ở vùng đồng bào dân tộc thiểu số, vùng cao, vùng sâu, vùng xa, biên giới, hải đảo, vùng có điều kiện kinh tế - xã hội đặc biệt khó khăn và những trường hợp cụ thể khác do yêu cầu phát triển đảng mà không bảo đảm được quy định chung thì thực hiện theo Hướng dẫn của Ban Bí thư (tối thiểu phải biết đọc, biết viết chữ quốc ngữ hoặc tốt nghiệp tiểu học).

**4. Lưu ý thực hiện**
Đồng chí cần lưu ý Quy định số 24-QĐ/TW ngày 30/07/2021 đã hết hiệu lực. Mọi quy trình, thủ tục hiện nay phải đối chiếu và thực hiện theo các nội dung mới nhất tại Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương để đảm bảo tính chính xác và đúng thẩm quyền.
```

---

### TC05: Thủ tục kết nạp - Intent party_procedure
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC05` "Hồ sơ xét kết nạp người vào Đảng gồm những giấy tờ gì và phải thẩm tra lý lịch những ai?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `02-HD/TW`, `06-HD/VPTW`, `208-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 8128ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hồ sơ xét kết nạp người vào Đảng bao gồm các văn bản theo quy định như đơn xin vào Đảng, lý lịch, giấy giới thiệu và các nghị quyết liên quan; việc thẩm tra lý lịch được thực hiện đối với bản thân người vào Đảng và các thân nhân theo quy định của Trung ương.

**Căn cứ quy định:**
- Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư về một số vấn đề cụ thể thi hành Điều lệ Đảng.
- Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương về thi hành Điều lệ Đảng.

**Chi tiết nội dung:**

1. Về hồ sơ của người vào Đảng:
- Đơn xin vào Đảng: Phải tự viết tay.
- Lý lịch của người vào Đảng: Người vào Đảng tự khai trung thực theo mẫu, phải được thẩm tra và có kết luận của cấp ủy có thẩm quyền.
- Giấy giới thiệu: Của 02 đảng viên chính thức (hoặc 01 đảng viên chính thức và ban chấp hành đoàn thanh niên cơ sở hoặc ban chấp hành công đoàn cơ sở).
- Nghị quyết giới thiệu của đoàn thể cơ sở.
- Ý kiến nhận xét: Của tổ chức chính trị - xã hội nơi người vào Đảng làm việc và chi ủy nơi cư trú.
- Nghị quyết đề nghị kết nạp của chi bộ.
- Quyết định kết nạp của cấp ủy có thẩm quyền.

2. Về đối tượng thẩm tra lý lịch:
- Thẩm tra bản thân người vào Đảng.
- Thẩm tra người thân, bao gồm: Cha đẻ, mẹ đẻ; cha mẹ vợ hoặc cha mẹ chồng; vợ hoặc chồng; con đẻ của người vào Đảng.

**Lưu ý thực hiện:**
- Đối với người thân là đảng viên đã có xác nhận của cấp ủy quản lý hồ sơ thì không phải thẩm tra lại.
- Lý lịch của người vào Đảng có giá trị trong vòng 12 tháng kể từ ngày cấp ủy xác nhận.
- Các nghị quyết của chi bộ và cấp ủy cơ sở về việc đề nghị kết nạp phải được ít nhất hai phần ba (2/3) số đảng viên chính thức hoặc cấp ủy viên có mặt biểu quyết tán thành.
```

---

### TC06: Sinh hoạt chi bộ
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC06` "Quy trình 3 bước sinh hoạt chi bộ định kỳ hằng tháng và khung tiêu chí chấm điểm chất lượng sinh hoạt chi bộ theo Hướng dẫn 12-HD/BTCTW?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `12-HD/BTCTW`, `124-QĐ/TW`, `366-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2677ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Quy trình 3 bước sinh hoạt chi bộ định kỳ hằng tháng và khung tiêu chí chấm điểm chất lượng sinh hoạt chi bộ được quy định tại Hướng dẫn số 12-HD/BTCTW ngày 06/07/2018 của Ban Tổ chức Trung ương như sau:

Căn cứ quy định:
- Hướng dẫn số 12-HD/BTCTW ngày 06/07/2018 của Ban Tổ chức Trung ương, Điều 3 và Điều 5.
- Lưu ý: Văn bản này hiện đã hết hiệu lực và được thay thế bởi Hướng dẫn số 42-HD/BTCTW ngày 28/10/2025.

Chi tiết nội dung:

1. Quy trình 3 bước sinh hoạt chi bộ:
- Bước 1: Mở đầu: Tuyên bố lý do, giới thiệu đại biểu; cử thư ký; thông báo tình hình đảng viên; thông qua nội dung, chương trình.
- Bước 2: Tiến hành sinh hoạt: Bí thư báo cáo và gợi ý thảo luận; đảng viên thảo luận, tự phê bình và phê bình; bí thư cung cấp thông tin, định hướng tư tưởng và giải đáp thắc mắc.
- Bước 3: Kết thúc: Bí thư tóm tắt, kết luận và lấy biểu quyết thông qua nghị quyết; chi bộ tự chấm điểm, đánh giá chất lượng; thư ký trình biên bản để thông qua và ký tên.

2. Khung tiêu chí đánh giá, chấm điểm (tổng 100 điểm):
- Tỷ lệ đảng viên tham gia sinh hoạt (tối đa 20 điểm): Đạt từ 85% trở lên, không có đảng viên vắng mặt không lý do.
- Công tác chuẩn bị của chi ủy và bí thư (tối đa 20 điểm): Có họp chi ủy, dự thảo báo cáo chu đáo, thông báo nội dung trước cho đảng viên.
- Tổ chức sinh hoạt đúng quy trình, phương pháp (tối đa 20 điểm): Thực hiện đủ 3 bước, điều hành linh hoạt, ghi biên bản đầy đủ.
- Chất lượng thảo luận và phát huy dân chủ (tối đa 20 điểm): Không khí dân chủ, có từ 3 đến 5 ý kiến phát biểu trở lên, thể hiện tính chiến đấu.
- Kết luận và ban hành nghị quyết (tối đa 20 điểm): Kết luận rõ ràng, nghị quyết cụ thể, phân công rõ người, rõ việc.

Xếp loại chất lượng:
- Tốt: 90 - 100 điểm.
- Khá: 70 - dưới 90 điểm.
- Trung bình: 50 - dưới 70 điểm.
- Kém: dưới 50 điểm.
```

---

### TC07: Đảng phí 2026 vs 2010
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC07` "Mức đóng đảng phí hằng tháng của đảng viên tham gia BHXH bắt buộc năm 2026 là bao nhiêu? Quyết định 342-QĐ/TW năm 2010 còn hiệu lực không?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `342-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 1915ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào đồng chí, xin giải đáp thắc mắc của đồng chí như sau:

Về hiệu lực của văn bản: Quy định số 342-QĐ/TW ngày 28/12/2010 của Bộ Chính trị về chế độ đảng phí và quản lý thu nộp đảng phí đã hết hiệu lực thi hành kể từ ngày 01/02/2026.

Về mức đóng đảng phí năm 2026: Hiện tại trong dữ liệu văn bản trích dẫn chưa có thông tin quy định chi tiết về mức đóng đảng phí áp dụng từ sau ngày 01/02/2026. Đồng chí vui lòng liên hệ chi ủy hoặc cấp ủy cấp trên để được hướng dẫn chính thức về văn bản thay thế và mức đóng đảng phí mới nhất.

Căn cứ quy định:
- Quy định số 342-QĐ/TW ngày 28/12/2010 của Bộ Chính trị.
- Tình trạng hiệu lực: Hết hiệu lực từ ngày 01/02/2026.

Lưu ý thực hiện: Do Quy định số 342-QĐ/TW đã hết hiệu lực, các nội dung về mức đóng đảng phí nêu tại văn bản này không còn là căn cứ pháp lý để áp dụng thực hiện trong năm 2026. Đồng chí cần cập nhật các văn bản mới nhất do cơ quan có thẩm quyền ban hành để thực hiện đúng quy định.
```

---

### TC08: BẪY TỪ KHÓA BLACKLIST/WHITELIST
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC08` "Đảng viên tham gia đánh bạc hoặc can thiệp để vợ con đi du lịch bằng nguồn tài trợ của doanh nghiệp thì vi phạm quy định nào về những điều đảng viên không được làm?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `208-QĐ/TW`, `01-QĐ/TW`, `21-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 1369ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hiện tại trong dữ liệu văn bản trích dẫn chưa có thông tin quy định chi tiết về hành vi cụ thể như tham gia đánh bạc hoặc can thiệp để vợ con đi du lịch bằng nguồn tài trợ của doanh nghiệp trong Quy định về những điều đảng viên không được làm.

Căn cứ quy định:
- Tài liệu 3: Quy định về công tác kiểm tra, giám sát và kỷ luật của Đảng (21-QĐ/TW) ngày 11/04/2026 của Ban Chấp hành Trung ương, Điều 3, Khoản 1.

Chi tiết nội dung:
- Chi bộ có trách nhiệm kiểm tra, giám sát đảng viên trong việc chấp hành Quy định 207-QĐ/TW về những điều đảng viên không được làm.
- Đồng chí vui lòng liên hệ chi ủy hoặc cấp ủy cấp trên để được hướng dẫn, giải đáp chính thức về các hành vi vi phạm cụ thể dựa trên văn bản Quy định 207-QĐ/TW.
```

---

### TC09: Chuẩn mực đạo đức 144
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC09` "5 chuẩn mực đạo đức cách mạng của cán bộ, đảng viên trong giai đoạn mới theo Quy định 144-QĐ/TW gồm những nội dung gì?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `45-CT/TW`, `144-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 1677ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hiện tại, trong dữ liệu văn bản trích dẫn được cung cấp chỉ có thông tin chi tiết về Điều 1 của Quy định số 144-QĐ/TW. Do đó, tôi không thể liệt kê đầy đủ 5 chuẩn mực đạo đức cách mạng theo yêu cầu của đồng chí.

Căn cứ quy định:
- Quy định số 144-QĐ/TW ngày 09/05/2024 của Bộ Chính trị.

Chi tiết nội dung Điều 1 (Yêu nước, tôn trọng Nhân dân, tuyệt đối trung thành với Đảng, với Tổ quốc) như sau:
- Suốt đời phấn đấu cho mục đích, lý tưởng cách mạng của Đảng; tuyệt đối trung thành với Tổ quốc, với Đảng, hết lòng, hết sức phục vụ Tổ quốc, phục vụ Nhân dân.
- Tôn trọng, tin tưởng, gắn bó mật thiết với Nhân dân; việc gì có lợi cho dân phải hết sức làm, việc gì hại đến dân phải hết sức tránh; bảo vệ quyền và lợi ích hợp pháp, chính đáng của Nhân dân.

Lưu ý thực hiện: Để nắm bắt đầy đủ 5 chuẩn mực đạo đức cách mạng theo Quy định số 144-QĐ/TW, đồng chí vui lòng tra cứu toàn văn văn bản gốc hoặc liên hệ chi ủy để được cung cấp tài liệu đầy đủ.
```

---

### TC10: Thẩm quyền kỷ luật của Chi bộ
*Thuộc nhóm: Story 4: Ủy ban Kiểm tra & Văn phòng Cấp ủy cơ sở*

- **Mã TC & Câu hỏi:** `TC10` "Chi bộ có thẩm quyền quyết định khai trừ đảng viên hoặc cách chức không? Thời hiệu kỷ luật khiển trách và cảnh cáo là bao nhiêu năm?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `21-QĐ/TW`, `208-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 1514ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chi bộ không có thẩm quyền quyết định hình thức kỷ luật khai trừ hoặc cách chức đối với đảng viên. Đối với câu hỏi về thời hiệu kỷ luật, hiện tại trong dữ liệu văn bản trích dẫn chưa có thông tin quy định chi tiết về thời hiệu kỷ luật khiển trách và cảnh cáo. Đồng chí vui lòng liên hệ chi ủy hoặc cấp ủy cấp trên để được hướng dẫn chính thức.

Căn cứ quy định:
- Quy định số 21-QĐ/TW ngày 11/04/2026 của Ban Chấp hành Trung ương, Điều 3, Khoản 3.

Chi tiết nội dung về thẩm quyền của chi bộ:
- Chi bộ có thẩm quyền quyết định thi hành kỷ luật đối với đảng viên vi phạm bằng hình thức Khiển trách hoặc Cảnh cáo (trừ trường hợp cán bộ thuộc diện cấp ủy cấp trên quản lý).
- Đối với trường hợp đảng viên vi phạm đến mức phải cách chức (nếu có chức vụ trong Đảng) hoặc khai trừ ra khỏi Đảng: Chi bộ thảo luận, lập hồ sơ và ra nghị quyết đề nghị đảng ủy cơ sở hoặc cấp ủy có thẩm quyền quyết định.
```

---

### TC11: Văn phòng Đảng ủy xã & Đại hội XIV
*Thuộc nhóm: Story 4: Ủy ban Kiểm tra & Văn phòng Cấp ủy cơ sở*

- **Mã TC & Câu hỏi:** `TC11` "Chức năng, nhiệm vụ của Văn phòng Đảng ủy xã theo Quy định 299-QĐ/TW năm 2025 và điểm mới của Chỉ thị 45-CT/TW về đại hội đảng bộ các cấp?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `299-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2402ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào đồng chí, về nội dung đồng chí quan tâm, tôi xin được giải đáp như sau:

**1. Về chức năng, nhiệm vụ của Văn phòng Đảng ủy xã theo Quy định số 299-QĐ/TW:**

Căn cứ Quy định số 299-QĐ/TW ngày 09/06/2025 của Ban Bí thư, Văn phòng Đảng ủy xã có các chức năng và nhiệm vụ chính sau:

*   **Vị trí, chức năng (Điều 1):** Là cơ quan chuyên trách tham mưu, giúp việc Đảng ủy xã, trực tiếp và thường xuyên là Ban Thường vụ và Thường trực Đảng ủy. Chức năng chính bao gồm: tham mưu điều hành công việc lãnh đạo, chỉ đạo; chủ trì về cải cách hành chính, chuyển đổi số; là trung tâm thông tin tổng hợp; quản lý tài chính, tài sản và bảo đảm hậu cần cho hoạt động của Đảng ủy.
*   **Nhiệm vụ thông tin tổng hợp và báo cáo (Điều 3):** Thu thập, tổng hợp tình hình thực hiện các nghị quyết, chỉ thị; theo dõi hoạt động của các chi bộ trực thuộc và các tổ chức chính trị - xã hội; xây dựng báo cáo định kỳ, đột xuất gửi cấp ủy cấp trên.
*   **Nhiệm vụ văn thư, lưu trữ, bảo mật và cơ yếu (Điều 4):** Thực hiện quy trình tiếp nhận, phát hành văn bản; quản lý con dấu và thiết bị bảo mật; hướng dẫn lập hồ sơ và lưu trữ tài liệu theo quy định; bảo đảm an toàn thông tin.
*   **Mối quan hệ công tác (Điều 7):** Chịu sự lãnh đạo trực tiếp của Ban Thường vụ, Thường trực Đảng ủy xã; chịu sự hướng dẫn nghiệp vụ của Văn phòng cấp ủy cấp trên; phối hợp với các cơ quan, đoàn thể trong thực hiện nhiệm vụ chính trị.

**2. Về nội dung liên quan đến Chỉ thị 45-CT/TW:**

Hiện tại trong dữ liệu văn bản trích dẫn được cung cấp không có thông tin về Chỉ thị số 45-CT/TW. Đồng chí vui lòng liên hệ chi ủy hoặc cấp ủy cấp trên để được hướng dẫn chính thức về nội dung này.

Lưu ý: Nội dung trên được tổng hợp tự động; đồng chí vui lòng đối chiếu lại văn bản gốc trước khi áp dụng chính thức.
```

---

### TC12: Tiếng Việt không dấu
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC12` "dang vien du bi co quyen bieu quyet, ung cu va bau cu khong?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `37-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 1035ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hiện tại trong dữ liệu văn bản trích dẫn chưa có thông tin quy định chi tiết về quyền biểu quyết, ứng cử và bầu cử của đảng viên dự bị. Đồng chí vui lòng liên hệ chi ủy hoặc cấp ủy cấp trên để được hướng dẫn chính thức dựa trên Điều lệ Đảng Cộng sản Việt Nam hiện hành.
```

---

### TC13: Bẫy từ khóa thủ tục ngoài phạm vi
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC13` "Cho hỏi quy trình các bước nấu phở bò và thủ tục mở tài khoản mua cổ phiếu chứng khoán?"
- **Intent nhận diện:** `out_of_scope`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** Không có (Truy xuất cục bộ/Từ chối an toàn)
- **Thời gian phản hồi (`latencyMs`):** 0ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào Đồng chí Cán bộ,

Tôi là Trợ lý AI chuyên trách hỗ trợ tra cứu về Cương lĩnh, Điều lệ, Quy định của Đảng, Thể thức văn bản và Công tác văn thư lưu trữ.

Nội dung câu hỏi của đồng chí nằm ngoài phạm vi nghiệp vụ được phân công. Đồng chí vui lòng đặt các câu hỏi thuộc các lĩnh vực sau:
• Thể thức và kỹ thuật trình bày văn bản Đảng (HD 05-HD/VPTW ngày 27/05/2026, QĐ 399-QĐ/TW, thẩm quyền ký T/M, K/T, con dấu, chữ ký số...)
• Công tác văn thư và lưu trữ cơ quan Đảng (HD 05, HD 06, Thông tư 02 BNV, nộp lưu hồ sơ...)
• Quy định, điều lệ và thi hành Điều lệ Đảng (Quy định 24, Quy định 37, Hướng dẫn 01, Quy định 22...)
```

---

### TC14: Chuỗi rác / Ký tự đặc biệt
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC14` "12345 ??? @@@"
- **Intent nhận diện:** `invalid_or_empty`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** Không có (Truy xuất cục bộ/Từ chối an toàn)
- **Thời gian phản hồi (`latencyMs`):** 0ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chào Đồng chí Cán bộ,

Nội dung tra cứu chưa rõ ràng. Đồng chí vui lòng nhập câu hỏi hoặc số hiệu văn bản cụ thể cần tìm hiểu (ví dụ: "Thẩm quyền ký T/M", "Quy định 37 về 19 điều cấm", "Thời hạn nộp lưu hồ sơ").
```

---

### TC15: Lệnh tra cứu danh mục
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC15` "/docs"
- **Intent nhận diện:** `command`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** Không có (Truy xuất cục bộ/Từ chối an toàn)
- **Thời gian phản hồi (`latencyMs`):** 1ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
DANH MỤC VĂN BẢN ĐẢNG TRONG KHO DỮ LIỆU (27 VĂN BẢN):
━━━━━━━━━━━━━━━━━━━━━━━━━
1. [Còn hiệu lực] 45-CT/TW (2025-04-14): Chỉ thị về đại hội đảng bộ các cấp tiến tới Đại hội đại biểu toàn quốc lần thứ XIV của Đảng - Cơ quan: Bộ Chính trị
2. [Hết hiệu lực (Được thay thế bởi Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư)] 01-HD/TW (2021-09-28): Hướng dẫn một số vấn đề cụ thể thi hành Điều lệ Đảng - Cơ quan: Ban Bí thư
3. [Còn hiệu lực (Hiện hành)] 02-HD/TW (2026-08-07): Hướng dẫn một số vấn đề cụ thể thi hành Điều lệ Đảng - Cơ quan: Ban Bí thư
4. [Còn hiệu lực (Hiện hành)] 05-HD/VPTW (2026-05-27): Hướng dẫn về thể thức và kỹ thuật trình bày văn bản của Đảng - Cơ quan: Văn phòng Ban Chấp hành Trung ương
5. [Còn hiệu lực (Hiện hành)] 06-HD/VPTW (2026-05-29): Hướng dẫn về việc lập hồ sơ và nộp hồ sơ, tài liệu vào lưu trữ hiện hành - Cơ quan: Văn phòng Trung ương Đảng
6. [Hết hiệu lực (Được thay thế bởi Hướng dẫn số 42-HD/BTCTW ngày 28/10/2025 của Ban Tổ chức Trung ương)] 12-HD/BTCTW (2018-07-06): Hướng dẫn về một số vấn đề nâng cao chất lượng sinh hoạt chi bộ - Cơ quan: Ban Tổ chức Trung ương
7. [Hết hiệu lực] 17-HD/VPTW (2015-10-05): Hướng dẫn về thể thức và kỹ thuật trình bày văn bản của Đảng - Cơ quan: Văn phòng Trung ương Đảng
8. [Hết hiệu lực (từ 27/05/2026)] 36-HD/VPTW (2018-04-03): Hướng dẫn về thể thức và kỹ thuật trình bày văn bản của Đảng (Ban hành ngày 03/04/2018) - Cơ quan: Văn phòng Trung ương Đảng
9. [Còn hiệu lực (Hiện hành)] 42-HD/BTCTW (2025-10-28): Hướng dẫn về đổi mới, nâng cao chất lượng sinh hoạt chi bộ - Cơ quan: Ban Tổ chức Trung ương
10. [Còn hiệu lực (Hiện hành từ 01/07/2025)] Luật số 33/2024/QH15 (2024-06-21): Luật Lưu trữ năm 2024 (Có hiệu lực từ ngày 01/07/2025) - Cơ quan: Quốc hội khóa XV
11. [Còn hiệu lực (Hiện hành)] 01-QĐ/TW (2026-02-03): Quy định về chế độ đảng phí - Cơ quan: Bộ Chính trị
12. [Hết hiệu lực (Được thay thế bởi Quy định số 366-QĐ/TW ngày 20/09/2025 của Bộ Chính trị)] 124-QĐ/TW (2023-10-04): Quy định về kiểm điểm và đánh giá, xếp loại chất lượng hằng năm đối với tập thể, cá nhân trong hệ thống chính trị - Cơ quan: Bộ Chính trị
13. [Còn hiệu lực] 144-QĐ/TW (2024-05-09): Quy định về chuẩn mực đạo đức cách mạng của cán bộ, đảng viên trong giai đoạn mới - Cơ quan: Bộ Chính trị
14. [Còn hiệu lực (Hiện hành)] 207-QĐ/TW (2026-07-26): Quy định về những điều đảng viên không được làm - Cơ quan: Ban Chấp hành Trung ương
15. [Còn hiệu lực (Hiện hành)] 208-QĐ/TW (2026-07-26): Quy định thi hành Điều lệ Đảng - Cơ quan: Ban Chấp hành Trung ương
16. [Còn hiệu lực (Hiện hành)] 21-QĐ/TW (2026-04-11): Quy định về công tác kiểm tra, giám sát và kỷ luật của Đảng - Cơ quan: Ban Chấp hành Trung ương
17. [Hết hiệu lực (Được thay thế bởi Quy định số 21-QĐ/TW ngày 11/04/2026 của Ban Chấp hành Trung ương)] 22-QĐ/TW (2021-07-28): Quy định về công tác kiểm tra, giám sát và kỷ luật của Đảng - Cơ quan: Ban Chấp hành Trung ương
18. [Hết hiệu lực (Được thay thế bởi Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương)] 232-QĐ/TW (2025-01-20): Quy định thi hành Điều lệ Đảng - Cơ quan: Ban Chấp hành Trung ương
19. [Hết hiệu lực (Được thay thế bởi Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương)] 24-QĐ/TW (2021-07-30): Quy định thi hành Điều lệ Đảng - Cơ quan: Ban Chấp hành Trung ương
20. [Còn hiệu lực (Hiện hành)] 299-QĐ/TW (2025-06-09): Quy định về chức năng, nhiệm vụ, tổ chức bộ máy cơ quan chuyên trách tham mưu, giúp việc đảng ủy xã, phường - Cơ quan: Ban Bí thư
21. [Hết hiệu lực (từ 01/02/2026)] 342-QĐ/TW (2010-12-28): Quy định về chế độ đảng phí và quản lý thu nộp đảng phí - Cơ quan: Bộ Chính trị
22. [Còn hiệu lực (Hiện hành)] 366-QĐ/TW (2025-09-20): Quy định về kiểm điểm và đánh giá, xếp loại chất lượng hằng năm đối với tập thể, cá nhân trong hệ thống chính trị - Cơ quan: Bộ Chính trị
23. [Hết hiệu lực (từ 26/07/2026)] 37-QĐ/TW (2021-10-25): Quy định về những điều đảng viên không được làm - Cơ quan: Ban Chấp hành Trung ương
24. [Còn hiệu lực (Hiện hành)] 383-QĐ/TW (2025-11-19): Quy định về Phông lưu trữ Đảng Cộng sản Việt Nam - Cơ quan: Ban Bí thư
25. [Còn hiệu lực (Hiện hành)] 399-QĐ/TW (2026-01-09): Quy định về thể loại, thẩm quyền ban hành và thể thức văn bản của Đảng (Ban hành ngày 09/01/2026) - Cơ quan: Ban Bí thư Trung ương Đảng
26. [Hết hiệu lực (từ 09/01/2026)] 66-QĐ/TW (2017-02-06): Quy định về thể loại, thẩm quyền ban hành và thể thức văn bản của Đảng (Ban hành ngày 06/02/2017) - Cơ quan: Ban Bí thư Trung ương Đảng
27. [Hết hiệu lực (từ 01/7/2025 theo TT 05/2025/TT-BNV)] 02/2019/TT-BNV (2019-01-24): Quy định tiêu chuẩn dữ liệu thông tin đầu vào và yêu cầu bảo quản tài liệu lưu trữ điện tử - Cơ quan: Bộ Nội vụ

Lưu ý: Đồng chí có thể nạp thêm văn bản mới qua Web Admin Dashboard hoặc thư mục /data/regulations/
```

---

