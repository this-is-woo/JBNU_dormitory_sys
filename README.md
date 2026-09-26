# JBNU 생활관 합격 예측

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
- **거리점수**: 생활관 관리동 → 주소지 **시·군·구청** 자동차 최단거리 기준, 20km마다 0.25점
  (전북대 생활관 「2025학년도 선발기준 거리 데이터」 251개 시·군·구 표를 그대로 사용 — [data/README.md](data/README.md))
- 주소지는 **시/도 → 시/군/구 → 읍/면/동** 3단 드롭다운입니다. 거리점수가 시·군·구 단위로 정해지고,
  같은 이름의 동이 여러 시·군·구에 있기 때문에 중간 단계(시/군/구)가 필요합니다.
  상위 단계를 고르기 전에는 하위 드롭다운이 비활성화됩니다.
- 행정구역은 행정표준코드관리시스템 법정동코드(2026-09-17 자료, 16개 시/도 · 256개 시/군/구 · 5,067개 읍/면/동) 기준입니다.

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
{ "collegeCode": "engineering", "gpa": 3.85, "merit": 2, "demerit": 0, "sidoCode": "11", "sigunguCode": "11110", "emdCode": "1111010100" }

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
   (`20260926000000_init.sql` → `20260927000000_roommates.sql`)
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
| `roommate_posts` | 룸메이트 찾기 게시글 | 로그인 사용자만 읽기·쓰기, 수정·삭제는 글쓴이만 (숨김은 대시보드에서 `is_open=false`) |

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
그래도 서버가 잠들어 있을 때를 대비해, 프론트엔드는 사이트에 들어올 때 `/health` 를 먼저 호출해 서버를 깨우고
예측 응답이 늦으면 결과 패널에 "서버가 깨어나는 중" 안내를 보여 줍니다.

## 룸메이트 찾기

`/roommates` 페이지. **구글 로그인한 사용자만** 글을 보고 쓸 수 있습니다. (다른 페이지는 로그인 없이 이용)

글쓰기는 3단계 창입니다.

1. **기본 정보**: 성별, 호관, 나이, 단과대학, MBTI
2. **룸메이트 체크리스트**: 「전북대 룸메이트 체크리스트 ver.4」 18개 항목 (`frontend/src/data/roommateChecklist.js`)
3. **소개 · 연락**: 자유 자기소개(선택), 연락 방법(오픈채팅 링크 권장)

- 체크리스트 답변은 `roommate_posts.checklist`(jsonb)에 저장됩니다. 항목을 바꾸려면 `roommateChecklist.js` 만 수정하면 됩니다.
- **필터**: 호관·성별 + 체크리스트 18개 항목. 항목끼리는 모두 만족(AND), 한 항목에서 여러 답을 고르면 그중 하나(OR).
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
5. `supabase/migrations/20260927000000_roommates.sql` 실행 (이전 버전을 실행했다면 파일 맨 위 안내대로 테이블을 지우고 다시 실행)

전북대 계정(`@jbnu.ac.kr`)만 허용하려면 RLS 정책에 `(auth.jwt() ->> 'email') like '%@jbnu.ac.kr'` 조건을 더하면 됩니다.

## 데이터 갱신

- **새 학년도 거리표**가 나오면 `data/jbnu_distance_2025.csv` 를 교체하고 `python scripts/build_regions.py --download`
- **생활관 정보**는 Supabase `dormitories`·`dormitory_rooms` 테이블을 수정하면 생활관 안내 페이지에 바로 반영됩니다. (기본값: `frontend/src/data/dormitories.js`)
- 호실 유형이나 지원 자격을 바꾸면 `backend/app/dormitories.py` 와 모델 `outputs` 도 맞춰 주세요.
- 단과대학이 바뀌면 `backend/app/colleges.py`, `frontend/src/data/colleges.js`, Supabase `colleges` 를 함께 수정하세요.

## 주의

본 서비스는 전북대학교 공식 서비스가 아닙니다. 실제 선발은 성별·학년·단과대학별 모집 인원과 지원자 분포에 따라 결정되므로
예측 결과는 참고용으로만 안내하세요.
