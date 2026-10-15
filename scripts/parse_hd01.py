import re
import json
import os

def parse_hd01():
    txt_path = 'data/extracted_full_text/Huong_dan_01_full.txt'
    with open(txt_path, 'r', encoding='utf-8') as f:
        raw = f.read()

    # Làm sạch header các trang quét OCR
    cleaned = re.sub(r'--- TRANG \d+ ---\n?', '', raw)
    cleaned = re.sub(r'^\d+\.HDTW\d+\s+\d+.*$\n?', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^[1I]\.HDTWO[I1]\s+\d+.*$\n?', '', cleaned, flags=re.MULTILINE)
    
    # Sửa lỗi số mục do OCR quét sai ký tự
    cleaned = re.sub(r'(?m)^53\.1\.', '5.1.', cleaned)
    cleaned = re.sub(r'(?m)^3\.2,', '5.2.', cleaned)
    cleaned = re.sub(r'(?m)^15\.1,', '15.1.', cleaned)
    cleaned = re.sub(r'(?m)^15\.4,', '15.4.', cleaned)
    cleaned = re.sub(r'(?m)^1ổ\.4\.', '18.4.', cleaned)

    # 19 mục chính
    main_sections = [
        (1, 'Tuổi đời và trình độ học vấn của người vào Đảng ở một số trường hợp đặc biệt'),
        (2, 'Đảng viên phải hoàn thành tốt nhiệm vụ được giao'),
        (3, 'Thủ tục xem xét kết nạp đảng viên (kể cả kết nạp lại)'),
        (4, 'Hồ sơ, thủ tục xét công nhận đảng viên dự bị thành đảng viên chính thức (kể cả kết nạp lại)'),
        (5, 'Một số vấn đề liên quan đến kết nạp đảng viên và công nhận đảng viên chính thức'),
        (6, 'Kết nạp đảng viên trong một số trường hợp cụ thể'),
        (7, 'Phát và quản lý thẻ đảng viên'),
        (8, 'Quản lý hồ sơ đảng viên'),
        (9, 'Giải quyết việc thay đổi họ tên và ngày tháng năm sinh'),
        (10, 'Chuyển sinh hoạt đảng'),
        (11, 'Xóa tên đảng viên trong danh sách đảng viên và đảng viên xin ra khỏi Đảng'),
        (12, 'Về tên gọi và cách tính nhiệm kỳ đại hội đảng bộ'),
        (13, 'Về đại biểu ở đại hội đại biểu và đảng viên ở đại hội đảng viên'),
        (14, 'Quy trình tổ chức đại hội'),
        (15, 'Việc chỉ định bổ sung hoặc tăng thêm cấp ủy viên, ủy viên ban thường vụ'),
        (16, 'Về thành lập đảng bộ khối trực thuộc tỉnh ủy, thành ủy trực thuộc Trung ương'),
        (17, 'Việc lập cơ quan tham mưu, giúp việc và đơn vị sự nghiệp của cấp ủy'),
        (18, 'Tặng Huy hiệu Đảng'),
        (19, 'Khen thưởng tổ chức đảng và đảng viên')
    ]

    # Tìm vị trí bắt đầu của từng mục chính
    sec_positions = []
    for num, title in main_sections:
        pat = rf'(?m)^{num}\.\s+[^\n]+'
        m = re.search(pat, cleaned)
        if not m:
            raise ValueError(f'Không tìm thấy Mục {num}: {title}')
        sec_positions.append((num, title, m.start(), m.end()))

    articles = []

    # Điều 0: Lưu ý hiệu lực
    articles.append({
        "articleNumber": "0",
        "title": "Hiệu lực văn bản và quy định thay thế hiện hành",
        "content": "Hướng dẫn số 01-HD/TW ngày 28/09/2021 của Ban Bí thư về một số vấn đề cụ thể thi hành Điều lệ Đảng là văn bản hướng dẫn nghiệp vụ thi hành Quy định số 24-QĐ/TW ngày 30/07/2021 của Ban Chấp hành Trung ương. Khi áp dụng các quy định về tổ chức cơ sở đảng, hồ sơ đảng viên, quản lý thẻ và sinh hoạt đảng tại địa phương, cần kết hợp đối chiếu với các văn bản cập nhật mới nhất của Ban Bí thư."
    })

    for idx, (num, title, start_idx, header_end) in enumerate(sec_positions):
        next_start = sec_positions[idx + 1][2] if idx + 1 < len(sec_positions) else len(cleaned)
        sec_body = cleaned[header_end:next_start].strip()

        # Đối với các mục dài (Mục 3, Mục 8, Mục 10), chúng ta tách thành các tiểu mục rõ ràng
        if num == 3:
            # Tách Mục 3
            sub_splits = [
                ("3.1", "Bồi dưỡng nhận thức về Đảng", r'(?m)^3\.1\.\s+'),
                ("3.2", "Đơn xin vào Đảng và Lý lịch của người vào Đảng", r'(?m)^3\.2\.\s+'),
                ("3.4", "Thẩm tra lý lịch của người vào Đảng", r'(?m)^3\.4\.\s+'),
                ("3.5", "Lấy ý kiến nhận xét của đoàn thể chính trị - xã hội nơi làm việc và chi ủy nơi cư trú", r'(?m)^3\.5\.\s+'),
                ("3.6", "Nghị quyết của chi bộ và cấp ủy cơ sở xét kết nạp người vào Đảng", r'(?m)^3\.6\.\s+'),
                ("3.7", "Quyết định của cấp ủy có thẩm quyền kết nạp đảng viên và Lễ kết nạp đảng viên", r'(?m)^3\.7\.\s+'),
                ("3.9", "Kết nạp đảng viên khi thay đổi nơi công tác/cư trú và Phân công đảng viên giúp đỡ đảng viên dự bị", r'(?m)^3\.9\.\s+')
            ]
            sub_matches = []
            for sub_code, sub_title, pat in sub_splits:
                sm = re.search(pat, sec_body)
                if sm:
                    sub_matches.append((sub_code, sub_title, sm.start()))
            
            for s_idx, (sc, st, s_start) in enumerate(sub_matches):
                s_next = sub_matches[s_idx + 1][2] if s_idx + 1 < len(sub_matches) else len(sec_body)
                sub_content = sec_body[s_start:s_next].strip()
                articles.append({
                    "articleNumber": sc,
                    "title": f"Mục 3: {st}",
                    "content": sub_content
                })

        elif num == 8:
            # Tách Mục 8
            sub_splits = [
                ("8.1", "Hồ sơ đảng viên và yêu cầu quản lý hồ sơ đảng viên", r'(?m)^8\.1\.\s+'),
                ("8.3", "Trách nhiệm của đảng viên và cấp ủy về xây dựng, quản lý hồ sơ đảng viên", r'(?m)^8\.3\.\s+')
            ]
            sub_matches = []
            for sub_code, sub_title, pat in sub_splits:
                sm = re.search(pat, sec_body)
                if sm:
                    sub_matches.append((sub_code, sub_title, sm.start()))
            
            for s_idx, (sc, st, s_start) in enumerate(sub_matches):
                s_next = sub_matches[s_idx + 1][2] if s_idx + 1 < len(sub_matches) else len(sec_body)
                sub_content = sec_body[s_start:s_next].strip()
                articles.append({
                    "articleNumber": sc,
                    "title": f"Mục 8: {st}",
                    "content": sub_content
                })

        elif num == 10:
            # Tách Mục 10
            sub_splits = [
                ("10.1", "Trách nhiệm của đảng viên và cấp ủy về chuyển sinh hoạt đảng", r'(?m)^10\.1\.\s+'),
                ("10.2", "Thủ tục chuyển sinh hoạt đảng (chính thức, tạm thời, nội bộ)", r'(?m)^10\.2\.\s+'),
                ("10.3", "Quản lý sinh hoạt đảng và chuyển sinh hoạt đảng trong các trường hợp cụ thể", r'(?m)^10\.3\.\s+'),
                ("10.4", "Sử dụng, bảo quản giấy giới thiệu sinh hoạt đảng và Chuyển giao tổ chức đảng", r'(?m)^10\.4\.\s+')
            ]
            sub_matches = []
            for sub_code, sub_title, pat in sub_splits:
                sm = re.search(pat, sec_body)
                if sm:
                    sub_matches.append((sub_code, sub_title, sm.start()))
            
            for s_idx, (sc, st, s_start) in enumerate(sub_matches):
                s_next = sub_matches[s_idx + 1][2] if s_idx + 1 < len(sub_matches) else len(sec_body)
                sub_content = sec_body[s_start:s_next].strip()
                articles.append({
                    "articleNumber": sc,
                    "title": f"Mục 10: {st}",
                    "content": sub_content
                })

        else:
            articles.append({
                "articleNumber": str(num),
                "title": f"Mục {num}: {title}",
                "content": sec_body
            })

    output_data = {
        "documentId": "01-HD/TW-2021",
        "documentCode": "01-HD/TW",
        "documentName": "Hướng dẫn một số vấn đề cụ thể thi hành Điều lệ Đảng",
        "issuer": "Ban Bí thư",
        "category": "quy_dinh_dang",
        "issueDate": "2021-09-28",
        "status": "Còn hiệu lực thi hành",
        "description": "Hướng dẫn số 01-HD/TW ngày 28/09/2021 của Ban Bí thư khóa XIII hướng dẫn một số vấn đề cụ thể thi hành Điều lệ Đảng và Quy định số 24-QĐ/TW của Ban Chấp hành Trung ương.",
        "articles": articles
    }

    target_file = 'data/regulations/hd-01-hd-tw.json'
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    total_chars = sum(len(a['content']) for a in articles)
    print(f"✅ Đã parse và ghi thành công vào {target_file}:")
    print(f"• Số lượng điều/mục: {len(articles)} điều khoản")
    print(f"• Tổng số ký tự toàn văn: {total_chars:,} ký tự")
    for a in articles:
        print(f"  - Điều {a['articleNumber']}: {a['title'][:60]} ({len(a['content'])} ký tự)")

if __name__ == '__main__':
    parse_hd01()
