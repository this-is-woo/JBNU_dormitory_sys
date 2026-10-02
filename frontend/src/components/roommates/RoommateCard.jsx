import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { IconMoreVertical } from '../common/Icons.jsx'
import { collegeName, dormTitle, genderLabel, timeAgo } from './postFormat.js'

/** 카드 오른쪽 위 ⋯ 메뉴: 신고 · 차단 (Esc · 바깥을 누르면 닫힘) */
function CardMenu({ post, onReport, onBlock }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (fn) => {
    setOpen(false)
    fn(post)
  }

  return (
    <div className="rm-card-menu" ref={ref}>
      <button
        type="button"
        className="rm-card-menu-btn"
        aria-label="게시글 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMoreVertical width={18} height={18} />
      </button>
      {open && (
        <ul className="rm-card-menu-list" role="menu">
          {onReport && (
            <li role="none">
              <button type="button" role="menuitem" onClick={() => pick(onReport)}>
                신고하기
              </button>
            </li>
          )}
          {onBlock && (
            <li role="none">
              <button type="button" role="menuitem" className="is-danger" onClick={() => pick(onBlock)}>
                차단하기
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** 룸메이트에게 한마디: 5줄까지만 보여 주고, 넘치면 [더보기]로 펼친다 */
function Intro({ text }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // 접힌 상태에서 잘린 줄이 있는지 (카드 폭이 바뀌면 다시 잰다)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, open])

  return (
    <div className="rm-intro">
      <p ref={ref} className={`rm-intro-text${open ? ' is-open' : ''}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" className="rm-intro-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '더보기'}
        </button>
      )}
    </div>
  )
}

/**
 * 자세히 보기 창의 버튼: [채팅 보내기]를 누르면 대화창이 바로 열린다 (첫 메시지를 보내야 룸메 신청이 된다)
 * 내 글이면 [받은 신청 N](그 글의 채팅), 이미 대화 중이면 [채팅 이어 가기]
 */
export function requestButton(post, mine, sent, myGender) {
  if (mine) return { label: '받은 신청', tone: 'btn-secondary', count: post.requestCount }
  if (sent) return { label: '채팅 이어 가기', tone: 'btn-primary' }
  // 룸메이트는 같은 성별끼리만
  if (myGender && post.gender !== myGender) return { label: '같은 성별만 신청할 수 있어요', tone: 'btn-secondary', disabled: true }
  if (post.isClosed) return { label: '모집 마감', tone: 'btn-secondary', disabled: true }
  return { label: '채팅 보내기', tone: 'btn-primary' }
}

/**
 * 카드 버튼: 남의 글은 [룸메 신청] → 체크리스트 창(그 창의 [채팅 보내기]로 대화 시작).
 *   대화 중이면 [채팅 중], 마감이면 [모집 마감] · 다른 성별이면 [같은 성별만 신청할 수 있어요] 비활성
 * 내 글은 [받은 신청 N] → 그 글의 채팅 목록 (onRequest). 지난 학기 글 보기 중이면 [자세히 보기] (읽기 전용)
 */
function cardButton(post, mine, sent, myGender, archived) {
  if (archived && !mine) return { label: '자세히 보기', tone: 'btn-secondary' }
  if (mine) return requestButton(post, mine, sent, myGender)
  if (sent) return { label: '채팅 중', tone: 'btn-secondary is-sent' }
  if (myGender && post.gender !== myGender) return { label: '같은 성별만 신청할 수 있어요', tone: 'btn-secondary', disabled: true }
  if (post.isClosed) return { label: '모집 마감', tone: 'btn-secondary', disabled: true }
  return { label: '룸메 신청', tone: 'btn-primary' }
}

/**
 * match: 내 정보와 맞는 항목 수 (내 글이거나 모르면 null)
 * sent: 이 글의 글쓴이와 대화 중인지 (내가 첫 메시지를 보내 룸메 신청을 했는지)
 * myGender: 내 성별 · archived: 지난 학기 글 보기 중
 * onReport · onBlock: 남의 글 ⋯ 메뉴의 신고 · 차단 (둘 다 없으면 ⋯ 메뉴를 숨긴다), onDelete: 내 글 삭제 (없으면 버튼을 숨긴다)
 * adminLink: 관리자에게 이 글을 관리자 페이지에서 여는 [관리] 링크를 보여 준다
 */
export default memo(function RoommateCard({ post, mine, sent = false, match = null, myGender = null, archived = false, onOpen, onRequest, onEdit, onReport, onBlock, onDelete, adminLink = false }) {
  const action = cardButton(post, mine, sent, myGender, archived)
  return (
    <article className={`rm-card${post.isClosed ? ' is-closed' : ''}`}>
      <header className="rm-card-head">
        <strong className="rm-who">{dormTitle(post)}</strong>
        <div className="rm-when">
          {post.isClosed && <span className="rm-closed-badge">모집완료</span>}
          {mine && post.isOpen === false && (
            <span className="chip chip-danger" title="운영자가 숨긴 글이에요. 다른 사람에게 보이지 않아요.">
              숨겨짐
            </span>
          )}
          {mine && <span className="chip chip-primary">내 글</span>}
          {post.isSample && <span className="chip">예시</span>}
          <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
          {!mine && !post.isSample && (onReport || onBlock) && <CardMenu post={post} onReport={onReport} onBlock={onBlock} />}
        </div>
        {/* 호관 아래 한 줄: 성별 · 나이 · 단과대학 · MBTI (카드 폭 전체를 쓴다) */}
        <p className="rm-meta">
          {[genderLabel(post.gender), `${post.age}세`, collegeName(post.collegeCode), post.mbti ?? 'MBTI 비공개']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {match !== null && (
        <div className="rm-match" title="내 정보와 맞는 항목 수">
          <span className="rm-match-bar" aria-hidden="true">
            <span style={{ width: `${(match / CHECKLIST_ITEMS.length) * 100}%` }} />
          </span>
          <span className="tabular">
            나와 <strong>{match}</strong>/{CHECKLIST_ITEMS.length} 일치
          </span>
        </div>
      )}
      {post.content && <Intro text={post.content} />}

      <footer className="rm-card-foot">
        <button
          type="button"
          className={`btn btn-sm rm-request-btn ${action.tone}`}
          disabled={action.disabled}
          title={action.title}
          onClick={() => (mine ? onRequest?.(post) : onOpen(post))}
        >
          {action.label}
          {action.count > 0 && <span className="rm-request-count tabular">{action.count}</span>}
        </button>
        {/* 오른쪽 버튼 줄: 내 글이면 수정·삭제 (남의 글의 신고 · 차단은 위 ⋯ 메뉴). 관리자에게는 [관리]를 함께 */}
        <div className="rm-own-actions">
          {adminLink && !post.isSample && (
            <Link
              to={`/admin?tab=posts&q=${post.id}`}
              className="btn btn-ghost btn-sm rm-admin-btn"
              title="관리자 페이지에서 이 글 관리"
            >
              관리
            </Link>
          )}
          {mine && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(post)}>
                수정
              </button>
              {onDelete && (
                <button type="button" className="btn btn-ghost btn-sm rm-delete-btn" onClick={() => onDelete(post)}>
                  삭제
                </button>
              )}
            </>
          )}
        </div>
      </footer>
    </article>
  )
})
