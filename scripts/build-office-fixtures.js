/**
 * Sinh file mẫu Sổ công văn ĐÃ ẨN DANH để phục vụ kiểm thử.
 * Bố cục (dòng tiêu đề, dòng "Ngày chốt dữ liệu", vị trí header) mô phỏng đúng
 * file "Báo cáo danh sách văn bản" xuất từ phần mềm quản lý văn bản.
 *
 * Cách dùng: node scripts/build-office-fixtures.js
 * Kết quả:   test/fixtures/so-van-ban-den.xls, test/fixtures/so-van-ban-di.xls
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUT_DIR = path.join(__dirname, '..', 'test', 'fixtures');

function buildSheet({ period, reportDate, headerRowIndex, headers, rows }) {
  const width = headers.length + 3;
  const blank = () => new Array(width).fill('');
  const aoa = [];
  for (let i = 0; i < headerRowIndex; i++) aoa.push(blank());
  aoa[0][9] = 'Đảng Cộng sản Việt Nam';
  aoa[3][6] = 'DANH SÁCH VĂN BẢN';
  aoa[4][4] = `(Thời gian từ ngày ${period} )`;
  aoa[5][8] = `Ngày chốt dữ liệu báo cáo: ${reportDate}`;
  const headerRow = blank();
  headers.forEach((h, i) => { headerRow[i] = h; });
  aoa.push(headerRow);
  for (const r of rows) {
    const line = blank();
    headers.forEach((h, i) => { line[i] = r[h] === undefined ? '' : r[h]; });
    aoa.push(line);
  }
  aoa.push(blank(), blank());
  return XLSX.utils.aoa_to_sheet(aoa);
}

const DEN_HEADERS = [
  'STT', 'ID', 'Số, ký hiệu văn bản', 'Trích yếu nội dung văn bản', 'Sổ văn bản',
  'Thể loại văn bản', 'Độ khẩn', 'Độ mật', 'Người gửi', 'Ý kiến chuyển', 'Ý kiến chỉ đạo',
  'Người ký', 'Thời gian nhận', 'Ngày văn bản', 'Hạn xử lý', 'Số trang', 'Số bản', 'File văn bản',
];

const DEN_ROWS = [
  {
    STT: '1', ID: '90000001', 'Số, ký hiệu văn bản': '02-QC/BCĐ',
    'Trích yếu nội dung văn bản': 'Quy chế làm việc của Ban Chỉ đạo Công tác thông tin đối ngoại thành phố',
    'Sổ văn bản': 'Sổ Văn bản đến Văn phòng 2026', 'Thể loại văn bản': 'Quy chế', 'Độ khẩn': 'Thường',
    'Độ mật': 'Thường', 'Người gửi': 'Văn thư A', 'Ý kiến chuyển': 'VP n/c tham mưu TT',
    'Người ký': 'Nguyễn Văn An', 'Thời gian nhận': '19/10/2026', 'Ngày văn bản': '19/10/2026',
    'Số trang': '7', 'Số bản': '1',
    'File văn bản': '1. A13-BCD-QC-0002-2026_dadongdau (2).pdf\n2. QC lam viec BCD.docx',
  },
  {
    STT: '2', ID: '90000002', 'Số, ký hiệu văn bản': '866-CV/TU',
    'Trích yếu nội dung văn bản': 'Về việc đẩy nhanh tiến độ thực hiện xử lý, khai thác các cơ sở nhà, đất dôi dư sau sắp xếp, tinh gọn tổ chức bộ máy',
    'Sổ văn bản': 'Sổ Văn bản đến Văn phòng 2026', 'Thể loại văn bản': 'Công văn', 'Độ khẩn': 'Khẩn',
    'Độ mật': 'Thường', 'Người gửi': 'Văn thư A', 'Ý kiến chuyển': 'VP n/c tham mưu',
    'Người ký': 'Trần Thị Bình', 'Thời gian nhận': '19/10/2026', 'Ngày văn bản': '19/10/2026',
    'Số bản': '1',
    'File văn bản': '1. A13-TU-CV-0866-2026_dadongdau.pdf\n2. 39-cd-ttg.signed.pdf\n3. 68_cd-ttg.pdf',
  },
  {
    STT: '3', ID: '90000003', 'Số, ký hiệu văn bản': '1229-QĐ/TU',
    'Trích yếu nội dung văn bản': 'Quyết định kiện toàn Ban Chỉ đạo phòng, chống tham nhũng, lãng phí',
    'Sổ văn bản': 'Sổ Văn bản đến Văn phòng 2026', 'Thể loại văn bản': 'Quyết định', 'Độ khẩn': 'Thường',
    'Độ mật': 'Thường', 'Người ký': 'Lê Văn Cường', 'Thời gian nhận': '16/10/2026', 'Ngày văn bản': '15/10/2026',
    'Hạn xử lý': '30/10/2026', 'Số bản': '1', 'File văn bản': '1. A13-TU-QD-1229-2026_dadongdau.pdf',
  },
  {
    STT: '4', ID: '90000004', 'Số, ký hiệu văn bản': '45-KH/BTCTU',
    'Trích yếu nội dung văn bản': 'Kế hoạch kiểm điểm, đánh giá, xếp loại chất lượng tổ chức đảng và đảng viên năm 2026',
    'Sổ văn bản': 'Sổ Văn bản đến Văn phòng 2026', 'Thể loại văn bản': 'Kế hoạch', 'Độ khẩn': 'Thường',
    'Độ mật': 'Thường', 'Người ký': 'Phạm Thị Dung', 'Thời gian nhận': '02/09/2026', 'Ngày văn bản': '30/08/2026',
    'Số bản': '1', 'File văn bản': '1. A13-BTCTU-KH-0045-2026.pdf',
  },
  {
    // Văn bản MẬT -> phải bị loại khi nhập
    STT: '5', ID: '90000005', 'Số, ký hiệu văn bản': '12-CV/TU',
    'Trích yếu nội dung văn bản': 'Nội dung mật dùng để kiểm thử bộ lọc',
    'Sổ văn bản': 'Sổ Văn bản đến Văn phòng 2026', 'Thể loại văn bản': 'Công văn', 'Độ khẩn': 'Thường',
    'Độ mật': 'Mật', 'Người ký': 'Ẩn Danh', 'Thời gian nhận': '10/10/2026', 'Ngày văn bản': '09/10/2026',
  },
  {
    // Thiếu ID -> phải báo lỗi dòng
    STT: '6', ID: '', 'Số, ký hiệu văn bản': '99-TB/TU',
    'Trích yếu nội dung văn bản': 'Thông báo thiếu ID', 'Thể loại văn bản': 'Thông báo',
    'Độ mật': 'Thường', 'Ngày văn bản': '01/10/2026',
  },
];

const DI_HEADERS = [
  'STT', 'ID', 'Sổ văn bản', 'Thể loại văn bản', 'Số đăng ký', 'Số, ký hiệu văn bản',
  'Trích yếu nội dung văn bản', 'Độ khẩn', 'Độ mật', 'Người trình', 'Người ký',
  'Trạng thái phát hành', 'Nơi nhận', 'Ngày văn bản', 'Số trang', 'Số bản', 'Văn bản chỉ đạo', 'File văn bản',
];

const DI_ROWS = [
  {
    STT: '1', ID: '80000001', 'Sổ văn bản': 'Sổ văn bản đi năm 2025', 'Thể loại văn bản': 'Báo cáo',
    'Số đăng ký': '75', 'Số, ký hiệu văn bản': '75-BC/ĐU',
    'Trích yếu nội dung văn bản': 'Báo cáo công tác nội chính, phòng, chống tham nhũng, lãng phí, tiêu cực năm 2026',
    'Độ khẩn': 'Thường', 'Độ mật': 'Thường', 'Người ký': 'Võ Văn Em', 'Trạng thái phát hành': 'Đã phát hành',
    'Nơi nhận': '- Ban Nội chính thành ủy (để báo cáo);\n- Thường trực Đảng ủy;\n- Các chi, đảng bộ trực thuộc',
    'Ngày văn bản': '15/10/2026', 'Số trang': '5', 'Số bản': '1', 'File văn bản': 'A13.126-BC-0075-2026.pdf',
  },
  {
    STT: '2', ID: '80000002', 'Sổ văn bản': 'Sổ văn bản đi năm 2025', 'Thể loại văn bản': 'Quyết định',
    'Số đăng ký': '263', 'Số, ký hiệu văn bản': '263-QĐ/ĐU',
    'Trích yếu nội dung văn bản': 'Quyết định thành lập Đoàn giám sát của Ban Thường vụ Đảng ủy xã năm 2026',
    'Độ khẩn': 'Thường', 'Độ mật': 'Thường', 'Người trình': 'Đặng Thị Giang', 'Người ký': 'Hồ Văn Hải',
    'Trạng thái phát hành': 'Đã phát hành', 'Nơi nhận': 'Như Điều 3; Lưu Văn phòng Đảng ủy.',
    'Ngày văn bản': '14/10/2026', 'Số bản': '1',
    'File văn bản': '1. A13.126-QD-0263-2026_dadongdau.pdf\n2. Ke hoach giam sat.doc',
  },
  {
    STT: '3', ID: '80000003', 'Sổ văn bản': 'Sổ văn bản đi năm 2025', 'Thể loại văn bản': 'Công văn',
    'Số đăng ký': '253', 'Số, ký hiệu văn bản': '253-CV/ĐU',
    'Trích yếu nội dung văn bản': 'Về xây dựng danh mục nhiệm vụ/sản phẩm công việc quý IV/2026',
    'Độ khẩn': 'Thường', 'Độ mật': 'Thường', 'Người ký': 'Võ Văn Em', 'Trạng thái phát hành': 'Đã phát hành',
    'Nơi nhận': '- Ban Tổ chức thành ủy', 'Ngày văn bản': '14/10/2026', 'Số trang': '1', 'Số bản': '1',
    'File văn bản': '1. A13.126-CV-0253-2026.signed.pdf\n2. DM SPCV quy IV.pdf',
  },
  {
    STT: '4', ID: '80000004', 'Sổ văn bản': 'Sổ văn bản đi năm 2026', 'Thể loại văn bản': 'Chương trình',
    'Số đăng ký': '18', 'Số, ký hiệu văn bản': '18-CTr/ĐU',
    'Trích yếu nội dung văn bản': 'Chương trình công tác kiểm tra, giám sát năm 2026',
    'Độ khẩn': 'Thường', 'Độ mật': 'Thường', 'Người ký': 'Hồ Văn Hải', 'Trạng thái phát hành': 'Đã phát hành',
    'Nơi nhận': '- Các chi bộ trực thuộc', 'Ngày văn bản': '05/01/2026', 'Số bản': '1',
    'File văn bản': '1. A13.126-CTR-0018-2026.pdf',
  },
  {
    // Chưa phát hành -> phải bị loại khi nhập
    STT: '5', ID: '80000005', 'Sổ văn bản': 'Sổ văn bản đi năm 2026', 'Thể loại văn bản': 'Công văn',
    'Số đăng ký': '260', 'Số, ký hiệu văn bản': '260-CV/ĐU',
    'Trích yếu nội dung văn bản': 'Dự thảo chưa phát hành', 'Độ khẩn': 'Thường', 'Độ mật': 'Thường',
    'Người ký': 'Võ Văn Em', 'Trạng thái phát hành': 'Chưa phát hành', 'Ngày văn bản': '18/10/2026',
  },
];

function writeWorkbook(sheet, fileName) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'sheet1');
  const outPath = path.join(OUT_DIR, fileName);
  XLSX.writeFile(wb, outPath, { bookType: 'biff8' });
  console.log('Đã tạo', path.relative(process.cwd(), outPath));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeWorkbook(buildSheet({
  period: '20/10/2025 đến ngày 20/10/2026', reportDate: '20/10/2026',
  headerRowIndex: 7, headers: DEN_HEADERS, rows: DEN_ROWS,
}), 'so-van-ban-den.xls');
writeWorkbook(buildSheet({
  period: '01/01/2026 đến ngày 20/10/2026', reportDate: '20/10/2026',
  headerRowIndex: 8, headers: DI_HEADERS, rows: DI_ROWS,
}), 'so-van-ban-di.xls');
