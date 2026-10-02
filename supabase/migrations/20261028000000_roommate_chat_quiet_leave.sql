-- 채팅방 조용히 나가기 (+ 20261027 에서 빠진 글 호실 저장 권한)
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤 SQL Editor 에서 실행.
--
--   · 그냥 나가기: 지금처럼 상대에게 "OO가 채팅방을 나갔어요"가 보이고 상대의 입력칸이 잠긴다.
--   · 조용히 나가기: 내 목록에서만 사라지고, 상대에게는 아무것도 알리지 않는다 ("나갔어요" 메시지 없음).
--     상대 화면은 그대로이고 메시지도 보낼 수 있지만, 나에게는 오지 않는다 (알림도 없음).
--   · 두 사람 모두 나가면(조용히든 아니든) 대화를 지운다. 신청자가 나가면 룸메 신청도 취소로 본다 (지금과 같음).

-- (20261027 을 이미 실행했다면) 글쓰기 · 수정에서 호실을 저장할 권한. 20261027 에서 빠졌던 것 (여러 번 실행해도 된다)
grant insert (room_type) on public.roommate_posts to authenticated;
grant update (room_type) on public.roommate_posts to authenticated;

alter table public.roommate_requests add column if not exists applicant_left_quiet boolean not null default false;
alter table public.roommate_requests add column if not exists author_left_quiet boolean not null default false;

-- ── 나가기 (p_quiet = true 면 조용히) ──
-- 인자가 하나인 예전 함수를 그대로 두면 이름만으로 부를 때 어느 쪽인지 모호해져서 지운다
drop function if exists public.leave_roommate_thread(uuid);
create or replace function public.leave_roommate_thread(p_request_id uuid, p_quiet boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  quiet boolean := coalesce(p_quiet, false);
  req record;
begin
  if auth.uid() is null or my_role is null then
    raise exception 'thread not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  update public.roommate_requests r
  set applicant_left_at = case when my_role = 'applicant' then now() else r.applicant_left_at end,
      author_left_at = case when my_role = 'author' then now() else r.author_left_at end,
      applicant_left_quiet = case when my_role = 'applicant' then quiet else r.applicant_left_quiet end,
      author_left_quiet = case when my_role = 'author' then quiet else r.author_left_quiet end
  where r.id = p_request_id
  returning r.post_id, r.applicant_left_at, r.author_left_at into req;

  if req.applicant_left_at is not null and req.author_left_at is not null then
    -- 둘 다 나갔으면 대화를 지운다
    delete from public.roommate_requests r where r.id = p_request_id;
  elsif not quiet then
    -- 상대에게 "나갔어요" (실시간으로 전달되어 상대 화면의 입력칸이 잠긴다)
    insert into public.roommate_thread_messages (request_id, sender_role, kind, body)
    values (p_request_id, my_role, 'left', null);
  end if;
  perform public.sync_roommate_request_count(req.post_id);
end;
$$;

-- ── 보내기: 상대가 (알리고) 나간 대화에는 보낼 수 없다. 조용히 나갔으면 보낼 수 있다 ──
-- 20261022000000_roommate_chat_leave.sql 의 함수와 같고 "상대가 나감" 검사만 바꿨다
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
      -- 상대가 조용히 나갔으면 보낼 수는 있다 (상대에게는 가지 않는다 · 나간 사실을 알리지 않으려고)
      and (case when my_role = 'applicant'
             then r.author_left_at is not null and not r.author_left_quiet
             else r.applicant_left_at is not null and not r.applicant_left_quiet end)
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

-- ── 대화방 목록: 상대가 조용히 나갔으면 "상대가 나감"으로 보이지 않는다 ──
-- 20261023000000_roommate_chat_keep_on_post_delete.sql 의 함수와 같고 other_left_at 만 바꿨다
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
  unread integer,
  other_read_id bigint,
  other_left boolean,
  post_deleted boolean
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
      -- 상대가 조용히 나갔으면 나에게는 나간 것으로 보이지 않는다
      case when r.applicant_id = auth.uid()
        then case when r.author_left_quiet then null else r.author_left_at end
        else case when r.applicant_left_quiet then null else r.applicant_left_at end
      end as other_left_at,
      p.id is null as post_deleted,
      coalesce(p.dormitory_code, r.post_snapshot ->> 'dormitory') as dormitory_code,
      coalesce(p.semester, r.post_snapshot ->> 'semester') as semester,
      coalesce(p.is_closed, (r.post_snapshot ->> 'isClosed')::boolean, false) as is_closed,
      coalesce(p.is_open, false) as is_open,
      coalesce(p.gender, r.post_snapshot ->> 'gender') as gender,
      coalesce(p.age, (r.post_snapshot ->> 'age')::smallint) as age,
      coalesce(p.college_code, r.post_snapshot ->> 'collegeCode') as college_code,
      case when p.id is null then r.post_snapshot ->> 'mbti' else p.mbti end as mbti,
      coalesce(p.checklist, r.post_snapshot -> 'checklist') as checklist
    from public.roommate_requests r
    left join public.roommate_posts p on p.id = r.post_id
    where auth.uid() is not null
      and ((r.applicant_id = auth.uid() and r.applicant_left_at is null)
        or (r.author_id = auth.uid() and r.author_left_at is null))
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
    m.other_left_at is not null,
    m.post_deleted
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

revoke all on function public.leave_roommate_thread(uuid, boolean) from public, anon, authenticated;
grant execute on function public.leave_roommate_thread(uuid, boolean) to authenticated;
revoke all on function public.post_roommate_thread_message(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.post_roommate_thread_message(uuid, text, bigint) to authenticated;
revoke all on function public.list_roommate_threads(uuid) from public, anon, authenticated;
grant execute on function public.list_roommate_threads(uuid) to authenticated;
