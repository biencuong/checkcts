'use strict';
/**
 * Lưu trữ nội bộ (SQLite) các chứng thư đã kiểm tra, dedup theo số serial.
 * Mục đích: nội bộ theo dõi/rà soát CKS ngành giáo dục - KHÔNG công khai.
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

const upsertStmt = db.prepare(`
  INSERT INTO certs (serial, commonName, org, orgUnit, locality, email, issuerCN,
                     notBefore, notAfter, source, firstSeen, lastSeen, checkCount)
  VALUES (@serial, @commonName, @org, @orgUnit, @locality, @email, @issuerCN,
          @notBefore, @notAfter, @source, @now, @now, 1)
  ON CONFLICT(serial) DO UPDATE SET
    commonName=excluded.commonName, org=excluded.org, orgUnit=excluded.orgUnit,
    locality=excluded.locality, email=excluded.email, issuerCN=excluded.issuerCN,
    notBefore=excluded.notBefore, notAfter=excluded.notAfter,
    lastSeen=excluded.lastSeen, checkCount=certs.checkCount+1;
`);

function upsertCert(c, source) {
  if (!c || !c.serialNumber) return;
  // Bỏ qua chứng thư CA (gốc/trung gian) - chỉ lưu CKS của người/đơn vị
  const cn = (c.commonName || '').trim();
  if (cn && cn === (c.issuerCN || '').trim()) return;       // CA gốc (tự ký)
  if (/^(RootCA|CA |Sub\s?CA|CA$)/i.test(cn)) return;        // CA trung gian
  upsertStmt.run({
    serial: String(c.serialNumber).toUpperCase(),
    commonName: c.commonName || null,
    org: c.org || null,
    orgUnit: c.orgUnit || null,
    locality: c.locality || null,
    email: c.email || null,
    issuerCN: c.issuerCN || null,
    notBefore: c.notBefore || null,
    notAfter: c.notAfter || null,
    source: source || null,
    now: new Date().toISOString(),
  });
}

function listCerts() {
  return db.prepare('SELECT * FROM certs ORDER BY lastSeen DESC').all();
}

function countCerts() {
  return db.prepare('SELECT COUNT(*) AS n FROM certs').get().n;
}

module.exports = { upsertCert, listCerts, countCerts };
