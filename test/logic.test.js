/* 해석 규칙 고정 — node test/logic.test.js. 기대값은 기획서(v2 SRS · 추가 수정 기획안)의 인수 기준에서 가져왔다 */
'use strict';
var H = require('../js/hcespn.js');
var passed = 0, failed = 0;
function ok(c, label, d) { if (c) passed++; else { failed++; console.log('  X ' + label + (d != null ? '\n      ' + d : '')); } }
function eq(g, w, label) { ok(JSON.stringify(g) === JSON.stringify(w), label, '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g)); }
var S = H.sample(), CTX = { protocols: S.protocols, hcespns: S.hcespns };
function def(no) { return S.hcespns.filter(function (d) { return d.no === no; })[0]; }
function hx(s) { return H.parseHex(s).bytes; }

/* 1. HEX 정리 */
eq(H.parseHex('a1 1A\n0b,0x0C').bytes, [0xA1, 0x1A, 0x0B, 0x0C], '공백 · 줄바꿈 · 쉼표 · 0x 제거, 소문자 → 대문자');
eq(H.parseHex('A11A0B').clean, 'A11A0B', '붙여 쓴 HEX');
var bad = H.parseHex('A1 ZZ 0B');
ok(!bad.ok && bad.errors.length === 2 && bad.errors[0].pos === 4 && /「Z」/.test(bad.errors[0].msg) && bad.bytes.length === 0, '잘못된 글자는 위치와 함께 알리고 해석하지 않는다');
ok(/홀수\(3자\)/.test(H.parseHex('A1B').errors[0].msg) && /비어/.test(H.parseHex('  ').errors[0].msg), '홀수 자릿수 · 빈 입력');

/* 2. 프로토콜 표 붙여넣기 */
var tsv = 'S.P\tLength\tParameter Name\tHCESPN\n1\t1 byte\tRMS Message Type (= 0xA1)\t16\n2-7\t6 bytes\tDate & Time\t90\n8-31\t24 bytes\tTotal Shift Mode & Actual Gear Distribution (sec)\t127';
var p1 = H.parseProtocolTable(tsv);
eq([p1.ok, p1.rows.length, p1.msgType, p1.rows.map(function (r) { return [r.sp, r.len, r.hcespn].join(':'); })], [true, 3, 0xA1, ['1:1:16', '2:6:90', '8:24:127']], 'A1 표 — 3개 필드 · Message Type 자동 추출(비고 열 없어도 됨)');
var p2 = H.parseProtocolTable('HCESPN\t비고\tParameter Name\tLength\tS.P\n16\t\tRMS Message Type (= 0xB1)\t1\t1\n90\t메모\tDate & Time\t6\t2-7\n128\t\tTorque\t64 bytes\t8-71');
eq([p2.rows.length, p2.msgType, p2.rows[2].sp, p2.rows[2].len, p2.rows[1].note], [3, 0xB1, 8, 64, '메모'], 'B1 표 — 열 순서가 달라도 머리글로 읽는다');
var p3 = H.parseProtocolTable(tsv.replace('8-31', '8-51'));
ok(p3.rows[2].len === 24 && /S\.P 8-51\(44 bytes\)와 Length 24 bytes 가 맞지 않습니다/.test(p3.rows[2].flags[0]), 'S.P 범위와 Length 가 어긋나면 고치지 않고 알린다(8-51 · 24 bytes)');
var p4 = H.parseProtocolTable('S.P: 1\nLength: 1 byte\nParameter Name: RMS Message Type (= 0xA1)\nHCESPN: 16\nS.P: 2-7\nLength: 6 bytes\nParameter Name: Date & Time\nHCESPN: 90');
eq([p4.rows.length, p4.rows[1].sp, p4.rows[1].len, p4.msgType], [2, 2, 6, 0xA1], '「S.P: … / Length: …」 꼴 글도 읽는다');
eq(H.parseProtocolTable('| S.P | Length | Parameter Name | HCESPN |\n|---|---|---|---|\n| 1 | 1 | Type | 16 |').rows.length, 1, '마크다운 표');
ok(H.parseProtocolTable('1\t1\tType\t16\n2-3\t2\tX\t5').issues[0].level === 'info', '머리줄이 없으면 열 순서를 가정했다고 알린다');
ok(!H.parseProtocolTable('이름\t값\na\tb').ok && !H.parseProtocolTable('').ok, 'S.P 열이 없으면 읽지 않는다');
ok(/필수 열이 없습니다: Length, HCESPN/.test(H.parseProtocolTable('S.P\tParameter Name\n1\tType').issues[0].msg), '필수 열 누락');
ok(H.parseProtocolTable('S.P\tLength\tParameter Name\tHCESPN\n2-7\t\tDate\t90').rows[0].len === 6, 'Length 가 비면 S.P 범위에서');

/* 3. 프로토콜 검증 */
var A1 = S.protocols[0], B1 = S.protocols[1];
eq([H.validateProtocol(A1, S.protocols).length, H.validateProtocol(B1, S.protocols).length, H.validateProtocol(A1, S.protocols).errors.length], [31, 71, 0], '메시지 길이 — A1 = 31 bytes, B1 = 71 bytes');
var ov = H.blankProtocol({ name: 'x', sender: 'MCU', msg_type: 1, rows: [{ sp: 1, len: 2, name: 'a', hcespn: '1' }, { sp: 2, len: 1, name: 'b', hcespn: '2' }, { sp: 6, len: 1, name: '', hcespn: '' }] });
var vo = H.validateProtocol(ov, []);
ok(/S\.P 2 — 앞 항목\(끝 2\)과 Byte 가 겹칩니다/.test(vo.errors.join()) && /Byte 3~5 는 정의되지 않은 구간/.test(vo.warnings.join()) && /HCESPN 번호가 없어/.test(vo.warnings.join()), 'Start Position 겹침 · 빈 구간 · HCESPN 없음');
ok(/같은 발신자 · Message Type · 버전/.test(H.validateProtocol(H.blankProtocol({ name: 'dup', sender: 'MCU', msg_type: 0xA1, rows: A1.rows }), S.protocols).errors.join()), '등록된 프로토콜과 중복');
ok(/다릅니다/.test(H.validateProtocol(Object.assign(H.clone(A1), { id: 'z', msg_type: 0xA2 }), []).warnings.join()), '첫 줄의 Message Type 과 기본정보가 다르면 알린다');
ok(H.validateProtocol(H.blankProtocol(), []).errors.length >= 3, '빈 프로토콜은 저장 불가');

/* 4. 환산 */
eq([H.toUint(hx('3C000000'), 'LE'), H.toUint(hx('78000000'), 'LE'), H.toUint(hx('0000003C'), 'BE'), H.toUint(hx('FFFFFFFF'), 'LE'), H.toUint(hx('FFFFFFFFFFFF'), 'LE')], [60, 120, 60, 4294967295, 281474976710655], 'Little Endian 3C 00 00 00 → 60 · 78 00 00 00 → 120 · 큰 값도 정확');
eq(H.decodeDef(hx('1A0B040D1E2D'), def('90'), 2)[0].text, '2026-11-04 13:30:45', '날짜 1A 0B 04 0D 1E 2D → 2026-11-04 13:30:45');
eq(H.decodeDef(hx('1A0B0C0E1E2D'), def('90'), 2)[0].text, '2026-11-12 14:30:45', '날짜 1A 0B 0C 0E 1E 2D → 2026-11-12 14:30:45');
var dt = H.decodeDef(hx('1A0D0C0E1E2D'), def('90'), 2);
ok(dt[0].status === 'error' && dt[0].text === '' && /Month 13/.test(dt[0].note) && dt[2].status === 'error', '월이 13 이면 날짜로 환산하지 않는다');
ok(H.decodeDef(hx('1A021E000000'), def('90'), 2)[0].status === 'error', '없는 날짜(2월 30일)');
eq([H.decodeDef([0xA1], def('16'), 1)[0].text, H.decodeDef([0xB1], def('16'), 1)[0].text], ['Total Shift Mode & Actual Gear Distribution', 'Total Engine Actual Percent Torque Distribution'], '열거형 A1 · B1');
ok(H.decodeDef([0xC9], def('16'), 1)[0].status === 'warn' && H.decodeDef([0xC9], def('16'), 1)[0].text === '0xC9', '열거표에 없는 값은 HEX 그대로 + 확인');
var arr = H.decodeDef(hx('3C000000' + '78000000' + '100E0000' + '18150000' + '84030000' + '2D000000'), def('127'), 8);
eq(arr.map(function (s) { return [s.name, s.start, s.value, s.unit].join('|'); }), ['Shift Mode – Manual|8|60|sec', 'Shift Mode – Auto|12|120|sec', 'Actual Gear – F1|16|3600|sec', 'Actual Gear – F2|20|5400|sec', 'Actual Gear – R1|24|900|sec', 'Actual Gear – R2|28|45|sec'], '반복 배열 — 4 bytes 씩, 이름과 절대 위치');
var lin = H.blankDef({ no: '5', name: 'Temp', length: 2, type: 'uint', endian: 'BE', resolution: 0.1, offset: -40, unit: '℃', min: -40, max: 150 });
var l1 = H.decodeDef(hx('0320'), lin, 3)[0];
ok(Math.abs(l1.value - 40) < 1e-9 && l1.text === '40 ℃' && l1.status === 'ok' && /RAW × 0.1 \+ -40 \(Big Endian\)/.test(l1.formula), '선형 환산 Physical = RAW × Resolution + Offset');
ok(H.decodeDef(hx('FFFF'), lin, 3)[0].status === 'warn' && /유효범위/.test(H.decodeDef(hx('FFFF'), lin, 3)[0].note), 'Data Range 밖은 확인');
var fd = H.blankDef({ no: '6', name: 'F', length: 2, type: 'formula', formula: '(RAW - 100) * RES / 2', resolution: 4 });
eq(H.decodeDef(hx('C800'), fd, 1)[0].value, 200, '사용자 정의 환산식');
ok(H.decodeDef(hx('C800'), Object.assign({}, fd, { formula: 'RAW / 0' }), 1)[0].status === 'error' && H.decodeDef(hx('C800'), Object.assign({}, fd, { formula: 'RAW / 0' }), 1)[0].value == null, '환산식 오류면 값을 만들지 않고 원본을 남긴다');
['alert(1)', 'RAW;1', 'X+1', '(1+2', ''].forEach(function (e) { var t = false; try { H.evalFormula(e, { RAW: 1 }); } catch (x) { t = true; } ok(t, '허용하지 않는 수식 — ' + e); });
ok(H.decodeDef(hx('A1B2'), H.blankDef({ no: '7', name: 'H', length: 2, type: 'hex' }), 1)[0].text === 'A1 B2', 'HEX 그대로');

/* 5. 특수조건 */
var d128 = H.clone(def('128')), four = hx('010203FF');
ok(H.decodeDef(four.concat(new Array(60).fill(0)), d128, 8)[0].status === 'ok', '적용 범위가 「확인 필요」인 특수조건은 적용하지 않는다');
d128.special[0].scope = 'each';
var e1 = H.decodeDef(four.concat(hx('3C000000')).concat(new Array(56).fill(0)), d128, 8);
eq([e1[0].status, e1[0].text, e1[0].value, e1[1].status, e1[1].value], ['na', 'Not available', null, 'ok', 60], '하위 필드마다 — byte4 = 0xFF 인 필드만 Not available(수치 없음)');
d128.special[0].scope = 'all';
ok(H.decodeDef(four.concat(new Array(60).fill(0)), d128, 8).every(function (s) { return s.status === 'na'; }), '전체 범위 — 조건이 맞으면 모든 하위 필드가 N/A');

/* 6. 전체 해석 */
var r = H.analyze(S.raws[0], CTX);
eq([r.status, r.bytes.length, r.msg_type, r.protocol.name, r.expected, r.issues.length], ['ok', 31, 0xA1, 'Total Shift Mode & Actual Gear Distribution', 31, 0], 'A1 예시 — Message Type 자동 식별 · 31 bytes · 정상');
eq(r.params.map(function (p) { return p.subs.filter(function (s) { return !s.child; }).length; }), [1, 1, 6], '항목별 하위 결과 수');
eq([r.map[0], r.map[1], r.map[7], r.map[10], r.map[11], r.map[30]], [{ p: 0, s: 0 }, { p: 1, s: 1 }, { p: 2, s: 0 }, { p: 2, s: 0 }, { p: 2, s: 1 }, { p: 2, s: 5 }], 'Byte → Parameter · 하위 필드 지도(Hover 용) — Byte 8~11 은 같은 묶음');
var rb = H.analyze(S.raws[1], CTX);
eq([rb.status, rb.bytes.length, rb.protocol.name, rb.params[2].subs.length, rb.issues[0].code], ['ok', 71, 'Total Engine Actual Percent Torque Distribution', 16, 'special'], 'B1 예시 — 71 bytes · 16개 구간 · 미확정 특수조건 알림');
var un = H.analyze('C9' + S.raws[0].slice(2), CTX);
ok(un.status === 'error' && un.issues[0].code === 'no-protocol' && un.params.length === 0 && /0xC9/.test(un.issues[0].msg), '등록되지 않은 Message Type — 해석하지 않고 등록 안내');
var noDef = H.analyze(S.raws[0], { protocols: S.protocols, hcespns: S.hcespns.filter(function (d) { return d.no !== '127'; }) });
ok(noDef.status === 'warn' && noDef.params[2].subs.length === 0 && /^3C 00 00 00/.test(noDef.params[2].raw) && /HCESPN 127 미등록/.test(noDef.params[2].note) && noDef.params[1].subs[0].text === '2026-11-12 14:30:45', 'HCESPN 미등록 — RAW HEX 는 그대로, 환산값 없음, 나머지는 해석');
var sh = H.analyze(S.raws[0].slice(0, 40), CTX);
ok(sh.status === 'error' && sh.issues[0].code === 'total' && /프로토콜 31 bytes, 실제 20 bytes/.test(sh.issues[0].msg) && sh.params[1].subs[0].text === '2026-11-12 14:30:45' && sh.params[2].subs.length === 0 && /모자랍니다\(13 \/ 24 bytes\)/.test(sh.params[2].note), '짧으면 읽을 수 있는 데까지만 해석하고 모자란 필드를 알린다');
var lg = H.analyze(S.raws[0] + 'AABB', CTX);
ok(lg.status === 'warn' && lg.map[31] === null && lg.map[32] === null && /2 bytes 깁니다 — Byte 32~33/.test(lg.issues[0].msg) && lg.params[2].subs[0].value === 60, '길면 초과 Byte 를 미정의 영역으로 보존');
ok(H.analyze('A1 ZZ', CTX).status === 'error' && H.analyze('A1 ZZ', CTX).issues[0].code === 'hex', '잘못된 HEX 는 해석 전에 멈춘다');
var mis = H.analyze(S.raws[0], { protocols: S.protocols, hcespns: S.hcespns.map(function (d) { return d.no === '90' ? Object.assign({}, d, { length: 7 }) : d; }) });
ok(mis.params[1].status === 'error' && mis.params[1].subs.length === 0 && /Length 6 bytes 와 HCESPN 90 의 Data Length 7 bytes 가 다릅니다/.test(mis.params[1].note), '프로토콜 Length 와 HCESPN Data Length 가 다르면 환산하지 않는다');

/* 7. 발신자 · 버전 */
var A1v2 = Object.assign(H.clone(A1), { id: 'p-a1-2', version: '1.1', rows: A1.rows.slice(0, 2).concat([{ sp: 8, len: 24, name: 'v1.1 이름', hcespn: '127', note: '' }]) });
var two = { protocols: S.protocols.concat([A1v2]), hcespns: S.hcespns };
var rv = H.analyze(S.raws[0], two);
ok(rv.protocol.version === '1.1' && rv.versions.length === 2 && rv.issues[0].code === 'version' && /가장 높은 v1.1/.test(rv.issues[0].msg), '버전이 여럿이면 가장 높은 것으로 해석하고 고르라고 알린다');
ok(H.analyze(S.raws[0], Object.assign({ protocolId: 'p-a1' }, two)).protocol.version === '1.0' && !H.analyze(S.raws[0], Object.assign({ protocolId: 'p-a1' }, two)).issues.length, '이전 버전을 골라 다시 해석');
ok(H.analyze(S.raws[0], { protocols: S.protocols.concat([Object.assign({}, A1v2, { archived: true })]), hcespns: S.hcespns }).versions.length === 1, '보관된 것은 자동 선택에서 빠진다');
eq(H.latest([{ version: '1.9' }, { version: '1.10' }, { version: '1.2' }]).map(function (x) { return x.version; }), ['1.10', '1.9', '1.2'], '버전 비교는 숫자로(1.10 > 1.9)');
var rm = Object.assign(H.clone(A1), { id: 'p-a1-r', sender: 'RMCU' }), ms = { protocols: S.protocols.concat([rm]), hcespns: S.hcespns };
ok(H.analyze(S.raws[0], ms).issues[0].code === 'sender' && H.analyze(S.raws[0], Object.assign({ sender: 'RMCU' }, ms)).protocol.sender === 'RMCU' && !H.analyze(S.raws[0], Object.assign({ sender: 'RMCU' }, ms)).issues.length, '같은 Type 이 여러 발신자에 있으면 발신자를 고르게 한다');
ok(/다른 발신자 MCU/.test(H.analyze(S.raws[0], { protocols: S.protocols, hcespns: S.hcespns, sender: '인증장치' }).issues[0].msg), '고른 발신자에 없으면 어디에 있는지 알려 준다');

/* 8. HCESPN 원문 구조화 · 검증 */
var t127 = 'HCESPN 127 — Total Shift Mode & Actual Gear Distribution\nData Length: 24 bytes\nResolution: 1 sec/bit\nOffset: 0\nEndianness: Little Endian\nByte 1-4: Shift Mode – Manual\nByte 5-8: Shift Mode – Auto\nByte 9-12: Actual Gear – F1\nByte 13-16: Actual Gear – F2\nByte 17-20: Actual Gear – R1\nByte 21-24: Actual Gear – R2';
var g = H.parseHcespnText(t127).def;
eq([g.no, g.name, g.length, g.type, g.endian, g.fields.length, g.fields[5].start, g.fields[5].len, g.fields[0].resolution, g.fields[0].unit], ['127', 'Total Shift Mode & Actual Gear Distribution', 24, 'array', 'LE', 6, 21, 4, 1, 'sec'], 'HCESPN 127 원문 → 하위 필드 6개');
eq(H.decodeDef(hx('3C000000'), Object.assign({}, g, { length: 4, fields: g.fields.slice(0, 1) }), 1)[0].value, 60, '구조화한 정의로 바로 해석');
var g90 = H.parseHcespnText('HCESPN 90 — Date & Time\nData Length: 6 bytes\nByte 1: Year\nResolution: 1 year/bit\nOffset: 2000 years\nByte 2: Month\n유효범위: 1~12\nByte 3: Day\nByte 4: Hour\nByte 5: Minute\nByte 6: Second').def;
eq([g90.type, g90.length, g90.fields[1].min, g90.fields[1].max], ['datetime', 6, 1, 12], '날짜 · 시간형으로 알아본다');
var g16 = H.parseHcespnText('HCESPN 16 — RMS Message Type\nA1 = Total Shift Mode\nB1 = Torque').def;
eq([g16.type, g16.enums], ['enum', { A1: 'Total Shift Mode', B1: 'Torque' }], '열거형');
var g128 = H.parseHcespnText('HCESPN 128 — Torque\nData Length: 64 bytes\nByte 1-4: T < 30%\nIf byte4 = 0xFF ⇒ Not available');
ok(g128.def.special.length === 1 && g128.def.special[0].scope === '확인 필요' && g128.def.special[0].equals === 255 && /적용 범위/.test(g128.notes.join()), '특수조건은 읽되 적용 범위는 「확인 필요」로 둔다');
ok(/번호를 찾지 못했습니다/.test(H.parseHcespnText('아무 글').notes.join()), '못 찾은 항목을 알린다');
ok(S.hcespns.every(function (d) { return H.validateDef(d, S.hcespns).errors.length === 0; }) && /적용 범위가 정해지지 않아/.test(H.validateDef(def('128'), S.hcespns).warnings.join()), '예시 정의 4개는 유효, 128 은 특수조건 확인 알림');
var vd = H.validateDef(H.blankDef({ no: '9', name: 'x', length: 8, type: 'array', fields: [{ name: 'a', start: 1, len: 4 }, { name: 'b', start: 4, len: 4 }, { name: 'c', start: 9, len: 2 }] }), []);
ok(/겹칩니다/.test(vd.errors.join()) && /Data Length\(8 bytes\)를 넘습니다/.test(vd.errors.join()), '하위 필드 겹침 · 길이 초과');
ok(/6 bytes\(Year/.test(H.validateDef(H.blankDef({ no: '9', length: 4, type: 'datetime' }), []).errors.join()) && /이미 있습니다/.test(H.validateDef(H.blankDef({ no: '90', length: 6, type: 'datetime' }), S.hcespns).errors.join()) && /환산식 오류/.test(H.validateDef(H.blankDef({ no: '9', length: 1, type: 'formula', formula: 'RAW +' }), []).errors.join()), '날짜형 길이 · 번호+버전 중복 · 수식 오류');

/* 9. 엑셀 · 내보내기 · 저장본 */
var rows = H.rowsFromSheet([['데이터 수신일자', '수신 시간', '메시지'], ['2026-11-12', '14:30:45', S.raws[0]], [46338, 0.5, S.raws[1]], ['2026-11-12', '14:32:00', 'ZZ'], ['', '', '']]);
eq(rows.map(function (x) { return [x.row, x.recv_date, x.recv_time, x.raw.length].join('|'); }), ['2|2026-11-12|14:30:45|62', '3|2026-11-12|12:00:00|142', '4|2026-11-12|14:32:00|2'], '엑셀 3열(수신일자 · 수신 시간 · 메시지) — 엑셀 날짜 · 시간 숫자도');
eq(H.rowsFromSheet([['2026-11-12', '10:00', 'A1'], ['2026-11-12', '10:01', 'B1']]).length, 2, '머리줄이 없으면 1 · 2 · 3열로');
eq(H.rowsFromSheet([['HEX', '시간', '날짜'], ['A1', '10:00', '2026-11-12']])[0].raw, 'A1', '머리줄이 있으면 이름으로 열을 찾는다');
var items = rows.map(function (x) { return Object.assign({}, x, { result: H.analyze(x.raw, CTX) }); });
eq(items.map(function (i) { return i.result.status; }), ['ok', 'ok', 'error'], '일부 행이 오류여도 나머지는 계속 분석');
var sh = H.exportSheets(items);
ok(Object.keys(sh).join() === '메시지요약,해석결과' && sh['메시지요약'].length === 4 && sh['메시지요약'][1][4] === '0xA1' && sh['메시지요약'][3][7] === '오류' && sh['해석결과'].some(function (x) { return x[8] === 'Shift Mode – Manual' && x[11] === 60 && x[12] === 'sec'; }), '엑셀 내보내기 — 수신일자 · 발신자 · Type · 프로토콜 버전 · 항목별 결과 · 오류');
var back = H.fromSaved(JSON.stringify({ protocols: [{ id: 'x', name: 'n', msg_type: 1, rows: [] }], hcespns: [{ id: 'y', no: '1' }] }));
ok(back.protocols[0].receiver === 'Server' && back.hcespns[0].endian === 'LE' && back.senders.join() === 'MCU,RMCU,인증장치' && back.analyses.length === 0, '저장본 읽기 — 빠진 칸은 기본값');
eq([H.fromSaved('{x'), H.fromSaved('{"protocols":[]}')], [null, null], '모르는 저장본은 읽지 않는다');
var before = JSON.stringify(S); H.analyze(S.raws[1], CTX); ok(JSON.stringify(S) === before, '해석이 등록정보를 바꾸지 않는다');

console.log('해석 규칙 테스트: 통과 ' + passed + ' · 실패 ' + failed);
process.exit(failed ? 1 : 0);
