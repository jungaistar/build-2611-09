/* 해석 규칙 고정 — node test/logic.test.js
 * 화면이 아니라 숫자가 틀리면 안 되는 도구다. 16진수 읽기 · 엔디언 · 부호 · bit 항목 · 환산 · 경고 · 판정을
 * 손으로 계산한 값과 대조한다. */
'use strict';
var P = require('../js/proto.js');
var passed = 0, failed = 0;
function ok(c, label, detail) { if (c) passed++; else { failed++; console.log('  X ' + label + (detail ? '\n      ' + detail : '')); } }
function eq(g, w, label) { ok(JSON.stringify(g) === JSON.stringify(w), label, '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g)); }
function has(list, word, label) { ok(list.some(function (x) { return String(x.text || x).indexOf(word) >= 0; }), label, JSON.stringify(list)); }

// 16진수 읽기 — 표기가 섞여도 같은 바이트
eq(P.parseHex('01 0A ff').bytes, [1, 10, 255], '공백 구분');
eq(P.parseHex('0x01,0x0A, 0xFF').bytes, [1, 10, 255], '0x · 콤마');
eq(P.parseHex('010AFF').bytes, [1, 10, 255], '붙여 쓰기');
eq(P.parseHex('01-0a:ff;').bytes, [1, 10, 255], '하이픈 · 콜론 · 세미콜론');
eq(P.parseHex('1 A FF').bytes, [1, 10, 255], '한 글자 토막은 한 바이트');
eq(P.parseHex('0102 03').bytes, [1, 2, 3], '긴 토막은 두 글자씩');
eq(P.parseHex('01h 0Ah').bytes, [1, 10], '끝의 h 표기');
ok(/홀수/.test(P.parseHex('010').error), '붙여 쓴 글자 수가 홀수면 오류');
ok(/「G」/.test(P.parseHex('01 0G').error), '16진수가 아닌 글자를 짚는다');
ok(/비어/.test(P.parseHex('  ').error), '빈 데이터');

// 바이트 항목: 엔디언 · 부호
function F(o) { return P.normalize({ fields: [Object.assign({ 항목명: 'x', 시작Byte: 0, 길이: 2 }, o)] }).fields[0]; }
eq(P.extract([0x12, 0x34], F({ 바이트순서: '빅' })).raw, 0x1234, '빅엔디언 0x1234');
eq(P.extract([0x12, 0x34], F({ 바이트순서: '리틀' })).raw, 0x3412, '리틀엔디언 0x3412');
eq(P.extract([0x12, 0x34], F({ 바이트순서: 'Intel' })).raw, 0x3412, 'Intel = 리틀');
eq(P.extract([0xFF, 0xE7], F({ 부호: '있음' })).raw, -25, '부호 있음 0xFFE7 = -25');
eq(P.extract([0xFF, 0xE7], F({})).raw, 65511, '부호 없음 0xFFE7 = 65511');
eq(P.extract([0x00, 0x00, 0x30, 0x39], F({ 길이: 4 })).raw, 12345, '4 Byte 정수');
eq(P.extract([0x12], F({})), null, '길이가 모자라면 읽지 않는다');

// bit 항목
var b = function (bit, len, extra) { return F(Object.assign({ 시작Byte: 0, 시작bit: bit, 길이: len, 길이단위: 'bit' }, extra || {})); };
eq(P.extract([0x06], b(0, 2)).raw, 2, 'bit0~1 of 0b0110 = 2');
eq(P.extract([0x06], b(2, 1)).raw, 1, 'bit2 of 0b0110 = 1');
eq(P.extract([0x06], b(3, 1)).raw, 0, 'bit3 of 0b0110 = 0');
eq(P.extract([0x34, 0x12], b(4, 8, { 바이트순서: '리틀' })).raw, 0x23, '리틀: 두 바이트에 걸친 bit4~11 = 0x23');
eq(P.extract([0x12, 0x34], b(4, 8, { 바이트순서: '빅' })).raw, 0x23, '빅: 두 바이트에 걸친 bit4~11 = 0x23');
eq(P.extract([0x0E], b(1, 3, { 부호: '있음' })).raw, -1, '부호 있는 3 bit 0b111 = -1');

// 환산 — 부동소수 잡음 없이
eq(P.physical(12345, { res: 0.1, offset: 0 }), 1234.5, '12345 × 0.1');
eq(P.physical(71, { res: 1, offset: -40 }), 31, '71 × 1 − 40');
eq(P.physical(153, { res: 0.5, offset: 0 }), 76.5, '153 × 0.5');
eq(P.physical(3, { res: 0.1, offset: 0 }), 0.3, '0.1 × 3 = 0.3 (0.30000000000000004 아님)');

// 정의 검증
var bad = P.normalize({ fields: [
  { 항목명: 'a', 시작Byte: '', 길이: 1 },
  { 항목명: 'b', 시작Byte: 0, 길이: 0 },
  { 항목명: 'c', 시작Byte: 0, 길이: 1, 바이트순서: '중간' },
  { 항목명: 'd', 시작Byte: 0, 길이: 1, 열거값: '정지 주행' },
  { 항목명: '', 시작Byte: 1, 길이: 1 }
] });
eq(bad.fields.map(function (f) { return f.name; }), ['c', 'd'], '틀린 줄은 쓰지 않고 남는 줄만');
has(bad.issues, '시작 Byte', '시작 Byte 오류');
has(bad.issues, '길이', '길이 오류');
has(bad.issues, '빅엔디언으로', '모르는 바이트 순서');
has(bad.issues, '열거값을 읽지', '열거값 형식 오류');
has(bad.issues, '항목명이 비어', '빈 항목명');
has(bad.issues, '같은 bit', '같은 bit 를 쓰는 두 항목');
eq(P.normalize({ fields: [{ 항목명: 'a', 시작Byte: 1, 길이: 1 }], settings: { base: 1 } }).fields[0].start, 0, 'Byte 번호 1 부터면 1 이 첫 바이트');
var alias = P.normalize({ fields: [{ Signal: 'v', StartByte: 1, Len: 2, ByteOrder: 'LE', Scale: '0.01', Unit: 'V' }] }).fields[0];
eq([alias.name, alias.start, alias.endian, alias.res, alias.unit], ['v', 1, 'little', 0.01, 'V'], '영문 열 이름 별칭');
eq(P.parseEnums('0=정지; 0x12=유압 과열'), { 0: '정지', 18: '유압 과열' }, '열거값 16진 키');

// 예제: 손으로 계산한 값과 대조
var smp = P.sample(), p = P.normalize(smp);
eq(p.issues, [], '예제 정의는 경고 없음');
var all = P.decodeAll(p, P.parseLines(smp.data));
var R = all.results, val = function (r, name) { return r.fields.filter(function (f) { return f.name === name; })[0]; };
eq(R.length, 7, '주석 줄을 빼고 7줄');
eq([val(R[0], '가동시간').value, val(R[0], '주행속도').value, val(R[0], '마스트 틸트각').value, val(R[0], '작업량(리프트 횟수)').value], [1234.5, 8.5, -2.5, 300], '운행정보: 가동시간 · 속도 · 틸트(음수) · 작업량(리틀)');
eq([val(R[0], '운전모드').label, val(R[0], '안전벨트').label], ['작업', '착용'], 'bit 열거값');
eq(R[0].verdict, 'pass', '1줄 기대값 3개 합격');
has(R[0].issues, 'Byte 15', '정의 안 된 Byte 15 경고');
eq(R[0].map[15].kind, 'undef', '바이트 지도: 15 = 미정의');
eq(R[0].map[9].kind, 'partial', '바이트 지도: 9 = 일부 bit 만 정의');
eq(R[0].map[0].kind, 'id', '바이트 지도: 0 = 메시지 ID');
eq([val(R[1], '배터리 전류').value, val(R[1], '배터리 온도').value, val(R[1], 'SOC').value], [-45.3, 31, 76.5], '배터리정보: 전류(음수) · 온도(offset −40) · SOC');
eq(R[1].verdict, 'fail', '전압 기대 51.3 · 실제 51.2 → 불합격');
ok(/허용 ±0.005/.test(val(R[1], '배터리 전압').check.why), '허용오차 기본 = Resolution 의 절반', val(R[1], '배터리 전압').check.why);
eq(val(R[2], '제한속도 설정값').status, 'range', '제한속도 30 → 범위 이탈');
eq(val(R[2], '오류코드').label, '유압 과열', '오류코드 0x12');
eq([val(R[3], 'SOC').status, val(R[3], '배터리 온도').status, val(R[3], '충전상태').status], ['range', 'invalid', 'enum'], 'SOC 105% · 온도 0xFF 무효 · 상태 5 열거표 밖');
eq(val(R[3], '배터리 온도').value, null, '무효값은 환산하지 않는다');
has(R[4].issues, '6 Byte 모자람', '길이 부족');
eq(val(R[4], '작업량(리프트 횟수)').status, 'short', '모자란 항목은 short');
eq(val(R[4], '제한속도 설정값').value, 15, '받은 만큼은 해석한다');
has(R[5].issues, '미정의 메시지 ID 0x07', '미정의 메시지 ID');
has(R[6].issues, '1 Byte 깁니다', '정의보다 긴 데이터');
eq(R[6].map[10].kind, 'extra', '넘친 바이트는 extra');
eq(R[6].verdict, 'pass', '글자 기대값(완충)은 열거 이름과 맞춘다');
eq([all.summary.pass, all.summary.fail, all.summary.errors], [2, 1, 2], '요약: 합격 2 · 불합격 1 · 오류 2');

// 기대값: 16진수는 raw 와, 허용오차 열
var one = P.normalize({ fields: [{ 항목명: 'v', 시작Byte: 0, 길이: 1, Resolution: 0.5, 허용오차: 1 }] });
eq(P.decode(one, { no: 1, hex: '0A', expect: { v: '0x0A' } }).verdict, 'pass', '16진수 기대값은 raw 와 비교');
eq(P.decode(one, { no: 1, hex: '0A', expect: { v: '5.9' } }).verdict, 'pass', '허용오차 1 안이면 합격');
eq(P.decode(one, { no: 1, hex: '0A', expect: { v: '6.1' } }).verdict, 'fail', '허용오차 밖이면 불합격');
has(P.decode(one, { no: 1, hex: '0A', expect: { w: '1' } }).issues, '「w」가 이 메시지 정의에 없', '정의에 없는 기대 항목');
eq(P.decode(one, { no: 1, hex: '0A' }).msg.name, '(단일 메시지)', '메시지 ID 없이 한 종류면 모든 줄을 그 메시지로');

// 입력 줄 · 엑셀 행
var ln = P.parseLines('# 주석\n\nA1 | 01 02 => x=1; y=주행\n0303');
eq(ln.map(function (l) { return [l.no, l.label, l.hex]; }), [[3, 'A1', '01 02'], [4, '', '0303']], '주석·빈 줄 건너뛰기, 라벨');
eq(ln[0].expect, { x: '1', y: '주행' }, '=> 뒤 기대값');
var rows = P.rowsToLines([{ 수신시각: 't1', 데이터: '01 02', '기대_SOC': 50, 비고: '' }]);
eq([rows[0].label, rows[0].hex, rows[0].expect], ['t1', '01 02', { SOC: 50 }], '엑셀 행: 라벨 · 데이터 · 기대_항목명');

// 표 붙여넣기 · AI 답
var tb = P.parseTable('메시지ID\t항목명\t시작Byte\t길이\n0x01\t속도\t2\t2');
eq(P.normalize({ fields: tb }).fields[0].start, 2, '탭 구분 표 붙여넣기');
var md = P.parseTable('| 항목명 | 시작Byte | 길이 |\n|---|---|---|\n| SOC | 5 | 1 |');
eq(md[0], { 항목명: 'SOC', 시작Byte: '5', 길이: '1' }, '마크다운 표도 읽는다');
var ai = P.parseAiReply('설명입니다\n```tsv\n항목명\t시작Byte\t길이\nSOC\t5\t1\n\t\t\n```\n끝');
eq(ai.length, 1, 'AI 답의 코드 블록에서 표만 꺼낸다');
ok(P.aiPrompt('문서', 1).indexOf('1 부터') >= 0, 'AI 요청문에 Byte 번호 기준을 적는다');

// 내보내기 행
var ex = P.exportRows(all);
eq(ex.lines.length, 7, '메시지요약 7줄');
eq(Object.keys(ex.wide), ['운행정보', '배터리정보'], '메시지별 가로 표');
eq(ex.wide['운행정보'][0]['가동시간(h)'], 1234.5, '가로 표 값');
eq(ex.detail.filter(function (d) { return d.판정 === '불합격'; }).length, 1, '항목해석의 불합격 1건');

console.log('\n통과 ' + passed + ' · 실패 ' + failed);
process.exit(failed ? 1 : 0);
