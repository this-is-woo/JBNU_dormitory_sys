import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Composer from '../components/chat/Composer.jsx'
import MessageList from '../components/chat/MessageList.jsx'
import { counterpartRole, threadContext, threadTitle } from '../components/chat/chatFormat.js'
import { IconAlert, IconArrowLeft, IconChevronRight, IconMore } from '../components/common/Icons.jsx'
import Modal from '../components/common/Modal.jsx'
import BlockConfirmModal from '../components/roommates/BlockConfirmModal.jsx'
import { CompareTable } from '../components/roommates/MatchReport.jsx'
import ReportModal from '../components/roommates/ReportModal.jsx'
import { collegeName, dormName, genderLabel } from '../components/roommates/postFormat.js'
import { useAuth } from '../hooks/useAuth.js'
import { fetchMessages, fetchThread, markRead, sendMessage, subscribeMessages } from '../lib/roommateChat.js'
import { fetchMyProfile } from '../lib/roommateProfile.js'
import { fetchMyStatus, reportThread } from '../lib/roommateReports.js'
import { announceInboxCounts, blockCounterpart, cancelRequest, fetchInboxCounts } from '../lib/roommateRequests.js'
import { semesterLabel } from '../lib/semester.js'
import { ChatGate } from './ChatListPage.jsx'
import './ChatPage.css'

// 실시간 연결이 끊겼을 때만, 화면이 보이는 동안 이 간격으로 새 메시지를 확인한다
const FALLBACK_POLL_MS = 4000

const mergeMessages = (list, more) => {
  const byId = new Map(list.map((m) => [m.id, m]))
  for (const m of more) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** 대화 맨 위의 게시물 카드: 어떤 글의 신청인지 + [게시물 바로가기] + 체크리스트 비교 */
function PostCard({ thread, myChecklist }) {
  const [open, setOpen] = useState(false)
  const c = thread.counterpart
  const facts = c && [collegeName(c.collegeCode), c.age && `${c.age}세`, genderLabel(c.gender), c.mbti ?? 'MBTI 비공개']
  const state = !thread.postOpen ? '숨겨진 글' : thread.postClosed ? '모집완료' : '모집 중'
  return (
    <section className="chat-post">
      <p className="chat-post-kicker">
        룸메이트 찾기{thread.semester && ` · ${semesterLabel(thread.semester)}`}
      </p>
      <p className="chat-post-title">
        {thread.role === 'author' ? '내 글' : '신청한 글'} · {dormName(thread.dormitory)} 룸메이트
        <span className={`chat-post-state${thread.postClosed || !thread.postOpen ? ' is-off' : ''}`}>{state}</span>
      </p>
      <div className="chat-post-actions">
        <Link to={`/roommates?post=${thread.postId}`} className="btn btn-secondary btn-sm">
          게시물 바로가기
        </Link>
        {c && (
          <button
            type="button"
            className={`btn btn-ghost btn-sm chat-compare-toggle${open ? ' is-open' : ''}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {counterpartRole(thread)} 정보·체크리스트
            <IconChevronRight width={16} height={16} />
          </button>
        )}
      </div>
      {open && c && (
        <div className="chat-compare">
          <div className="rq-facts">
            {facts.filter(Boolean).map((f) => (
              <span key={f}>{f}</span>
            ))}
            {thread.role === 'author' && c.dormitory && <span>희망 {dormName(c.dormitory)}</span>}
          </div>
          {myChecklist ? (
            <CompareTable mine={myChecklist} theirs={c.checklist} theirLabel={counterpartRole(thread)} />
          ) : (
            <p className="chat-empty">내 정보를 등록하면 체크리스트를 나와 비교할 수 있어요.</p>
          )}
        </div>
      )}
    </section>
  )
}

/** ⋯ 메뉴: 신고 · 차단 · (보낸 신청이면) 신청 취소 */
function RoomMenu({ thread, onPick }) {
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

  const pick = (action) => {
    setOpen(false)
    onPick(action)
  }

  return (
    <div className="chat-menu" ref={ref}>
      <button
        type="button"
        className="chat-icon-btn"
        aria-label="대화 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore width={20} height={20} />
      </button>
      {open && (
        <ul className="chat-menu-list" role="menu">
          <li role="none">
            <button type="button" role="menuitem" onClick={() => pick('report')}>
              신고하기
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => pick('block')}>
              차단하기
            </button>
          </li>
          {thread.role === 'applicant' && (
            <li role="none">
              <button type="button" role="menuitem" className="is-danger" onClick={() => pick('cancel')}>
                신청 취소
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * 대화방: 룸메 신청 하나에 대한 신청자 ↔ 글쓴이 1:1 대화.
 * 새 메시지는 Supabase Realtime 으로 바로 받고, 연결이 끊기면 화면이 보일 때만 몇 초마다 확인한다.
 */
export default function ChatRoomPage() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { status: authStatus, user } = useAuth()
  const signedIn = authStatus === 'signedIn'
  const [thread, setThread] = useState({ status: 'loading', data: null })
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [pending, setPending] = useState([])
  const [live, setLive] = useState('live')
  const [myChecklist, setMyChecklist] = useState(null)
  const [suspended, setSuspended] = useState(false)
  const [action, setAction] = useState(null) // 'report' | 'block' | 'cancel'
  const [cancelError, setCancelError] = useState('')
  // 신고하면서 차단까지 했으면 대화가 지워졌으므로, 신고 창을 닫을 때 목록으로 돌아간다
  const leaveOnClose = useRef(false)
  const lastIdRef = useRef(null)
  const readTimer = useRef(null)
  const t = thread.data

  lastIdRef.current = messages.at(-1)?.id ?? null

  // 대화방 정보 + 최근 메시지 + 내 체크리스트(비교용) + 정지 여부
  useEffect(() => {
    if (!signedIn) return
    let active = true
    setThread({ status: 'loading', data: null })
    setMessages([])
    setPending([])
    Promise.all([fetchThread(requestId, user.id), fetchMessages(requestId)])
      .then(([data, page]) => {
        if (!active) return
        if (!data) return setThread({ status: 'missing', data: null })
        setThread({ status: 'ready', data })
        setMessages(page.messages)
        setHasMore(page.hasMore)
      })
      .catch((err) => active && setThread({ status: 'error', data: null, message: err.message }))
    fetchMyProfile(user.id)
      .then((p) => active && setMyChecklist(p?.checklist ?? null))
      .catch(() => {})
    fetchMyStatus(user.id)
      .then((s) => active && setSuspended(Boolean(s?.suspended)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [signedIn, user?.id, requestId])

  // 놓친 새 메시지 확인 (다른 탭에서 돌아왔을 때 · 실시간 연결이 끊겼을 때)
  const catchUp = useCallback(async () => {
    if (lastIdRef.current == null) return
    try {
      const { messages: more } = await fetchMessages(requestId, { after: lastIdRef.current })
      if (more.length) setMessages((list) => mergeMessages(list, more))
    } catch {
      // 다음 확인 때 다시
    }
  }, [requestId])

  // 실시간: 이 대화방의 새 메시지
  const ready = thread.status === 'ready'
  useEffect(() => {
    if (!ready) return
    return subscribeMessages({
      requestId,
      onInsert: (m) => setMessages((list) => mergeMessages(list, [m])),
      onStatus: (s) => {
        setLive(s)
        // 다시 연결되면 끊긴 사이의 메시지를 채운다
        if (s === 'live') catchUp()
      },
    })
  }, [ready, requestId, catchUp])

  // 실시간 연결이 끊긴 동안에만: 화면이 보일 때 몇 초마다 확인
  useEffect(() => {
    if (!ready || live === 'live') return
    const id = setInterval(() => document.visibilityState === 'visible' && catchUp(), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [ready, live, catchUp])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && catchUp()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [catchUp])

  // 보고 있는 동안 온 메시지는 읽음으로 (잠깐 모아서 한 번에). 헤더의 새 소식 표시도 맞춘다
  const lastId = messages.at(-1)?.id ?? null
  useEffect(() => {
    if (!ready || lastId == null) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      markRead(requestId, lastId, user.id)
        .then(() => fetchInboxCounts(user.id))
        .then(announceInboxCounts)
        .catch(() => {})
    }
    clearTimeout(readTimer.current)
    readTimer.current = setTimeout(mark, 400)
    document.addEventListener('visibilitychange', mark)
    return () => {
      clearTimeout(readTimer.current)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [ready, lastId, requestId, user?.id])

  const loadOlder = useCallback(async () => {
    const first = messages[0]?.id
    if (first == null) return false
    try {
      const page = await fetchMessages(requestId, { before: first })
      setMessages((list) => mergeMessages(list, page.messages))
      setHasMore(page.hasMore)
      return page.messages.length > 0
    } catch {
      return false
    }
  }, [messages, requestId])

  async function send(body, retryOf = null) {
    const tempId = retryOf?.tempId ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item = { tempId, body, status: 'sending' }
    setPending((list) => (retryOf ? list.map((p) => (p.tempId === tempId ? item : p)) : [...list, item]))
    try {
      const saved = await sendMessage(t, body, user.id)
      setPending((list) => list.filter((p) => p.tempId !== tempId))
      setMessages((list) => mergeMessages(list, [saved]))
    } catch (err) {
      setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, status: 'failed', error: err.message } : p)))
    }
  }

  // 신고 (+ 원하면 함께 차단)
  async function submitReport({ reason, detail, block }) {
    await reportThread(t, reason, detail, user.id, messages)
    if (!block) return { blocked: false }
    try {
      await blockCounterpart(t, user.id)
    } catch {
      return { blocked: false, blockFailed: true }
    }
    leaveOnClose.current = true
    return { blocked: true }
  }

  function closeReport() {
    setAction(null)
    if (leaveOnClose.current) navigate('/roommates/requests', { replace: true })
  }

  async function confirmBlock() {
    await blockCounterpart(t, user.id)
    navigate('/roommates/requests', { replace: true })
  }

  async function confirmCancel() {
    setCancelError('')
    try {
      await cancelRequest(t.postId, user.id)
      navigate('/roommates/requests', { replace: true })
    } catch (err) {
      setCancelError(err.message)
    }
  }

  if (!signedIn) {
    return (
      <div className="container chat-list-page">
        <ChatGate status={authStatus} />
      </div>
    )
  }

  const context = t && `${counterpartRole(t)} · ${threadContext(t)}`

  return (
    <div className="chat-room">
      <title>{t ? `${threadTitle(t)} | 신청 내역` : '신청 내역 | JBNU Dormi'}</title>
      <header className="chat-bar">
        <Link to="/roommates/requests" className="chat-icon-btn" aria-label="신청 내역으로">
          <IconArrowLeft width={20} height={20} />
        </Link>
        <div className="chat-bar-title">
          <h1>{t ? threadTitle(t) : '신청 내역'}</h1>
          {t && (
            <p>
              {threadContext(t)}
              {live === 'offline' && <span className="chat-offline"> · 연결이 불안정해 몇 초마다 확인 중</span>}
            </p>
          )}
        </div>
        {t && <RoomMenu thread={t} onPick={setAction} />}
      </header>

      {thread.status === 'loading' && <p className="chat-empty">불러오는 중…</p>}
      {thread.status === 'missing' && (
        <div className="chat-gate">
          <p>대화를 찾을 수 없어요. 상대가 신청을 취소했거나 차단했을 수 있어요.</p>
          <Link to="/roommates/requests" className="btn btn-secondary">
            신청 내역으로
          </Link>
        </div>
      )}
      {thread.status === 'error' && (
        <div className="container">
          <div className="notice notice-danger" role="alert">
            <IconAlert width={18} height={18} />
            <p>{thread.message}</p>
          </div>
        </div>
      )}

      {ready && (
        <>
          <MessageList
            key={requestId}
            thread={t}
            header={<PostCard thread={t} myChecklist={myChecklist} />}
            messages={messages}
            pending={pending}
            hasMore={hasMore}
            onLoadOlder={loadOlder}
            onRetry={(p) => send(p.body, p)}
            onDiscard={(p) => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
          />
          <Composer onSend={(body) => send(body)} disabled={suspended ? '이용이 정지된 계정이라 메시지를 보낼 수 없어요.' : ''} />

          <ReportModal
            key={action === 'report' ? 'report-open' : 'report'}
            target={action === 'report' && { title: `이 ${counterpartRole(t)}를 신고할까요?`, context }}
            onClose={closeReport}
            onSubmit={submitReport}
          />
          <BlockConfirmModal
            key={action === 'block' ? 'block-open' : 'block'}
            target={action === 'block' && { title: `이 ${counterpartRole(t)}를 차단할까요?`, context }}
            onClose={() => setAction(null)}
            onConfirm={confirmBlock}
          />
          <Modal
            open={action === 'cancel'}
            onClose={() => setAction(null)}
            title="신청을 취소할까요?"
            subtitle="신청을 취소하면 이 대화도 두 사람 모두에게서 지워져요."
            footer={
              <>
                <p className="rm-error" role="alert">
                  {cancelError}
                </p>
                <button type="button" className="btn btn-ghost" onClick={() => setAction(null)}>
                  아니요
                </button>
                <button type="button" className="btn btn-danger" onClick={confirmCancel}>
                  신청 취소
                </button>
              </>
            }
          />
        </>
      )}
    </div>
  )
}
