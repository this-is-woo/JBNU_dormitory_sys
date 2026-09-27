-- 룸메이트 찾기 정렬: "일치 많은 순"
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 목록은 무한 스크롤로 12개씩 나눠 받으므로, 일치 수로 정렬하려면 DB 가 계산해야 순서가 맞다.
--   · roommate_match_count: 두 체크리스트에서 답이 같은 항목 수
--       화면(frontend/src/components/roommates/postFormat.js 의 matchCount)과 같은 규칙:
--       내가 답한 항목만 세고, 복수 선택(잠버릇)은 고른 것이 모두 같으면 같음(순서 무관)
--       항목 목록은 frontend/src/data/roommateChecklist.js 와 같아야 한다
--   · list_roommate_posts_by_match: 내 정보의 체크리스트와 일치 수가 많은 순.
--       security invoker 라 게시글 읽기 정책(RLS: 내 정보 등록 · 차단 · 정지 · 숨김)이 그대로 적용된다.
--       모집 중인 글 먼저, 내 글은 뒤로, 같은 일치 수면 최신순

create or replace function public.roommate_match_count(mine jsonb, theirs jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from unnest(array[
    'smoking', 'sleepHabit', 'deepSleeper', 'lateSnack',
    'bedtime', 'wakeup', 'lampOff',
    'roomCleaning', 'bathroomCleaning', 'recycling',
    'relationship', 'phoneCalls', 'sharing', 'friendsOver', 'seat'
  ]) as k
  where mine ? k
    and theirs ? k
    and mine -> k not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    and case
      when jsonb_typeof(mine -> k) = 'array' and jsonb_typeof(theirs -> k) = 'array' then
        (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(mine -> k) v)
        = (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(theirs -> k) v)
      else mine -> k = theirs -> k
    end;
$$;

create or replace function public.list_roommate_posts_by_match(
  p_semester text default null,
  p_dormitory text default null,
  p_gender text default null,
  p_offset integer default 0,
  p_limit integer default 12
)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  dormitory_code text,
  gender text,
  age smallint,
  college_code text,
  mbti text,
  checklist jsonb,
  content text,
  semester text,
  is_closed boolean,
  is_open boolean,
  request_count integer,
  match_count integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select r.checklist from public.roommate_profiles r where r.user_id = auth.uid()
  ),
  scored as (
    select p.*, public.roommate_match_count((select m.checklist from me m), p.checklist) as match_count
    from public.roommate_posts p
    where (p_semester is null or p.semester = p_semester)
      and (p_dormitory is null or p.dormitory_code = p_dormitory)
      and (p_gender is null or p.gender = p_gender)
  )
  select
    s.id, s.created_at, s.updated_at, s.user_id, s.dormitory_code, s.gender, s.age, s.college_code, s.mbti,
    s.checklist, s.content, s.semester, s.is_closed, s.is_open, s.request_count, s.match_count,
    count(*) over ()
  from scored s
  order by s.is_closed, (s.user_id = auth.uid()), s.match_count desc, s.created_at desc, s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 12), 1), 100);
$$;

revoke all on function public.roommate_match_count(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.roommate_match_count(jsonb, jsonb) to authenticated;
revoke all on function public.list_roommate_posts_by_match(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_roommate_posts_by_match(text, text, text, integer, integer) to authenticated;
