-- 관리자 페이지 (/admin)
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · 관리자는 admins 테이블에 등록된 계정뿐이다. 이메일이 아니라 계정 id 로 확인한다.
--       맨 아래 "관리자 등록" 이 운영자 구글 계정(thisiswoo04@gmail.com)을 등록한다.
--       이 계정으로 사이트에 한 번도 로그인하지 않았다면 아무것도 등록되지 않으니,
--       로그인한 뒤 그 insert 문만 다시 실행하면 된다.
--   · 관리 기능은 모두 아래 함수(RPC)로만 한다. 함수마다 관리자인지 먼저 확인하고,
--       관리자가 아니면 아무것도 보여 주거나 바꾸지 않는다. 테이블 권한은 여전히 막혀 있다.
--   · 관리자가 한 일(숨김·삭제·정지 등)은 admin_logs 에 남는다.
--   · 룸메 신청의 한마디·답장 내용은 관리 화면에서도 보여 주지 않는다 (신고된 신청은 신고 당시 내용만).

-- ── 1) 관리자 ──
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  note        text
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 지금 로그인한 사용자가 관리자인지 (화면에서 관리자 메뉴를 보여 줄지 정할 때 쓴다)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- 관리자가 아니면 멈춘다 (내부용: 모든 관리 함수의 첫 줄)
create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501', hint = 'forbidden';
  end if;
end;
$$;

-- ── 2) 관리 기록 ──
create table if not exists public.admin_logs (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  admin_id     uuid references auth.users (id) on delete set null,
  action       text not null,   -- 예: hide_post, delete_post, suspend_user, review_report
  target_type  text,            -- post | report | user | admission_report
  target_id    text,
  detail       jsonb
);

create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);

alter table public.admin_logs enable row level security;
revoke all on public.admin_logs from anon, authenticated;

create or replace function public.admin_log(p_action text, p_target_type text, p_target_id text, p_detail jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_detail);
$$;

-- ── 3) 개요: 숫자 + 최근 14일 (한국 시간 기준) ──
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'users',              (select count(*) from auth.users),
    'profiles',           (select count(*) from public.roommate_profiles),
    'posts',              (select count(*) from public.roommate_posts),
    'posts_open',         (select count(*) from public.roommate_posts p where p.is_open and not p.is_closed),
    'posts_closed',       (select count(*) from public.roommate_posts p where p.is_closed),
    'posts_hidden',       (select count(*) from public.roommate_posts p where not p.is_open),
    'posts_today',        (select count(*) from public.roommate_posts p where p.created_at >= today_start),
    'requests',           (select count(*) from public.roommate_requests),
    'requests_today',     (select count(*) from public.roommate_requests r where r.created_at >= today_start),
    'blocks',             (select count(*) from public.roommate_blocks),
    'reports',            (select count(*) from public.roommate_reports),
    'reports_pending',    (select count(*) from public.roommate_reports r where r.status = 'pending'),
    'suspended',          (select count(*) from public.roommate_moderation m
                           where m.is_suspended and (m.suspended_until is null or m.suspended_until > now())),
    'admission_reports',  (select count(*) from public.admission_reports),
    'admission_excluded', (select count(*) from public.admission_reports a where a.is_excluded),
    'scores',             (select count(*) from public.score_submissions),
    'scores_today',       (select count(*) from public.score_submissions s where s.created_at >= today_start),
    'predictions',        (select count(*) from public.prediction_logs),
    'predictions_today',  (select count(*) from public.prediction_logs l where l.created_at >= today_start),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day',         d.day,
        'scores',      (select count(*) from public.score_submissions s
                        where s.created_at >= d.day_start and s.created_at < d.day_end),
        'predictions', (select count(*) from public.prediction_logs l
                        where l.created_at >= d.day_start and l.created_at < d.day_end),
        'posts',       (select count(*) from public.roommate_posts p
                        where p.created_at >= d.day_start and p.created_at < d.day_end),
        'requests',    (select count(*) from public.roommate_requests r
                        where r.created_at >= d.day_start and r.created_at < d.day_end)
      ) order by d.day), '[]'::jsonb)
      from (
        select g::date as day,
               g::date::timestamp at time zone 'Asia/Seoul' as day_start,
               (g::date + 1)::timestamp at time zone 'Asia/Seoul' as day_end
        from generate_series(0, 13) as i, lateral (select today - 13 + i as g) days
      ) d
    )
  );
end;
$$;

-- ── 4) 룸메이트 게시글: 숨긴 글·정지된 사용자의 글까지 모두 ──
-- p_status: null(전체) | open(모집 중) | closed(모집완료) | hidden(숨김) | reported(처리 안 된 신고) | suspended(정지된 사용자)
-- p_search: 내용 · 작성자 이메일의 일부, 또는 글 id
create or replace function public.admin_list_roommate_posts(
  p_status text default null,
  p_semester text default null,
  p_dormitory text default null,
  p_gender text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  author_email text,
  dormitory_code text,
  gender text,
  age integer,
  college_code text,
  mbti text,
  checklist jsonb,
  content text,
  semester text,
  is_closed boolean,
  is_open boolean,
  request_count integer,
  report_count integer,
  pending_report_count integer,
  author_suspended boolean,
  author_suspended_until timestamptz,
  author_post_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := lower(nullif(btrim(coalesce(p_search, '')), ''));
begin
  perform public.admin_guard();
  if p_status is not null and p_status not in ('open', 'closed', 'hidden', 'reported', 'suspended') then
    raise exception 'invalid status' using errcode = '22023', hint = 'invalid';
  end if;

  return query
    with base as (
      select
        p.id,
        p.created_at,
        p.updated_at,
        p.user_id,
        u.email::text as author_email,
        p.dormitory_code,
        p.gender,
        p.age::integer as age,
        p.college_code,
        p.mbti,
        p.checklist,
        p.content,
        p.semester,
        p.is_closed,
        p.is_open,
        p.request_count,
        (select count(*)::integer from public.roommate_reports r where r.post_id = p.id) as report_count,
        (select count(*)::integer from public.roommate_reports r
         where r.post_id = p.id and r.status = 'pending') as pending_report_count,
        public.roommate_user_suspended(p.user_id) as author_suspended,
        (select m.suspended_until from public.roommate_moderation m
         where m.user_id = p.user_id and m.is_suspended) as author_suspended_until,
        (select count(*)::integer from public.roommate_posts o where o.user_id = p.user_id) as author_post_count
      from public.roommate_posts p
      left join auth.users u on u.id = p.user_id
    )
    select b.*, count(*) over () as total_count
    from base b
    where (p_semester is null or b.semester = p_semester)
      and (p_dormitory is null or b.dormitory_code = p_dormitory)
      and (p_gender is null or b.gender = p_gender)
      and (q is null
           or strpos(lower(b.content), q) > 0
           or strpos(lower(coalesce(b.author_email, '')), q) > 0
           or b.id::text = q
           or b.user_id::text = q)
      and (p_status is null
           or (p_status = 'open' and b.is_open and not b.is_closed)
           or (p_status = 'closed' and b.is_closed)
           or (p_status = 'hidden' and not b.is_open)
           or (p_status = 'reported' and b.pending_report_count > 0)
           or (p_status = 'suspended' and b.author_suspended))
    order by b.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- 게시글 숨기기/다시 보이기(is_open), 모집완료/다시 모집(is_closed). null 인 값은 그대로 둔다.
-- 숨긴 글은 글쓴이에게만 보이고, 신청·신고를 받을 수 없다.
create or replace function public.admin_update_roommate_post(
  p_post_id uuid,
  p_is_open boolean default null,
  p_is_closed boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
begin
  perform public.admin_guard();
  if p_is_open is null and p_is_closed is null then
    raise exception 'nothing to change' using errcode = '22023', hint = 'invalid';
  end if;
  update public.roommate_posts p
  set is_open = coalesce(p_is_open, p.is_open),
      is_closed = coalesce(p_is_closed, p.is_closed)
  where p.id = p_post_id;
  if not found then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;

  select u.email into author
  from public.roommate_posts p join auth.users u on u.id = p.user_id
  where p.id = p_post_id;
  perform public.admin_log(
    case
      when p_is_open is false then 'hide_post'
      when p_is_open then 'show_post'
      when p_is_closed then 'close_post'
      else 'reopen_post'
    end,
    'post', p_post_id::text,
    jsonb_build_object('author', author, 'is_open', p_is_open, 'is_closed', p_is_closed)
  );
end;
$$;

-- 게시글 삭제. 이 글에 온 신청도 함께 지워지고, 신고 기록은 신고 당시 내용과 함께 남는다.
create or replace function public.admin_delete_roommate_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone record;
begin
  perform public.admin_guard();
  delete from public.roommate_posts p
  where p.id = p_post_id
  returning p.user_id, p.dormitory_code, p.semester, p.content, p.request_count into gone;
  if not found then
    raise exception 'post not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.admin_log(
    'delete_post', 'post', p_post_id::text,
    jsonb_build_object(
      'author', (select u.email from auth.users u where u.id = gone.user_id),
      'dormitory', gone.dormitory_code,
      'semester', gone.semester,
      'requests', gone.request_count,
      'content', left(gone.content, 200)
    )
  );
end;
$$;

-- ── 5) 신고 ──
-- p_status: null(전체) | pending | reviewed | dismissed
create or replace function public.admin_list_roommate_reports(
  p_status text default 'pending',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  report_id uuid,
  created_at timestamptz,
  status text,
  reason text,
  detail text,
  target_type text,
  post_id uuid,
  request_id uuid,
  post_state text,              -- open | closed | hidden | deleted
  request_exists boolean,
  snapshot jsonb,
  admin_note text,
  reporter_id uuid,
  reporter_email text,
  reported_id uuid,
  reported_email text,
  reported_total integer,       -- 이 사용자가 받은 신고 수 (모든 상태)
  reported_suspended boolean,
  reported_suspended_until timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard();
  if p_status is not null and p_status not in ('pending', 'reviewed', 'dismissed') then
    raise exception 'invalid status' using errcode = '22023', hint = 'invalid';
  end if;

  return query
    select
      r.id,
      r.created_at,
      r.status,
      r.reason,
      r.detail,
      r.target_type,
      r.post_id,
      r.request_id,
      case
        when p.id is null then 'deleted'
        when not p.is_open then 'hidden'
        when p.is_closed then 'closed'
        else 'open'
      end,
      r.request_id is not null and exists (select 1 from public.roommate_requests q where q.id = r.request_id),
      r.snapshot,
      r.admin_note,
      r.reporter_id,
      ur.email::text,
      r.reported_id,
      ud.email::text,
      (select count(*)::integer from public.roommate_reports x where x.reported_id = r.reported_id),
      public.roommate_user_suspended(r.reported_id),
      (select m.suspended_until from public.roommate_moderation m where m.user_id = r.reported_id and m.is_suspended),
      count(*) over ()
    from public.roommate_reports r
    left join public.roommate_posts p on p.id = r.post_id
    left join auth.users ur on ur.id = r.reporter_id
    left join auth.users ud on ud.id = r.reported_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- 신고 처리 상태와 메모. null 이면 그대로, 메모를 '' 로 보내면 지운다.
create or replace function public.admin_update_roommate_report(
  p_report_id uuid,
  p_status text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if p_status is not null and p_status not in ('pending', 'reviewed', 'dismissed') then
    raise exception 'invalid status' using errcode = '22023', hint = 'invalid';
  end if;
  if char_length(p_admin_note) > 500 then
    raise exception 'note too long' using errcode = '22001', hint = 'too_long';
  end if;
  update public.roommate_reports r
  set status = coalesce(p_status, r.status),
      admin_note = case when p_admin_note is null then r.admin_note else nullif(btrim(p_admin_note), '') end
  where r.id = p_report_id;
  if not found then
    raise exception 'report not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.admin_log(
    case p_status when 'reviewed' then 'review_report' when 'dismissed' then 'dismiss_report'
                  when 'pending' then 'reopen_report' else 'note_report' end,
    'report', p_report_id::text,
    jsonb_build_object('status', p_status, 'note', p_admin_note)
  );
end;
$$;

-- ── 6) 사용자 (구글 로그인한 모든 계정) ──
-- p_filter: null(전체) | reported(신고받은) | suspended(정지 중) | posters(글을 쓴) | profiles(체크리스트 등록)
-- p_search: 이메일의 일부, 또는 계정 id
create or replace function public.admin_list_users(
  p_filter text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  has_profile boolean,
  post_count integer,
  request_count integer,
  reported_count integer,
  pending_reported_count integer,
  filed_count integer,
  is_suspended boolean,         -- 지금 정지 중인지 (기간이 지났으면 false)
  suspended_until timestamptz,
  note text,
  is_admin boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := lower(nullif(btrim(coalesce(p_search, '')), ''));
begin
  perform public.admin_guard();
  if p_filter is not null and p_filter not in ('reported', 'suspended', 'posters', 'profiles') then
    raise exception 'invalid filter' using errcode = '22023', hint = 'invalid';
  end if;

  return query
    with base as (
      select
        u.id as user_id,
        u.email::text as email,
        u.created_at,
        u.last_sign_in_at,
        exists (select 1 from public.roommate_profiles f where f.user_id = u.id) as has_profile,
        (select count(*)::integer from public.roommate_posts p where p.user_id = u.id) as post_count,
        (select count(*)::integer from public.roommate_requests r where r.applicant_id = u.id) as request_count,
        (select count(*)::integer from public.roommate_reports r where r.reported_id = u.id) as reported_count,
        (select count(*)::integer from public.roommate_reports r
         where r.reported_id = u.id and r.status = 'pending') as pending_reported_count,
        (select count(*)::integer from public.roommate_reports r where r.reporter_id = u.id) as filed_count,
        coalesce(m.is_suspended and (m.suspended_until is null or m.suspended_until > now()), false) as is_suspended,
        case when m.is_suspended then m.suspended_until end as suspended_until,
        m.note,
        exists (select 1 from public.admins a where a.user_id = u.id) as is_admin
      from auth.users u
      left join public.roommate_moderation m on m.user_id = u.id
    )
    select b.*, count(*) over () as total_count
    from base b
    where (q is null or strpos(lower(coalesce(b.email, '')), q) > 0 or b.user_id::text = q)
      and (p_filter is null
           or (p_filter = 'reported' and b.reported_count > 0)
           or (p_filter = 'suspended' and b.is_suspended)
           or (p_filter = 'posters' and b.post_count > 0)
           or (p_filter = 'profiles' and b.has_profile))
    order by
      case when p_filter = 'reported' then b.pending_reported_count end desc nulls last,
      case when p_filter = 'reported' then b.reported_count end desc nulls last,
      b.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- 이용 정지 · 해제 · 메모
--   p_suspended: true 정지 / false 해제 / null 정지 상태는 그대로 (메모만 바꿀 때)
--   p_until:     정지 끝나는 시각 (null 이면 무기한). 정지할 때만 쓴다.
--   p_note:      null 이면 그대로, '' 이면 지운다.
create or replace function public.admin_moderate_user(
  p_user_id uuid,
  p_suspended boolean default null,
  p_until timestamptz default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  perform public.admin_guard();
  select u.email into target_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_suspended and p_user_id = auth.uid() then
    raise exception 'cannot suspend yourself' using errcode = 'P0001', hint = 'self';
  end if;
  if p_suspended and p_until is not null and p_until <= now() then
    raise exception 'until must be in the future' using errcode = '22023', hint = 'until';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22001', hint = 'too_long';
  end if;

  insert into public.roommate_moderation as m (user_id, email, is_suspended, suspended_until, note)
  values (
    p_user_id,
    target_email,
    coalesce(p_suspended, false),
    case when p_suspended then p_until end,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (user_id) do update
    set email = coalesce(m.email, excluded.email),
        is_suspended = coalesce(p_suspended, m.is_suspended),
        suspended_until = case
                            when p_suspended is null then m.suspended_until
                            when p_suspended then p_until
                          end,
        note = case when p_note is null then m.note else nullif(btrim(p_note), '') end;

  perform public.admin_log(
    case when p_suspended then 'suspend_user' when p_suspended is false then 'unsuspend_user' else 'note_user' end,
    'user', p_user_id::text,
    jsonb_build_object('email', target_email, 'until', p_until, 'note', p_note)
  );
end;
$$;

-- ── 7) 합격 결과 제보: 학습에서 빼기(is_excluded)와 메모 ──
create or replace function public.admin_list_admission_reports(
  p_semester text default null,
  p_room text default null,
  p_result text default null,
  p_excluded boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  email text,
  semester text,
  applied_room text,
  result text,
  assigned_dormitory text,
  converted_score numeric,
  gender text,
  college_code text,
  grade text,
  is_excluded boolean,
  admin_note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard();
  return query
    select
      a.id,
      a.created_at,
      a.updated_at,
      a.user_id,
      u.email::text,
      a.semester,
      a.applied_room,
      a.result,
      a.assigned_dormitory,
      a.converted_score,
      a.gender,
      a.college_code,
      a.grade,
      a.is_excluded,
      a.admin_note,
      count(*) over ()
    from public.admission_reports a
    left join auth.users u on u.id = a.user_id
    where (p_semester is null or a.semester = p_semester)
      and (p_room is null or a.applied_room = p_room)
      and (p_result is null or a.result = p_result)
      and (p_excluded is null or a.is_excluded = p_excluded)
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_update_admission_report(
  p_report_id uuid,
  p_excluded boolean default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if char_length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22001', hint = 'too_long';
  end if;
  update public.admission_reports a
  set is_excluded = coalesce(p_excluded, a.is_excluded),
      admin_note = case when p_note is null then a.admin_note else nullif(btrim(p_note), '') end
  where a.id = p_report_id;
  if not found then
    raise exception 'report not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.admin_log(
    case when p_excluded then 'exclude_admission' when p_excluded is false then 'include_admission' else 'note_admission' end,
    'admission_report', p_report_id::text,
    jsonb_build_object('excluded', p_excluded, 'note', p_note)
  );
end;
$$;

-- ── 8) 기록: 점수 계산 · 예측 요청 · 관리 기록 (최신순) ──
-- p_kind: scores | predictions | admin. { "total": 전체 수, "items": [...] }
create or replace function public.admin_list_activity(p_kind text, p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_guard();
  if p_kind = 'scores' then
    return jsonb_build_object(
      'total', (select count(*) from public.score_submissions),
      'items', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.created_at desc)
        from (select * from public.score_submissions order by created_at desc limit lim offset off) s
      ), '[]'::jsonb)
    );
  elsif p_kind = 'predictions' then
    -- 열이 추가돼도(예: gender) 그대로 보이도록 행 전체를 넘긴다
    return jsonb_build_object(
      'total', (select count(*) from public.prediction_logs),
      'items', coalesce((
        select jsonb_agg(to_jsonb(l) order by l.created_at desc)
        from (select * from public.prediction_logs order by created_at desc limit lim offset off) l
      ), '[]'::jsonb)
    );
  elsif p_kind = 'admin' then
    return jsonb_build_object(
      'total', (select count(*) from public.admin_logs),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', g.id, 'created_at', g.created_at, 'admin_email', u.email,
          'action', g.action, 'target_type', g.target_type, 'target_id', g.target_id, 'detail', g.detail
        ) order by g.created_at desc, g.id desc)
        from (select * from public.admin_logs order by created_at desc, id desc limit lim offset off) g
        left join auth.users u on u.id = g.admin_id
      ), '[]'::jsonb)
    );
  end if;
  raise exception 'invalid kind' using errcode = '22023', hint = 'invalid';
end;
$$;

-- ── 9) 권한: 관리 함수는 로그인한 사용자만 부를 수 있고, 함수 안에서 관리자인지 다시 확인한다 ──
-- Supabase 는 새 함수에 anon · authenticated 실행 권한을 자동으로 주므로 셋 모두에서 회수한 뒤 필요한 것만 준다.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon, authenticated;
revoke all on function public.admin_log(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_list_roommate_posts(text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_roommate_post(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_roommate_post(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_roommate_reports(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_roommate_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_moderate_user(uuid, boolean, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_list_admission_reports(text, text, text, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_admission_report(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_list_activity(text, integer, integer) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_roommate_posts(text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_roommate_post(uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_delete_roommate_post(uuid) to authenticated;
grant execute on function public.admin_list_roommate_reports(text, integer, integer) to authenticated;
grant execute on function public.admin_update_roommate_report(uuid, text, text) to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_moderate_user(uuid, boolean, timestamptz, text) to authenticated;
grant execute on function public.admin_list_admission_reports(text, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_update_admission_report(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_activity(text, integer, integer) to authenticated;

-- ── 10) 보안 보강: 내부용 함수를 앱에서 직접 부를 수 없게 ──
-- 위와 같은 이유로, 앞선 마이그레이션의 내부용 함수도 로그인한 사용자가 직접 부를 수 있었다.
-- (예: roommate_file_report 로 신고 당시 내용을 지어내 신고하기) 다른 함수 안에서만 쓰이므로 회수한다.
revoke execute on function public.roommate_file_report(uuid, text, uuid, uuid, text, text, jsonb) from anon, authenticated;
revoke execute on function public.roommate_block_user(uuid, text) from anon, authenticated;
revoke execute on function public.sync_roommate_request_count(uuid) from anon, authenticated;

-- ── 11) 관리자 등록: 운영자 구글 계정 ──
-- 이메일이 확인된 구글 로그인 계정만 등록한다. 관리자를 더 두려면 이메일만 바꿔 다시 실행한다.
insert into public.admins (user_id, note)
select u.id, '운영자'
from auth.users u
where lower(u.email) = 'thisiswoo04@gmail.com'
  and u.email_confirmed_at is not null
  and (u.raw_app_meta_data ->> 'provider' = 'google'
       or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google')
on conflict (user_id) do nothing;
