/* global window */
/**
 * Khung adapter dò & đọc USB token qua plugin ký số chạy local (trình duyệt -> 127.0.0.1).
 * 3 nhóm chính: VGCA, VNPT-CA, Viettel-CA. Mỗi adapter tự mô tả cách probe + lấy chứng thư.
 *
 * LƯU Ý: giao thức đọc cert của từng hãng cần xác minh theo tài liệu tích hợp của hãng
 * (xem task "Khám phá API plugin ký số"). Hàm getCertsBase64 dưới đây là điểm cần hoàn thiện
 * cho từng hãng; nếu thất bại (CORS / cert self-signed / khác phiên bản), UI sẽ gợi ý dùng bản offline.
 */
(function () {
  const TIMEOUT = 3500;

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
  }

  async function tryFetch(url, opts) {
    return withTimeout(fetch(url, opts), TIMEOUT);
  }

  // ---- Các adapter ----
  const adapters = [
    {
      // ƯU TIÊN: agent local của CheckCTS (đọc token trực tiếp qua PKCS#11, có CORS).
      // Dùng khi máy KHÔNG có/không cho dùng SDK của hãng. Tải CheckCTS-Agent.exe và chạy.
      id: 'local-agent',
      name: 'CheckCTS Agent (local)',
      base: 'http://127.0.0.1:8765',
      async probe() {
        try {
          const r = await tryFetch(this.base + '/ping', { method: 'GET' });
          const j = await r.json();
          return j && j.app === 'CheckCTS-Agent';
        } catch (_) { return false; }
      },
      async getCertsBase64() {
        const r = await tryFetch(this.base + '/certs', { method: 'GET' });
        const j = await r.json();
        const out = [];
        (j.tokens || []).forEach((t) => (t.certs || []).forEach((c) => out.push(c)));
        if (!out.length) throw new Error('Agent không thấy chứng thư trong token.');
        return out;
      },
    },
    {
      id: 'vgca',
      name: 'VGCA (Ban Cơ yếu Chính phủ)',
      base: 'https://127.0.0.1:8987',
      async probe() {
        try {
          // GET / trả 501 nhưng vẫn là phản hồi từ dịch vụ -> coi như có mặt
          await tryFetch(this.base + '/', { method: 'GET', mode: 'cors' });
          return true;
        } catch (e) {
          // fetch ném lỗi nếu cert chưa được tin / CORS chặn; vẫn có thể plugin đang chạy
          return false;
        }
      },
      // CẦN HOÀN THIỆN theo tài liệu VGCA: endpoint + schema lấy danh sách chứng thư
      async getCertsBase64() {
        const endpoints = [
          { url: this.base + '/api/getCertificate', body: {} },
          { url: this.base + '/getCertificate', body: {} },
        ];
        for (const ep of endpoints) {
          try {
            const r = await tryFetch(ep.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(ep.body),
            });
            const j = await r.json();
            const certs = extractCerts(j);
            if (certs.length) return certs;
          } catch (_) { /* thử endpoint kế tiếp */ }
        }
        throw new Error('VGCA: chưa lấy được chứng thư (cần xác minh API).');
      },
    },
    {
      id: 'viettel',
      name: 'Viettel-CA',
      base: 'https://127.0.0.1:8006',
      async probe() {
        try { await tryFetch(this.base + '/', { method: 'GET', mode: 'cors' }); return true; }
        catch (_) { return false; }
      },
      async getCertsBase64() {
        throw new Error('Viettel-CA: cần xác minh API đọc chứng thư.');
      },
    },
    {
      id: 'vnpt',
      name: 'VNPT-CA',
      base: 'https://127.0.0.1:8987', // VNPT plugin: cổng cần xác minh trên máy có cài
      async probe() {
        try { await tryFetch(this.base + '/', { method: 'GET', mode: 'cors' }); return true; }
        catch (_) { return false; }
      },
      async getCertsBase64() {
        throw new Error('VNPT-CA: cần xác minh API đọc chứng thư.');
      },
    },
  ];

  // Bóc danh sách cert base64 từ nhiều dạng response khác nhau
  function extractCerts(j) {
    const out = [];
    const push = (v) => { if (typeof v === 'string' && v.length > 100) out.push(v); };
    if (!j) return out;
    if (typeof j === 'string') push(j);
    if (Array.isArray(j)) j.forEach((x) => out.push(...extractCerts(x)));
    if (typeof j === 'object') {
      ['cert', 'certificate', 'certBase64', 'data', 'value', 'certificates'].forEach((k) => {
        if (j[k]) out.push(...extractCerts(j[k]));
      });
    }
    return out;
  }

  // Dò lần lượt, trả về { adapter, certsBase64 } của plugin đầu tiên đọc được
  async function detectAndRead(onStatus) {
    const errors = [];
    for (const ad of adapters) {
      onStatus && onStatus(`Đang dò ${ad.name} (${ad.base})...`);
      let present = false;
      try { present = await ad.probe(); } catch (_) {}
      if (!present) { errors.push(`${ad.name}: không phản hồi`); continue; }
      onStatus && onStatus(`Tìm thấy ${ad.name}, đang đọc chứng thư...`);
      try {
        const certs = await ad.getCertsBase64();
        if (certs && certs.length) return { adapter: ad, certsBase64: certs };
      } catch (e) {
        errors.push(`${ad.name}: ${e.message}`);
      }
    }
    const err = new Error('Không đọc được token qua plugin.');
    err.details = errors;
    throw err;
  }

  window.CTSPlugins = { adapters, detectAndRead };
})();
