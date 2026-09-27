-- 룸메 신청: 이용 정지된 사용자의 글에는 신청할 수 없게
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- 정지된 사용자의 글은 다른 사람에게 보이지 않지만, 정지되기 전에 열어 둔 화면에서는 [룸메 신청]을 누를 수 있었다.
-- 운영자가 숨긴 글(is_open = false)과 같은 방식으로 "글을 찾을 수 없음"으로 막는다.
-- 나머지는 20261007000000_roommate_blocks_replies.sql 의 send_roommate_request 와 같다.

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
  if not found
     or not post.is_open
     or public.roommate_is_blocked(post.user_id)
     or public.roommate_user_suspended(post.user_id) then
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

revoke all on function public.send_roommate_request(uuid, text) from public, anon;
grant execute on function public.send_roommate_request(uuid, text) to authenticated;
