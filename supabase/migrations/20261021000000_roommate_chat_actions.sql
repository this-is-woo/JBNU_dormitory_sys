-- 채팅: 답장 · 수정 · 삭제 · 읽음 표시(1) · 첫 메시지를 보낼 때 대화 시작
-- 적용 방법: 앞의 마이그레이션(특히 20261020000000_roommate_chat.sql)을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 답장: 메시지가 어떤 메시지에 답했는지(reply_to_id). 같은 대화방의 메시지에만 답할 수 있다.
--   · 수정: 내가 보낸 메시지만, 삭제된 메시지는 못 고친다. 고친 시각(edited_at)이 남는다.
--   · 삭제: 내가 보낸 메시지만. 내용은 지우고(body = null) 자리는 남겨 두 사람 모두 "삭제된 메시지입니다." 로 본다.
--   · 읽음 표시: 대화방마다 두 사람이 어디까지 읽었는지를 역할(applicant/author)로 저장한다 (계정 id 는 남기지 않음).
--     두 사람 모두 서로의 읽음 위치를 볼 수 있고(RLS), Realtime 으로 바로 받아 내 말풍선의 "1" 을 지운다.
--   · 대화 시작: [채팅 보내기]로 대화창을 열기만 해서는 아무것도 저장하지 않고,
--     첫 메시지를 보낼 때(start_roommate_chat) 룸메 신청 + 대화방 + 첫 메시지를 한 번에 만든다.
--     그래서 첫 메시지를 보내기 전까지 글쓴이 쪽에는 아무 변화가 없다.

-- ── 1) 메시지: 답장 · 수정 · 삭제 ──
alter table public.roommate_thread_messages
  add column if not exists reply_to_id bigint references public.roommate_thread_messages (id) on delete set null;
alter table public.roommate_thread_messages add column if not exists edited_at timestamptz;
alter table public.roommate_thread_messages add column if not exists deleted_at timestamptz;

alter table public.roommate_thread_messages drop constraint if exists roommate_thread_messages_body;
alter table public.roommate_thread_messages add constraint roommate_thread_messages_body
  check (kind = 'request' or body is not null or deleted_at is not null);

-- ── 2) 읽음 위치: 계정(user_id) 대신 역할(reader_role)로 ──
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'roommate_thread_reads' and column_name = 'user_id'
  ) then
    alter table public.roommate_thread_reads add column if not exists reader_role text;
    update public.roommate_thread_reads d
    set reader_role = case when r.applicant_id = d.user_id then 'applicant' else 'author' end
    from public.roommate_requests r
    where r.id = d.request_id and d.reader_role is null;
    delete from public.roommate_thread_reads where reader_role is null;
    alter table public.roommate_thread_reads drop constraint if exists roommate_thread_reads_pkey;
    alter table public.roommate_thread_reads drop column user_id;
    alter table public.roommate_thread_reads alter column reader_role set not null;
    alter table public.roommate_thread_reads add constraint roommate_thread_reads_pkey primary key (request_id, reader_role);
    alter table public.roommate_thread_reads add constraint roommate_thread_reads_role
      check (reader_role in ('applicant', 'author'));
  end if;
end;
$$;

-- 대화방의 두 사람은 서로의 읽음 위치를 볼 수 있다 (내 말풍선의 "1"). 쓰기는 함수로만
revoke all on public.roommate_thread_reads from anon, authenticated;
grant select on public.roommate_thread_reads to authenticated;

drop policy if exists "roommate_thread_reads: members read" on public.roommate_thread_reads;
create policy "roommate_thread_reads: members read" on public.roommate_thread_reads
  for select to authenticated
  using (public.roommate_thread_role(request_id) is not null);

-- 실시간: 메시지 수정·삭제(UPDATE)는 이미 발행된다. 읽음 위치도 발행한다
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roommate_thread_reads'
     ) then
    alter publication supabase_realtime add table public.roommate_thread_reads;
  end if;
end;
$$;

-- 읽음 위치 올리기 (내부용)
create or replace function public.roommate_set_read(p_request_id uuid, p_role text, p_last_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.roommate_thread_reads as d (request_id, reader_role, last_read_id)
  values (p_request_id, p_role, p_last_id)
  on conflict on constraint roommate_thread_reads_pkey
  do update set last_read_id = greatest(d.last_read_id, excluded.last_read_id);
$$;

-- ── 3) 대화 시작: 룸메 신청 + 첫 메시지 ──
-- 신청 검사는 send_roommate_request 가 한다 (같은 성별 · 모집 학기 · 모집 중 · 차단 · 정지 · 중복)
create or replace function public.start_roommate_chat(p_post_id uuid, p_body text)
returns table (request_id uuid, message_id bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := nullif(btrim(coalesce(p_body, '')), '');
  new_request uuid;
  first_id bigint;
  first_at timestamptz;
begin
  if msg is null then
    raise exception 'empty message' using errcode = '22023', hint = 'empty';
  end if;
  if char_length(msg) > 1000 then
    raise exception 'message too long' using errcode = '22001', hint = 'too_long';
  end if;
  new_request := public.send_roommate_request(p_post_id, null);
  update public.roommate_thread_messages m
  set body = msg
  where m.request_id = new_request and m.kind = 'request'
  returning m.id, m.created_at into first_id, first_at;
  return query select new_request, first_id, first_at;
end;
$$;

-- 신청을 보낼 때 읽음 위치를 역할로 남긴다 (20261020000000_roommate_chat.sql 의 send_roommate_request 와 같고 그 부분만 바꿈)
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
  perform public.roommate_set_read(new_request_id, 'applicant', first_id);

  perform public.sync_roommate_request_count(p_post_id);
  return new_request_id;
end;
$$;

-- ── 4) 메시지 보내기: 답장 대상(p_reply_to) 추가 ──
drop function if exists public.post_roommate_thread_message(uuid, text);
create or replace function public.post_roommate_thread_message(p_request_id uuid, p_body text, p_reply_to bigint default null)
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
  if p_reply_to is not null and not exists (
    select 1 from public.roommate_thread_messages m where m.id = p_reply_to and m.request_id = p_request_id
  ) then
    raise exception 'reply target not found' using errcode = 'P0002', hint = 'reply_not_found';
  end if;
  if (
    select count(*) from public.roommate_thread_messages m
    where m.request_id = p_request_id and m.sender_role = my_role and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'too many messages' using errcode = 'P0001', hint = 'too_fast';
  end if;

  insert into public.roommate_thread_messages (request_id, sender_role, kind, body, reply_to_id)
  values (p_request_id, my_role, 'text', msg, p_reply_to)
  returning roommate_thread_messages.id, roommate_thread_messages.created_at into new_id, new_at;

  perform public.roommate_set_read(p_request_id, my_role, new_id);
  return query select new_id, new_at;
end;
$$;

-- ── 5) 수정 · 삭제 (내가 보낸 메시지만) ──
create or replace function public.edit_roommate_thread_message(p_message_id bigint, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := nullif(btrim(coalesce(p_body, '')), '');
  target record;
  edited timestamptz := now();
begin
  select m.request_id, m.sender_role, m.deleted_at into target
  from public.roommate_thread_messages m where m.id = p_message_id;
  if not found or public.roommate_thread_role(target.request_id) is distinct from target.sender_role then
    raise exception 'message not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if target.deleted_at is not null then
    raise exception 'message deleted' using errcode = 'P0001', hint = 'deleted';
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
  update public.roommate_thread_messages m set body = msg, edited_at = edited where m.id = p_message_id;
  return edited;
end;
$$;

create or replace function public.delete_roommate_thread_message(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  select m.request_id, m.sender_role into target
  from public.roommate_thread_messages m where m.id = p_message_id;
  if not found or public.roommate_thread_role(target.request_id) is distinct from target.sender_role then
    raise exception 'message not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  update public.roommate_thread_messages m
  set body = null, deleted_at = coalesce(m.deleted_at, now())
  where m.id = p_message_id;
end;
$$;

-- ── 6) 읽음 표시 ──
create or replace function public.mark_roommate_thread_read(p_request_id uuid, p_last_id bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  newest bigint;
begin
  if auth.uid() is null or my_role is null then
    return;
  end if;
  select max(m.id) into newest from public.roommate_thread_messages m where m.request_id = p_request_id;
  if newest is null then
    return;
  end if;
  perform public.roommate_set_read(p_request_id, my_role, least(coalesce(p_last_id, newest), newest));
end;
$$;

-- ── 7) 대화방 목록: 상대의 읽음 위치(other_read_id) + 마지막 메시지의 삭제 여부 ──
drop function if exists public.list_roommate_threads(uuid);
create function public.list_roommate_threads(p_request_id uuid default null)
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
  unread integer,
  other_read_id bigint
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
      'id', last.id, 'kind', last.kind, 'body', last.body, 'senderRole', last.sender_role,
      'createdAt', last.created_at, 'deletedAt', last.deleted_at
    ) end,
    (
      select count(*)::integer
      from public.roommate_thread_messages x
      where x.request_id = m.id
        and x.sender_role <> m.role
        and x.id > coalesce((
          select d.last_read_id from public.roommate_thread_reads d where d.request_id = m.id and d.reader_role = m.role
        ), 0)
    ),
    coalesce((
      select d.last_read_id from public.roommate_thread_reads d where d.request_id = m.id and d.reader_role <> m.role
    ), 0)
  from mine m
  left join lateral (
    select x.id, x.kind, x.body, x.sender_role, x.created_at, x.deleted_at
    from public.roommate_thread_messages x
    where x.request_id = m.id
    order by x.id desc
    limit 1
  ) last on true
  where not (m.role = 'author' and public.roommate_user_suspended(m.applicant_id))
  order by coalesce(last.created_at, m.created_at) desc, last.id desc nulls last;
$$;

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

revoke all on function public.roommate_set_read(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.start_roommate_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.send_roommate_request(uuid, text) from public, anon;
revoke all on function public.post_roommate_thread_message(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.edit_roommate_thread_message(bigint, text) from public, anon, authenticated;
revoke all on function public.delete_roommate_thread_message(bigint) from public, anon, authenticated;
revoke all on function public.mark_roommate_thread_read(uuid, bigint) from public, anon, authenticated;
revoke all on function public.list_roommate_threads(uuid) from public, anon, authenticated;
revoke all on function public.roommate_inbox_counts() from public, anon, authenticated;
grant execute on function public.start_roommate_chat(uuid, text) to authenticated;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;
grant execute on function public.post_roommate_thread_message(uuid, text, bigint) to authenticated;
grant execute on function public.edit_roommate_thread_message(bigint, text) to authenticated;
grant execute on function public.delete_roommate_thread_message(bigint) to authenticated;
grant execute on function public.mark_roommate_thread_read(uuid, bigint) to authenticated;
grant execute on function public.list_roommate_threads(uuid) to authenticated;
grant execute on function public.roommate_inbox_counts() to authenticated;
