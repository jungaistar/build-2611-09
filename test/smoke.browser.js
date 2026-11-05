/* 브라우저에 실제로 띄워 화면이 그려지는지 본다 — node test/smoke.browser.js
 * 규칙 테스트가 다 통과해도 app.js 오타 하나면 빈 화면이 된다. playwright 가 없으면 건너뛴다. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var chromium;
try { chromium = require('playwright').chromium; }
catch (e) { console.log('playwright 가 없어 화면 연기 테스트를 건너뜁니다.'); process.exit(0); }
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
var srv = http.createServer(function (q, s) {
  var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); });
});
var passed = 0, failed = 0;
function ok(c, label, d) { if (c) passed++; else { failed++; console.log('  X ' + label + (d ? '  ' + d : '')); } }
srv.listen(0, async function () {
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var br = await chromium.launch(); var pg = await br.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  var errs = []; pg.on('pageerror', function (e) { errs.push(e.message); });
  try {
    await pg.goto(base);
    ok(await pg.isHidden('#s-result'), '처음엔 결과 영역이 숨어 있다');
    await pg.click('#btn-sample');
    await pg.waitForSelector('#lines tbody tr', { timeout: 5000 });
    ok(await pg.isVisible('#s-result'), '해석 결과 영역이 열린다');
    ok(await pg.$$eval('#t-field tbody tr', function (t) { return t.length; }) === 16, '항목 정의 표 16줄');
    ok(await pg.$$eval('#lines tbody tr', function (t) { return t.length; }) === 7, '결과 7줄');
    ok(/불합격/.test(await pg.textContent('#summary')), '요약에 합격·불합격');
    await pg.click('#lines tbody tr[data-i="0"]');
    ok(await pg.$$eval('#bmap .bcell', function (t) { return t.length; }) === 16, '바이트 지도 16칸');
    ok(await pg.$$eval('#bmap .k-undef', function (t) { return t.length; }) === 1, '미정의 바이트 1칸 표시');
    ok(/1234\.5/.test(await pg.textContent('#detail')), '가동시간 환산값 1234.5');
    await pg.click('#lines tbody tr[data-i="3"]');
    var d = await pg.textContent('#detail');
    ok(/범위 이탈/.test(d) && /무효값/.test(d) && /열거표 밖/.test(d), '경고 3종이 항목 표에 나온다');
    await pg.selectOption('#filter', 'fail');
    ok(await pg.$$eval('#lines tbody tr', function (t) { return t.length; }) === 1, '불합격만 보기 1줄');
    await pg.selectOption('#filter', 'all');
    // 표에서 고치면 다시 해석된다: 배터리 전압 Resolution 0.01 → 0.1
    ok(!(await pg.$eval('#proto-edit', function (d) { return d.open; })), '불러온 정의 표는 접힌다');
    await pg.click('#proto-edit summary');
    var cell = await pg.$('#t-field input[data-r="10"][data-k="Resolution"]');
    await cell.fill('0.1');
    await pg.waitForFunction(function () { return /범위 이탈/.test(document.querySelector('#lines').textContent) && window.__app.state.all.results[1].fields[0].value === 512; }, null, { timeout: 3000 });
    ok(true, '정의를 고치면 즉시 다시 해석');
    var dl = pg.waitForEvent('download');
    await pg.click('#btn-export');
    ok(/\.xlsx$/.test((await dl).suggestedFilename()), '엑셀 내보내기');
    // 예제 엑셀을 내려받아 다시 올리면 같은 결과
    var dl2 = pg.waitForEvent('download');
    await pg.click('#btn-sample-xlsx');
    var fp = await (await dl2).path();
    await pg.evaluate(function () { window.__app.state.fields = []; document.getElementById('data').value = ''; });
    await pg.setInputFiles('#file', fp);
    await pg.waitForFunction(function () { var a = window.__app.state.all; return a && a.results.length === 7 && a.summary.fail === 1 && window.__app.state.fields.length === 16; }, null, { timeout: 5000 });
    ok(true, '예제 엑셀 왕복(정의 16 · 데이터 7 · 불합격 1)');
    // 360px 가로 넘침
    await pg.setViewportSize({ width: 360, height: 800 });
    var over = await pg.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    ok(over <= 0, '360px 에서 가로 넘침 없음', over);
    await pg.goto(base + 'guide.html');
    ok(/환산값/.test(await pg.textContent('main')), '사용법 페이지');
  } catch (e) { failed++; console.log('  X 예외: ' + e.message); }
  ok(!errs.length, '페이지 오류 없음', errs.join(' | '));
  await br.close(); srv.close();
  console.log('\n화면 통과 ' + passed + ' · 실패 ' + failed);
  process.exit(failed ? 1 : 0);
});
