/* 화면 — 판정은 proto.js 가 한다. 여기서는 읽고, 그리고, 고른 값을 넘길 뿐이다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var PALETTE = ['#cfe4f5', '#d6ecdf', '#fbe7b5', '#ead9f3', '#f8d5cc', '#d3eeee', '#e8e3c9', '#f6d6e6', '#dbe0f7', '#e2ecc7'];
  var LV = { ok: '정상', warn: '경고', error: '오류', info: '참고' };
  var state = { fields: [], messages: [], proto: null, all: null, sel: null };

  /* ---------- 정의 ---------- */
  function settings() { return { idStart: $('set-idstart').value, idLen: $('set-idlen').value, base: $('set-base').value }; }
  function rebuild() {
    state.proto = Proto.normalize({ fields: state.fields, messages: state.messages, settings: settings() });
    var p = state.proto;
    $('field-count').textContent = '· 읽은 항목 ' + p.fields.length + '개 / 메시지 ' + p.messages.length + '종';
    var h = '';
    if (p.issues.length) h = '<div class="warn"><b>정의에서 확인할 것 ' + p.issues.length + '건</b><ul>' + p.issues.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
    else if (p.fields.length) h = '<div class="ok">정의를 경고 없이 읽었습니다.</div>';
    $('proto-status').innerHTML = h;
  }
  function editTable(el, head, rows, cls) {
    var h = '<thead><tr>' + head.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      h += '<tr>' + head.map(function (k) {
        return '<td class="' + (cls[k] || '') + '"><input data-r="' + i + '" data-k="' + esc(k) + '" value="' + esc(r[k]) + '" aria-label="' + esc(k) + ' ' + (i + 1) + '행"></td>';
      }).join('') + '<td><button class="x" data-del="' + i + '" title="이 줄 지우기">지우기</button></td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  var FCLS = { '항목명': 'c-name', '열거값': 'c-enums', '비고': 'c-note', '시작Byte': 'c-num', '시작bit': 'c-num', '길이': 'c-num', 'Resolution': 'c-num', 'Offset': 'c-num', '최소': 'c-num', '최대': 'c-num' };
  function renderEditors() {
    editTable($('t-msg'), Proto.MSG_HEAD, state.messages, {});
    editTable($('t-field'), Proto.FIELD_HEAD, state.fields, FCLS);
  }
  function bindEditor(el, list) {
    el.addEventListener('input', function (e) {
      var t = e.target; if (!t.dataset.k) return;
      list()[+t.dataset.r][t.dataset.k] = t.value;
      changed();
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      list().splice(+b.dataset.del, 1); renderEditors(); changed();
    });
  }
  var timer = null;
  function changed() { clearTimeout(timer); timer = setTimeout(function () { rebuild(); if (!$('s-result').hidden) run(); }, 250); }
  function blankRow(head) { var o = {}; head.forEach(function (k) { o[k] = ''; }); return o; }
  function setProto(raw) {
    state.fields = Proto.canonical(raw.fields || []);
    state.messages = Proto.canonical(raw.messages || [], true);
    var s = raw.settings || {};
    if (s.idStart != null) $('set-idstart').value = s.idStart;
    if (s.idLen != null) $('set-idlen').value = s.idLen;
    if (s.base != null) $('set-base').value = String(s.base) === '1' ? '1' : '0';
    renderEditors(); rebuild();
    // 불러온 정의는 접어 둔다 — 16줄 넘는 표가 결과를 화면 밖으로 밀어낸다. 요약 줄에 개수가 남는다.
    $('proto-edit').open = !state.fields.length;
  }

  /* ---------- 해석 ---------- */
  function run() {
    if (!state.proto) rebuild();
    var lines = Proto.parseLines($('data').value);
    if (!lines.length) { $('s-result').hidden = false; $('summary').innerHTML = '<div class="warn">해석할 데이터 줄이 없습니다.</div>'; $('lines').innerHTML = ''; $('detail').innerHTML = ''; return; }
    state.all = Proto.decodeAll(state.proto, lines);
    if (state.sel != null && state.sel >= state.all.results.length) state.sel = null;
    $('s-result').hidden = false;
    renderSummary(); renderLines();
    if (state.sel == null) {                        // 처음엔 경고가 있는 첫 줄을 펼친다
      var k = state.all.results.findIndex(function (r) { return Proto.levelOf(r) !== 'ok' || r.verdict === 'fail'; });
      state.sel = k < 0 ? 0 : k;
    }
    renderDetail();
  }
  function stat(k, v, cls) { return '<div class="stat ' + (cls || '') + '"><b>' + v + '</b>' + k + '</div>'; }
  function renderSummary() {
    var s = state.all.summary;
    var by = Object.keys(s.byMsg).map(function (k) { return esc(k) + ' ' + s.byMsg[k]; }).join(' · ');
    $('summary').innerHTML = '<div class="stats">' + stat('받은 줄', s.lines) + stat('정상', s.clean, 'good') + stat('경고', s.warned, s.warned ? 'bad' : '') +
      stat('오류', s.errors, s.errors ? 'bad' : '') + stat('합격', s.pass, 'good') + stat('불합격', s.fail, s.fail ? 'bad' : '') + stat('기대값 없음', s.unchecked) + '</div>' +
      '<p class="sub" style="margin-top:8px">메시지별 — ' + by + '</p>';
  }
  function renderLines() {
    var f = $('filter').value;
    var h = '<table><thead><tr><th>줄</th><th>라벨</th><th>메시지</th><th>길이</th><th>상태</th><th>판정</th><th>경고</th></tr></thead><tbody>';
    state.all.results.forEach(function (r, i) {
      var lv = Proto.levelOf(r);
      if (f === 'issue' && lv === 'ok') return;
      if (f === 'fail' && r.verdict !== 'fail') return;
      h += '<tr data-i="' + i + '" class="' + (i === state.sel ? 'sel' : '') + '"><td class="num">' + r.no + '</td><td>' + esc(r.label) + '</td><td>' + esc(r.msg ? r.msg.name : '—') +
        '</td><td class="num">' + r.bytes.length + '</td><td><span class="tag ' + lv + '">' + LV[lv] + '</span></td><td>' + verdictTag(r.verdict) +
        '</td><td class="wrap">' + esc(r.issues.filter(function (x) { return x.level !== 'info'; }).map(function (x) { return x.text; }).join(' / ')) + '</td></tr>';
    });
    $('lines').innerHTML = h + '</tbody></table>';
  }
  function verdictTag(v) { return v === 'pass' ? '<span class="tag pass">합격</span>' : v === 'fail' ? '<span class="tag fail">불합격</span>' : '<span class="tag none">기대값 없음</span>'; }
  function cellBg(owners) {
    if (!owners.length) return '';
    if (owners.length === 1) return 'background:' + PALETTE[owners[0] % 10];
    var step = 100 / owners.length;
    return 'background:linear-gradient(90deg,' + owners.map(function (o, k) { return PALETTE[o % 10] + ' ' + (k * step) + '% ' + ((k + 1) * step) + '%'; }).join(',') + ')';
  }
  function renderDetail() {
    var r = state.all && state.all.results[state.sel];
    if (!r) { $('detail').innerHTML = ''; return; }
    var lv = Proto.levelOf(r), m = r.msg;
    var h = '<div class="detail"><h3>' + r.no + '번 줄' + (r.label ? ' · ' + esc(r.label) : '') + ' — ' + esc(m ? m.name : '해석 못 함') + ' <span class="tag ' + lv + '">' + LV[lv] + '</span> ' + verdictTag(r.verdict) + '</h3>';
    if (m) {
      var len = m.length != null ? m.length + ' Byte <span class="src">메시지 표</span>' : m.calcLength != null ? m.calcLength + ' Byte <span class="src">항목 끝에서 계산</span>' : '정하지 않음';
      h += '<p class="sub">받은 길이 ' + r.bytes.length + ' Byte · 정의 길이 ' + len + '</p>';
    }
    if (r.issues.length) h += '<div class="' + (lv === 'error' ? 'warn' : lv === 'warn' ? 'warn' : 'note') + '"><ul>' + r.issues.map(function (x) { return '<li>[' + LV[x.level] + '] ' + esc(x.text) + '</li>'; }).join('') + '</ul></div>';
    // 바이트 지도
    h += '<h3>바이트 지도</h3><div class="bmap" id="bmap">' + r.map.map(function (b) {
      var nums = b.owners.map(function (o) { return o + 1; }).join('·');
      var tip = b.kind === 'id' ? '메시지 ID' : b.kind === 'undef' ? '미정의' : b.kind === 'extra' ? '정의 길이 밖' : b.owners.map(function (o) { return r.fields[o].name; }).join(', ');
      return '<div class="bcell k-' + b.kind + '" style="' + cellBg(b.owners) + '" title="Byte ' + b.i + ' — ' + esc(tip) + '"><span class="bi">' + b.i + '</span><span class="bh">' + b.hex + '</span><span class="bo">' +
        (b.kind === 'id' ? 'ID' : b.kind === 'undef' ? '미정의' : b.kind === 'extra' ? '넘침' : nums) + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="blegend"><span><i class="k-id"></i>메시지 ID</span><span><i class="k-undef"></i>미정의</span><span><i class="k-extra"></i>정의 길이 밖</span>' +
      r.fields.map(function (f, k) { return '<span><i style="background:' + PALETTE[k % 10] + '"></i>' + (k + 1) + ' ' + esc(f.name) + '</span>'; }).join('') + '</div>';
    if (r.fields.length) {
      h += '<h3>항목별 해석</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>항목</th><th>위치</th><th>원시 바이트</th><th>raw(16진)</th><th>raw</th><th>환산값 <span class="src">계산</span></th><th>열거</th><th>상태</th><th>기대값</th><th>판정</th></tr></thead><tbody>' +
        r.fields.map(function (f, k) {
          var cls = 'st-' + f.status + (f.check && !f.check.pass ? ' ck-fail' : '');
          return '<tr class="' + cls + '"><td><span class="tag" style="background:' + PALETTE[k % 10] + '">' + (k + 1) + '</span></td><td>' + esc(f.name) + '</td><td>' + esc(f.pos) + '</td><td class="mono">' + esc(f.bytesHex) +
            '</td><td class="mono">' + esc(f.rawHex) + '</td><td class="num">' + (f.raw == null ? '' : f.raw) + '</td><td class="num"><b>' + (f.value == null ? '—' : f.value) + '</b> ' + esc(f.unit) +
            '</td><td>' + esc(f.label == null ? '' : f.label) + '</td><td>' + (f.status === 'ok' ? '<span class="tag ok">정상</span>' : '<span class="tag warn">' + esc(Proto.ST_TEXT[f.status]) + '</span> <small>' + esc(f.note) + '</small>') +
            '</td><td>' + esc(f.check ? f.check.expect : '') + '</td><td>' + (f.check ? (f.check.pass ? '<span class="tag pass">합격</span>' : '<span class="tag fail">불합격</span> <small>' + esc(f.check.why) + '</small>') : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '<h3>Byte별 의미</h3><div class="tablewrap"><table><thead><tr><th>Byte</th><th>16진</th><th>2진</th><th>10진</th><th>속한 항목</th></tr></thead><tbody>' +
      r.map.map(function (b) {
        var who = b.kind === 'id' ? '메시지 ID' : b.kind === 'undef' ? '<b style="color:var(--danger)">미정의</b>' : b.kind === 'extra' ? '정의 길이 밖(해석 안 함)' :
          b.owners.map(function (o) { return esc(r.fields[o].name); }).join(', ') + (b.kind === 'partial' ? ' <small>(일부 bit 만 정의)</small>' : '');
        return '<tr><td class="num">' + b.i + '</td><td class="mono">' + b.hex + '</td><td class="mono">' + b.bin + '</td><td class="num">' + parseInt(b.hex, 16) + '</td><td>' + who + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('detail').innerHTML = h;
  }

  /* ---------- 파일 ---------- */
  function sheetBy(wb, names) {
    var n = wb.SheetNames.filter(function (s) { return names.some(function (k) { return s.replace(/\s/g, '').toLowerCase() === k; }); })[0];
    return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) : null;
  }
  function readSettings(rows) {
    var s = {};
    (rows || []).forEach(function (r) {
      var k = String(r['항목'] || r['설정'] || Object.values(r)[0] || '').replace(/\s/g, ''), v = r['값'] != null ? r['값'] : Object.values(r)[1];
      if (/ID시작/.test(k)) s.idStart = v; else if (/ID길이/.test(k)) s.idLen = v; else if (/Byte번호|번호시작/.test(k)) s.base = v;
    });
    return s;
  }
  function linesToText(lines) {
    return lines.map(function (l) {
      var ex = Object.keys(l.expect || {}).map(function (k) { return k + '=' + l.expect[k]; }).join('; ');
      return (l.label ? l.label + ' | ' : '') + l.hex + (ex ? ' => ' + ex : '');
    }).join('\n');
  }
  function readProtoFile(f) {
    var rd = new FileReader();
    rd.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var fields = sheetBy(wb, ['프로토콜', '항목정의', '정의', 'protocol', 'fields']) || XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
        var msgs = sheetBy(wb, ['메시지', '메시지종류', 'messages']) || [];
        var data = sheetBy(wb, ['수신데이터', '데이터', 'data']);
        setProto({ fields: fields, messages: msgs, settings: readSettings(sheetBy(wb, ['설정', 'settings'])) });
        if (data && data.length) $('data').value = linesToText(Proto.rowsToLines(data));
        state.sel = null;
        $('proto-status').insertAdjacentHTML('afterbegin', '<p class="sub">읽은 파일: ' + esc(f.name) + '</p>');
        if ($('data').value.trim()) run();
      } catch (err) { $('proto-status').innerHTML = '<div class="warn">파일을 읽지 못했습니다: ' + esc(err.message) + '</div>'; }
    };
    rd.readAsArrayBuffer(f);
  }
  function readDataFile(f) {
    var rd = new FileReader(), name = f.name.toLowerCase();
    var isBook = /\.(xlsx|xls)$/.test(name);
    rd.onload = function (e) {
      try {
        if (isBook) {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var rows = sheetBy(wb, ['수신데이터', '데이터', 'data']) || XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
          $('data').value = linesToText(Proto.rowsToLines(rows));
        } else {
          var txt = e.target.result;
          var first = txt.split(/\r?\n/)[0] || '';
          if (/\.csv$/.test(name) && /데이터|hex|raw|data|payload/i.test(first)) {
            var wb2 = XLSX.read(txt, { type: 'string' });
            $('data').value = linesToText(Proto.rowsToLines(XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: '', raw: false })));
          } else $('data').value = txt;
        }
        state.sel = null; run();
      } catch (err) { $('summary').innerHTML = '<div class="warn">데이터 파일을 읽지 못했습니다: ' + esc(err.message) + '</div>'; $('s-result').hidden = false; }
    };
    if (isBook) rd.readAsArrayBuffer(f); else rd.readAsText(f);
  }
  function dropzone(el, input, fn) {
    input.addEventListener('change', function (e) { if (e.target.files[0]) fn(e.target.files[0]); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach(function (t) { el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { el.addEventListener(t, function () { el.classList.remove('over'); }); });
    el.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); });
  }

  /* ---------- 엑셀 ---------- */
  function safeName(s, used) {
    var n = String(s).replace(/[\[\]:*?\/\\]/g, '_').slice(0, 28) || '시트', k = n, i = 2;
    while (used[k]) k = n.slice(0, 25) + '_' + i++;
    used[k] = 1; return k;
  }
  function exportXlsx() {
    if (!state.all) return;
    var x = Proto.exportRows(state.all), wb = XLSX.utils.book_new(), used = {};
    var add = function (rows, name) { XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(없음)']]), safeName(name, used)); };
    add(x.lines, '메시지요약'); add(x.detail, '항목해석'); add(x.warns, '경고목록');
    Object.keys(x.wide).forEach(function (k) { add(x.wide[k], '표_' + k); });
    add(state.fields, '프로토콜'); add(state.messages, '메시지');
    XLSX.writeFile(wb, '16진수해석_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  function template(withSample) {
    var s = Proto.sample(), wb = XLSX.utils.book_new();
    var fields = withSample ? Proto.canonical(s.fields) : [blankRow(Proto.FIELD_HEAD)];
    var msgs = withSample ? Proto.canonical(s.messages, true) : [blankRow(Proto.MSG_HEAD)];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fields, { header: Proto.FIELD_HEAD }), '프로토콜');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(msgs, { header: Proto.MSG_HEAD }), '메시지');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '값'], ['메시지 ID 시작 Byte', 0], ['메시지 ID 길이', 1], ['Byte 번호 시작(0 또는 1)', 0]]), '설정');
    var data = withSample ? Proto.parseLines(s.data).map(function (l) {
      var o = { 라벨: l.label, 데이터: l.hex };
      Object.keys(l.expect).forEach(function (k) { o['기대_' + k] = l.expect[k]; });
      return o;
    }) : [{ 라벨: '', 데이터: '', '기대_항목명': '' }];
    var heads = ['라벨', '데이터']; data.forEach(function (o) { Object.keys(o).forEach(function (k) { if (heads.indexOf(k) < 0) heads.push(k); }); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data, { header: heads }), '수신데이터');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['열', '설명'],
      ['메시지ID', '이 항목이 속한 메시지 ID. 16진수는 0x 를 붙인다(0x01). 메시지가 하나면 비워도 된다'],
      ['시작Byte · 시작bit', '설정의 Byte 번호 기준. bit 항목은 시작 bit(0 = 최하위 bit)를 함께 적는다'],
      ['길이 · 길이단위', '길이 숫자와 단위(Byte 또는 bit)'],
      ['바이트순서', '빅(Motorola) 또는 리틀(Intel). 비우면 빅'],
      ['부호', '있음(2의 보수) 또는 없음. 비우면 없음'],
      ['Resolution · Offset', '환산값 = raw × Resolution + Offset. 비우면 1 과 0'],
      ['최소 · 최대', '환산값의 허용 범위. 벗어나면 범위 이탈 경고'],
      ['무효값', '측정 불가를 뜻하는 raw 값(0xFF 등). 여러 개는 ; 로 구분'],
      ['열거값', '0=정지; 1=주행 형식'],
      ['기대값 · 허용오차', '모든 줄에 같은 기대값을 줄 때. 줄마다 다르면 수신데이터 시트의 「기대_항목명」 열에 적는다. 허용오차를 비우면 Resolution 의 절반'],
      ['수신데이터 시트', '데이터 열에 16진수, 라벨 열(선택), 기대_항목명 열(선택)']]), '작성법');
    XLSX.writeFile(wb, withSample ? '16진수해석_예제.xlsx' : '16진수해석_양식.xlsx');
  }

  /* ---------- AI(선택) ---------- */
  var KEY = 'build2611-09.ai';
  try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); if (saved.prov) $('ai-prov').value = saved.prov; if (saved.key) $('ai-key').value = saved.key; } catch (e) { /* 저장값 없음 */ }
  function saveKey() { try { localStorage.setItem(KEY, JSON.stringify({ prov: $('ai-prov').value, key: $('ai-key').value })); } catch (e) { /* 저장 불가 */ } }
  async function callAi(prompt) {
    var prov = $('ai-prov').value, key = $('ai-key').value.trim();
    if (prov === 'anthropic') {
      var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }) });
      var j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
      return j.content.map(function (c) { return c.text || ''; }).join('');
    }
    var r2 = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }) });
    var j2 = await r2.json(); if (!r2.ok) throw new Error((j2.error && j2.error.message) || r2.status);
    return j2.choices[0].message.content;
  }
  async function runAi() {
    var doc = $('ai-doc').value.trim(), out = $('ai-out');
    if (!$('ai-key').value.trim()) { out.innerHTML = '<div class="warn">API 키를 넣어 주세요. 키 없이도 위 표에 직접 적거나 붙여넣어 쓸 수 있습니다.</div>'; return; }
    if (!doc) { out.innerHTML = '<div class="warn">프로토콜 문서 글을 붙여 주세요.</div>'; return; }
    if (!confirm('붙여 넣은 문서 글이 외부 AI(' + $('ai-prov').selectedOptions[0].textContent + ')로 전송됩니다.\n사내 보안 규정상 외부로 보내도 되는 자료인지 확인하셨습니까?')) return;
    saveKey();
    out.innerHTML = '<p class="sub">AI 에게 묻는 중입니다…</p>';
    try {
      var rows = Proto.canonical(Proto.parseAiReply(await callAi(Proto.aiPrompt(doc, +$('set-base').value))));
      if (!rows.length) { out.innerHTML = '<div class="warn">AI 답에서 표를 찾지 못했습니다. 다시 시도하거나 표를 직접 적어 주세요.</div>'; return; }
      state.aiRows = rows;
      out.innerHTML = '<div class="ai-draft"><span class="badge">AI 초안 — 검토 필요</span><p class="sub">문서와 한 줄씩 대조한 뒤 넣으세요. AI 는 Byte 위치·배율을 틀릴 수 있습니다.</p><div class="tablewrap"><table><thead><tr>' +
        Proto.FIELD_HEAD.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + Proto.FIELD_HEAD.map(function (k) { return '<td>' + esc(r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div><div class="btnrow"><button class="btn" id="ai-apply">항목 정의 끝에 덧붙이기 (' + rows.length + '줄)</button></div></div>';
    } catch (err) { out.innerHTML = '<div class="warn">AI 호출 실패: ' + esc(err.message) + '</div>'; }
  }

  /* ---------- 연결 ---------- */
  bindEditor($('t-field'), function () { return state.fields; });
  bindEditor($('t-msg'), function () { return state.messages; });
  dropzone($('drop'), $('file'), readProtoFile);
  dropzone($('drop-data'), $('file-data'), readDataFile);
  $('btn-sample').addEventListener('click', function () {
    var s = Proto.sample(); setProto(s); $('data').value = s.data; state.sel = null; run();
    $('s-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('btn-template').addEventListener('click', function () { template(false); });
  $('btn-sample-xlsx').addEventListener('click', function () { template(true); });
  $('add-field').addEventListener('click', function () { $('proto-edit').open = true; state.fields.push(blankRow(Proto.FIELD_HEAD)); renderEditors(); });
  $('add-msg').addEventListener('click', function () { state.messages.push(blankRow(Proto.MSG_HEAD)); renderEditors(); });
  $('clear-proto').addEventListener('click', function () { if (confirm('항목 정의와 메시지 표를 모두 비울까요?')) { state.fields = []; state.messages = []; renderEditors(); changed(); } });
  $('btn-paste-table').addEventListener('click', function () {
    var rows = Proto.canonical(Proto.parseTable($('paste-table').value));
    if (!rows.length) { $('proto-status').innerHTML = '<div class="warn">표를 읽지 못했습니다 — 머리글 줄까지 함께 복사해 주세요.</div>'; return; }
    state.fields = rows; renderEditors(); $('proto-edit').open = true; changed();
  });
  ['set-idstart', 'set-idlen', 'set-base'].forEach(function (id) { $(id).addEventListener('change', changed); });
  $('btn-run').addEventListener('click', function () { state.sel = null; run(); });
  $('btn-clear-data').addEventListener('click', function () { $('data').value = ''; });
  $('filter').addEventListener('change', renderLines);
  $('lines').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-i]'); if (!tr) return; state.sel = +tr.dataset.i; renderLines(); renderDetail(); });
  $('btn-export').addEventListener('click', exportXlsx);
  $('btn-ai').addEventListener('click', runAi);
  $('ai-out').addEventListener('click', function (e) {
    if (e.target.id !== 'ai-apply' || !state.aiRows) return;
    state.fields = state.fields.concat(state.aiRows); state.aiRows = null; $('ai-out').innerHTML = '<div class="ok">덧붙였습니다. 표에서 검토해 주세요.</div>'; renderEditors(); $('proto-edit').open = true; changed();
  });
  renderEditors(); rebuild();
  window.__app = { state: state, template: template, exportXlsx: exportXlsx };     // 연기 테스트용
})();
