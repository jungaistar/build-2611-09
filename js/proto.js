/* 통신 프로토콜 16진수 해석기 — 해석 엔진
 *
 * 화면(app.js)은 판정하지 않는다. 16진수 읽기 · 항목 잘라내기 · 환산 · 경고 · 합격 판정은
 * 전부 여기서 하고 test/logic.test.js 로 고정한다. 브라우저와 node 양쪽에서 읽힌다.
 *
 * 프로토콜 정의 세 가지
 *   fields   : [{ msg, name, start, bit, len, lenUnit, endian, signed, res, offset, unit, min, max, invalid, enums, expect, tol }]
 *   messages : [{ id, name, length }]                    — 메시지 종류와 정의 길이(Byte)
 *   settings : { idStart, idLen, base }                  — 메시지 ID 가 놓인 위치, Byte 번호를 0 부터 셀지 1 부터 셀지
 *
 * 환산값 = raw × resolution + offset.
 * 바이트 항목은 시작 Byte 부터 길이만큼을 바이트 순서대로 붙여 정수로 읽는다.
 * bit 항목은 시작 Byte 부터 걸치는 바이트를 바이트 순서대로 붙인 정수에서,
 * 최하위 bit 로부터 「시작 bit」만큼 건너뛰어 길이만큼 읽는다(한 바이트 안이면 0 = 최하위 bit).
 */
(function (root) {
  'use strict';

  /* ---------- 16진수 읽기 ---------- */
  // 공백 · 콤마 · 세미콜론 · 콜론 · 하이픈 · 0x · 끝의 h 가 섞여도 읽는다.
  // 구분자가 없으면 두 글자씩 자른다. 틀린 글자는 버리지 않고 알린다.
  function parseHex(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return { bytes: [], error: '데이터가 비어 있습니다.' };
    var tokens = t.split(/[\s,;:\-|]+/).filter(Boolean);
    var bytes = [];
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i].replace(/^0x/i, '');
      if (tokens.length > 1 && /^[0-9a-f]{1,2}h$/i.test(tk)) tk = tk.slice(0, -1);
      var bad = tk.match(/[^0-9a-f]/i);
      if (bad) return { bytes: bytes, error: (i + 1) + '번째 토막 「' + tokens[i] + '」에 16진수가 아닌 글자 「' + bad[0] + '」가 있습니다.' };
      if (!tk) continue;
      if (tk.length <= 2 && tokens.length > 1) { bytes.push(parseInt(tk, 16)); continue; }
      if (tk.length % 2) return { bytes: bytes, error: (i + 1) + '번째 토막 「' + tokens[i] + '」의 글자 수가 홀수(' + tk.length + ')라 바이트로 나눌 수 없습니다.' };
      for (var j = 0; j < tk.length; j += 2) bytes.push(parseInt(tk.substr(j, 2), 16));
    }
    return { bytes: bytes, error: null };
  }
  function hex2(b) { return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }
  function toHex(bytes) { return bytes.map(hex2).join(' '); }

  // 숫자 칸: '0x12' 는 16진수, '1,234' 는 콤마 제거, 빈칸은 null.
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, '');
    if (!s) return null;
    if (/^-?0x[0-9a-f]+$/i.test(s)) return (s[0] === '-' ? -1 : 1) * parseInt(s.replace(/^-?0x/i, ''), 16);
    if (/^[0-9a-f]+h$/i.test(s)) return parseInt(s.slice(0, -1), 16);
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function decimals(x) {
    if (x == null || !isFinite(x)) return 0;
    var s = String(x);
    if (/e-/i.test(s)) return Math.min(12, parseInt(s.split(/e-/i)[1], 10) + ((s.split(/e/i)[0].split('.')[1] || '').length));
    return (s.split('.')[1] || '').length;
  }
  function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

  /* ---------- 정의 읽기 ---------- */
  // 열 이름이 조금 달라도 읽는다. 늘릴 때는 코드가 아니라 이 표를 늘린다.
  var ALIASES = {
    msg: ['메시지ID', '메시지', '메시지종류', 'ID', 'msg', 'msgid', 'messageid', 'PGN', '데이터종류'],
    name: ['항목명', '항목', '신호명', '데이터명', 'name', 'signal', 'field'],
    start: ['시작Byte', '시작바이트', '시작', 'Byte', '바이트위치', '위치', 'startbyte', 'start', 'offsetbyte'],
    bit: ['시작bit', '시작비트', 'bit위치', '비트위치', 'startbit', 'bit'],
    len: ['길이', '크기', 'length', 'len', 'size'],
    lenUnit: ['길이단위', '단위(길이)', 'lenunit', 'lengthunit'],
    endian: ['바이트순서', '엔디언', '엔디안', 'endian', 'byteorder', 'order'],
    signed: ['부호', '부호여부', 'signed', 'sign'],
    res: ['Resolution', '배율', '분해능', '환산계수', 'res', 'scale', 'factor', 'resolution'],
    offset: ['Offset', '오프셋', 'offset'],
    unit: ['단위', 'unit'],
    min: ['최소', '최소값', 'min', '하한'],
    max: ['최대', '최대값', 'max', '상한'],
    invalid: ['무효값', '무효', 'invalid', 'na', 'notavailable'],
    enums: ['열거값', '열거', '값정의', '상태정의', 'enum', 'enums', 'values'],
    expect: ['기대값', 'expected', 'expect'],
    tol: ['허용오차', '오차', 'tolerance', 'tol'],
    note: ['비고', '설명', 'note', 'remark']
  };
  var MSG_ALIASES = {
    id: ['메시지ID', 'ID', '메시지', 'msgid', 'id'],
    name: ['이름', '메시지명', '명칭', 'name'],
    length: ['길이', '길이(Byte)', '전체길이', 'length', 'len', 'dlc']
  };
  function norm(s) { return String(s == null ? '' : s).replace(/[\s_]+/g, '').toLowerCase(); }
  function pick(row, key, table) {
    var names = (table || ALIASES)[key].map(norm);
    for (var k in row) if (names.indexOf(norm(k)) >= 0) return row[k];
    return undefined;
  }
  function blank(v) { return v == null || String(v).trim() === ''; }

  function endianOf(v) {
    var s = norm(v);
    if (!s) return { v: 'big' };
    if (/^(big|be|빅|빅엔디언|빅엔디안|motorola|모토로라|msb|msbfirst|b)$/.test(s) || s.indexOf('빅') === 0 || s.indexOf('big') === 0) return { v: 'big' };
    if (/^(little|le|리틀|리틀엔디언|리틀엔디안|intel|인텔|lsb|lsbfirst|l)$/.test(s) || s.indexOf('리틀') === 0 || s.indexOf('little') === 0) return { v: 'little' };
    return { v: 'big', bad: true };
  }
  function signedOf(v) {
    var s = norm(v);
    if (!s) return { v: false };
    if (/^(signed|s|y|yes|o|true|1|있음|부호있음|int|정수(부호)|음수가능|sint)$/.test(s) || s.indexOf('부호있') === 0) return { v: true };
    if (/^(unsigned|u|n|no|x|false|0|없음|부호없음|uint)$/.test(s) || s.indexOf('부호없') === 0) return { v: false };
    return { v: false, bad: true };
  }
  function idOf(v) {
    if (blank(v)) return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
    if (/^[0-9a-f]+h$/i.test(s)) return parseInt(s.slice(0, -1), 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    return null;
  }
  function idLabel(id, len) { var h = id.toString(16).toUpperCase(); while (h.length < (len || 1) * 2) h = '0' + h; return '0x' + h; }

  // 열거값: '0=정지; 1=주행' · '0:정지, 1:주행' · 줄바꿈 구분 · 키는 0x 가능.
  function parseEnums(v) {
    if (blank(v)) return null;
    var out = {}, any = false;
    String(v).split(/[;\n,/]+/).forEach(function (p) {
      var m = p.match(/^\s*(-?(?:0x[0-9a-f]+|\d+))\s*[=:]\s*(.+?)\s*$/i);
      if (m) { out[num(m[1])] = m[2]; any = true; }
    });
    return any ? out : null;
  }
  function parseInvalid(v) {
    if (blank(v)) return [];
    return String(v).split(/[;,/\s]+/).map(function (x) { return num(/^[0-9a-f]+$/i.test(x) && /[a-f]/i.test(x) ? '0x' + x : x); }).filter(function (x) { return x != null; });
  }

  function normalize(raw) {
    raw = raw || {};
    var issues = [], st = raw.settings || {};
    var settings = {
      idStart: num(st.idStart) == null ? 0 : num(st.idStart),
      idLen: num(st.idLen) == null ? 1 : num(st.idLen),
      base: num(st.base) === 1 ? 1 : 0
    };
    var base = settings.base;
    var messages = [];
    (raw.messages || []).forEach(function (r, i) {
      var idv = pick(r, 'id', MSG_ALIASES), nm = pick(r, 'name', MSG_ALIASES), ln = pick(r, 'length', MSG_ALIASES);
      if (blank(idv) && blank(nm) && blank(ln)) return;
      var id = idOf(idv);
      if (id == null) { issues.push('메시지 ' + (i + 2) + '행: 메시지 ID 「' + (idv == null ? '' : idv) + '」를 숫자로 읽지 못했습니다.'); return; }
      messages.push({ id: id, name: blank(nm) ? idLabel(id, settings.idLen) : String(nm).trim(), length: num(ln) });
    });
    var fields = [];
    (raw.fields || []).forEach(function (r, i) {
      var row = i + 2, nm = pick(r, 'name');
      var keys = Object.keys(r).filter(function (k) { return !blank(r[k]); });
      if (!keys.length) return;
      var where = '정의 ' + row + '행' + (blank(nm) ? '' : '(' + String(nm).trim() + ')');
      if (blank(nm)) { issues.push(where + ': 항목명이 비어 있어 건너뜁니다.'); return; }
      var start = num(pick(r, 'start')), len = num(pick(r, 'len'));
      if (start == null || start < base || start !== Math.floor(start)) { issues.push(where + ': 시작 Byte 「' + (pick(r, 'start') == null ? '' : pick(r, 'start')) + '」가 ' + base + ' 이상의 정수가 아닙니다.'); return; }
      if (len == null || len <= 0 || len !== Math.floor(len)) { issues.push(where + ': 길이 「' + (pick(r, 'len') == null ? '' : pick(r, 'len')) + '」가 1 이상의 정수가 아닙니다.'); return; }
      var lu = norm(pick(r, 'lenUnit')), bitv = num(pick(r, 'bit'));
      var unitBit = /^(bit|비트|b|bits)$/.test(lu) || (!lu && bitv != null);
      if (lu && !unitBit && !/^(byte|바이트|bytes|B)$/i.test(lu)) issues.push(where + ': 길이 단위 「' + pick(r, 'lenUnit') + '」를 몰라 Byte 로 봅니다.');
      var bit = unitBit ? (bitv == null ? 0 : bitv) : 0;
      if (unitBit && (bit < 0 || bit !== Math.floor(bit))) { issues.push(where + ': 시작 bit 가 0 이상의 정수가 아닙니다.'); return; }
      var nbits = unitBit ? len : len * 8;
      if (nbits > 64) { issues.push(where + ': 길이가 64 bit 를 넘어 읽지 않습니다.'); return; }
      var en = endianOf(pick(r, 'endian')), sg = signedOf(pick(r, 'signed'));
      if (en.bad) issues.push(where + ': 바이트 순서 「' + pick(r, 'endian') + '」를 몰라 빅엔디언으로 봅니다.');
      if (sg.bad) issues.push(where + ': 부호 「' + pick(r, 'signed') + '」를 몰라 부호 없음으로 봅니다.');
      var res = num(pick(r, 'res')), off = num(pick(r, 'offset'));
      if (res === 0) issues.push(where + ': Resolution 이 0 이라 환산값이 늘 Offset 입니다.');
      var msgv = pick(r, 'msg'), msg = idOf(msgv);
      if (!blank(msgv) && msg == null) { issues.push(where + ': 메시지 ID 「' + msgv + '」를 숫자로 읽지 못했습니다.'); return; }
      var ev = pick(r, 'enums'), enums = parseEnums(ev);
      if (!blank(ev) && !enums) issues.push(where + ': 열거값을 읽지 못했습니다 — 「0=정지; 1=주행」 형식으로 적어 주세요.');
      fields.push({
        msg: msg, name: String(nm).trim(),
        start: start - base, bit: bit, nbits: nbits, unitBit: unitBit, len: len,
        endian: en.v, signed: sg.v,
        res: res == null ? 1 : res, offset: off == null ? 0 : off,
        unit: blank(pick(r, 'unit')) ? '' : String(pick(r, 'unit')).trim(),
        min: num(pick(r, 'min')), max: num(pick(r, 'max')),
        invalid: parseInvalid(pick(r, 'invalid')), enums: enums,
        expect: blank(pick(r, 'expect')) ? null : pick(r, 'expect'),
        tol: num(pick(r, 'tol')),
        note: blank(pick(r, 'note')) ? '' : String(pick(r, 'note')).trim()
      });
    });
    // 정의 안의 메시지 ID 가 메시지 표에 없으면 표에 넣는다(길이는 항목 끝에서 계산 — 문서 값이 아니다)
    var msgIds = fields.map(function (f) { return f.msg; }).filter(function (x, i, a) { return x != null && a.indexOf(x) === i; });
    msgIds.forEach(function (id) {
      if (!messages.some(function (m) { return m.id === id; })) messages.push({ id: id, name: idLabel(id, settings.idLen), length: null });
    });
    if (fields.some(function (f) { return f.msg == null; }) && messages.length > 1)
      issues.push('메시지 ID 가 빈 항목이 있습니다 — 메시지가 여럿이면 항목마다 메시지 ID 를 적어 주세요(빈 항목은 모든 메시지에 붙습니다).');
    messages.forEach(function (m) {
      var fs = fieldsOf({ fields: fields }, m.id);
      var end = fs.reduce(function (a, f) { return Math.max(a, span(f).end); }, settings.idStart + settings.idLen);
      m.calcLength = end;                                  // 항목 끝에서 계산한 길이
      if (m.length != null && end > m.length) issues.push('메시지 ' + m.name + ': 항목이 정의 길이 ' + m.length + ' Byte 를 넘어 ' + end + ' Byte 까지 걸칩니다.');
      overlaps(fs).forEach(function (o) { issues.push('메시지 ' + m.name + ': 「' + o[0] + '」와 「' + o[1] + '」가 같은 bit 를 씁니다.'); });
    });
    if (!messages.length) overlaps(fields).forEach(function (o) { issues.push('「' + o[0] + '」와 「' + o[1] + '」가 같은 bit 를 씁니다.'); });
    return { fields: fields, messages: messages, settings: settings, issues: issues };
  }
  function fieldsOf(p, id) { return p.fields.filter(function (f) { return f.msg == null || f.msg === id; }); }
  // 항목이 걸치는 바이트 [start, end)
  function span(f) { return { start: f.start, end: f.start + Math.ceil((f.bit + f.nbits) / 8) }; }
  // 항목이 쓰는 bit 를 '바이트:bit' 로 센다(겹침 검사·바이트 지도 공용)
  function bitsOf(f) {
    var out = [], n = span(f).end - f.start;
    for (var k = 0; k < f.nbits; k++) {
      var pos = f.bit + k;                                // 붙인 정수의 최하위 bit 에서 센 위치
      var byteFromLow = Math.floor(pos / 8), b = pos % 8;
      var idx = f.endian === 'little' ? f.start + byteFromLow : f.start + (n - 1 - byteFromLow);
      out.push(idx * 8 + b);
    }
    return out;
  }
  function overlaps(fs) {
    var owner = {}, out = [], seen = {};
    fs.forEach(function (f) {
      bitsOf(f).forEach(function (k) {
        if (owner[k] != null && owner[k] !== f.name) { var key = owner[k] + '|' + f.name; if (!seen[key]) { seen[key] = 1; out.push([owner[k], f.name]); } }
        else owner[k] = f.name;
      });
    });
    return out;
  }

  /* ---------- 항목 잘라내기 ---------- */
  function extract(bytes, f) {
    var sp = span(f);
    if (sp.end > bytes.length) return null;
    var acc = BigInt(0), n = sp.end - sp.start;
    for (var i = 0; i < n; i++) {
      var b = BigInt(f.endian === 'little' ? bytes[sp.start + n - 1 - i] : bytes[sp.start + i]);
      acc = (acc << BigInt(8)) | b;
    }
    var mask = (BigInt(1) << BigInt(f.nbits)) - BigInt(1);
    var u = (acc >> BigInt(f.bit)) & mask;
    var s = u;
    if (f.signed && f.nbits > 1 && (u >> BigInt(f.nbits - 1)) & BigInt(1)) s = u - (BigInt(1) << BigInt(f.nbits));
    return { unsigned: Number(u), raw: Number(s), rawHex: '0x' + u.toString(16).toUpperCase().padStart(Math.ceil(f.nbits / 4), '0') };
  }
  function physical(raw, f) {
    var d = Math.max(decimals(f.res), decimals(f.offset));
    return round(raw * f.res + f.offset, Math.min(d + 0, 12));
  }

  /* ---------- 기대값 비교 ---------- */
  function check(fr, f, expect) {
    if (expect == null || String(expect).trim() === '') return null;
    var e = String(expect).trim();
    if (fr.value == null) return { expect: e, pass: false, why: '값이 없음' };
    var en = num(e);
    if (en == null) {                                      // 글자 기대값은 열거 이름과 맞춘다
      var pass = fr.label != null && norm(fr.label) === norm(e);
      return { expect: e, pass: pass, why: pass ? '' : '기대 「' + e + '」 · 실제 「' + (fr.label == null ? fr.value : fr.label) + '」' };
    }
    if (/^-?0x/i.test(e) || (/^[0-9a-f]+h$/i.test(e))) {  // 16진수 기대값은 raw 와 맞춘다
      var p2 = en === fr.unsigned || en === fr.raw;
      return { expect: e, pass: p2, why: p2 ? '' : '기대 raw ' + e + ' · 실제 ' + fr.rawHex };
    }
    var tol = f.tol != null ? f.tol : Math.abs(f.res) / 2;
    var diff = Math.abs(fr.value - en);
    var ok = diff <= tol + 1e-9;
    return { expect: e, pass: ok, why: ok ? '' : '기대 ' + en + ' · 실제 ' + fr.value + ' (차이 ' + round(diff, 6) + ', 허용 ±' + round(tol, 6) + ')' };
  }

  /* ---------- 한 줄 해석 ---------- */
  // line = { no, label, hex, expect:{항목명:값} }
  function decode(p, line) {
    var out = { no: line.no, label: line.label || '', hex: line.hex, bytes: [], msg: null, fields: [], map: [], issues: [], verdict: null };
    var ph = parseHex(line.hex);
    out.bytes = ph.bytes;
    if (ph.error) { out.issues.push({ level: 'error', text: ph.error }); return out; }
    var s = p.settings, msg = null;
    if (p.messages.length <= 1 && !p.fields.some(function (f) { return f.msg != null; })) msg = p.messages[0] || { id: null, name: '(단일 메시지)', length: null, calcLength: null };
    else {
      if (out.bytes.length < s.idStart + s.idLen) { out.issues.push({ level: 'error', text: '메시지 ID 를 읽을 만큼 데이터가 없습니다(' + out.bytes.length + ' Byte).' }); return out; }
      var id = 0;
      for (var i = 0; i < s.idLen; i++) id = id * 256 + out.bytes[s.idStart + i];
      msg = p.messages.filter(function (m) { return m.id === id; })[0];
      if (!msg) { out.issues.push({ level: 'error', text: '미정의 메시지 ID ' + idLabel(id, s.idLen) + ' — 프로토콜 정의에 없습니다.' }); markMap(out, [], null, s); return out; }
    }
    out.msg = msg;
    var fs = msg.id == null ? p.fields : fieldsOf(p, msg.id);
    var defLen = msg.length != null ? msg.length : msg.calcLength;
    var n = out.bytes.length;
    if (defLen != null && n < defLen) out.issues.push({ level: 'error', text: '길이 부족 — 정의 ' + defLen + ' Byte 인데 ' + n + ' Byte 만 받았습니다(' + (defLen - n) + ' Byte 모자람).' });
    if (defLen != null && n > defLen) out.issues.push({ level: 'warn', text: '정의 ' + defLen + ' Byte 보다 ' + (n - defLen) + ' Byte 깁니다 — 넘친 바이트는 해석하지 않습니다.' });
    var lineExpect = line.expect || {}, used = {};
    fs.forEach(function (f, fi) {
      var fr = { name: f.name, msg: msg.name, pos: posText(f, s.base), unit: f.unit, raw: null, unsigned: null, rawHex: '', bytesHex: '', value: null, label: null, status: 'ok', note: '', check: null, fi: fi };
      var ex = extract(out.bytes, f);
      var sp = span(f);
      fr.bytesHex = toHex(out.bytes.slice(sp.start, Math.min(sp.end, n)));
      if (!ex) { fr.status = 'short'; fr.note = '데이터가 ' + (sp.end - n) + ' Byte 모자라 읽지 못함'; }
      else {
        fr.raw = ex.raw; fr.unsigned = ex.unsigned; fr.rawHex = ex.rawHex;
        if (f.invalid.indexOf(ex.unsigned) >= 0 || f.invalid.indexOf(ex.raw) >= 0) { fr.status = 'invalid'; fr.note = '무효값(' + ex.rawHex + ') — 센서 없음·측정 불가 표시'; }
        else {
          fr.value = physical(ex.raw, f);
          if (f.enums) {
            if (f.enums[ex.raw] != null) fr.label = f.enums[ex.raw];
            else { fr.status = 'enum'; fr.note = '열거표에 없는 값 ' + ex.raw; }
          }
          if (fr.status === 'ok' && ((f.min != null && fr.value < f.min - 1e-9) || (f.max != null && fr.value > f.max + 1e-9))) {
            fr.status = 'range'; fr.note = '범위 이탈 — 허용 ' + (f.min == null ? '' : f.min) + ' ~ ' + (f.max == null ? '' : f.max) + (f.unit ? ' ' + f.unit : '');
          }
        }
      }
      var key = findExpectKey(lineExpect, f.name);
      if (key != null) used[key] = 1;
      fr.check = check(fr, f, key != null ? lineExpect[key] : f.expect);
      out.fields.push(fr);
    });
    Object.keys(lineExpect).forEach(function (k) { if (!used[k]) out.issues.push({ level: 'warn', text: '기대값 항목 「' + k + '」가 이 메시지 정의에 없습니다.' }); });
    var counts = { short: 0, invalid: 0, enum: 0, range: 0 };
    out.fields.forEach(function (fr) { if (counts[fr.status] != null) counts[fr.status]++; });
    if (counts.range) out.issues.push({ level: 'warn', text: '범위 이탈 ' + counts.range + '개 항목' });
    if (counts.enum) out.issues.push({ level: 'warn', text: '열거표에 없는 값 ' + counts.enum + '개 항목' });
    if (counts.invalid) out.issues.push({ level: 'info', text: '무효값 ' + counts.invalid + '개 항목' });
    markMap(out, fs, defLen, s);
    var und = out.map.filter(function (m) { return m.kind === 'undef'; }).map(function (m) { return m.i; });
    if (und.length) out.issues.push({ level: 'warn', text: '미정의 바이트 ' + und.length + '개 — Byte ' + und.join(', ') + ' 는 어느 항목에도 속하지 않습니다.' });
    var checks = out.fields.filter(function (fr) { return fr.check; });
    if (checks.length) out.verdict = checks.every(function (fr) { return fr.check.pass; }) ? 'pass' : 'fail';
    return out;
  }
  function findExpectKey(obj, name) {
    var t = norm(name);
    for (var k in obj) if (norm(k) === t) return k;
    return null;
  }
  function posText(f, base) {
    if (!f.unitBit) return 'Byte ' + (f.start + base) + (f.len > 1 ? '~' + (f.start + base + f.len - 1) : '');
    var sp = span(f);
    return 'Byte ' + (f.start + base) + (sp.end - sp.start > 1 ? '~' + (sp.end - 1 + base) : '') + ' · bit ' + f.bit + (f.nbits > 1 ? '~' + (f.bit + f.nbits - 1) : '');
  }
  // 바이트 지도: 바이트마다 누가 쓰는가. kind = id | field | partial | undef | extra
  function markMap(out, fs, defLen, s) {
    var owners = out.bytes.map(function () { return []; });
    var bitsUsed = out.bytes.map(function () { return 0; });
    fs.forEach(function (f, fi) {
      var seen = {};
      bitsOf(f).forEach(function (k) {
        var idx = Math.floor(k / 8);
        if (idx >= out.bytes.length) return;
        bitsUsed[idx]++;
        if (!seen[idx]) { seen[idx] = 1; owners[idx].push(fi); }
      });
    });
    out.map = out.bytes.map(function (b, i) {
      var isId = out.msg && out.msg.id != null && i >= s.idStart && i < s.idStart + s.idLen;
      if (!out.msg) isId = i >= s.idStart && i < s.idStart + s.idLen;
      var kind = isId ? 'id' : owners[i].length ? (bitsUsed[i] >= 8 ? 'field' : 'partial') : (defLen != null && i >= defLen ? 'extra' : 'undef');
      return { i: i + s.base, hex: hex2(b), bin: ('0000000' + b.toString(2)).slice(-8), owners: owners[i], kind: kind };
    });
  }

  /* ---------- 여러 줄 ---------- */
  // 붙여넣은 글: 한 줄에 한 메시지. 「라벨 | 16진수 => 항목=값; 항목=값」 — 라벨·기대값은 선택. # 로 시작하면 주석.
  function parseLines(text) {
    var out = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (ln, i) {
      var t = ln.trim();
      if (!t || /^(#|\/\/)/.test(t)) return;
      var expect = {}, label = '';
      var ar = t.split('=>');
      if (ar.length > 1) {
        ar.slice(1).join('=>').split(/[;,]/).forEach(function (kv) {
          var m = kv.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
          if (m) expect[m[1]] = m[2];
        });
        t = ar[0].trim();
      }
      var bar = t.indexOf('|');
      if (bar >= 0) { label = t.slice(0, bar).trim(); t = t.slice(bar + 1).trim(); }
      out.push({ no: i + 1, label: label, hex: t, expect: expect });
    });
    return out;
  }
  // 엑셀·CSV 의 행: 데이터 열 + (라벨 열) + 「기대_항목명」 열
  var DATA_COLS = { hex: ['데이터', '수신데이터', '16진수', 'hex', 'raw', 'rawdata', 'data', 'payload', '수신값'], label: ['라벨', '구분', '수신시각', '시각', '시간', '번호', 'label', 'time', 'timestamp'] };
  function rowsToLines(rows) {
    var out = [];
    (rows || []).forEach(function (r, i) {
      var hk = null, lk = null, keys = Object.keys(r);
      keys.forEach(function (k) {
        if (hk == null && DATA_COLS.hex.map(norm).indexOf(norm(k)) >= 0) hk = k;
        if (lk == null && DATA_COLS.label.map(norm).indexOf(norm(k)) >= 0) lk = k;
      });
      if (hk == null) hk = keys[0];
      if (hk == null || blank(r[hk])) return;
      var expect = {};
      keys.forEach(function (k) {
        var m = String(k).match(/^\s*기대(?:값)?\s*[_:\-.( ]\s*(.+?)\)?\s*$/) || String(k).match(/^\s*expected?[_:\-. ]\s*(.+?)\s*$/i);
        if (m && !blank(r[k])) expect[m[1]] = r[k];
      });
      out.push({ no: i + 2, label: lk == null || blank(r[lk]) ? '' : String(r[lk]), hex: String(r[hk]), expect: expect });
    });
    return out;
  }
  function decodeAll(p, lines) {
    var results = lines.map(function (ln) { return decode(p, ln); });
    var sum = { lines: results.length, clean: 0, warned: 0, errors: 0, pass: 0, fail: 0, unchecked: 0, byMsg: {} };
    results.forEach(function (r) {
      var lv = r.issues.map(function (x) { return x.level; });
      if (lv.indexOf('error') >= 0) sum.errors++; else if (lv.indexOf('warn') >= 0) sum.warned++; else sum.clean++;
      if (r.verdict === 'pass') sum.pass++; else if (r.verdict === 'fail') sum.fail++; else sum.unchecked++;
      var k = r.msg ? r.msg.name : '(해석 못 함)';
      sum.byMsg[k] = (sum.byMsg[k] || 0) + 1;
    });
    return { results: results, summary: sum };
  }
  function levelOf(r) {
    var lv = r.issues.map(function (x) { return x.level; });
    return lv.indexOf('error') >= 0 ? 'error' : lv.indexOf('warn') >= 0 ? 'warn' : 'ok';
  }

  /* ---------- 표 붙여넣기 · AI 답 읽기 ---------- */
  // 엑셀·워드 표를 복사해 붙인 글(탭 구분) 또는 CSV. 첫 줄이 머리글.
  function parseTable(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf('\t') >= 0 ? '\t' : lines[0].indexOf('|') >= 0 ? '|' : ',';
    var cut = function (l) {
      var c = l.split(sep).map(function (x) { return x.trim(); });
      if (sep === '|') { if (c[0] === '') c.shift(); if (c[c.length - 1] === '') c.pop(); }
      return c;
    };
    var head = cut(lines[0]);
    return lines.slice(1).filter(function (l) { return !/^\s*\|?\s*:?-{2,}/.test(l); }).map(function (l) {
      var c = cut(l), o = {};
      head.forEach(function (h, i) { o[h] = c[i] == null ? '' : c[i]; });
      return o;
    });
  }
  var FIELD_HEAD = ['메시지ID', '항목명', '시작Byte', '시작bit', '길이', '길이단위', '바이트순서', '부호', 'Resolution', 'Offset', '단위', '최소', '최대', '무효값', '열거값', '기대값', '허용오차', '비고'];
  var FIELD_KEYS = ['msg', 'name', 'start', 'bit', 'len', 'lenUnit', 'endian', 'signed', 'res', 'offset', 'unit', 'min', 'max', 'invalid', 'enums', 'expect', 'tol', 'note'];
  var MSG_HEAD = ['메시지ID', '이름', '길이'];
  // 머리글이 제각각인 행을 화면 편집용 표준 머리글로 옮긴다(값은 그대로).
  function canonical(rows, msgs) {
    var head = msgs ? MSG_HEAD : FIELD_HEAD, keys = msgs ? ['id', 'name', 'length'] : FIELD_KEYS, tbl = msgs ? MSG_ALIASES : ALIASES;
    return (rows || []).map(function (r) {
      var o = {};
      keys.forEach(function (k, i) { var v = pick(r, k, tbl); o[head[i]] = v == null ? '' : v; });
      return o;
    }).filter(function (o) { return head.some(function (h) { return !blank(o[h]); }); });
  }
  function aiPrompt(docText, base) {
    return [
      '아래는 통신 프로토콜 문서에서 옮긴 글입니다. 데이터 항목 정의를 표로 바꿔 주세요.',
      '탭으로 구분한 표 하나만 ```tsv 코드 블록 안에 주세요. 첫 줄 머리글은 정확히 다음과 같습니다:',
      FIELD_HEAD.join('\t'),
      '규칙: 시작Byte 는 ' + (base === 1 ? '1' : '0') + ' 부터 셉니다. 길이단위는 Byte 또는 bit. 바이트순서는 빅 또는 리틀. 부호는 있음 또는 없음.',
      '열거값은 「0=정지; 1=주행」 형식. 문서에 없는 값은 빈칸으로 두고 추측하지 마세요.',
      '', '--- 문서 ---', String(docText || '')
    ].join('\n');
  }
  function parseAiReply(reply) {
    var s = String(reply || ''), m = s.match(/```(?:tsv|csv|text)?\s*\n([\s\S]*?)```/i);
    var rows = parseTable(m ? m[1] : s);
    return rows.filter(function (r) { return !blank(pick(r, 'name')); });
  }

  /* ---------- 엑셀 내보내기용 행 ---------- */
  var ST_TEXT = { ok: '정상', short: '길이 부족', invalid: '무효값', enum: '열거표 밖', range: '범위 이탈' };
  var VERDICT_TEXT = { pass: '합격', fail: '불합격' };
  function exportRows(all) {
    var detail = [], lines = [], warns = [], wide = {};
    all.results.forEach(function (r) {
      var mname = r.msg ? r.msg.name : '';
      lines.push({ 줄: r.no, 라벨: r.label, 메시지: mname || '(해석 못 함)', 길이Byte: r.bytes.length, 상태: { ok: '정상', warn: '경고', error: '오류' }[levelOf(r)],
        판정: VERDICT_TEXT[r.verdict] || '기대값 없음', 경고: r.issues.map(function (x) { return x.text; }).join(' / '), 데이터: toHex(r.bytes) });
      r.issues.forEach(function (x) { warns.push({ 줄: r.no, 라벨: r.label, 메시지: mname, 수준: { error: '오류', warn: '경고', info: '참고' }[x.level], 내용: x.text }); });
      r.fields.forEach(function (f) {
        detail.push({ 줄: r.no, 라벨: r.label, 메시지: mname, 항목: f.name, 위치: f.pos, 원시바이트: f.bytesHex, raw16진: f.rawHex, raw: f.raw,
          환산값: f.value, 단위: f.unit, 열거: f.label == null ? '' : f.label, 상태: ST_TEXT[f.status], 비고: f.note,
          기대값: f.check ? f.check.expect : '', 판정: f.check ? (f.check.pass ? '합격' : '불합격') : '', 판정사유: f.check ? f.check.why : '' });
      });
      if (r.msg) {
        var w = wide[mname] = wide[mname] || [];
        var row = { 줄: r.no, 라벨: r.label };
        r.fields.forEach(function (f) {
          var k = f.name + (f.unit ? '(' + f.unit + ')' : '');
          row[k] = f.label != null ? f.label : f.value == null ? '' : f.value;
        });
        row.판정 = VERDICT_TEXT[r.verdict] || '';
        w.push(row);
      }
    });
    return { detail: detail, lines: lines, warns: warns, wide: wide };
  }

  /* ---------- 예제: 가짜 지게차 원격모니터링 프로토콜 ---------- */
  // 실제 사내 프로토콜이 아니다. 경고가 골고루 나오게 만든 연습용이다.
  function sample() {
    var F = function (msg, name, start, bit, len, lu, en, sg, res, off, unit, min, max, inv, enums, note) {
      return { 메시지ID: msg, 항목명: name, 시작Byte: start, 시작bit: bit, 길이: len, 길이단위: lu, 바이트순서: en, 부호: sg,
        Resolution: res, Offset: off, 단위: unit, 최소: min, 최대: max, 무효값: inv, 열거값: enums, 기대값: '', 허용오차: '', 비고: note || '' };
    };
    var fields = [
      F('0x01', '시퀀스', 1, '', 1, 'Byte', '빅', '없음', 1, 0, '', '', '', '', '', '전송할 때마다 1 씩 증가'),
      F('0x01', '가동시간', 2, '', 4, 'Byte', '빅', '없음', 0.1, 0, 'h', 0, 100000, '0xFFFFFFFF', ''),
      F('0x01', '주행속도', 6, '', 2, 'Byte', '빅', '없음', 0.1, 0, 'km/h', 0, 30, '', ''),
      F('0x01', '제한속도 설정값', 8, '', 1, 'Byte', '빅', '없음', 1, 0, 'km/h', 5, 25, '', ''),
      F('0x01', '운전모드', 9, 0, 2, 'bit', '빅', '없음', 1, 0, '', '', '', '', '0=정지; 1=주행; 2=작업; 3=충전'),
      F('0x01', '안전벨트', 9, 2, 1, 'bit', '빅', '없음', 1, 0, '', '', '', '', '0=미착용; 1=착용'),
      F('0x01', '과부하 경고', 9, 3, 1, 'bit', '빅', '없음', 1, 0, '', '', '', '', '0=정상; 1=경고'),
      F('0x01', '작업량(리프트 횟수)', 10, '', 2, 'Byte', '리틀', '없음', 1, 0, '회', 0, 60000, '', '', '이 항목만 리틀엔디언'),
      F('0x01', '마스트 틸트각', 12, '', 2, 'Byte', '빅', '있음', 0.1, 0, '°', -10, 10, '', ''),
      F('0x01', '오류코드', 14, '', 1, 'Byte', '빅', '없음', 1, 0, '', '', '', '', '0=정상; 0x12=유압 과열; 0x21=배터리 저전압'),
      F('0x02', '배터리 전압', 1, '', 2, 'Byte', '빅', '없음', 0.01, 0, 'V', 40, 58, '0xFFFF', ''),
      F('0x02', '배터리 전류', 3, '', 2, 'Byte', '빅', '있음', 0.1, 0, 'A', -300, 300, '', '', '음수 = 방전'),
      F('0x02', 'SOC', 5, '', 1, 'Byte', '빅', '없음', 0.5, 0, '%', 0, 100, '0xFF', ''),
      F('0x02', '배터리 온도', 6, '', 1, 'Byte', '빅', '없음', 1, -40, '°C', -20, 60, '0xFF', ''),
      F('0x02', '충전 횟수', 7, '', 2, 'Byte', '리틀', '없음', 1, 0, '회', 0, 5000, '', ''),
      F('0x02', '충전상태', 9, '', 1, 'Byte', '빅', '없음', 1, 0, '', '', '', '', '0=방전; 1=충전중; 2=완충; 3=오류')
    ];
    var messages = [
      { 메시지ID: '0x01', 이름: '운행정보', 길이: 16 },
      { 메시지ID: '0x02', 이름: '배터리정보', 길이: 10 }
    ];
    var data = [
      '# 가짜 수신 데이터 — 「라벨 | 16진수 => 항목=기대값; ...」 라벨과 기대값은 선택입니다.',
      '09:00:01 | 01 05 00 00 30 39 00 55 0F 06 2C 01 FF E7 00 00 => 가동시간=1234.5; 제한속도 설정값=15; 운전모드=작업',
      '09:00:02 | 0x02, 0x14, 0x00, 0xFE, 0x3B, 0x99, 0x47, 0x2C, 0x03, 0x00 => SOC=76.5; 배터리 전압=51.3',
      '09:00:11 | 01060000303D00781E092D01000A1200',
      '09:00:12 | 02 13 88 00 64 D2 FF 2D 03 05',
      '09:00:21 | 01 07 00 00 30 41 00 00 0F 00',
      '09:00:22 | 07 01 02 03',
      '09:00:31 | 02 14 50 00 00 C8 3C 2E 03 02 AA => 충전상태=완충; 배터리 온도=20'
    ].join('\n');
    return { fields: fields, messages: messages, settings: { idStart: 0, idLen: 1, base: 0 }, data: data };
  }

  var api = { parseHex: parseHex, toHex: toHex, num: num, normalize: normalize, extract: extract, physical: physical,
    decode: decode, decodeAll: decodeAll, parseLines: parseLines, rowsToLines: rowsToLines, levelOf: levelOf,
    parseEnums: parseEnums, parseTable: parseTable, aiPrompt: aiPrompt, parseAiReply: parseAiReply, span: span,
    idLabel: idLabel, sample: sample, canonical: canonical, exportRows: exportRows, ST_TEXT: ST_TEXT,
    ALIASES: ALIASES, FIELD_HEAD: FIELD_HEAD, MSG_HEAD: MSG_HEAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Proto = api;
})(this);
