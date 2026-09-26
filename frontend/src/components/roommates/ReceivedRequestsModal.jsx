import { useEffect, useMemo, useState } from 'react'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { fetchReceivedRequests } from '../../lib/roommateRequests.js'
import { semesterLabel } from '../../lib/semester.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { CompareTable, MatchRing, SectionBars } from './MatchReport.jsx'
import { collegeName, dormName, genderLabel, matchCount, timeAgo } from './postFormat.js'

const SORTS = [
  { value: 'match', label: '잘 맞는 순' },
  { value: 'newest', label: '최신순' },
]

const postContext = (r) => [dormName(r.dormitory), r.semester && semesterLabel(r.semester)].filter(Boolean).join(' · ')

function RequestCard({ request, index, myChecklist, showPost }) {
  const [open, setOpen] = useState(false)
  const a = request.applicant
  if (!a) {
    return (
      <li className="rq-card is-gone">
        <p>체크리스트를 삭제한 신청자예요.</p>
      </li>
    )
  }
  const match = matchCount(myChecklist, a.checklist) ?? 0
  return (
    <li className={`rq-card${request.isNew ? ' is-new' : ''}`}>
      <div className="rq-card-main">
        <MatchRing match={match} />
        <div className="rq-card-body">
          <div className="rq-card-top">
            <strong>신청자 {index}</strong>
            {request.isNew && <span className="rq-new">NEW</span>}
            <time dateTime={request.createdAt}>{timeAgo(request.createdAt)}</time>
          </div>
          <div className="rq-facts">
            <span>{collegeName(a.collegeCode)}</span>
            <span>{a.age}세</span>
            <span>{genderLabel(a.gender)}</span>
            <span>{a.mbti ?? 'MBTI 비공개'}</span>
            <span>희망 {dormName(a.dormitory)}</span>
          </div>
          <p className="rq-match-line tabular">
            체크리스트 <strong>{CHECKLIST_ITEMS.length}개 중 {match}개</strong>가 나와 같아요
          </p>
          <SectionBars mine={myChecklist} theirs={a.checklist} />
        </div>
      </div>

      {showPost && (
        <p className="rq-post">
          내 글 · {postContext(request)}
          {request.postClosed && ' · 모집완료'}
        </p>
      )}

      {request.message && (
        <blockquote className="rq-quote">
          <span>한마디</span>
          {request.message}
        </blockquote>
      )}

      <button
        type="button"
        className={`rq-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '비교 접기' : `체크리스트 ${CHECKLIST_ITEMS.length}개 항목 나와 비교하기`}
      </button>
      {open && <CompareTable mine={myChecklist} theirs={a.checklist} theirLabel={`신청자 ${index}`} />}
    </li>
  )
}

/**
 * 받은 신청: 내 글에 룸메 신청을 보낸 사람들의 기본 정보 + 체크리스트 + 나와의 일치도.
 * request: { postId? }  postId 를 주면 그 글에 온 신청만
 */
export default function ReceivedRequestsModal({ request, user, myChecklist, onClose }) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [sort, setSort] = useState('match')
  const open = Boolean(request)
  const postId = request?.postId ?? null

  useEffect(() => {
    if (!request) return
    let active = true
    setState({ status: 'loading', items: [] })
    fetchReceivedRequests(user.id, postId)
      .then((items) => active && setState({ status: 'ready', items }))
      .catch((err) => active && setState({ status: 'error', items: [], message: err.message }))
    return () => {
      active = false
    }
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  // 신청자 번호는 글마다 신청한 순서대로 (정렬을 바꿔도 그대로)
  const numbered = useMemo(() => {
    const order = [...state.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const byPost = {}
    const n = new Map(order.map((r) => [r.id, (byPost[r.postId] = (byPost[r.postId] ?? 0) + 1)]))
    const withMatch = state.items.map((r) => ({
      request: r,
      index: n.get(r.id),
      match: matchCount(myChecklist, r.applicant?.checklist) ?? -1,
    }))
    if (sort === 'match') withMatch.sort((a, b) => b.match - a.match || b.request.createdAt.localeCompare(a.request.createdAt))
    return withMatch
  }, [state.items, sort, myChecklist])

  const newCount = state.items.filter((r) => r.isNew).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={postId ? '이 글에 온 신청' : '받은 신청'}
      subtitle="내 글에 룸메 신청을 보낸 사람들이에요. 체크리스트가 나와 얼마나 같은지 비교해 보세요."
    >
      {open && (
        <div className="rq">
          {state.status === 'loading' && <p className="rq-empty">불러오는 중…</p>}
          {state.status === 'error' && (
            <div className="notice notice-danger" role="alert">
              <IconAlert width={18} height={18} />
              <p>{state.message}</p>
            </div>
          )}
          {state.status === 'ready' && !state.items.length && (
            <p className="rq-empty">
              아직 받은 신청이 없어요.
              <br />
              다른 사람이 내 글에서 [룸메 신청]을 누르면 여기에 모여요.
            </p>
          )}
          {state.items.length > 0 && (
            <>
              <div className="rq-bar">
                <span className="tabular">
                  신청 <strong>{state.items.length}</strong>건{newCount > 0 && ` · 새 신청 ${newCount}건`}
                </span>
                <ChoiceGroup label="정렬" size="sm" options={SORTS} value={sort} onChange={setSort} />
              </div>
              <ul className="rq-list">
                {numbered.map(({ request: r, index }) => (
                  <RequestCard key={r.id} request={r} index={index} myChecklist={myChecklist} showPost={!postId} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
