-- 룸메이트 찾기: 내 체크리스트(프로필)를 등록한 사람만 게시판을 볼 수 있게 한다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · roommate_profiles: 계정당 1개. 기본 정보(호관·성별·나이·단과대학·MBTI) + 룸메이트 체크리스트
--   · 게시글·댓글 읽기: 로그인 + 프로필이 있는 사용자만 (화면의 블러뿐 아니라 DB 에서도 막는다)
--   · 글쓰기: 프로필 값이 게시글에 그대로 들어가고, 소개·연락 방법만 새로 적는다
--   · 프로필을 고치면 내가 쓴 글에도 자동으로 반영된다 (트리거)
--   · 이미 글을 쓴 사용자는 가장 최근 글의 정보로 프로필을 자동으로 만든다 (맨 아래)

create table if not exists public.roommate_profiles (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  dormitory_code  text not null references public.dormitories (code) on update cascade,
  gender          text not null check (gender in ('남', '여')),
  age             smallint not null check (age between 17 and 60),
  college_code    text not null references public.colleges (code) on update cascade,
  mbti            text check (mbti ~ '^[EI][SN][TF][JP]$'),  -- 모르면 null
  checklist       jsonb not null check (jsonb_typeof(checklist) = 'object')
);

alter table public.roommate_profiles enable row level security;

-- 본인 프로필만. 다른 사람의 정보는 게시글로만 보인다.
drop policy if exists "roommate_profiles: owner read" on public.roommate_profiles;
create policy "roommate_profiles: owner read" on public.roommate_profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "roommate_profiles: owner insert" on public.roommate_profiles;
create policy "roommate_profiles: owner insert" on public.roommate_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "roommate_profiles: owner update" on public.roommate_profiles;
create policy "roommate_profiles: owner update" on public.roommate_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "roommate_profiles: owner delete" on public.roommate_profiles;
create policy "roommate_profiles: owner delete" on public.roommate_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.roommate_profiles from anon, authenticated;
grant select (user_id, created_at, updated_at, dormitory_code, gender, age, college_code, mbti, checklist)
  on public.roommate_profiles to authenticated;
grant insert (dormitory_code, gender, age, college_code, mbti, checklist) on public.roommate_profiles to authenticated;
grant update (dormitory_code, gender, age, college_code, mbti, checklist) on public.roommate_profiles to authenticated;
grant delete on public.roommate_profiles to authenticated;

-- 프로필이 있는 사용자인지 (게시글·댓글 읽기 권한 확인용)
create or replace function public.has_roommate_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roommate_profiles where user_id = auth.uid());
$$;

revoke all on function public.has_roommate_profile() from public;
grant execute on function public.has_roommate_profile() to authenticated;

-- 프로필 수정 시각 기록 + 내가 쓴 글에 반영
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
      gender         = new.gender,
      age            = new.age,
      college_code   = new.college_code,
      mbti           = new.mbti,
      checklist      = new.checklist
  where p.user_id = new.user_id
    and (p.dormitory_code, p.gender, p.age, p.college_code, p.mbti, p.checklist)
        is distinct from (new.dormitory_code, new.gender, new.age, new.college_code, new.mbti, new.checklist);
  return new;
end;
$$;

drop trigger if exists roommate_profiles_sync on public.roommate_profiles;
create trigger roommate_profiles_sync
  before insert or update on public.roommate_profiles
  for each row execute function public.sync_roommate_profile();

revoke all on function public.sync_roommate_profile() from public;

-- ── 게시글 읽기: 로그인 + 프로필 ──
drop policy if exists "roommate_posts: public read" on public.roommate_posts;
drop policy if exists "roommate_posts: signed-in read" on public.roommate_posts;
drop policy if exists "roommate_posts: profile read" on public.roommate_posts;
create policy "roommate_posts: profile read" on public.roommate_posts
  for select to authenticated
  using (user_id = (select auth.uid()) or (is_open and (select public.has_roommate_profile())));

revoke select on public.roommate_posts from anon;

-- ── 댓글: 읽기·쓰기 모두 프로필이 있어야 ──
create or replace function public.get_roommate_comments(p_post_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  content text,
  is_post_author boolean,
  anon_no integer,
  is_mine boolean,
  can_delete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with post as (
    select p.user_id as author
    from public.roommate_posts p
    where p.id = p_post_id
      and (p.user_id = auth.uid() or (p.is_open and exists (select 1 from public.roommate_profiles r where r.user_id = auth.uid())))
  ),
  cs as (
    select c.id, c.created_at, c.content, c.user_id
    from public.roommate_comments c
    where c.post_id = p_post_id and not c.is_hidden
  ),
  nums as (
    select cs.user_id, row_number() over (order by min(cs.created_at))::integer as n
    from cs, post
    where cs.user_id <> post.author
    group by cs.user_id
  )
  select
    cs.id,
    cs.created_at,
    cs.content,
    cs.user_id = post.author,
    coalesce(nums.n, 0),
    coalesce(cs.user_id = auth.uid(), false),
    coalesce(cs.user_id = auth.uid() or post.author = auth.uid(), false)
  from cs
  cross join post
  left join nums on nums.user_id = cs.user_id
  order by cs.created_at;
$$;

create or replace function public.add_roommate_comment(p_post_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null or not exists (select 1 from public.roommate_profiles r where r.user_id = uid) then
    raise exception 'profile required' using errcode = '42501', hint = 'profile';
  end if;
  if not exists (
    select 1 from public.roommate_posts p where p.id = p_post_id and p.is_open and not p.is_closed
  ) then
    raise exception 'post closed' using errcode = 'P0001', hint = 'closed';
  end if;
  insert into public.roommate_comments (post_id, user_id, content)
  values (p_post_id, uid, btrim(p_content))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.get_roommate_comments(uuid) from public;
revoke all on function public.add_roommate_comment(uuid, text) from public;
revoke execute on function public.get_roommate_comments(uuid) from anon;  -- 20261001 에서 anon 에 준 권한 회수
grant execute on function public.get_roommate_comments(uuid) to authenticated;
grant execute on function public.add_roommate_comment(uuid, text) to authenticated;

-- ── 이미 글을 쓴 사용자: 가장 최근 글의 정보로 프로필 만들기 ──
-- (트리거가 그 사용자의 다른 글도 같은 값으로 맞춘다)
insert into public.roommate_profiles (user_id, dormitory_code, gender, age, college_code, mbti, checklist)
select distinct on (p.user_id) p.user_id, p.dormitory_code, p.gender, p.age, p.college_code, p.mbti, p.checklist
from public.roommate_posts p
order by p.user_id, p.created_at desc
on conflict (user_id) do nothing;
