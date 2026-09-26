-- 2026학년도 공식 생활관비 안내에 맞춘 정리 + 룸메이트 연락 방법 삭제 + 글쓴이가 댓글 작성자의 체크리스트 보기
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 뒤, 이 파일을 SQL Editor 에서 실행

-- ─────────────────────────────────────────────
-- 1) 한빛관 6인실 → 4인실 (2026학년도 2학기 생활관비 안내 기준)
--    room_eligibility · admission_cutoffs 는 on update cascade 로 함께 바뀐다.
-- ─────────────────────────────────────────────
update public.dormitory_rooms set code = 'hanbit_4', room_type = '4인실' where code = 'hanbit_6';

alter table public.admission_reports drop constraint if exists admission_reports_applied_room_check;
alter table public.admission_reports drop constraint if exists admission_reports_gender;
update public.admission_reports set applied_room = 'hanbit_4' where applied_room = 'hanbit_6';
alter table public.admission_reports add constraint admission_reports_applied_room_check check (
  applied_room in ('changui_1', 'changui_2', 'b_2', 'hanbit_4', 'chambit_2', 'hyemin_1', 'hyemin_2')
);
alter table public.admission_reports add constraint admission_reports_gender check (
  gender = '남' or (applied_room <> 'hanbit_4' and coalesce(assigned_dormitory, '') not in ('hanbit', 'daedong'))
);

-- ─────────────────────────────────────────────
-- 2) 식사 (생활관비 안내의 급식비·비고 기준)
-- ─────────────────────────────────────────────
update public.dormitories set meal_plan = '급식 없음' where code = 'changui';
update public.dormitories set meal_plan = '직영급식 (미선택 가능)' where code in ('hanbit', 'saebit', 'daedong');
update public.dormitories set meal_plan = '참빛관 식당' where code = 'chambit';
update public.dormitories set meal_plan = '급식 없음' where code = 'hyemin';
update public.dormitories set updated_at = now();

-- ─────────────────────────────────────────────
-- 3) 룸메이트 게시글의 연락 방법 삭제 — 연락은 댓글로
-- ─────────────────────────────────────────────
-- contact 를 참조하던 수정 시각 트리거를 먼저 바꾼다
create or replace function public.touch_roommate_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 댓글 수만 바뀐 경우에는 수정 시각을 건드리지 않는다
  if new.comment_count is distinct from old.comment_count
     and (new.content, new.checklist, new.is_closed, new.dormitory_code)
         is not distinct from (old.content, old.checklist, old.is_closed, old.dormitory_code) then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

alter table public.roommate_posts drop column if exists contact;

-- ─────────────────────────────────────────────
-- 4) 댓글: 글쓴이에게만 댓글 작성자의 체크리스트(프로필)를 함께 보낸다
--    반환 열이 바뀌므로 함수를 지우고 다시 만든다.
-- ─────────────────────────────────────────────
drop function if exists public.get_roommate_comments(uuid);

create function public.get_roommate_comments(p_post_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  content text,
  is_post_author boolean,
  anon_no integer,
  is_mine boolean,
  can_delete boolean,
  author_profile jsonb  -- 내가 이 글의 글쓴이이고, 다른 사람의 댓글일 때만 채워짐
)
language sql
stable
security definer
set search_path = ''
as $$
  with post as (
    select p.user_id as author
    from public.roommate_posts p
    where p.id = p_post_id
      and (p.user_id = auth.uid() or (p.is_open and exists (select 1 from public.roommate_profiles r where r.user_id = auth.uid())))
  ),
  cs as (
    select c.id, c.created_at, c.content, c.user_id
    from public.roommate_comments c
    where c.post_id = p_post_id and not c.is_hidden
  ),
  nums as (
    select cs.user_id, row_number() over (order by min(cs.created_at))::integer as n
    from cs, post
    where cs.user_id <> post.author
    group by cs.user_id
  )
  select
    cs.id,
    cs.created_at,
    cs.content,
    cs.user_id = post.author,
    coalesce(nums.n, 0),
    coalesce(cs.user_id = auth.uid(), false),
    coalesce(cs.user_id = auth.uid() or post.author = auth.uid(), false),
    case
      when post.author = auth.uid() and cs.user_id <> post.author then (
        select jsonb_build_object(
          'dormitory', r.dormitory_code,
          'gender', r.gender,
          'age', r.age,
          'collegeCode', r.college_code,
          'mbti', r.mbti,
          'checklist', r.checklist
        )
        from public.roommate_profiles r
        where r.user_id = cs.user_id
      )
    end
  from cs
  cross join post
  left join nums on nums.user_id = cs.user_id
  order by cs.created_at;
$$;

revoke all on function public.get_roommate_comments(uuid) from public;
revoke execute on function public.get_roommate_comments(uuid) from anon;
grant execute on function public.get_roommate_comments(uuid) to authenticated;
