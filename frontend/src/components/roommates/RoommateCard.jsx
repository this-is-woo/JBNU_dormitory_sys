import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { collegeName, dormName, genderLabel, timeAgo } from './postFormat.js'

/** 자기소개: 5줄까지만 보여 주고, 넘치면 [더보기]로 펼친다 */
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

/** 카드·자세히 보기 공통: 룸메 신청 버튼의 문구와 모양 */
export function requestButton(post, mine, sent, myGender) {
  if (mine) return { label: '받은 신청', tone: 'btn-secondary', count: post.requestCount }
  if (sent) return { label: '신청함 ✓', tone: 'btn-secondary is-sent' }
  // 룸메이트는 같은 성별끼리만
  if (myGender && post.gender !== myGender) return { label: '같은 성별만 신청 가능', tone: 'btn-secondary', disabled: true }
  if (post.isClosed) return { label: '모집 마감', tone: 'btn-secondary', disabled: true }
  return { label: '룸메 신청', tone: 'btn-primary' }
}

/**
 * match: 내 정보와 맞는 항목 수 (내 글이거나 모르면 null)
 * sent: 내가 이 글에 룸메 신청을 보냈는지 (버튼이 [신청함 ✓])
 * myGender: 내 성별. 다른 성별의 글이면 [룸메 신청]을 처음부터 누를 수 없다
 * archived: 지난 학기 글 보기 중이면 신청 대신 [자세히 보기] (읽기 전용)
 * 카드 버튼 (cardButton):
 *   · 남의 글: [룸메 신청] → 체크리스트 창을 열고, 그 창 아래 [룸메 신청]으로 보낸다 (체크리스트를 보고 신청하도록)
 *     보낸 글은 [신청함 ✓] (창에서 취소 가능), 마감이면 [모집 마감] · 다른 성별이면 [룸메 신청] 비활성
 *   · 내 글: [받은 신청 N] → 신청 내역 (onRequest)
 * onReport: 남의 글 신고 (없으면 버튼을 숨긴다), onDelete: 내 글 삭제 (없으면 버튼을 숨긴다)
 * adminLink: 관리자에게 이 글을 관리자 페이지에서 여는 [관리] 링크를 보여 준다
 */
function cardButton(post, mine, sent, myGender, archived) {
  if (archived && !mine) return { label: '자세히 보기', tone: 'btn-secondary' }
  const base = requestButton(post, mine, sent, myGender)
  // 카드에서는 문구를 짧게: 다른 성별이면 [룸메 신청]을 비활성으로 (이유는 마우스를 올리면)
  if (!mine && !sent && myGender && post.gender !== myGender) {
    return { label: '룸메 신청', tone: 'btn-primary', disabled: true, title: '룸메이트는 같은 성별끼리만 신청할 수 있어요.' }
  }
  return base
}

export default function RoommateCard({ post, mine, sent = false, match = null, myGender = null, archived = false, onOpen, onRequest, onEdit, onReport, onDelete, adminLink = false }) {
  const action = cardButton(post, mine, sent, myGender, archived)
  return (
    <article className={`rm-card${post.isClosed ? ' is-closed' : ''}`}>
      <header className="rm-card-head">
        <strong className="rm-who">{dormName(post.dormitory)}</strong>
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
        {/* 오른쪽 버튼 줄: 내 글이면 수정·삭제, 남의 글이면 신고. 관리자에게는 [관리]를 함께 */}
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
          {mine ? (
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
          ) : (
            onReport && (
              <button type="button" className="btn btn-ghost btn-sm rm-report-btn" onClick={() => onReport(post)}>
                신고
              </button>
            )
          )}
        </div>
      </footer>
    </article>
  )
}
