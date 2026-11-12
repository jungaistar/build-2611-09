/* build-2611-09 (v2) · 화면 — 그리기와 저장만 한다. 읽기 · 해석 · 검증은 js/hcespn.js(Hx) 에 있다. */
(function () {
  'use strict';
  var H = window.Hx, KEY = 'build-2611-09.v2';
  var DB = null;
  var ui = { page: 'dash', pid: '', pdraft: null, ppaste: null, pq: '', psender: '', hid: '', hdraft: null, hnotes: null, hq: '', raw: '', sender: '', items: [], sel: 0, pick: {}, confirm: '', showOld: false };
  var $ = function (q) { return document.querySelector(q); };
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2800); }
  function now() { return new Date().toISOString(); }
  function when(s) { return s ? h(String(s).replace('T', ' ').slice(0, 16)) : '-'; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; } catch (e) { toast('저장하지 못했습니다 — 브라우저 저장 공간을 확인해 주세요'); return false; } }
  function load() {
    DB = H.fromSaved(localStorage.getItem(KEY));
    if (!DB) { var s = H.sample(); DB = { version: 2, protocols: s.protocols, hcespns: s.hcespns, analyses: [], senders: H.SENDERS.slice(), is_sample: true }; save(); }   // 처음에는 기획서 예시로 보여 준다
  }
  function mt(v) { return v == null ? '--' : '0x' + H.hex2(v); }
  function opts(list, cur, first) { return (first == null ? '' : '<option value="">' + h(first) + '</option>') + list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + h(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + h(l) + '</option>'; }).join(''); }
  function active(list) { return list.filter(function (x) { return !x.archived; }); }
  function issBox(v) { return (v.errors.length ? '<div class="iss error" id="v-err"><b>저장할 수 없습니다</b><ul>' + v.errors.map(function (m) { return '<li>' + h(m) + '</li>'; }).join('') + '</ul></div>' : '') + (v.warnings.length ? '<div class="iss warn" id="v-warn"><b>확인해 주세요</b><ul>' + v.warnings.map(function (m) { return '<li>' + h(m) + '</li>'; }).join('') + '</ul></div>' : '') + (!v.errors.length && !v.warnings.length ? '<div class="iss ok" id="v-ok">검증을 통과했습니다.</div>' : ''); }
  function confirmBtn(key, label, act) { return ui.confirm === key ? '<button class="b dg" data-act="' + act + '">정말 ' + label + '</button><button class="b" data-act="cancel-confirm">취소</button>' : '<button class="b dg" data-act="ask" data-key="' + key + '">' + label + '</button>'; }

  /* ───────────── 대시보드 ───────────── */
  function dash() {
    var ps = active(DB.protocols), hs = active(DB.hcespns), an = DB.analyses, bySender = {};
    ps.forEach(function (p) { bySender[p.sender] = (bySender[p.sender] || 0) + 1; });
    var miss = {}; ps.forEach(function (p) { p.rows.forEach(function (r) { if (r.hcespn && !H.findDef(DB.hcespns, r.hcespn)) miss[r.hcespn] = 1; }); });
    var recentP = DB.protocols.slice().sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); }).slice(0, 6);
    var kpi = function (l, n, id, cls) { return '<div class="card kpi"><span>' + l + '</span><b id="' + id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + n + '</b></div>'; };
    return '<h2>대시보드</h2>' + (DB.is_sample ? '<div class="iss info" id="sample-note">지금 보이는 프로토콜 2개 · HCESPN 4개는 <b>기획서에 실린 예시</b>입니다. 그대로 「RAW DATA 해석」에서 예시 데이터를 풀어 볼 수 있습니다. 실제 정의를 등록하기 전에 지우려면 <button class="b" data-act="clear-sample">예시 지우기</button></div>' : '') +
      '<div class="kpis">' + kpi('등록된 프로토콜', ps.length, 'k-proto') + kpi('등록된 HCESPN', hs.length, 'k-hces') + kpi('RAW DATA 분석 이력', an.length, 'k-an') + kpi('HCESPN 미등록(프로토콜에서 참조)', Object.keys(miss).length, 'k-miss', Object.keys(miss).length ? 's-지연' : '') + '</div>' +
      '<div class="g3"><div class="card"><h3>등록된 프로토콜 현황</h3>' + (Object.keys(bySender).map(function (s) { return '<div class="mi"><b>' + h(s) + ' → Server</b><small>' + bySender[s] + '개 · ' + ps.filter(function (p) { return p.sender === s; }).map(function (p) { return mt(p.msg_type); }).join(' ') + '</small></div>'; }).join('') || '<p class="em">없음</p>') + '</div>' +
      '<div class="card"><h3>등록된 HCESPN 현황</h3>' + (Object.keys(H.TYPES).map(function (t) { var n = hs.filter(function (d) { return d.type === t; }).length; return n ? '<div class="mi"><b>' + H.TYPES[t] + '</b><small>' + n + '개</small></div>' : ''; }).join('') || '<p class="em">없음</p>') + (Object.keys(miss).length ? '<p class="s-지연" style="margin:8px 0 0">미등록: HCESPN ' + Object.keys(miss).join(', ') + '</p>' : '') + '</div>' +
      '<div class="card"><h3>최근 등록 및 수정된 프로토콜</h3>' + (recentP.map(function (p) { return '<div class="mi"><div><b>' + mt(p.msg_type) + ' ' + h(p.name) + '</b><small>' + h(p.sender) + ' · v' + h(p.version) + (p.archived ? ' · 이전 버전' : '') + ' · ' + when(p.updated_at) + '</small></div></div>'; }).join('') || '<p class="em">없음</p>') + '</div></div>' +
      '<div class="card"><h3>최근 RAW DATA 분석 이력</h3>' + histTable(an.slice(0, 8)) + '</div>' +
      '<div class="card"><h3>자료 보관</h3><p class="sub">등록정보는 이 브라우저에만 저장됩니다. 다른 PC 로 옮기거나 보관하려면 백업을 내려받으세요.</p><div class="bar" style="margin:0"><button class="b" data-act="backup">백업 내려받기(JSON)</button><button class="b" data-act="restore">백업 불러오기</button><button class="b" data-act="load-sample">기획서 예시 다시 넣기</button>' + confirmBtn('wipe', '전체 삭제', 'wipe') + '</div></div>';
  }
  function histTable(list) {
    if (!list.length) return '<p class="em" id="hist-empty">분석 이력이 없습니다 — 「RAW DATA 해석」에서 해석하면 여기에 쌓입니다</p>';
    return '<div class="wrap"><table id="hist"><tr><th>분석 일시</th><th>수신일자 · 시간</th><th>발신자</th><th>Type</th><th>적용 프로토콜</th><th>상태</th><th>RAW DATA</th><th></th></tr>' + list.map(function (a) { return '<tr><td>' + when(a.at) + '</td><td>' + h((a.recv_date || '') + ' ' + (a.recv_time || '')) + '</td><td>' + h(a.sender) + '</td><td class="mono">' + mt(a.msg_type) + '</td><td>' + (a.protocol_name ? h(a.protocol_name) + ' v' + h(a.protocol_version) : '<span class="st-error">없음</span>') + '</td><td class="st-' + a.status + '">' + H.ST[a.status] + '</td><td class="mono" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + h(a.raw.slice(0, 40)) + (a.raw.length > 40 ? '…' : '') + '</td><td><button class="b" data-act="re-analyze" data-id="' + a.id + '">다시 해석</button></td></tr>'; }).join('') + '</table></div>';
  }

  /* ───────────── 프로토콜 관리 ───────────── */
  function protocols() {
    var q = ui.pq.toLowerCase(), list = DB.protocols.filter(function (p) { return (ui.showOld || !p.archived) && (!ui.psender || p.sender === ui.psender) && (!q || (p.name + ' ' + mt(p.msg_type) + ' ' + p.rows.map(function (r) { return r.name + ' ' + r.hcespn; }).join(' ')).toLowerCase().indexOf(q) >= 0); });
    list.sort(function (a, b) { return a.sender.localeCompare(b.sender) || (a.msg_type - b.msg_type) || H.verKey(b.version).localeCompare(H.verKey(a.version)); });
    var left = '<div class="card"><div class="bar"><input type="search" data-ch="pq" placeholder="검색(이름 · Type · HCESPN)" value="' + h(ui.pq) + '" style="flex:1;min-width:0"></div><div class="bar"><select data-ch="psender">' + opts(DB.senders, ui.psender, '발신자 전체') + '</select><label class="ck"><input type="checkbox" data-ch="show-old"' + (ui.showOld ? ' checked' : '') + '> 이전 버전</label></div>' +
      '<ul class="plist" id="plist">' + (list.map(function (p) { return '<li class="' + (ui.pdraft && ui.pdraft.id === p.id ? 'on' : '') + '"><button data-act="p-open" data-id="' + p.id + '"><b class="mono">' + mt(p.msg_type) + '</b> ' + h(p.name) + '<small>' + h(p.sender) + ' → ' + h(p.receiver) + ' · v' + h(p.version) + (p.archived ? ' · 이전 버전' : '') + ' · ' + H.validateProtocol(p).length + ' bytes</small></button></li>'; }).join('') || '<li><p class="em">등록된 프로토콜이 없습니다</p></li>') + '</ul><div class="bar" style="margin:10px 0 0"><button class="b pri" data-act="p-new">프로토콜 등록</button></div></div>';
    var d = ui.pdraft, right;
    if (!d) right = '<div class="card"><h3>프로토콜</h3><p class="em">왼쪽에서 고르거나 「프로토콜 등록」을 누르세요</p></div>';
    else {
      var v = H.validateProtocol(d, DB.protocols.filter(function (p) { return p.id !== d.id || d.isNew; })), saved = !d.isNew;
      var b = function (k) { return 'data-pf="' + k + '"'; };
      right = '<div class="card" id="pform"><h3>' + (d.isNew ? '프로토콜 등록' : '프로토콜 수정') + (d.archived ? ' <small>이전 버전(보관)</small>' : '') + '</h3><div class="form">' +
        '<label class="full">프로토콜 이름 <input type="text" ' + b('name') + ' value="' + h(d.name) + '"></label>' +
        '<label>발신자 <input type="text" list="senders" ' + b('sender') + ' value="' + h(d.sender) + '"></label><label>수신자 <input type="text" ' + b('receiver') + ' value="' + h(d.receiver) + '"></label>' +
        '<label>RMS Message Type(HEX) <input type="text" class="mono" ' + b('msg_type') + ' value="' + (d.msg_type == null ? '' : H.hex2(d.msg_type)) + '" placeholder="A1" maxlength="4"></label><label>프로토콜 버전 <input type="text" ' + b('version') + ' value="' + h(d.version) + '"></label>' +
        '<label>등록일 <input type="text" value="' + (d.registered_at ? d.registered_at.slice(0, 10) : '저장할 때 기록') + '" disabled></label><label class="full">비고 <input type="text" ' + b('note') + ' value="' + h(d.note) + '"></label></div>' +
        '<datalist id="senders">' + DB.senders.map(function (s) { return '<option value="' + h(s) + '">'; }).join('') + '</datalist>' +
        '<h3 style="margin-top:14px">프로토콜 표 붙여넣기 <small>엑셀 · 문서에서 표를 끌어 복사(Ctrl+C)해 아래에 붙여 넣으세요(Ctrl+V)</small></h3><textarea class="mono paste" id="ppaste" placeholder="S.P	Length	Parameter Name	HCESPN	비고&#10;1	1 byte	RMS Message Type (= 0xA1)	16&#10;2-7	6 bytes	Date &amp; Time	90"></textarea><div class="bar" style="margin:8px 0 0"><button class="b" data-act="p-parse">표로 읽기</button><small>머리줄(S.P · Length · Parameter Name · HCESPN)까지 함께 복사하면 열 순서가 달라도 됩니다. 비고 열은 없어도 됩니다.</small></div>' +
        (ui.ppaste ? '<div class="iss ' + (ui.ppaste.ok ? 'info' : 'error') + '" id="p-parsed">' + (ui.ppaste.ok ? '<b>' + ui.ppaste.rows.length + '줄을 읽어 아래 표에 넣었습니다.</b> 저장 전에 확인해 주세요.' + (ui.ppaste.msgType != null ? ' Message Type ' + mt(ui.ppaste.msgType) + ' 를 찾았습니다.' : '') : '') + (ui.ppaste.issues.length ? '<ul>' + ui.ppaste.issues.map(function (i) { return '<li>' + h(i.msg) + '</li>'; }).join('') + '</ul>' : '') + '</div>' : '') +
        '<h3 style="margin-top:14px">Byte Mapping <small>전체 ' + v.length + ' bytes</small></h3><div class="wrap"><table class="grid" id="prows"><tr><th>S.P</th><th>Length(bytes)</th><th>Byte 범위</th><th>Parameter Name</th><th>HCESPN</th><th>비고</th><th>확인</th><th></th></tr>' + (d.rows.map(function (r, i) {
          var def = r.hcespn ? H.findDef(DB.hcespns, r.hcespn) : null, k = 'data-i="' + i + '"';
          return '<tr><td><input type="text" class="n" data-pr="sp" ' + k + ' value="' + h(r.sp) + '"></td><td><input type="text" class="n" data-pr="len" ' + k + ' value="' + h(r.len) + '"></td><td class="mono">' + (r.sp && r.len ? r.sp + (r.len > 1 ? '-' + (r.sp + r.len - 1) : '') : '') + '</td><td><input type="text" class="w" data-pr="name" ' + k + ' value="' + h(r.name) + '"></td><td><input type="text" class="n" data-pr="hcespn" ' + k + ' value="' + h(r.hcespn) + '"></td><td><input type="text" data-pr="note" ' + k + ' value="' + h(r.note) + '"></td><td>' + ((r.flags || []).map(function (f) { return '<span class="st-error">' + h(f) + '</span>'; }).join('<br>') || (r.hcespn ? (def ? (def.length !== r.len ? '<span class="st-error">HCESPN ' + h(r.hcespn) + ' 은 ' + def.length + ' bytes</span>' : '<span class="st-ok">HCESPN 등록됨</span>') : '<span class="st-warn">HCESPN 미등록</span>') : '')) + '</td><td><button class="b dg" data-act="p-delrow" ' + k + '>삭제</button></td></tr>';
        }).join('') || '<tr><td colspan="8" class="em">표를 붙여 넣거나 「줄 추가」로 넣으세요</td></tr>') + '</table></div><div class="bar" style="margin:8px 0 0"><button class="b" data-act="p-addrow">줄 추가</button></div>' + issBox(v) +
        '<div class="bar" style="margin:10px 0 0">' + (saved ? confirmBtn('pdel', '삭제', 'p-del') : '') + '<span class="sp"></span><button class="b" data-act="p-close">닫기</button>' + (saved ? '<button class="b" data-act="p-save"' + (v.errors.length ? ' disabled' : '') + ' title="내용만 고쳐 같은 버전으로 저장">이 버전 고쳐 저장</button><button class="b pri" data-act="p-save-new">새 버전으로 저장</button>' : '<button class="b pri" data-act="p-save"' + (v.errors.length ? ' disabled' : '') + '>저장</button>') + '</div>' +
        (saved ? '<p class="sub" style="margin:8px 0 0">「새 버전으로 저장」은 버전 칸의 값을 바꾼 뒤 누릅니다. 지금 버전은 「이전 버전」으로 보관되고, 과거 RAW DATA 를 이전 버전으로 다시 해석할 수 있습니다.</p>' : '') + '</div>';
    }
    return '<h2>프로토콜 관리</h2><div class="split"><div>' + left + '</div><div style="min-width:0">' + right + '</div></div>';
  }
  function readPForm() {
    var d = ui.pdraft; if (!d || !$('#pform')) return;
    [].forEach.call(document.querySelectorAll('#pform [data-pf]'), function (el) { var k = el.dataset.pf, v = el.value.trim(); if (k === 'msg_type') { var m = v.replace(/^0x/i, ''); d.msg_type = /^[0-9a-fA-F]{1,2}$/.test(m) ? parseInt(m, 16) : null; } else d[k] = v; });
    [].forEach.call(document.querySelectorAll('#prows [data-pr]'), function (el) { var r = d.rows[+el.dataset.i], k = el.dataset.pr, v = el.value.trim(); if (!r) return; if (k === 'sp') { var m = v.match(/^(\d+)/); r.sp = m ? +m[1] : null; } else if (k === 'len') r.len = /^\d+$/.test(v) ? +v : null; else r[k] = v; });
  }

  /* ───────────── HCESPN 관리 ───────────── */
  function hcespn() {
    var q = ui.hq.toLowerCase(), list = DB.hcespns.filter(function (d) { return (ui.showOld || !d.archived) && (!q || (d.no + ' ' + d.name + ' ' + (d.fields || []).map(function (f) { return f.name; }).join(' ')).toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return (+a.no || 0) - (+b.no || 0) || H.verKey(b.version).localeCompare(H.verKey(a.version)); });
    var left = '<div class="card"><div class="bar"><input type="search" data-ch="hq" placeholder="검색(번호 · 이름)" value="' + h(ui.hq) + '" style="flex:1;min-width:0"></div><div class="bar"><label class="ck"><input type="checkbox" data-ch="show-old"' + (ui.showOld ? ' checked' : '') + '> 이전 버전</label></div><ul class="plist" id="hlist">' + (list.map(function (d) { return '<li class="' + (ui.hdraft && ui.hdraft.id === d.id ? 'on' : '') + '"><button data-act="h-open" data-id="' + d.id + '"><b>HCESPN ' + h(d.no) + '</b> ' + h(d.name) + '<small>' + (H.TYPES[d.type] || '') + ' · ' + h(d.length) + ' bytes · v' + h(d.version) + (d.archived ? ' · 이전 버전' : '') + '</small></button></li>'; }).join('') || '<li><p class="em">등록된 HCESPN 이 없습니다</p></li>') + '</ul><div class="bar" style="margin:10px 0 0"><button class="b pri" data-act="h-new">HCESPN 등록</button></div></div>';
    var d = ui.hdraft, right;
    if (!d) right = '<div class="card"><h3>HCESPN</h3><p class="em">왼쪽에서 고르거나 「HCESPN 등록」을 누르세요</p></div>';
    else {
      var v = H.validateDef(d, DB.hcespns.filter(function (x) { return x.id !== d.id || d.isNew; })), saved = !d.isNew, b = function (k) { return 'data-hf="' + k + '"'; };
      var used = active(DB.protocols).filter(function (p) { return p.rows.some(function (r) { return String(r.hcespn) === String(d.no); }); });
      right = '<div class="card" id="hform"><h3>' + (d.isNew ? 'HCESPN 등록' : 'HCESPN 수정') + (d.archived ? ' <small>이전 버전(보관)</small>' : '') + '</h3>' +
        '<h3 style="font-size:13px">1단계 — 원문 붙여넣기 <small>HCESPN 문서의 해당 부분을 복사해 붙여 넣으면 자동으로 구조화합니다(결과는 반드시 확인)</small></h3><textarea class="mono paste" id="hpaste" placeholder="HCESPN 127 — Total Shift Mode &amp; Actual Gear Distribution&#10;Data Length: 24 bytes&#10;Resolution: 1 sec/bit&#10;Offset: 0&#10;Endianness: Little Endian&#10;Byte 1-4: Shift Mode – Manual&#10;Byte 5-8: Shift Mode – Auto"></textarea><div class="bar" style="margin:8px 0 0"><button class="b" data-act="h-parse">2단계 — 자동 구조화</button></div>' +
        (ui.hnotes ? '<div class="iss ' + (ui.hnotes.length ? 'warn' : 'info') + '" id="h-parsed"><b>원문을 읽어 아래 칸에 넣었습니다. 3단계 — 내용을 확인하고 고친 뒤 저장하세요.</b>' + (ui.hnotes.length ? '<ul>' + ui.hnotes.map(function (n) { return '<li>' + h(n) + '</li>'; }).join('') + '</ul>' : '') + '</div>' : '') +
        '<div class="form" style="margin-top:12px"><label>HCESPN 번호 <input type="text" ' + b('no') + ' value="' + h(d.no) + '"></label><label class="full">Parameter Name <input type="text" ' + b('name') + ' value="' + h(d.name) + '"></label>' +
        '<label>Data Length(bytes) <input type="text" ' + b('length') + ' value="' + h(d.length) + '"></label><label>Type <select ' + b('type') + ' data-rr="1">' + opts(Object.keys(H.TYPES).map(function (k) { return [k, H.TYPES[k]]; }), d.type) + '</select></label><label>Endianness <select ' + b('endian') + '>' + opts([['LE', 'Little Endian'], ['BE', 'Big Endian']], d.endian) + '</select></label>' +
        '<label>Resolution <input type="text" ' + b('resolution') + ' value="' + h(d.resolution) + '"></label><label>Offset <input type="text" ' + b('offset') + ' value="' + h(d.offset) + '"></label><label>Unit <input type="text" ' + b('unit') + ' value="' + h(d.unit) + '"></label>' +
        '<label>Data Range 최소 <input type="text" ' + b('min') + ' value="' + h(d.min) + '"></label><label>Data Range 최대 <input type="text" ' + b('max') + ' value="' + h(d.max) + '"></label><label>HCEPGN <input type="text" ' + b('hcepgn') + ' value="' + h(d.hcepgn) + '"></label><label>버전 <input type="text" ' + b('version') + ' value="' + h(d.version) + '"></label>' +
        (d.type === 'formula' ? '<label class="full">환산식 — 쓸 수 있는 이름 RAW · RES · OFFSET, 사칙연산과 괄호 <input type="text" class="mono" ' + b('formula') + ' value="' + h(d.formula) + '" placeholder="RAW * RES + OFFSET"></label>' : '') +
        (d.type === 'enum' ? '<label class="full">열거값 — 한 줄에 하나, 「HEX = 이름」 <textarea class="mono" ' + b('enums') + '>' + h(Object.keys(d.enums || {}).map(function (k) { return k + ' = ' + d.enums[k]; }).join('\n')) + '</textarea></label>' : '') +
        '<label class="full">비고 <input type="text" ' + b('note') + ' value="' + h(d.note) + '"></label></div>' +
        (d.type === 'array' ? '<h3 style="margin-top:14px">Byte 별 데이터 구조(하위 필드) <small>Byte 는 이 HCESPN 안에서 1 부터 · 비운 Resolution · Offset · Unit 은 위 값을 씁니다</small></h3><div class="wrap"><table class="grid" id="hfields"><tr><th>시작 Byte</th><th>Length</th><th>Parameter</th><th>Resolution</th><th>Offset</th><th>Unit</th><th>최소</th><th>최대</th><th></th></tr>' + (d.fields.map(function (f, i) { var k = 'data-i="' + i + '"', c = function (key, cls) { return '<td><input type="text" class="' + cls + '" data-hr="' + key + '" ' + k + ' value="' + h(f[key]) + '"></td>'; }; return '<tr>' + c('start', 'n') + c('len', 'n') + c('name', 'w') + c('resolution', 'n') + c('offset', 'n') + c('unit', 'n') + c('min', 'n') + c('max', 'n') + '<td><button class="b dg" data-act="h-delrow" ' + k + '>삭제</button></td></tr>'; }).join('') || '<tr><td colspan="9" class="em">하위 필드가 없습니다</td></tr>') + '</table></div><div class="bar" style="margin:8px 0 0"><button class="b" data-act="h-addrow">필드 추가</button><button class="b" data-act="h-fill">4 bytes 씩 자동 나누기</button></div>' : '') +
        (d.type === 'datetime' ? '<p class="sub" style="margin:10px 0 0">날짜 · 시간형: Byte 1 Year(2000 + RAW) · 2 Month(1~12) · 3 Day(1~31) · 4 Hour(0~23) · 5 Minute(0~59) · 6 Second(0~59). 범위를 벗어나면 날짜로 환산하지 않습니다.</p>' : '') +
        '<h3 style="margin-top:14px">특수조건 <small>특정 Byte 가 특정 HEX 값이면 수치 대신 표시</small></h3><div class="wrap"><table class="grid" id="hspecial"><tr><th>적용 범위</th><th>Byte(범위 안에서)</th><th>HEX 값</th><th>표시</th><th></th></tr>' + (d.special.map(function (s, i) { var k = 'data-i="' + i + '"'; return '<tr><td><select data-hs="scope" ' + k + '>' + opts([['확인 필요', '확인 필요(적용 안 함)'], ['each', '하위 필드마다'], ['all', '이 HCESPN 전체']], s.scope) + '</select></td><td><input type="text" class="n" data-hs="byte" ' + k + ' value="' + h(s.byte) + '"></td><td><input type="text" class="n mono" data-hs="equals" ' + k + ' value="' + H.hex2(s.equals || 0) + '"></td><td><input type="text" data-hs="label" ' + k + ' value="' + h(s.label) + '"></td><td><button class="b dg" data-act="h-delspecial" ' + k + '>삭제</button></td></tr>'; }).join('') || '<tr><td colspan="5" class="em">특수조건이 없습니다</td></tr>') + '</table></div><div class="bar" style="margin:8px 0 0"><button class="b" data-act="h-addspecial">특수조건 추가</button></div>' +
        (used.length ? '<p class="sub" style="margin:10px 0 0">이 번호를 쓰는 프로토콜: ' + used.map(function (p) { return mt(p.msg_type) + ' ' + h(p.name); }).join(', ') + '</p>' : '') + issBox(v) +
        '<div class="bar" style="margin:10px 0 0">' + (saved ? confirmBtn('hdel', '삭제', 'h-del') : '') + '<span class="sp"></span><button class="b" data-act="h-close">닫기</button>' + (saved ? '<button class="b" data-act="h-save"' + (v.errors.length ? ' disabled' : '') + '>이 버전 고쳐 저장</button><button class="b pri" data-act="h-save-new">새 버전으로 저장</button>' : '<button class="b pri" data-act="h-save"' + (v.errors.length ? ' disabled' : '') + '>4단계 — 저장</button>') + '</div></div>';
    }
    return '<h2>HCESPN 관리</h2><div class="split"><div>' + left + '</div><div style="min-width:0">' + right + '</div></div>';
  }
  function n(v) { var s = String(v == null ? '' : v).replace(/,/g, '').trim(); if (s === '') return null; var x = Number(s); return isFinite(x) ? x : null; }
  function readHForm() {
    var d = ui.hdraft; if (!d || !$('#hform')) return;
    [].forEach.call(document.querySelectorAll('#hform [data-hf]'), function (el) { var k = el.dataset.hf, v = el.value; if (['length', 'resolution', 'offset', 'min', 'max'].indexOf(k) >= 0) d[k] = n(v); else if (k === 'enums') { d.enums = {}; v.split(/\r?\n/).forEach(function (l) { var m = l.match(/^\s*(?:0x)?([0-9A-Fa-f]{2,})\s*[=:]\s*(.+)$/); if (m) d.enums[m[1].toUpperCase()] = m[2].trim(); }); } else d[k] = v.trim(); });
    [].forEach.call(document.querySelectorAll('#hfields [data-hr]'), function (el) { var f = d.fields[+el.dataset.i], k = el.dataset.hr; if (!f) return; f[k] = k === 'name' || k === 'unit' ? el.value.trim() : n(el.value); });
    [].forEach.call(document.querySelectorAll('#hspecial [data-hs]'), function (el) { var s = d.special[+el.dataset.i], k = el.dataset.hs; if (!s) return; if (k === 'byte') s.byte = n(el.value); else if (k === 'equals') s.equals = /^[0-9a-fA-F]{1,2}$/.test(el.value.trim()) ? parseInt(el.value.trim(), 16) : 0; else s[k] = el.value.trim(); });
  }

  /* ───────────── RAW DATA 해석 ───────────── */
  function ctx(item) { return { protocols: DB.protocols, hcespns: DB.hcespns, sender: ui.sender, protocolId: item && ui.pick[item.key] }; }
  function run(rows) {
    ui.items = rows.map(function (r, i) { var it = { key: 'r' + i, raw: r.raw, recv_date: r.recv_date || '', recv_time: r.recv_time || '', row: r.row }; it.result = H.analyze(r.raw, ctx(it)); return it; });
    ui.sel = 0; ui.pick = {};
    ui.items.forEach(function (it) { var r = it.result; DB.analyses.unshift({ id: H.uid('a'), at: now(), recv_date: it.recv_date, recv_time: it.recv_time, sender: r.protocol ? r.protocol.sender : ui.sender, raw: r.raw || it.raw, msg_type: r.msg_type, protocol_id: r.protocol ? r.protocol.id : '', protocol_name: r.protocol ? r.protocol.name : '', protocol_version: r.protocol ? r.protocol.version : '', status: r.status, summary: r.issues.length ? r.issues[0].msg : '정상' }); });
    if (DB.analyses.length > 500) DB.analyses.length = 500;
    save();
  }
  function analyze() {
    var sm = DB.is_sample ? H.sample().raws : null;
    var out = '<h2>RAW DATA 해석</h2><div class="card"><div class="form"><label>발신자 <select data-ch="sender">' + opts(DB.senders, ui.sender, '전체(Message Type 으로만 찾기)') + '</select></label></div>' +
      '<textarea class="mono paste" id="raw" placeholder="HEX RAW DATA 를 붙여 넣으세요. 여러 건이면 한 줄에 하나씩.&#10;예) A11A0B0C0E1E2D3C000000…">' + h(ui.raw) + '</textarea>' +
      '<div class="bar" style="margin:8px 0 0"><button class="b pri" data-act="a-run">해석하기</button><button class="b" data-act="a-xlsx">Excel 업로드(수신일자 · 수신 시간 · 메시지)</button><button class="b" data-act="a-tpl">업로드 양식</button>' + (sm ? '<button class="b" data-act="a-sample">예시 데이터 넣기</button>' : '') + '<span class="sp"></span><small>공백 · 줄바꿈 · 0x 는 자동으로 정리합니다</small></div></div>';
    if (!ui.items.length) return out;
    var cnt = { ok: 0, warn: 0, error: 0 }; ui.items.forEach(function (it) { cnt[it.result.status]++; });
    if (ui.items.length > 1) out += '<div class="card"><h3>분석 ' + ui.items.length + '건 <small><span class="st-ok">정상 ' + cnt.ok + '</span> · <span class="st-warn">확인 ' + cnt.warn + '</span> · <span class="st-error">오류 ' + cnt.error + '</span> — 오류 행이 있어도 나머지는 계속 분석합니다</small></h3><div class="wrap rlist"><table id="a-list"><tr><th>No</th><th>수신일자 · 시간</th><th>Type</th><th>프로토콜</th><th>Bytes</th><th>상태</th><th>첫 알림</th></tr>' + ui.items.map(function (it, i) { var r = it.result; return '<tr class="' + (i === ui.sel ? 'on' : '') + '" data-act="a-sel" data-i="' + i + '"><td>' + (i + 1) + '</td><td>' + h(it.recv_date + ' ' + it.recv_time) + '</td><td class="mono">' + mt(r.msg_type) + '</td><td>' + (r.protocol ? h(r.protocol.name) + ' v' + h(r.protocol.version) : '-') + '</td><td>' + r.bytes.length + '</td><td class="st-' + r.status + '">' + H.ST[r.status] + '</td><td>' + h(r.issues[0] ? r.issues[0].msg : '') + '</td></tr>'; }).join('') + '</table></div></div>';
    var it = ui.items[ui.sel], r = it.result;
    out += '<div class="card" id="a-result"><div class="bar" style="margin:0 0 8px"><h3 style="margin:0">' + (ui.items.length > 1 ? (ui.sel + 1) + '번 · ' : '') + '해석 결과 <span class="st-' + r.status + '">' + H.ST[r.status] + '</span></h3><span class="sp"></span>' + (r.versions.length > 1 ? '<label class="ck">프로토콜 버전 <select data-ch="a-version">' + opts(r.versions.map(function (v) { return [v.id, v.sender + ' · v' + v.version + ' · ' + v.name]; }), r.protocol && r.protocol.id) + '</select></label>' : '') + '<button class="b" data-act="a-export">Excel 다운로드</button></div>' +
      '<p style="margin:0 0 10px">Message Type <b class="mono">' + mt(r.msg_type) + '</b> · ' + (r.protocol ? '적용 프로토콜 <b>' + h(r.protocol.name) + '</b> (' + h(r.protocol.sender) + ' → ' + h(r.protocol.receiver) + ', v' + h(r.protocol.version) + ')' : '<span class="st-error">적용할 프로토콜 없음</span>') + ' · ' + r.bytes.length + ' bytes' + (r.expected != null ? ' / 프로토콜 ' + r.expected + ' bytes' : '') + (it.recv_date ? ' · 수신 ' + h(it.recv_date + ' ' + it.recv_time) : '') + '</p>';
    var groups = { error: [], warn: [], info: [] }; r.issues.forEach(function (i) { (groups[i.level] || groups.info).push(i.msg); });
    ['error', 'warn', 'info'].forEach(function (lv) { if (groups[lv].length) out += '<div class="iss ' + lv + '" id="a-' + lv + '"><b>' + { error: '오류', warn: '확인 필요', info: '알림' }[lv] + '</b><ul>' + groups[lv].map(function (m) { return '<li>' + h(m) + '</li>'; }).join('') + '</ul></div>'; });
    if (r.bytes.length) {
      out += '<h3>RAW DATA Viewer <small>Byte 에 마우스를 올리면 해석이 보입니다 · 같은 Parameter 의 Byte 가 함께 강조됩니다</small></h3><div class="hexv" id="hexv">' + r.bytes.map(function (b, i) { var m = r.map[i], prm = m ? r.params[m.p] : null, sub = m && m.s >= 0 ? prm.subs[m.s] : null, bad = sub ? sub.status === 'error' : prm ? prm.status === 'error' && !prm.subs.length : false; return '<span class="hb ' + (m ? 'c' + (m.p % 8) : 'undef') + (bad ? ' err' : '') + '" data-b="' + i + '">' + H.hex2(b) + '<small>' + (i + 1) + '</small></span>'; }).join('') + '</div>' +
        '<div class="legend">' + r.params.map(function (p, i) { return '<span><i class="c' + (i % 8) + '"></i>' + h(p.name) + '</span>'; }).join('') + (r.map.some(function (m) { return !m; }) ? '<span><i class="hb undef" style="min-width:12px;padding:0"></i>정의되지 않은 Byte</span>' : '') + '</div>';
      out += '<h3 style="margin-top:16px">상세 해석 결과표</h3><div class="wrap"><table id="a-table"><tr><th>Start Position</th><th>Length</th><th>Parameter Name</th><th>HCESPN</th><th>RAW HEX</th><th>Decimal Value</th><th>Physical Value</th><th>Unit</th><th>Status</th></tr>' + (r.params.map(function (p) {
        var head = '<tr class="fieldhead"><td>' + p.sp + (p.len > 1 ? '-' + (p.sp + p.len - 1) : '') + '</td><td>' + p.len + '</td><td>' + h(p.name) + '</td><td>' + h(p.hcespn) + (p.def_version ? ' <small>v' + h(p.def_version) + '</small>' : '') + '</td><td class="mono" style="max-width:240px;overflow-wrap:anywhere">' + (p.subs.length > 1 ? '<small>' + h(p.raw.slice(0, 35)) + (p.raw.length > 35 ? '…' : '') + '</small>' : h(p.raw)) + '</td>';
        if (!p.subs.length) return head + '<td></td><td></td><td></td><td class="st-' + p.status + '">' + H.ST[p.status] + (p.note ? '<br><small>' + h(p.note) + '</small>' : '') + '</td></tr>';
        if (p.subs.length === 1) { var s = p.subs[0]; return head + '<td class="mono">' + (s.dec == null ? '' : s.dec) + '</td><td><b>' + h(s.text) + '</b></td><td>' + h(s.unit) + '</td><td class="st-' + s.status + '">' + H.ST[s.status] + (s.note ? '<br><small>' + h(s.note) + '</small>' : '') + '</td></tr>'; }
        var first = p.subs[0], rest = p.subs, lead = '';
        if (!first.child && first.len === p.len) { lead = head + '<td></td><td><b>' + h(first.text) + '</b></td><td></td><td class="st-' + p.status + '">' + H.ST[p.status] + (first.note ? '<br><small>' + h(first.note) + '</small>' : '') + '</td></tr>'; rest = p.subs.slice(1); }
        else lead = head + '<td></td><td></td><td></td><td class="st-' + p.status + '">' + H.ST[p.status] + '</td></tr>';
        return lead + rest.map(function (s) { return '<tr class="child"><td>' + s.start + (s.len > 1 ? '-' + (s.start + s.len - 1) : '') + '</td><td>' + s.len + '</td><td>' + h(s.name) + '</td><td></td><td class="mono">' + h(s.raw) + '</td><td class="mono">' + (s.dec == null ? '' : s.dec) + '</td><td>' + h(s.value == null || s.child ? s.text : H.fmtNum(s.value)) + '</td><td>' + h(s.unit) + '</td><td class="st-' + s.status + '">' + H.ST[s.status] + (s.note ? ' <small>' + h(s.note) + '</small>' : '') + '</td></tr>'; }).join('');
      }).join('') || '<tr><td colspan="9" class="em">해석한 항목이 없습니다</td></tr>') + '</table></div>';
    }
    return out + '</div>';
  }
  function tipFor(i) {
    var it = ui.items[ui.sel]; if (!it) return ''; var r = it.result, m = r.map[i], b = r.bytes[i];
    if (!m) return '<dl><dt>Byte Position</dt><dd>' + (i + 1) + '</dd><dt>RAW HEX</dt><dd>' + H.hex2(b) + '</dd><dt>상태</dt><dd>정의되지 않은 영역</dd></dl>';
    var p = r.params[m.p], s = m.s >= 0 ? p.subs[m.s] : null, st = s ? s.start : p.sp, ln = s ? s.len : p.len;
    return '<b>' + h(s ? s.name : p.name) + '</b><dl><dt>Byte Position</dt><dd>' + st + (ln > 1 ? '-' + (st + ln - 1) : '') + ' (지금 ' + (i + 1) + ')</dd><dt>RAW DATA</dt><dd class="mono">' + h(s ? s.raw : p.raw.slice(0, 60)) + '</dd><dt>Parameter</dt><dd>' + h(p.name) + '</dd><dt>HCESPN</dt><dd>' + (h(p.hcespn) || '-') + (p.def_version ? ' v' + h(p.def_version) : '') + '</dd>' + (s && s.formula ? '<dt>환산식</dt><dd>' + h(s.formula) + '</dd>' : '') + '<dt>해석 결과</dt><dd><b>' + (s && s.text ? h(s.text) : '환산값 없음') + '</b></dd><dt>검증</dt><dd>' + H.ST[s ? s.status : p.status] + ((s ? s.note : p.note) ? ' — ' + h(s ? s.note : p.note) : '') + '</dd></dl>';
  }

  /* ───────────── 그리기 · 동작 ───────────── */
  var pages = { dash: dash, protocols: protocols, hcespn: hcespn, analyze: analyze };
  function render() {
    var v = $('#view'), top = v.scrollTop, keep = {}; ['ppaste', 'hpaste'].forEach(function (id) { var el = $('#' + id); if (el) keep[id] = el.value; });
    v.innerHTML = pages[ui.page](); v.scrollTop = top; Object.keys(keep).forEach(function (id) { var el = $('#' + id); if (el) el.value = keep[id]; });
    [].forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('on', b.dataset.p === ui.page); });
    document.body.dataset.page = ui.page; $('#tip').hidden = true;
  }
  function go(p) { ui.page = p; ui.confirm = ''; if (location.hash !== '#' + p) history.replaceState(null, '', '#' + p); render(); $('#view').scrollTop = 0; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function pick(accept, cb) { var f = $('#fileany'); f.value = ''; f.accept = accept; f.onchange = function () { if (f.files[0]) cb(f.files[0]); }; f.click(); }
  function touchReal() { DB.is_sample = false; }
  function saveVersioned(listName, draft, asNew, validate) {
    var list = DB[listName], d = H.clone(draft), wasNew = d.isNew; delete d.isNew; d.updated_at = now();
    (d.rows || []).forEach(function (r) { delete r.flags; });
    if (wasNew) { d.id = H.uid(listName[0]); d.registered_at = now(); list.push(d); }
    else if (asNew) {
      var old = list.filter(function (x) { return x.id === d.id; })[0];
      if (String(old.version) === String(d.version)) { toast('버전 칸의 값을 바꾼 뒤 「새 버전으로 저장」을 눌러 주세요(지금 v' + old.version + ')'); return null; }
      d.id = H.uid(listName[0]); d.registered_at = now(); d.archived = false;
      var v = validate(d, list.filter(function (x) { return x.id !== old.id; })); if (v.errors.length) { toast(v.errors[0]); return null; }
      old.archived = true; old.updated_at = now(); list.push(d);
    } else { var i = list.findIndex(function (x) { return x.id === d.id; }); list[i] = d; }
    touchReal(); save(); return d;
  }
  var acts = {
    ask: function (el) { ui.confirm = el.dataset.key; render(); }, 'cancel-confirm': function () { ui.confirm = ''; render(); },
    'clear-sample': function () { DB.protocols = []; DB.hcespns = []; DB.analyses = []; DB.is_sample = false; ui.pdraft = ui.hdraft = null; ui.items = []; save(); toast('예시를 지웠습니다. 프로토콜과 HCESPN 을 등록해 주세요'); render(); },
    'load-sample': function () { var s = H.sample(), n = 0; s.protocols.forEach(function (p) { if (!DB.protocols.some(function (x) { return x.id === p.id; })) { DB.protocols.push(p); n++; } }); s.hcespns.forEach(function (d) { if (!DB.hcespns.some(function (x) { return x.id === d.id; })) { DB.hcespns.push(d); n++; } }); if (!active(DB.protocols).some(function (p) { return !/^p-(a1|b1)$/.test(p.id); })) DB.is_sample = true; save(); toast(n ? '기획서 예시 ' + n + '건을 넣었습니다' : '예시가 이미 들어 있습니다'); render(); },
    backup: function () { download(new Blob([JSON.stringify(Object.assign({ exported_at: now() }, DB))], { type: 'application/json' }), 'HexProtocolAnalyzer_백업_' + now().slice(0, 10) + '.json'); },
    restore: function () { pick('.json,application/json', function (f) { f.text().then(function (t) { var o = H.fromSaved(t); if (!o) return toast('백업 파일 모양이 아닙니다'); DB = o; ui.pdraft = ui.hdraft = null; ui.items = []; save(); toast('백업을 불러왔습니다(프로토콜 ' + DB.protocols.length + ' · HCESPN ' + DB.hcespns.length + ')'); render(); }); }); },
    wipe: function () { DB = { version: 2, protocols: [], hcespns: [], analyses: [], senders: H.SENDERS.slice(), is_sample: false }; ui.pdraft = ui.hdraft = null; ui.items = []; ui.confirm = ''; save(); toast('모두 지웠습니다'); render(); },
    're-analyze': function (el) { var a = DB.analyses.filter(function (x) { return x.id === el.dataset.id; })[0]; ui.raw = a.raw; ui.sender = ''; var it = { key: 'r0', raw: a.raw, recv_date: a.recv_date, recv_time: a.recv_time }; ui.pick = {}; if (a.protocol_id && DB.protocols.some(function (p) { return p.id === a.protocol_id; })) ui.pick.r0 = a.protocol_id; it.result = H.analyze(a.raw, ctx(it)); ui.items = [it]; ui.sel = 0; go('analyze'); },

    'p-new': function () { ui.pdraft = H.blankProtocol({ isNew: true }); ui.ppaste = null; render(); },
    'p-open': function (el) { ui.pdraft = H.clone(DB.protocols.filter(function (p) { return p.id === el.dataset.id; })[0]); ui.ppaste = null; ui.confirm = ''; render(); },
    'p-close': function () { ui.pdraft = null; ui.ppaste = null; render(); },
    'p-parse': function () { readPForm(); var t = $('#ppaste').value, r = H.parseProtocolTable(t); ui.ppaste = r; if (r.ok) { ui.pdraft.rows = r.rows; if (r.msgType != null && ui.pdraft.msg_type == null) ui.pdraft.msg_type = r.msgType; if (!ui.pdraft.name && r.rows.length) ui.pdraft.name = (r.rows[r.rows.length - 1].name || '').replace(/\s*\(.*\)\s*$/, ''); } render(); },
    'p-addrow': function () { readPForm(); var d = ui.pdraft, end = d.rows.reduce(function (a, r) { return Math.max(a, (r.sp || 0) + (r.len || 0) - 1); }, 0); d.rows.push({ sp: end + 1, len: 1, name: '', hcespn: '', note: '' }); render(); },
    'p-delrow': function (el) { readPForm(); ui.pdraft.rows.splice(+el.dataset.i, 1); render(); },
    'p-save': function () { readPForm(); var d = ui.pdraft; if (d.sender && DB.senders.indexOf(d.sender) < 0) DB.senders.push(d.sender); var v = H.validateProtocol(d, DB.protocols.filter(function (p) { return p.id !== d.id || d.isNew; })); if (v.errors.length) { render(); return toast(v.errors[0]); } var s = saveVersioned('protocols', d, false, H.validateProtocol); if (s) { ui.pdraft = H.clone(s); ui.ppaste = null; toast('프로토콜을 저장했습니다 — ' + mt(s.msg_type) + ' v' + s.version); render(); } },
    'p-save-new': function () { readPForm(); var s = saveVersioned('protocols', ui.pdraft, true, H.validateProtocol); if (s) { ui.pdraft = H.clone(s); toast('새 버전 v' + s.version + ' 으로 저장했습니다. 이전 버전은 보관됩니다'); } render(); },
    'p-del': function () { var id = ui.pdraft.id; DB.protocols = DB.protocols.filter(function (p) { return p.id !== id; }); ui.pdraft = null; ui.confirm = ''; save(); toast('삭제했습니다. 이 프로토콜로 분석한 이력은 남지만 같은 버전으로 다시 해석할 수는 없습니다'); render(); },

    'h-new': function () { ui.hdraft = H.blankDef({ isNew: true }); ui.hnotes = null; render(); },
    'h-open': function (el) { ui.hdraft = H.clone(DB.hcespns.filter(function (d) { return d.id === el.dataset.id; })[0]); ui.hnotes = null; ui.confirm = ''; render(); },
    'h-close': function () { ui.hdraft = null; ui.hnotes = null; render(); },
    'h-parse': function () { var r = H.parseHcespnText($('#hpaste').value), keep = ui.hdraft; r.def.id = keep.id; r.def.isNew = keep.isNew; r.def.version = keep.version; r.def.archived = keep.archived; ui.hdraft = r.def; ui.hnotes = r.notes; render(); },
    'h-addrow': function () { readHForm(); var d = ui.hdraft, end = d.fields.reduce(function (a, f) { return Math.max(a, (f.start || 0) + (f.len || 0) - 1); }, 0); d.fields.push({ name: '', start: end + 1, len: 4, resolution: null, offset: null, unit: '', min: null, max: null }); render(); },
    'h-fill': function () { readHForm(); var d = ui.hdraft; if (!d.length) return toast('Data Length 를 먼저 넣어 주세요'); if (d.fields.length) return toast('하위 필드가 이미 있습니다 — 비운 뒤 눌러 주세요'); for (var s = 1; s + 3 <= d.length; s += 4) d.fields.push({ name: '필드 ' + ((s + 3) / 4), start: s, len: 4, resolution: null, offset: null, unit: '', min: null, max: null }); render(); },
    'h-delrow': function (el) { readHForm(); ui.hdraft.fields.splice(+el.dataset.i, 1); render(); },
    'h-addspecial': function () { readHForm(); ui.hdraft.special.push({ scope: '확인 필요', byte: 4, equals: 255, label: 'Not available' }); render(); },
    'h-delspecial': function (el) { readHForm(); ui.hdraft.special.splice(+el.dataset.i, 1); render(); },
    'h-save': function () { readHForm(); var d = ui.hdraft, v = H.validateDef(d, DB.hcespns.filter(function (x) { return x.id !== d.id || d.isNew; })); if (v.errors.length) { render(); return toast(v.errors[0]); } var s = saveVersioned('hcespns', d, false, H.validateDef); if (s) { ui.hdraft = H.clone(s); ui.hnotes = null; toast('HCESPN ' + s.no + ' v' + s.version + ' 을 저장했습니다'); render(); } },
    'h-save-new': function () { readHForm(); var s = saveVersioned('hcespns', ui.hdraft, true, H.validateDef); if (s) { ui.hdraft = H.clone(s); toast('새 버전 v' + s.version + ' 으로 저장했습니다. 이전 버전은 보관됩니다'); } render(); },
    'h-del': function () { var id = ui.hdraft.id; DB.hcespns = DB.hcespns.filter(function (d) { return d.id !== id; }); ui.hdraft = null; ui.confirm = ''; save(); toast('삭제했습니다. 이 번호를 쓰는 프로토콜은 RAW HEX 만 보여 줍니다'); render(); },

    'a-run': function () { ui.raw = $('#raw').value; var lines = ui.raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean); if (!lines.length) return toast('HEX RAW DATA 를 넣어 주세요'); run(lines.map(function (l, i) { return { raw: l, row: i + 1 }; })); render(); },
    'a-sample': function () { ui.raw = H.sample().raws.join('\n'); render(); $('#raw').value = ui.raw; },
    'a-sel': function (el) { ui.sel = +el.dataset.i; render(); var r = $('#a-result'); if (r) r.scrollIntoView({ block: 'nearest' }); },
    'a-xlsx': function () { pick('.xlsx,.xls,.csv', function (f) { var rd = new FileReader(); rd.onload = function () { try { var wb = XLSX.read(rd.result, { type: 'array' }), rows = H.rowsFromSheet(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })); if (!rows.length) return toast('메시지(16진수) 열에서 데이터를 찾지 못했습니다'); run(rows); toast(f.name + ' — ' + rows.length + '행을 분석했습니다'); render(); } catch (e) { toast('엑셀을 읽지 못했습니다 — ' + e.message); } }; rd.readAsArrayBuffer(f); }); },
    'a-tpl': function () { var s = H.sample().raws, wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['데이터 수신일자', '수신 시간', '메시지'], ['2026-11-12', '14:30:45', s[0]], ['2026-11-12', '14:31:45', s[1]]]), 'RAW'); XLSX.writeFile(wb, 'RAW_DATA_업로드양식.xlsx'); },
    'a-export': function () { var sh = H.exportSheets(ui.items), wb = XLSX.utils.book_new(); Object.keys(sh).forEach(function (k) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh[k]), k); }); XLSX.writeFile(wb, 'RAW_DATA_해석결과_' + now().slice(0, 10) + '.xlsx'); }
  };
  var changes = {
    pq: function (el) { readPForm(); ui.pq = el.value; render(); refocus('pq'); }, hq: function (el) { readHForm(); ui.hq = el.value; render(); refocus('hq'); },
    psender: function (el) { readPForm(); ui.psender = el.value; render(); }, 'show-old': function (el) { readPForm(); readHForm(); ui.showOld = el.checked; render(); },
    sender: function (el) { ui.sender = el.value; ui.raw = $('#raw').value; if (ui.items.length) { ui.pick = {}; ui.items.forEach(function (it) { it.result = H.analyze(it.raw, ctx(it)); }); } render(); },
    'a-version': function (el) { var it = ui.items[ui.sel]; ui.pick[it.key] = el.value; it.result = H.analyze(it.raw, ctx(it)); ui.raw = $('#raw').value; render(); }
  };
  function refocus(k) { var q = document.querySelector('[data-ch="' + k + '"]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  document.addEventListener('click', function (e) {
    var nb = e.target.closest('#nav button'); if (nb) return go(nb.dataset.p);
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    if (acts[el.dataset.act]) acts[el.dataset.act](el, e);
  });
  document.addEventListener('change', function (e) {
    var t = e.target, k = t.dataset.ch; if (k && changes[k]) return changes[k](t);
    if (t.closest('#pform') && (t.dataset.pf || t.dataset.pr)) { readPForm(); if (t.dataset.pr) (ui.pdraft.rows[+t.dataset.i] || {}).flags = []; render(); }
    else if (t.closest('#hform') && (t.dataset.hf || t.dataset.hr || t.dataset.hs)) { readHForm(); render(); }
  });
  // Byte 에 올리면 해석 — 같은 Parameter 전체를 강조
  document.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.hb'), tip = $('#tip'); if (!b) { if (!e.target.closest('#tip')) { tip.hidden = true; [].forEach.call(document.querySelectorAll('.hb.hl,.hb.hl2'), function (x) { x.classList.remove('hl', 'hl2'); }); } return; }
    var i = +b.dataset.b, it = ui.items[ui.sel], r = it.result, m = r.map[i];
    [].forEach.call(document.querySelectorAll('.hb'), function (x) { var j = +x.dataset.b, mj = r.map[j]; x.classList.toggle('hl', !!(m && mj && mj.p === m.p && mj.s === m.s)); x.classList.toggle('hl2', !!(m && mj && mj.p === m.p && mj.s !== m.s)); });
    if (!m) b.classList.add('hl');
    tip.innerHTML = tipFor(i); tip.hidden = false;
    var rc = b.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, x = Math.min(window.innerWidth - tw - 8, Math.max(8, rc.left)), y = rc.bottom + 8; if (y + th > window.innerHeight - 8) y = Math.max(8, rc.top - th - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  load();
  var p0 = location.hash.slice(1); if (pages[p0]) ui.page = p0;
  window.__app = { db: function () { return DB; }, ui: ui };
  render();
})();
