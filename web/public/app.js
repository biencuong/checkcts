/* global CTSPlugins */
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { pdf: null, token: null };

  // ---------- PDF ----------
  const drop = $('drop');
  const pdfInput = $('pdfInput');
  $('pickBtn').onclick = () => pdfInput.click();
  drop.onclick = (e) => { if (e.target.tagName !== 'BUTTON') pdfInput.click(); };
  ['dragover', 'dragenter'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handlePdf(f);
  });
  pdfInput.onchange = () => { if (pdfInput.files[0]) handlePdf(pdfInput.files[0]); };

  async function handlePdf(file) {
    $('pdfName').textContent = 'Đã chọn: ' + file.name;
    $('pdfResult').innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/check-pdf', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Lỗi không xác định');
      state.pdf = data;
      renderPdf(data);
    } catch (e) {
      $('pdfResult').innerHTML = `<div class="error">${esc(e.message)}</div>`;
    }
  }

  function badge(intact) {
    return intact
      ? '<span class="badge ok">Toàn vẹn / Hợp lệ</span>'
      : '<span class="badge bad">KHÔNG toàn vẹn</span>';
  }
  function statusBadge(s) {
    if (!s) return '';
    if (s.includes('CÒN')) return `<span class="badge ok">${esc(s)}</span>`;
    if (s.includes('HẾT')) return `<span class="badge bad">${esc(s)}</span>`;
    return `<span class="badge warn">${esc(s)}</span>`;
  }

  // Cảnh báo đơn vị hành chính không còn phù hợp (sáp nhập + chính quyền 2 cấp từ 01/7/2025)
  function adminWarnings(o) {
    if (!o) return [];
    const text = [o.commonName, o.org, o.orgUnit, o.locality].filter(Boolean).join(' ').toUpperCase();
    const w = [];
    if (text.includes('HÀ GIANG'))
      w.push('Tỉnh Hà Giang đã sáp nhập vào tỉnh Tuyên Quang từ 01/7/2025 — tên "tỉnh Hà Giang" trên chứng thư KHÔNG còn phù hợp.');
    if (/HUYỆN/.test(text))
      w.push('Từ 01/7/2025 áp dụng chính quyền 2 cấp (tỉnh – xã), KHÔNG còn cấp Huyện — thông tin đơn vị cấp huyện không còn phù hợp.');
    return w;
  }
  function warnBlock(o) {
    const w = adminWarnings(o);
    if (!w.length) return '';
    return `<div class="adminwarn"><b>⚠ CẢNH BÁO đơn vị hành chính (đã hết hiệu lực):</b>
      <ul>${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  }

  function renderPdf(data) {
    if (!data.hasSignature) {
      $('pdfResult').innerHTML = '<div class="error">File này KHÔNG có chữ ký số.</div>';
      return;
    }
    let html = `<p class="muted">Tìm thấy <b>${data.count}</b> chữ ký trong <b>${esc(data.fileName)}</b></p>`;
    data.signatures.forEach((s) => {
      const g = s.signer || {};
      const cover = s.coverage === 'ENTIRE_FILE' ? 'Phủ toàn bộ file' : 'Phủ phần dữ liệu của chữ ký (bình thường với PDF nhiều chữ ký)';
      html += `<div class="sig ${s.intact ? '' : 'bad'}">
        <h3>Chữ ký #${s.index} ${badge(s.intact)}</h3>
        <table>
          ${row('Người/Tổ chức ký (CN)', g.commonName)}
          ${row('Đơn vị (OU)', g.orgUnit)}
          ${row('Cơ quan chủ quản (O)', g.org)}
          ${row('Email', g.email)}
          ${row('Số serial', g.serialNumber)}
          ${row('Hiệu lực', g.notBefore ? fmt(g.notBefore) + ' → ' + fmt(g.notAfter) : '')}
          ${rowRaw('Trạng thái', statusBadge(g.status) + (g.daysLeft != null ? ` <span class="muted">(còn ${g.daysLeft} ngày)</span>` : ''))}
          ${row('Nhà phát hành (CA)', g.issuerCN)}
          ${row('Phạm vi phủ', cover)}
          ${rowRaw('Dấu thời gian (TSA)', s.hasTimestamp ? '<span class="badge ok">Có</span>' : '<span class="badge warn">Không</span>')}
        </table>${warnBlock(g)}</div>`;
    });
    $('pdfResult').innerHTML = html;
  }

  // ---------- TOKEN ----------
  $('tokenBtn').onclick = readToken;
  async function readToken() {
    $('tokenStatus').innerHTML = ' <span class="spinner"></span>';
    $('tokenResult').innerHTML = '';
    try {
      const { adapter, certsBase64 } = await CTSPlugins.detectAndRead((m) => {
        $('tokenStatus').textContent = ' ' + m;
      });
      $('tokenStatus').textContent = ' Đã kết nối: ' + adapter.name;
      const certs = [];
      for (const b64 of certsBase64) {
        try {
          const r = await fetch('/api/parse-cert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certBase64: b64 }),
          });
          if (r.ok) certs.push(await r.json());
        } catch (_) {}
      }
      state.token = { plugin: adapter.name, certs };
      renderToken(state.token);
    } catch (e) {
      $('tokenStatus').textContent = '';
      const details = e.details ? '<ul>' + e.details.map((d) => `<li>${esc(d)}</li>`).join('') + '</ul>' : '';
      $('tokenResult').innerHTML =
        `<div class="error">${esc(e.message)} Trình duyệt có thể bị chặn bởi CORS / chứng chỉ self-signed.
         ${details}<b>Khuyến nghị:</b> dùng <b>bản offline (.exe)</b> bên dưới để đọc token trực tiếp.</div>`;
    }
  }

  // Xác định vai trò mỗi chứng thư trong chuỗi tin cậy
  function certRole(c, all) {
    const cn = (c.commonName || '').trim();
    const iss = (c.issuerCN || '').trim();
    if (cn && cn === iss) return { label: 'CA gốc', cls: 'role-ca' };
    if (all.some((x) => x !== c && (x.issuerCN || '').trim() === cn))
      return { label: 'CA trung gian', cls: 'role-ca' };
    return { label: '★ Chứng thư của bạn (dùng để ký)', cls: 'role-me' };
  }

  function renderToken(t) {
    if (!t.certs.length) {
      $('tokenResult').innerHTML = '<div class="error">Không đọc được chứng thư nào từ token.</div>';
      return;
    }
    let html = `<p class="muted">Plugin: <b>${esc(t.plugin)}</b> — ${t.certs.length} chứng thư
      (gồm chứng thư của bạn + các CA đi kèm để tạo chuỗi tin cậy)</p>`;
    t.certs.forEach((c, i) => {
      const role = certRole(c, t.certs);
      html += `<div class="sig">
        <h3>Chứng thư #${i + 1} <span class="rolebadge ${role.cls}">${esc(role.label)}</span></h3>
        <table>
          ${row('Người/Tổ chức (CN)', c.commonName)}
          ${row('Đơn vị (OU)', c.orgUnit)}
          ${row('Cơ quan chủ quản (O)', c.org)}
          ${row('Số serial', c.serialNumber)}
          ${row('Hiệu lực', c.notBefore ? fmt(c.notBefore) + ' → ' + fmt(c.notAfter) : '')}
          ${rowRaw('Trạng thái', statusBadge(c.status))}
          ${row('Nhà phát hành (CA)', c.issuerCN)}
        </table>${warnBlock(c)}</div>`;
    });
    $('tokenResult').innerHTML = html;
  }

  // ---------- XUẤT BÁO CÁO ----------
  $('xlsxBtn').onclick = () => exportReport('excel');
  $('pdfBtn').onclick = () => exportReport('pdf');
  async function exportReport(kind) {
    if (!state.pdf && !state.token) {
      alert('Chưa có kết quả nào để xuất. Hãy kiểm tra PDF hoặc đọc token trước.');
      return;
    }
    const r = await fetch('/api/report/' + kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: state.pdf, token: state.token }),
    });
    if (!r.ok) { alert('Xuất báo cáo lỗi.'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'excel' ? 'CheckCTS_report.xlsx' : 'CheckCTS_report.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function row(k, v) { return v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : ''; }
  function rowRaw(k, v) { return v ? `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>` : ''; }
  function fmt(iso) { try { return new Date(iso).toLocaleString('vi-VN'); } catch (_) { return iso; } }
})();
