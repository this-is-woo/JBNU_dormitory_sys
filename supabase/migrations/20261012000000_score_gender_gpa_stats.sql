-- 점수 계산 기록에 성별 추가 + 관리자 페이지 "학점 통계"
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 홈 계산기는 이제 단과대학·성별·학점·주소지가 모두 정해지면 기록한다.
--       성별을 저장하기 전의 예전 기록은 null 로 남는다.
--   · admin_gpa_stats: 점수 계산 기록으로 단과대학별 학점 통계(건수·평균·사분위·최저·최고)를 만든다. 관리자만.

-- ── 1) 점수 계산 기록에 성별 ──
alter table public.score_submissions add column if not exists gender text;

alter table public.score_submissions drop constraint if exists score_submissions_gender_check;
alter table public.score_submissions add constraint score_submissions_gender_check check (gender in ('남', '여'));

-- 브라우저가 쓸 수 있는 열에 성별만 더한다 (읽기·수정·삭제는 여전히 막혀 있음)
grant insert (gender) on public.score_submissions to anon, authenticated;

-- ── 2) 학점 통계 ──
-- p_days: null(전체) 또는 최근 며칠 · p_gender: null(전체) | 남 | 여
-- { total, no_gender, overall: {n, mean, min, q1, median, q3, max}, colleges: [{college_code, n, ...}] }
--   · no_gender: 이 기간의 기록 중 성별이 없는 예전 기록 수 (성별을 고르면 빠진다)
--   · 사분위는 percentile_cont(두 값 사이를 선형 보간)로 구한다
--   · 기록은 계산 단위라 같은 사람이 여러 번 계산하면 여러 건으로 센다
create or replace function public.admin_gpa_stats(p_days integer default null, p_gender text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  result jsonb;
begin
  perform public.admin_guard();
  if (p_days is not null and p_days not between 1 and 3650)
     or (p_gender is not null and p_gender not in ('남', '여')) then
    raise exception 'invalid filter' using errcode = '22023', hint = 'invalid';
  end if;
  if p_days is not null then
    since := now() - make_interval(days => p_days);
  end if;

  with period as (
    select s.college_code, s.gender, s.gpa
    from public.score_submissions s
    where since is null or s.created_at >= since
  ),
  picked as (
    select p.college_code, p.gpa
    from period p
    where p_gender is null or p.gender = p_gender
  ),
  -- 단과대학별 + 전체(grouping sets 의 빈 묶음)를 한 번에
  stats as (
    select
      grouping(p.college_code) = 1 as is_total,
      p.college_code,
      jsonb_build_object(
        'n',      count(*),
        'mean',   round(avg(p.gpa), 2),
        'min',    min(p.gpa),
        'q1',     round((percentile_cont(0.25) within group (order by p.gpa::double precision))::numeric, 2),
        'median', round((percentile_cont(0.5) within group (order by p.gpa::double precision))::numeric, 2),
        'q3',     round((percentile_cont(0.75) within group (order by p.gpa::double precision))::numeric, 2),
        'max',    max(p.gpa)
      ) as body
    from picked p
    group by grouping sets ((p.college_code), ())
  )
  select jsonb_build_object(
    'total',     (select count(*) from picked),
    'no_gender', (select count(*) from period p where p.gender is null),
    'overall',   (select s.body from stats s where s.is_total),
    'colleges',  coalesce((
      select jsonb_agg(s.body || jsonb_build_object('college_code', s.college_code) order by s.college_code)
      from stats s
      where not s.is_total
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Supabase 는 새 함수에 anon · authenticated 실행 권한을 자동으로 주므로 셋 모두에서 회수한 뒤 필요한 것만 준다
revoke all on function public.admin_gpa_stats(integer, text) from public, anon, authenticated;
grant execute on function public.admin_gpa_stats(integer, text) to authenticated;
