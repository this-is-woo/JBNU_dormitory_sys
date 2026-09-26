-- 룸메이트 찾기: 로그인하지 않아도 게시글을 볼 수 있게 한다.
-- 적용 방법: 20260927000000_roommates.sql 을 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--   · 읽기: 누구나 (관리자가 숨긴 글 is_open = false 는 제외)
--   · 쓰기·수정·삭제·모집완료: 지금처럼 로그인한 글쓴이만 (20260927000000_roommates.sql 의 정책 그대로)

drop policy if exists "roommate_posts: signed-in read" on public.roommate_posts;
drop policy if exists "roommate_posts: public read" on public.roommate_posts;
create policy "roommate_posts: public read" on public.roommate_posts
  for select to anon, authenticated
  using (is_open or user_id = (select auth.uid()));

grant select on public.roommate_posts to anon;
