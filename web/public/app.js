/* global CTSPlugins */
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { pdfFiles: [], token: null }; // pdfFiles: [{fileName, signatures}]

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
    if (e.dataTransfer.files.length) handlePdfFiles(e.dataTransfer.files);
  });
  pdfInput.onchange = () => { if (pdfInput.files.length) handlePdfFiles(pdfInput.files); };

  async function handlePdfFiles(fileList) {
    const files = Array.from(fileList);
    $('pdfName').textContent = `Đang kiểm tra ${files.length} file...`;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/check-pdf', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Lỗi không xác định');
        // bỏ kết quả cũ của cùng tên file (kiểm tra lại) rồi thêm mới
        state.pdfFiles = state.pdfFiles.filter((f) => f.fileName !== data.fileName);
        state.pdfFiles.push(data);
      } catch (e) {
        state.pdfFiles.push({ fileName: file.name, error: e.message, signatures: [] });
      }
    }
    $('pdfName').textContent = `Đã kiểm tra ${state.pdfFiles.length} file (kéo thêm để bổ sung)`;
    renderPdf();
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

  function renderPdf() {
    if (!state.pdfFiles.length) { $('pdfResult').innerHTML = ''; return; }
    let html = '';
    state.pdfFiles.forEach((data) => {
      html += `<div class="filegroup"><div class="filehead">📄 ${esc(data.fileName)}
        ${data.error ? '<span class="badge bad">Lỗi</span>'
          : data.hasSignature ? `<span class="muted">(${data.count} chữ ký)</span>`
          : '<span class="badge warn">Không có chữ ký số</span>'}</div>`;
      if (data.error) html += `<div class="error">${esc(data.error)}</div>`;
      (data.signatures || []).forEach((s) => {
        const g = s.signer || {};
        const cover = s.coverage === 'ENTIRE_FILE' ? 'Phủ toàn bộ file' : 'Phủ phần dữ liệu của chữ ký (bình thường với PDF nhiều chữ ký)';
        const who = g.commonName ? ' — ' + esc(g.commonName) : '';
        html += `<div class="sig ${s.intact ? '' : 'bad'}">
          <h3>Chữ ký #${s.index}${who} ${badge(s.intact)}</h3>
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
      html += `</div>`;
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
  // Chứng thư "đang dùng" (end-entity): KHÔNG phải CA gốc (tự ký) và KHÔNG cấp cho chứng thư khác
  function isEndEntity(c, all) {
    const cn = (c.commonName || '').trim();
    if (cn && cn === (c.issuerCN || '').trim()) return false;
    if (all.some((x) => x !== c && (x.issuerCN || '').trim() === cn)) return false;
    return true;
  }

  function renderToken(t) {
    if (!t.certs.length) {
      $('tokenResult').innerHTML = '<div class="error">Không đọc được chứng thư nào từ token.</div>';
      return;
    }
    const mine = t.certs.filter((c) => isEndEntity(c, t.certs));
    state.token = { plugin: t.plugin, certs: mine }; // báo cáo chỉ xuất chứng thư đang dùng
    if (!mine.length) {
      $('tokenResult').innerHTML = '<div class="error">Token chỉ có chứng thư CA, không có chứng thư cá nhân/tổ chức.</div>';
      return;
    }
    let html = `<p class="muted">Tìm thấy <b>${mine.length}</b> chứng thư đang dùng trên token (đã ẩn CA).</p>`;
    mine.forEach((c) => {
      const isOrg = !c.orgUnit && c.org;
      const badge = `<span class="rolebadge role-me">${isOrg ? 'Chứng thư tổ chức' : '★ Chứng thư cá nhân'}</span>`;
      html += `<div class="sig">
        <h3>${esc(c.commonName || 'Chứng thư')} ${badge}</h3>
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

  // ---------- XUẤT BÁO CÁO (riêng từng cách) ----------
  document.querySelectorAll('.expbtn').forEach((b) =>
    (b.onclick = () => exportReport(b.dataset.kind, b.dataset.src)));

  async function exportReport(kind, src) {
    let payload, ten;
    if (src === 'pdf') {
      if (!state.pdfFiles.length) { alert('Chưa kiểm tra file PDF nào (Cách 1).'); return; }
      payload = { pdfFiles: state.pdfFiles };
      ten = 'BaoCao_PDF';
    } else {
      if (!state.token || !state.token.certs.length) { alert('Chưa đọc được token (Cách 2).'); return; }
      payload = { token: state.token };
      ten = 'BaoCao_Token';
    }
    const r = await fetch('/api/report/' + kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { alert('Xuất báo cáo lỗi.'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ten + (kind === 'excel' ? '.xlsx' : '.pdf');
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
