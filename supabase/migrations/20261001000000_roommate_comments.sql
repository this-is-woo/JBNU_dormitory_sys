-- 룸메이트 찾기 댓글
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 게시글처럼 익명이다. 한 글 안에서만 "글쓴이 / 익명 1 / 익명 2 …" 로 구분해 대화를 이어 갈 수 있게 하고,
-- 계정 ID 는 밖으로 내보내지 않는다 (다른 글의 댓글과 같은 사람인지 알 수 없음).
--   · 읽기: 누구나 (get_roommate_comments 함수로만)
--   · 쓰기: 로그인한 사용자, 모집 중인 글에만 (add_roommate_comment)
--   · 삭제: 댓글 쓴 사람 또는 그 글의 글쓴이 (delete_roommate_comment)
--   · 테이블에 직접 접근하는 권한은 없고, 위 함수들이 권한을 확인한다.
--   · 부적절한 댓글은 Supabase Dashboard 에서 is_hidden 을 true 로 바꿔 숨긴다.
--   · 게시글의 comment_count 는 트리거가 맞춰 둔다 (카드의 "댓글 N").

create table if not exists public.roommate_comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  post_id     uuid not null references public.roommate_posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null check (char_length(btrim(content)) between 1 and 500),
  is_hidden   boolean not null default false
);

create index if not exists roommate_comments_post_idx on public.roommate_comments (post_id, created_at);

alter table public.roommate_comments enable row level security;
-- 정책이 없으므로 anon·authenticated 는 테이블을 직접 읽거나 쓸 수 없다
revoke all on public.roommate_comments from anon, authenticated;

-- ── 게시글의 댓글 수 ──
alter table public.roommate_posts add column if not exists comment_count integer not null default 0;

-- 댓글 수만 바뀐 경우에는 게시글의 수정 시각(updated_at)을 건드리지 않는다
create or replace function public.touch_roommate_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.comment_count is distinct from old.comment_count
     and (new.content, new.contact, new.checklist, new.is_closed, new.dormitory_code)
         is not distinct from (old.content, old.contact, old.checklist, old.is_closed, old.dormitory_code) then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_roommate_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.roommate_posts
  set comment_count = (
    select count(*) from public.roommate_comments c where c.post_id = target and not c.is_hidden
  )
  where id = target;
  return null;
end;
$$;

drop trigger if exists roommate_comments_count on public.roommate_comments;
create trigger roommate_comments_count
  after insert or delete or update of is_hidden on public.roommate_comments
  for each row execute function public.sync_roommate_comment_count();

-- ── 댓글 목록 ──
-- author_label: 0 = 글쓴이, 1·2·3… = 그 글에 처음 댓글을 단 순서대로 붙인 익명 번호
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
    where p.id = p_post_id and (p.is_open or p.user_id = auth.uid())
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

-- ── 댓글 쓰기 ──
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
  if uid is null then
    raise exception 'login required' using errcode = '42501';
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

-- ── 댓글 삭제: 댓글 쓴 사람 또는 그 글의 글쓴이 ──
create or replace function public.delete_roommate_comment(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.roommate_comments c
    where c.id = p_id
      and (
        c.user_id = auth.uid()
        or exists (select 1 from public.roommate_posts p where p.id = c.post_id and p.user_id = auth.uid())
      )
    returning 1
  )
  select exists (select 1 from deleted);
$$;

revoke all on function public.get_roommate_comments(uuid) from public;
revoke all on function public.add_roommate_comment(uuid, text) from public;
revoke all on function public.delete_roommate_comment(uuid) from public;
grant execute on function public.get_roommate_comments(uuid) to anon, authenticated;
grant execute on function public.add_roommate_comment(uuid, text) to authenticated;
grant execute on function public.delete_roommate_comment(uuid) to authenticated;
revoke all on function public.sync_roommate_comment_count() from public;
