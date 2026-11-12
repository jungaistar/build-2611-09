/* 브라우저에 실제로 띄워 본다 — node test/smoke.browser.js (playwright 가 없으면 건너뜀) */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var chromium;
try { chromium = require('playwright').chromium; }
catch (e) { try { chromium = require('playwright-core').chromium; } catch (e2) { console.log('playwright 가 없어 화면 연기 테스트를 건너뜁니다.'); process.exit(0); } }
var XLSX = require('../lib/xlsx.full.min.js'), H = require('../js/hcespn.js');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
var srv = http.createServer(function (q, s) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
var passed = 0, failed = 0;
function ok(c, label, d) { if (process.env.SMOKE_V) console.log((c ? '  o ' : '  x ') + label); if (c) passed++; else { failed++; console.log('  X ' + label + (d != null ? '  ' + d : '')); } }
var count = function (pg, sel) { return pg.$$eval(sel, function (t) { return t.length; }); };
srv.listen(0, async function () {
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var br = await chromium.launch(); var ctx = await br.newContext({ viewport: { width: 1360, height: 880 }, acceptDownloads: true });
  var pg = await ctx.newPage(), errs = []; pg.on('pageerror', function (e) { errs.push(e.message); });
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b09-smoke-')), S = H.sample();
  async function nav(p) { await pg.click('#nav button[data-p=' + p + ']'); await pg.waitForFunction(function (x) { return document.body.dataset.page === x; }, p); }
  var db = function () { return pg.evaluate(function () { var d = window.__app.db(); return { p: d.protocols.length, h: d.hcespns.length, a: d.analyses.length, sample: d.is_sample, pa: d.protocols.filter(function (x) { return x.archived; }).length }; }); };
  try {
    await pg.goto(base); await pg.waitForSelector('#k-proto');
    ok(await count(pg, '#nav button') === 4, '메뉴 4개(대시보드 · 프로토콜 관리 · HCESPN 관리 · RAW DATA 해석)');
    ok([await pg.textContent('#k-proto'), await pg.textContent('#k-hces'), await pg.textContent('#k-an'), await pg.textContent('#k-miss')].join() === '2,4,0,0' && await count(pg, '#sample-note') === 1, '대시보드 — 기획서 예시(프로토콜 2 · HCESPN 4)');

    // RAW DATA 해석
    await nav('analyze'); await pg.click('[data-act=a-sample]'); await pg.click('[data-act=a-run]'); await pg.waitForSelector('#hexv');
    ok(await count(pg, '#a-list tr') === 3 && await count(pg, '#hexv .hb') === 31, '예시 2건 해석 · Viewer 에 31 bytes');
    var res = await pg.textContent('#a-result');
    ok(/0xA1/.test(res) && /Total Shift Mode & Actual Gear Distribution/.test(res) && /2026-11-12 14:30:45/.test(res) && /60 sec/.test(res.replace(/\s+/g, ' ')) || /60/.test(await pg.textContent('#a-table')), 'Message Type 자동 식별 · 날짜 · 60 sec');
    ok(await count(pg, '#a-table tr.fieldhead') === 3 && await count(pg, '#a-table tr.child') === 12, '상세 결과표 — 항목 3 + 하위 줄(날짜 6 · 배열 6)');
    await pg.hover('#hexv .hb[data-b="7"]');
    var tip = await pg.textContent('#tip');
    ok(await pg.isVisible('#tip') && /Shift Mode – Manual/.test(tip) && /8-11/.test(tip) && /3C 00 00 00/.test(tip) && /HCESPN[\s\S]*127/.test(tip) && /Little Endian/.test(tip) && /60 sec/.test(tip), 'Byte 8 에 올리면 Byte 8-11 · RAW · HCESPN 127 · 환산식 · 60 sec', tip);
    ok(await count(pg, '#hexv .hb.hl') === 4 && await count(pg, '#hexv .hb.hl2') === 20, 'Byte 8~11 을 함께 강조(같은 Parameter 의 나머지는 옅게)');
    await pg.hover('#hexv .hb[data-b="1"]');
    ok(/Year/.test(await pg.textContent('#tip')) && /2026/.test(await pg.textContent('#tip')), '날짜의 Byte 마다 Year · Month … 해석');
    var cls = await pg.evaluate(function () { var a = document.querySelectorAll('#hexv .hb'); return [a[0].className, a[1].className, a[7].className].join('|'); });
    ok(/c0/.test(cls.split('|')[0]) && /c1/.test(cls.split('|')[1]) && /c2/.test(cls.split('|')[2]), 'Parameter 마다 다른 색');
    await pg.click('#a-list tr[data-i="1"]');
    ok(await count(pg, '#hexv .hb') === 71 && /적용 범위가 정해지지 않아/.test(await pg.textContent('#a-info')), 'B1 71 bytes · 미확정 특수조건 알림');
    // 오류들
    await pg.fill('#raw', 'C9' + S.raws[0].slice(2) + '\n' + S.raws[0] + 'AABB\nA1 ZZ\n' + S.raws[0].slice(0, 40)); await pg.click('[data-act=a-run]'); await pg.waitForSelector('#a-list');
    ok(/등록돼 있지 않습니다/.test(await pg.textContent('#a-error')) && await count(pg, '#hexv .hb.undef') === 31, '미등록 Message Type — 해석하지 않고 안내(Byte 는 미정의로)');
    await pg.click('#a-list tr[data-i="1"]');
    ok(await count(pg, '#hexv .hb.undef') === 2 && /2 bytes 깁니다/.test(await pg.textContent('#a-warn')), '길면 초과 Byte 를 미정의 영역으로');
    await pg.click('#a-list tr[data-i="2"]');
    ok(/16진수가 아닙니다/.test(await pg.textContent('#a-error')) && await count(pg, '#hexv') === 0, '잘못된 HEX 문자 안내');
    await pg.click('#a-list tr[data-i="3"]');
    ok(/프로토콜 31 bytes, 실제 20 bytes/.test(await pg.textContent('#a-error')) && /2026-11-12 14:30:45/.test(await pg.textContent('#a-table')), '길이 부족 — 읽을 수 있는 데까지 해석');
    // 엑셀 업로드 · 다운로드
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['데이터 수신일자', '수신 시간', '메시지'], ['2026-11-12', '14:30:45', S.raws[0]], ['2026-11-12', '14:31:45', 'XYZ'], ['2026-11-12', '14:32:45', S.raws[1]]]), 'RAW'); var fx = path.join(tmp, 'raw.xlsx'); fs.writeFileSync(fx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    var fc = await Promise.all([pg.waitForEvent('filechooser'), pg.click('[data-act=a-xlsx]')]); await fc[0].setFiles(fx);
    await pg.waitForFunction(function () { return document.querySelectorAll('#a-list tr').length === 4; });
    var lst = await pg.textContent('#a-list');
    ok(/정상 2/.test(await pg.textContent('#view')) && /오류 1/.test(await pg.textContent('#view')) && /14:31:45/.test(lst), 'Excel 3행 — 오류 행이 있어도 나머지는 분석');
    var dl = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act=a-export]')]); var fo = path.join(tmp, 'out.xlsx'); await dl[0].saveAs(fo);
    var ow = XLSX.read(fs.readFileSync(fo), { type: 'buffer' });
    ok(ow.SheetNames.join() === '메시지요약,해석결과' && XLSX.utils.sheet_to_json(ow.Sheets['메시지요약'], { header: 1 }).length === 4, '해석 결과 Excel 다운로드');

    // 프로토콜 관리 — 붙여넣기 등록 · 검증 · 버전
    await nav('protocols');
    ok(await count(pg, '#plist li') === 2, '프로토콜 목록 2개');
    await pg.click('[data-act=p-new]');
    await pg.fill('#ppaste', 'S.P\tLength\tParameter Name\tHCESPN\n1\t1 byte\tRMS Message Type (= 0xC1)\t16\n2-7\t6 bytes\tDate & Time\t90\n8-51\t8 bytes\tTest Counter\t300'); await pg.click('[data-act=p-parse]');
    ok(/3줄을 읽어/.test(await pg.textContent('#p-parsed')) && await count(pg, '#prows tr') === 4 && await pg.inputValue('[data-pf=msg_type]') === 'C1', '표 붙여넣기 → 3줄 · Message Type C1 자동 추출');
    ok(/S\.P 8-51\(44 bytes\)와 Length 8 bytes 가 맞지 않습니다/.test(await pg.textContent('#prows')) && /HCESPN 미등록/.test(await pg.textContent('#prows')) === false, 'S.P 와 Length 불일치를 그 줄에 알린다');
    await pg.fill('[data-pr=sp][data-i="2"]', '8'); await pg.dispatchEvent('[data-pr=sp][data-i="2"]', 'change');
    ok(/HCESPN 미등록/.test(await pg.textContent('#prows')) && /HCESPN 등록됨/.test(await pg.textContent('#prows')), '고치면 다시 확인 — 등록 · 미등록 HCESPN 표시');
    await pg.fill('[data-pf=name]', '시험 프로토콜'); await pg.dispatchEvent('[data-pf=name]', 'change');
    await pg.click('[data-act=p-save]');
    ok((await db()).p === 3 && (await db()).sample === false && await count(pg, '#plist li') === 3, '저장 → 목록 3개(예시 표시 해제)');
    await pg.fill('[data-pf=version]', '1.1'); await pg.dispatchEvent('[data-pf=version]', 'change'); await pg.click('[data-act=p-save-new]');
    var d1 = await db(); ok(d1.p === 4 && d1.pa === 1 && await count(pg, '#plist li') === 3, '새 버전으로 저장 — 이전 버전은 보관(목록에서는 숨김)');
    await pg.check('[data-ch=show-old]'); ok(await count(pg, '#plist li') === 4 && /이전 버전/.test(await pg.textContent('#plist')), '「이전 버전」 보기');
    await pg.uncheck('[data-ch=show-old]');

    // HCESPN 관리 — 원문 → 구조화 → 확인 → 저장
    await nav('hcespn');
    ok(await count(pg, '#hlist li') === 4, 'HCESPN 목록 4개');
    await pg.click('[data-act=h-new]');
    await pg.fill('#hpaste', 'HCESPN 300 — Test Counter\nData Length: 8 bytes\nResolution: 0.5 km/bit\nOffset: 0\nEndianness: Little Endian\nByte 1-4: Distance A\nByte 5-8: Distance B\nIf byte4 = 0xFF ⇒ Not available'); await pg.click('[data-act=h-parse]');
    ok(/원문을 읽어/.test(await pg.textContent('#h-parsed')) && await pg.inputValue('[data-hf=no]') === '300' && await pg.inputValue('[data-hf=type]') === 'array' && await count(pg, '#hfields tr') === 3 && await count(pg, '#hspecial tr') === 2, '원문 자동 구조화 — 번호 · 유형 · 하위 필드 2 · 특수조건 1');
    ok(/적용 범위/.test(await pg.textContent('#h-parsed')) && await pg.inputValue('[data-hs=scope][data-i="0"]') === '확인 필요', '특수조건 적용 범위는 확인 필요로(자동 확정 안 함)');
    await pg.click('[data-act=h-save]');
    ok((await db()).h === 5, 'HCESPN 저장');
    await nav('dash'); ok(await pg.textContent('#k-miss') === '0' && await pg.textContent('#k-proto') === '3', '대시보드 반영 — 미등록 HCESPN 0');

    // 새로 등록한 정의로 해석 + 버전 선택
    await nav('analyze');
    await pg.fill('#raw', 'C11A0B0C0E1E2D' + '10000000' + '640000FF'); await pg.click('[data-act=a-run]'); await pg.waitForSelector('#hexv');
    var t2 = (await pg.textContent('#a-table')).replace(/\s+/g, ' ');
    ok(/Distance A/.test(t2) && /8 km|8km/.test(t2.replace(/ /g, ' ')) && /Distance B/.test(t2), '코드 수정 없이 새 프로토콜 · HCESPN 으로 해석(16 × 0.5 = 8 km)', t2.slice(0, 300));
    ok(await count(pg, '[data-ch=a-version] option') === 1 || await count(pg, '[data-ch=a-version]') === 0, '보관된 버전은 선택지에 없다');
    await nav('dash');
    ok(+(await pg.textContent('#k-an')) >= 9 && await count(pg, '#hist tr') >= 2, '분석 이력이 쌓인다');
    await pg.click('#hist [data-act=re-analyze] >> nth=0'); await pg.waitForSelector('#hexv');
    ok(await count(pg, '#hexv .hb') === 15, '이력에서 다시 해석');

    await pg.reload(); await pg.waitForSelector('#view h2');
    var d2 = await db(); ok(d2.p === 4 && d2.h === 5 && d2.a >= 9, '새로고침 뒤에도 등록정보 · 이력이 남는다');
    for (var wd of [390, 820]) { await pg.setViewportSize({ width: wd, height: 800 }); for (var p of ['dash', 'protocols', 'hcespn', 'analyze']) { await nav(p); var over = await pg.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; }); ok(over <= 1, wd + 'px 가로 넘침 없음 — ' + p, over); } }
    for (var page of ['guide.html', 'plan.html', 'v1/']) { var rr = await pg.goto(base + page); ok(rr.status() === 200, page + ' 열림'); }
    ok(errs.length === 0, '페이지 오류 없음', errs.join(' | '));
  } catch (e) { failed++; console.log('  X 중단: ' + e.message.split('\n')[0]); if (errs.length) console.log('    ' + errs.join(' | ')); }
  await br.close(); srv.close();
  console.log('화면 테스트: 통과 ' + passed + ' · 실패 ' + failed);
  process.exit(failed ? 1 : 0);
});
