-- 사이트 설정 (관리자 페이지 [설정] 탭에서 켜고 끈다)
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--
--   · support_enabled: "개발자 삼각김밥 사주기"(후원) 메뉴·페이지를 보여 줄지 (기본: 켜짐)
--   · 누구나 읽을 수 있고(메뉴를 그리려면 필요), 바꾸기는 admin_set_setting 함수로 관리자만.

create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select (key, value) on public.site_settings to anon, authenticated;

drop policy if exists "site_settings: anyone read" on public.site_settings;
create policy "site_settings: anyone read" on public.site_settings
  for select to anon, authenticated
  using (true);

insert into public.site_settings (key, value) values ('support_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- 관리자만: 정해진 설정만 바꿀 수 있다 (값 형식도 확인)
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if p_key is distinct from 'support_enabled' or jsonb_typeof(p_value) is distinct from 'boolean' then
    raise exception 'invalid setting' using errcode = '22023', hint = 'invalid';
  end if;
  insert into public.site_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform public.admin_log(
    case when p_value = 'true'::jsonb then 'enable_support' else 'disable_support' end,
    'setting', p_key, jsonb_build_object('value', p_value)
  );
end;
$$;

revoke all on function public.admin_set_setting(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
