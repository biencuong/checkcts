'use strict';
/** Xuất báo cáo kiểm tra ra Excel (exceljs) và PDF (pdfkit + font tiếng Việt). */
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Tìm 1 font TTF hỗ trợ tiếng Việt (Windows có sẵn Arial/Times)
const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\times.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
];
const FONT_BOLD_CANDIDATES = [
  'C:\\Windows\\Fonts\\arialbd.ttf',
  'C:\\Windows\\Fonts\\timesbd.ttf',
];
const pickFont = (list) => list.find((p) => fs.existsSync(p)) || null;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN');
}

// Cảnh báo đơn vị hành chính hết hiệu lực (sáp nhập + bỏ cấp huyện từ 01/7/2025)
function adminWarn(...fields) {
  const text = fields.filter(Boolean).join(' ').toUpperCase();
  const w = [];
  if (text.includes('HÀ GIANG')) w.push('CẢNH BÁO: "tỉnh Hà Giang" đã sáp nhập vào Tuyên Quang (01/7/2025) - không còn phù hợp');
  if (/HUYỆN/.test(text)) w.push('CẢNH BÁO: không còn cấp Huyện từ 01/7/2025 (chính quyền 2 cấp)');
  return w.join(' | ');
}

function flattenRows(data) {
  // data = { pdf: {signatures:[...]}, token: {certs:[...]} }
  const rows = [];
  if (data.pdf && data.pdf.signatures) {
    data.pdf.signatures.forEach((s) => {
      rows.push({
        nguon: 'PDF - Chữ ký #' + s.index,
        cn: s.signer ? s.signer.commonName : '',
        donVi: s.signer ? s.signer.orgUnit || '' : '',
        chuQuan: s.signer ? s.signer.org || '' : '',
        serial: s.signer ? s.signer.serialNumber || '' : '',
        hieuLuc: s.signer ? `${fmtDate(s.signer.notBefore)} - ${fmtDate(s.signer.notAfter)}` : '',
        trangThai: s.signer ? s.signer.status : '',
        toanVen: s.intact ? 'Hợp lệ' : 'KHÔNG hợp lệ',
        ghiChu: [
          (s.coverage === 'ENTIRE_FILE' ? 'Phủ toàn bộ file' : 'Phủ revision') + (s.hasTimestamp ? '; có TSA' : ''),
          s.signer ? adminWarn(s.signer.commonName, s.signer.org, s.signer.orgUnit, s.signer.locality) : '',
        ].filter(Boolean).join(' | '),
      });
    });
  }
  if (data.token && data.token.certs) {
    data.token.certs.forEach((c, i) => {
      rows.push({
        nguon: 'Token - Chứng thư #' + (i + 1),
        cn: c.commonName || '',
        donVi: c.orgUnit || '',
        chuQuan: c.org || '',
        serial: c.serialNumber || '',
        hieuLuc: `${fmtDate(c.notBefore)} - ${fmtDate(c.notAfter)}`,
        trangThai: c.status || '',
        toanVen: '',
        ghiChu: [c.issuerCN ? 'CA: ' + c.issuerCN : '', adminWarn(c.commonName, c.org, c.orgUnit, c.locality)].filter(Boolean).join(' | '),
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
