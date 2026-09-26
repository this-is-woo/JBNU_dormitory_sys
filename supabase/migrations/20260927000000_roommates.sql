-- 룸메이트 찾기 게시글
-- 적용 방법: 20260926000000_init.sql 을 먼저 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--   (이전 버전(비밀 토큰 방식)을 이미 실행했다면 아래 한 줄을 먼저 실행해 테이블을 지운 뒤 다시 실행)
--   drop table if exists public.roommate_posts cascade;
--
-- 구글 로그인(Supabase Auth)한 사용자만 이용하는 게시판이다.
--   · 읽기: 로그인한 사용자만
--   · 쓰기: user_id 는 auth.uid() 로 자동으로 채워지고, 다른 사람 이름으로는 쓸 수 없다.
--   · 수정·삭제·모집완료: 글쓴이(user_id = auth.uid())만
--   · 입력값은 CHECK 제약으로 검증한다.
--   · 부적절한 글은 Supabase Dashboard 에서 is_open 을 false 로 바꿔 숨긴다. (사용자는 is_open 을 바꿀 수 없음)

create table if not exists public.roommate_posts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dormitory_code  text not null references public.dormitories (code) on update cascade,
  gender          text not null check (gender in ('남', '여')),
  age             smallint not null check (age between 17 and 60),
  college_code    text not null references public.colleges (code) on update cascade,
  mbti            text check (mbti ~ '^[EI][SN][TF][JP]$'),  -- 모르면 null
  -- 「전북대 룸메이트 체크리스트」 답변 (frontend/src/data/roommateChecklist.js)
  -- 예: { "smoking": false, "bedtime": "11-12시", "roomCleaning": "일주일에 한 번", ... }
  checklist       jsonb not null check (jsonb_typeof(checklist) = 'object'),
  content         text not null default '' check (char_length(content) <= 1000),  -- 자기소개 (선택)
  contact         text not null check (char_length(contact) between 2 and 200),  -- 오픈채팅 링크 등
  is_closed       boolean not null default false,  -- 글쓴이가 표시한 모집완료
  is_open         boolean not null default true    -- false 면 관리자가 숨긴 글
);

create index if not exists roommate_posts_created_at_idx on public.roommate_posts (created_at desc);
create index if not exists roommate_posts_user_id_idx on public.roommate_posts (user_id);

-- 수정 시각 자동 기록
create or replace function public.touch_roommate_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists roommate_posts_touch on public.roommate_posts;
create trigger roommate_posts_touch
  before update on public.roommate_posts
  for each row execute function public.touch_roommate_post();

alter table public.roommate_posts enable row level security;

drop policy if exists "roommate_posts: public read" on public.roommate_posts;
drop policy if exists "roommate_posts: public insert" on public.roommate_posts;

drop policy if exists "roommate_posts: signed-in read" on public.roommate_posts;
create policy "roommate_posts: signed-in read" on public.roommate_posts
  for select to authenticated
  using (is_open or user_id = (select auth.uid()));

drop policy if exists "roommate_posts: owner insert" on public.roommate_posts;
create policy "roommate_posts: owner insert" on public.roommate_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "roommate_posts: owner update" on public.roommate_posts;
create policy "roommate_posts: owner update" on public.roommate_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "roommate_posts: owner delete" on public.roommate_posts;
create policy "roommate_posts: owner delete" on public.roommate_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 로그인하지 않은 사용자(anon)는 아무것도 할 수 없고,
-- 로그인한 사용자도 user_id · is_open · created_at 은 직접 바꿀 수 없다.
revoke all on public.roommate_posts from anon, authenticated;
grant select on public.roommate_posts to authenticated;
grant insert (dormitory_code, gender, age, college_code, mbti, checklist, content, contact)
  on public.roommate_posts to authenticated;
grant update (dormitory_code, gender, age, college_code, mbti, checklist, content, contact, is_closed)
  on public.roommate_posts to authenticated;
grant delete on public.roommate_posts to authenticated;

-- 이전 버전(비밀 토큰 방식)의 함수 정리
drop function if exists public.delete_roommate_post(uuid, text);
drop function if exists public.set_roommate_post_closed(uuid, text, boolean);
