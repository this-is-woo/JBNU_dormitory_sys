-- 룸메이트 일치 수: "원하는 침대/책상 자리"는 서로 달라야 일치
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 자리는 두 사람이 서로 다른 자리를 원해야 잘 맞는다. 그래서 seat 항목만 규칙이 다르다:
--   · 둘 다 답했고, 답이 다르거나 둘 중 하나라도 '상관 없음'이면 일치
--   · 같은 자리를 원하면 불일치
-- 나머지 항목은 20261015000000_roommate_match_sort.sql 과 같다 (답이 같으면 일치, 복수 선택은 순서 무관).
-- 화면의 규칙(frontend/src/data/roommateChecklist.js 의 answersMatch)과 같아야 한다.

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
    and theirs -> k not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    and case
      when k = 'seat' then
        mine -> k <> theirs -> k or mine -> k = '"상관 없음"'::jsonb
      when jsonb_typeof(mine -> k) = 'array' and jsonb_typeof(theirs -> k) = 'array' then
        (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(mine -> k) v)
        = (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(theirs -> k) v)
      else mine -> k = theirs -> k
    end;
$$;

revoke all on function public.roommate_match_count(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.roommate_match_count(jsonb, jsonb) to authenticated;
