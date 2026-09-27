-- 채팅: 글이 지워져도 대화는 남긴다
-- 적용 방법: 앞의 마이그레이션(특히 20261022000000_roommate_chat_leave.sql)을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 예전에는 글을 지우면(글쓴이·관리자) 그 글의 신청과 대화가 모두 함께 지워졌다.
-- 룸메이트를 정한 뒤 [모집완료] 대신 글을 지우면 막 정한 룸메이트와의 대화까지 사라지므로 다음처럼 바꾼다.
--   · 신청에 글쓴이(author_id)를 따로 저장해, 글이 없어도 대화방의 두 사람을 알 수 있게 한다.
--   · 글을 지우기 직전에 글의 정보(호관·학기·성별·나이·단과대학·MBTI·체크리스트)를 신청에 남기고(post_snapshot),
--     신청의 post_id 는 비운다 (on delete set null). 대화 · 메시지 · 읽음 위치는 그대로다.
--   · 대화방 목록은 글이 있으면 글의 정보를, 없으면 남겨 둔 정보를 보여 주고 post_deleted 로 알려 준다.
--     (대화 안에 "글이 삭제됐어요" 같은 안내 줄은 넣지 않는다. 게시물 카드에만 "삭제된 글" 로 표시)
--   · 글이 지워진 대화도 메시지 · 수정 · 삭제 · 신고 · 차단 · 나가기를 모두 할 수 있다.

-- ── 1) 신청: 글쓴이 · 글 정보 ──
alter table public.roommate_requests
  add column if not exists author_id uuid references auth.users (id) on delete cascade;
alter table public.roommate_requests add column if not exists post_snapshot jsonb;

update public.roommate_requests r
set author_id = p.user_id
from public.roommate_posts p
where p.id = r.post_id and r.author_id is null;

create index if not exists roommate_requests_author_idx on public.roommate_requests (author_id);

-- 새 신청은 글에서 글쓴이를 채운다 (신청을 만드는 함수들을 고치지 않아도 되게)
create or replace function public.fill_roommate_request_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is null then
    select p.user_id into new.author_id from public.roommate_posts p where p.id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists roommate_requests_author on public.roommate_requests;
create trigger roommate_requests_author
  before insert on public.roommate_requests
  for each row execute function public.fill_roommate_request_author();

alter table public.roommate_requests alter column author_id set not null;

-- 글이 지워져도 신청(= 대화방)은 남기고 글과의 연결만 끊는다
alter table public.roommate_requests alter column post_id drop not null;
alter table public.roommate_requests drop constraint if exists roommate_requests_post_id_fkey;
alter table public.roommate_requests add constraint roommate_requests_post_id_fkey
  foreign key (post_id) references public.roommate_posts (id) on delete set null;

-- 글을 지우기 직전: 대화방에 보여 줄 글 정보를 남긴다
create or replace function public.snapshot_roommate_post_for_chats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.roommate_requests r
  set post_snapshot = jsonb_build_object(
    'dormitory', old.dormitory_code, 'semester', old.semester, 'gender', old.gender, 'age', old.age,
    'collegeCode', old.college_code, 'mbti', old.mbti, 'checklist', old.checklist, 'isClosed', old.is_closed
  )
  where r.post_id = old.id;
  return old;
end;
$$;

drop trigger if exists roommate_posts_snapshot_chats on public.roommate_posts;
create trigger roommate_posts_snapshot_chats
  before delete on public.roommate_posts
  for each row execute function public.snapshot_roommate_post_for_chats();

revoke all on function public.fill_roommate_request_author() from public, anon, authenticated;
revoke all on function public.snapshot_roommate_post_for_chats() from public, anon, authenticated;

-- ── 2) 대화방의 역할: 글 대신 신청의 글쓴이로 ──
create or replace function public.roommate_thread_role(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.applicant_id = auth.uid() and r.applicant_left_at is null then 'applicant'
    when r.author_id = auth.uid() and r.author_left_at is null then 'author'
  end
  from public.roommate_requests r
  where r.id = p_request_id;
$$;

-- 내가 신청한(대화 중인) 글: 지워진 글은 뺀다
create or replace function public.my_roommate_requests()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.post_id from public.roommate_requests r
  where r.applicant_id = auth.uid() and r.applicant_left_at is null and r.post_id is not null;
$$;

-- ── 3) 차단: 두 사람 사이의 대화를 글쓴이 기준으로 지운다 (글이 없어도) ──
create or replace function public.roommate_block_user(p_blocked uuid, p_context text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  touched uuid;
begin
  if uid is null or p_blocked is null or p_blocked = uid then
    raise exception 'cannot block' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.roommate_blocks (blocker_id, blocked_id, context)
  values (uid, p_blocked, p_context)
  on conflict (blocker_id, blocked_id) do nothing;

  for touched in
    delete from public.roommate_requests r
    where (r.author_id = uid and r.applicant_id = p_blocked) or (r.author_id = p_blocked and r.applicant_id = uid)
    returning r.post_id
  loop
    if touched is not null then
      perform public.sync_roommate_request_count(touched);
    end if;
  end loop;
end;
$$;

-- 대화방의 차단 위치 문구: "받은 신청 · 대동관 · 2027년 1학기" (글이 지워졌으면 남겨 둔 정보로)
create or replace function public.roommate_thread_context(p_request_id uuid, p_prefix text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p_prefix
    || coalesce(' · ' || d.name, '')
    || coalesce(' · ' || split_part(s.semester, '-', 1) || '년 ' || split_part(s.semester, '-', 2) || '학기', '')
  from public.roommate_requests r
  left join public.roommate_posts p on p.id = r.post_id
  cross join lateral (
    select coalesce(p.dormitory_code, r.post_snapshot ->> 'dormitory') as dormitory,
           coalesce(p.semester, r.post_snapshot ->> 'semester') as semester
  ) s
  left join public.dormitories d on d.code = s.dormitory
  where r.id = p_request_id;
$$;

-- 받은 신청의 신청자 차단 (예전 함수: 글쓴이 확인을 신청의 author_id 로)
create or replace function public.block_roommate_applicant(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select r.applicant_id into target
  from public.roommate_requests r
  where r.id = p_request_id and r.author_id = auth.uid();
  if target is null then
    raise exception 'request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.roommate_block_user(target, public.roommate_thread_context(p_request_id, '받은 신청'));
end;
$$;

-- 대화 상대 차단 (신청자 · 글쓴이 모두, 글이 지워졌어도)
create or replace function public.block_roommate_thread(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text := public.roommate_thread_role(p_request_id);
  target uuid;
begin
  if my_role is null then
    raise exception 'thread not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  select case when my_role = 'author' then r.applicant_id else r.author_id end into target
  from public.roommate_requests r where r.id = p_request_id;
  perform public.roommate_block_user(
    target,
    public.roommate_thread_context(p_request_id, case when my_role = 'author' then '받은 신청' else '보낸 신청' end)
  );
end;
$$;

-- ── 4) 대화 신고: 글이 없어도 상대를 신청의 author_id 로 ──
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
  select r.applicant_id, r.author_id, r.post_id, r.message into req
  from public.roommate_requests r where r.id = p_request_id;
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

-- ── 5) 대화방 목록: 글이 없으면 남겨 둔 정보로 (post_deleted) ──
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
      case when r.applicant_id = auth.uid() then r.author_left_at else r.applicant_left_at end as other_left_at,
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

revoke all on function public.roommate_thread_context(uuid, text) from public, anon, authenticated;
revoke all on function public.roommate_block_user(uuid, text) from public, anon, authenticated;
revoke all on function public.block_roommate_applicant(uuid) from public, anon, authenticated;
revoke all on function public.block_roommate_thread(uuid) from public, anon, authenticated;
revoke all on function public.report_roommate_thread(uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_roommate_threads(uuid) from public, anon, authenticated;
revoke all on function public.roommate_inbox_counts() from public, anon, authenticated;
revoke all on function public.my_roommate_requests() from public, anon;
grant execute on function public.block_roommate_applicant(uuid) to authenticated;
grant execute on function public.block_roommate_thread(uuid) to authenticated;
grant execute on function public.report_roommate_thread(uuid, text, text) to authenticated;
grant execute on function public.list_roommate_threads(uuid) to authenticated;
grant execute on function public.roommate_inbox_counts() to authenticated;
grant execute on function public.my_roommate_requests() to authenticated;
