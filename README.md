# build-2611-09 · HEX Protocol Analyzer (v2)

생성형 AI 업무자동화 전문가과정 **2차수** 수강생 프로젝트 09 — 기획 차준근.

**바로 쓰기: https://build-2611-09.jobability.co.kr/** · 예전 판(v1.0) https://build-2611-09.jobability.co.kr/v1/

통신 프로토콜 표와 HCESPN 정의를 등록해 두면 16진수 RAW DATA 의 Message Type 을 찾아 Byte 별 의미와 환산값을 자동으로 해석합니다.
Byte 에 마우스를 올리면 해석이 보이고, 새 HCESPN 은 코드 수정 없이 등록만으로 늘어납니다. 자료는 브라우저(localStorage)에만 저장됩니다.

| 파일 | 역할 |
|---|---|
| `js/hcespn.js` | 해석 엔진 — HEX 정리 · 프로토콜 표 읽기 · HCESPN 원문 구조화 · 환산(Type 6종 · 특수조건) · 프로토콜 선택 · 검증 · Excel. **규칙은 전부 여기** |
| `js/app.js` | 화면 4개(대시보드 · 프로토콜 관리 · HCESPN 관리 · RAW DATA 해석)와 저장 |
| `css/analyzer.css` | 도구 화면. `css/style.css` · `css/app.css` 는 사용법 · 기획서 페이지용 |
| `v1/` | v1.0(프로토콜 정의 표 한 장으로 해석) 보관 — 비트 필드 · 부호형은 여기에만 있다 |
| `samples/` | RAW DATA 업로드 양식 · 프로토콜 표 붙여넣기 예시 |
| `test/` | 해석 규칙 `node test/logic.test.js` · 화면 `node test/smoke.browser.js` |
