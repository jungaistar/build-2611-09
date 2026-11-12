/*
 * build-2611-09 (v2) · HEX Protocol Analyzer — 해석 엔진
 * 프로토콜 표 읽기 · HCESPN 원문 구조화 · HEX 정리 · Message Type 으로 프로토콜 고르기 · HCESPN 정의로 환산 · 검증은 전부 여기 둔다.
 * js/app.js 는 그리기와 저장만 한다.
 *
 * 원칙: 새 HCESPN 이 생겨도 코드를 고치지 않는다 — 정의(Byte Mapping · Type · Endian · Resolution · Offset · 수식 · 특수조건)만 등록한다.
 *       문서가 어긋나거나 불명확하면 추정해서 적용하지 않고 「확인 필요」로 알린다. 해석할 수 없는 값에 환산값을 만들지 않는다.
 *
 * 저장 구조(추후 DB 표로 옮길 수 있게 납작하게)
 *   protocols : id, name, sender, receiver, msg_type(0~255), version, registered_at, updated_at, note, archived, rows[{sp, len, name, hcespn, note}]
 *   hcespns   : id, no, name, length, type(uint|enum|datetime|array|hex|formula), endian(LE|BE), resolution, offset, unit, min, max,
 *               enums{HEX: 이름}, fields[{name, start, len, resolution, offset, unit, min, max}], special[{scope(all|each|확인 필요), byte, equals, label}],
 *               formula, hcepgn, version, updated_at, note, archived
 *   analyses  : id, at, recv_date, recv_time, sender, raw, msg_type, protocol_id, protocol_version, status, summary
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TYPES = { uint: '수치(선형 환산)', 'enum': '열거형', datetime: '날짜 · 시간(6 bytes)', array: '반복 배열 · 하위 필드', hex: 'HEX 그대로', formula: '사용자 정의 수식' };
  var SENDERS = ['MCU', 'RMCU', '인증장치'];
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function txt(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOr(v, d) { var s = String(v == null ? '' : v).replace(/,/g, '').trim(); if (s === '') return d; var n = Number(s); return isFinite(n) ? n : d; }
  function hex2(b) { return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }
  function toHex(bytes) { return bytes.map(hex2).join(' '); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ───────────── HEX 정리 ───────────── */
  /** 공백 · 줄바꿈 · 0x · 쉼표를 걷고 대문자로. 잘못된 글자 · 홀수 자릿수는 위치와 함께 알린다(임의로 고치지 않는다) */
  function parseHex(input) {
    var s = String(input == null ? '' : input), errors = [], clean = '';
    var t = s.replace(/0x/gi, '  ');
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (/[\s,;:\-_]/.test(ch)) continue;
      if (/[0-9a-fA-F]/.test(ch)) { clean += ch.toUpperCase(); continue; }
      errors.push({ pos: i + 1, ch: ch, msg: (i + 1) + '번째 글자 「' + ch + '」는 16진수가 아닙니다' });
    }
    if (!clean.length && !errors.length) errors.push({ pos: 0, msg: 'HEX 데이터가 비어 있습니다' });
    if (clean.length % 2) errors.push({ pos: 0, msg: 'HEX 자릿수가 홀수(' + clean.length + '자)입니다 — 한 Byte 는 두 자리입니다' });
    var bytes = [];
    if (!errors.length) for (var k = 0; k < clean.length; k += 2) bytes.push(parseInt(clean.substr(k, 2), 16));
    return { ok: !errors.length, bytes: bytes, clean: clean, errors: errors };
  }

  /* ───────────── 프로토콜 표 읽기(붙여넣기) ───────────── */
  var PCOL = [['sp', /^(s\.?p\.?|startposition|start|시작위치|시작|위치|byte|bytepos|position)$/], ['len', /^(length|len|길이|bytes?수?|size)$/], ['name', /^(parametername|parameter|name|항목|항목명|파라미터|파라미터명|내용|description)$/], ['hcespn', /^(hcespn|spn|hcespn번호|hce spn)$/], ['note', /^(비고|remark|remarks|note|notes|comment)$/]];
  function pkey(v) { var k = txt(v).toLowerCase().replace(/[\s_()]/g, ''); for (var i = 0; i < PCOL.length; i++) if (PCOL[i][1].test(k)) return PCOL[i][0]; return ''; }
  function spRange(v) { var m = txt(v).match(/^(\d+)\s*(?:[-~–]\s*(\d+))?$/); return m ? { sp: +m[1], ep: m[2] ? +m[2] : null } : null; }
  function lenOf(v) { var m = txt(v).match(/^(\d+)\s*(bytes?|바이트|b)?$/i); return m ? +m[1] : null; }
  function msgTypeIn(s) { var m = txt(s).match(/(?:=|:)?\s*0x([0-9a-fA-F]{2})\b/) || txt(s).match(/\b([0-9A-F]{2})h\b/); return m ? parseInt(m[1], 16) : null; }
  /**
   * 엑셀에서 복사한 표(탭 구분) · 마크다운 표 · 「S.P: 1 / Length: 1 byte …」 꼴 글을 읽는다.
   * 돌려주는 rows 는 사용자가 확인 · 수정할 초안이다. 어긋난 곳은 고치지 않고 issues 에 적는다.
   */
  function parseProtocolTable(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim() !== ''; });
    var rows = [], issues = [], missing = [];
    var kv = lines.filter(function (l) { return /^\s*(S\.?P\.?|Start\s*Position|Length|Parameter\s*Name|HCESPN|비고)\s*[:：]/i.test(l); }).length;
    if (kv >= 3 && kv >= lines.length * 0.6) {
      var cur = null;
      lines.forEach(function (l) {
        var m = l.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/); if (!m) return;
        var k = pkey(m[1]); if (!k) return;
        if (k === 'sp') { cur = { spText: m[2] }; rows.push(cur); } else if (cur) cur[k + 'Text'] = m[2];
      });
    } else {
      var cells = lines.map(function (l) { return /\t/.test(l) ? l.split('\t') : /\|/.test(l) ? l.replace(/^\s*\||\|\s*$/g, '').split('|') : l.split(/\s{2,}/); }).filter(function (c) { return !c.every(function (x) { return /^[\s:\-]*$/.test(x); }); });
      var hr = -1, map = {};
      for (var r = 0; r < Math.min(cells.length, 6); r++) { var m2 = {}; cells[r].forEach(function (v, c) { var k = pkey(v); if (k && m2[k] == null) m2[k] = c; }); if (m2.sp != null && (m2.name != null || m2.hcespn != null || m2.len != null)) { hr = r; map = m2; break; } }
      if (hr < 0) {
        // 머리줄이 없으면 열 순서를 S.P · Length · Parameter Name · HCESPN · 비고 로 본다 — 첫 칸이 위치 꼴일 때만
        if (cells.length && cells.every(function (c) { return spRange(c[0]); })) { map = { sp: 0, len: 1, name: 2, hcespn: 3, note: 4 }; hr = -1; issues.push({ level: 'info', msg: '머리줄이 없어 열 순서를 S.P · Length · Parameter Name · HCESPN · 비고 로 읽었습니다 — 맞는지 확인해 주세요' }); }
        else return { ok: false, rows: [], issues: [{ level: 'error', msg: 'S.P(Start Position) 열을 찾지 못했습니다 — 머리줄(S.P · Length · Parameter Name · HCESPN)까지 함께 복사해 붙여 넣어 주세요' }], msgType: null };
      }
      ['sp', 'len', 'name', 'hcespn'].forEach(function (k) { if (map[k] == null) missing.push({ sp: 'S.P', len: 'Length', name: 'Parameter Name', hcespn: 'HCESPN' }[k]); });
      cells.slice(hr + 1).forEach(function (c) { var g = function (k) { return map[k] == null ? '' : txt(c[map[k]]); }; if (!c.some(function (x) { return txt(x); })) return; rows.push({ spText: g('sp'), lenText: g('len'), nameText: g('name'), hcespnText: g('hcespn'), noteText: g('note') }); });
    }
    if (missing.length) issues.push({ level: 'error', msg: '필수 열이 없습니다: ' + missing.join(', ') });
    var msgType = null;
    var out = rows.map(function (r, i) {
      var sr = spRange(r.spText), L = lenOf(r.lenText), o = { sp: sr ? sr.sp : null, len: L, name: txt(r.nameText), hcespn: txt(r.hcespnText).replace(/^HCESPN\s*/i, ''), note: txt(r.noteText), flags: [] };
      if (!sr) o.flags.push('S.P 를 읽지 못했습니다(' + txt(r.spText) + ')');
      if (L == null && txt(r.lenText)) o.flags.push('Length 를 읽지 못했습니다(' + txt(r.lenText) + ')');
      if (sr && sr.ep != null) {
        var span = sr.ep - sr.sp + 1;
        if (L == null) o.len = span;
        else if (span !== L) o.flags.push('S.P ' + sr.sp + '-' + sr.ep + '(' + span + ' bytes)와 Length ' + L + ' bytes 가 맞지 않습니다 — 원본 사양을 확인해 주세요(Length 를 그대로 두었습니다)');
      } else if (sr && L == null) o.len = 1;
      if (o.hcespn && !/^\d+$/.test(o.hcespn)) o.flags.push('HCESPN 번호가 숫자가 아닙니다(' + o.hcespn + ')');
      var mt = msgTypeIn(o.name); if (mt != null && msgType == null && /message\s*type|메시지\s*(타입|종류)/i.test(o.name)) msgType = mt;
      return o;
    });
    return { ok: out.length > 0 && !missing.length, rows: out, issues: issues, msgType: msgType };
  }
  /** 프로토콜 한 건 검증 — 겹침 · 빈 구간 · 필수값 · 등록된 것과 중복. 고치지 않고 알린다 */
  function validateProtocol(p, all) {
    var e = [], w = [], rows = (p.rows || []).slice().sort(function (a, b) { return (a.sp || 0) - (b.sp || 0); });
    if (!txt(p.name)) e.push('프로토콜 이름이 비어 있습니다');
    if (!txt(p.sender)) e.push('발신자를 골라 주세요');
    if (!(isNum(p.msg_type) && p.msg_type >= 0 && p.msg_type <= 255)) e.push('RMS Message Type(00~FF)이 없습니다');
    if (!rows.length) e.push('프로토콜 표가 비어 있습니다');
    var end = 0;
    rows.forEach(function (r, i) {
      if (!isNum(r.sp) || r.sp < 1) return e.push((i + 1) + '번째 줄 — S.P 가 없습니다');
      if (!isNum(r.len) || r.len < 1) return e.push('S.P ' + r.sp + ' — Length 가 없습니다');
      if (!txt(r.name)) w.push('S.P ' + r.sp + ' — Parameter Name 이 비어 있습니다');
      if (!txt(r.hcespn)) w.push('S.P ' + r.sp + ' — HCESPN 번호가 없어 RAW HEX 만 보여 줍니다');
      if (r.sp <= end) e.push('S.P ' + r.sp + ' — 앞 항목(끝 ' + end + ')과 Byte 가 겹칩니다');
      else if (r.sp > end + 1) w.push('Byte ' + (end + 1) + '~' + (r.sp - 1) + ' 는 정의되지 않은 구간입니다');
      end = Math.max(end, r.sp + r.len - 1);
    });
    if (rows[0] && rows[0].sp === 1 && isNum(p.msg_type)) { var mt = msgTypeIn(rows[0].name); if (mt != null && mt !== p.msg_type) w.push('첫 줄에 적힌 Message Type(0x' + hex2(mt) + ')과 기본정보의 Message Type(0x' + hex2(p.msg_type) + ')이 다릅니다'); }
    (all || []).forEach(function (q) { if (q.id !== p.id && !q.archived && q.sender === p.sender && q.msg_type === p.msg_type && txt(q.version) === txt(p.version)) e.push('같은 발신자 · Message Type · 버전의 프로토콜이 이미 있습니다(' + q.name + ' v' + q.version + ')'); });
    return { errors: e, warnings: w, length: end };
  }

  /* ───────────── HCESPN 원문 → 초안(반드시 사용자가 확인) ───────────── */
  function parseHcespnText(text) {
    var lines = String(text || '').split(/\r?\n/).map(txt).filter(Boolean), d = blankDef(), notes = [], m, cur = null;
    var all = lines.join('\n');
    if ((m = all.match(/HCESPN\s*[:：#]?\s*(\d+)/i))) d.no = m[1];
    if ((m = all.match(/HCESPN\s*\d+\s*[—\-–:：]\s*([^\n]+)/i)) || (m = all.match(/Parameter\s*Name\s*[:：]\s*([^\n]+)/i))) d.name = txt(m[1]);
    if ((m = all.match(/Data\s*Length\s*[:：]\s*(\d+)\s*bytes?/i))) d.length = +m[1];
    if (/little\s*endian/i.test(all)) d.endian = 'LE'; else if (/big\s*endian/i.test(all)) d.endian = 'BE';
    if ((m = all.match(/HCEPGN\s*[:：]\s*([^\n]+)/i))) d.hcepgn = txt(m[1]);
    var res = function (s) { var x = s.match(/([\d.]+)\s*([^\s\/]+)\s*\/\s*bit/i); return x ? { r: +x[1], u: x[2] } : null; };
    lines.forEach(function (ln) {
      var b = ln.match(/^Byte\s*(\d+)\s*(?:[-~–]\s*(\d+))?\s*[:：]\s*(.+)$/i);
      if (b) { cur = { name: txt(b[3]), start: +b[1], len: b[2] ? +b[2] - +b[1] + 1 : 1, resolution: null, offset: null, unit: '', min: null, max: null }; d.fields.push(cur); return; }
      var tgt = cur || d, r = /^Resolution\s*[:：]/i.test(ln) && res(ln), x;
      if (/^Resolution\s*[:：]/i.test(ln)) { if (r) { tgt.resolution = r.r; tgt.unit = r.u.replace(/s$/, function (z) { return z; }); } else notes.push('Resolution 을 읽지 못했습니다: ' + ln); }
      else if ((x = ln.match(/^Offset\s*[:：]\s*(-?[\d.,]+)/i))) tgt.offset = numOr(x[1], 0);
      else if ((x = ln.match(/^(?:유효\s*범위|Data\s*Range|Operational\s*Range)\s*[:：]\s*(-?[\d.,]+)\s*(?:~|to|–|-)\s*(-?[\d.,]+)/i))) { tgt.min = numOr(x[1], null); tgt.max = numOr(x[2], null); }
      else if ((x = ln.match(/^([0-9A-Fa-f]{2})\s*=\s*(.+)$/))) d.enums[x[1].toUpperCase()] = txt(x[2]);
      else if ((x = ln.match(/byte\s*(\d+)\s*=\s*0x([0-9A-Fa-f]{2})\s*(?:⇒|=>|→|->)\s*(.+)$/i))) { d.special.push({ scope: '확인 필요', byte: +x[1], equals: parseInt(x[2], 16), label: txt(x[3]).replace(/["”]$/, '') }); notes.push('특수조건 「byte' + x[1] + ' = 0x' + x[2].toUpperCase() + '」의 적용 범위(전체 / 하위 필드마다)를 정해야 적용됩니다'); }
    });
    if (Object.keys(d.enums).length) d.type = 'enum';
    else if (d.fields.length === 6 && /year/i.test(d.fields[0].name) && /sec/i.test(d.fields[5].name)) { d.type = 'datetime'; if (!d.length) d.length = 6; }
    else if (d.fields.length) { d.type = 'array'; if (!d.length) d.length = d.fields.reduce(function (a, f) { return Math.max(a, f.start + f.len - 1); }, 0); d.fields.forEach(function (f) { if (f.resolution == null && isNum(d.resolution)) { f.resolution = d.resolution; f.unit = f.unit || d.unit; } if (f.offset == null && isNum(d.offset)) f.offset = d.offset; }); }
    else d.type = 'uint';
    if (!d.no) notes.push('HCESPN 번호를 찾지 못했습니다');
    if (!d.length) notes.push('Data Length 를 찾지 못했습니다');
    return { def: d, notes: notes };
  }
  function blankDef(o) { return Object.assign({ id: uid('h'), no: '', name: '', length: null, type: 'uint', endian: 'LE', resolution: 1, offset: 0, unit: '', min: null, max: null, enums: {}, fields: [], special: [], formula: '', hcepgn: '', version: '1.0', updated_at: '', note: '', archived: false }, o || {}); }
  function blankProtocol(o) { return Object.assign({ id: uid('p'), name: '', sender: 'MCU', receiver: 'Server', msg_type: null, version: '1.0', registered_at: '', updated_at: '', note: '', archived: false, rows: [] }, o || {}); }
  function validateDef(d, all) {
    var e = [], w = [];
    if (!/^\d+$/.test(txt(d.no))) e.push('HCESPN 번호(숫자)가 없습니다');
    if (!txt(d.name)) w.push('Parameter Name 이 비어 있습니다');
    if (!(isNum(d.length) && d.length >= 1)) e.push('Data Length(bytes)가 없습니다');
    if (!TYPES[d.type]) e.push('Type 을 골라 주세요');
    if (d.type === 'datetime' && d.length !== 6) e.push('날짜 · 시간형은 6 bytes(Year · Month · Day · Hour · Minute · Second)입니다');
    if (d.type === 'uint' && isNum(d.length) && d.length > 6) e.push('수치형은 6 bytes 까지입니다 — 더 길면 반복 배열 · 하위 필드로 나눠 등록하세요');
    if (d.type === 'enum' && !Object.keys(d.enums || {}).length) w.push('열거값이 없습니다 — 값은 HEX 그대로 보여 줍니다');
    if (d.type === 'formula') { try { evalFormula(d.formula, { RAW: 1, RES: 1, OFFSET: 0 }); } catch (x) { e.push('환산식 오류 — ' + x.message); } }
    if (d.type === 'array') {
      if (!(d.fields || []).length) e.push('하위 필드가 없습니다');
      var end = 0;
      (d.fields || []).slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (f) {
        if (!isNum(f.start) || !isNum(f.len) || f.start < 1 || f.len < 1) return e.push('하위 필드 「' + f.name + '」의 Byte 범위가 없습니다');
        if (f.len > 6) e.push('하위 필드 「' + f.name + '」가 6 bytes 를 넘습니다');
        if (f.start <= end) e.push('하위 필드 「' + f.name + '」가 앞 필드와 겹칩니다');
        end = Math.max(end, f.start + f.len - 1);
      });
      if (isNum(d.length) && end > d.length) e.push('하위 필드가 Data Length(' + d.length + ' bytes)를 넘습니다(끝 ' + end + ')');
      else if (isNum(d.length) && end < d.length) w.push('Byte ' + (end + 1) + '~' + d.length + ' 에 하위 필드가 없습니다');
    }
    (d.special || []).forEach(function (s) { if (s.scope !== 'all' && s.scope !== 'each') w.push('특수조건 「byte' + s.byte + ' = 0x' + hex2(s.equals) + ' → ' + s.label + '」의 적용 범위가 정해지지 않아 적용하지 않습니다(원본 사양 확인)'); });
    (all || []).forEach(function (q) { if (q.id !== d.id && !q.archived && txt(q.no) === txt(d.no) && txt(q.version) === txt(d.version)) e.push('HCESPN ' + d.no + ' v' + d.version + ' 이 이미 있습니다'); });
    return { errors: e, warnings: w };
  }

  /* ───────────── 수식 — 사칙연산 · 괄호만(코드를 실행하지 않는다) ───────────── */
  function evalFormula(expr, vars) {
    var s = String(expr || ''), i = 0, toks = [], m;
    while (i < s.length) {
      var ch = s[i]; if (/\s/.test(ch)) { i++; continue; }
      if ((m = s.slice(i).match(/^\d+\.?\d*|^\.\d+/))) { toks.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/))) { var k = m[0].toUpperCase(); if (!(k in vars)) throw new Error('모르는 이름 「' + m[0] + '」(쓸 수 있는 이름: ' + Object.keys(vars).join(', ') + ')'); toks.push({ t: 'n', v: vars[k] }); i += m[0].length; continue; }
      if ('+-*/()×÷'.indexOf(ch) >= 0) { toks.push({ t: ch === '×' ? '*' : ch === '÷' ? '/' : ch }); i++; continue; }
      throw new Error('쓸 수 없는 글자 「' + ch + '」');
    }
    if (!toks.length) throw new Error('수식이 비어 있습니다');
    var p = 0, pk = function () { return toks[p] && toks[p].t; };
    function prim() { var t = toks[p++]; if (!t) throw new Error('수식이 중간에 끝났습니다'); if (t.t === 'n') return t.v; if (t.t === '-') return -prim(); if (t.t === '+') return prim(); if (t.t === '(') { var v = sum(); if (pk() !== ')') throw new Error('괄호가 닫히지 않았습니다'); p++; return v; } throw new Error('수식을 읽지 못했습니다'); }
    function term() { var v = prim(); while (pk() === '*' || pk() === '/') { var o = toks[p++].t, b = prim(); if (o === '/' && b === 0) throw new Error('0 으로 나눕니다'); v = o === '*' ? v * b : v / b; } return v; }
    function sum() { var v = term(); while (pk() === '+' || pk() === '-') { var o = toks[p++].t, b = term(); v = o === '+' ? v + b : v - b; } return v; }
    var out = sum(); if (p < toks.length) throw new Error('수식을 끝까지 읽지 못했습니다'); if (!isFinite(out)) throw new Error('결과가 숫자가 아닙니다');
    return out;
  }

  /* ───────────── 환산 ───────────── */
  function toUint(bytes, endian) { var v = 0, a = endian === 'BE' ? bytes : bytes.slice().reverse(); for (var i = 0; i < a.length; i++) v = v * 256 + a[i]; return v; }   // 6 bytes 까지 정확
  function fmtNum(v) { if (!isNum(v)) return ''; var r = Math.round(v * 1e6) / 1e6; return r.toLocaleString('en-US', { maximumFractionDigits: 6 }); }
  function linear(raw, r, o) { return raw * (isNum(r) ? r : 1) + (isNum(o) ? o : 0); }
  function specialHit(sp, bytes, whole) {
    // scope all: HCESPN 전체 바이트에서 byte N, each: 하위 필드마다 byte N. 범위가 정해지지 않은 조건은 적용하지 않는다
    var src = sp.scope === 'all' ? whole : sp.scope === 'each' ? bytes : null; if (!src) return false;
    return src[sp.byte - 1] === sp.equals;
  }
  /** HCESPN 정의로 바이트 묶음을 푼다 → 하위 결과 여러 줄(절대 위치 abs 는 1 부터) */
  function decodeDef(bytes, def, abs) {
    var subs = [], whole = bytes, sub = function (o) { subs.push(Object.assign({ name: def.name, start: abs, len: bytes.length, raw: toHex(bytes), dec: null, value: null, text: '', unit: '', formula: '', status: 'ok', note: '' }, o)); };
    var na = function (b) { var hit = (def.special || []).filter(function (s) { return specialHit(s, b, whole); })[0]; return hit || null; };
    var range = function (v, lo, hi) { return (isNum(lo) && v < lo) || (isNum(hi) && v > hi) ? '유효범위(' + (isNum(lo) ? fmtNum(lo) : '') + '~' + (isNum(hi) ? fmtNum(hi) : '') + ') 밖' : ''; };
    if (def.type === 'hex') { sub({ text: toHex(bytes) }); return subs; }
    if (def.type === 'enum') {
      var key = bytes.map(hex2).join(''), lab = (def.enums || {})[key];
      sub({ dec: bytes.length <= 6 ? toUint(bytes, def.endian) : null, text: lab ? lab : '0x' + key, status: lab || !Object.keys(def.enums || {}).length ? 'ok' : 'warn', note: lab || !Object.keys(def.enums || {}).length ? '' : '열거표에 없는 값' });
      return subs;
    }
    if (def.type === 'datetime') {
      var nm = ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Second'], lim = [[0, 255], [1, 12], [1, 31], [0, 23], [0, 59], [0, 59]], bad = [];
      bytes.forEach(function (b, i) { if (b < lim[i][0] || b > lim[i][1]) bad.push(nm[i] + ' ' + b); });
      var Y = 2000 + bytes[0], t = Y + '-' + pad(bytes[1]) + '-' + pad(bytes[2]) + ' ' + pad(bytes[3]) + ':' + pad(bytes[4]) + ':' + pad(bytes[5]);
      if (!bad.length) { var dd = new Date(Y, bytes[1] - 1, bytes[2]); if (dd.getMonth() !== bytes[1] - 1) bad.push('없는 날짜'); }
      sub({ text: bad.length ? '' : t, formula: 'Year = 2000 + RAW, 나머지 1/bit', status: bad.length ? 'error' : 'ok', note: bad.length ? '유효범위 밖: ' + bad.join(', ') + ' — 날짜로 환산하지 않았습니다' : '' });
      nm.forEach(function (n, i) { subs.push({ name: n, start: abs + i, len: 1, raw: hex2(bytes[i]), dec: bytes[i], value: i ? bytes[i] : Y, text: String(i ? bytes[i] : Y), unit: '', formula: i ? 'RAW' : '2000 + RAW', status: bytes[i] < lim[i][0] || bytes[i] > lim[i][1] ? 'error' : 'ok', note: bytes[i] < lim[i][0] || bytes[i] > lim[i][1] ? '유효범위 ' + lim[i][0] + '~' + lim[i][1] + ' 밖' : '', child: true }); });
      return subs;
    }
    var one = function (b, f, name, start) {
      var h = na(b); if (h) return sub({ name: name, start: start, len: b.length, raw: toHex(b), text: h.label, status: 'na', note: '특수조건 byte' + h.byte + ' = 0x' + hex2(h.equals) });
      if (b.length > 6) return sub({ name: name, start: start, len: b.length, raw: toHex(b), status: 'error', note: '6 bytes 를 넘는 값은 수치로 환산하지 않습니다' });
      var raw = toUint(b, def.endian), v, fm;
      if (def.type === 'formula') { try { v = evalFormula(def.formula, { RAW: raw, RES: isNum(def.resolution) ? def.resolution : 1, OFFSET: isNum(def.offset) ? def.offset : 0 }); fm = def.formula; } catch (x) { return sub({ name: name, start: start, len: b.length, raw: toHex(b), dec: raw, status: 'error', note: '환산식 오류 — ' + x.message }); } }
      else { v = linear(raw, f.resolution, f.offset); fm = 'RAW × ' + (isNum(f.resolution) ? f.resolution : 1) + (isNum(f.offset) && f.offset ? ' + ' + f.offset : ''); }
      var rg = range(v, f.min, f.max);
      sub({ name: name, start: start, len: b.length, raw: toHex(b), dec: raw, value: v, text: fmtNum(v) + (f.unit ? ' ' + f.unit : ''), unit: f.unit || '', formula: fm + ' (' + (def.endian === 'BE' ? 'Big' : 'Little') + ' Endian)', status: rg ? 'warn' : 'ok', note: rg });
    };
    if (def.type === 'array') {
      (def.fields || []).slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (f) {
        var b = bytes.slice(f.start - 1, f.start - 1 + f.len);
        if (b.length < f.len) return sub({ name: f.name, start: abs + f.start - 1, len: b.length, raw: toHex(b), status: 'error', note: '데이터가 모자랍니다(' + b.length + ' / ' + f.len + ' bytes)' });
        one(b, { resolution: isNum(f.resolution) ? f.resolution : def.resolution, offset: isNum(f.offset) ? f.offset : def.offset, unit: f.unit || def.unit, min: isNum(f.min) ? f.min : def.min, max: isNum(f.max) ? f.max : def.max }, f.name, abs + f.start - 1);
      });
      return subs;
    }
    one(bytes, def, def.name, abs);
    return subs;
  }

  /* ───────────── 프로토콜 고르기 · 전체 해석 ───────────── */
  function verKey(v) { return String(v || '').split('.').map(function (x) { return ('00000' + (parseInt(x, 10) || 0)).slice(-5); }).join('.'); }
  function latest(list) { return list.slice().sort(function (a, b) { return verKey(b.version).localeCompare(verKey(a.version)) || String(b.updated_at).localeCompare(String(a.updated_at)); }); }
  function findDef(defs, no, version) { var l = latest((defs || []).filter(function (d) { return !d.archived && txt(d.no) === txt(no); })); return version ? l.filter(function (d) { return d.version === version; })[0] || null : l[0] || null; }
  /**
   * ctx: { protocols, hcespns, sender, protocolId(직접 고른 버전), msgTypePos(기본 1) }
   * 돌려주는 것: bytes · msg_type · protocol · versions(고를 수 있는 버전) · params[{sp,len,name,hcespn,raw,subs,status}] · map(바이트마다 param · sub 번호) · issues · status
   */
  function analyze(raw, ctx) {
    ctx = ctx || {};
    var h = parseHex(raw), out = { raw: h.clean, bytes: h.bytes, issues: [], params: [], map: [], msg_type: null, protocol: null, versions: [], status: 'ok' };
    if (!h.ok) { out.status = 'error'; out.issues = h.errors.map(function (e) { return { level: 'error', code: 'hex', msg: e.msg, pos: e.pos }; }); return out; }
    var pos = ctx.msgTypePos || 1;
    if (h.bytes.length < pos) { out.status = 'error'; out.issues.push({ level: 'error', code: 'short', msg: 'Message Type 이 있어야 할 Byte ' + pos + ' 이 없습니다' }); return out; }
    out.msg_type = h.bytes[pos - 1];
    var cand = (ctx.protocols || []).filter(function (p) { return !p.archived && p.msg_type === out.msg_type && (!ctx.sender || p.sender === ctx.sender); });
    out.versions = latest(cand).map(function (p) { return { id: p.id, name: p.name, sender: p.sender, version: p.version }; });
    out.map = h.bytes.map(function () { return null; });
    if (!cand.length) {
      out.status = 'error';
      var other = (ctx.protocols || []).filter(function (p) { return !p.archived && p.msg_type === out.msg_type; });
      out.issues.push({ level: 'error', code: 'no-protocol', msg: 'Message Type 0x' + hex2(out.msg_type) + ' 의 프로토콜이 등록돼 있지 않습니다' + (ctx.sender ? '(발신자 ' + ctx.sender + ')' : '') + ' — 자동 해석할 수 없습니다. 「프로토콜 관리」에서 등록해 주세요' + (other.length ? ' (다른 발신자 ' + other.map(function (p) { return p.sender; }).join(', ') + ' 에는 있습니다)' : '') });
      return out;
    }
    var p = ctx.protocolId ? cand.filter(function (x) { return x.id === ctx.protocolId; })[0] : null;
    if (!p) {
      p = latest(cand)[0];
      var senders = {}; cand.forEach(function (x) { senders[x.sender] = 1; });
      if (Object.keys(senders).length > 1) out.issues.push({ level: 'warn', code: 'sender', msg: '같은 Message Type 이 여러 발신자(' + Object.keys(senders).join(', ') + ')에 있습니다 — 발신자를 골라 주세요. 지금은 ' + p.sender + ' 로 해석했습니다' });
      else if (cand.length > 1) out.issues.push({ level: 'warn', code: 'version', msg: '프로토콜 버전이 ' + cand.length + '개 있습니다(' + latest(cand).map(function (x) { return 'v' + x.version; }).join(', ') + ') — RAW DATA 만으로는 버전을 알 수 없어 가장 높은 v' + p.version + ' 로 해석했습니다. 맞는 버전을 골라 주세요' });
    }
    out.protocol = { id: p.id, name: p.name, sender: p.sender, receiver: p.receiver, version: p.version, msg_type: p.msg_type };
    var rows = p.rows.slice().sort(function (a, b) { return a.sp - b.sp; }), need = 0;
    rows.forEach(function (r, pi) {
      need = Math.max(need, r.sp + r.len - 1);
      var b = h.bytes.slice(r.sp - 1, r.sp - 1 + r.len), prm = { sp: r.sp, len: r.len, name: r.name, hcespn: r.hcespn, raw: toHex(b), subs: [], status: 'ok', note: '', def_version: '' };
      if (b.length < r.len) {
        prm.status = 'error'; prm.note = b.length ? '데이터가 모자랍니다(' + b.length + ' / ' + r.len + ' bytes) — 환산하지 않았습니다' : '데이터가 없습니다(누락)';
        out.issues.push({ level: 'error', code: 'length', msg: 'S.P ' + r.sp + ' 「' + r.name + '」 — ' + prm.note });
      } else {
        var def = r.hcespn ? findDef(ctx.hcespns, r.hcespn) : null;
        if (!r.hcespn) { prm.status = 'warn'; prm.note = 'HCESPN 번호가 없어 RAW HEX 만 표시'; }
        else if (!def) { prm.status = 'warn'; prm.note = 'HCESPN ' + r.hcespn + ' 미등록 — RAW HEX 만 표시(환산값 없음)'; out.issues.push({ level: 'warn', code: 'no-hcespn', msg: 'HCESPN ' + r.hcespn + ' 이 등록돼 있지 않습니다 — 「' + r.name + '」는 RAW HEX 만 보여 줍니다. 「HCESPN 관리」에서 등록해 주세요' }); }
        else if (isNum(def.length) && def.length !== r.len) { prm.status = 'error'; prm.def_version = def.version; prm.note = '프로토콜 Length ' + r.len + ' bytes 와 HCESPN ' + def.no + ' 의 Data Length ' + def.length + ' bytes 가 다릅니다 — 환산하지 않았습니다'; out.issues.push({ level: 'error', code: 'def-length', msg: 'S.P ' + r.sp + ' 「' + r.name + '」 — ' + prm.note }); }
        else {
          prm.def_version = def.version; prm.subs = decodeDef(b, def, r.sp);
          var worst = prm.subs.some(function (s) { return s.status === 'error'; }) ? 'error' : prm.subs.some(function (s) { return s.status === 'warn'; }) ? 'warn' : prm.subs.some(function (s) { return s.status === 'na'; }) ? 'na' : 'ok';
          prm.status = worst;
          prm.subs.forEach(function (s) { if (s.status === 'error' || s.status === 'warn') out.issues.push({ level: s.status, code: 'value', msg: 'Byte ' + s.start + (s.len > 1 ? '-' + (s.start + s.len - 1) : '') + ' 「' + s.name + '」 — ' + s.note }); });
          (def.special || []).forEach(function (sp) { if (sp.scope !== 'all' && sp.scope !== 'each') out.issues.push({ level: 'info', code: 'special', msg: 'HCESPN ' + def.no + ' 의 특수조건 「byte' + sp.byte + ' = 0x' + hex2(sp.equals) + ' → ' + sp.label + '」은 적용 범위가 정해지지 않아 적용하지 않았습니다' }); });
        }
      }
      out.params.push(prm);
      for (var k = 0; k < b.length; k++) {
        var absPos = r.sp + k, si = -1;
        prm.subs.forEach(function (s, j) { if (!s.child && absPos >= s.start && absPos < s.start + s.len && (si < 0 || s.len < prm.subs[si].len)) si = j; });
        prm.subs.forEach(function (s, j) { if (s.child && absPos >= s.start && absPos < s.start + s.len) si = j; });
        out.map[absPos - 1] = { p: pi, s: si };
      }
    });
    if (h.bytes.length > need) out.issues.push({ level: 'warn', code: 'extra', msg: '프로토콜(' + need + ' bytes)보다 ' + (h.bytes.length - need) + ' bytes 깁니다 — Byte ' + (need + 1) + '~' + h.bytes.length + ' 는 정의되지 않은 영역으로 그대로 둡니다' });
    else if (h.bytes.length < need) out.issues.unshift({ level: 'error', code: 'total', msg: '길이가 맞지 않습니다 — 프로토콜 ' + need + ' bytes, 실제 ' + h.bytes.length + ' bytes' });
    out.expected = need;
    out.status = out.issues.some(function (i) { return i.level === 'error'; }) ? 'error' : out.issues.some(function (i) { return i.level === 'warn'; }) ? 'warn' : 'ok';
    return out;
  }
  var ST = { ok: '정상', warn: '확인', error: '오류', na: 'N/A' };

  /* ───────────── 엑셀 여러 줄 · 내보내기 ───────────── */
  /** 1열 수신일자 · 2열 수신 시간 · 3열 메시지. 머리줄이 있으면 이름으로 찾는다. 오류 행이 있어도 나머지는 계속 */
  function rowsFromSheet(aoa) {
    var out = [], head = (aoa[0] || []).map(function (v) { return txt(v).toLowerCase().replace(/\s/g, ''); });
    var ci = function (re, d) { var i = -1; head.forEach(function (x, k) { if (i < 0 && re.test(x)) i = k; }); return i < 0 ? d : i; };
    var hasHead = head.some(function (x) { return /메시지|message|hex|raw|data|데이터/.test(x); });
    var cm = hasHead ? ci(/메시지|message|hex|raw|16진|payload/, 2) : 2, cd = hasHead ? ci(/일자|날짜|date/, 0) : 0, ct = hasHead ? ci(/시간|time/, 1) : 1;
    var cell = function (v) { if (v instanceof Date) return v.toISOString(); if (typeof v === 'number' && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); } if (typeof v === 'number' && v >= 0 && v < 1) { var s = Math.round(v * 86400); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); } return txt(v); };
    aoa.slice(hasHead ? 1 : 0).forEach(function (r, i) { var msg = txt((r || [])[cm]); if (!msg && !txt((r || [])[cd])) return; out.push({ row: i + (hasHead ? 2 : 1), recv_date: cell((r || [])[cd]), recv_time: cell((r || [])[ct]), raw: msg }); });
    return out;
  }
  function exportSheets(items) {
    var a = [['No', '데이터 수신일자', '수신 시간', '발신자', 'Message Type', '적용 프로토콜', '버전', '상태', 'Byte 수', '오류 및 경고', 'RAW DATA']];
    var b = [['No', '데이터 수신일자', '수신 시간', 'Start Position', 'Length', 'Parameter Name', 'HCESPN', 'HCESPN 버전', '세부 항목', 'RAW HEX', 'Decimal Value', 'Physical Value', 'Unit', '환산식', 'Status', '비고']];
    items.forEach(function (it, i) {
      var r = it.result, p = r.protocol;
      a.push([i + 1, it.recv_date || '', it.recv_time || '', p ? p.sender : (it.sender || ''), r.msg_type == null ? '' : '0x' + hex2(r.msg_type), p ? p.name : '', p ? p.version : '', ST[r.status], r.bytes.length, r.issues.map(function (x) { return x.msg; }).join(' / '), r.bytes.length ? toHex(r.bytes) : it.raw]);
      r.params.forEach(function (prm) {
        if (!prm.subs.length) return b.push([i + 1, it.recv_date || '', it.recv_time || '', prm.sp, prm.len, prm.name, prm.hcespn, prm.def_version, '', prm.raw, '', '', '', '', ST[prm.status], prm.note]);
        prm.subs.forEach(function (s) { b.push([i + 1, it.recv_date || '', it.recv_time || '', s.start, s.len, prm.name, prm.hcespn, prm.def_version, s.name === prm.name ? '' : s.name, s.raw, s.dec == null ? '' : s.dec, s.value == null ? s.text : s.value, s.unit, s.formula, ST[s.status], s.note]); });
      });
    });
    return { '메시지요약': a, '해석결과': b };
  }

  /* ───────────── 예시(기획서에 실린 예) ───────────── */
  function sample() {
    var now = '2026-11-12T00:00:00.000Z';
    var f4 = function (names, unit) { return names.map(function (n, i) { return { name: n, start: i * 4 + 1, len: 4, resolution: 1, offset: 0, unit: unit, min: null, max: null }; }); };
    var defs = [
      blankDef({ id: 'h-16', no: '16', name: 'RMS Message Type', length: 1, type: 'enum', enums: { 'A1': 'Total Shift Mode & Actual Gear Distribution', 'B1': 'Total Engine Actual Percent Torque Distribution' }, updated_at: now, note: '기획서 예시' }),
      blankDef({ id: 'h-90', no: '90', name: 'Date & Time', length: 6, type: 'datetime', updated_at: now, note: '기획서 예시 — Byte 1 Year(2000 + RAW) · Month · Day · Hour · Minute · Second' }),
      blankDef({ id: 'h-127', no: '127', name: 'Total Shift Mode & Actual Gear Distribution', length: 24, type: 'array', endian: 'LE', resolution: 1, unit: 'sec', fields: f4(['Shift Mode – Manual', 'Shift Mode – Auto', 'Actual Gear – F1', 'Actual Gear – F2', 'Actual Gear – R1', 'Actual Gear – R2'], 'sec'), updated_at: now, note: '기획서 예시' }),
      blankDef({ id: 'h-128', no: '128', name: 'Total Engine Actual Percent Torque Distribution', length: 64, type: 'array', endian: 'LE', resolution: 1, unit: 'sec', fields: f4(['Percent Torque < 30%', '30% ≤ Percent Torque < 40%', '40% ≤ Percent Torque < 45%', '45% ≤ Percent Torque < 50%', '50% ≤ Percent Torque < 53%', '53% ≤ Percent Torque < 56%', '56% ≤ Percent Torque < 59%', '59% ≤ Percent Torque < 62%', '62% ≤ Percent Torque < 65%', '65% ≤ Percent Torque < 68%', '68% ≤ Percent Torque < 71%', '71% ≤ Percent Torque < 74%', '74% ≤ Percent Torque < 77%', '77% ≤ Percent Torque < 80%', '80% ≤ Percent Torque < 90%', 'Percent Torque ≥ 90%'], 'sec'), special: [{ scope: '확인 필요', byte: 4, equals: 255, label: 'Not available' }], updated_at: now, note: '기획서 예시 — 특수조건의 적용 범위는 원본 사양 확인 뒤 정합니다' })
    ];
    var protos = [
      blankProtocol({ id: 'p-a1', name: 'Total Shift Mode & Actual Gear Distribution', sender: 'MCU', msg_type: 0xA1, registered_at: now, updated_at: now, note: '기획서 예시 Case 1 — 원문의 S.P 8-51 과 Length 24 bytes 가 달라 24 bytes(8-31)로 등록', rows: [{ sp: 1, len: 1, name: 'RMS Message Type (= 0xA1)', hcespn: '16', note: '' }, { sp: 2, len: 6, name: 'Date & Time', hcespn: '90', note: '' }, { sp: 8, len: 24, name: 'Total Shift Mode & Actual Gear Distribution (sec)', hcespn: '127', note: '' }] }),
      blankProtocol({ id: 'p-b1', name: 'Total Engine Actual Percent Torque Distribution', sender: 'MCU', msg_type: 0xB1, registered_at: now, updated_at: now, note: '기획서 예시 Case 2', rows: [{ sp: 1, len: 1, name: 'RMS Message Type (= 0xB1)', hcespn: '16', note: '' }, { sp: 2, len: 6, name: 'Date & Time', hcespn: '90', note: '' }, { sp: 8, len: 64, name: 'Total Engine Actual Percent Torque Distribution (sec)', hcespn: '128', note: '' }] })
    ];
    var le = function (n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; };
    var a1 = [0xA1, 0x1A, 0x0B, 0x0C, 0x0E, 0x1E, 0x2D].concat(le(60), le(120), le(3600), le(5400), le(900), le(45));
    var b1 = [0xB1, 0x1A, 0x0B, 0x0C, 0x0E, 0x1E, 0x2D]; for (var i = 0; i < 16; i++) b1 = b1.concat(le(i === 15 ? 12 : 100 * (i + 1) + 7 * i));
    return { protocols: protos, hcespns: defs, raws: [bytesStr(a1), bytesStr(b1)] };
  }
  function bytesStr(b) { return b.map(hex2).join(''); }
  function fromSaved(raw) {
    var o; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!o || !Array.isArray(o.protocols) || !Array.isArray(o.hcespns)) return null;
    return { version: 2, protocols: o.protocols.map(function (p) { return blankProtocol(p); }), hcespns: o.hcespns.map(function (d) { return blankDef(d); }), analyses: Array.isArray(o.analyses) ? o.analyses : [], senders: Array.isArray(o.senders) && o.senders.length ? o.senders : SENDERS.slice(), is_sample: !!o.is_sample };
  }

  return {
    TYPES: TYPES, SENDERS: SENDERS, ST: ST, uid: uid, hex2: hex2, toHex: toHex, clone: clone, fmtNum: fmtNum, verKey: verKey, latest: latest,
    parseHex: parseHex, parseProtocolTable: parseProtocolTable, validateProtocol: validateProtocol, parseHcespnText: parseHcespnText, validateDef: validateDef,
    blankDef: blankDef, blankProtocol: blankProtocol, evalFormula: evalFormula, toUint: toUint, decodeDef: decodeDef, findDef: findDef, analyze: analyze,
    rowsFromSheet: rowsFromSheet, exportSheets: exportSheets, sample: sample, fromSaved: fromSaved, msgTypeIn: msgTypeIn
  };
});
