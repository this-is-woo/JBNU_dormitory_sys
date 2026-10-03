-- 룸메이트 찾기: 호관 · 호실은 내 정보가 아니라 글마다 고른다 ("어느 관 몇 인실 룸메이트를 구하는지")
-- 1인실은 룸메이트가 없으니 모집 글을 올릴 수 없다.
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤 SQL Editor 에서 실행. 실행한 다음 프런트엔드를 배포한다.
--
--   · roommate_profiles: 호관 · 호실을 받지 않는다 (dormitory_code 를 비워 둘 수 있게, 등록해 둔 값은 비운다)
--   · 내 정보를 고쳐도 내 글의 호관 · 호실은 그대로 (sync_roommate_profile 에서 뺀다. 성별 · 나이 · 단과대학 · MBTI · 체크리스트만 반영)
--   · roommate_posts: 새 글 · 호관이나 호실을 바꾸는 수정은 호실이 꼭 있어야 하고 1인실은 안 된다 (hint: room_required · single_room)
--     그 호관에 있는 호실인지는 20261027 의 roommate_posts_room_fk 가 검사한다
--   · 이미 올라온 글은 그대로 둔다 (호실이 비어 있거나 1인실인 예전 글도 내용 수정 · 모집완료는 된다)

-- ── 내 정보: 호관 · 호실 없이 ──
alter table public.roommate_profiles alter column dormitory_code drop not null;

-- 내 정보에는 호관이 없으므로 성별 · 호관 검사는 글에서만 한다
drop trigger if exists roommate_profiles_dorm_gender on public.roommate_profiles;

-- ── 내 정보를 고치면 내 글에도 (호관 · 호실은 글마다 고르므로 빼고) ──
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
  set gender       = new.gender,
      age          = new.age,
      college_code = new.college_code,
      mbti         = new.mbti,
      checklist    = new.checklist
  where p.user_id = new.user_id
    and (p.gender, p.age, p.college_code, p.mbti, p.checklist)
        is distinct from (new.gender, new.age, new.college_code, new.mbti, new.checklist);
  return new;
end;
$$;

-- 등록해 둔 호관 · 호실은 비운다 (수정 시각 · 글 반영 트리거는 건드리지 않게 잠시 끈다)
alter table public.roommate_profiles disable trigger user;
update public.roommate_profiles
set dormitory_code = null, room_type = null
where dormitory_code is not null or room_type is not null;
alter table public.roommate_profiles enable trigger user;

-- ── 글: 호실 필수 · 1인실 모집 불가 (새 글, 또는 호관 · 호실을 바꿀 때만 검사) ──
create or replace function public.check_roommate_post_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.dormitory_code is not distinct from old.dormitory_code
     and new.room_type is not distinct from old.room_type then
    return new;
  end if;
  if new.room_type is null then
    raise exception 'room type is required' using errcode = '23514', hint = 'room_required';
  end if;
  if new.room_type = '1인실' then
    raise exception 'single rooms have no roommate' using errcode = '23514', hint = 'single_room';
  end if;
  return new;
end;
$$;

drop trigger if exists roommate_posts_room on public.roommate_posts;
create trigger roommate_posts_room
  before insert or update on public.roommate_posts
  for each row execute function public.check_roommate_post_room();

revoke all on function public.check_roommate_post_room() from public;
