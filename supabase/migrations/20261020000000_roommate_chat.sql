-- 신청 내역 → 채팅: 룸메 신청 하나가 신청자와 글쓴이의 1:1 대화방이 된다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 룸메 신청(roommate_requests)을 보내면 대화방이 생기고, 두 사람은 메시지를 자유롭게 주고받는다.
--     예전의 "한마디 + 답장 한 번" 은 대화방의 첫 메시지들로 옮긴다.
--   · 메시지(roommate_thread_messages)는 대화방의 두 사람만 읽을 수 있다 (RLS).
--     보낸 사람은 계정 id 대신 역할(applicant: 신청자, author: 글쓴이)로만 남겨, 서로 익명이 유지된다.
--   · 거의 실시간: Supabase Realtime 이 새 메시지를 두 사람의 화면에 바로 보낸다 (supabase_realtime 발행에 추가).
--     Realtime 도 위 RLS 를 그대로 따르므로 남의 대화는 받을 수 없다.
--   · 메시지 쓰기는 함수(post_roommate_thread_message)로만. 정지된 사용자는 보낼 수 없고, 1분에 20개까지.
--   · 어디까지 읽었는지(roommate_thread_reads)로 안 읽은 메시지 수를 센다 (헤더·메뉴의 새 소식 표시).
--   · 차단하거나 신청을 취소하면 대화방과 메시지가 함께 지워진다 (roommate_requests 를 지우면 연쇄 삭제).
--   · 대화를 신고하면 최근 메시지 30개를 신고 당시 내용으로 남긴다 (운영자만 봄).

-- ── 1) 메시지 · 읽음 표시 ──
create table if not exists public.roommate_thread_messages (
  id           bigint generated always as identity primary key,
  request_id   uuid not null references public.roommate_requests (id) on delete cascade,
  sender_role  text not null check (sender_role in ('applicant', 'author')),
  -- request: 룸메 신청 (신청할 때 남긴 한마디가 body, 없으면 null) · text: 일반 메시지
  kind         text not null default 'text' check (kind in ('request', 'text')),
  body         text check (body is null or char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now(),
  constraint roommate_thread_messages_body check (kind = 'request' or body is not null)
);

create index if not exists roommate_thread_messages_thread_idx
  on public.roommate_thread_messages (request_id, id);

create table if not exists public.roommate_thread_reads (
  request_id    uuid not null references public.roommate_requests (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  last_read_id  bigint not null default 0,
  primary key (request_id, user_id)
);

alter table public.roommate_thread_reads enable row level security;
revoke all on public.roommate_thread_reads from anon, authenticated;

-- 이 대화방에서 나의 역할: 'applicant' | 'author' | null(대화방의 사람이 아님)
create or replace function public.roommate_thread_role(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.applicant_id = auth.uid() then 'applicant'
    when p.user_id = auth.uid() then 'author'
  end
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where r.id = p_request_id;
$$;

-- 메시지는 대화방의 두 사람만 읽는다. 쓰기·고치기·지우기 권한은 없다 (함수로만 쓴다)
alter table public.roommate_thread_messages enable row level security;
revoke all on public.roommate_thread_messages from anon, authenticated;
grant select on public.roommate_thread_messages to authenticated;

drop policy if exists "roommate_thread_messages: members read" on public.roommate_thread_messages;
create policy "roommate_thread_messages: members read" on public.roommate_thread_messages
  for select to authenticated
  using (public.roommate_thread_role(request_id) is not null);

-- 실시간 전송 (Supabase 에만 있는 발행. 없으면 건너뛴다)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roommate_thread_messages'
     ) then
    alter publication supabase_realtime add table public.roommate_thread_messages;
  end if;
end;
$$;

-- ── 2) 예전 신청의 한마디 · 답장을 대화방으로 옮긴다 (이미 옮긴 신청은 건너뜀) ──
do $$
declare
  todo uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into todo
  from public.roommate_requests r
  where not exists (select 1 from public.roommate_thread_messages m where m.request_id = r.id);

  insert into public.roommate_thread_messages (request_id, sender_role, kind, body, created_at)
  select r.id, 'applicant', 'request', r.message, r.created_at
  from public.roommate_requests r
  where r.id = any (todo)
  order by r.created_at;

  insert into public.roommate_thread_messages (request_id, sender_role, kind, body, created_at)
  select r.id, 'author', 'text', r.reply, coalesce(r.replied_at, r.created_at)
  from public.roommate_requests r
  where r.id = any (todo) and r.reply is not null
  order by coalesce(r.replied_at, r.created_at);

  -- 신청자: 답장이 없거나 확인했으면 모두 읽음, 아니면 자기 신청까지만
  insert into public.roommate_thread_reads (request_id, user_id, last_read_id)
  select r.id, r.applicant_id,
    case when r.reply is null or r.reply_seen_at is not null
      then (select max(m.id) from public.roommate_thread_messages m where m.request_id = r.id)
      else (select min(m.id) from public.roommate_thread_messages m where m.request_id = r.id)
    end
  from public.roommate_requests r
  where r.id = any (todo)
  on conflict (request_id, user_id) do nothing;

  -- 글쓴이: 답장했으면 모두 읽음, 신청을 확인했으면 신청까지, 아니면 안 읽음
  insert into public.roommate_thread_reads (request_id, user_id, last_read_id)
  select r.id, p.user_id,
    case
      when r.reply is not null then (select max(m.id) from public.roommate_thread_messages m where m.request_id = r.id)
      when r.seen_at is not null then (select min(m.id) from public.roommate_thread_messages m where m.request_id = r.id)
      else 0
    end
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where r.id = any (todo)
  on conflict (request_id, user_id) do nothing;
end;
$$;

-- ── 3) 룸메 신청: 신청과 함께 대화방의 첫 메시지를 남긴다 ──
-- 20261016000000_roommate_recruit_semester.sql 의 send_roommate_request 와 같고, 마지막에 첫 메시지만 더했다
create or replace function public.send_roommate_request(p_post_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_gender text;
  post record;
  recruit text := public.roommate_recruit_semester();
  new_request_id uuid;
  first_id bigint;
  msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select r.gender into my_gender from public.roommate_profiles r where r.user_id = uid;
  if uid is null or my_gender is null then
    raise exception 'profile required' using errcode = '42501', hint = 'profile';
  end if;
  select p.user_id, p.gender, p.is_open, p.is_closed, p.semester into post from public.roommate_posts p where p.id = p_post_id;
  if not found
     or not post.is_open
     or public.roommate_is_blocked(post.user_id)
     or public.roommate_user_suspended(post.user_id) then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if post.user_id = uid then
    raise exception 'own post' using errcode = 'P0001', hint = 'own';
  end if;
  if recruit is not null and post.semester is distinct from recruit then
    raise exception 'post archived' using errcode = 'P0001', hint = 'archived';
  end if;
  if post.gender <> my_gender then
    raise exception 'different gender' using errcode = 'P0001', hint = 'gender';
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
  returning id into new_request_id;
  if new_request_id is null then
    raise exception 'already sent' using errcode = '23505', hint = 'duplicate';
  end if;

  insert into public.roommate_thread_messages (request_id, sender_role, kind, body)
  values (new_request_id, 'applicant', 'request', msg)
  returning id into first_id;
  insert into public.roommate_thread_reads (request_id, user_id, last_read_id)
  values (new_request_id, uid, first_id);

  perform public.sync_roommate_request_count(p_post_id);
  return new_request_id;
end;
$$;

revoke all on function public.send_roommate_request(uuid, text) from public, anon;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;

-- ── 4) 대화방 목록 (p_request_id 를 주면 그 방만) ──
--   role: 나의 역할 · counterpart: 상대 정보 (글쓴이면 신청자의 내 정보, 신청자면 글의 정보) + 체크리스트
--   last_message: 마지막 메시지 · unread: 상대가 보낸 안 읽은 메시지 수
--   정지된 사용자가 보낸 신청은 받은 쪽 목록에서 숨긴다 (예전 받은 신청과 같게). 최근 대화가 위로
create or replace function public.list_roommate_threads(p_request_id uuid default null)
returns table (
  request_id uuid,
  role text,
  created_at timestamptz,
  post_id uuid,
  dormitory_code text,
  semester text,
  post_closed boolean,
  post_open boolean,
  counterpart jsonb,
  last_message jsonb,
  unread integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      r.id,
      r.created_at,
      r.post_id,
      r.applicant_id,
      case when r.applicant_id = auth.uid() then 'applicant' else 'author' end as role,
      p.dormitory_code,
      p.semester,
      p.is_closed,
      p.is_open,
      p.gender,
      p.age,
      p.college_code,
      p.mbti,
      p.checklist
    from public.roommate_requests r
    join public.roommate_posts p on p.id = r.post_id
    where auth.uid() is not null
      and (r.applicant_id = auth.uid() or p.user_id = auth.uid())
      and (p_request_id is null or r.id = p_request_id)
  )
  select
    m.id,
    m.role,
    m.created_at,
    m.post_id,
    m.dormitory_code,
    m.semester,
    m.is_closed,
    m.is_open,
    case
      when m.role = 'author' then (
        select jsonb_build_object(
          'dormitory', f.dormitory_code, 'gender', f.gender, 'age', f.age,
          'collegeCode', f.college_code, 'mbti', f.mbti, 'checklist', f.checklist
        )
        from public.roommate_profiles f
        where f.user_id = m.applicant_id
      )
      else jsonb_build_object(
        'dormitory', m.dormitory_code, 'gender', m.gender, 'age', m.age,
        'collegeCode', m.college_code, 'mbti', m.mbti, 'checklist', m.checklist
      )
    end,
    case when last.id is null then null else jsonb_build_object(
      'id', last.id, 'kind', last.kind, 'body', last.body, 'senderRole', last.sender_role, 'createdAt', last.created_at
    ) end,
    (
      select count(*)::integer
      from public.roommate_thread_messages x
      where x.request_id = m.id
        and x.sender_role <> m.role
        and x.id > coalesce((
          select d.last_read_id from public.roommate_thread_reads d where d.request_id = m.id and d.user_id = auth.uid()
        ), 0)
    )
  from mine m
  left join lateral (
    select x.id, x.kind, x.body, x.sender_role, x.created_at
    from public.roommate_thread_messages x
    where x.request_id = m.id
    order by x.id desc
    limit 1
  ) last on true
  where not (m.role = 'author' and public.roommate_user_suspended(m.applicant_id))
  order by coalesce(last.created_at, m.created_at) desc, last.id desc nulls last;
$$;

-- ── 5) 메시지 보내기 ──
create or replace function public.post_roommate_thread_message(p_request_id uuid, p_body text)
returns table (id bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  msg text := nullif(btrim(coalesce(p_body, '')), '');
  new_id bigint;
  new_at timestamptz;
begin
  if auth.uid() is null or my_role is null then
    raise exception 'thread not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if public.roommate_user_suspended(auth.uid()) then
    raise exception 'suspended' using errcode = '42501', hint = 'suspended';
  end if;
  if msg is null then
    raise exception 'empty message' using errcode = '22023', hint = 'empty';
  end if;
  if char_length(msg) > 1000 then
    raise exception 'message too long' using errcode = '22001', hint = 'too_long';
  end if;
  if (
    select count(*) from public.roommate_thread_messages m
    where m.request_id = p_request_id and m.sender_role = my_role and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'too many messages' using errcode = 'P0001', hint = 'too_fast';
  end if;

  insert into public.roommate_thread_messages (request_id, sender_role, kind, body)
  values (p_request_id, my_role, 'text', msg)
  returning roommate_thread_messages.id, roommate_thread_messages.created_at into new_id, new_at;

  insert into public.roommate_thread_reads as d (request_id, user_id, last_read_id)
  values (p_request_id, auth.uid(), new_id)
  on conflict on constraint roommate_thread_reads_pkey
  do update set last_read_id = greatest(d.last_read_id, excluded.last_read_id);

  return query select new_id, new_at;
end;
$$;

-- ── 6) 읽음 표시 (p_last_id 까지, 없으면 지금까지 전부) ──
create or replace function public.mark_roommate_thread_read(p_request_id uuid, p_last_id bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  newest bigint;
begin
  if auth.uid() is null or public.roommate_thread_role(p_request_id) is null then
    return;
  end if;
  select max(m.id) into newest from public.roommate_thread_messages m where m.request_id = p_request_id;
  if newest is null then
    return;
  end if;
  insert into public.roommate_thread_reads as d (request_id, user_id, last_read_id)
  values (p_request_id, auth.uid(), least(coalesce(p_last_id, newest), newest))
  on conflict on constraint roommate_thread_reads_pkey
  do update set last_read_id = greatest(d.last_read_id, excluded.last_read_id);
end;
$$;

-- ── 7) 새 소식 수: 안 읽은 메시지가 있는 받은 대화 · 보낸 대화 수 (헤더·메뉴 표시) ──
create or replace function public.roommate_inbox_counts()
returns table (new_requests integer, new_replies integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where t.role = 'author' and t.unread > 0)::integer,
    count(*) filter (where t.role = 'applicant' and t.unread > 0)::integer
  from public.list_roommate_threads() t;
$$;

-- ── 8) 대화 신고: 상대를 신고하고 최근 메시지 30개를 신고 당시 내용으로 남긴다 ──
create or replace function public.report_roommate_thread(p_request_id uuid, p_reason text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  req record;
begin
  if my_role is null then
    raise exception 'thread not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  select r.applicant_id, r.post_id, r.message, p.user_id as author_id
  into req
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where r.id = p_request_id;
  perform public.roommate_file_report(
    case when my_role = 'author' then req.applicant_id else req.author_id end,
    'request', req.post_id, p_request_id, p_reason, p_detail,
    jsonb_build_object(
      'message', req.message,
      'reporterRole', my_role,
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object('role', s.sender_role, 'kind', s.kind, 'body', s.body, 'at', s.created_at) order by s.id)
        from (
          select m.id, m.sender_role, m.kind, m.body, m.created_at
          from public.roommate_thread_messages m
          where m.request_id = p_request_id
          order by m.id desc
          limit 30
        ) s
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Supabase 는 새 함수에 anon · authenticated 실행 권한을 자동으로 주므로 모두 회수한 뒤 필요한 것만 준다
revoke all on function public.roommate_thread_role(uuid) from public, anon, authenticated;
revoke all on function public.list_roommate_threads(uuid) from public, anon, authenticated;
revoke all on function public.post_roommate_thread_message(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_roommate_thread_read(uuid, bigint) from public, anon, authenticated;
revoke all on function public.roommate_inbox_counts() from public, anon, authenticated;
revoke all on function public.report_roommate_thread(uuid, text, text) from public, anon, authenticated;
-- roommate_thread_role 은 메시지 읽기 정책(RLS)에서 쓴다
grant execute on function public.roommate_thread_role(uuid) to authenticated;
grant execute on function public.list_roommate_threads(uuid) to authenticated;
grant execute on function public.post_roommate_thread_message(uuid, text) to authenticated;
grant execute on function public.mark_roommate_thread_read(uuid, bigint) to authenticated;
grant execute on function public.roommate_inbox_counts() to authenticated;
grant execute on function public.report_roommate_thread(uuid, text, text) to authenticated;
