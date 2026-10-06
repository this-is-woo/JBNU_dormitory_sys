-- 맞춤 룸메 알림: 나와 잘 맞는 새 룸메이트 글이 올라오면 휴대폰 알림으로 알려 준다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤 SQL Editor 에서 실행.
--            알림은 채팅 알림과 같은 길(pg_net → Edge Function send-chat-push → 웹 푸시)로 보낸다.
--            README 의 "채팅 푸시 알림" 설정을 마쳤으면 따로 설정할 것은 없다 (Edge Function 도 그대로).
--
--   · roommate_alerts: 맞춤 알림을 켠 사람마다 한 줄 (줄이 있으면 켜짐). 본인 줄만 읽고 쓴다.
--       min_match: 체크리스트가 몇 개 이상 맞을 때 알릴지 · dormitory_code: 이 호관 글만 (비우면 모든 호관)
--   · 새 글이 올라오면(모집 학기 · 공개 · 모집 중인 글만) 트리거가 받을 사람을 고른다:
--       같은 성별 · 내 체크리스트와 min_match 개 이상 맞음 · 글쓴이 본인 아님 · 서로 차단하지 않음 ·
--       정지되지 않음 · 알림을 켠 기기가 있음 · 최근 24시간에 받은 맞춤 알림이 5개 미만
--   · roommate_alert_log: 보낸 기록 (같은 글을 두 번 알리지 않고, 하루 개수를 센다). 누구도 직접 읽을 수 없다.
--   · 알림을 보내지 못해도 글은 그대로 올라간다.

-- ── 1) 설정 ──
create table if not exists public.roommate_alerts (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  min_match       smallint not null default 10 check (min_match between 1 and 15),
  dormitory_code  text references public.dormitories (code) on update cascade on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.roommate_alerts enable row level security;

drop policy if exists "roommate_alerts: own read" on public.roommate_alerts;
create policy "roommate_alerts: own read" on public.roommate_alerts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "roommate_alerts: own insert" on public.roommate_alerts;
create policy "roommate_alerts: own insert" on public.roommate_alerts
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "roommate_alerts: own update" on public.roommate_alerts;
create policy "roommate_alerts: own update" on public.roommate_alerts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "roommate_alerts: own delete" on public.roommate_alerts;
create policy "roommate_alerts: own delete" on public.roommate_alerts
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.roommate_alerts from anon, authenticated;
grant select, delete on public.roommate_alerts to authenticated;
grant insert (min_match, dormitory_code) on public.roommate_alerts to authenticated;
grant update (min_match, dormitory_code) on public.roommate_alerts to authenticated;

create or replace function public.touch_roommate_alert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists roommate_alerts_touch on public.roommate_alerts;
create trigger roommate_alerts_touch
  before update on public.roommate_alerts
  for each row execute function public.touch_roommate_alert();

-- ── 2) 보낸 기록 ──
create table if not exists public.roommate_alert_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  post_id  uuid not null references public.roommate_posts (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists roommate_alert_log_recent_idx on public.roommate_alert_log (user_id, sent_at desc);

alter table public.roommate_alert_log enable row level security;
revoke all on public.roommate_alert_log from anon, authenticated;

-- ── 3) 새 글 → 맞는 사람의 기기로 알림 ──
create or replace function public.notify_roommate_post_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
  dorm text;
  title text;
  snippet text;
  r record;
begin
  -- 공개 · 모집 중 · 지금 모집 학기 글만
  if not new.is_open or new.is_closed
     or new.semester is distinct from public.roommate_recruit_semester()
     or public.roommate_user_suspended(new.user_id) then
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

  select d.name into dorm from public.dormitories d where d.code = new.dormitory_code;
  title := '나와 잘 맞는 룸메 글 · ' || concat_ws(' ', coalesce(dorm, new.dormitory_code), new.room_type);
  snippet := nullif(btrim(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g')), '');
  if char_length(snippet) > 60 then
    snippet := left(snippet, 60) || '…';
  end if;

  for r in
    select a.user_id, m.cnt,
           (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
            from public.push_subscriptions s where s.user_id = a.user_id) as subs
    from public.roommate_alerts a
    join public.roommate_profiles p on p.user_id = a.user_id
    cross join lateral (select public.roommate_match_count(p.checklist, new.checklist) as cnt) m
    where a.user_id <> new.user_id
      and p.gender = new.gender
      and (a.dormitory_code is null or a.dormitory_code = new.dormitory_code)
      and m.cnt >= a.min_match
      and exists (select 1 from public.push_subscriptions s where s.user_id = a.user_id)
      and not exists (
        select 1 from public.roommate_blocks b
        where (b.blocker_id = a.user_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = a.user_id)
      )
      and not public.roommate_user_suspended(a.user_id)
      and (select count(*) from public.roommate_alert_log l
           where l.user_id = a.user_id and l.sent_at > now() - interval '24 hours') < 5
    order by m.cnt desc
    limit 500
  loop
    insert into public.roommate_alert_log (user_id, post_id) values (r.user_id, new.id)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object(
        'subscriptions', r.subs,
        'notification', jsonb_build_object(
          'title', title,
          'body', '체크리스트 ' || r.cnt || '개가 나와 맞아요.' || coalesce(' ' || snippet, ''),
          'url', '/roommates?post=' || new.id,
          'tag', 'post-' || new.id
        )
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret)
    );
  end loop;
  return new;
exception when others then
  -- 알림을 보내지 못해도 글은 그대로 올라간다
  raise warning '맞춤 룸메 알림 요청 실패: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists roommate_posts_alert on public.roommate_posts;
create trigger roommate_posts_alert
  after insert on public.roommate_posts
  for each row execute function public.notify_roommate_post_alert();

revoke all on function public.touch_roommate_alert() from public, anon, authenticated;
revoke all on function public.notify_roommate_post_alert() from public, anon, authenticated;
