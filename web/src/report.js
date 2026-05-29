'use strict';
/** Xuất báo cáo kiểm tra ra Excel (exceljs) và PDF (pdfkit + font tiếng Việt). */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Font TTF hỗ trợ tiếng Việt. Thứ tự ưu tiên:
//  1) biến môi trường CHECKCTS_FONT / CHECKCTS_FONT_BOLD
//  2) font kèm theo bộ cài (web/fonts/) - đặt DejaVuSans.ttf vào đây nếu muốn tự chứa
//  3) font hệ thống Linux (aaPanel) / Windows / macOS
const BUNDLED_DIR = path.join(__dirname, '..', 'fonts');
const FONT_CANDIDATES = [
  process.env.CHECKCTS_FONT,
  path.join(BUNDLED_DIR, 'font.ttf'),
  path.join(BUNDLED_DIR, 'DejaVuSans.ttf'),
  // Linux
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/google-noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
  // Windows
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\times.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
  // macOS
  '/Library/Fonts/Arial.ttf',
].filter(Boolean);
const FONT_BOLD_CANDIDATES = [
  process.env.CHECKCTS_FONT_BOLD,
  path.join(BUNDLED_DIR, 'font-bold.ttf'),
  path.join(BUNDLED_DIR, 'DejaVuSans-Bold.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  'C:\\Windows\\Fonts\\arialbd.ttf',
  'C:\\Windows\\Fonts\\timesbd.ttf',
].filter(Boolean);
const pickFont = (list) => list.find((p) => fs.existsSync(p)) || null;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN');
}

// Cảnh báo đơn vị hành chính hết hiệu lực (sáp nhập + bỏ cấp huyện từ 01/7/2025)
// CHỈ xét Cơ quan chủ quản (O) + Địa phương (L); "Huyện" khớp nguyên từ + có dấu (tránh nhầm tên người "Huyến/Huyền")
const RE_HUYEN = new RegExp('(?:^|[^\\p{L}])' + 'huyện'.normalize('NFC') + '(?:[^\\p{L}]|$)', 'iu');
function adminWarn(org, locality) {
  const raw = [org, locality].filter(Boolean).join(' ').normalize('NFC');
  // bỏ dấu để bắt "Hà Giang"; loại trừ phường mới "Hà Giang 1" / "Hà Giang 2" (vẫn hợp lệ)
  const stripped = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/ha giang\s*[12](?!\d)/g, '');
  // Cơ quan chủ quản đã là "Tuyên Quang" -> đơn vị đã cập nhật tỉnh mới, KHÔNG cảnh báo "Hà Giang"
  const oTuyenQuang = String(org || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().includes('tuyen quang');
  const w = [];
  if (stripped.includes('ha giang') && !oTuyenQuang) w.push('CẢNH BÁO: "tỉnh Hà Giang" đã sáp nhập vào Tuyên Quang (01/7/2025) - không còn phù hợp');
  if (RE_HUYEN.test(raw)) w.push('CẢNH BÁO: không còn cấp Huyện từ 01/7/2025 (chính quyền 2 cấp)');
  return w.join(' | ');
}

function flattenRows(data) {
  // data = { pdfFiles: [{fileName, signatures:[...]}], token: {certs:[...]} }
  // Lọc trùng theo số serial (mỗi chứng thư chỉ xuất 1 dòng).
  const rows = [];
  const seen = new Set();
  const pushUnique = (row) => {
    const key = (row.serial || '').toUpperCase() || row.nguon + '|' + row.cn;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const pdfFiles = data.pdfFiles || (data.pdf ? [{ fileName: '', signatures: data.pdf.signatures }] : []);
  pdfFiles.forEach((f) => {
    (f.signatures || []).forEach((s) => {
      const g = s.signer || {};
      pushUnique({
        nguon: 'PDF' + (f.fileName ? ' - ' + f.fileName : '') + ' - Chữ ký #' + s.index,
        cn: g.commonName || '',
        donVi: g.orgUnit || '',
        chuQuan: g.org || '',
        serial: g.serialNumber || '',
        hieuLuc: g.notBefore ? `${fmtDate(g.notBefore)} - ${fmtDate(g.notAfter)}` : '',
        trangThai: g.status || '',
        toanVen: s.intact ? 'Hợp lệ' : 'KHÔNG hợp lệ',
        ghiChu: [
          (s.coverage === 'ENTIRE_FILE' ? 'Phủ toàn bộ file' : 'Phủ revision') + (s.hasTimestamp ? '; có TSA' : ''),
          adminWarn(g.org, g.locality),
        ].filter(Boolean).join(' | '),
      });
    });
  });

  if (data.token && data.token.certs) {
    data.token.certs.forEach((c, i) => {
      pushUnique({
        nguon: 'Token - Chứng thư #' + (i + 1),
        cn: c.commonName || '',
        donVi: c.orgUnit || '',
        chuQuan: c.org || '',
        serial: c.serialNumber || '',
        hieuLuc: `${fmtDate(c.notBefore)} - ${fmtDate(c.notAfter)}`,
        trangThai: c.status || '',
        toanVen: '',
        ghiChu: [c.issuerCN ? 'CA: ' + c.issuerCN : '', adminWarn(c.org, c.locality)].filter(Boolean).join(' | '),
      });
    });
  }
  return rows;
}

async function buildExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CheckCTS';
  const ws = wb.addWorksheet('Kết quả kiểm tra');
  ws.columns = [
    { header: 'Nguồn', key: 'nguon', width: 22 },
    { header: 'Người/Tổ chức (CN)', key: 'cn', width: 28 },
    { header: 'Đơn vị (OU)', key: 'donVi', width: 28 },
    { header: 'Cơ quan chủ quản (O)', key: 'chuQuan', width: 30 },
    { header: 'Serial', key: 'serial', width: 20 },
    { header: 'Hiệu lực', key: 'hieuLuc', width: 34 },
    { header: 'Trạng thái', key: 'trangThai', width: 22 },
    { header: 'Toàn vẹn', key: 'toanVen', width: 16 },
    { header: 'Ghi chú', key: 'ghiChu', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  flattenRows(data).forEach((r) => ws.addRow(r));
  ws.autoFilter = 'A1:I1';
  return wb.xlsx.writeBuffer();
}

function buildPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const font = pickFont(FONT_CANDIDATES);
    const fontBold = pickFont(FONT_BOLD_CANDIDATES) || font;
    if (font) doc.registerFont('vi', font);
    if (fontBold) doc.registerFont('vi-bold', fontBold);
    const F = font ? 'vi' : 'Helvetica';
    const FB = fontBold ? 'vi-bold' : 'Helvetica-Bold';

    doc.font(FB).fontSize(16).text('BÁO CÁO KIỂM TRA CHỮ KÝ SỐ', { align: 'center' });
    doc.font(F).fontSize(9).fillColor('#666')
      .text('Tạo lúc: ' + new Date().toLocaleString('vi-VN'), { align: 'center' });
    doc.moveDown(1).fillColor('#000');

    const rows = flattenRows(data);
    rows.forEach((r, i) => {
      doc.font(FB).fontSize(11).text(`${i + 1}. ${r.nguon}`);
      doc.font(F).fontSize(10);
      const line = (label, val) => { if (val) doc.text(`   ${label}: ${val}`); };
      line('Người/Tổ chức (CN)', r.cn);
      line('Đơn vị (OU)', r.donVi);
      line('Cơ quan chủ quản (O)', r.chuQuan);
      line('Serial', r.serial);
      line('Hiệu lực', r.hieuLuc);
      line('Trạng thái', r.trangThai);
      line('Toàn vẹn', r.toanVen);
      line('Ghi chú', r.ghiChu);
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

module.exports = { buildExcel, buildPdf };
