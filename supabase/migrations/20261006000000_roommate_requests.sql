-- 룸메이트 찾기: 공개 댓글 / 1:1 채팅 → 룸메 신청
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--            (예전 20261006000000_roommate_chats.sql 을 이미 실행했어도, 안 했어도 그대로 실행하면 된다)
--
--   · 남의 글에서 [룸메 신청]을 보내면, 글쓴이의 [받은 신청] 목록에 내 기본 정보 + 체크리스트가 전달된다.
--   · 신청에는 200자 이내 한마디(선택)를 남길 수 있다. 글쓴이만 볼 수 있다 (오픈채팅 링크 등 연락 수단).
--   · 신청은 글 하나에 한 번. 보낸 사람은 언제든 취소할 수 있다. 모집완료 글에는 새로 신청할 수 없다.
--   · 실시간 알림·주기적 확인이 없어 요청 수가 사용자가 버튼을 누른 횟수에만 비례한다.
--   · 테이블에 직접 접근하는 권한은 없고, 아래 함수(RPC)들이 권한을 확인한다.

-- ── 1) 예전 댓글 · 채팅 정리 ──
drop function if exists public.get_roommate_comments(uuid);
drop function if exists public.add_roommate_comment(uuid, text);
drop function if exists public.delete_roommate_comment(uuid);
drop table if exists public.roommate_comments cascade;
drop function if exists public.sync_roommate_comment_count();

drop function if exists public.open_roommate_chat(uuid);
drop function if exists public.send_roommate_message(uuid, text);
drop function if exists public.get_roommate_messages(uuid, bigint);
drop function if exists public.list_roommate_chats(uuid);
drop function if exists public.roommate_chat_role(uuid);
drop table if exists public.roommate_messages cascade;
drop table if exists public.roommate_chats cascade;

-- 카드에 보여 줄 수: 댓글 수 / 대화방 수 → 받은 신청 수
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'roommate_posts' and column_name = 'chat_count') then
    alter table public.roommate_posts rename column chat_count to request_count;
  elsif exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'roommate_posts' and column_name = 'comment_count') then
    alter table public.roommate_posts rename column comment_count to request_count;
  end if;
end;
$$;
alter table public.roommate_posts add column if not exists request_count integer not null default 0;

create or replace function public.touch_roommate_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 신청 수만 바뀐 경우에는 수정 시각을 건드리지 않는다
  if new.request_count is distinct from old.request_count
     and (new.content, new.checklist, new.is_closed, new.dormitory_code, new.semester)
         is not distinct from (old.content, old.checklist, old.is_closed, old.dormitory_code, old.semester) then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── 2) 신청 ──
create table if not exists public.roommate_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  post_id       uuid not null references public.roommate_posts (id) on delete cascade,
  applicant_id  uuid not null references auth.users (id) on delete cascade,
  message       text check (char_length(message) <= 200),
  seen_at       timestamptz,  -- 글쓴이가 [받은 신청]에서 확인한 시각 (null 이면 새 신청)
  unique (post_id, applicant_id)
);

create index if not exists roommate_requests_applicant_idx on public.roommate_requests (applicant_id);

alter table public.roommate_requests enable row level security;
revoke all on public.roommate_requests from anon, authenticated;

-- 글의 신청 수를 맞춘다
create or replace function public.sync_roommate_request_count(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.roommate_posts p
  set request_count = (select count(*) from public.roommate_requests r where r.post_id = p_post_id)
  where p.id = p_post_id;
$$;

-- ── 3) 신청 보내기 ──
create or replace function public.send_roommate_request(p_post_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  post record;
  request_id uuid;
  msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if uid is null or not exists (select 1 from public.roommate_profiles r where r.user_id = uid) then
    raise exception 'profile required' using errcode = '42501', hint = 'profile';
  end if;
  select p.user_id, p.is_open, p.is_closed into post from public.roommate_posts p where p.id = p_post_id;
  if not found or not post.is_open then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if post.user_id = uid then
    raise exception 'own post' using errcode = 'P0001', hint = 'own';
  end if;
  if post.is_closed then
    raise exception 'post closed' using errcode = 'P0001', hint = 'closed';
  end if;
  if char_length(msg) > 200 then
    raise exception 'message too long' using errcode = '22001', hint = 'too_long';
  end if;

  insert into public.roommate_requests (post_id, applicant_id, message)
  values (p_post_id, uid, msg)
  on conflict (post_id, applicant_id) do nothing
  returning id into request_id;
  if request_id is null then
    raise exception 'already sent' using errcode = '23505', hint = 'duplicate';
  end if;

  perform public.sync_roommate_request_count(p_post_id);
  return request_id;
end;
$$;

-- ── 4) 신청 취소 (보낸 사람만) ──
create or replace function public.cancel_roommate_request(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.roommate_requests r where r.post_id = p_post_id and r.applicant_id = auth.uid();
  perform public.sync_roommate_request_count(p_post_id);
end;
$$;

-- ── 5) 내가 신청한 글 id (카드에 "신청함" 표시) ──
create or replace function public.my_roommate_requests()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.post_id from public.roommate_requests r where r.applicant_id = auth.uid();
$$;

-- ── 6) 받은 신청 (내 글에 온 신청 + 신청자 프로필). p_post_id 를 주면 그 글만. 불러오면 확인한 것으로 표시 ──
create or replace function public.list_roommate_requests(p_post_id uuid default null)
returns table (
  request_id uuid,
  created_at timestamptz,
  post_id uuid,
  dormitory_code text,
  semester text,
  post_closed boolean,
  message text,
  is_new boolean,
  applicant jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select
      r.id,
      r.created_at,
      r.post_id,
      p.dormitory_code,
      p.semester,
      p.is_closed,
      r.message,
      r.seen_at is null,
      (
        select jsonb_build_object(
          'dormitory', f.dormitory_code,
          'gender', f.gender,
          'age', f.age,
          'collegeCode', f.college_code,
          'mbti', f.mbti,
          'checklist', f.checklist
        )
        from public.roommate_profiles f
        where f.user_id = r.applicant_id
      )
    from public.roommate_requests r
    join public.roommate_posts p on p.id = r.post_id
    where p.user_id = auth.uid()
      and (p_post_id is null or r.post_id = p_post_id)
    order by r.created_at desc;

  update public.roommate_requests r
  set seen_at = now()
  from public.roommate_posts p
  where p.id = r.post_id
    and p.user_id = auth.uid()
    and r.seen_at is null
    and (p_post_id is null or r.post_id = p_post_id);
end;
$$;

-- ── 7) 아직 확인하지 않은 받은 신청 수 (툴바 배지) ──
create or replace function public.count_new_roommate_requests()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where p.user_id = auth.uid() and r.seen_at is null;
$$;

revoke all on function public.sync_roommate_request_count(uuid) from public;
revoke all on function public.send_roommate_request(uuid, text) from public;
revoke all on function public.cancel_roommate_request(uuid) from public;
revoke all on function public.my_roommate_requests() from public;
revoke all on function public.list_roommate_requests(uuid) from public;
revoke all on function public.count_new_roommate_requests() from public;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;
grant execute on function public.cancel_roommate_request(uuid) to authenticated;
grant execute on function public.my_roommate_requests() to authenticated;
grant execute on function public.list_roommate_requests(uuid) to authenticated;
grant execute on function public.count_new_roommate_requests() to authenticated;
