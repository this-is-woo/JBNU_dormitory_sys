-- 점수 계산 기록: 같은 IP 에서 반복해서 쌓인 기록을 구분한다
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
-- IP 주소는 저장하지 않는다. 대신 "비밀 값 + IP" 를 SHA-256 으로 바꾼 앞 10글자(client_key)만 남긴다.
--   · 같은 IP 면 같은 키가 되므로 반복 기록을 묶어 볼 수 있지만, 키로 IP 를 되찾을 수는 없다
--     (비밀 값은 private 스키마에 있어 API 로 읽을 수 없다)
--   · 키는 브라우저가 보낼 수 없고(열 권한 없음), 저장할 때 DB 트리거가 요청 헤더의 IP 로 채운다
--   · 이 마이그레이션 전의 기록과 IP 를 알 수 없는 요청은 키가 비어 있다
-- 관리자 페이지:
--   · 기록 > 점수 계산: 기록마다 키와 "같은 키의 기록 수", 키를 누르면 그 키의 기록만 (admin_list_activity 의 p_client)
--   · 학점 통계: "같은 IP 는 최근 1건만" 으로 볼 수 있다 (admin_gpa_stats 의 p_one_per_client)

-- ── 1) 비밀 값 (API 로 노출되지 않는 private 스키마) ──
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  key    text primary key,
  value  text not null
);
revoke all on private.app_secrets from public, anon, authenticated;

insert into private.app_secrets (key, value)
values ('client_key_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ── 2) 기록에 키 열 + 저장할 때 채우는 트리거 ──
alter table public.score_submissions add column if not exists client_key text;
create index if not exists score_submissions_client_key_idx
  on public.score_submissions (client_key, created_at desc);

-- 요청한 사람의 IP: Cloudflare 가 붙이는 cf-connecting-ip → x-real-ip → x-forwarded-for 의 첫 값
create or replace function private.request_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  headers jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return nullif(btrim(coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    split_part(headers ->> 'x-forwarded-for', ',', 1)
  )), '');
end;
$$;

create or replace function public.score_submission_client_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ip text := private.request_ip();
  salt text;
begin
  new.client_key := null;
  if ip is not null then
    select s.value into salt from private.app_secrets s where s.key = 'client_key_salt';
    if salt is not null then
      new.client_key := left(encode(sha256(convert_to(salt || '|' || ip, 'UTF8')), 'hex'), 10);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.request_ip() from public, anon, authenticated;
revoke all on function public.score_submission_client_key() from public, anon, authenticated;

drop trigger if exists score_submissions_client_key on public.score_submissions;
create trigger score_submissions_client_key
  before insert on public.score_submissions
  for each row execute function public.score_submission_client_key();

-- ── 3) 관리자 기록 목록: 키로 걸러 보기 + 같은 키의 기록 수 ──
-- 20261010000000_admin.sql 8) 과 같고, scores 에 p_client(키) 와 client_count 를 더했다
drop function if exists public.admin_list_activity(text, integer, integer);
create function public.admin_list_activity(
  p_kind text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_client text default null
)
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
      'total', (select count(*) from public.score_submissions s where p_client is null or s.client_key = p_client),
      'items', coalesce((
        select jsonb_agg(
          to_jsonb(s) || jsonb_build_object(
            'client_count',
            case when s.client_key is null then null
                 else (select count(*) from public.score_submissions c where c.client_key = s.client_key) end
          )
          order by s.created_at desc
        )
        from (
          select * from public.score_submissions s
          where p_client is null or s.client_key = p_client
          order by s.created_at desc
          limit lim offset off
        ) s
      ), '[]'::jsonb)
    );
  elsif p_kind = 'predictions' then
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

revoke all on function public.admin_list_activity(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_list_activity(text, integer, integer, text) to authenticated;

-- ── 4) 학점 통계: 같은 IP 는 최근 1건만 셀 수 있게 ──
-- 20261012000000_score_gender_gpa_stats.sql 2) 와 같고, p_one_per_client 와 repeat_excluded 를 더했다
--   · p_one_per_client = true: 기간 안에서 키마다 가장 최근 기록 1건만 (키가 없는 기록은 모두)
--   · repeat_excluded: 그렇게 해서 빠진 기록 수 (false 면 0)
drop function if exists public.admin_gpa_stats(integer, text);
create function public.admin_gpa_stats(
  p_days integer default null,
  p_gender text default null,
  p_one_per_client boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  result jsonb;
begin
  perform public.admin_guard();
  if (p_days is not null and p_days not between 1 and 3650)
     or (p_gender is not null and p_gender not in ('남', '여')) then
    raise exception 'invalid filter' using errcode = '22023', hint = 'invalid';
  end if;
  if p_days is not null then
    since := now() - make_interval(days => p_days);
  end if;

  with base as (
    select
      s.college_code,
      s.gender,
      s.gpa,
      s.client_key,
      row_number() over (partition by s.client_key order by s.created_at desc, s.id) as nth
    from public.score_submissions s
    where since is null or s.created_at >= since
  ),
  period as (
    select b.college_code, b.gender, b.gpa
    from base b
    where not coalesce(p_one_per_client, false) or b.client_key is null or b.nth = 1
  ),
  picked as (
    select p.college_code, p.gpa
    from period p
    where p_gender is null or p.gender = p_gender
  ),
  stats as (
    select
      grouping(p.college_code) = 1 as is_total,
      p.college_code,
      jsonb_build_object(
        'n',      count(*),
        'mean',   round(avg(p.gpa), 2),
        'min',    min(p.gpa),
        'q1',     round((percentile_cont(0.25) within group (order by p.gpa::double precision))::numeric, 2),
        'median', round((percentile_cont(0.5) within group (order by p.gpa::double precision))::numeric, 2),
        'q3',     round((percentile_cont(0.75) within group (order by p.gpa::double precision))::numeric, 2),
        'max',    max(p.gpa)
      ) as body
    from picked p
    group by grouping sets ((p.college_code), ())
  )
  select jsonb_build_object(
    'total',           (select count(*) from picked),
    'no_gender',       (select count(*) from period p where p.gender is null),
    'repeat_excluded', (select count(*) from base) - (select count(*) from period),
    'overall',         (select s.body from stats s where s.is_total),
    'colleges',        coalesce((
      select jsonb_agg(s.body || jsonb_build_object('college_code', s.college_code) order by s.college_code)
      from stats s
      where not s.is_total
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_gpa_stats(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_gpa_stats(integer, text, boolean) to authenticated;
