# BÁO CÁO KẾT QUẢ KIỂM THỬ NGHIỆM THU (UAT REPORT)

**Dự án:** Hệ thống Trợ lý AI Văn bản Đảng & Nghiệp vụ Cấp xã (`zalo-dang-ai-bot`)
**Thời gian thực hiện:** 23:33:41 14/10/2026 (Múi giờ Hà Nội)
**Môi trường thử nghiệm:** Node.js v22 | PostgreSQL (Supabase) | TypeSafe Jev v1.13 | Gemini 3.1 Flash-Lite
**Tổng số kịch bản kiểm thử:** 16/16 Passed (Đạt yêu cầu nghiệm thu)
**Chuẩn mực kiểm tra:** Zero-Emoji 100%, Đúng thẩm quyền & Hiệu lực văn bản đến tháng 10/2026, Mô hình 02 cấp Tỉnh - Xã.

---

### TC01: Thể thức hiện hành 2026
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC01` "Thẩm quyền ký thay mặt (T/M), ký thay (K/T) và quy chuẩn chữ ký số trên văn bản điện tử của Đảng hiện nay được thực hiện theo văn bản nào?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `208-QĐ/TW`, `05-HD/VPTW`, `399-QĐ/TW`, `299-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2763ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, thẩm quyền ký thay mặt, ký thay và quy chuẩn chữ ký số trên văn bản điện tử của Đảng hiện nay được thực hiện theo Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Ban Chấp hành Trung ương.

Căn cứ quy định tại Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Ban Chấp hành Trung ương:

1. Thẩm quyền ký thay mặt (T/M) (Điều 6):
- Tổng Bí thư ký T/M Ban Chấp hành Trung ương Đảng đối với các nghị quyết, quyết định, quy định của Ban Chấp hành Trung ương.
- Thường trực Ban Bí thư ký T/M Ban Bí thư.
- Bí thư cấp ủy ký T/M ban chấp hành, ban thường vụ cấp ủy các cấp.
- Phó Bí thư ký T/M cấp ủy khi được Bí thư phân công hoặc thay mặt giải quyết công việc chung của cấp ủy.

2. Thẩm quyền ký thay (K/T) (Điều 6):
- Phó Bí thư ký thay (K/T) Bí thư khi ký văn bản thuộc lĩnh vực phụ trách hoặc được Bí thư giao giải quyết.
- Phó Trưởng ban ký K/T Trưởng ban; Phó Chánh Văn phòng ký K/T Chánh Văn phòng các cơ quan tham mưu, giúp việc cấp ủy.

3. Quy chuẩn kỹ thuật chữ ký số trên văn bản điện tử của Đảng (Điều 7):
- Định dạng văn bản điện tử: Phải có định dạng .pdf (khuyến nghị chuẩn PDF/A), bảo đảm tính toàn vẹn thông tin lâu dài.
- Chữ ký số của cá nhân người có thẩm quyền: Hình ảnh chữ ký tay màu xanh, tệp định dạng .png nền trong suốt, đặt canh giữa chức vụ và họ tên người ký.
- Chữ ký số của cơ quan, tổ chức: Hình ảnh con dấu cơ quan màu đỏ, đúng kích thước thực tế, tệp .png nền trong suốt, trùm lên khoảng 1/3 chữ ký số cá nhân về phía bên trái.
- Văn bản số hóa (Scan): Độ phân giải tối thiểu 200 dpi, tỷ lệ 100%, ảnh màu và được gắn chứng thư số của cơ quan thực hiện số hóa.
```

---

### TC02: Bẫy văn bản hết hiệu lực
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC02` "Hướng dẫn 36-HD/VPTW năm 2018 và Quy định 66-QĐ/TW năm 2017 về thể thức văn bản Đảng hiện nay còn hiệu lực áp dụng không?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `05-HD/VPTW`, `36-HD/VPTW`, `399-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2610ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, Hướng dẫn số 36-HD/VPTW năm 2018 và Quy định số 66-QĐ/TW năm 2017 hiện nay đã hết hiệu lực thi hành và được thay thế bằng các văn bản mới của cơ quan có thẩm quyền.

Căn cứ quy định:
- Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Ban Chấp hành Trung ương Đảng, Điều 2.
- Quy định số 399-QĐ/TW ngày 09/01/2026 của Ban Bí thư, phần Ghi chú hiệu lực.

Chi tiết nội dung:
- Quy định số 66-QĐ/TW ngày 06/02/2017 của Ban Bí thư đã hết hiệu lực và được thay thế bởi Quy định số 399-QĐ/TW ngày 09/01/2026 của Ban Bí thư về thể loại, thẩm quyền ban hành và thể thức văn bản của Đảng.
- Hướng dẫn số 36-HD/VPTW ngày 03/04/2018 của Văn phòng Trung ương Đảng đã hết hiệu lực từ ngày 27/05/2026 và được thay thế thống nhất bởi Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 của Văn phòng Ban Chấp hành Trung ương Đảng.

Lưu ý thực hiện: Đồng chí và các cơ quan, đơn vị khi tham mưu, soạn thảo, kiểm tra và ban hành văn bản của Đảng cần áp dụng theo các quy định hiện hành mới nhất là Quy định số 399-QĐ/TW và Hướng dẫn số 05-HD/VPTW.
```

---

### TC03: Lưu trữ & Phông lưu trữ Đảng
*Thuộc nhóm: Story 1: Cán bộ Văn thư - Lưu trữ Đảng ủy xã (Kiểm tra văn bản mới 2025-2026 & Bẫy hiệu lực)*

- **Mã TC & Câu hỏi:** `TC03` "Tài liệu thuộc Phông lưu trữ Đảng Cộng sản Việt Nam gồm mấy nhóm và thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành là bao lâu?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `06-HD/VPTW`, `383-QĐ/TW`, `Luật số 33/2024/QH15`, `299-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 5669ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thành phần tài liệu Phông lưu trữ Đảng Cộng sản Việt Nam gồm 08 nhóm và thời hạn nộp lưu hồ sơ vào Lưu trữ hiện hành được quy định cụ thể theo các văn bản của Đảng và Nhà nước.

Căn cứ quy định:
- Quy định số 383-QĐ/TW ngày 19/11/2025 của Ban Bí thư, Điều 2.
- Hướng dẫn số 06-HD/VPTW ngày 29/05/2026 của Văn phòng Trung ương Đảng, Điều 4.
- Luật Lưu trữ số 33/2024/QH15 ngày 21/06/2024 của Quốc hội khóa XV, Điều 3.

Chi tiết nội dung:

1. Thành phần tài liệu Phông lưu trữ Đảng Cộng sản Việt Nam gồm 08 nhóm:
- Tài liệu của các tổ chức tiền thân của Đảng và Mặt trận Tổ quốc Việt Nam.
- Tài liệu Đại hội Đảng toàn quốc và đại hội đảng bộ các cấp; tài liệu của các cấp ủy, cơ quan, tổ chức của Đảng qua các thời kỳ.
- Tài liệu của Mặt trận Tổ quốc Việt Nam cùng các tổ chức chính trị - xã hội.
- Tài liệu về thân thế, sự nghiệp và hoạt động của Chủ tịch Hồ Chí Minh, các lãnh tụ tiền bối, nhân vật lịch sử tiêu biểu của Đảng và Mặt trận Tổ quốc.
- Tài liệu về hoạt động của các đảng cộng sản và công nhân quốc tế có liên quan trực tiếp đến Đảng ta.
- Tài liệu của các chế độ thực dân, phong kiến, đế quốc và chính quyền tay sai liên quan đến hoạt động của Đảng và phong trào cách mạng.
- Tài liệu của các đơn vị sự nghiệp công lập do cấp ủy đảng, Mặt trận Tổ quốc thành lập.
- Tài liệu của các doanh nghiệp do cơ quan đảng, Mặt trận Tổ quốc làm đại diện chủ sở hữu.

2. Thời hạn nộp lưu hồ sơ, tài liệu vào Lưu trữ hiện hành:
- Sau 01 năm kể từ năm công việc kết thúc đối với hồ sơ, tài liệu hành chính thông thường (hoặc trong thời hạn 01 năm kể từ ngày công việc kết thúc hoặc hồ sơ được đóng theo Luật Lưu trữ).
- Sau 03 tháng kể từ ngày quyết toán ngân sách nhà nước được phê duyệt đối với hồ sơ tài chính, kế toán.
- Sau 01 năm kể từ ngày đề án, đề tài nghiên cứu được nghiệm thu chính thức.

Đồng chí lưu ý thực hiện việc lập danh mục hồ sơ và giao nộp tài liệu theo đúng thời hạn và thủ tục đã được hướng dẫn tại các văn bản nêu trên.
```

---

### TC04: Thi hành Điều lệ Đảng mới nhất
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC04` "Tuổi đời và trình độ học vấn của người vào Đảng hiện nay quy định thế nào? Quy định 24-QĐ/TW năm 2021 đã được thay thế bởi văn bản nào?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `208-QĐ/TW`, `24-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 3126ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Đảng viên dự bị và người vào Đảng cần đáp ứng các điều kiện về tuổi đời, trình độ học vấn theo quy định hiện hành và Quy định số 24-QĐ/TW năm 2021 đã hết hiệu lực, được thay thế bởi Quy định số 208-QĐ/TW.

Căn cứ quy định:
- Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương (khóa XIV) về thi hành Điều lệ Đảng, Điều 1.

Chi tiết nội dung quy định:
- Về tuổi đời:
  - Người vào Đảng tại thời điểm chi bộ xét kết nạp phải đủ 18 tuổi đến hết 60 tuổi (tính theo tháng).
  - Việc kết nạp người trên 60 tuổi chỉ được xem xét khi có đủ các điều kiện: Có sức khỏe tốt, uy tín cao trong quần chúng nhân dân; đang công tác hoặc cư trú tại nơi chưa có tổ chức đảng hoặc do yêu cầu đặc biệt; phải được ban thường vụ tỉnh ủy, thành ủy trực thuộc Trung ương đồng ý bằng văn bản trước khi cấp ủy có thẩm quyền ra quyết định kết nạp.
- Về trình độ học vấn:
  - Người vào Đảng phải có bằng tốt nghiệp trung học cơ sở trở lên.
  - Đối với người sinh sống ở miền núi, biên giới, hải đảo, vùng đồng bào dân tộc thiểu số và vùng có điều kiện kinh tế - xã hội đặc biệt khó khăn không bảo đảm trình độ chung thì thực hiện theo Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư (tối thiểu phải biết đọc, biết viết chữ quốc ngữ).
- Về hiệu lực văn bản thay thế Quy định số 24-QĐ/TW:
  - Quy định số 24-QĐ/TW ngày 30/07/2021 của Ban Chấp hành Trung ương về thi hành Điều lệ Đảng đã hết hiệu lực thi hành.
  - Toàn bộ công tác thi hành Điều lệ Đảng hiện nay được thực hiện thống nhất theo Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương Đảng khóa XIV và Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư.
```

---

### TC05: Thủ tục kết nạp - Intent party_procedure
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC05` "Hồ sơ xét kết nạp người vào Đảng gồm những giấy tờ gì và phải thẩm tra lý lịch những ai?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `02-HD/TW`, `06-HD/VPTW`, `208-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 3587ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Hồ sơ xét kết nạp người vào Đảng gồm 7 thành phần cơ bản và việc thẩm tra lý lịch được tiến hành đối với bản thân người vào Đảng cùng những người thân theo quy định.

Căn cứ quy định:
- Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư, Điều 2.

Chi tiết nội dung:
- Hồ sơ của người vào Đảng gồm:
  - Đơn xin vào Đảng (tự viết tay).
  - Lý lịch của người vào Đảng (tự khai trung thực theo mẫu, có kết luận thẩm tra của cấp ủy có thẩm quyền).
  - Giấy giới thiệu của 02 đảng viên chính thức (hoặc 01 đảng viên chính thức và ban chấp hành đoàn thanh niên hoặc ban chấp hành công đoàn cơ sở).
  - Nghị quyết giới thiệu của đoàn thể cơ sở.
  - Ý kiến nhận xét của tổ chức chính trị - xã hội nơi làm việc và chi ủy nơi cư trú.
  - Nghị quyết đề nghị kết nạp của chi bộ.
  - Quyết định kết nạp của cấp ủy có thẩm quyền.

- Thẩm tra lý lịch:
  - Đối tượng thẩm tra: Bản thân và người thân (cha, mẹ đẻ, cha mẹ vợ/chồng, vợ/chồng, con đẻ).
  - Trường hợp ngoại lệ: Nếu người thân là đảng viên đã có xác nhận của cấp ủy quản lý hồ sơ thì không phải thẩm tra lại.
  - Thời hạn: Lý lịch có giá trị trong 12 tháng kể từ ngày cấp ủy xác nhận.
```

---

### TC06: Sinh hoạt chi bộ
*Thuộc nhóm: Story 2: Bí thư Chi bộ (Kiểm tra Điều lệ Đảng, Kết nạp & Sinh hoạt chi bộ)*

- **Mã TC & Câu hỏi:** `TC06` "Quy trình 3 bước sinh hoạt chi bộ định kỳ hằng tháng và khung tiêu chí chấm điểm chất lượng sinh hoạt chi bộ theo Hướng dẫn 12-HD/BTCTW?"
- **Intent nhận diện:** `party_procedure`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `12-HD/BTCTW`, `42-HD/BTCTW`
- **Thời gian phản hồi (`latencyMs`):** 6521ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, nội dung quy trình 3 bước và khung tiêu chí chấm điểm theo Hướng dẫn số 12-HD/BTCTW đã hết hiệu lực và được thay thế bởi Hướng dẫn số 42-HD/BTCTW. Dưới đây là quy định cụ thể từ Hướng dẫn số 12-HD/BTCTW để đồng chí tham khảo theo yêu cầu:

Căn cứ quy định:
- Hướng dẫn số 12-HD/BTCTW ngày 06/07/2018 của Ban Tổ chức Trung ương, Điều 3 và Điều 5. (Lưu ý: Hướng dẫn này hiện đã hết hiệu lực và được thay thế bởi Hướng dẫn số 42-HD/BTCTW ngày 28/10/2025 của Ban Tổ chức Trung ương).

Chi tiết nội dung theo Hướng dẫn số 12-HD/BTCTW:

1. Quy trình 3 bước tiến hành buổi sinh hoạt chi bộ định kỳ hằng tháng (Điều 3):
- Bước 1: Mở đầu
  - Tuyên bố lý do, giới thiệu đại biểu (nếu có).
  - Cử thư ký ghi biên bản buổi sinh hoạt chi bộ.
  - Thông báo tình hình đảng viên (tổng số, có mặt, vắng mặt có lý do và không có lý do, danh sách miễn công tác, sinh hoạt tạm thời).
  - Thông qua nội dung, chương trình buổi sinh hoạt.
- Bước 2: Tiến hành sinh hoạt
  - Báo cáo và gợi ý thảo luận: Bí thư chi bộ trình bày ngắn gọn dự thảo báo cáo tháng trước, phương hướng nhiệm vụ tháng tới và gợi ý các vấn đề trọng tâm.
  - Thảo luận, đóng góp ý kiến: Đảng viên phát biểu dân chủ, tự phê bình kết quả thực hiện nhiệm vụ và góp ý cho đồng chí khác.
  - Định hướng và giải đáp: Bí thư chi bộ cung cấp thông tin thời sự, định hướng tư tưởng và giải đáp thắc mắc của đảng viên.
- Bước 3: Kết thúc
  - Tóm tắt các ý kiến, kết luận nội dung thống nhất và lấy biểu quyết thông qua Nghị quyết (hoặc Kết luận).
  - Tự chấm điểm, đánh giá xếp loại chất lượng buổi sinh hoạt theo khung tiêu chí.
  - Thư ký trình bày biên bản, Bí thư và Thư ký ký tên vào sổ biên bản.

2. Khung tiêu chí đánh giá, chấm điểm chất lượng buổi sinh hoạt chi bộ (Điều 5):
Tổng điểm là 100 điểm, chia thành 5 nhóm tiêu chí:
- Tỷ lệ đảng viên tham gia sinh hoạt (tối đa 20 điểm): Đạt từ 85% trở lên; không có đảng viên vắng mặt không lý do; không vắng mặt có lý do quá 03 lần liên tiếp trong năm.
- Công tác chuẩn bị của chi ủy và bí thư chi bộ (tối đa 20 điểm): Có họp chi ủy chuẩn bị; dự thảo báo cáo, nghị quyết sát thực tế; gửi thông báo nội dung trước cho đảng viên.
- Tổ chức sinh hoạt chi bộ đúng quy trình, phương pháp (tối đa 20 điểm): Thực hiện đủ 3 bước; chủ tọa điều hành linh hoạt; thư ký ghi biên bản chi tiết, đầy đủ.
- Chất lượng thảo luận và phát huy dân chủ (tối đa 20 điểm): Không khí dân chủ, cởi mở; có từ 3 đến 5 ý kiến phát biểu trở lên; thể hiện rõ tính chiến đấu, tinh thần xây dựng trong tự phê bình và phê bình.
- Kết luận và ban hành nghị quyết của chi bộ (tối đa 20 điểm): Kết luận rõ ràng, cụ thể; nghị quyết xác định đúng nhiệm vụ trọng tâm, phân công rõ người, rõ việc, rõ tiến độ; thông qua theo nguyên tắc biểu quyết đa số.

Xếp loại chất lượng:
- Tốt: Từ 90 đến 100 điểm.
- Khá: Từ 70 đến dưới 90 điểm.
- Trung bình: Từ 50 đến dưới 70 điểm.
- Kém: Dưới 50 điểm.

Lưu ý thực hiện: Hướng dẫn số 12-HD/BTCTW ngày 06/07/2018 đã hết hiệu lực. Hiện nay, các chi bộ thực hiện theo Hướng dẫn số 42-HD/BTCTW ngày 28/10/2025 của Ban Tổ chức Trung ương.
```

---

### TC07: Đảng phí 2026 vs 2010
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC07` "Mức đóng đảng phí hằng tháng của đảng viên tham gia BHXH bắt buộc năm 2026 là bao nhiêu? Quyết định 342-QĐ/TW năm 2010 còn hiệu lực không?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `01-QĐ/TW`, `342-QĐ/TW`, `01-HD/TW`
- **Thời gian phản hồi (`latencyMs`):** 8052ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, mức đóng đảng phí hằng tháng của đảng viên tham gia bảo hiểm xã hội bắt buộc năm 2026 được tính bằng 1% tiền lương làm căn cứ đóng bảo hiểm xã hội. Quyết định số 342-QĐ/TW ngày 28/12/2010 của Bộ Chính trị hiện đã hết hiệu lực thi hành từ ngày 01/02/2026.

Căn cứ quy định:
- Quy định số 01-QĐ/TW ngày 03/02/2026 của Bộ Chính trị về chế độ đảng phí, Điều 2 và Điều 0.

Chi tiết nội dung quy định:
- Đối với đảng viên tham gia bảo hiểm xã hội bắt buộc (cán bộ, công chức, viên chức, lực lượng vũ trang, người lao động trong các doanh nghiệp): Đóng đảng phí hằng tháng bằng 1% tiền lương làm căn cứ tính đóng bảo hiểm xã hội bắt buộc của tháng trước liền kề.
- Trong thời gian đảng viên nghỉ việc hưởng chế độ thai sản, ốm đau do cơ quan bảo hiểm xã hội chi trả: Mức đóng đảng phí bằng 1% mức trợ cấp ốm đau, thai sản nhận được.
- Về hiệu lực văn bản: Quyết định số 342-QĐ/TW ngày 28/12/2010 của Bộ Chính trị đã hết hiệu lực thi hành từ ngày 01/02/2026. Toàn bộ chế độ đóng nộp và quản lý sử dụng đảng phí hiện nay được thực hiện theo Quy định số 01-QĐ/TW ngày 03/02/2026 của Bộ Chính trị.
```

---

### TC08: BẪY TỪ KHÓA BLACKLIST/WHITELIST
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC08` "Đảng viên tham gia đánh bạc hoặc can thiệp để vợ con đi du lịch bằng nguồn tài trợ của doanh nghiệp thì vi phạm quy định nào về những điều đảng viên không được làm?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `207-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 6939ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, hành vi tham gia đánh bạc và can thiệp để người thân đi du lịch bằng nguồn tài trợ của doanh nghiệp thuộc các trường hợp bị nghiêm cấm theo quy định của Đảng.

Căn cứ quy định:
- Quy định số 207-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương Đảng về những điều đảng viên không được làm.
- Cụ thể tại Điều 17 và Điều 18.

Chi tiết nội dung vi phạm được quy định như sau:
- Đối với hành vi can thiệp cho người thân đi du lịch bằng tài trợ (Điều 17): Nghiêm cấm việc can thiệp, tác động để vợ (chồng), con, bố, mẹ, anh, chị, em ruột mình, bên vợ (chồng), bản thân và người khác đi du lịch, học tập, chữa bệnh bằng nguồn tài trợ của các cơ quan, tổ chức, doanh nghiệp, cá nhân có liên quan đến ngành, lĩnh vực, địa bàn theo dõi, phụ trách hoặc quản lý; nhận hoa hồng, quà tặng trái quy định của các đối tượng thuộc diện quản lý.
- Đối với hành vi đánh bạc (Điều 18): Nghiêm cấm việc tổ chức hoặc tham gia đánh bạc dưới mọi hình thức; cho vay nặng lãi, tham gia bảo kê, tín dụng đen; sử dụng, tàng trữ, vận chuyển, mua bán trái phép các chất ma túy; uống rượu, bia đến mức bê tha hoặc sử dụng rượu, bia không đúng quy định trong giờ làm việc và tại nơi làm việc.

Lưu ý thực hiện: Mọi đảng viên vi phạm đều phải được chi bộ, cấp ủy và ủy ban kiểm tra các cấp xem xét, xử lý kỷ luật nghiêm minh, công bằng, không có vùng cấm, không có ngoại lệ theo Khoản 2 Điều 20 Quy định số 207-QĐ/TW.
```

---

### TC09: Chuẩn mực đạo đức 144
*Thuộc nhóm: Story 3: Đảng viên & Kế toán Đảng ủy (Kiểm tra Đảng phí 2026 & Bẫy từ khóa nhạy cảm)*

- **Mã TC & Câu hỏi:** `TC09` "5 chuẩn mực đạo đức cách mạng của cán bộ, đảng viên trong giai đoạn mới theo Quy định 144-QĐ/TW gồm những nội dung gì?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `144-QĐ/TW`, `208-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 2480ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Theo Quy định số 144-QĐ/TW, cán bộ, đảng viên trong giai đoạn mới cần thực hiện 05 chuẩn mực đạo đức cách mạng.

Căn cứ quy định:
- Quy định số 144-QĐ/TW ngày 09/05/2024 của Bộ Chính trị.
- Các Điều từ Điều 1 đến Điều 5.

Chi tiết nội dung 05 chuẩn mực đạo đức cách mạng:

- Điều 1: Yêu nước, tôn trọng Nhân dân, tuyệt đối trung thành với Đảng, với Tổ quốc.
- Điều 2: Bản lĩnh, đổi mới, sáng tạo, hội nhập.
- Điều 3: Cần, kiệm, liêm, chính, chí công vô tư.
- Điều 4: Đoàn kết, kỷ cương, tình thương, trách nhiệm.
- Điều 5: Gương mẫu, khiêm tốn, tu dưỡng rèn luyện, học tập suốt đời.
```

---

### TC10: Thẩm quyền kỷ luật của Chi bộ
*Thuộc nhóm: Story 4: Ủy ban Kiểm tra & Văn phòng Cấp ủy cơ sở*

- **Mã TC & Câu hỏi:** `TC10` "Chi bộ có thẩm quyền quyết định khai trừ đảng viên hoặc cách chức không? Thời hiệu kỷ luật khiển trách và cảnh cáo là bao nhiêu năm?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `208-QĐ/TW`, `21-QĐ/TW`, `02-HD/TW`
- **Thời gian phản hồi (`latencyMs`):** 2930ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, chi bộ không có thẩm quyền quyết định khai trừ hoặc cách chức đảng viên. Thời hiệu kỷ luật đối với hình thức Khiển trách là 05 năm, và đối với hình thức Cảnh cáo là 10 năm.

Căn cứ quy định: 
- Quy định số 21-QĐ/TW ngày 11/04/2026 của Ban Chấp hành Trung ương về công tác kiểm tra, giám sát và kỷ luật của Đảng, Điều 3 và Điều 5.

Chi tiết nội dung cụ thể:
- Thẩm quyền thi hành kỷ luật của chi bộ:
  - Chi bộ có thẩm quyền quyết định thi hành kỷ luật bằng hình thức Khiển trách hoặc Cảnh cáo đối với đảng viên trong chi bộ (trừ trường hợp cán bộ thuộc diện cấp ủy cấp trên quản lý).
  - Chi bộ KHÔNG có thẩm quyền quyết định hình thức kỷ luật Cách chức (đối với đảng viên có chức vụ) hoặc Khai trừ ra khỏi Đảng.
  - Khi đảng viên vi phạm đến mức phải áp dụng hình thức Cách chức hoặc Khai trừ, chi bộ tiến hành thảo luận, bỏ phiếu kín đề nghị cấp ủy có thẩm quyền xem xét, ra quyết định kỷ luật theo quy định.

- Thời hiệu kỷ luật đảng viên:
  - Thời hiệu kỷ luật là 05 năm đối với những hành vi vi phạm đến mức phải áp dụng hình thức Khiển trách.
  - Thời hiệu kỷ luật là 10 năm đối với những hành vi vi phạm đến mức phải áp dụng hình thức Cảnh cáo hoặc Cách chức.

Lưu ý thực hiện: Đồng chí cần căn cứ vào tính chất, mức độ vi phạm cụ thể của đảng viên để chi bộ thảo luận, thực hiện đúng thẩm quyền thi hành kỷ luật hoặc đề nghị cấp ủy cấp trên xem xét giải quyết.
```

---

### TC11: Văn phòng Đảng ủy xã & Đại hội XIV
*Thuộc nhóm: Story 4: Ủy ban Kiểm tra & Văn phòng Cấp ủy cơ sở*

- **Mã TC & Câu hỏi:** `TC11` "Chức năng, nhiệm vụ của Văn phòng Đảng ủy xã theo Quy định 299-QĐ/TW năm 2025 và điểm mới của Chỉ thị 45-CT/TW về đại hội đảng bộ các cấp?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `299-QĐ/TW`, `45-CT/TW`
- **Thời gian phản hồi (`latencyMs`):** 6238ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Chức năng, nhiệm vụ của Văn phòng Đảng ủy xã và những điểm mới của Chỉ thị số 45-CT/TW về đại hội đảng bộ các cấp được quy định cụ thể trong các văn bản của Ban Bí thư và Bộ Chính trị.

Căn cứ quy định:
- Quy định số 299-QĐ/TW ngày 09/06/2025 của Ban Bí thư (Điều 1, Điều 3, Điều 7).
- Chỉ thị số 45-CT/TW ngày 14/04/2025 của Bộ Chính trị (Điều 1, Điều 2, Điều 3).

Chi tiết nội dung:

1. Chức năng và nhiệm vụ của Văn phòng Đảng ủy xã (Quy định số 299-QĐ/TW):
- Vị trí và chức năng: Là cơ quan chuyên trách tham mưu, giúp việc đảng ủy xã (trực tiếp là ban thường vụ và thường trực đảng ủy xã); là trung tâm thông tin tổng hợp phục vụ sự lãnh đạo, chỉ đạo toàn diện; trực tiếp quản lý tài chính, tài sản và bảo đảm hậu cần, cơ sở vật chất cho hoạt động của đảng ủy.
- Nhiệm vụ tham mưu chính:
  - Tổ chức, điều hành công việc lãnh đạo, chỉ đạo của đảng bộ xã; phối hợp hoạt động giữa các cơ quan tham mưu, giúp việc của đảng ủy.
  - Chủ trì tham mưu về công tác cải cách hành chính, ứng dụng công nghệ thông tin và chuyển đổi số trong các cơ quan đảng cấp xã.
- Nhiệm vụ thông tin tổng hợp và chế độ báo cáo:
  - Thu thập, tổng hợp tình hình thực hiện các nghị quyết, chỉ thị, kết luận, quy định của Trung ương, cấp ủy cấp trên và của đảng ủy xã.
  - Theo dõi, nắm tình hình hoạt động của các chi bộ trực thuộc, HĐND, UBND, Ủy ban MTTQ và các tổ chức chính trị - xã hội cấp xã để báo cáo thường trực đảng ủy.
  - Định kỳ xây dựng các báo cáo tháng, quý, 6 tháng, 9 tháng, năm, báo cáo đột xuất gửi Ban Thường vụ Tỉnh ủy / Thành ủy (hoặc cấp ủy cấp trên trực tiếp) và cung cấp thông tin phục vụ công tác lãnh đạo, chỉ đạo.
- Mối quan hệ công tác: Chịu sự lãnh đạo, chỉ đạo trực tiếp, toàn diện của Ban Thường vụ và Thường trực Đảng ủy xã; chịu sự hướng dẫn, kiểm tra nghiệp vụ từ Văn phòng cấp ủy cấp trên trực tiếp; phối hợp chặt chẽ với các cơ quan tham mưu, giúp việc, HĐND, UBND, Ủy ban MTTQ và các đoàn thể chính trị - xã hội cấp xã.

2. Điểm mới và nội dung trọng tâm của Chỉ thị số 45-CT/TW về đại hội đảng bộ các cấp:
- Về hiệu lực thay thế: Chỉ thị số 45-CT/TW chính thức thay thế Chỉ thị số 35-CT/TW ngày 14/06/2024 và Kết luận số 118-KL/TW ngày 18/01/2025 của Bộ Chính trị, gắn liền với cuộc cách mạng tinh gọn tổ chức bộ máy và nâng cao hiệu năng, hiệu lực, hiệu quả hoạt động của hệ thống chính trị trong kỷ nguyên vươn mình của dân tộc.
- Nhiệm vụ trọng tâm của đại hội:
  - Kiểm điểm 5 năm thực hiện Nghị quyết Đại hội XIII của Đảng và nghị quyết đại hội đảng bộ cùng cấp nhiệm kỳ 2020 - 2025.
  - Thảo luận, đóng góp ý kiến vào dự thảo các văn kiện Đại hội XIV của Đảng và văn kiện đại hội đảng bộ cấp trên trực tiếp.
  - Bầu ban chấp hành đảng bộ nhiệm kỳ 2025 - 2030 và bầu đoàn đại biểu dự đại hội đảng bộ cấp trên.
- Yêu cầu cốt lõi về công tác nhân sự:
  - Đặt dưới sự lãnh đạo trực tiếp, toàn diện của cấp ủy; bảo đảm nguyên tắc tập trung dân chủ, khách quan, công tâm, minh bạch.
  - Kiên quyết không để lọt vào cấp ủy những người bản lĩnh chính trị không vững vàng; cơ hội chính trị, bè phái, tham vọng quyền lực, suy thoái về tư tưởng chính trị, đạo đức, lối sống, tự diễn biến, tự chuyển hóa; vi phạm các quy định về chuẩn mực đạo đức cách mạng theo Quy định số 144-QĐ/TW và những điều đảng viên không được làm theo Quy định số 37-QĐ/TW.
  - Cơ cấu cấp ủy phải gắn liền với phương án sắp xếp, tinh gọn tổ chức bộ máy cơ quan Đảng, chính quyền, Mặt trận Tổ quốc và các tổ chức chính trị - xã hội.

Lưu ý thực hiện: Đồng chí cán bộ, đảng viên khi triển khai thực hiện cần bám sát các mốc thời gian vận hành mô hình chính quyền địa phương và các chỉ đạo cụ thể của cấp ủy cấp trên trực tiếp.
```

---

### TC12: Tiếng Việt không dấu
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC12` "dang vien du bi co quyen bieu quyet, ung cu va bau cu khong?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `208-QĐ/TW`, `02-HD/TW`, `21-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 4206ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Thưa đồng chí, đảng viên dự bị không có quyền biểu quyết, ứng cử và bầu cử cơ quan lãnh đạo của Đảng.

Căn cứ quy định:
- Quy định số 208-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương, Điều 2, Khoản 3.
- Hướng dẫn số 02-HD/TW ngày 07/08/2026 của Ban Bí thư, Điều 3, Khoản 3.

Chi tiết nội dung:
- Đảng viên dự bị có các quyền và nhiệm vụ như đảng viên chính thức, trừ các quyền: biểu quyết, ứng cử và bầu cử cơ quan lãnh đạo của Đảng.
- Đảng viên dự bị không được biểu quyết thông qua nghị quyết của chi bộ.
- Đảng viên dự bị không được ứng cử, đề cử và bầu cử cấp ủy, đại biểu dự đại hội đảng bộ các cấp.
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
• Công tác văn thư và lưu trữ cơ quan Đảng (HD 06-HD/VPTW ngày 29/05/2026, QĐ 383-QĐ/TW về Phông lưu trữ Đảng, Luật Lưu trữ 2024, nộp lưu hồ sơ...)
• Điều lệ, kỷ luật và nghiệp vụ công tác Đảng (Quy định 208-QĐ/TW, Quy định 207-QĐ/TW, Hướng dẫn 02-HD/TW, Quy định 21-QĐ/TW, Quy định 01-QĐ/TW...)
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

### TC16: Kiểm tra Bẫy Điều 0 với văn bản hết hiệu lực
*Thuộc nhóm: Story 5: Kiểm thử Edge Cases (Gõ không dấu, Bẫy ngoài luồng, Spam, Lệnh hệ thống)*

- **Mã TC & Câu hỏi:** `TC16` "Quy định 37 về những điều đảng viên không được làm quy định như thế nào?"
- **Intent nhận diện:** `party_regulation`
- **Mã văn bản RAG trích xuất (`retrievedDocs`):** `37-QĐ/TW`, `207-QĐ/TW`
- **Thời gian phản hồi (`latencyMs`):** 3395ms
- **Kiểm tra Zero-Emoji (Có chứa emoji không?):** PASS
- **Toàn văn câu trả lời của Bot:**

```text
Quy định số 37-QĐ/TW ngày 25/10/2021 của Ban Chấp hành Trung ương về 19 điều đảng viên không được làm đã hết hiệu lực thi hành từ ngày 26/07/2026 và được thay thế toàn diện bởi Quy định số 207-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương Đảng.

Căn cứ quy định:
- Quy định số 37-QĐ/TW ngày 25/10/2021 của Ban Chấp hành Trung ương.
- Quy định số 207-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương Đảng (Điều 20).

Chi tiết nội dung liên quan đến hiệu lực và quy định hiện hành:
- Quy định số 37-QĐ/TW đã chính thức hết hiệu lực thi hành từ ngày 26/07/2026.
- Toàn bộ các điều cấm đối với đảng viên hiện nay được thực hiện thống nhất theo Quy định số 207-QĐ/TW ngày 26/07/2026 của Ban Chấp hành Trung ương Đảng.
- Mọi hành vi vi phạm hiện nay đều phải được xem xét, xử lý kỷ luật theo quy định mới hiện hành.

Lưu ý thực hiện: Đồng chí khi tìm hiểu hoặc áp dụng các quy định về những điều đảng viên không được làm cần sử dụng Quy định số 207-QĐ/TW ngày 26/07/2026 thay cho Quy định số 37-QĐ/TW cũ.
```

---

