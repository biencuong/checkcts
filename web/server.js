'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const { checkPdf, parseCertDer } = require('./src/pdfSignature');
const { buildExcel, buildPdf } = require('./src/report');

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra file PDF đã ký
app.post('/api/check-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file PDF.' });
    const result = await checkPdf(req.file.buffer);
    res.json({ fileName: req.file.originalname, ...result });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi xử lý PDF: ' + e.message });
  }
});

// Parse chứng thư (base64 DER) đọc từ plugin token phía trình duyệt
app.post('/api/parse-cert', (req, res) => {
  try {
    const { certBase64 } = req.body || {};
    if (!certBase64) return res.status(400).json({ error: 'Thiếu certBase64.' });
    const der = Buffer.from(certBase64.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    res.json(parseCertDer(der));
  } catch (e) {
    res.status(500).json({ error: 'Không parse được cert: ' + e.message });
  }
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
