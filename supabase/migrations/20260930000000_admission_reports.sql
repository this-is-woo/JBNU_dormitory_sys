-- 합격 결과 제보 (예측 모델 학습용)
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 학생이 직접 알려 주는 "이 점수로 이 호실에 지원해서 붙었나/떨어졌나".
--   · 구글 로그인한 사용자만 제보할 수 있고, 계정당 학기별 1건 (unique)
--   · 본인 제보만 보고 고치고 지울 수 있다. 다른 사람의 제보는 볼 수 없다.
--   · 이상한 값은 지우지 않고 관리자가 is_excluded = true 로 표시한다 (사용자는 바꿀 수 없음).
--   · 학습용으로 내보낼 때는 계정 정보를 뺀 admission_reports_training 뷰를 쓴다.
--
-- B타입 2인실(대동·새빛·한빛관)은 한꺼번에 선발한 뒤 점수 순으로 호관을 배정하므로
-- "지원한 호실 유형(b_2)" 과 "배정된 호관(assigned_dormitory)" 을 따로 받는다.

create table if not exists public.admission_reports (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,

  semester            text not null check (semester ~ '^20[0-9]{2}-[12]$'),  -- 예: 2026-2
  applied_room        text not null check (
                        applied_room in ('changui_1', 'changui_2', 'b_2', 'hanbit_6', 'chambit_2', 'hyemin_1', 'hyemin_2')
                      ),
  result              text not null check (result in ('accepted', 'waitlist', 'rejected')),  -- 합격 / 추가 합격 / 불합격
  assigned_dormitory  text references public.dormitories (code),  -- b_2 에 합격했을 때만
  converted_score     numeric(6, 2) not null check (converted_score between 0 and 120),
  gender              text not null check (gender in ('남', '여')),
  college_code        text not null references public.colleges (code) on update cascade,
  grade               text not null check (grade in ('freshman', '1', '2', '3', '4', 'graduate')),

  -- 관리자 전용: 학습에서 뺄 값 표시와 메모
  is_excluded         boolean not null default false,
  admin_note          text,

  unique (user_id, semester),

  -- 배정 호관은 B타입 2인실 합격일 때만, 그리고 그때는 반드시
  constraint admission_reports_assignment check (
    (applied_room = 'b_2' and result <> 'rejected') = (assigned_dormitory is not null)
  ),
  constraint admission_reports_b2_hall check (
    assigned_dormitory is null or assigned_dormitory in ('hanbit', 'saebit', 'daedong')
  ),
  -- 남자 전용 호관(한빛관·대동관)에 여학생이 배정될 수 없다
  constraint admission_reports_gender check (
    gender = '남' or (applied_room <> 'hanbit_6' and coalesce(assigned_dormitory, '') not in ('hanbit', 'daedong'))
  )
);

create index if not exists admission_reports_semester_room_idx on public.admission_reports (semester, applied_room);

create or replace function public.touch_admission_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists admission_reports_touch on public.admission_reports;
create trigger admission_reports_touch
  before update on public.admission_reports
  for each row execute function public.touch_admission_report();

alter table public.admission_reports enable row level security;

drop policy if exists "admission_reports: owner read" on public.admission_reports;
create policy "admission_reports: owner read" on public.admission_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "admission_reports: owner insert" on public.admission_reports;
create policy "admission_reports: owner insert" on public.admission_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "admission_reports: owner update" on public.admission_reports;
create policy "admission_reports: owner update" on public.admission_reports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "admission_reports: owner delete" on public.admission_reports;
create policy "admission_reports: owner delete" on public.admission_reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 사용자는 관리자 칸(is_excluded, admin_note)과 user_id 를 읽거나 바꿀 수 없다
revoke all on public.admission_reports from anon, authenticated;
grant select (id, created_at, updated_at, semester, applied_room, result, assigned_dormitory,
              converted_score, gender, college_code, grade)
  on public.admission_reports to authenticated;
grant insert (semester, applied_room, result, assigned_dormitory, converted_score, gender, college_code, grade)
  on public.admission_reports to authenticated;
grant update (semester, applied_room, result, assigned_dormitory, converted_score, gender, college_code, grade)
  on public.admission_reports to authenticated;
grant delete on public.admission_reports to authenticated;

-- 학습용 내보내기: 계정 정보 없이, 관리자가 제외한 값은 빼고,
-- 예측 단위(호실 유형 code: backend/app/dormitories.py)로 바꿔서 보여 준다.
--   b_2 합격 → 배정된 호관의 2인실 (예: saebit_2), b_2 불합격 → 'b_2'
-- Supabase Dashboard(SQL Editor, Table Editor)나 secret 키로만 볼 수 있다.
create or replace view public.admission_reports_training
with (security_invoker = true) as
select
  semester,
  applied_room,
  case
    when applied_room = 'b_2' and assigned_dormitory is not null then assigned_dormitory || '_2'
    else applied_room
  end as room_code,
  result,
  result <> 'rejected' as admitted,
  converted_score,
  gender,
  college_code,
  grade,
  created_at
from public.admission_reports
where not is_excluded;

revoke all on public.admission_reports_training from anon, authenticated;
