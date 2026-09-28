-- 채팅 푸시 알림 (휴대폰 · PC 브라우저의 시스템 알림)
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행.
--            실제로 알림을 보내려면 README 의 "채팅 푸시 알림 설정" 순서대로 Edge Function 과 비밀 값을 넣어야 한다.
--            (설정 전에는 아무 일도 하지 않고, 채팅은 그대로 동작한다)
--
--   · push_subscriptions: 알림을 허용한 기기(브라우저)마다 하나. 브라우저가 준 주소(endpoint)와 암호 키만 저장한다.
--     함수로만 저장 · 삭제하고, 누구도 직접 읽을 수 없다. 같은 기기에서 다른 계정으로 저장하면 그 계정으로 옮긴다.
--   · 새 메시지(또는 첫 메시지 = 룸메 신청)가 저장되면 트리거가 받는 사람의 기기 목록과 알림 내용을 만들어
--     Edge Function(send-chat-push)에 보낸다 (pg_net, 비동기라 메시지 저장을 늦추지 않음).
--     받는 사람이 채팅방을 나갔으면 보내지 않는다. 알림을 보내지 못해도 메시지 저장은 그대로 된다.
--   · Edge Function 주소와 비밀 값은 저장소에 두지 않고 private.app_secrets 에 넣는다 (API 로 읽을 수 없는 곳):
--       push_function_url   예: https://<프로젝트>.supabase.co/functions/v1/send-chat-push
--       push_webhook_secret Edge Function 의 PUSH_WEBHOOK_SECRET 과 같은 값 (다른 곳에서 함수를 부르지 못하게)

-- pg_net: DB 에서 HTTP 요청 (Supabase 에 있는 확장. 없는 환경에서는 건너뛴다)
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net 을 켤 수 없어 채팅 푸시 알림은 보내지 않습니다: %', sqlerrm;
end;
$$;

-- ── 1) 알림을 받을 기기 ──
create table if not exists public.push_subscriptions (
  endpoint    text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id     uuid not null references auth.users (id) on delete cascade,
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 이 기기로 알림 받기 (같은 기기를 다른 계정이 쓰던 경우 지금 계정으로 옮긴다)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501', hint = 'auth';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or char_length(p_p256dh) > 200
     or coalesce(p_auth, '') = '' or char_length(p_auth) > 100 then
    raise exception 'invalid subscription' using errcode = '22023', hint = 'invalid';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
end;
$$;

-- 이 기기 알림 끄기 (로그아웃할 때도)
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions s where s.endpoint = p_endpoint and s.user_id = auth.uid();
$$;

-- ── 2) 새 메시지 → 받는 사람의 기기로 알림 ──
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
  if tg_op = 'INSERT' then
    if new.kind <> 'text' or new.body is null then
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

drop trigger if exists roommate_thread_messages_push on public.roommate_thread_messages;
create trigger roommate_thread_messages_push
  after insert or update of body on public.roommate_thread_messages
  for each row execute function public.notify_roommate_chat_push();

revoke all on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon, authenticated;
revoke all on function public.notify_roommate_chat_push() from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
