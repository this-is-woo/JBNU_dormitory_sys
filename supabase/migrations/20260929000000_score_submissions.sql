-- 환산점수 계산 기록
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 홈의 환산점수 계산 표에서 단과대학·학점·주소지를 모두 입력해 점수가 나오면,
-- 브라우저가 아래 네 값만 익명으로 저장한다. (누가 입력했는지·주소·상벌점은 저장하지 않음)
--   · 누구나 쓰기만 가능하고, 읽기·수정·삭제는 막는다. 조회는 Supabase Dashboard(Table Editor)에서.
--   · 합격률 예측 요청 기록은 별도 테이블 prediction_logs(백엔드가 저장)에 있다.

create table if not exists public.score_submissions (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  college_code     text not null references public.colleges (code) on update cascade,
  gpa              numeric(3, 2) not null check (gpa between 1.0 and 4.5),
  distance_score   numeric(4, 2) not null check (distance_score between 5 and 10),
  -- 상점·벌점(최대 ±0.891)까지 반영한 값이라 대략 7 ~ 118 사이
  converted_score  numeric(6, 2) not null check (converted_score between 0 and 120)
);

create index if not exists score_submissions_created_at_idx on public.score_submissions (created_at desc);
create index if not exists score_submissions_college_idx on public.score_submissions (college_code);

alter table public.score_submissions enable row level security;

drop policy if exists "score_submissions: anyone insert" on public.score_submissions;
create policy "score_submissions: anyone insert" on public.score_submissions
  for insert to anon, authenticated
  with check (true);

revoke all on public.score_submissions from anon, authenticated;
grant insert (college_code, gpa, distance_score, converted_score)
  on public.score_submissions to anon, authenticated;
