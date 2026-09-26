# JBNU Dormi — 전북대 생활관 합격 예측

전북대학교 생활관 선발 기준으로 **환산점수**를 계산하고, Colab 에서 학습한 딥러닝 모델로 **호실 유형별 합격률**(예: 창의관 1인실)을 예측하는 웹 서비스입니다.

```
 브라우저 ──▶ Vercel (React + Vite)  ──HTTPS──▶  Render (FastAPI + ONNX 모델)  ──▶  Supabase (Postgres)
                  │                                    ▲
                  └── 생활관 목록 읽기 (publishable 키) ─┘── UptimeRobot 이 5분마다 /health 호출 (콜드 스타트 방지)
```

| 역할 | 기술 | 위치 |
| --- | --- | --- |
| 프론트엔드 | React 19, React Router, Vite | `frontend/` → Vercel |
| 백엔드 API | FastAPI, onnxruntime | `backend/` → Render (무료 플랜) |
| 데이터베이스 | Supabase (Postgres + RLS) | `supabase/migrations/` |
| 서버 깨우기 | UptimeRobot | `/health` 모니터링 |

## 폴더 구조

```
JBNU_dormitory_sys/
├── frontend/                      React 앱 (Vercel 루트 디렉터리)
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/            Header, Footer, Layout
│   │   │   ├── predict/           ScoreInputTable(입력 표), RegionSelect(주소 드롭다운), ScoreFormula(수식), PredictionResult
│   │   │   └── common/            아이콘, 워드마크 로고, PageHeader
│   │   ├── pages/                 HomePage(점수 입력·예측), RoommatesPage(룸메이트 찾기), DormsPage, NotFoundPage
│   │   ├── lib/                   score.js(환산점수), api.js(백엔드), supabase.js, dormitories.js
│   │   ├── hooks/                 useRegions(행정구역 지연 로딩), useServerWarmup(콜드 스타트 깨우기)
│   │   ├── data/                  regions.json(자동 생성), colleges.js, dormitories.js
│   │   └── styles/global.css      디자인 토큰(라이트/다크), 공통 스타일
│   ├── vercel.json                SPA 라우팅 rewrite
│   └── .env.example
├── backend/                       FastAPI (Render 루트 디렉터리)
│   ├── app/
│   │   ├── main.py                앱 생성, CORS, 한국어 422 메시지
│   │   ├── config.py              환경변수
│   │   ├── schemas.py             요청/응답 스키마 (학점 1.0~4.5, 상·벌점 0~99 검증)
│   │   ├── colleges.py            단과대학 code 목록
│   │   ├── dormitories.py         호실 유형(예측 단위)·지원 자격
│   │   ├── routers/               /health, /api/v1/predict
│   │   ├── services/              scoring.py(환산점수), predictor.py(ONNX/임시 예측), supabase_client.py
│   │   └── data/distance_scores.json   (자동 생성)
│   ├── models/                    ← Colab 모델(model.onnx + model_meta.json)을 넣는 곳
│   ├── tests/
│   └── requirements.txt
├── supabase/migrations/           테이블 + RLS + 초기 데이터 SQL
├── scripts/build_regions.py       행정구역·거리점수 데이터 생성기
├── data/                          거리점수 원본 표(CSV) + 설명
└── render.yaml                    Render Blueprint
```

## 환산점수 계산 방법

```
환산점수 = ((학점 + (상점 × 0.009 − 벌점 × 0.009)) / 4.5 × 90) + 거리점수(5 ~ 10점)
```

- 학점: 1.0 ~ 4.5, 소수 둘째 자리까지 · 상점/벌점: 0 ~ 99 정수 (범위를 벗어난 입력은 막고 안내 문구 표시)
- 최종 점수는 소수점 셋째 자리에서 반올림
- **거리점수**: [2026.1.1. 기준] PC 카카오맵 → 길찾기 → 거리우선(실시간 정보 미포함),
  출발지 전북대학교 생활관 관리동 → 도착지 학생 주소의 **시·군·구청**, 20km마다 0.25점 (5 ~ 10점)
  (전북대 생활관 「2026학년도 선발기준 거리 데이터」 251개 시·군·구 표를 그대로 사용 — [data/README.md](data/README.md))
- 주소지는 **시/도 → 시/군/구** 2단 드롭다운이고, 이 표에 있는 지역만 나옵니다. 시/도를 고르기 전에는 시/군/구가 비활성화됩니다.

계산 로직은 프론트엔드(`frontend/src/lib/score.js`, 입력 즉시 표시)와 백엔드(`backend/app/services/scoring.py`, 예측에 사용) 두 곳에 있습니다. 규칙이 바뀌면 둘 다 수정하세요.

## 로컬에서 실행하기

필요한 것: Node.js 22.22 이상, Python 3.12 이상

### 1. 백엔드

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

- API 문서: <http://localhost:8000/docs>
- 테스트: `pytest`

### 2. 프론트엔드

```bash
cd frontend
npm install
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
npm run dev
```

<http://localhost:5173> 접속. 백엔드가 꺼져 있으면 예측 버튼을 눌렀을 때 "서버에 연결할 수 없습니다" 안내가 나옵니다.

## 딥러닝 모델 연결

1. Colab 에서 학습한 모델을 **ONNX** 로 내보냅니다. (Render 무료 플랜 메모리 512MB 에 TensorFlow/PyTorch 는 무겁습니다)
2. `backend/models/model.onnx`, `backend/models/model_meta.json` 두 파일을 넣습니다.
3. 서버를 재시작하면 자동으로 모델을 사용합니다. (`/health` 응답의 `model.mode` 가 `"model"`)

내보내기 코드와 `model_meta.json` 형식은 [backend/models/README.md](backend/models/README.md) 에 있습니다.
모델이 없으면 임시 기준점으로 계산하는 **임시 예측기**가 동작하고, 화면에 "임시 예측 (모델 연결 전)" 배지가 붙습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET`, `HEAD` | `/health` | 상태 확인 (UptimeRobot, Render 헬스체크) |
| `POST` | `/api/v1/predict` | 환산점수 계산 + 호실 유형별 합격 확률 |

```jsonc
// POST /api/v1/predict
{ "collegeCode": "engineering", "gpa": 3.85, "merit": 2, "demerit": 0, "sidoCode": "11", "sigunguCode": "11110" }

// 200 OK
{
  "score": { "gradeScore": 77.36, "distanceScore": 7.5, "convertedScore": 84.86, "distanceKm": 208.0, "regionName": "서울특별시 종로구" },
  "collegeName": "공과대학",
  "predictions": [{ "code": "changui_1", "name": "창의관 1인실", "dormitory": "창의관", "roomType": "1인실", "type": "D", "genders": ["남", "여"], "probability": 0.2599 }, ...],
  "notice": null,   // 특성화캠퍼스 대상 단과대학이면 안내 문구, predictions 는 빈 배열
  "model": { "mode": "baseline", "version": "baseline-v0" }
}
```

## 배포 순서

### ① Supabase — 데이터베이스

1. <https://supabase.com> 에서 프로젝트 생성 (Region: Northeast Asia (Seoul))
2. **SQL Editor** 에서 `supabase/migrations/` 의 파일을 이름 순서대로 실행
   (`20260926000000_init.sql` → `20260927000000_roommates.sql` → `20260928000000_roommates_public_read.sql` → `20260929000000_score_submissions.sql` → `20260930000000_admission_reports.sql` → `20261001000000_roommate_comments.sql` → `20261002000000_roommate_profiles.sql` → `20261003000000_prediction_logs_emd_optional.sql` → `20261004000000_official_2026_and_comment_profiles.sql` → `20261005000000_roommate_semester.sql` → `20261006000000_roommate_requests.sql` → `20261007000000_roommate_blocks_replies.sql` → `20261008000000_roommate_reports.sql` → `20261009000000_prediction_logs_gender.sql` → `20261010000000_admin.sql`)
3. **Project Settings → API Keys** 에서 확인
   - Project URL
   - publishable 키 (`sb_publishable_...`) → 프론트엔드용
   - secret 키 (`sb_secret_...`) → 백엔드용, **절대 프론트엔드/깃허브에 올리지 않기**

| 테이블 | 용도 | 접근 |
| --- | --- | --- |
| `colleges` | 단과대학 | 누구나 읽기 |
| `dormitories` | 생활관(건물) | 누구나 읽기 |
| `dormitory_rooms` | 호실 유형 = 예측 단위 (창의관 1인실 등) | 누구나 읽기 |
| `room_eligibility` | 호실 유형별 지원 가능 단과대학 | 누구나 읽기 |
| `admission_cutoffs` | 과거 합격선 (모델 학습·검증용) | 누구나 읽기 |
| `prediction_logs` | 예측 요청 기록 | 서버(secret 키)만 |
| `roommate_requests` | 룸메 신청 (신청자 → 글쓴이, 한마디 선택) + 글쓴이의 답장 | 직접 접근 불가, 신청·답장 함수로만. 글쓴이만 신청자 정보를, 신청자만 답장을 봄 |
| `roommate_blocks` | 차단 (차단한 사이는 서로의 글이 안 보이고 신청 불가) | 직접 접근 불가, `block/list/unblock` 함수로만 |
| `roommate_reports` | 신고 내역 (사유·내용·신고 당시 글 snapshot·처리 상태) | 운영자만 (관리자 페이지·Dashboard). 신고는 `report_roommate_post/request` 함수로만 |
| `roommate_moderation` | 신고받은 사용자 (이메일·신고 수) + **이용 정지** 여부 | 운영자만 (관리자 페이지·Dashboard) |
| `admins` | 관리자 계정 (계정 id) | 직접 접근 불가. `is_admin()` 으로 확인만 |
| `admin_logs` | 관리 기록 (숨김·삭제·정지 등 누가 언제 무엇을) | 관리자 페이지 [기록] 탭 |
| `admission_reports` | 합격 결과 제보 (모델 학습용) | 로그인 사용자가 본인 것만 읽기·쓰기, 계정당 학기별 1건 |
| `score_submissions` | 환산점수 계산 기록 (단과대학·학점·거리점수·환산점수, 익명) | 누구나 쓰기만, 조회는 대시보드에서 |
| `roommate_profiles` | 내 체크리스트 (기본 정보 + 체크리스트) | 본인만 |
| `roommate_posts` | 룸메이트 찾기 게시글 | 읽기는 체크리스트 등록자, 쓰기는 로그인 사용자, 수정·삭제는 글쓴이만 (숨김은 관리자 페이지에서, `is_open=false`) |

### ② Render — 백엔드

1. 이 저장소를 GitHub 에 올립니다.
2. Render Dashboard → **New → Blueprint** → 저장소 선택 (`render.yaml` 을 자동 인식)
3. 환경변수 입력
   - `ALLOWED_ORIGINS`: 일단 `http://localhost:5173` (③ 이후 Vercel 주소 추가)
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
4. 배포 후 `https://<서비스이름>.onrender.com/health` 가 `{"status":"ok"}` 인지 확인

> 무료 플랜은 15분 동안 요청이 없으면 잠들고, 깨어나는 데 1분 가까이 걸립니다. 그래서 ④ UptimeRobot 을 씁니다.
> 무료 인스턴스 시간은 워크스페이스당 월 750시간이라, 계속 깨워 둘 수 있는 서비스는 1개입니다.

### ③ Vercel — 프론트엔드

1. Vercel → **Add New → Project** → 저장소 선택
2. **Root Directory: `frontend`** (Framework Preset: Vite 자동 인식)
3. Environment Variables
   - `VITE_API_BASE_URL` = `https://<서비스이름>.onrender.com`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
4. 배포된 주소(예: `https://jbnu-dorm.vercel.app`)를 Render 의 `ALLOWED_ORIGINS` 에 추가
   (프리뷰 배포까지 허용하려면 `ALLOWED_ORIGIN_REGEX` 에 `https://jbnu-dorm-.*\.vercel\.app` 형태로 입력)

### ④ UptimeRobot — 콜드 스타트 방지

1. <https://uptimerobot.com> → **New Monitor**
2. Monitor Type: **HTTP(s)**, URL: `https://<서비스이름>.onrender.com/health`
3. Monitoring Interval: **5 minutes**

`/health` 는 GET/HEAD 모두 받으므로 UptimeRobot 기본 설정 그대로 동작합니다.
`/health` 는 6시간에 한 번 Supabase 를 가볍게 읽기도 합니다. Supabase 무료 프로젝트는 약 1주일 동안 요청이 없으면 일시정지되는데,
UptimeRobot 이 `/health` 를 계속 부르므로 방학처럼 방문자가 없는 기간에도 멈추지 않습니다.
그래도 서버가 잠들어 있을 때를 대비해, 프론트엔드는 사이트에 들어올 때 `/health` 를 먼저 호출해 서버를 깨우고
예측 응답이 늦으면 결과 패널에 "서버가 깨어나는 중" 안내를 보여 줍니다.

## 룸메이트 찾기

`/roommates` 페이지. **구글 로그인 + 내 체크리스트 등록**을 마친 사용자만 게시글을 볼 수 있습니다.
그 전에는 게시판이 흐리게(예시 글) 보이고 안내 카드가 뜹니다. DB 정책도 같아서 화면을 우회해도 글을 받을 수 없습니다.

1. **내 체크리스트** (`roommate_profiles`, 계정당 1개, 한 번만 등록)
   - 기본 정보: 성별, 호관, 나이, 단과대학, MBTI
   - 룸메이트 체크리스트: 「전북대 룸메이트 체크리스트 ver.4」 18개 항목 (`frontend/src/data/roommateChecklist.js`)
   - 수정하면 내가 쓴 글에도 자동으로 반영됩니다 (DB 트리거).
2. **글쓰기**: 소개(선택)만 적습니다. 기본 정보·체크리스트는 내 체크리스트 값이 들어갑니다. 연락 방법 칸은 없고, **연락은 룸메 신청으로** 시작합니다.
- **학기**: 글마다 학기(예: 2026년 2학기)가 있고, 글쓰기에서는 이번 학기와 **다음 학기 한 학기 미리**만 고를 수 있습니다. 사이드바에서 학기별로 볼 수 있습니다. (1학기 3~8월, 2학기 9~2월)
3. **룸메 신청**: 남의 글에서 [룸메 신청]을 누르면 확인 창이 뜨고, 한마디(선택, 200자)를 남겨 보낼 수 있습니다.
   **같은 성별의 글에만** 신청할 수 있습니다 (다른 성별 글은 [같은 성별만 신청 가능]으로 잠김, DB 에서도 막음).
   보낸 글은 카드에 [신청함 ✓]으로 표시되고, 다시 누르면 취소할 수 있습니다. 모집완료 글에는 신청할 수 없습니다.
4. **신청 내역** (툴바, 새 신청·답장 수 배지): 받은 신청 / 보낸 신청 / 차단 목록 탭.
   - 받은 신청: 신청자의 기본 정보, "18개 중 N개가 나와 같아요", 항목별 비교표. 잘 맞는 순/최신순 정렬. 신청마다 **답장**(300자) 한 번 (수정·삭제 가능).
   - 보낸 신청: 내가 보낸 신청과 글쓴이의 답장, 신청 취소.
   - 차단 목록: 서로 익명이라 "어디서 차단했는지"만 보여 주고, 해제할 수 있습니다.
5. **차단**: 받은 신청의 [차단], 게시글 자세히 보기의 [차단]. 차단한 사이는 서로의 글이 안 보이고, 서로 신청할 수 없고, 두 사람 사이의 신청·답장은 지워집니다.
6. **신고**: 카드의 [신고], 게시글 자세히 보기의 [신고], 받은 신청의 [신고]. 사유(필수)와 내용(기타는 필수, 500자)을 적고, 원하면 함께 차단합니다.
   같은 글·신청은 한 번만 신고할 수 있고, 신고한 순간의 내용이 `snapshot` 으로 남습니다.

### 신고 처리 · 이용 정지 (운영자)
**관리자 페이지(`/admin`)** 에서 합니다 (아래 [관리자 페이지](#관리자-페이지-admin)). Dashboard 로 직접 할 때는:
1. Supabase Dashboard → **Table Editor → `roommate_reports_admin`** (보기): 최신 신고, 신고받은 사람의 이메일·누적 신고 수·정지 여부, 신고 당시 내용.
2. 처리한 신고는 **`roommate_reports`** 에서 `status` 를 `reviewed`(조치함) / `dismissed`(문제없음)로 바꾸고 `admin_note` 에 메모합니다.
3. 정지하려면 **`roommate_moderation`** 에서 그 사용자 행의 **`is_suspended` 를 체크**합니다.
   `suspended_until` 을 비우면 무기한, 날짜를 넣으면 그때까지 정지됩니다. 해제는 체크를 끄면 됩니다. `note` 에 사유를 남겨 두세요.
4. 정지된 사용자는 글쓰기·수정, 룸메 신청, 답장, 신고를 할 수 없고, 그 사람의 글·신청은 다른 사람에게 보이지 않습니다. 본인 화면에는 정지 안내가 뜹니다.
   실시간 알림이나 주기적 확인은 없고, 게시판을 열 때와 탭으로 돌아올 때만 새 신청 수를 확인합니다 (서버 요청 절약).

- 체크리스트를 등록하면 각 카드에 **"나와 N/18 일치"** (같은 답의 수)가 보입니다.
- `20261002000000_roommate_profiles.sql` 을 실행하면 이미 글을 쓴 사용자는 가장 최근 글의 정보로 체크리스트가 자동으로 만들어집니다.
- 체크리스트 답변은 `roommate_posts.checklist`(jsonb)에 저장됩니다. 항목을 바꾸려면 `roommateChecklist.js` 만 수정하면 됩니다.
- **필터**: 호관·성별
- 신청은 글 하나에 한 번이고, 글을 지우면 그 글에 온 신청도 함께 지워집니다. 부적절한 신청은 Table Editor 에서 `roommate_requests` 행을 지웁니다.
- 목록은 한 페이지에 12개씩 DB 에서 나눠 받아옵니다 (Supabase 전송량 절약). 모집 중인 글이 먼저, 그다음 최신순.
- **내가 쓴 글**: 글마다 `user_id`(= `auth.uid()`)가 저장되고, RLS 정책으로 글쓴이만 수정·삭제·모집완료를 바꿀 수 있습니다.
  모집완료 글은 흐리게 표시되고 목록 뒤로 밀립니다.
- Supabase 가 연결되지 않았으면 구글 로그인 대신 **데모 계정**으로 로그인되고, 글은 그 브라우저에만 저장됩니다. (화면 확인용 "예시" 글 3개가 함께 보임)

### 구글 로그인 설정

1. **Google Cloud Console** → API 및 서비스 → OAuth 동의 화면 구성 → 사용자 인증 정보 → **OAuth 클라이언트 ID**(웹 애플리케이션) 만들기
   - 승인된 JavaScript 원본: `http://localhost:5173`, `https://<vercel-도메인>`
   - 승인된 리디렉션 URI: `https://<프로젝트-ref>.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Sign In / Providers → **Google** 사용 설정 후 클라이언트 ID·보안 비밀번호 입력
3. Authentication → **URL Configuration**
   - Site URL: `https://<vercel-도메인>`
   - Redirect URLs: `http://localhost:5173/**`, `https://<vercel-도메인>/**`
4. Vercel 환경변수 `VITE_GOOGLE_CLIENT_ID` 에 1번의 클라이언트 ID 를 넣고 다시 배포
   - 이 값이 있으면 구글 공식 로그인 버튼(Google Identity Services)을 쓰고, 로그인 창에 Supabase 주소 대신 사이트 주소가 표시됩니다.
   - 없으면 Supabase 로그인 페이지로 이동하는 방식으로 동작합니다.
   - 로컬에서 버튼을 쓰려면 승인된 JavaScript 원본에 `http://localhost` 와 `http://localhost:5173` 을 모두 추가합니다.
5. `supabase/migrations/20260927000000_roommates.sql` → `20260928000000_roommates_public_read.sql` 순서로 실행 (이전 버전을 실행했다면 파일 맨 위 안내대로 테이블을 지우고 다시 실행)

전북대 계정(`@jbnu.ac.kr`)만 허용하려면 RLS 정책에 `(auth.jwt() ->> 'email') like '%@jbnu.ac.kr'` 조건을 더하면 됩니다.

## 관리자 페이지 (`/admin`)

운영자 구글 계정(`thisiswoo04@gmail.com`)으로 로그인하면 헤더에 **[관리]**, 모바일 메뉴에 **관리자** 칸이 생깁니다.
다른 사용자가 `/admin` 에 들어가면 없는 페이지처럼 보입니다.

**권한은 서버가 정합니다.** 관리자는 `admins` 테이블에 등록된 계정(id)뿐이고, 모든 관리 기능은 `admin_*` 함수(RPC)로만 하며
함수마다 관리자인지 다시 확인합니다. 화면의 이메일 비교(`frontend/src/config.js` 의 `ADMIN_EMAIL`)는 메뉴를 보여 줄지만 정합니다.

- **처음 한 번**: 운영자 계정으로 사이트에 로그인해 본 뒤 `20261010000000_admin.sql` 을 실행합니다. 맨 아래 insert 문이 그 계정을 관리자로 등록합니다.
  (실행 전에 로그인한 적이 없다면 로그인한 뒤 그 insert 문만 다시 실행. 관리자를 더 두려면 이메일만 바꿔 실행)
- **개요**: 처리 대기 신고, 모집 중인 글, 사용자·정지 수, 오늘의 점수 계산·예측 요청, 최근 14일 추이(한국 시간), 최근 관리 기록
- **게시글**: 숨긴 글·정지된 사용자의 글까지 **모든 카드**. 상태(모집 중/모집완료/숨김/신고 대기/정지된 사용자)·학기·호관·성별·검색(내용·이메일·글 id)
  - 카드마다 체크리스트 보기, 모집완료/다시 모집, **숨기기**(글쓴이에게만 보임, 신청·신고 불가)/다시 보이기, 작성자 정지, 삭제(확인 창)
  - 룸메이트 찾기 카드의 **[관리]** 를 누르면 그 글이 관리자 페이지에서 열립니다.
- **신고**: 처리 대기/완료/기각. 신고한 사람·신고받은 사람(누적 신고 수·정지 상태), 신고 당시 내용, 운영자 메모, 글 숨기기, 신고받은 사람 정지
- **사용자**: 구글 로그인한 모든 계정의 이메일·가입일·최근 로그인·쓴 글·보낸 신청·받은/한 신고 수, 이용 정지(3일/7일/30일/무기한/날짜) · 해제 · 메모
- **합격 제보**: 제보자 이메일과 함께 보고, 이상한 값은 **학습에서 제외**(`is_excluded`)로 표시해 학습용 보기에서 뺍니다.
- **기록**: 관리 기록, 점수 계산 기록, 예측 요청 기록 (최신순, 한국 시간)
- 룸메 신청의 한마디·답장 내용은 관리 화면에도 보이지 않습니다 (신고된 신청은 신고 당시 내용만).
- 데모 모드(Supabase 미연결)에서는 개발 서버(`npm run dev`)에서 데모 계정으로 로그인하면 관리자 페이지를 볼 수 있고, 이 브라우저의 데이터로 동작합니다.

## 합격 결과 제보 (모델 학습 데이터)

홈 맨 아래 **합격 결과 제보**에서 구글 로그인 후 입력합니다. (`admission_reports` 테이블)

| 항목 | 비고 |
| --- | --- |
| 학기 | 지난 2년 + 이번 학기 |
| 지원한 호실 유형 | `changui_1` `changui_2` `b_2`(B타입 2인실) `hanbit_4` `chambit_2` `hyemin_1` `hyemin_2` — 성별·단과대학으로 지원할 수 없는 호실은 선택 불가 |
| 결과 | 합격 / 추가 합격 / 불합격, **B타입 2인실 합격이면 배정된 호관**(한빛·새빛·대동) |
| 환산점수 | 홈 계산기 값이 자동으로 채워짐 (수정 가능) |
| 성별 · 단과대학 · 학년 | 학년: 신입생 / 1~4학년 이상 / 대학원생 |

- 계정당 학기별 1건(`unique (user_id, semester)`), 본인 제보만 보고 고치고 지울 수 있습니다.
- 이상한 값은 지우지 말고 Table Editor 에서 `is_excluded = true` 로 표시합니다. (`admin_note` 에 이유 메모)
- 학습용 데이터는 **`admission_reports_training` 뷰**를 CSV 로 내보내 씁니다. 계정 정보가 없고, 제외 표시한 행이 빠지고,
  B타입 합격은 배정 호관의 호실 code(예: `saebit_2`)로 바뀌어 `room_code` 열에 들어 있습니다.
  신입생(`grade = 'freshman'`)은 환산점수 기준이 다를 수 있으니 따로 다루는 것을 권합니다.

## 데이터 갱신

- **새 학년도 거리표**가 나오면 `data/jbnu_distance_2026.csv` 를 새 표로 교체하고 `python scripts/build_regions.py`
- **생활관비·식당 시간**은 `frontend/src/data/dormFees.js` 를 수정합니다. (출처: 생활관 홈페이지 「생활관비 안내」)
- **생활관 정보**는 Supabase `dormitories`·`dormitory_rooms` 테이블을 수정하면 생활관 안내 페이지에 바로 반영됩니다. (기본값: `frontend/src/data/dormitories.js`)
- 호실 유형이나 지원 자격을 바꾸면 `backend/app/dormitories.py` 와 모델 `outputs` 도 맞춰 주세요.
- 단과대학이 바뀌면 `backend/app/colleges.py`, `frontend/src/data/colleges.js`, Supabase `colleges` 를 함께 수정하세요.

## 주의

본 서비스는 전북대학교 공식 서비스가 아닙니다. 실제 선발은 성별·학년·단과대학별 모집 인원과 지원자 분포에 따라 결정되므로
예측 결과는 참고용으로만 안내하세요.
