-- 룸메이트 찾기: 호관과 함께 호실(1인실 · 2인실 · 4인실)도 저장한다 → 카드 제목 "창의관 1인실"
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤 SQL Editor 에서 실행.
--
--   · roommate_profiles · roommate_posts 에 room_type 열. 그 호관에 있는 호실만 (dormitory_rooms 와 연결)
--   · 비어 있어도 된다: 예전에 등록한 정보 · 글. 화면에서는 호관만 보이고, 내 정보를 고칠 때 호실을 고른다
--   · 호실이 하나뿐인 호관(새빛 · 대동 · 참빛관 2인실)은 지금 있는 정보 · 글에 바로 채운다
--   · 내 정보를 고치면 내 글에도 반영된다 (sync_roommate_profile 에 room_type 추가)
--   · 일치 많은 순 목록(list_roommate_posts_by_match)도 room_type 을 돌려준다

alter table public.roommate_profiles add column if not exists room_type text;
alter table public.roommate_posts add column if not exists room_type text;

-- 그 호관에 있는 호실이어야 한다 (room_type 이 비어 있으면 검사하지 않는다)
alter table public.roommate_profiles drop constraint if exists roommate_profiles_room_fk;
alter table public.roommate_profiles add constraint roommate_profiles_room_fk
  foreign key (dormitory_code, room_type) references public.dormitory_rooms (dormitory_code, room_type) on update cascade;
alter table public.roommate_posts drop constraint if exists roommate_posts_room_fk;
alter table public.roommate_posts add constraint roommate_posts_room_fk
  foreign key (dormitory_code, room_type) references public.dormitory_rooms (dormitory_code, room_type) on update cascade;

-- ── 내 정보를 고치면 내 글에도 (호실 포함) ──
create or replace function public.sync_roommate_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  update public.roommate_posts p
  set dormitory_code = new.dormitory_code,
      room_type      = new.room_type,
      gender         = new.gender,
      age            = new.age,
      college_code   = new.college_code,
      mbti           = new.mbti,
      checklist      = new.checklist
  where p.user_id = new.user_id
    and (p.dormitory_code, p.room_type, p.gender, p.age, p.college_code, p.mbti, p.checklist)
        is distinct from (new.dormitory_code, new.room_type, new.gender, new.age, new.college_code, new.mbti, new.checklist);
  return new;
end;
$$;

-- ── 호실이 하나뿐인 호관은 지금 있는 정보 · 글에 채운다 (수정 시각 · 알림 트리거는 건드리지 않게 잠시 끈다) ──
alter table public.roommate_profiles disable trigger user;
alter table public.roommate_posts disable trigger user;

with single as (
  select r.dormitory_code, min(r.room_type) as room_type
  from public.dormitory_rooms r
  group by r.dormitory_code
  having count(*) = 1
)
update public.roommate_profiles p
set room_type = s.room_type
from single s
where p.room_type is null and p.dormitory_code = s.dormitory_code;

with single as (
  select r.dormitory_code, min(r.room_type) as room_type
  from public.dormitory_rooms r
  group by r.dormitory_code
  having count(*) = 1
)
update public.roommate_posts p
set room_type = s.room_type
from single s
where p.room_type is null and p.dormitory_code = s.dormitory_code;

alter table public.roommate_profiles enable trigger user;
alter table public.roommate_posts enable trigger user;

-- ── 권한: 내 정보는 열 단위로 준다 · 로그인하지 않은 방문자도 글의 호실을 본다 ──
grant select (room_type) on public.roommate_profiles to authenticated;
grant insert (room_type) on public.roommate_profiles to authenticated;
grant update (room_type) on public.roommate_profiles to authenticated;
grant select (room_type) on public.roommate_posts to anon;

-- ── 일치 많은 순 목록: room_type 추가 (돌려주는 열이 바뀌어 지우고 다시 만든다) ──
drop function if exists public.list_roommate_posts_by_match(text, text, text, integer, integer);
create function public.list_roommate_posts_by_match(
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
  room_type text,
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
    s.id, s.created_at, s.updated_at, s.user_id, s.dormitory_code, s.room_type, s.gender, s.age, s.college_code, s.mbti,
    s.checklist, s.content, s.semester, s.is_closed, s.is_open, s.request_count, s.match_count,
    count(*) over ()
  from scored s
  order by s.is_closed, (s.user_id = auth.uid()), s.match_count desc, s.created_at desc, s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 12), 1), 100);
$$;

revoke all on function public.list_roommate_posts_by_match(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_roommate_posts_by_match(text, text, text, integer, integer) to authenticated;
