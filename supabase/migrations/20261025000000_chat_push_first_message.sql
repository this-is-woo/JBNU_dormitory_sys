-- 채팅 푸시 알림: 첫 메시지(룸메 신청)도 알리기
-- 적용 방법: 20261024000000_chat_push.sql 다음에 SQL Editor 에서 실행.
--
-- 고친 점: 첫 메시지는 start_roommate_chat 이 kind = 'request' 로 내용을 채운 채 INSERT 하는데,
--          트리거가 INSERT 에서는 kind = 'text' 만 알려서 룸메 신청 알림이 한 번도 가지 않았다.
--          INSERT 에서도 kind = 'request' 를 알리도록 조건만 바꾼다. (나머지 동작은 그대로)

create or replace function public.notify_roommate_chat_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
  req record;
  recipient uuid;
  subs jsonb;
  sender text := case when new.sender_role = 'applicant' then '신청자' else '글쓴이' end;
  dorm text;
  body text;
begin
  -- 알림 대상: 새 메시지, 또는 첫 메시지(룸메 신청)에 내용이 채워질 때. 수정 · 삭제 · 나감은 알리지 않는다
  -- (첫 메시지는 start_roommate_chat 이 kind='request' 로, 내용을 채운 채 바로 넣는다)
  if tg_op = 'INSERT' then
    if new.kind not in ('text', 'request') or new.body is null then
      return new;
    end if;
  elsif not (new.kind = 'request' and old.body is null and new.body is not null and new.deleted_at is null) then
    return new;
  end if;

  -- Edge Function 이 준비되지 않았으면 아무것도 하지 않는다
  if to_regnamespace('net') is null then
    return new;
  end if;
  select s.value into fn_url from private.app_secrets s where s.key = 'push_function_url';
  select s.value into fn_secret from private.app_secrets s where s.key = 'push_webhook_secret';
  if fn_url is null or fn_secret is null then
    return new;
  end if;

  select r.applicant_id, r.author_id, r.applicant_left_at, r.author_left_at,
         coalesce(p.dormitory_code, r.post_snapshot ->> 'dormitory') as dormitory
  into req
  from public.roommate_requests r
  left join public.roommate_posts p on p.id = r.post_id
  where r.id = new.request_id;
  if not found then
    return new;
  end if;
  recipient := case when new.sender_role = 'applicant' then req.author_id else req.applicant_id end;
  -- 받는 사람이 채팅방을 나갔으면 보내지 않는다
  if (case when new.sender_role = 'applicant' then req.author_left_at else req.applicant_left_at end) is not null then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  into subs
  from public.push_subscriptions s
  where s.user_id = recipient;
  if jsonb_array_length(subs) = 0 then
    return new;
  end if;

  select d.name into dorm from public.dormitories d where d.code = req.dormitory;
  body := regexp_replace(new.body, '\s+', ' ', 'g');
  if char_length(body) > 120 then
    body := left(body, 120) || '…';
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object(
      'subscriptions', subs,
      'notification', jsonb_build_object(
        'title', case when new.kind = 'request'
                   then '새 룸메 신청' || coalesce(' · ' || dorm, '')
                   else sender || coalesce(' · ' || dorm, '') end,
        'body', body,
        'url', '/chats/' || new.request_id,
        'tag', 'chat-' || new.request_id
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret)
  );
  return new;
exception when others then
  -- 알림을 보내지 못해도 메시지 저장은 막지 않는다
  raise warning '채팅 푸시 알림 요청 실패: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_roommate_chat_push() from public, anon, authenticated;
