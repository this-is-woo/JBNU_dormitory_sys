-- 합격 결과 제보: 1학년은 거리점수로 받는다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 1학년(신입생 포함)은 학점 없이 거리점수로만 선발하므로, 1학년 제보는 환산점수 대신 거리점수(5 ~ 10점)를 받는다.
--   · 학년 선택지에서 "신입생"을 없애고 1학년으로 합친다 (예전 신입생 제보는 1학년으로 바꾼다)
--   · 1학년이 아니면: 환산점수 필수, 거리점수 없음
--   · 1학년이면: 거리점수 필수. 단, 이 마이그레이션 전에 환산점수로 제보한 1학년 행은 그대로 둔다
--   · 학습용 뷰(admission_reports_training)와 관리자 목록에도 거리점수를 보여 준다

alter table public.admission_reports add column if not exists distance_score numeric(4, 2);
alter table public.admission_reports drop constraint if exists admission_reports_distance_score_check;
alter table public.admission_reports add constraint admission_reports_distance_score_check
  check (distance_score between 5 and 10);

alter table public.admission_reports alter column converted_score drop not null;

-- 예전 "신입생" 제보 → 1학년 (updated_at 은 사용자가 고친 시각이라 건드리지 않는다)
alter table public.admission_reports disable trigger admission_reports_touch;
update public.admission_reports set grade = '1' where grade = 'freshman';
alter table public.admission_reports enable trigger admission_reports_touch;

alter table public.admission_reports drop constraint if exists admission_reports_grade_check;
alter table public.admission_reports add constraint admission_reports_grade_check
  check (grade in ('1', '2', '3', '4', 'graduate'));

alter table public.admission_reports drop constraint if exists admission_reports_score_by_grade;
alter table public.admission_reports add constraint admission_reports_score_by_grade check (
  case
    when grade = '1' then coalesce(distance_score, converted_score) is not null
    else converted_score is not null and distance_score is null
  end
);

grant select (distance_score) on public.admission_reports to authenticated;
grant insert (distance_score) on public.admission_reports to authenticated;
grant update (distance_score) on public.admission_reports to authenticated;

-- 학습용 뷰: 거리점수 열을 맨 끝에 더한다 (create or replace view 는 끝에만 열을 더할 수 있다)
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
  created_at,
  distance_score
from public.admission_reports
where not is_excluded;

revoke all on public.admission_reports_training from anon, authenticated;

-- 관리자 목록: 돌려주는 열이 바뀌므로 지우고 다시 만든다 (20261010000000_admin.sql 7) 과 같고 distance_score 만 더함)
drop function if exists public.admin_list_admission_reports(text, text, text, boolean, integer, integer);
create function public.admin_list_admission_reports(
  p_semester text default null,
  p_room text default null,
  p_result text default null,
  p_excluded boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  email text,
  semester text,
  applied_room text,
  result text,
  assigned_dormitory text,
  converted_score numeric,
  distance_score numeric,
  gender text,
  college_code text,
  grade text,
  is_excluded boolean,
  admin_note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard();
  return query
    select
      a.id,
      a.created_at,
      a.updated_at,
      a.user_id,
      u.email::text,
      a.semester,
      a.applied_room,
      a.result,
      a.assigned_dormitory,
      a.converted_score,
      a.distance_score,
      a.gender,
      a.college_code,
      a.grade,
      a.is_excluded,
      a.admin_note,
      count(*) over ()
    from public.admission_reports a
    left join auth.users u on u.id = a.user_id
    where (p_semester is null or a.semester = p_semester)
      and (p_room is null or a.applied_room = p_room)
      and (p_result is null or a.result = p_result)
      and (p_excluded is null or a.is_excluded = p_excluded)
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_admission_reports(text, text, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_admission_reports(text, text, text, boolean, integer, integer) to authenticated;
