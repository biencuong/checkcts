'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const { checkPdf, parseCertDer } = require('./src/pdfSignature');
const { buildExcel, buildPdf } = require('./src/report');
const dbStore = require('./src/db');

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Khóa truy cập nội bộ cho phần lịch sử (KHÔNG công khai). Đặt qua biến môi trường.
const ADMIN_KEY = process.env.CHECKCTS_ADMIN_KEY || 'sgdtuyenquang';

// Kiểm tra file PDF đã ký
app.post('/api/check-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file PDF.' });
    const result = await checkPdf(req.file.buffer);
    // Lưu nội bộ chứng thư người ký (dedup theo serial)
    (result.signatures || []).forEach((s) => { if (s.signer) dbStore.upsertCert(s.signer, 'PDF'); });
    res.json({ fileName: req.file.originalname, ...result });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi xử lý PDF: ' + e.message });
  }
});

// Parse chứng thư (base64 DER) đọc từ token phía trình duyệt
app.post('/api/parse-cert', (req, res) => {
  try {
    const { certBase64 } = req.body || {};
    if (!certBase64) return res.status(400).json({ error: 'Thiếu certBase64.' });
    const der = Buffer.from(certBase64.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    const info = parseCertDer(der);
    dbStore.upsertCert(info, 'Token'); // lưu nội bộ (db tự bỏ qua chứng thư CA)
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Không parse được cert: ' + e.message });
  }
});

// --- Lịch sử nội bộ (cần admin key) ---
function requireKey(req, res) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) { res.status(403).json({ error: 'Cần khóa nội bộ hợp lệ.' }); return false; }
  return true;
}

app.get('/api/history', (req, res) => {
  if (!requireKey(req, res)) return;
  res.json({ count: dbStore.countCerts(), certs: dbStore.listCerts() });
});

app.get('/api/history/export', async (req, res) => {
  if (!requireKey(req, res)) return;
  const certs = dbStore.listCerts().map((c) => ({
    commonName: c.commonName, org: c.org, orgUnit: c.orgUnit, locality: c.locality,
    email: c.email, issuerCN: c.issuerCN, serialNumber: c.serial,
    notBefore: c.notBefore, notAfter: c.notAfter,
    status: c.notAfter && new Date(c.notAfter) < new Date() ? 'ĐÃ HẾT HẠN' : 'CÒN HIỆU LỰC',
  }));
  const buf = await buildExcel({ token: { certs } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CheckCTS_lichsu.xlsx"');
  res.send(Buffer.from(buf));
});

// Xuất báo cáo Excel
app.post('/api/report/excel', async (req, res) => {
  try {
    const buf = await buildExcel(req.body || {});
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="CheckCTS_report.xlsx"');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Xuất báo cáo PDF
app.post('/api/report/pdf', async (req, res) => {
  try {
    const buf = await buildPdf(req.body || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="CheckCTS_report.pdf"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CheckCTS web chạy tại http://localhost:${PORT}`));
