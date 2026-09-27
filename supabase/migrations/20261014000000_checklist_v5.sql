-- 룸메이트 체크리스트 항목 변경: 저장된 답을 새 형식으로 옮긴다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행 (여러 번 실행해도 같은 결과)
--
--   · 없어진 항목: 의무식(mealPlan) · 이어폰 사용(earphones) · 방 쓰레기통 공유(sharedTrash) → 지움
--   · 잠버릇(sleepHabit): O/X → 복수 선택 배열. X → ["없음"], O → 지움 (어떤 잠버릇인지 몰라 다시 고르게)
--   · 취침 시간(bedtime) · 스탠드 끄는 시간(lampOff): 24시 형태 (10-11시 → 22-23시, 11-12시 → 23-24시 등)
--   · 룸메이트와의 관계: "비즈니스 관계" → "비즈니스"
--   · 방 안 전화 통화: "배달 전화만" 선택지가 없어져 그 답은 지움 (다시 고르게)
-- 화면(frontend/src/data/roommateChecklist.js 의 normalizeChecklist)도 같은 규칙으로 예전 답을 읽으므로,
-- 이 파일을 화면 배포보다 늦게 실행해도 보이는 모습은 같다.
-- 옮기는 동안 트리거(수정 시각 갱신 · 내 글 동기화 · 호관 성별 확인)는 끈다. 답의 형식만 바꾸는 것이라
-- 글이 "방금 수정됨"으로 바뀌거나, 예전 기준으로 만들어진 글 때문에 실행이 멈추지 않게.

create or replace function pg_temp.checklist_v5(c jsonb)
returns jsonb
language sql
immutable
as $$
  select
    case
      when c->>'sleepHabit' = 'true' then x - 'sleepHabit'
      when c->>'sleepHabit' = 'false' then jsonb_set(x, '{sleepHabit}', '["없음"]'::jsonb)
      else x
    end
  from (
    select
      (c - 'mealPlan' - 'earphones' - 'sharedTrash'
         - (case when c->>'phoneCalls' = '배달 전화만' then 'phoneCalls' else '' end))
      || case c->>'bedtime'
           when '10시 이전' then '{"bedtime": "22시 이전"}'::jsonb
           when '10-11시' then '{"bedtime": "22-23시"}'::jsonb
           when '11-12시' then '{"bedtime": "23-24시"}'::jsonb
           when '12-1시' then '{"bedtime": "24-1시"}'::jsonb
           else '{}'::jsonb
         end
      || case c->>'lampOff'
           when '11시 이전' then '{"lampOff": "23시 이전"}'::jsonb
           when '11-12시' then '{"lampOff": "23-24시"}'::jsonb
           when '12-1시' then '{"lampOff": "24-1시"}'::jsonb
           else '{}'::jsonb
         end
      || case when c->>'relationship' = '비즈니스 관계' then '{"relationship": "비즈니스"}'::jsonb else '{}'::jsonb end
      as x
  ) t;
$$;

alter table public.roommate_profiles disable trigger user;
alter table public.roommate_posts disable trigger user;

update public.roommate_profiles
set checklist = pg_temp.checklist_v5(checklist)
where checklist is distinct from pg_temp.checklist_v5(checklist);

update public.roommate_posts
set checklist = pg_temp.checklist_v5(checklist)
where checklist is distinct from pg_temp.checklist_v5(checklist);

alter table public.roommate_profiles enable trigger user;
alter table public.roommate_posts enable trigger user;

drop function pg_temp.checklist_v5(jsonb);
