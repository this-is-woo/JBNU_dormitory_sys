import { useEffect, useMemo, useState } from 'react'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import {
  REPLY_MAX,
  blockApplicant,
  cancelRequest,
  fetchBlocks,
  fetchReceivedRequests,
  fetchSentRequests,
  replyToRequest,
  unblock,
} from '../../lib/roommateRequests.js'
import { reportRequest } from '../../lib/roommateReports.js'
import { semesterLabel } from '../../lib/semester.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import BlockConfirmModal from './BlockConfirmModal.jsx'
import ReportModal from './ReportModal.jsx'
import { CompareTable } from './MatchReport.jsx'
import { collegeName, dormName, genderLabel, matchCount, timeAgo } from './postFormat.js'

const TABS = [
  { value: 'received', label: '받은 신청' },
  { value: 'sent', label: '보낸 신청' },
  { value: 'blocks', label: '차단 목록' },
]

const SORTS = [
  { value: 'match', label: '잘 맞는 순' },
  { value: 'newest', label: '최신순' },
]

const postContext = (r) => [dormName(r.dormitory), r.semester && `${semesterLabel(r.semester)} 입주`].filter(Boolean).join(' · ')

function ErrorNotice({ message }) {
  return (
    <div className="notice notice-danger" role="alert">
      <IconAlert width={18} height={18} />
      <p>{message}</p>
    </div>
  )
}

/** 답장 쓰기 / 보기 (글쓴이) */
function ReplyBox({ request, userId, onSaved, onCancel }) {
  // 답장이 없으면 바로 쓰기 창으로 연다
  const [editing, setEditing] = useState(!request.reply)
  const [draft, setDraft] = useState(request.reply ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function save(text) {
    setPending(true)
    setError('')
    try {
      onSaved(await replyToRequest(request.id, text, userId))
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <div className="rq-reply-edit">
        <textarea
          className="input"
          rows={3}
          maxLength={REPLY_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="신청자에게 보낼 답장이에요. 오픈채팅 링크나 연락 가능한 시간을 남겨 보세요. 신청자에게만 보여요."
          autoFocus
        />
        {error && <p className="rm-error">{error}</p>}
        <div className="rq-reply-actions">
          <span className="tabular">
            {draft.length}/{REPLY_MAX}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (request.reply ? setEditing(false) : onCancel())}>
            취소
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || !draft.trim()} onClick={() => save(draft)}>
            {request.reply ? '고쳐 보내기' : '답장 보내기'}
          </button>
        </div>
      </div>
    )
  }

  if (request.reply) {
    return (
      <div className="rq-reply is-mine">
        <div className="rq-reply-head">
          <span>내 답장</span>
          <time dateTime={request.repliedAt}>{timeAgo(request.repliedAt)}</time>
          <button type="button" className="rq-link" onClick={() => setEditing(true)}>
            수정
          </button>
          <button type="button" className="rq-link" disabled={pending} onClick={() => save('')}>
            삭제
          </button>
        </div>
        <p>{request.reply}</p>
        {error && <p className="rm-error">{error}</p>}
      </div>
    )
  }
  return null
}

function ReceivedCard({ request, index, userId, myChecklist, showPost, onReplied, onBlock, onReport }) {
  const [open, setOpen] = useState(false)
  const [replying, setReplying] = useState(false)
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

      {(replying || request.reply) && (
        <ReplyBox
          key={request.repliedAt ?? 'new'}
          request={request}
          userId={userId}
          onCancel={() => setReplying(false)}
          onSaved={(saved) => {
            onReplied(request.id, saved)
            setReplying(false)
          }}
        />
      )}

      <div className="rq-card-actions">
        <button
          type="button"
          className={`rq-toggle${open ? ' is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? '비교 접기' : `${CHECKLIST_ITEMS.length}개 항목 나와 비교하기`}
        </button>
        {!request.reply && !replying && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setReplying(true)}>
            답장하기
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm rq-block" onClick={() => onReport(request, index)}>
          신고
        </button>
        <button type="button" className="btn btn-ghost btn-sm rq-danger" onClick={() => onBlock(request, index)}>
          차단
        </button>
      </div>
      {open && <CompareTable mine={myChecklist} theirs={a.checklist} theirLabel={`신청자 ${index}`} />}
    </li>
  )
}

function SentCard({ request, userId, onCanceled }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const a = request.author ?? {}

  async function cancel() {
    try {
      await cancelRequest(request.postId, userId)
      onCanceled(request)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <li className={`rq-card${request.replyIsNew ? ' is-new' : ''}`}>
      <div className="rq-card-top">
        <strong>{postContext(request) || '삭제된 글'}</strong>
        {request.postClosed && <span className="rm-closed-badge">모집완료</span>}
        <time dateTime={request.createdAt}>{timeAgo(request.createdAt)} 신청</time>
      </div>
      {a.gender && (
        <div className="rq-facts">
          <span>{collegeName(a.collegeCode)}</span>
          <span>{a.age}세</span>
          <span>{genderLabel(a.gender)}</span>
          <span>{a.mbti ?? 'MBTI 비공개'}</span>
        </div>
      )}
      {request.message && (
        <blockquote className="rq-quote">
          <span>내 한마디</span>
          {request.message}
        </blockquote>
      )}
      {request.reply ? (
        <div className="rq-reply">
          <div className="rq-reply-head">
            <span>글쓴이의 답장</span>
            {request.replyIsNew && <span className="rq-new">NEW</span>}
            <time dateTime={request.repliedAt}>{timeAgo(request.repliedAt)}</time>
          </div>
          <p>{request.reply}</p>
        </div>
      ) : (
        <p className="rq-waiting">아직 답장이 없어요. 글쓴이가 확인하면 여기에 답장이 보여요.</p>
      )}
      {error && <p className="rm-error">{error}</p>}
      <div className="rq-card-actions">
        {confirming ? (
          <>
            <span className="my-post-confirm">신청을 취소할까요?</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              아니요
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={cancel}>
              신청 취소
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
            신청 취소
          </button>
        )}
      </div>
    </li>
  )
}

function useList(loader, deps) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  useEffect(() => {
    let active = true
    setState({ status: 'loading', items: [] })
    loader()
      .then((items) => active && setState({ status: 'ready', items }))
      .catch((err) => active && setState({ status: 'error', items: [], message: err.message }))
    return () => {
      active = false
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [state, setState]
}

function ReceivedTab({ postId, user, myChecklist, onBlocked }) {
  const [state, setState] = useList(() => fetchReceivedRequests(user.id, postId), [postId])
  const [sort, setSort] = useState('match')
  const [blockTarget, setBlockTarget] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)

  // 신청자 번호는 글마다 신청한 순서대로 (정렬을 바꿔도 그대로)
  const rows = useMemo(() => {
    const order = [...state.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const byPost = {}
    const n = new Map(order.map((r) => [r.id, (byPost[r.postId] = (byPost[r.postId] ?? 0) + 1)]))
    const list = state.items.map((r) => ({ request: r, index: n.get(r.id), match: matchCount(myChecklist, r.applicant?.checklist) ?? -1 }))
    if (sort === 'match') list.sort((a, b) => b.match - a.match || b.request.createdAt.localeCompare(a.request.createdAt))
    return list
  }, [state.items, sort, myChecklist])

  const replied = (id, saved) =>
    setState((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? { ...r, ...saved } : r)) }))

  // 신고 (+ 원하면 함께 차단)
  async function report({ reason, detail, block: alsoBlock }) {
    const { request } = reportTarget
    await reportRequest(request, reason, detail, user.id)
    if (alsoBlock) {
      await blockApplicant(request, user.id)
      setState((s) => ({ ...s, items: s.items.filter((r) => r.id !== request.id) }))
      onBlocked()
    }
  }

  async function block() {
    await blockApplicant(blockTarget.request, user.id)
    setState((s) => ({ ...s, items: s.items.filter((r) => r.id !== blockTarget.request.id) }))
    setBlockTarget(null)
    onBlocked()
  }

  if (state.status === 'loading') return <p className="rq-empty">불러오는 중…</p>
  if (state.status === 'error') return <ErrorNotice message={state.message} />
  const newCount = state.items.filter((r) => r.isNew).length
  return (
    <>
      {!state.items.length ? (
        <p className="rq-empty">
          아직 받은 신청이 없어요.
          <br />
          다른 사람이 내 글에서 [룸메 신청]을 누르면 여기에 모여요.
        </p>
      ) : (
        <>
          <div className="rq-bar">
            <span className="tabular">
              신청 <strong>{state.items.length}</strong>건{newCount > 0 && ` · 새 신청 ${newCount}건`}
            </span>
            <ChoiceGroup label="정렬" size="sm" options={SORTS} value={sort} onChange={setSort} />
          </div>
          <ul className="rq-list">
            {rows.map(({ request: r, index }) => (
              <ReceivedCard
                key={r.id}
                request={r}
                index={index}
                userId={user.id}
                myChecklist={myChecklist}
                showPost={!postId}
                onReplied={replied}
                onBlock={(request, i) => setBlockTarget({ request, index: i })}
                onReport={(request, i) => setReportTarget({ request, index: i })}
              />
            ))}
          </ul>
        </>
      )}
      <BlockConfirmModal
        key={blockTarget?.request.id ?? 'none'}
        target={
          blockTarget && {
            title: '이 신청자를 차단할까요?',
            context: `신청자 ${blockTarget.index} · 받은 신청 · ${postContext(blockTarget.request)}`,
          }
        }
        onClose={() => setBlockTarget(null)}
        onConfirm={block}
      />
      <ReportModal
        key={reportTarget ? `report-${reportTarget.request.id}` : 'report'}
        target={
          reportTarget && {
            title: '이 신청을 신고할까요?',
            context: `신청자 ${reportTarget.index} · 받은 신청 · ${postContext(reportTarget.request)}`,
          }
        }
        onClose={() => setReportTarget(null)}
        onSubmit={report}
      />
    </>
  )
}

function SentTab({ user, onCanceled }) {
  const [state, setState] = useList(() => fetchSentRequests(user.id), [])
  if (state.status === 'loading') return <p className="rq-empty">불러오는 중…</p>
  if (state.status === 'error') return <ErrorNotice message={state.message} />
  if (!state.items.length) {
    return (
      <p className="rq-empty">
        아직 보낸 신청이 없어요.
        <br />
        마음에 드는 글에서 [룸메 신청]을 보내 보세요.
      </p>
    )
  }
  return (
    <ul className="rq-list">
      {state.items.map((r) => (
        <SentCard
          key={r.id}
          request={r}
          userId={user.id}
          onCanceled={(req) => {
            setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== req.id) }))
            onCanceled(req.postId)
          }}
        />
      ))}
    </ul>
  )
}

function BlocksTab({ user, onUnblocked }) {
  const [state, setState] = useList(() => fetchBlocks(user.id), [])
  const [error, setError] = useState('')

  async function release(id) {
    try {
      await unblock(id, user.id)
      setState((s) => ({ ...s, items: s.items.filter((b) => b.id !== id) }))
      onUnblocked()
    } catch (err) {
      setError(err.message)
    }
  }

  if (state.status === 'loading') return <p className="rq-empty">불러오는 중…</p>
  if (state.status === 'error') return <ErrorNotice message={state.message} />
  return (
    <>
      <p className="rq-hint">서로 익명이라 누구인지 대신 어디서 차단했는지만 보여요. 해제하면 서로의 글이 다시 보여요.</p>
      {error && <p className="rm-error">{error}</p>}
      {!state.items.length ? (
        <p className="rq-empty">차단한 사용자가 없어요.</p>
      ) : (
        <ul className="rq-blocks">
          {state.items.map((b) => (
            <li key={b.id}>
              <div>
                <strong>{b.context || '차단한 사용자'}</strong>
                <time dateTime={b.createdAt}>{timeAgo(b.createdAt)} 차단</time>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => release(b.id)}>
                해제
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * 신청 내역: 받은 신청 / 보낸 신청 / 차단 목록.
 * request: { tab?: 'received' | 'sent' | 'blocks', postId? }  postId 를 주면 그 글에 온 신청만
 * counts: { requests, replies }  탭에 새 소식 수를 표시
 * onChanged(kind): 'blocked' | 'unblocked' | 'canceled' — 게시판을 다시 불러오도록
 */
export default function RequestsInboxModal({ request, user, myChecklist, counts, onClose, onChanged, onCanceled }) {
  const [tab, setTab] = useState('received')
  const open = Boolean(request)
  const postId = request?.postId ?? null

  useEffect(() => {
    if (request) setTab(request.tab ?? 'received')
  }, [request])

  const tabs = postId
    ? null
    : TABS.map((t) => {
        const n = t.value === 'received' ? counts.requests : t.value === 'sent' ? counts.replies : 0
        return { ...t, label: n > 0 ? `${t.label} · ${n}` : t.label }
      })

  const subtitle = {
    received: '내 글에 룸메 신청을 보낸 사람들이에요. 체크리스트를 나와 비교하고 답장을 보내 보세요.',
    sent: '내가 보낸 신청과 글쓴이의 답장이에요.',
    blocks: '내가 차단한 사용자예요.',
  }[postId ? 'received' : tab]

  return (
    <Modal open={open} onClose={onClose} size="lg" title={postId ? '이 글에 온 신청' : '신청 내역'} subtitle={subtitle}>
      {open && (
        <div className="rq">
          {tabs && <ChoiceGroup label="신청 내역 보기" options={tabs} value={tab} onChange={setTab} />}
          {(postId || tab === 'received') && (
            <ReceivedTab
              key={`received-${postId}`}
              postId={postId}
              user={user}
              myChecklist={myChecklist}
              onBlocked={() => onChanged('blocked')}
            />
          )}
          {!postId && tab === 'sent' && <SentTab user={user} onCanceled={onCanceled} />}
          {!postId && tab === 'blocks' && <BlocksTab user={user} onUnblocked={() => onChanged('unblocked')} />}
        </div>
      )}
    </Modal>
  )
}
