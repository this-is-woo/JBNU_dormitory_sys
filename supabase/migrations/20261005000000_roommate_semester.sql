-- 룸메이트 게시글에 학기를 붙인다 (예: 2026-2). 사이드바에서 학기별로 보고, 다음 학기 룸메이트를 미리 구할 수 있다.
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행
--   · 이미 있는 글은 2026년 2학기로 채운다.
--   · 어떤 학기에 쓸 수 있는지(이번 학기 + 다음 학기)는 화면에서 고른다. DB 는 형식만 확인한다.

alter table public.roommate_posts add column if not exists semester text;
update public.roommate_posts set semester = '2026-2' where semester is null;
alter table public.roommate_posts alter column semester set not null;

alter table public.roommate_posts drop constraint if exists roommate_posts_semester_check;
alter table public.roommate_posts add constraint roommate_posts_semester_check check (semester ~ '^20[0-9]{2}-[12]$');

create index if not exists roommate_posts_semester_idx
  on public.roommate_posts (semester, is_closed, created_at desc);

-- 쓰기·수정 권한은 열 단위라 새 열을 추가로 허용한다 (읽기는 표 전체 권한이라 그대로)
grant insert (semester) on public.roommate_posts to authenticated;
grant update (semester) on public.roommate_posts to authenticated;
