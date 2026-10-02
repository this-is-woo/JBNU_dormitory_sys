-- 룸메이트 찾기 게시글: 로그인하지 않아도 읽기
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤 SQL Editor 에서 실행.
--
--   · 지금까지는 로그인하고 내 정보(체크리스트)를 등록한 사람만 글을 읽을 수 있었다 (20261008 의 "profile read").
--   · 이제 누구나 읽는다. 글쓰기 · 룸메 신청 · 신고 · 차단은 그대로 로그인(과 내 정보)이 있어야 한다.
--   · 숨긴 글(is_open = false) · 정지된 사용자의 글은 계속 글쓴이 본인에게만, 차단한 사이의 글은 서로 안 보인다.
--   · 로그인하지 않은 방문자(anon)는 화면에 쓰는 열만 읽는다. 옛 연락처 열(contact)은 내주지 않는다.

-- ── 로그인한 사용자: 내 정보 등록 여부와 상관없이 ──
drop policy if exists "roommate_posts: profile read" on public.roommate_posts;
drop policy if exists "roommate_posts: signed-in read" on public.roommate_posts;
create policy "roommate_posts: signed-in read" on public.roommate_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_open
      and not public.roommate_is_blocked(user_id)
      and not public.roommate_user_suspended(user_id)
    )
  );

-- ── 로그인하지 않은 방문자 ──
drop policy if exists "roommate_posts: public read" on public.roommate_posts;
drop policy if exists "roommate_posts: anon read" on public.roommate_posts;
create policy "roommate_posts: anon read" on public.roommate_posts
  for select to anon
  using (is_open and not public.roommate_user_suspended(user_id));

revoke select on public.roommate_posts from anon;
grant select (
  id, created_at, updated_at, user_id, dormitory_code, gender, age, college_code, mbti,
  checklist, content, semester, is_closed, is_open, request_count
) on public.roommate_posts to anon;

-- 정책 안에서 쓰는 함수 · 지난 학기 글 목록 (둘 다 게시글 읽기 정책이 그대로 적용된다)
grant execute on function public.roommate_user_suspended(uuid) to anon;
grant execute on function public.roommate_post_semesters() to anon;
