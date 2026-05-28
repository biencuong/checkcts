'use strict';
/**
 * Lưu trữ nội bộ (SQLite) các chứng thư đã kiểm tra, dedup theo số serial.
 * Mục đích: nội bộ theo dõi/rà soát CKS ngành giáo dục - KHÔNG công khai.
 * Mỗi chứng thư = 1 dòng (khóa theo serial đã chuẩn hóa). Nếu kiểm lại mà
 * KHÔNG có thay đổi thì bỏ qua, không ghi lại (tránh dữ liệu thừa).
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'checkcts.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS certs (
    serial      TEXT PRIMARY KEY,
    commonName  TEXT,
    org         TEXT,
    orgUnit     TEXT,
    locality    TEXT,
    email       TEXT,
    issuerCN    TEXT,
    notBefore   TEXT,
    notAfter    TEXT,
    source      TEXT,
    firstSeen   TEXT,
    lastSeen    TEXT,
    checkCount  INTEGER DEFAULT 1
  );
`);

// Chuẩn hóa serial về dạng hex thống nhất: chỉ giữ 0-9A-F, bỏ số 0 ở đầu
// (DER hay chèn byte 00 dấu dương) -> cùng một chứng thư dù đọc từ PDF hay
// token đều cho cùng một khóa => không bị tách thành nhiều dòng.
function normSerial(s) {
  const h = String(s == null ? '' : s).toUpperCase().replace(/[^0-9A-F]/g, '').replace(/^0+/, '');
  return h || '0';
}

const COMPARE_FIELDS = ['commonName', 'org', 'orgUnit', 'locality', 'email', 'issuerCN', 'notBefore', 'notAfter'];

const getStmt = db.prepare('SELECT * FROM certs WHERE serial = ?');
const insertStmt = db.prepare(`
  INSERT INTO certs (serial, commonName, org, orgUnit, locality, email, issuerCN,
                     notBefore, notAfter, source, firstSeen, lastSeen, checkCount)
  VALUES (@serial, @commonName, @org, @orgUnit, @locality, @email, @issuerCN,
          @notBefore, @notAfter, @source, @now, @now, 1)
`);
const updateStmt = db.prepare(`
  UPDATE certs SET commonName=@commonName, org=@org, orgUnit=@orgUnit, locality=@locality,
    email=@email, issuerCN=@issuerCN, notBefore=@notBefore, notAfter=@notAfter,
    source=@source, lastSeen=@now, checkCount=checkCount+1
  WHERE serial=@serial
`);

function isCA(c) {
  const cn = (c.commonName || '').trim();
  if (cn && cn === (c.issuerCN || '').trim()) return true;        // CA gốc (tự ký)
  if (/^(RootCA|CA |Sub\s?CA|CA$)/i.test(cn)) return true;        // CA trung gian
  return false;
}

function upsertCert(c, source) {
  if (!c || !c.serialNumber) return;
  if (isCA(c)) return; // chỉ lưu CKS của người/đơn vị, bỏ chứng thư CA

  const serial = normSerial(c.serialNumber);
  const data = {
    serial,
    commonName: c.commonName || null,
    org: c.org || null,
    orgUnit: c.orgUnit || null,
    locality: c.locality || null,
    email: c.email || null,
    issuerCN: c.issuerCN || null,
    notBefore: c.notBefore || null,
    notAfter: c.notAfter || null,
  };

  const existing = getStmt.get(serial);
  if (existing) {
    // Đã có trong DB: nếu nội dung không thay đổi thì KHÔNG ghi lại (tránh db thừa)
    const changed = COMPARE_FIELDS.some((k) => (existing[k] == null ? null : existing[k]) !== data[k]);
    if (!changed) return;
    updateStmt.run({ ...data, source: source || existing.source, now: new Date().toISOString() });
  } else {
    insertStmt.run({ ...data, source: source || null, now: new Date().toISOString() });
  }
}

function listCerts() {
  return db.prepare('SELECT * FROM certs ORDER BY lastSeen DESC').all();
}

function countCerts() {
  return db.prepare('SELECT COUNT(*) AS n FROM certs').get().n;
}

// Xóa toàn bộ lịch sử (dùng cho dọn dữ liệu test). Trả về số dòng đã xóa.
function clearCerts() {
  return db.prepare('DELETE FROM certs').run().changes;
}

module.exports = { upsertCert, listCerts, countCerts, clearCerts };
