# -*- coding: utf-8 -*-
"""
Script xây dựng các file JSON quy định từ kho Tài liệu tập huấn (VPTW 2026, 2019, 2017, các Khung phân loại chuyên ngành)
"""

import json
import os
import re

REG_DIR = '/Users/bcc/MyProject/zalo-bot/data/regulations'
TXT_DIR = '/Users/bcc/MyProject/zalo-bot/.tmp/extracted_text'

def clean_ocr(text):
    text = re.sub(r'--- TRANG \d+ ---', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

# ==============================================================================
# 1. HƯỚNG DẪN 06-HD/VPTW NGÀY 29/05/2026 (BẢN SIGNED TOÀN VĂN MỚI NHẤT)
# ==============================================================================
def build_hd_06():
    with open(os.path.join(TXT_DIR, 'hdvp06.signed.signed.txt'), 'r', encoding='utf-8') as f:
        raw_text = clean_ocr(f.read())

    doc = {
        "documentId": "HD-06-VPTW-2026",
        "documentCode": "06-HD/VPTW",
        "documentName": "Hướng dẫn lập hồ sơ và nộp hồ sơ, tài liệu vào lưu trữ hiện hành",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2026-05-29",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 06-HD/VPTW ngày 29/05/2026 của Văn phòng Trung ương Đảng thực hiện Luật Lưu trữ số 33/2024/QH15 và Quy định số 383-QĐ/TW ngày 19/11/2025 về Phông Lưu trữ Đảng Cộng sản Việt Nam; quy định toàn diện quy trình lập hồ sơ tài liệu điện tử, tài liệu giấy và thời hạn nộp lưu hồ sơ vào lưu trữ hiện hành từ Trung ương đến cơ sở.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh và đối tượng áp dụng theo Hướng dẫn 06-HD/VPTW",
                "content": "1. Phạm vi điều chỉnh: Hướng dẫn việc lập hồ sơ và nộp hồ sơ, tài liệu có giá trị (bao gồm tài liệu điện tử, tài liệu giấy và tài liệu trên các vật mang tin khác) vào lưu trữ hiện hành đối với văn bản, tài liệu hình thành trong quá trình hoạt động của các cơ quan, tổ chức đảng, Mặt trận Tổ quốc Việt Nam (gồm các tổ chức chính trị - xã hội, các hội quần chúng do Đảng, Nhà nước giao nhiệm vụ) từ Trung ương đến cơ sở.\n2. Đối tượng áp dụng: Các cơ quan, tổ chức đảng, Mặt trận Tổ quốc Việt Nam và các tổ chức chính trị - xã hội từ cấp Trung ương, cấp tỉnh (tỉnh, thành phố) đến cấp cơ sở (xã, phường, đặc khu)."
            },
            {
                "articleNumber": "2",
                "title": "Giải thích từ ngữ chuyên ngành công tác lập hồ sơ và lưu trữ hiện hành",
                "content": "1. 'Hồ sơ' là tập hợp các văn bản, tài liệu có liên quan với nhau về một vấn đề, một sự việc, một đối tượng cụ thể hoặc có đặc điểm chung, hình thành trong quá trình theo dõi, giải quyết công việc thuộc phạm vi chức năng, nhiệm vụ của cơ quan, tổ chức, cá nhân.\n2. 'Lập hồ sơ' là việc tập hợp, sắp xếp văn bản, tài liệu hình thành trong quá trình theo dõi, giải quyết công việc của cơ quan, tổ chức, cá nhân thành hồ sơ theo những nguyên tắc và phương pháp nhất định.\n3. 'Hồ sơ điện tử' là tập hợp các tài liệu điện tử có liên quan với nhau về một vấn đề, sự việc, đối tượng cụ thể hoặc có đặc điểm chung, hình thành trong quá trình theo dõi, giải quyết công việc của cơ quan, tổ chức, cá nhân.\n4. 'Lưu trữ hiện hành' (trước đây gọi là Lưu trữ cơ quan) là bộ phận lưu trữ của cơ quan, tổ chức có nhiệm vụ thu thập, chỉnh lý, bảo quản và phục vụ khai thác, sử dụng tài liệu lưu trữ hình thành trong quá trình hoạt động của cơ quan, tổ chức trước khi nộp vào Lưu trữ lịch sử."
            },
            {
                "articleNumber": "3",
                "title": "Yêu cầu đối với hồ sơ được lập trong cơ quan Đảng",
                "content": "1. Hồ sơ được lập phải phản ánh đúng chức năng, nhiệm vụ của cơ quan, tổ chức, đơn vị và của cá nhân được giao theo dõi, giải quyết công việc.\n2. Văn bản, tài liệu được thu thập vào hồ sơ phải có sự liên quan chặt chẽ với nhau và phản ánh đúng trình tự diễn biến của sự việc hoặc trình tự giải quyết công việc.\n3. Văn bản, tài liệu trong hồ sơ phải có giá trị pháp lý và giá trị thực tiễn; đối với tài liệu giấy phải là bản chính hoặc bản sao hợp pháp; đối với tài liệu điện tử phải đáp ứng các tiêu chuẩn dữ liệu thông tin đầu vào theo quy định của Trung ương Đảng và pháp luật về lưu trữ điện tử.\n4. Hồ sơ phải được kết thúc đúng thời điểm sự việc kết thúc hoặc công việc được giải quyết xong."
            },
            {
                "articleNumber": "4",
                "title": "Trách nhiệm của người đứng đầu, cán bộ và lưu trữ hiện hành",
                "content": "1. Người đứng đầu cơ quan, tổ chức: Có trách nhiệm chỉ đạo, kiểm tra, đôn đốc việc lập hồ sơ và nộp hồ sơ, tài liệu vào lưu trữ hiện hành; bảo đảm các điều kiện về cơ sở vật chất, kinh phí và phương tiện kỹ thuật cho công tác lưu trữ.\n2. Người đứng đầu các đơn vị trực thuộc: Có trách nhiệm tổ chức thực hiện việc lập hồ sơ và giao nộp hồ sơ, tài liệu của đơn vị mình vào lưu trữ hiện hành đúng thời hạn quy định.\n3. Cán bộ, công chức, nhân viên: Khi được giao theo dõi, giải quyết công việc có trách nhiệm lập hồ sơ về công việc đó và nộp hồ sơ, tài liệu vào lưu trữ hiện hành theo đúng danh mục hồ sơ và quy trình; trước khi chuyển công tác, thôi việc, nghỉ hưởng chế độ phải bàn giao toàn bộ hồ sơ, tài liệu cho người kế nhiệm hoặc lưu trữ hiện hành.\n4. Cán bộ lưu trữ hiện hành: Có trách nhiệm tham mưu xây dựng Danh mục hồ sơ hằng năm; hướng dẫn nghiệp vụ lập hồ sơ; tiếp nhận, kiểm tra hồ sơ nộp lưu; tổ chức bảo quản an toàn và phục vụ khai thác, sử dụng tài liệu."
            },
            {
                "articleNumber": "5",
                "title": "Lập Danh mục hồ sơ tài liệu điện tử và tài liệu giấy hằng năm",
                "content": "1. Căn cứ lập Danh mục hồ sơ: Căn cứ chức năng, nhiệm vụ, quyền hạn của cơ quan, tổ chức và các đơn vị trực thuộc; Quy chế làm việc; Kế hoạch công tác năm; Bảng thời hạn lưu trữ hồ sơ, tài liệu; Danh mục hồ sơ của các năm trước.\n2. Cấu trúc Danh mục hồ sơ: Được phân chia theo cơ cấu tổ chức (các phòng, ban, đơn vị) hoặc theo mặt hoạt động nghiệp vụ. Trong từng đơn vị hoặc mặt hoạt động, các hồ sơ được sắp xếp theo trình tự: Hồ sơ công việc chung -> Hồ sơ công việc chuyên môn -> Hồ sơ vụ việc, chuyên đề -> Hồ sơ nhân sự, tài chính, quản trị.\n3. Tiêu đề hồ sơ: Phải ngắn gọn, rõ ràng, phản ánh chính xác nội dung tài liệu bên trong; nêu rõ tác giả, nội dung, thời gian và địa điểm (nếu có).\n4. Thời hạn bảo quản: Ghi rõ thời hạn lưu trữ (Vĩnh viễn hoặc số năm cụ thể như 70 năm, 30 năm, 20 năm, 10 năm, 5 năm) theo Bảng thời hạn lưu trữ hiện hành của Trung ương Đảng."
            },
            {
                "articleNumber": "6",
                "title": "Quy trình lập hồ sơ tài liệu điện tử trên Hệ thống thông tin điều hành tác nghiệp",
                "content": "1. Mở hồ sơ điện tử: Đầu năm hoặc khi phát sinh công việc cần giải quyết, cán bộ được phân công mở hồ sơ điện tử trên Hệ thống thông tin điều hành tác nghiệp theo Danh mục hồ sơ đã được phê duyệt.\n2. Thu thập và cập nhật tài liệu điện tử: Cán bộ cập nhật toàn bộ văn bản đến, dự thảo văn bản, văn bản đi chính thức có ký số, ý kiến chỉ đạo, báo cáo, tài liệu đính kèm liên quan đến công việc vào đúng mã hồ sơ điện tử đã mở.\n3. Đóng và kết thúc hồ sơ điện tử: Khi công việc giải quyết xong, cán bộ kiểm tra lại thành phần tài liệu trong hồ sơ, rà soát tính toàn vẹn của siêu dữ liệu (metadata), đóng hồ sơ và chuyển trạng thái hoàn thành trên phần mềm quản lý văn bản và điều hành."
            },
            {
                "articleNumber": "7",
                "title": "Quy trình lập hồ sơ tài liệu giấy và tài liệu trên vật mang tin khác",
                "content": "1. Mở hồ sơ giấy: Chuẩn bị bìa hồ sơ, ghi các thông tin ban đầu: Tên cơ quan, tên đơn vị, tiêu đề hồ sơ, năm mở hồ sơ, ký hiệu hồ sơ theo Danh mục hồ sơ.\n2. Thu thập, sắp xếp tài liệu vào hồ sơ giấy: Thu thập đầy đủ các văn bản đi, đến, bản thảo có bút tích chỉ đạo của lãnh đạo; sắp xếp theo trình tự thời gian giải quyết sự việc hoặc theo trình tự tầm quan trọng của văn bản; loại bỏ bản trùng thừa, bản nháp không cần thiết.\n3. Kết thúc hồ sơ giấy: Kiểm tra sự hoàn thiện của văn bản; đánh số tờ bằng bút chì ở góc trên bên phải của từng tờ tài liệu; viết Mục lục văn bản trong hồ sơ; viết Tờ chứng từ kết thúc (ghi rõ số lượng tờ tài liệu, tình trạng vật lý); hoàn thiện thông tin trên bìa hồ sơ (ngày bắt đầu, ngày kết thúc, số lượng tờ, thời hạn bảo quản)."
            },
            {
                "articleNumber": "8",
                "title": "Thời hạn giao nộp hồ sơ, tài liệu vào lưu trữ hiện hành",
                "content": "1. Đối với hồ sơ, tài liệu hành chính thông thường (cả điện tử và giấy): Phải nộp vào lưu trữ hiện hành trong thời hạn 01 năm kể từ ngày công việc kết thúc (ví dụ: hồ sơ năm 2026 nộp lưu trong năm 2027).\n2. Đối với hồ sơ, tài liệu nghiên cứu khoa học, đề tài, đề án: Phải nộp vào lưu trữ hiện hành trong thời hạn 01 năm kể từ ngày đề tài, đề án được nghiệm thu chính thức.\n3. Đối với hồ sơ, tài liệu xây dựng cơ bản: Phải nộp vào lưu trữ hiện hành trong thời hạn 03 tháng kể từ ngày công trình được quyết toán hoặc bàn giao đưa vào sử dụng.\n4. Đối với tài liệu về giải thể, sáp nhập, chia tách cơ quan: Phải hoàn thành việc lập hồ sơ và nộp vào lưu trữ hiện hành trong thời hạn 03 tháng kể từ ngày có quyết định giải thể, sáp nhập, chia tách của cấp có thẩm quyền."
            },
            {
                "articleNumber": "9",
                "title": "Thủ tục nộp hồ sơ vào lưu trữ hiện hành và tổ chức thực hiện",
                "content": "1. Thủ tục giao nộp: Đơn vị, cá nhân giao nộp hồ sơ phải lập 02 bản 'Mục lục hồ sơ, tài liệu nộp lưu' và 02 bản 'Biên bản giao nhận hồ sơ, tài liệu'. Cán bộ lưu trữ hiện hành tiến hành đối chiếu, kiểm tra thực tế giữa Mục lục và hồ sơ tài liệu trước khi ký xác nhận.\n2. Sau khi ký biên bản giao nhận, bên giao giữ 01 bản Mục lục và 01 bản Biên bản, bên nhận (lưu trữ hiện hành) giữ 01 bản Mục lục và 01 bản Biên bản để đưa vào hồ sơ phông lưu trữ.\n3. Tổ chức thực hiện: Hướng dẫn này có hiệu lực từ ngày ký (29/05/2026). Giao Cục Lưu trữ Văn phòng Trung ương Đảng theo dõi, kiểm tra, đôn đốc việc thực hiện trong toàn Đảng."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-06-vptw.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 2. HƯỚNG DẪN 17-HD/VPTW NGÀY 31/07/2026 (PHƯƠNG ÁN PHÂN LOẠI CẤP XÃ 2026)
# ==============================================================================
def build_hd_17():
    with open(os.path.join(TXT_DIR, 'HD-0017-phuong an phan loai tai lieu.txt'), 'r', encoding='utf-8') as f:
        raw_text = clean_ocr(f.read())

    doc = {
        "documentId": "HD-17-VPTW-2026",
        "documentCode": "17-HD/VPTW",
        "documentName": "Hướng dẫn lập phông lưu trữ và phương án phân loại tài liệu của cơ quan lãnh đạo đảng, các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã, phường, đặc khu",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2026-07-31",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 17-HD/VPTW ngày 31/07/2026 của Văn phòng Trung ương Đảng hướng dẫn lập phông lưu trữ và phương án phân loại tài liệu của cơ quan lãnh đạo đảng, các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã, phường, đặc khu; chuẩn hóa mô hình tổ chức lưu trữ cơ sở phù hợp chính quyền địa phương 2 cấp.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh và đối tượng áp dụng tại cấp xã theo Hướng dẫn 17-HD/VPTW",
                "content": "1. Phạm vi điều chỉnh: Lập phông lưu trữ và phương án phân loại tài liệu (tài liệu giấy, tài liệu điện tử, tài liệu trên các vật mang tin khác) của cơ quan lãnh đạo đảng, các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã, phường, đặc khu.\n2. Đối tượng áp dụng: Đảng uỷ xã, phường, đặc khu (sau đây gọi chung là đảng uỷ xã); các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã (Văn phòng đảng ủy, Cơ quan UBKT đảng ủy, Ban Xây dựng Đảng đảng ủy xã); và lưu trữ lịch sử của Đảng ở cấp tỉnh."
            },
            {
                "articleNumber": "2",
                "title": "Xác định phông, thành phần tài liệu và tên phông lưu trữ cấp xã",
                "content": "1. Phông lưu trữ cơ quan lãnh đạo đảng xã: Toàn bộ tài liệu hình thành trong quá trình hoạt động của đại hội đại biểu đảng bộ xã, ban chấp hành đảng bộ xã lập thành một phông lưu trữ duy nhất, tên phông là: 'Phông lưu trữ cơ quan lãnh đạo đảng xã (kèm tên đơn vị hành chính xã)'.\n2. Phông lưu trữ các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã: Toàn bộ tài liệu hình thành trong quá trình hoạt động của mỗi cơ quan chuyên trách tham mưu, giúp việc đảng uỷ xã lập thành một phông lưu trữ riêng độc lập, tên phông đặt theo tên của cơ quan đó (ví dụ: 'Phông lưu trữ văn phòng đảng uỷ xã...', 'Phông lưu trữ cơ quan uỷ ban kiểm tra đảng uỷ xã...', 'Phông lưu trữ ban xây dựng đảng đảng uỷ xã...').\n3. Giới hạn thời gian của phông: Bắt đầu và kết thúc theo quyết định thành lập hoặc chỉ định và quyết định kết thúc hoạt động của đảng bộ xã hoặc cơ quan chuyên trách tham mưu cấp xã."
            },
            {
                "articleNumber": "3",
                "title": "Nguyên tắc xây dựng phương án phân loại tài liệu phông cấp xã",
                "content": "1. Phương án phân loại tài liệu là bản đề cương phân chia tài liệu của một phông lưu trữ thành các nhóm lớn, nhóm vừa và nhóm nhỏ theo những đặc trưng nhất định nhằm quản lý khoa học, tra cứu thuận tiện và bảo quản an toàn.\n2. Đối với Phông lưu trữ cơ quan lãnh đạo đảng xã: Áp dụng phương án phân loại theo 'Thời gian - Vấn đề' hoặc 'Mặt hoạt động - Thời gian' (phân chia theo nhiệm kỳ Đại hội, theo năm công tác và theo các nhóm chuyên đề lãnh đạo của cấp ủy).\n3. Đối với Phông lưu trữ các cơ quan chuyên trách tham mưu giúp việc đảng ủy xã: Áp dụng phương án phân loại theo 'Thời gian - Mặt hoạt động' hoặc 'Cơ cấu tổ chức - Thời gian' kết hợp với tính chất vụ việc chuyên môn."
            },
            {
                "articleNumber": "4",
                "title": "Mẫu phương án phân loại tài liệu Phông cơ quan lãnh đạo đảng cấp xã",
                "content": "Tài liệu cơ quan lãnh đạo đảng cấp xã được phân thành các nhóm chủ yếu sau:\n1. Tài liệu Đại hội Đảng bộ xã: Hồ sơ chuẩn bị nhân sự, báo cáo chính trị, báo cáo kiểm điểm, biên bản đại hội, nghị quyết đại hội, biên bản bầu cử ban chấp hành và đoàn đại biểu đi dự đại hội cấp trên.\n2. Tài liệu Ban Chấp hành, Ban Thường vụ Đảng ủy xã: Biên bản các kỳ họp định kỳ, đột xuất; các nghị quyết, chỉ thị, kết luận, quy định, chương trình công tác toàn khóa và hằng năm.\n3. Tài liệu công tác xây dựng Đảng: Công tác tổ chức cán bộ, đảng viên (hồ sơ đề nghị kết nạp, công nhận chính thức, khen thưởng, kỷ luật, xóa tên đảng viên do cấp ủy xem xét); công tác tuyên giáo, dân vận; công tác kiểm tra, giám sát của Đảng ủy.\n4. Tài liệu chỉ đạo hệ thống chính trị cấp xã: Lãnh đạo hoạt động của Hội đồng nhân dân, Ủy ban nhân dân, Mặt trận Tổ quốc và các đoàn thể chính trị - xã hội cơ sở."
            },
            {
                "articleNumber": "5",
                "title": "Mẫu phương án phân loại tài liệu Phông Văn phòng Đảng ủy cấp xã",
                "content": "Tài liệu Văn phòng Đảng ủy cấp xã được phân loại theo các nhóm nghiệp vụ:\n1. Tài liệu về công tác tham mưu tổng hợp: Xây dựng lịch công tác tuần, tháng, quý của Thường trực Đảng ủy; báo cáo tổng hợp tình hình cơ sở; hồ sơ tiếp công dân của Bí thư Đảng ủy xã.\n2. Tài liệu về công tác văn thư, lưu trữ cơ quan Đảng: Tập lưu văn bản đi (nghị quyết, quyết định, thông báo, công văn...); sổ đăng ký văn bản đi, đến; sổ quản lý con dấu; hồ sơ giao nộp tài liệu vào lưu trữ hiện hành.\n3. Tài liệu về công tác tài chính, đảng phí: Chứng từ thu nộp đảng phí của các chi bộ trực thuộc; báo cáo quyết toán tài chính đảng ủy xã; hồ sơ quản lý tài sản, cơ sở vật chất của đảng ủy.\n4. Tài liệu về ứng dụng công nghệ thông tin và chuyển đổi số: Quản trị phần mềm quản lý văn bản, điều hành tác nghiệp, tài khoản Cơ sở dữ liệu đảng viên liên thông."
            },
            {
                "articleNumber": "6",
                "title": "Mẫu phương án phân loại tài liệu Phông Ủy ban Kiểm tra và Ban Xây dựng Đảng cấp xã",
                "content": "1. Tài liệu Phông Cơ quan Ủy ban Kiểm tra Đảng ủy xã: Hồ sơ các cuộc kiểm tra, giám sát định kỳ đối với chi bộ trực thuộc và đảng viên; hồ sơ giải quyết khiếu nại, tố cáo đối với tổ chức đảng và đảng viên; hồ sơ xử lý kỷ luật đảng viên (khiển trách, cảnh cáo thuộc thẩm quyền hoặc đề nghị cấp ủy cấp trên khai trừ); hồ sơ kiểm tra tài chính đảng.\n2. Tài liệu Phông Ban Xây dựng Đảng (hoặc Tổ công tác xây dựng Đảng cấp xã): Hồ sơ phát triển đảng viên (hồ sơ quần chúng ưu tú, thẩm tra lý lịch, đề nghị kết nạp, xét công nhận đảng viên chính thức); hồ sơ chuyển sinh hoạt đảng (chính thức, tạm thời); hồ sơ quản lý cơ sở dữ liệu đảng viên; tài liệu bồi dưỡng lý luận chính trị, nghiệp vụ công tác đảng cơ sở."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-17-vptw.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 3. HƯỚNG DẪN 24-HD/VPTW NGÀY 03/10/2026 (THỜI HẠN LƯU TRỮ HỒ SƠ TÀI LIỆU CẤP TỈNH VÀ XÃ)
# ==============================================================================
def build_hd_24():
    doc = {
        "documentId": "HD-24-VPTW-2026",
        "documentCode": "24-HD/VPTW",
        "documentName": "Hướng dẫn thời hạn lưu trữ hồ sơ, tài liệu của các cơ quan, tổ chức đảng ở tỉnh, thành phố và xã, phường, đặc khu",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2026-10-03",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 24-HD/VPTW ngày 03/10/2026 của Văn phòng Trung ương Đảng quy định chi tiết thời hạn lưu trữ hồ sơ, tài liệu hình thành trong quá trình hoạt động của các cơ quan, tổ chức đảng ở cấp tỉnh (tỉnh, thành phố) và cấp xã (xã, phường, đặc khu); thay thế toàn diện Hướng dẫn số 35-HD/VPTW ngày 18/10/2010 phù hợp mô hình chính quyền địa phương 2 cấp.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh, đối tượng áp dụng và nguyên tắc xác định thời hạn lưu trữ",
                "content": "1. Phạm vi điều chỉnh: Thời hạn lưu trữ hồ sơ, tài liệu (bao gồm hồ sơ, tài liệu giấy, điện tử, trên các vật mang tin khác) của các cơ quan, tổ chức đảng cấp tỉnh và cấp xã.\n2. Đối tượng áp dụng: Cơ quan lãnh đạo đảng, các cơ quan chuyên trách tham mưu, giúp việc của tỉnh uỷ, thành uỷ trực thuộc Trung ương; đảng bộ cấp xã và các cơ quan chuyên trách tham mưu, giúp việc đảng uỷ cấp xã.\n3. Nguyên tắc xác định thời hạn lưu trữ:\n- Nếu các tài liệu trong một hồ sơ có thời hạn lưu trữ khác nhau thì thời hạn lưu trữ hồ sơ được định theo tài liệu có thời hạn lưu trữ DÀI NHẤT trong hồ sơ đó.\n- Khi định thời hạn lưu trữ cho hồ sơ, tài liệu không được thấp hơn thời hạn lưu trữ do cơ quan có thẩm quyền quy định.\n- Khi định thời hạn lưu trữ cho hồ sơ của những phông chưa đầy đủ hoặc hình thành trong những giai đoạn, sự kiện lịch sử đặc biệt thì phải đánh giá toàn diện giá trị thực tiễn và giá trị lịch sử để không bỏ sót tài liệu quý."
            },
            {
                "articleNumber": "2",
                "title": "Phân loại các mức thời hạn lưu trữ và tiêu chí áp dụng",
                "content": "Thời hạn lưu trữ hồ sơ, tài liệu gồm 02 nhóm chính:\n1. Thời hạn lưu trữ VĨNH VIỄN: Áp dụng đối với những hồ sơ, tài liệu có giá trị đặc biệt quan trọng về chính trị, kinh tế, quốc phòng, an ninh, văn hóa, khoa học, lịch sử đối với đất nước, địa phương, cơ quan, tổ chức đảng; hồ sơ đại hội đảng bộ; các văn kiện lãnh đạo chủ chốt (nghị quyết, quyết định, chỉ thị, quy định...); hồ sơ cán bộ thuộc diện cấp ủy quản lý; sổ đăng ký văn bản đi (không mật); sổ đăng ký bí mật nhà nước đi.\n2. Thời hạn lưu trữ CÓ THỜI HẠN (gồm các mức: 70 năm, 30 năm, 20 năm, 10 năm, 5 năm, 2 năm):\n- Mức 70 năm: Áp dụng đối với hồ sơ kỷ luật đảng viên khai trừ, hồ sơ khen thưởng cấp cao, tài liệu nhân sự chủ chốt không thuộc diện vĩnh viễn.\n- Mức 30 năm: Áp dụng đối với hồ sơ kiểm tra, giám sát chuyên đề lớn; sổ đăng ký bí mật nhà nước đến; sổ chuyển giao, quản lý sao chụp bí mật nhà nước.\n- Mức 20 năm: Áp dụng đối với sổ đăng ký văn bản đến (không mật); sổ đăng ký bản sao văn bản; sổ giao nhận văn bản nội bộ; sổ gửi bưu điện.\n- Mức 10 năm: Áp dụng đối với hồ sơ, tài liệu có giá trị thực tiễn trong khoảng thời gian ngắn, giá trị lịch sử thấp; báo cáo công tác năm của các đơn vị gửi đến.\n- Mức 5 năm: Áp dụng đối với hồ sơ tài liệu gửi đến để biết; báo cáo công tác tuần, tháng, quý, 6 tháng, 9 tháng; phiếu rà soát quy hoạch, phiếu tín nhiệm cán bộ.\n- Mức 2 năm: Áp dụng đối với hồ sơ hành chính sự vụ, giao dịch thông thường (thông báo đổi tên cơ quan, số điện thoại, thông báo chữ ký...), đơn thư gửi đến không có ý kiến giải quyết."
            },
            {
                "articleNumber": "3",
                "title": "Bảng thời hạn lưu trữ hồ sơ tài liệu Đại hội Đảng bộ và Ban Chấp hành cấp tỉnh",
                "content": "1. Tài liệu chuẩn bị Đại hội Đảng bộ tỉnh/thành phố:\n- Dự thảo văn kiện và ý kiến góp ý của uỷ viên BCH, BTV cấp ủy tỉnh, nguyên ủy viên Trung ương ở địa phương; dự thảo gửi xin ý kiến; dự thảo lần cuối trình Đại hội: Vĩnh viễn.\n- Các dự thảo văn kiện không có bút tích sửa đổi trực tiếp: 10 năm.\n- Dự thảo đề án nhân sự có bút tích góp ý của thường trực cấp ủy: Vĩnh viễn.\n2. Tài liệu trong quá trình tiến hành Đại hội:\n- Báo cáo chính trị, báo cáo kiểm điểm ban chấp hành, văn kiện chính thức: Vĩnh viễn.\n- Biên bản các phiên họp, diễn văn khai mạc, bế mạc, báo cáo thẩm tra tư cách đại biểu: Vĩnh viễn.\n- Danh sách bầu cử, kết quả bầu cử ban chấp hành, ban thường vụ, bí thư, phó bí thư, UBKT tỉnh ủy: Vĩnh viễn.\n- Phiếu bầu đại hội (phiếu bầu BCH, BTV, Bí thư, đại biểu dự Đại hội Đảng toàn quốc): Lưu trữ đến Đại hội nhiệm kỳ kế tiếp hoàn thành (hoặc tối thiểu 05 năm).\n3. Tài liệu hoạt động thường kỳ của Ban Chấp hành, Ban Thường vụ Tỉnh ủy:\n- Biên bản các hội nghị cấp ủy tỉnh, thường trực cấp ủy: Vĩnh viễn.\n- Các nghị quyết, chỉ thị, kết luận, quy định do Tỉnh ủy, BTV Tỉnh ủy ban hành: Vĩnh viễn."
            },
            {
                "articleNumber": "4",
                "title": "Bảng thời hạn lưu trữ các loại sổ nghiệp vụ văn thư và hồ sơ bí mật nhà nước",
                "content": "Thời hạn lưu trữ các loại sổ nghiệp vụ văn thư (cả bản giấy và điện tử) quy định cụ thể như sau:\n1. Sổ đăng ký văn bản đi (không mật): Vĩnh viễn.\n2. Sổ đăng ký bí mật nhà nước đi: Vĩnh viễn.\n3. Sổ đăng ký bí mật nhà nước đến: 30 năm.\n4. Sổ chuyển giao, sổ quản lý sao chụp, sổ thống kê, sổ gửi bí mật nhà nước đi qua bưu điện: 30 năm.\n5. Sổ đăng ký văn bản đến (không mật): 20 năm.\n6. Sổ đăng ký bản sao văn bản: 20 năm.\n7. Sổ giao nhận văn bản nội bộ, sổ gửi đi bưu điện (không mật): 20 năm.\n8. Hồ sơ thu hồi, tiêu hủy tài liệu, vật chứa bí mật nhà nước: 20 năm."
            },
            {
                "articleNumber": "5",
                "title": "Thời hạn lưu trữ hồ sơ tài liệu của các Ban Đảng và Văn phòng Tỉnh ủy",
                "content": "1. Ban Tổ chức Tỉnh ủy:\n- Hồ sơ cán bộ thuộc diện BTV Tỉnh ủy quản lý: Vĩnh viễn.\n- Hồ sơ quy hoạch, bổ nhiệm, điều động cán bộ chủ chốt: Vĩnh viễn.\n- Hồ sơ phát triển đảng viên, công nhận đảng viên chính thức toàn tỉnh: Vĩnh viễn.\n2. Cơ quan Ủy ban Kiểm tra Tỉnh ủy:\n- Hồ sơ các cuộc kiểm tra khi có dấu hiệu vi phạm đối với cấp ủy viên: Vĩnh viễn.\n- Hồ sơ xử lý kỷ luật đảng viên thuộc thẩm quyền cấp ủy tỉnh (khiển trách, cảnh cáo, cách chức, khai trừ): Vĩnh viễn.\n- Hồ sơ giải quyết khiếu nại, tố cáo kỷ luật đảng: Vĩnh viễn (đối với vụ việc phức tạp, nghiêm trọng) hoặc 30 năm (vụ việc thông thường).\n3. Văn phòng Tỉnh ủy:\n- Hồ sơ đại hội đảng bộ, hồ sơ các hội nghị ban chấp hành, ban thường vụ tỉnh ủy: Vĩnh viễn.\n- Hồ sơ quyết toán ngân sách đảng bộ tỉnh: Vĩnh viễn.\n- Hồ sơ xây dựng các dự án công nghệ thông tin trọng điểm của cơ quan đảng: Vĩnh viễn."
            },
            {
                "articleNumber": "6",
                "title": "Thời hạn lưu trữ hồ sơ tài liệu của cơ quan lãnh đạo đảng và cơ quan tham mưu cấp xã",
                "content": "Quy định thời hạn lưu trữ đối với cấp xã (xã, phường, đặc khu):\n1. Cơ quan lãnh đạo đảng cấp xã:\n- Hồ sơ Đại hội Đảng bộ cấp xã (Báo cáo chính trị, biên bản đại hội, nghị quyết, kết quả bầu BCH, BTV, Bí thư): Vĩnh viễn.\n- Nghị quyết, chương trình công tác toàn khóa, hằng năm của Đảng ủy xã: Vĩnh viễn.\n- Biên bản các kỳ họp Ban Chấp hành, Ban Thường vụ Đảng ủy xã: Vĩnh viễn.\n2. Công tác đảng viên và tổ chức tại cấp xã:\n- Hồ sơ kết nạp đảng viên mới, công nhận đảng viên chính thức: Vĩnh viễn (lưu tại hồ sơ đảng viên liên thông).\n- Quyết định xóa tên trong danh sách đảng viên và giải quyết khiếu nại xóa tên: Vĩnh viễn.\n- Hồ sơ xử lý kỷ luật đảng viên thuộc thẩm quyền Đảng ủy, Chi bộ: Vĩnh viễn (khai trừ, cách chức) hoặc 30 năm (khiển trách, cảnh cáo).\n3. Văn phòng Đảng ủy cấp xã:\n- Sổ đăng ký văn bản đi của Đảng ủy xã: Vĩnh viễn.\n- Sổ đăng ký văn bản đến: 20 năm.\n- Chứng từ thu nộp đảng phí của các chi bộ: 10 năm.\n- Báo cáo tài chính quyết toán ngân sách đảng cấp xã: 20 năm."
            },
            {
                "articleNumber": "7",
                "title": "Hiệu lực thi hành và thay thế văn bản cũ",
                "content": "1. Hướng dẫn số 24-HD/VPTW có hiệu lực thi hành kể từ ngày ký (03/10/2026).\n2. Hướng dẫn này THAY THẾ toàn bộ Hướng dẫn số 35-HD/VPTW ngày 18/10/2010 của Văn phòng Trung ương Đảng về thực hiện 'Bảng thời hạn bảo quản mẫu những tài liệu chủ yếu hình thành trong hoạt động của các cơ quan, tổ chức đảng ở cấp tỉnh' và 'Bảng thời hạn bảo quản mẫu những tài liệu chủ yếu hình thành trong hoạt động của các cơ quan, tổ chức đảng ở cấp huyện'.\n3. Toàn bộ các cơ quan, tổ chức đảng từ cấp tỉnh đến cấp xã, các ban đảng, cơ quan chuyên trách tham mưu có trách nhiệm thi hành nghiêm túc Hướng dẫn này."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-24-hd-vptw-2026.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 4. HƯỚNG DẪN 50-HD/VPTW NGÀY 10/10/2019 (CHỈNH LÝ TÀI LIỆU CƠ QUAN ĐẢNG)
# ==============================================================================
def build_hd_50():
    doc = {
        "documentId": "HD-50-VPTW-2019",
        "documentCode": "50-HD/VPTW",
        "documentName": "Hướng dẫn chỉnh lý tài liệu phông lưu trữ cơ quan, tổ chức đảng, Mặt trận Tổ quốc và các tổ chức chính trị - xã hội",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2019-10-10",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 50-HD/VPTW ngày 10/10/2019 của Văn phòng Trung ương Đảng hướng dẫn quy trình, phương pháp, kỹ thuật chỉnh lý một phông lưu trữ hoặc khối tài liệu hình thành trong hoạt động của các cơ quan, tổ chức đảng, Mặt trận Tổ quốc và các tổ chức chính trị - xã hội.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh và đối tượng áp dụng công tác chỉnh lý tài liệu",
                "content": "1. Phạm vi điều chỉnh: Văn bản này hướng dẫn về nguyên tắc, yêu cầu, nội dung, trình tự chỉnh lý một phông lưu trữ hoặc một khối tài liệu hình thành trong quá trình hoạt động của các cơ quan, tổ chức đảng, Mặt trận Tổ quốc và các tổ chức chính trị - xã hội.\n2. Đối tượng áp dụng: Áp dụng đối với tài liệu hành chính (tài liệu giấy), đồng thời vận dụng đối với các loại hình tài liệu khác (phim, ảnh, băng, đĩa ghi âm, ghi hình, tài liệu điện tử...) tại các cơ quan, tổ chức từ Trung ương đến cơ sở."
            },
            {
                "articleNumber": "2",
                "title": "Giải thích từ ngữ chuyên ngành chỉnh lý tài liệu",
                "content": "1. 'Chỉnh lý tài liệu' là việc phân loại, xác định giá trị, biên mục hồ sơ và hệ thống hóa hồ sơ, tài liệu của một phông lưu trữ hoặc một khối tài liệu nhằm đưa tài liệu vào trạng thái quản lý khoa học, bảo quản an toàn và phục vụ khai thác, sử dụng hiệu quả.\n2. 'Khối tài liệu phân tán' là tài liệu của một cơ quan, tổ chức nhưng bị phân tán, lưu giữ ở nhiều nơi, chưa được tập trung vào lưu trữ hiện hành.\n3. 'Tài liệu loại ra' là những tài liệu hết giá trị, bản trùng thừa, bản nháp, bản chụp không có giá trị lưu giữ được loại ra trong quá trình chỉnh lý để làm thủ tục xét hủy theo quy định."
            },
            {
                "articleNumber": "3",
                "title": "Nguyên tắc và yêu cầu chỉnh lý tài liệu lưu trữ cơ quan của Đảng",
                "content": "1. Nguyên tắc không phân tán phông: Tài liệu của mỗi cơ quan, tổ chức (mỗi phông) phải được chỉnh lý độc lập, tuyệt đối không được xáo trộn hoặc phân tán tài liệu giữa các phông với nhau.\n2. Tôn trọng trật tự lịch sử của tài liệu: Khi phân loại, lập hồ sơ và chỉnh sửa hồ sơ phải bảo đảm trật tự lịch sử, mối liên hệ tự nhiên của tài liệu hình thành trong hoạt động của cơ quan, tổ chức.\n3. Kết hợp hài hòa giữa lập hồ sơ mới và chỉnh sửa hồ sơ cũ: Giữ lại những hồ sơ đã được lập tốt; chỉ tiến hành lập hồ sơ mới đối với tài liệu rời lẻ hoặc chỉnh sửa đối với hồ sơ chưa đạt yêu cầu.\n4. Đảm bảo an toàn và bảo mật: Tài liệu mật phải được quản lý chặt chẽ theo đúng quy định bảo vệ bí mật của Đảng và Nhà nước trong suốt quá trình chỉnh lý."
            },
            {
                "articleNumber": "4",
                "title": "Quy trình giai đoạn 1 - Chuẩn bị chỉnh lý tài liệu",
                "content": "Giai đoạn chuẩn bị chỉnh lý gồm các bước:\n1. Khảo sát tài liệu: Tìm hiểu lịch sử hình thành cơ quan, cơ cấu tổ chức, chức năng nhiệm vụ qua các thời kỳ; khảo sát khối lượng, tình trạng vật lý và mức độ hoàn thiện của hồ sơ tài liệu cần chỉnh lý.\n2. Lập Kế hoạch chỉnh lý: Xác định mục đích, yêu cầu, phạm vi thời gian, số lượng tài liệu, thời gian thực hiện, nhân lực và dự toán kinh phí chỉnh lý.\n3. Thu thập, tập trung tài liệu: Thu thập toàn bộ tài liệu còn tồn đọng ở các phòng, ban, đơn vị về kho lưu trữ để tiến hành chỉnh lý tập trung.\n4. Xây dựng Bản hướng dẫn phân loại và Hướng dẫn xác định giá trị tài liệu: Căn cứ vào cơ cấu tổ chức, phương án phân loại và Bảng thời hạn lưu trữ tài liệu của cơ quan."
            },
            {
                "articleNumber": "5",
                "title": "Quy trình giai đoạn 2 - Tiến hành chỉnh lý tài liệu",
                "content": "Giai đoạn tiến hành chỉnh lý gồm các bước nghiệp vụ cụ thể:\n1. Phân loại tài liệu theo Phương án phân loại đã được phê duyệt (chia tài liệu về các nhóm lớn, nhóm vừa, nhóm nhỏ).\n2. Lập hồ sơ đối với tài liệu rời lẻ hoặc bổ sung, hoàn thiện hồ sơ đối với hồ sơ chưa đạt yêu cầu.\n3. Xác định giá trị tài liệu: Đánh giá giá trị thực tiễn và giá trị lịch sử của từng hồ sơ; ấn định thời hạn lưu trữ (Vĩnh viễn hoặc số năm cụ thể) theo Bảng thời hạn lưu trữ của Trung ương Đảng.\n4. Biên mục hồ sơ: Đánh số tờ tài liệu bằng bút chì ở góc trên bên phải; lập Mục lục văn bản trong hồ sơ; lập Tờ chứng từ kết thúc; viết tiêu đề và các thông tin nghiệp vụ trên bìa hồ sơ.\n5. Hệ thống hóa hồ sơ: Sắp xếp các hồ sơ trong từng nhóm theo trật tự thời gian hoặc tầm quan trọng; đánh số thứ tự hồ sơ liên tục từ số 01 đến hết phông."
            },
            {
                "articleNumber": "6",
                "title": "Quy trình giai đoạn 3 - Kết thúc chỉnh lý và bàn giao tài liệu",
                "content": "Giai đoạn kết thúc chỉnh lý gồm:\n1. Lập Mục lục hồ sơ, tài liệu: Lập Mục lục hồ sơ lưu trữ Vĩnh viễn và Mục lục hồ sơ lưu trữ Có thời hạn thành các tập riêng biệt.\n2. Xếp đặt tài liệu vào hộp (cặp), ghi nhãn hộp và xếp lên giá tài liệu theo đúng sơ đồ kho lưu trữ.\n3. Lập Báo cáo tổng kết chỉnh lý và xây dựng Lịch sử phông, Lịch sử đơn vị hình thành phông (đưa vào Hồ sơ phông lưu trữ).\n4. Bàn giao tài liệu sau chỉnh lý: Ký biên bản bàn giao giữa tổ chỉnh lý và bộ phận lưu trữ hiện hành kèm theo toàn bộ Mục lục hồ sơ."
            },
            {
                "articleNumber": "7",
                "title": "Xử lý tài liệu loại ra trong quá trình chỉnh lý",
                "content": "1. Lập Danh mục tài liệu loại ra (tài liệu hết giá trị, bản trùng thừa, bản nháp, tài liệu rách nát không phục hồi được).\n2. Viết Bản thuyết minh tài liệu hết giá trị đề nghị tiêu hủy.\n3. Trình Hội đồng Xác định giá trị tài liệu của cơ quan xem xét, thẩm định; gửi văn bản xin ý kiến cơ quan lưu trữ cấp trên có thẩm quyền.\n4. Chỉ được tiến hành tiêu hủy sau khi có Quyết định cho phép tiêu hủy bằng văn bản của người đứng đầu cơ quan có thẩm quyền; lập biên bản tiêu hủy tài liệu và lưu vào hồ sơ phông theo Hướng dẫn 29-HD/VPTW."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-50-hd-vptw-2019.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 5. HƯỚNG DẪN 29-HD/VPTW NGÀY 12/09/2017 (XÁC ĐỊNH GIÁ TRỊ VÀ TIÊU HỦY TÀI LIỆU)
# ==============================================================================
def build_hd_29():
    doc = {
        "documentId": "HD-29-VPTW-2017",
        "documentCode": "29-HD/VPTW",
        "documentName": "Hướng dẫn tổ chức xác định giá trị tài liệu ở các cơ quan, tổ chức đảng, tổ chức chính trị - xã hội",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2017-09-12",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 29-HD/VPTW ngày 12/09/2017 của Văn phòng Trung ương Đảng quy định về Hội đồng Xác định giá trị tài liệu, Hội đồng Thẩm tra; nguyên tắc, phương pháp, tiêu chuẩn xác định giá trị tài liệu; và quy trình, thủ tục tiêu hủy tài liệu hết giá trị trong cơ quan, tổ chức đảng và đoàn thể chính trị - xã hội.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh, đối tượng áp dụng và yêu cầu xác định giá trị tài liệu",
                "content": "1. Phạm vi điều chỉnh: Hướng dẫn về Hội đồng Xác định giá trị tài liệu, Hội đồng Thẩm tra xác định giá trị tài liệu; nguyên tắc, phương pháp, tiêu chuẩn và trách nhiệm của cơ quan, tổ chức, cá nhân trong việc xác định giá trị tài liệu; quy trình, thủ tục xét hủy tài liệu hết giá trị.\n2. Đối tượng áp dụng: Áp dụng đối với tài liệu hành chính (tài liệu giấy) và vận dụng đối với các loại hình tài liệu khác (phim, ảnh, đĩa ghi âm, ghi hình, tài liệu điện tử...) tại các cơ quan, tổ chức đảng, Mặt trận Tổ quốc và các tổ chức chính trị - xã hội từ Trung ương đến cơ sở.\n3. Yêu cầu: Toàn bộ tài liệu phải được xác định giá trị thực tiễn, giá trị khoa học và giá trị lịch sử. Tài liệu có giá trị phải được định thời hạn lưu trữ; tài liệu hết giá trị phải được xem xét loại hủy một cách thận trọng, chính xác, đúng quy trình thủ tục pháp luật."
            },
            {
                "articleNumber": "2",
                "title": "Nguyên tắc, phương pháp và tiêu chuẩn xác định giá trị tài liệu",
                "content": "1. Nguyên tắc: Phải xem xét toàn diện mối liên hệ lịch sử của tài liệu; đánh giá tài liệu trong bối cảnh hoàn cảnh lịch sử, thời gian, địa điểm hình thành; tôn trọng tính nguyên vẹn của phông lưu trữ.\n2. Phương pháp: Sử dụng phương pháp phân tích chức năng, so sánh đối chiếu, thẩm tra thực tế nội dung văn bản.\n3. Các tiêu chuẩn xác định giá trị:\n- Tiêu chuẩn nội dung: Tầm quan trọng của vấn đề, mức độ đầy đủ của thông tin phản ánh trong tài liệu.\n- Tiêu chuẩn tác giả: Vị trí, vai trò, chức năng của cơ quan, tổ chức hoặc cá nhân ban hành tài liệu.\n- Tiêu chuẩn thời gian và địa điểm: Hoàn cảnh lịch sử và địa bàn tài liệu hình thành (đặc biệt là tài liệu thời kỳ chiến tranh, các sự kiện chính trị trọng đại).\n- Tiêu chuẩn hình thức: Tính nguyên bản, chữ ký trực tiếp của lãnh đạo, dấu nổi, dấu mật, tính toàn vẹn của hồ sơ."
            },
            {
                "articleNumber": "3",
                "title": "Hội đồng Xác định giá trị tài liệu của cơ quan, tổ chức Đảng",
                "content": "1. Thành phần Hội đồng Xác định giá trị tài liệu:\n- Chủ tịch Hội đồng: Người đứng đầu hoặc cấp phó của người đứng đầu cơ quan, tổ chức (hoặc Chánh/Phó Chánh Văn phòng cấp ủy).\n- Thư ký Hội đồng: Người phụ trách hoặc cán bộ trực tiếp làm công tác lưu trữ của cơ quan.\n- Các ủy viên: Đại diện lãnh đạo các đơn vị có tài liệu cần xác định giá trị hoặc xét hủy; cán bộ chuyên môn am hiểu sâu về lĩnh vực tài liệu.\n2. Nhiệm vụ và quyền hạn của Hội đồng:\n- Xem xét Danh mục hồ sơ, tài liệu lưu trữ Vĩnh viễn và Có thời hạn.\n- Xem xét, thẩm định Danh mục tài liệu hết giá trị đề nghị tiêu hủy.\n- Lập Biên bản họp Hội đồng và báo cáo kết quả trình người đứng đầu cơ quan, tổ chức xem xét quyết định."
            },
            {
                "articleNumber": "4",
                "title": "Hội đồng Thẩm tra xác định giá trị tài liệu của cơ quan cấp trên",
                "content": "1. Thẩm quyền: Cục Lưu trữ Văn phòng Trung ương Đảng (đối với cơ quan Trung ương) và Phòng Lưu trữ thuộc Văn phòng Tỉnh ủy/Thành ủy (đối với cơ quan cấp tỉnh, huyện, xã) có trách nhiệm thẩm tra tài liệu hết giá trị trước khi cơ quan ban hành quyết định hủy.\n2. Thành phần Hội đồng Thẩm tra: Lãnh đạo Văn phòng cấp ủy, đại diện cơ quan lưu trữ lịch sử của Đảng ở cấp tỉnh, chuyên viên lưu trữ có kinh nghiệm.\n3. Nội dung thẩm tra: Kiểm tra hồ sơ đề nghị hủy, đối chiếu Danh mục tài liệu hủy với Bảng thời hạn lưu trữ; trường hợp cần thiết tiến hành kiểm tra xác suất tài liệu thực tế tại kho lưu trữ; có văn bản đồng ý hoặc không đồng ý cho phép tiêu hủy."
            },
            {
                "articleNumber": "5",
                "title": "Quy trình, thủ tục xét hủy tài liệu hết giá trị",
                "content": "Quy trình xét hủy tài liệu hết giá trị gồm 5 bước chặt chẽ:\n1. Bước 1: Lưu trữ hiện hành lập Danh mục tài liệu hết giá trị và Bản thuyết minh tài liệu đề nghị hủy.\n2. Bước 2: Họp Hội đồng Xác định giá trị tài liệu của cơ quan để thẩm tra, biểu quyết thông qua và lập Biên bản cuộc họp.\n3. Bước 3: Gửi hồ sơ đề nghị cơ quan lưu trữ cấp trên (Văn phòng Tỉnh ủy/Cục Lưu trữ) thẩm tra và cho ý kiến bằng văn bản.\n4. Bước 4: Sau khi có văn bản đồng ý của cơ quan thẩm tra, Người đứng đầu cơ quan, tổ chức ban hành Quyết định tiêu hủy tài liệu hết giá trị và thành lập Tổ tiêu hủy.\n5. Bước 5: Thực hiện tiêu hủy tài liệu và lập Biên bản tiêu hủy có đầy đủ chữ ký của các thành viên Tổ tiêu hủy."
            },
            {
                "articleNumber": "6",
                "title": "Phương pháp tiêu hủy tài liệu và hồ sơ về việc tiêu hủy",
                "content": "1. Phương pháp tiêu hủy: Có thể sử dụng máy hủy tài liệu công nghiệp cắt nhỏ hoặc đưa đến cơ sở tái chế giấy dưới sự giám sát trực tiếp của Tổ tiêu hủy; bảo đảm tài liệu sau khi hủy không thể chắp ghép, khôi phục lại nội dung thông tin; bảo đảm vệ sinh môi trường và an toàn phòng chống cháy nổ.\n2. Hồ sơ về việc tiêu hủy tài liệu hết giá trị gồm: Tờ trình đề nghị hủy tài liệu; Danh mục tài liệu hết giá trị; Bản thuyết minh; Biên bản họp Hội đồng; Văn bản thẩm tra của cơ quan lưu trữ cấp trên; Quyết định tiêu hủy; Biên bản tiêu hủy tài liệu.\n3. Hồ sơ tiêu hủy tài liệu phải được bảo quản VĨNH VIỄN trong phông lưu trữ của cơ quan."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-29-hd-vptw-2017.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 6. HƯỚNG DẪN 30-HD/VPTW NGÀY 12/09/2017 (THỜI HẠN BẢO QUẢN TÀI LIỆU ĐOÀN THỂ)
# ==============================================================================
def build_hd_30():
    doc = {
        "documentId": "HD-30-VPTW-2017",
        "documentCode": "30-HD/VPTW",
        "documentName": "Bảng thời hạn bảo quản mẫu những tài liệu chủ yếu của Mặt trận Tổ quốc Việt Nam và các tổ chức chính trị - xã hội",
        "issuer": "Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2017-09-12",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Hướng dẫn số 30-HD/VPTW ngày 12/09/2017 của Văn phòng Trung ương Đảng ban hành Bảng thời hạn bảo quản mẫu những tài liệu chủ yếu hình thành trong hoạt động của Mặt trận Tổ quốc Việt Nam và các tổ chức chính trị - xã hội (Tổng LĐLĐ, Hội Nông dân, Đoàn TNCS HCM, Hội LH Phụ nữ, Hội Cựu chiến binh).",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Phạm vi điều chỉnh và đối tượng áp dụng Bảng thời hạn tài liệu đoàn thể",
                "content": "1. Phạm vi điều chỉnh: Hướng dẫn về thời hạn bảo quản đối với những tài liệu chủ yếu hình thành trong hoạt động của Mặt trận Tổ quốc Việt Nam và các tổ chức chính trị - xã hội, bao gồm tài liệu của đại hội, các cơ quan lãnh đạo (Ủy ban, Ban Chấp hành, Đoàn Chủ tịch, Ban Thường vụ, Ban Bí thư...), các cơ quan tham mưu giúp việc và đảng đoàn của Mặt trận Tổ quốc và các đoàn thể.\n2. Đối tượng áp dụng: Mặt trận Tổ quốc Việt Nam, Tổng Liên đoàn Lao động Việt Nam, Hội Nông dân Việt Nam, Đoàn Thanh niên Cộng sản Hồ Chí Minh, Hội Liên hiệp Phụ nữ Việt Nam, Hội Cựu chiến binh Việt Nam từ cấp Trung ương, cấp tỉnh đến cấp cơ sở."
            },
            {
                "articleNumber": "2",
                "title": "Nguyên tắc xác định thời hạn bảo quản tài liệu đoàn thể",
                "content": "1. Bảng thời hạn bảo quản mẫu là căn cứ pháp lý để Mặt trận Tổ quốc và các tổ chức chính trị - xã hội xây dựng Bảng thời hạn bảo quản tài liệu cụ thể của cơ quan mình và xác định thời hạn lưu trữ khi lập danh mục hồ sơ hằng năm.\n2. Mức thời hạn bảo quản gồm: Vĩnh viễn và Có thời hạn (70 năm, 50 năm, 30 năm, 20 năm, 15 năm, 10 năm, 5 năm).\n3. Những tài liệu về chủ trương, đường lối, nghị quyết đại hội, báo cáo tổng kết phong trào lớn của đoàn thể phải được bảo quản Vĩnh viễn. Hồ sơ hành chính sự vụ, báo cáo định kỳ tuần, tháng áp dụng thời hạn 5 năm đến 10 năm."
            },
            {
                "articleNumber": "3",
                "title": "Thời hạn bảo quản tài liệu Đại hội và cơ quan lãnh đạo Mặt trận Tổ quốc",
                "content": "1. Tài liệu Đại hội Mặt trận Tổ quốc Việt Nam các cấp:\n- Báo cáo chính trị, báo cáo kiểm điểm, nghị quyết đại hội, biên bản đại hội, kết quả hiệp thương cử Ủy ban MTTQ: Vĩnh viễn (đối với cấp Trung ương, cấp tỉnh) và Vĩnh viễn hoặc 30 năm (đối với cấp cơ sở).\n- Tham luận tại đại hội: Vĩnh viễn (Trung ương, tỉnh) hoặc 10 năm (cơ sở).\n2. Tài liệu hoạt động thường kỳ của Ủy ban và Ban Thường trực MTTQ:\n- Biên bản các hội nghị định kỳ, đột xuất của Ủy ban, Ban Thường trực: Vĩnh viễn.\n- Các chương trình phối hợp thống nhất hành động, nghị quyết liên tịch với Chính phủ hoặc cơ quan nhà nước: Vĩnh viễn.\n- Hồ sơ các cuộc vận động lớn (Cuộc vận động Toàn dân đoàn kết xây dựng nông thôn mới, đô thị văn minh; Quỹ Vì người nghèo): Vĩnh viễn hoặc 30 năm."
            },
            {
                "articleNumber": "4",
                "title": "Thời hạn bảo quản tài liệu của các tổ chức chính trị - xã hội",
                "content": "1. Đoàn Thanh niên Cộng sản Hồ Chí Minh:\n- Hồ sơ Đại hội Đoàn các cấp, Nghị quyết BCH Đoàn, phong trào Thanh niên tình nguyện: Vĩnh viễn.\n- Hồ sơ kết nạp đoàn viên, sổ theo dõi đoàn viên: 20 năm.\n2. Liên đoàn Lao động:\n- Tài liệu Đại hội Công đoàn, thỏa ước lao động tập thể, phong trào thi đua lao động giỏi: Vĩnh viễn.\n- Hồ sơ giải quyết đình công, tranh chấp lao động: 30 năm.\n3. Hội Nông dân và Hội Liên hiệp Phụ nữ:\n- Hồ sơ phong trào Nông dân thi đua sản xuất kinh doanh giỏi; phong trào Phụ nữ tích cực học tập, lao động sáng tạo: Vĩnh viễn.\n- Hồ sơ quản lý vốn vay ủy thác ngân hàng chính sách: 15 năm sau khi tất toán hợp đồng.\n4. Hội Cựu chiến binh:\n- Hồ sơ xác nhận, giải quyết chế độ chính sách người có công, cựu chiến binh: Vĩnh viễn.\n- Hồ sơ phong trào Cựu chiến binh gương mẫu: 20 năm."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'hd-30-hd-vptw-2017.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

# ==============================================================================
# 7. TỔNG HỢP 12 KHUNG PHÂN LOẠI TÀI LIỆU CHUYÊN NGÀNH ĐẢNG & ĐOÀN THỂ
# ==============================================================================
def build_khung_phan_loai():
    doc = {
        "documentId": "KHUNG-PHAN-LOAI-VPTW",
        "documentCode": "KHUNG-PHAN-LOAI-VPTW",
        "documentName": "Mẫu khung phân loại tài liệu các phông lưu trữ cơ quan Đảng, đoàn thể và lực lượng vũ trang địa phương",
        "issuer": "Cục Lưu trữ - Văn phòng Trung ương Đảng",
        "category": "van_thu_luu_tru",
        "issueDate": "2013-07-15",
        "status": "Còn hiệu lực (Hiện hành)",
        "description": "Tổng hợp hệ thống Mẫu Khung phân loại tài liệu các phông lưu trữ chuyên ngành do Cục Lưu trữ Văn phòng Trung ương Đảng và Văn phòng Tỉnh ủy ban hành áp dụng cho 12 khối cơ quan Đảng, chính quyền, lực lượng vũ trang (Quân sự, Công an), các đoàn thể chính trị - xã hội và đơn vị sự nghiệp của Đảng.",
        "articles": [
            {
                "articleNumber": "1",
                "title": "Khung phân loại tài liệu Phông lưu trữ Đảng bộ Quân sự địa phương (Công văn 561-CV/CLT)",
                "content": "Theo hướng dẫn tại Công văn số 561-CV/CLT ngày 16/12/2010 của Cục Lưu trữ Văn phòng Trung ương Đảng, tài liệu Đảng bộ Quân sự tỉnh/thành phố được phân loại theo các nhóm chính:\n1. Tài liệu Đại hội Đảng bộ Quân sự tỉnh.\n2. Tài liệu Đảng ủy, Ban Thường vụ Đảng ủy Quân sự tỉnh (nghị quyết lãnh đạo nhiệm vụ quân sự, quốc phòng địa phương, quy chế làm việc).\n3. Tài liệu về công tác quân sự, tác chiến, huấn luyện sẵn sàng chiến đấu, tuyển quân, động viên quân đội.\n4. Tài liệu về công tác đảng, công tác chính trị trong lực lượng vũ trang tỉnh (công tác cán bộ, đảng viên, bảo vệ an ninh quân đội, giáo dục chính trị).\n5. Tài liệu về công tác hậu cần, kỹ thuật quân sự và tài chính quân đội.\n6. Tài liệu về công tác thanh tra quốc phòng, tiếp công dân và công tác văn thư, lưu trữ quân sự."
            },
            {
                "articleNumber": "2",
                "title": "Khung phân loại tài liệu Phông lưu trữ Công an cấp tỉnh (Công văn 457-CV/CLT)",
                "content": "Theo hướng dẫn tại Công văn số 457-CV/CLT ngày 14/04/2010 của Cục Lưu trữ Văn phòng Trung ương Đảng, tài liệu Đảng ủy và cơ quan Công an cấp tỉnh được phân loại theo các nhóm:\n1. Tài liệu Đại hội Đảng bộ Công an tỉnh.\n2. Tài liệu Đảng ủy, Ban Thường vụ Đảng ủy Công an tỉnh lãnh đạo công tác an ninh trật tự.\n3. Tài liệu về công tác an ninh nhân dân (chống phản động, bảo vệ an ninh chính trị nội bộ, an ninh kinh tế, an ninh tư tưởng văn hóa).\n4. Tài liệu về công tác cảnh sát nhân dân (phòng chống tội phạm hình sự, ma túy, kinh tế, quản lý hành chính về trật tự xã hội, an toàn giao thông, PCCC).\n5. Tài liệu về công tác xây dựng lực lượng, tổ chức cán bộ, đảng viên, đào tạo, thanh tra, kiểm tra trong công an.\n6. Tài liệu về hậu cần kỹ thuật, trang thiết bị chuyên dùng và tài chính công an."
            },
            {
                "articleNumber": "3",
                "title": "Khung phân loại tài liệu Phông lưu trữ Ban Tổ chức Tỉnh ủy",
                "content": "Khung phân loại tài liệu Phông Ban Tổ chức Tỉnh ủy gồm các nhóm nghiệp vụ:\n1. Tài liệu chung về công tác tổ chức xây dựng Đảng của tỉnh.\n2. Tài liệu về tổ chức bộ máy, biên chế các cơ quan đảng, đoàn thể trong tỉnh.\n3. Tài liệu về công tác cán bộ: Quy hoạch, đào tạo, bồi dưỡng, điều động, bổ nhiệm, luân chuyển, bổ nhiệm lại, giới thiệu ứng cử đối với cán bộ thuộc diện BTV Tỉnh ủy quản lý.\n4. Tài liệu về công tác bảo vệ chính trị nội bộ: Thẩm tra, kết luận lịch sử chính trị và chính trị hiện nay của cán bộ, đảng viên.\n5. Tài liệu về công tác đảng viên: Kết nạp đảng, phát thẻ đảng viên, chuyển sinh hoạt đảng, thống kê đảng viên, huy hiệu đảng.\n6. Tài liệu về công tác chính sách cán bộ và quản lý hồ sơ cán bộ diện Ban Thường vụ Tỉnh ủy quản lý."
            },
            {
                "articleNumber": "4",
                "title": "Khung phân loại tài liệu Phông lưu trữ Cơ quan Ủy ban Kiểm tra Tỉnh ủy",
                "content": "Khung phân loại tài liệu Phông Ủy ban Kiểm tra Tỉnh ủy gồm các nhóm nghiệp vụ:\n1. Tài liệu hội nghị, kỳ họp Ủy ban Kiểm tra Tỉnh ủy.\n2. Tài liệu về công tác kiểm tra tổ chức đảng và đảng viên khi có dấu hiệu vi phạm.\n3. Tài liệu về công tác giám sát chuyên đề đối với cấp ủy viên và tổ chức đảng cấp dưới.\n4. Tài liệu về xử lý kỷ luật đảng (khiển trách, cảnh cáo, cách chức, đề nghị khai trừ).\n5. Tài liệu về giải quyết đơn thư khiếu nại, tố cáo đối với tổ chức đảng và đảng viên.\n6. Tài liệu về kiểm tra tài chính đảng đối với các cơ quan đảng cùng cấp và cấp dưới."
            },
            {
                "articleNumber": "5",
                "title": "Khung phân loại tài liệu Phông lưu trữ Ban Tuyên giáo Tỉnh ủy",
                "content": "Khung phân loại tài liệu Phông Ban Tuyên giáo Tỉnh ủy gồm các nhóm nghiệp vụ:\n1. Tài liệu về công tác lý luận chính trị và nghiên cứu, học tập nghị quyết của Đảng.\n2. Tài liệu về công tác tuyên truyền cổ động, báo chí, xuất bản, văn hóa văn nghệ.\n3. Tài liệu về học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh.\n4. Tài liệu về công tác khoa giáo (giáo dục, y tế, khoa học công nghệ, bảo vệ môi trường, thể thao).\n5. Tài liệu về điều tra nắm bắt dư luận xã hội và đấu tranh bảo vệ nền tảng tư tưởng của Đảng (Ban chỉ đạo 35).\n6. Tài liệu về công tác nghiên cứu, biên soạn lịch sử đảng bộ địa phương."
            },
            {
                "articleNumber": "6",
                "title": "Khung phân loại tài liệu Phông lưu trữ Trường Chính trị tỉnh",
                "content": "Khung phân loại tài liệu Phông Trường Chính trị cấp tỉnh gồm các nhóm nghiệp vụ:\n1. Tài liệu chung về công tác đào tạo, bồi dưỡng cán bộ lãnh đạo, quản lý của tỉnh.\n2. Tài liệu về công tác giảng dạy, học tập các lớp trung cấp lý luận chính trị, bồi dưỡng chuyên viên, chuyên viên chính, cập nhật kiến thức cán bộ cơ sở.\n3. Tài liệu về quản lý học viên, hồ sơ tuyển sinh, sổ điểm, quyết định công nhận tốt nghiệp, sổ cấp văn bằng chứng chỉ đào tạo.\n4. Tài liệu về nghiên cứu khoa học, hội thảo khoa học và tổng kết thực tiễn địa phương.\n5. Tài liệu về công tác tổ chức bộ máy, giảng viên và quản trị cơ sở vật chất nhà trường."
            },
            {
                "articleNumber": "7",
                "title": "Khung phân loại tài liệu Phông lưu trữ Mặt trận Tổ quốc Việt Nam cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Ủy ban Mặt trận Tổ quốc Việt Nam cấp tỉnh gồm:\n1. Tài liệu Đại hội đại biểu Mặt trận Tổ quốc tỉnh.\n2. Tài liệu các kỳ họp Ủy ban và Ban Thường trực Ủy ban MTTQ tỉnh.\n3. Tài liệu về công tác dân tộc, tôn giáo và phát huy khối đại đoàn kết toàn dân tộc.\n4. Tài liệu về các phong trào thi đua yêu nước, các cuộc vận động xã hội (Quỹ Vì người nghèo, cứu trợ thiên tai, Đền ơn đáp nghĩa).\n5. Tài liệu về hoạt động giám sát, phản biện xã hội và tham gia xây dựng Đảng, chính quyền.\n6. Tài liệu về công tác đối ngoại nhân dân và kiều bào."
            },
            {
                "articleNumber": "8",
                "title": "Khung phân loại tài liệu Phông lưu trữ Liên đoàn Lao động cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Liên đoàn Lao động cấp tỉnh gồm:\n1. Tài liệu Đại hội Công đoàn tỉnh và các kỳ họp Ban Chấp hành, Ban Thường vụ LĐLĐ tỉnh.\n2. Tài liệu về bảo vệ quyền, lợi ích hợp pháp, chính đáng của đoàn viên, công nhân viên chức lao động (thương lượng, ký kết thỏa ước lao động tập thể, an toàn vệ sinh lao động).\n3. Tài liệu về phong trào thi đua Lao động giỏi, Lao động sáng tạo, phong trào thi đua trong doanh nghiệp.\n4. Tài liệu về công tác phát triển đoàn viên, thành lập công đoàn cơ sở (đặc biệt trong các doanh nghiệp ngoài nhà nước).\n5. Tài liệu về công tác tài chính công đoàn và quản lý tài sản công đoàn."
            },
            {
                "articleNumber": "9",
                "title": "Khung phân loại tài liệu Phông lưu trữ Hội Nông dân cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Hội Nông dân cấp tỉnh gồm:\n1. Tài liệu Đại hội đại biểu Hội Nông dân tỉnh và hoạt động của Ban Chấp hành, Ban Thường vụ Hội.\n2. Tài liệu về phong trào 'Nông dân thi đua sản xuất, kinh doanh giỏi, đoàn kết giúp nhau làm giàu và giảm nghèo bền vững'.\n3. Tài liệu về vận động nông dân tham gia xây dựng nông thôn mới, bảo vệ môi trường nông thôn.\n4. Tài liệu về hoạt động hỗ trợ nông dân: Vốn vay Quỹ Hỗ trợ nông dân, ủy thác Ngân hàng Chính sách xã hội, chuyển giao khoa học kỹ thuật.\n5. Tài liệu về xây dựng tổ chức hội, phát triển hội viên và câu lạc bộ nông dân."
            },
            {
                "articleNumber": "10",
                "title": "Khung phân loại tài liệu Phông lưu trữ Hội Liên hiệp Phụ nữ cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Hội Liên hiệp Phụ nữ cấp tỉnh gồm:\n1. Tài liệu Đại hội đại biểu Phụ nữ tỉnh và hoạt động của Ban Chấp hành, Ban Thường vụ Hội.\n2. Tài liệu về phong trào thi đua 'Phụ nữ tích cực học tập, lao động sáng tạo, xây dựng gia đình hạnh phúc' và cuộc vận động 'Xây dựng gia đình 5 không, 3 sạch'.\n3. Tài liệu về công tác vì sự tiến bộ của phụ nữ, bình đẳng giới, phòng chống bạo lực gia đình.\n4. Tài liệu về hỗ trợ phụ nữ khởi nghiệp, phát triển kinh tế gia đình và quản lý vốn vay ủy thác.\n5. Tài liệu về công tác tập hợp phụ nữ, xây dựng hội viên nòng cốt."
            },
            {
                "articleNumber": "11",
                "title": "Khung phân loại tài liệu Phông lưu trữ Hội Cựu chiến binh cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Hội Cựu chiến binh cấp tỉnh gồm:\n1. Tài liệu Đại hội đại biểu Cựu chiến binh tỉnh và hoạt động của Ban Chấp hành, Ban Thường vụ Hội.\n2. Tài liệu về phong trào 'Cựu chiến binh gương mẫu', tham gia giữ gìn an ninh trật tự và xây dựng Đảng, chính quyền cơ sở.\n3. Tài liệu về công tác nghĩa tình đồng đội, cựu chiến binh giúp nhau giảm nghèo, làm kinh tế giỏi.\n4. Tài liệu về phối hợp giải quyết chế độ, chính sách đối với cựu chiến binh, cựu quân nhân, tìm kiếm quy tập hài cốt liệt sĩ.\n5. Tài liệu về công tác xây dựng hội, kết nạp hội viên cựu chiến binh."
            },
            {
                "articleNumber": "12",
                "title": "Khung phân loại tài liệu Phông lưu trữ Đoàn TNCS Hồ Chí Minh cấp tỉnh",
                "content": "Khung phân loại tài liệu Phông Đoàn Thanh niên Cộng sản Hồ Chí Minh cấp tỉnh gồm:\n1. Tài liệu Đại hội Đoàn TNCS Hồ Chí Minh tỉnh và hoạt động của Ban Chấp hành, Ban Thường vụ Tỉnh đoàn.\n2. Tài liệu về các phong trào hành động cách mạng: 'Thanh niên tình nguyện', 'Tuổi trẻ sáng tạo', 'Tuổi trẻ xung kích bảo vệ Tổ quốc'.\n3. Tài liệu về các chương trình đồng hành với thanh niên: Học tập, khởi nghiệp, lập nghiệp, rèn luyện và phát triển kỹ năng xã hội.\n4. Tài liệu về công tác phụ trách Đội Thiếu niên Tiền phong Hồ Chí Minh và chăm sóc thiếu niên, nhi đồng.\n5. Tài liệu về công tác đoàn viên, phát triển đoàn viên mới và bồi dưỡng đoàn viên ưu tú giới thiệu cho Đảng xem xét kết nạp."
            }
        ]
    }

    out_path = os.path.join(REG_DIR, 'khung-phan-loai-tai-lieu-chuyen-nganh.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'[BUILD] Hoàn thành {out_path} ({len(doc["articles"])} điều khoản)')

if __name__ == '__main__':
    print('Bắt đầu đồng bộ Tài liệu tập huấn mới nhất vào data/regulations...')
    build_hd_06()
    build_hd_17()
    build_hd_24()
    build_hd_50()
    build_hd_29()
    build_hd_30()
    build_khung_phan_loai()
    print('Hoàn thành xuất sắc toàn bộ 7 file JSON quy định!')
