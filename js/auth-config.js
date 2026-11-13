// 로그인 설정 — 이 파일 한 곳만 바꾸면 된다(생성: build-2611-00/tools/kit/apply-kit.mjs, 대문 문구 출처 docs/plan.json).
// 내 Supabase 로 옮길 때: url · anonKey 를 내 프로젝트 값으로, 카카오를 설정하지 않았으면 kakao: false. 안내 = docs/내_깃허브로_옮기기.md
// prefix 는 supabase/auth.sql 의 표 이름 앞부분과 같아야 한다.
window.AUTH_CONFIG = {
  "url": "https://hcmgdztsgjvzcyxyayaj.supabase.co",
  "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbWdkenRzZ2p2emN5eHlheWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzU4ODcsImV4cCI6MjA4NzAxMTg4N30.gznaPzY1l8qDAPsEyYNR9KS7f7VqS3xaw-_2HTSwSZw",
  "prefix": "build261109",
  "kakao": true,
  "idleMinutes": 30,
  "localBypass": true,
  "board": true,
  "site": {
    "title": "HEX Protocol Analyzer",
    "summary": "통신 프로토콜 표와 HCESPN 정의를 등록해 두면 16진수 RAW DATA 의 Message Type 을 찾아 Byte 별 의미와 환산값을 자동으로 해석하는 브라우저 도구입니다. Byte 에 마우스를 올리면 해석이 보이고, 새 HCESPN 은 코드 수정 없이 등록만으로 늘어납니다.",
    "course": "생성형 AI 업무자동화 전문가과정 · 2차수",
    "features": [
      {
        "name": "대시보드",
        "desc": "등록 현황, 미등록 HCESPN, 최근 분석 이력 · 다시 해석, 백업."
      },
      {
        "name": "프로토콜 관리",
        "desc": "표 붙여넣기 등록, Byte Mapping 편집, 자동 검증, 버전 보관."
      },
      {
        "name": "HCESPN 관리",
        "desc": "원문 자동 구조화, Type · 하위 필드 · 환산식 · 특수조건, 버전."
      },
      {
        "name": "RAW DATA 해석",
        "desc": "직접 입력 · Excel, Message Type 자동 식별, Hover Viewer, 결과표, Excel."
      }
    ],
    "steps": [
      "프로토콜 등록",
      "HCESPN 등록",
      "RAW DATA 입력",
      "프로토콜 선택",
      "분리 · 환산",
      "검증"
    ],
    "flow": [
      {
        "step": "프로토콜 등록",
        "desc": "표 붙여넣기 → 검증 → 저장"
      },
      {
        "step": "HCESPN 등록",
        "desc": "원문 → 구조화 → 확인 → 저장"
      },
      {
        "step": "RAW DATA 입력",
        "desc": "직접 · Excel, HEX 정리"
      },
      {
        "step": "프로토콜 선택",
        "desc": "Message Type · 발신자 · 버전"
      },
      {
        "step": "분리 · 환산",
        "desc": "S.P · Length → HCESPN 정의 · Endian · 수식 · 특수조건"
      },
      {
        "step": "검증",
        "desc": "길이 · 범위 · 미등록"
      }
    ],
    "goals": [
      "프로토콜 표를 복사 · 붙여넣기로 등록합니다.",
      "HCESPN 별 데이터 구조와 환산식을 등록 · 누적 관리합니다(원문 붙여넣기 → 자동 구조화 → 확인 → 저장).",
      "RAW DATA 를 직접 입력하거나 Excel 로 올려 Message Type 으로 프로토콜을 자동 적용합니다."
    ],
    "screen": "docs/img/screen.png",
    "plan": "plan.html",
    "home": true,
    "guide": {
      "screens": [],
      "data": [
        {
          "name": "protocols",
          "fields": "id · name · sender · receiver · msg_type · version · registered_at · updated_at · note · archived · rows[sp · len · name · hcespn · note]"
        },
        {
          "name": "hcespns",
          "fields": "id · no · name · length · type · endian · resolution · offset · unit · min · max · enums · fields[name · start · len · resolution · offset · unit · min · max] · special[scope · byte · equals · label] · formula · hcepgn · version · archived"
        },
        {
          "name": "analyses",
          "fields": "id · at · recv_date · recv_time · sender · raw · msg_type · protocol_id · protocol_name · protocol_version · status · summary"
        }
      ],
      "rules": [
        "Start Position 은 1 부터 셉니다. Message Type 은 첫 Byte 입니다.",
        "HEX 는 공백 · 줄바꿈 · 쉼표 · 0x 를 걷고 대문자로 만듭니다. 16진수가 아닌 글자나 홀수 자릿수가 있으면 해석하지 않고 위치를 알립니다.",
        "프로토콜은 Message Type(+ 발신자)으로 찾습니다. 버전이 여럿이면 가장 높은 버전으로 풀고 고르라고 알립니다. 보관된 버전은 자동 선택에서 뺍니다.",
        "다중 Byte 수치는 Endianness 대로 읽습니다(Little = 앞 Byte 가 하위). 3C 00 00 00 → 60.",
        "선형 환산 Physical = RAW × Resolution + Offset. 유효범위 밖이면 값은 보여 주되 「확인」으로 표시합니다.",
        "날짜 · 시간(6 bytes): Year = 2000 + RAW, Month 1~12 · Day 1~31 · Hour 0~23 · Minute · Second 0~59. 범위 밖이거나 없는 날짜면 날짜로 환산하지 않습니다. 1A 0B 04 0D 1E 2D → 2026-11-04 13:30:45.",
        "반복 배열은 하위 필드의 Byte 구간마다 따로 환산합니다. 필드에 비운 Resolution · Offset · Unit 은 HCESPN 의 값을 씁니다.",
        "특수조건은 적용 범위(하위 필드마다 / 전체)를 정한 것만 적용합니다. 「확인 필요」는 적용하지 않고 알립니다.",
        "사용자 정의 수식은 RAW · RES · OFFSET 과 사칙연산 · 괄호만 씁니다. 오류면 값을 만들지 않습니다.",
        "프로토콜보다 짧으면 읽을 수 있는 항목까지만 풀고, 길면 초과 Byte 를 미정의로 둡니다. HCESPN 미등록 · 길이 불일치 항목은 RAW HEX 만 보여 줍니다.",
        "S.P 범위와 Length 가 어긋난 표는 고치지 않고 알립니다."
      ],
      "limits": [
        "서버 DB(PostgreSQL) · FastAPI · 로그인은 넣지 않았습니다. 등록정보는 한 브라우저에만 있고 백업 JSON 으로 옮깁니다 — 여러 사람이 함께 쓰려면 서버가 필요합니다.",
        "HCESPN 원문 자동 구조화는 「Byte n-m: 이름」「Resolution: 1 sec/bit」 같은 글 꼴을 읽습니다. 표로 된 원문이나 다른 표현은 직접 입력해야 할 수 있습니다.",
        "비트 단위 필드와 부호 있는 정수는 이번 판에 없습니다(v1.0 에는 있음). 필요하면 다음 판에 넣습니다.",
        "CRC · Checksum · 종료 Byte 검증은 없습니다(사양 미확정).",
        "프로토콜 · HCESPN 변경 이력의 차이 비교 화면은 없습니다(버전 보관과 재해석만)."
      ],
      "users": [
        "전장 통신 데이터를 검증하는 개발 · 시험 담당자"
      ],
      "flow": [
        {
          "step": "프로토콜 등록",
          "desc": "표 붙여넣기 → 검증 → 저장"
        },
        {
          "step": "HCESPN 등록",
          "desc": "원문 → 구조화 → 확인 → 저장"
        },
        {
          "step": "RAW DATA 입력",
          "desc": "직접 · Excel, HEX 정리"
        },
        {
          "step": "프로토콜 선택",
          "desc": "Message Type · 발신자 · 버전"
        },
        {
          "step": "분리 · 환산",
          "desc": "S.P · Length → HCESPN 정의 · Endian · 수식 · 특수조건"
        },
        {
          "step": "검증",
          "desc": "길이 · 범위 · 미등록"
        },
        {
          "step": "Viewer · 결과표 · Excel",
          "desc": "Hover 해석, 이력 저장"
        }
      ]
    },
    "landing": {
      "company": {
        "name": "HD건설기계",
        "en": "HD CONSTRUCTION EQUIPMENT",
        "logo": "images/logo.png",
        "logoH": 24
      },
      "slides": [
        {
          "image": "images/slide-1.jpg"
        },
        {
          "image": "images/slide-2.jpg"
        },
        {
          "image": "images/slide-3.jpg"
        }
      ],
      "heroMode": "slide"
    }
  }
};
