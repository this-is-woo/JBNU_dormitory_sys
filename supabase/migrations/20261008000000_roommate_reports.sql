-- 룸메이트 찾기: 신고 + 이용 정지
-- 적용 방법: 20261007000000_roommate_blocks_replies.sql 을 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 신고: 게시글(카드의 [신고]) 또는 받은 신청([신고])을 사유 + 내용과 함께 신고한다.
--       신고한 순간의 글·신청 내용을 snapshot 으로 남겨, 글이 지워져도 기록이 남는다.
--       같은 글·신청은 한 사람이 한 번만 신고할 수 있다. 신고 사실은 상대에게 알리지 않는다.
--   · 운영자 확인 (Supabase Dashboard → Table Editor):
--       roommate_reports     신고 내역. status 를 pending → reviewed / dismissed 로 바꾸고 admin_note 에 메모
--       roommate_moderation  신고받은 사용자 목록 (이메일, 신고 수). 여기서 is_suspended 를 체크하면 정지
--                            suspended_until 을 비우면 무기한, 날짜를 넣으면 그때까지
--   · 정지된 사용자: 글쓰기·수정, 룸메 신청, 답장, 신고를 할 수 없고, 그 사람의 글·신청은 다른 사람에게 보이지 않는다.
--   · 두 테이블 모두 일반 사용자는 읽을 수 없다 (운영자만 Dashboard 에서 본다).

-- ── 1) 이용 정지 ──
create table if not exists public.roommate_moderation (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  email             text,                          -- 운영자 확인용 (신고가 들어올 때 채워진다)
  report_count      integer not null default 0,
  last_reported_at  timestamptz,
  is_suspended      boolean not null default false, -- ✔ 체크하면 이용 정지
  suspended_until   timestamptz,                   -- 비우면 무기한
  note              text,                          -- 운영자 메모 (정지 사유 등)
  updated_at        timestamptz not null default now()
);

alter table public.roommate_moderation enable row level security;
revoke all on public.roommate_moderation from anon, authenticated;

create or replace function public.touch_roommate_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists roommate_moderation_touch on public.roommate_moderation;
create trigger roommate_moderation_touch
  before update on public.roommate_moderation
  for each row execute function public.touch_roommate_moderation();

-- 이 사용자가 지금 정지 상태인지
create or replace function public.roommate_user_suspended(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roommate_moderation m
    where m.user_id = p_user and m.is_suspended and (m.suspended_until is null or m.suspended_until > now())
  );
$$;

-- 내 정지 상태 (화면 안내용)
create or replace function public.my_roommate_status()
returns table (suspended boolean, suspended_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.roommate_user_suspended(auth.uid()),
         (select m.suspended_until from public.roommate_moderation m where m.user_id = auth.uid() and m.is_suspended);
$$;

-- ── 2) 게시글 정책: 정지된 사용자는 쓰기·수정 불가, 그 사람의 글은 다른 사람에게 숨김 ──
drop policy if exists "roommate_posts: profile read" on public.roommate_posts;
create policy "roommate_posts: profile read" on public.roommate_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_open
      and (select public.has_roommate_profile())
      and not public.roommate_is_blocked(user_id)
      and not public.roommate_user_suspended(user_id)
    )
  );

drop policy if exists "roommate_posts: owner insert" on public.roommate_posts;
create policy "roommate_posts: owner insert" on public.roommate_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not (select public.roommate_user_suspended(auth.uid())));

drop policy if exists "roommate_posts: owner update" on public.roommate_posts;
create policy "roommate_posts: owner update" on public.roommate_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and not (select public.roommate_user_suspended(auth.uid())));

-- ── 3) 신고 ──
create table if not exists public.roommate_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  reporter_id   uuid not null references auth.users (id) on delete cascade,
  reported_id   uuid not null references auth.users (id) on delete cascade,
  target_type   text not null check (target_type in ('post', 'request')),
  post_id       uuid references public.roommate_posts (id) on delete set null,
  request_id    uuid references public.roommate_requests (id) on delete set null,
  reason        text not null check (reason in ('abuse', 'fake', 'spam', 'privacy', 'gender', 'etc')),
  detail        text check (char_length(detail) <= 500),
  snapshot      jsonb,                                         -- 신고한 순간의 글·신청 내용
  status        text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  admin_note    text
);

create unique index if not exists roommate_reports_once_post
  on public.roommate_reports (reporter_id, post_id) where target_type = 'post' and post_id is not null;
create unique index if not exists roommate_reports_once_request
  on public.roommate_reports (reporter_id, request_id) where target_type = 'request' and request_id is not null;
create index if not exists roommate_reports_reported_idx on public.roommate_reports (reported_id);
create index if not exists roommate_reports_status_idx on public.roommate_reports (status, created_at desc);

alter table public.roommate_reports enable row level security;
revoke all on public.roommate_reports from anon, authenticated;

-- 신고 기록 (내부용): 신고 저장 + 신고받은 사용자를 정지 관리 목록에 올린다
create or replace function public.roommate_file_report(
  p_reported uuid, p_type text, p_post uuid, p_request uuid, p_reason text, p_detail text, p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  msg text := nullif(btrim(coalesce(p_detail, '')), '');
begin
  if uid is null or public.roommate_user_suspended(uid) then
    raise exception 'not allowed' using errcode = '42501', hint = 'suspended';
  end if;
  if p_reported is null then
    raise exception 'target not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_reported = uid then
    raise exception 'own' using errcode = 'P0001', hint = 'own';
  end if;
  if p_reason is null or p_reason not in ('abuse', 'fake', 'spam', 'privacy', 'gender', 'etc') then
    raise exception 'invalid reason' using errcode = '22023', hint = 'reason';
  end if;
  if p_reason = 'etc' and msg is null then
    raise exception 'detail required' using errcode = '22023', hint = 'detail';
  end if;
  if char_length(msg) > 500 then
    raise exception 'detail too long' using errcode = '22001', hint = 'too_long';
  end if;

  begin
    insert into public.roommate_reports (reporter_id, reported_id, target_type, post_id, request_id, reason, detail, snapshot)
    values (uid, p_reported, p_type, p_post, p_request, p_reason, msg, p_snapshot);
  exception when unique_violation then
    raise exception 'already reported' using errcode = '23505', hint = 'duplicate';
  end;

  insert into public.roommate_moderation (user_id, email, report_count, last_reported_at)
  values (p_reported, (select u.email from auth.users u where u.id = p_reported), 1, now())
  on conflict (user_id) do update
    set report_count = public.roommate_moderation.report_count + 1,
        last_reported_at = now(),
        email = coalesce(excluded.email, public.roommate_moderation.email);
end;
$$;

-- 게시글 신고 (내가 볼 수 있는 글만)
create or replace function public.report_roommate_post(p_post_id uuid, p_reason text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post record;
begin
  select p.user_id, p.dormitory_code, p.semester, p.gender, p.age, p.college_code, p.mbti, p.content, p.checklist
  into post
  from public.roommate_posts p
  where p.id = p_post_id and p.is_open;
  if not found then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.roommate_file_report(
    post.user_id, 'post', p_post_id, null, p_reason, p_detail,
    jsonb_build_object(
      'dormitory', post.dormitory_code, 'semester', post.semester, 'gender', post.gender, 'age', post.age,
      'collegeCode', post.college_code, 'mbti', post.mbti, 'content', post.content, 'checklist', post.checklist
    )
  );
end;
$$;

-- 받은 신청 신고 (내 글에 온 신청만)
create or replace function public.report_roommate_request(p_request_id uuid, p_reason text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req record;
begin
  select r.applicant_id, r.post_id, r.message, r.reply
  into req
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  where r.id = p_request_id and p.user_id = auth.uid();
  if not found then
    raise exception 'request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.roommate_file_report(
    req.applicant_id, 'request', req.post_id, p_request_id, p_reason, p_detail,
    jsonb_build_object('message', req.message, 'reply', req.reply)
  );
end;
$$;

-- ── 4) 정지된 사용자는 신청 · 답장 불가, 그 사람의 신청은 받은 신청에서 숨김 ──
create or replace function public.roommate_guard_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.roommate_user_suspended(auth.uid()) then
    raise exception 'suspended' using errcode = '42501', hint = 'suspended';
  end if;
  return new;
end;
$$;

-- 신청 보내기 · 답장은 모두 roommate_requests 에 쓰므로 여기서 한 번에 막는다
-- (글쓴이가 확인 표시(seen_at)만 바꾸는 경우는 제외)
drop trigger if exists roommate_requests_suspended on public.roommate_requests;
create trigger roommate_requests_suspended
  before insert or update of message, reply on public.roommate_requests
  for each row execute function public.roommate_guard_suspended();

drop function if exists public.list_roommate_requests(uuid);
create function public.list_roommate_requests(p_post_id uuid default null)
returns table (
  request_id uuid,
  created_at timestamptz,
  post_id uuid,
  dormitory_code text,
  semester text,
  post_closed boolean,
  message text,
  is_new boolean,
  reply text,
  replied_at timestamptz,
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
      r.reply,
      r.replied_at,
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
      and not public.roommate_user_suspended(r.applicant_id)
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

-- ── 5) 운영자용 보기: 신고 내역 + 신고받은 사람의 이메일 · 정지 여부 (Dashboard 에서만) ──
create or replace view public.roommate_reports_admin
with (security_invoker = true)
as
  select
    r.created_at,
    r.status,
    r.reason,
    r.detail,
    r.target_type,
    m.email as reported_email,
    m.report_count,
    m.is_suspended,
    r.snapshot,
    r.admin_note,
    r.reported_id,
    r.id as report_id
  from public.roommate_reports r
  left join public.roommate_moderation m on m.user_id = r.reported_id
  order by r.created_at desc;

revoke all on public.roommate_reports_admin from anon, authenticated;

revoke all on function public.touch_roommate_moderation() from public;
revoke all on function public.roommate_user_suspended(uuid) from public;
revoke all on function public.my_roommate_status() from public;
revoke all on function public.roommate_file_report(uuid, text, uuid, uuid, text, text, jsonb) from public;
revoke all on function public.report_roommate_post(uuid, text, text) from public;
revoke all on function public.report_roommate_request(uuid, text, text) from public;
revoke all on function public.roommate_guard_suspended() from public;
revoke all on function public.list_roommate_requests(uuid) from public;
-- roommate_user_suspended 는 게시글 정책에서 쓴다
grant execute on function public.roommate_user_suspended(uuid) to authenticated;
grant execute on function public.my_roommate_status() to authenticated;
grant execute on function public.report_roommate_post(uuid, text, text) to authenticated;
grant execute on function public.report_roommate_request(uuid, text, text) to authenticated;
grant execute on function public.list_roommate_requests(uuid) to authenticated;
