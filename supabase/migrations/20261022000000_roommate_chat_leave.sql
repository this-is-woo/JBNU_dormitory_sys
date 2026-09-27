-- 채팅방 나가기 (신청자 · 글쓴이 모두)
-- 적용 방법: 앞의 마이그레이션(특히 20261021000000_roommate_chat_actions.sql)을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 나가면 그 사람에게서만 대화방이 사라지고(목록·메시지·읽음 모두 볼 수 없음),
--     상대에게는 "OO가 채팅방을 나갔어요" 가 보이며 더는 메시지를 보낼 수 없다 (kind = 'left' 메시지, 실시간 전달).
--   · 두 사람 모두 나가면 대화(신청 · 메시지 · 읽음 위치)를 지운다.
--   · 신청자가 나가면 룸메 신청도 취소된 것으로 본다: 글의 받은 신청 수에서 빠지고, 카드에도 다시 [룸메 신청]이 보인다.
--     그 글에 다시 채팅을 보내면 예전 대화는 지우고 새 신청으로 시작한다.
--   · 글쓴이가 나가면 그 신청은 받은 신청 수에서 빠진다 (거절과 같다).

alter table public.roommate_requests add column if not exists applicant_left_at timestamptz;
alter table public.roommate_requests add column if not exists author_left_at timestamptz;

-- 나감 표시 메시지 (내용 없음)
alter table public.roommate_thread_messages drop constraint if exists roommate_thread_messages_kind_check;
alter table public.roommate_thread_messages add constraint roommate_thread_messages_kind_check
  check (kind in ('request', 'text', 'left'));
alter table public.roommate_thread_messages drop constraint if exists roommate_thread_messages_body;
alter table public.roommate_thread_messages add constraint roommate_thread_messages_body
  check (kind in ('request', 'left') or body is not null or deleted_at is not null);

-- 대화방에서 나의 역할: 나간 사람은 null (메시지 읽기 정책 · 보내기 · 수정 · 삭제 · 읽음 · 신고가 모두 이것을 따른다)
create or replace function public.roommate_thread_role(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.applicant_id = auth.uid() and r.applicant_left_at is null then 'applicant'
    when p.user_id = auth.uid() and r.author_left_at is null then 'author'
  end
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where r.id = p_request_id;
$$;

-- 글의 받은 신청 수: 두 사람 모두 대화 중인 신청만
create or replace function public.sync_roommate_request_count(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.roommate_posts p
  set request_count = (
    select count(*) from public.roommate_requests r
    where r.post_id = p_post_id and r.applicant_left_at is null and r.author_left_at is null
  )
  where p.id = p_post_id;
$$;

-- 내가 신청한(대화 중인) 글: 나간 신청은 빼서 카드에 다시 [룸메 신청]이 보이게
create or replace function public.my_roommate_requests()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.post_id from public.roommate_requests r where r.applicant_id = auth.uid() and r.applicant_left_at is null;
$$;

-- ── 나가기 ──
create or replace function public.leave_roommate_thread(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  req record;
begin
  if auth.uid() is null or my_role is null then
    raise exception 'thread not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  update public.roommate_requests r
  set applicant_left_at = case when my_role = 'applicant' then now() else r.applicant_left_at end,
      author_left_at = case when my_role = 'author' then now() else r.author_left_at end
  where r.id = p_request_id
  returning r.post_id, r.applicant_left_at, r.author_left_at into req;

  if req.applicant_left_at is not null and req.author_left_at is not null then
    -- 둘 다 나갔으면 대화를 지운다
    delete from public.roommate_requests r where r.id = p_request_id;
  else
    -- 상대에게 "나갔어요" (실시간으로 전달되어 상대 화면의 입력칸이 잠긴다)
    insert into public.roommate_thread_messages (request_id, sender_role, kind, body)
    values (p_request_id, my_role, 'left', null);
  end if;
  perform public.sync_roommate_request_count(req.post_id);
end;
$$;

-- ── 대화 시작: 예전에 나간 신청이 있으면 지우고 새로 ──
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
  -- 내가 나갔던 예전 대화 (검사에 걸려 실패하면 이 삭제도 함께 취소된다)
  delete from public.roommate_requests r
  where r.post_id = p_post_id and r.applicant_id = auth.uid() and r.applicant_left_at is not null;

  new_request := public.send_roommate_request(p_post_id, null);
  update public.roommate_thread_messages m
  set body = msg
  where m.request_id = new_request and m.kind = 'request'
  returning m.id, m.created_at into first_id, first_at;
  return query select new_request, first_id, first_at;
end;
$$;

-- ── 보내기: 상대가 나간 대화에는 보낼 수 없다 ──
-- 20261021000000_roommate_chat_actions.sql 의 post_roommate_thread_message 와 같고 "상대가 나감" 검사만 더했다
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
  if exists (
    select 1 from public.roommate_requests r
    where r.id = p_request_id
      and (case when my_role = 'applicant' then r.author_left_at else r.applicant_left_at end) is not null
  ) then
    raise exception 'counterpart left' using errcode = 'P0001', hint = 'left';
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

-- ── 목록: 내가 나간 대화는 빼고, 상대가 나갔는지(other_left) 알려 준다 ──
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
  other_read_id bigint,
  other_left boolean
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
      case when r.applicant_id = auth.uid() then r.author_left_at else r.applicant_left_at end as other_left_at,
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
      and ((r.applicant_id = auth.uid() and r.applicant_left_at is null)
        or (p.user_id = auth.uid() and r.author_left_at is null))
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
    ), 0),
    m.other_left_at is not null
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

-- 이미 있는 글들의 받은 신청 수를 새 규칙으로 다시 센다
update public.roommate_posts p
set request_count = (
  select count(*) from public.roommate_requests r
  where r.post_id = p.id and r.applicant_left_at is null and r.author_left_at is null
);

revoke all on function public.leave_roommate_thread(uuid) from public, anon, authenticated;
revoke all on function public.start_roommate_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.post_roommate_thread_message(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.list_roommate_threads(uuid) from public, anon, authenticated;
revoke all on function public.roommate_inbox_counts() from public, anon, authenticated;
revoke all on function public.my_roommate_requests() from public, anon;
revoke all on function public.sync_roommate_request_count(uuid) from public, anon, authenticated;
grant execute on function public.leave_roommate_thread(uuid) to authenticated;
grant execute on function public.start_roommate_chat(uuid, text) to authenticated;
grant execute on function public.post_roommate_thread_message(uuid, text, bigint) to authenticated;
grant execute on function public.list_roommate_threads(uuid) to authenticated;
grant execute on function public.roommate_inbox_counts() to authenticated;
grant execute on function public.my_roommate_requests() to authenticated;
