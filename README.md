# build-2611-09 · 통신 프로토콜 16진수 해석기

생성형 AI 업무자동화 전문가과정 **2차수** 수강생 프로젝트 09 — 기획 차준근.

**바로 쓰기: https://build-2611-09.jobability.co.kr/**

프로토콜 정의 표(엑셀 업로드 또는 화면 편집)와 서버에 받은 16진수 데이터를 넣으면
Byte별 의미와 환산값(raw × resolution + offset), 범위 이탈·길이 부족·미정의 바이트 경고,
바이트 지도, 기대값 합격·불합격 판정을 보여 주고 엑셀로 내보냅니다.
파일은 브라우저 안에서만 처리하며 서버로 올라가지 않습니다.

| 파일 | 역할 |
|---|---|
| `js/proto.js` | 해석 엔진(16진수 읽기·정의 검증·환산·경고·판정·내보내기 행) — 판정은 전부 여기 |
| `js/app.js` | 화면 |
| `test/logic.test.js` | 해석 규칙 테스트 `node test/logic.test.js` |
| `test/smoke.browser.js` | 화면 연기 테스트(playwright) |
| `CLAUDE.md` | 작업 지시서 + 기획서 원문 |

예제 데이터(가짜 지게차 원격모니터링 프로토콜)는 실제 사내 데이터가 아닙니다.

## 기획서 · 버전

- 사이트 「기획서」 페이지: https://build-2611-09.jobability.co.kr/plan.html — 워드 판 내려받기
- 워드 판: `docs/기획서/build-2611-09_차준근_통신프로토콜16진수해석기_기획서_v<버전>.docx` (버전마다 남김)
- 원본: `docs/plan.json` → 생성기 `build-2611-00/tools/plandoc/make_plan.py` 로 워드·그림·plan.html·CHANGELOG.md 를 다시 만든다
- 버전을 올릴 때: `plan.json` 의 `version` 을 바꾸고 `versions` 맨 앞에 바뀐 점을 적은 뒤 생성기를 다시 돌린다
