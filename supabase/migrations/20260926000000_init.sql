-- 전북대 생활관 합격 예측 서비스 초기 스키마
-- 적용 방법: Supabase Dashboard → SQL Editor 에 붙여넣고 Run  (또는 Supabase CLI `supabase db push`)
--
-- 구조
--   colleges            단과대학
--   dormitories         생활관(건물)
--   dormitory_rooms     호실 유형 = 예측 단위 (예: 창의관 1인실). 같은 관이라도 인실별로 합격선이 다르다
--   room_eligibility    호실 유형별 지원 가능 단과대학
--   admission_cutoffs   과거 합격선 (모델 학습·검증용)
--   prediction_logs     예측 요청 기록
--
-- 접근 권한
--   prediction_logs 를 뺀 테이블 : 누구나 읽기 (프론트엔드 publishable 키)
--   prediction_logs             : 서버(secret 키)만 읽기/쓰기. RLS 정책이 없으므로 브라우저에서는 접근 불가

-- ─────────────────────────────────────────────
-- 1) 단과대학
-- ─────────────────────────────────────────────
create table if not exists public.colleges (
  code            text primary key,            -- 프론트엔드·백엔드와 같은 식별자 (backend/app/colleges.py)
  name            text not null unique,
  special_campus  boolean not null default false,  -- 특성화캠퍼스(익산) 생활관만 지원 가능
  sort_order      int not null default 0
);

-- ─────────────────────────────────────────────
-- 2) 생활관(건물)
-- ─────────────────────────────────────────────
create table if not exists public.dormitories (
  code            text primary key,
  name            text not null,
  selection_type  text not null check (selection_type in ('A', 'B', 'C', 'D')),
  campus          text not null default '전주',
  genders         text[] not null default '{}',
  meal_plan       text,
  sort_order      int not null default 0,
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3) 호실 유형 — 예측 단위
-- ─────────────────────────────────────────────
create table if not exists public.dormitory_rooms (
  code            text primary key,  -- 예: changui_1 (모델 출력 outputs 와 같음)
  dormitory_code  text not null references public.dormitories (code) on update cascade on delete cascade,
  room_type       text not null,     -- 1인실 / 2인실 / 4인실
  capacity        int,               -- 모집 정원 (학기마다 갱신)
  sort_order      int not null default 0,  -- 인기(합격선) 높은 순
  unique (dormitory_code, room_type)
);

-- 호실 유형별 지원 가능 단과대학 (행이 없는 호실 유형은 모든 단과대학 지원 가능)
create table if not exists public.room_eligibility (
  room_code     text not null references public.dormitory_rooms (code) on update cascade on delete cascade,
  college_code  text not null references public.colleges (code) on update cascade on delete cascade,
  primary key (room_code, college_code)
);

-- ─────────────────────────────────────────────
-- 4) 과거 합격선 — 모델 학습·검증용
-- ─────────────────────────────────────────────
create table if not exists public.admission_cutoffs (
  id              bigint generated always as identity primary key,
  academic_year   int not null,
  semester        smallint not null check (semester in (1, 2)),
  room_code       text not null references public.dormitory_rooms (code) on update cascade,
  college_code    text references public.colleges (code) on update cascade,  -- 단과대학별 선발이면 입력
  gender          text check (gender in ('M', 'F')),
  cutoff_score    numeric(6, 2) not null,  -- 최종 합격자 환산점수
  applicants      int,
  admitted        int,
  source          text,
  created_at      timestamptz not null default now(),
  unique nulls not distinct (academic_year, semester, room_code, college_code, gender)
);

-- ─────────────────────────────────────────────
-- 5) 예측 기록 — 백엔드가 /api/v1/predict 요청마다 기록 (LOG_PREDICTIONS=true)
-- ─────────────────────────────────────────────
create table if not exists public.prediction_logs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  college_code     text not null references public.colleges (code) on update cascade,
  gpa              numeric(3, 2) not null check (gpa between 1.0 and 4.5),
  merit            smallint not null check (merit between 0 and 99),
  demerit          smallint not null check (demerit between 0 and 99),
  sido_code        text not null,
  sigungu_code     text not null,
  emd_code         text not null,
  distance_score   numeric(4, 2) not null,
  converted_score  numeric(6, 2) not null,
  predictions      jsonb not null,  -- { "changui_1": 0.62, "hanbit_2": 0.71, ... }
  model_mode       text not null,   -- 'model' | 'baseline'
  model_version    text
);

create index if not exists prediction_logs_created_at_idx on public.prediction_logs (created_at desc);
create index if not exists prediction_logs_college_idx on public.prediction_logs (college_code);

-- ─────────────────────────────────────────────
-- RLS & 권한
-- ─────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['colleges', 'dormitories', 'dormitory_rooms', 'room_eligibility', 'admission_cutoffs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: public read" on public.%I', t, t);
    execute format('create policy "%s: public read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

alter table public.prediction_logs enable row level security;
grant select, insert on public.prediction_logs to service_role;

-- ─────────────────────────────────────────────
-- 초기 데이터
-- ─────────────────────────────────────────────
insert into public.colleges (code, name, special_campus, sort_order) values
  ('nursing',         '간호대학',         false, 1),
  ('business',        '경상대학',         false, 2),
  ('engineering',     '공과대학',         false, 3),
  ('agriculture',     '농업생명과학대학', false, 4),
  ('education',       '사범대학',         false, 5),
  ('social_science',  '사회과학대학',     false, 6),
  ('human_ecology',   '생활과학대학',     false, 7),
  ('veterinary',      '수의과대학',       true,  8),
  ('pharmacy',        '약학대학',         false, 9),
  ('arts',            '예술대학',         false, 10),
  ('medicine',        '의과대학',         false, 11),
  ('humanities',      '인문대학',         false, 12),
  ('natural_science', '자연과학대학',     false, 13),
  ('dentistry',       '치과대학',         false, 14),
  ('environment',     '환경생명자원대학', true,  15),
  ('ai',              'AI대학',           false, 16),
  ('graduate',        '일반대학원',       false, 17),
  ('law',             '법학전문대학원',   false, 18)
on conflict (code) do update set
  name = excluded.name, special_campus = excluded.special_campus, sort_order = excluded.sort_order;

insert into public.dormitories (code, name, selection_type, genders, meal_plan, sort_order) values
  ('changui', '창의관', 'D', array['남', '여'], '급식 없음',              1),
  ('hanbit',  '한빛관', 'B', array['남'],       '직영급식 (미선택 가능)', 2),
  ('saebit',  '새빛관', 'B', array['남', '여'], '직영급식 (미선택 가능)', 3),
  ('daedong', '대동관', 'B', array['남'],       '직영급식 (미선택 가능)', 4),
  ('chambit', '참빛관', 'A', array['남', '여'], '참빛관 식당',            5),
  ('hyemin',  '혜민관', 'C', array['남', '여'], '급식 없음',              6)
on conflict (code) do update set
  name = excluded.name, selection_type = excluded.selection_type, genders = excluded.genders,
  meal_plan = excluded.meal_plan, sort_order = excluded.sort_order, updated_at = now();

-- 인기 순서: 창의관 1인실 > 창의관 2인실 = 한빛관 2인실 > 새빛관 2인실 > 한빛관 4인실 > 대동관 2인실 > 참빛관 2인실
insert into public.dormitory_rooms (code, dormitory_code, room_type, sort_order) values
  ('changui_1', 'changui', '1인실', 1),
  ('changui_2', 'changui', '2인실', 2),
  ('hanbit_2',  'hanbit',  '2인실', 3),
  ('saebit_2',  'saebit',  '2인실', 4),
  ('hanbit_4',  'hanbit',  '4인실', 5),
  ('daedong_2', 'daedong', '2인실', 6),
  ('chambit_2', 'chambit', '2인실', 7),
  ('hyemin_1',  'hyemin',  '1인실', 8),
  ('hyemin_2',  'hyemin',  '2인실', 9)
on conflict (code) do update set
  dormitory_code = excluded.dormitory_code, room_type = excluded.room_type, sort_order = excluded.sort_order;

-- 지원 자격 (backend/app/dormitories.py 와 같게 유지)
--   창의관(D)      : 모든 단과대학 → 행 없음
--   A·B 타입       : 법학전문대학원 제외
--   혜민관(C)      : 의과대학·간호대학
insert into public.room_eligibility (room_code, college_code)
select r.code, c.code
from public.dormitory_rooms r
cross join public.colleges c
where not c.special_campus
  and (
    (r.dormitory_code in ('hanbit', 'saebit', 'daedong', 'chambit') and c.code <> 'law')
    or (r.dormitory_code = 'hyemin' and c.code in ('medicine', 'nursing'))
  )
on conflict do nothing;
