'use strict';
/**
 * Trích & xác thực chữ ký số trong file PDF (server-side).
 * - Trích thông tin chứng thư (CN / O = cơ quan chủ quản / OU = đơn vị) bằng pdf-signature-reader
 *   (sửa lỗi giải mã UTF-8->latin1 của thư viện).
 * - Xác thực toàn vẹn (intact) theo ByteRange bằng pkijs (CMS detached signature).
 * - Phát hiện phạm vi phủ (toàn bộ file hay chỉ revision của chữ ký) và dấu thời gian (TSA).
 */
const crypto = require('crypto');
const asn1js = require('asn1js');
const pkijs = require('pkijs');
const { getCertificatesInfoFromPDF } = require('pdf-signature-reader');

pkijs.setEngine(
  'node',
  new pkijs.CryptoEngine({ name: 'node', crypto: crypto.webcrypto, subtle: crypto.webcrypto.subtle })
);

const OID_TIMESTAMP = '1.2.840.113549.1.9.16.2.14'; // signature-time-stamp-token

// pdf-signature-reader đọc UTF-8 thành latin1 -> đảo lại cho đúng tiếng Việt
const fixVi = (s) => (typeof s === 'string' ? Buffer.from(s, 'latin1').toString('utf8') : s);

function certStatus(notBefore, notAfter) {
  const now = new Date();
  if (now < notBefore) return { state: 'CHƯA CÓ HIỆU LỰC', daysLeft: null };
  if (now > notAfter) return { state: 'ĐÃ HẾT HẠN', daysLeft: 0 };
  return { state: 'CÒN HIỆU LỰC', daysLeft: Math.floor((notAfter - now) / 86400000) };
}

// Tìm tất cả {byteRange, contentsDer} trong PDF theo thứ tự xuất hiện
function extractRawSignatures(buf) {
  const text = buf.toString('latin1');
  const reBR = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const out = [];
  let m;
  while ((m = reBR.exec(text))) {
    const byteRange = [+m[1], +m[2], +m[3], +m[4]];
    const sub = text.slice(m.index, m.index + 200000);
    const cm = /\/Contents\s*<([0-9A-Fa-f]+)>/.exec(sub);
    if (!cm) continue;
    out.push({ byteRange, der: Buffer.from(cm[1], 'hex') });
  }
  return out;
}

async function verifyOne(buf, raw, fileLength) {
  const [a, b, c, d] = raw.byteRange;
  const signed = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);
  const asn1 = asn1js.fromBER(new Uint8Array(raw.der).buffer.slice(0, raw.der.length));
  const ci = new pkijs.ContentInfo({ schema: asn1.result });
  const sd = new pkijs.SignedData({ schema: ci.content });

  let intact = false;
  let intactError = null;
  try {
    intact = await sd.verify({ signer: 0, data: new Uint8Array(signed).buffer, checkChain: false });
  } catch (e) {
    intactError = e.message;
  }

  // Serial của người ký (từ signerInfo issuerAndSerialNumber)
  let serial = null;
  try {
    const sid = sd.signerInfos[0].sid;
    if (sid && sid.serialNumber) serial = Buffer.from(sid.serialNumber.valueBlock.valueHexView).toString('hex').toUpperCase();
  } catch (_) {}

  // Có dấu thời gian (TSA) không
  let hasTimestamp = false;
  try {
    const ua = sd.signerInfos[0].unsignedAttrs;
    if (ua && ua.attributes) hasTimestamp = ua.attributes.some((at) => at.type === OID_TIMESTAMP);
  } catch (_) {}

  // Phạm vi phủ: chữ ký phủ tới hết file (c+d === fileLength) => toàn bộ file
  const coversToEnd = c + d >= fileLength - 2; // cho phép vài byte EOL cuối
  const coverage = coversToEnd ? 'ENTIRE_FILE' : 'REVISION';

  return { intact, intactError, serial, hasTimestamp, coverage };
}

/**
 * Đọc & xác thực toàn bộ chữ ký trong PDF.
 * @param {Buffer} buf nội dung file PDF
 * @returns {Promise<{hasSignature:boolean, count:number, signatures:Array}>}
 */
async function checkPdf(buf) {
  const raws = extractRawSignatures(buf);
  if (raws.length === 0) return { hasSignature: false, count: 0, signatures: [] };

  let certChains = [];
  try {
    certChains = getCertificatesInfoFromPDF(buf) || [];
  } catch (_) {
    certChains = [];
  }

  const signatures = [];
  for (let i = 0; i < raws.length; i++) {
    const v = await verifyOne(buf, raws[i], buf.length);
    const leaf = (certChains[i] && certChains[i][0]) || null;

    let signer = null;
    if (leaf) {
      const to = leaf.issuedTo || {};
      const by = leaf.issuedBy || {};
      const nb = new Date(leaf.validityPeriod.notBefore);
      const na = new Date(leaf.validityPeriod.notAfter);
      const st = certStatus(nb, na);
      signer = {
        commonName: fixVi(to.commonName),
        org: fixVi(to.organizationName),         // cơ quan chủ quản (O)
        orgUnit: fixVi(to.organizationalUnitName), // đơn vị trực thuộc (OU)
        locality: fixVi(to.localityName),
        email: fixVi(to.emailAddress),
        issuerCN: fixVi(by.commonName),
        issuerOrg: fixVi(by.organizationName),
        serialNumber: v.serial,
        notBefore: nb.toISOString(),
        notAfter: na.toISOString(),
        status: st.state,
        daysLeft: st.daysLeft,
      };
    }

    signatures.push({
      index: i + 1,
      intact: v.intact,
      intactError: v.intactError,
      coverage: v.coverage,
      hasTimestamp: v.hasTimestamp,
      signer,
    });
  }

  return { hasSignature: true, count: signatures.length, signatures };
}

// OID -> đọc trường trong Subject/Issuer của X.509
const OID = {
  CN: '2.5.4.3', O: '2.5.4.10', OU: '2.5.4.11',
  C: '2.5.4.6', L: '2.5.4.7', SERIAL: '2.5.4.5',
  EMAIL: '1.2.840.113549.1.9.1',
};

function rdnValue(typesAndValues, oid) {
  const found = typesAndValues.filter((tv) => tv.type === oid);
  if (!found.length) return null;
  const vb = found[0].value && found[0].value.valueBlock;
  return vb ? vb.value : null;
}

/** Parse 1 chứng thư X.509 (DER) -> thông tin chuẩn hóa (dùng cho cert đọc từ token). */
function parseCertDer(der) {
  const asn1 = asn1js.fromBER(new Uint8Array(der).buffer.slice(0, der.length));
  const cert = new pkijs.Certificate({ schema: asn1.result });
  const sub = cert.subject.typesAndValues;
  const iss = cert.issuer.typesAndValues;
  const nb = cert.notBefore.value;
  const na = cert.notAfter.value;
  const st = certStatus(nb, na);
  const serial = Buffer.from(cert.serialNumber.valueBlock.valueHexView).toString('hex').toUpperCase();
  return {
    commonName: rdnValue(sub, OID.CN),
    org: rdnValue(sub, OID.O),
    orgUnit: rdnValue(sub, OID.OU),
    locality: rdnValue(sub, OID.L),
    email: rdnValue(sub, OID.EMAIL),
    issuerCN: rdnValue(iss, OID.CN),
    issuerOrg: rdnValue(iss, OID.O),
    serialNumber: serial,
    notBefore: nb.toISOString(),
    notAfter: na.toISOString(),
    status: st.state,
    daysLeft: st.daysLeft,
  };
}

module.exports = { checkPdf, certStatus, fixVi, parseCertDer };
