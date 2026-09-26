-- 새빛관 여학생 전용 + 룸메 신청: 같은 성별만, 차단, 답장
-- 적용 방법: 20261006000000_roommate_requests.sql 을 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 새빛관은 여학생 전용 (한빛관·대동관은 남학생 전용). 프로필·게시글의 호관과 성별이 맞아야 저장된다.
--   · 룸메 신청은 같은 성별의 글에만 보낼 수 있다.
--   · 차단: 받은 신청의 신청자나 게시글의 글쓴이를 차단하면
--       서로의 글이 보이지 않고, 서로 신청할 수 없고, 두 사람 사이의 신청은 지워진다.
--       서로 익명이라 차단 목록에는 "어디서 차단했는지"만 남는다. 언제든 해제할 수 있다.
--   · 답장: 글쓴이는 받은 신청마다 답장(300자)을 한 번 남길 수 있다 (고쳐 쓰기·지우기 가능).
--       신청자는 [신청 내역 → 보낸 신청]에서 답장을 본다.

-- ── 1) 새빛관 여학생 전용 ──
update public.dormitories set genders = array['여'] where code = 'saebit';

-- 합격 결과 제보: 남학생은 새빛관, 여학생은 한빛관·대동관에 배정될 수 없다 (기존 제보는 검사하지 않음)
alter table public.admission_reports drop constraint if exists admission_reports_gender;
alter table public.admission_reports add constraint admission_reports_gender check (
  (gender = '남' and coalesce(assigned_dormitory, '') <> 'saebit')
  or (gender = '여' and applied_room <> 'hanbit_4' and coalesce(assigned_dormitory, '') not in ('hanbit', 'daedong'))
) not valid;

-- 프로필·게시글: 호관의 성별과 맞아야 한다 (새로 저장하거나 고칠 때만 검사)
create or replace function public.check_roommate_dorm_gender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.dormitory_code is not distinct from old.dormitory_code
     and new.gender is not distinct from old.gender then
    return new;
  end if;
  if not exists (
    select 1 from public.dormitories d where d.code = new.dormitory_code and new.gender = any (d.genders)
  ) then
    raise exception 'dormitory not for this gender' using errcode = '23514', hint = 'dorm_gender';
  end if;
  return new;
end;
$$;

drop trigger if exists roommate_profiles_dorm_gender on public.roommate_profiles;
create trigger roommate_profiles_dorm_gender
  before insert or update on public.roommate_profiles
  for each row execute function public.check_roommate_dorm_gender();

drop trigger if exists roommate_posts_dorm_gender on public.roommate_posts;
create trigger roommate_posts_dorm_gender
  before insert or update on public.roommate_posts
  for each row execute function public.check_roommate_dorm_gender();

revoke all on function public.check_roommate_dorm_gender() from public;

-- ── 2) 차단 ──
create table if not exists public.roommate_blocks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  context     text,  -- 어디서 차단했는지 (예: "받은 신청 · 새빛관 · 2026년 2학기")
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists roommate_blocks_blocked_idx on public.roommate_blocks (blocked_id);

alter table public.roommate_blocks enable row level security;
revoke all on public.roommate_blocks from anon, authenticated;

-- 나와 이 사용자 사이에 차단이 있는지 (어느 쪽이 차단했든)
create or replace function public.roommate_is_blocked(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roommate_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = auth.uid())
  );
$$;

-- 차단한 사이의 글은 서로 보이지 않는다
drop policy if exists "roommate_posts: profile read" on public.roommate_posts;
create policy "roommate_posts: profile read" on public.roommate_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (is_open and (select public.has_roommate_profile()) and not public.roommate_is_blocked(user_id))
  );

-- 차단 기록 + 두 사람 사이의 신청 삭제 (내부용)
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
    using public.roommate_posts p
    where p.id = r.post_id
      and ((p.user_id = uid and r.applicant_id = p_blocked) or (p.user_id = p_blocked and r.applicant_id = uid))
    returning r.post_id
  loop
    perform public.sync_roommate_request_count(touched);
  end loop;
end;
$$;

-- 받은 신청의 신청자 차단 (내 글에 온 신청만)
create or replace function public.block_roommate_applicant(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  ctx text;
begin
  select r.applicant_id, '받은 신청 · ' || d.name || coalesce(' · ' || split_part(p.semester, '-', 1) || '년 ' || split_part(p.semester, '-', 2) || '학기', '')
  into target, ctx
  from public.roommate_requests r
  join public.roommate_posts p on p.id = r.post_id
  left join public.dormitories d on d.code = p.dormitory_code
  where r.id = p_request_id and p.user_id = auth.uid();
  if target is null then
    raise exception 'request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.roommate_block_user(target, ctx);
end;
$$;

-- 게시글의 글쓴이 차단 (내가 볼 수 있는 글만)
create or replace function public.block_roommate_author(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  ctx text;
begin
  select p.user_id, '게시글 · ' || d.name || coalesce(' · ' || split_part(p.semester, '-', 1) || '년 ' || split_part(p.semester, '-', 2) || '학기', '')
  into target, ctx
  from public.roommate_posts p
  left join public.dormitories d on d.code = p.dormitory_code
  where p.id = p_post_id and p.is_open;
  if target is null then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.roommate_block_user(target, ctx);
end;
$$;

-- 내가 차단한 목록 (상대가 누구인지는 알려 주지 않는다)
create or replace function public.list_roommate_blocks()
returns table (block_id uuid, created_at timestamptz, context text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.created_at, b.context
  from public.roommate_blocks b
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.unblock_roommate(p_block_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.roommate_blocks b where b.id = p_block_id and b.blocker_id = auth.uid();
$$;

-- ── 3) 답장 ──
alter table public.roommate_requests add column if not exists reply text check (char_length(reply) <= 300);
alter table public.roommate_requests add column if not exists replied_at timestamptz;
alter table public.roommate_requests add column if not exists reply_seen_at timestamptz;  -- 신청자가 답장을 확인한 시각

-- 글쓴이가 답장 남기기 (빈 값이면 답장 지우기)
create or replace function public.reply_roommate_request(p_request_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if char_length(msg) > 300 then
    raise exception 'reply too long' using errcode = '22001', hint = 'too_long';
  end if;
  update public.roommate_requests r
  set reply = msg,
      replied_at = case when msg is null then null else now() end,
      reply_seen_at = null
  from public.roommate_posts p
  where p.id = r.post_id and r.id = p_request_id and p.user_id = auth.uid();
  if not found then
    raise exception 'request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
end;
$$;

-- ── 4) 신청 보내기: 같은 성별 + 차단 확인 ──
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
  request_id uuid;
  msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select r.gender into my_gender from public.roommate_profiles r where r.user_id = uid;
  if uid is null or my_gender is null then
    raise exception 'profile required' using errcode = '42501', hint = 'profile';
  end if;
  select p.user_id, p.gender, p.is_open, p.is_closed into post from public.roommate_posts p where p.id = p_post_id;
  if not found or not post.is_open or public.roommate_is_blocked(post.user_id) then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if post.user_id = uid then
    raise exception 'own post' using errcode = 'P0001', hint = 'own';
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
  returning id into request_id;
  if request_id is null then
    raise exception 'already sent' using errcode = '23505', hint = 'duplicate';
  end if;

  perform public.sync_roommate_request_count(p_post_id);
  return request_id;
end;
$$;

-- ── 5) 받은 신청: 답장 포함 (반환 형식이 바뀌어 지우고 다시 만든다) ──
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

-- ── 6) 보낸 신청 + 받은 답장. 불러오면 답장을 확인한 것으로 표시 ──
create or replace function public.list_sent_roommate_requests()
returns table (
  request_id uuid,
  created_at timestamptz,
  post_id uuid,
  dormitory_code text,
  semester text,
  post_closed boolean,
  author jsonb,
  message text,
  reply text,
  replied_at timestamptz,
  reply_is_new boolean
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
      jsonb_build_object('gender', p.gender, 'age', p.age, 'collegeCode', p.college_code, 'mbti', p.mbti),
      r.message,
      r.reply,
      r.replied_at,
      r.reply is not null and r.reply_seen_at is null
    from public.roommate_requests r
    join public.roommate_posts p on p.id = r.post_id
    where r.applicant_id = auth.uid()
    order by coalesce(r.replied_at, r.created_at) desc;

  update public.roommate_requests r
  set reply_seen_at = now()
  where r.applicant_id = auth.uid() and r.reply is not null and r.reply_seen_at is null;
end;
$$;

-- ── 7) 툴바 배지: 새 신청 수 + 새 답장 수 ──
drop function if exists public.count_new_roommate_requests();
create or replace function public.roommate_inbox_counts()
returns table (new_requests integer, new_replies integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer
     from public.roommate_requests r
     join public.roommate_posts p on p.id = r.post_id
     where p.user_id = auth.uid() and r.seen_at is null),
    (select count(*)::integer
     from public.roommate_requests r
     where r.applicant_id = auth.uid() and r.reply is not null and r.reply_seen_at is null);
$$;

revoke all on function public.roommate_is_blocked(uuid) from public;
revoke all on function public.roommate_block_user(uuid, text) from public;
revoke all on function public.block_roommate_applicant(uuid) from public;
revoke all on function public.block_roommate_author(uuid) from public;
revoke all on function public.list_roommate_blocks() from public;
revoke all on function public.unblock_roommate(uuid) from public;
revoke all on function public.reply_roommate_request(uuid, text) from public;
revoke all on function public.send_roommate_request(uuid, text) from public;
revoke all on function public.list_roommate_requests(uuid) from public;
revoke all on function public.list_sent_roommate_requests() from public;
revoke all on function public.roommate_inbox_counts() from public;
-- roommate_is_blocked 는 게시글 읽기 정책에서 쓴다
grant execute on function public.roommate_is_blocked(uuid) to authenticated;
grant execute on function public.block_roommate_applicant(uuid) to authenticated;
grant execute on function public.block_roommate_author(uuid) to authenticated;
grant execute on function public.list_roommate_blocks() to authenticated;
grant execute on function public.unblock_roommate(uuid) to authenticated;
grant execute on function public.reply_roommate_request(uuid, text) to authenticated;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;
grant execute on function public.list_roommate_requests(uuid) to authenticated;
grant execute on function public.list_sent_roommate_requests() to authenticated;
grant execute on function public.roommate_inbox_counts() to authenticated;
