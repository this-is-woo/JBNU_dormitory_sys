-- 룸메이트 찾기: 모집 학기를 하나로 정하고, 지난 학기 글은 "지난 학기 글"로만 본다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · site_settings.roommate_semester: 지금 모집하는 학기 (예: "2027-1"). 관리자 페이지 [설정] 탭에서 바꾼다.
--   · 새 글의 학기는 사용자가 고르지 않고 DB 가 모집 학기로 채운다. 글을 고쳐도 학기는 바뀌지 않는다.
--   · 모집 학기가 아닌 글(지난 학기 글)에는 룸메 신청을 보낼 수 없다.
--   · roommate_post_semesters: 지난 학기 글 보기의 학기 목록 (학기별 글 수). 게시글 읽기 정책(RLS)이 그대로 적용된다.

insert into public.site_settings (key, value) values ('roommate_semester', '"2027-1"'::jsonb)
on conflict (key) do nothing;

-- 지금 모집 학기 (설정이 없거나 형식이 틀리면 null → 제한하지 않음)
create or replace function public.roommate_recruit_semester()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.value #>> '{}'
  from public.site_settings s
  where s.key = 'roommate_semester'
    and jsonb_typeof(s.value) = 'string'
    and (s.value #>> '{}') ~ '^20[0-9]{2}-[12]$';
$$;

revoke all on function public.roommate_recruit_semester() from public, anon, authenticated;

-- 새 글: 학기 = 모집 학기 / 글 수정: 학기는 그대로
create or replace function public.roommate_post_semester_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recruit text := public.roommate_recruit_semester();
begin
  if tg_op = 'INSERT' then
    if recruit is not null then
      new.semester := recruit;
    end if;
  elsif new.semester is distinct from old.semester then
    new.semester := old.semester;
  end if;
  return new;
end;
$$;

revoke all on function public.roommate_post_semester_guard() from public, anon, authenticated;

drop trigger if exists roommate_posts_semester on public.roommate_posts;
create trigger roommate_posts_semester
  before insert or update of semester on public.roommate_posts
  for each row execute function public.roommate_post_semester_guard();

-- 지난 학기 글 보기: 학기별 글 수 (최신 학기부터)
create or replace function public.roommate_post_semesters()
returns table (semester text, post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.semester, count(*)
  from public.roommate_posts p
  group by p.semester
  order by p.semester desc;
$$;

revoke all on function public.roommate_post_semesters() from public, anon, authenticated;
grant execute on function public.roommate_post_semesters() to authenticated;

-- 관리자 설정: 모집 학기도 바꿀 수 있게 (형식 YYYY-1 | YYYY-2)
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if not (
    (p_key = 'support_enabled' and jsonb_typeof(p_value) = 'boolean')
    or (p_key = 'roommate_semester' and jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^20[0-9]{2}-[12]$')
  ) then
    raise exception 'invalid setting' using errcode = '22023', hint = 'invalid';
  end if;
  insert into public.site_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform public.admin_log(
    case
      when p_key = 'roommate_semester' then 'set_roommate_semester'
      when p_value = 'true'::jsonb then 'enable_support'
      else 'disable_support'
    end,
    'setting', p_key, jsonb_build_object('value', p_value)
  );
end;
$$;

revoke all on function public.admin_set_setting(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- 룸메 신청: 지난 학기 글에는 보낼 수 없다 (hint 'archived').
-- 나머지는 20261011000000_request_guard.sql 의 send_roommate_request 와 같다.
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
  request_id uuid;
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
  returning id into request_id;
  if request_id is null then
    raise exception 'already sent' using errcode = '23505', hint = 'duplicate';
  end if;

  perform public.sync_roommate_request_count(p_post_id);
  return request_id;
end;
$$;

revoke all on function public.send_roommate_request(uuid, text) from public, anon;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;
