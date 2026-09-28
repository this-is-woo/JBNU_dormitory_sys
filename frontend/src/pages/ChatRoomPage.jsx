import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Composer from '../components/chat/Composer.jsx'
import LeaveConfirmModal from '../components/chat/LeaveConfirmModal.jsx'
import { MessageActions, SelectCopySheet, copyText } from '../components/chat/MessageActions.jsx'
import MessageList from '../components/chat/MessageList.jsx'
import PushPrompt from '../components/chat/PushPrompt.jsx'
import { counterpartRole, threadContext, threadTitle } from '../components/chat/chatFormat.js'
import { IconAlert, IconArrowLeft, IconChevronRight, IconMore } from '../components/common/Icons.jsx'
import Modal from '../components/common/Modal.jsx'
import BlockConfirmModal from '../components/roommates/BlockConfirmModal.jsx'
import { CompareTable } from '../components/roommates/MatchReport.jsx'
import ReportModal from '../components/roommates/ReportModal.jsx'
import { collegeName, dormName, genderLabel } from '../components/roommates/postFormat.js'
import { useAuth } from '../hooks/useAuth.js'
import {
  deleteMessage,
  editMessage,
  fetchMessages,
  fetchThread,
  findMyThreadForPost,
  leaveThread,
  markRead,
  sendMessage,
  subscribeMessages,
} from '../lib/roommateChat.js'
import { fetchMyProfile } from '../lib/roommateProfile.js'
import { fetchMyStatus, reportThread } from '../lib/roommateReports.js'
import { announceInboxCounts, blockCounterpart, fetchInboxCounts, startChat } from '../lib/roommateRequests.js'
import { fetchRoommatePost } from '../lib/roommates.js'
import { semesterLabel } from '../lib/semester.js'
import { useSiteSettings } from '../lib/siteSettings.js'
import { ChatGate } from './ChatListPage.jsx'
import './ChatPage.css'

// 실시간 연결이 끊겼을 때만, 화면이 보이는 동안 이 간격으로 새 메시지를 확인한다
const FALLBACK_POLL_MS = 4000

const mergeMessages = (list, more) => {
  const byId = new Map(list.map((m) => [m.id, m]))
  for (const m of more) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** 첫 메시지를 보내기 전의 대화창: 글 정보로 만든 임시 대화방 (저장된 것은 없다) */
const draftThread = (post) => ({
  id: null,
  draft: true,
  role: 'applicant',
  postId: post.id,
  dormitory: post.dormitory,
  semester: post.semester,
  postClosed: Boolean(post.isClosed),
  postOpen: post.isOpen !== false,
  counterpart: {
    dormitory: post.dormitory,
    gender: post.gender,
    age: post.age,
    collegeCode: post.collegeCode,
    mbti: post.mbti ?? null,
    checklist: post.checklist ?? {},
  },
  otherReadId: 0,
  authorId: post.authorId,
})

/** 대화 맨 위의 게시물 카드: 어떤 글의 신청인지 + [게시물 바로가기] + 체크리스트 비교 */
function PostCard({ thread, myChecklist }) {
  const [open, setOpen] = useState(false)
  const c = thread.counterpart
  const facts = c && [collegeName(c.collegeCode), c.age && `${c.age}세`, genderLabel(c.gender), c.mbti ?? 'MBTI 비공개']
  // 글이 지워져도 대화는 남는다: 카드에만 "삭제된 글"로 표시하고 바로가기는 잠근다 (대화 안에 따로 안내하지 않음)
  const state = thread.postDeleted ? '삭제된 글' : !thread.postOpen ? '숨겨진 글' : thread.postClosed ? '모집완료' : '모집 중'
  const off = thread.postDeleted || thread.postClosed || !thread.postOpen
  return (
    <section className="chat-post">
      <p className="chat-post-kicker">
        룸메이트 찾기{thread.semester && ` · ${semesterLabel(thread.semester)}`}
      </p>
      <p className="chat-post-title">
        {thread.role === 'author' ? '내 글' : thread.draft ? '채팅할 글' : '신청한 글'} · {dormName(thread.dormitory)} 룸메이트
        <span className={`chat-post-state${off ? ' is-off' : ''}`}>{state}</span>
      </p>
      <div className="chat-post-actions">
        {thread.postDeleted ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled>
            게시물 바로가기
          </button>
        ) : (
          <Link to={`/roommates?post=${thread.postId}`} className="btn btn-secondary btn-sm">
            게시물 바로가기
          </Link>
        )}
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

/** ⋯ 메뉴: 신고 · 차단 · 채팅방 나가기 */
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
          <li role="none">
            <button type="button" role="menuitem" className="is-danger" onClick={() => pick('leave')}>
              채팅방 나가기
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

/**
 * 대화방: 룸메 신청 하나에 대한 신청자 ↔ 글쓴이 1:1 대화.
 *   /chats/:requestId — 있는 대화
 *   /chats/new/:postId — [채팅 보내기]로 연 새 대화창. 첫 메시지를 보낼 때 룸메 신청과 함께 대화가 생긴다
 *                        (그 전에는 아무것도 저장하지 않아 글쓴이 쪽에는 변화가 없다)
 * 새 메시지 · 고친/지운 메시지 · 상대의 읽음 위치는 Supabase Realtime 으로 바로 받고,
 * 연결이 끊기면 화면이 보일 때만 몇 초마다 확인한다.
 * 말풍선을 꾹 누르면: 상대 말풍선은 전체 복사 · 선택 복사 · 답장, 내 말풍선은 전체 복사 · 선택 복사 · 수정 · 삭제
 */
export default function ChatRoomPage() {
  const { requestId, postId } = useParams()
  const isDraft = Boolean(postId)
  const location = useLocation()
  const navigate = useNavigate()
  const { status: authStatus, user } = useAuth()
  const { roommateSemester: recruit } = useSiteSettings()
  const signedIn = authStatus === 'signedIn'
  const [thread, setThread] = useState({ status: 'loading', data: null })
  const [draftPost, setDraftPost] = useState(null)
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [pending, setPending] = useState([])
  const [otherRead, setOtherRead] = useState(0)
  const [live, setLive] = useState('live')
  const [profile, setProfile] = useState(null)
  const [suspended, setSuspended] = useState(false)
  const [action, setAction] = useState(null) // 'report' | 'block' | 'leave'
  const [otherLeft, setOtherLeft] = useState(false) // 상대가 채팅방을 나갔는지
  const [pressed, setPressed] = useState(null) // 꾹 누른 메시지 (메뉴)
  const [selecting, setSelecting] = useState(null) // 선택 복사 중인 메시지
  const [deleting, setDeleting] = useState(null) // 삭제 확인 중인 메시지
  const [mode, setMode] = useState(null) // 입력칸: 답장 · 수정
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  // 신고하면서 차단까지 했으면 대화가 지워졌으므로, 신고 창을 닫을 때 목록으로 돌아간다
  const leaveOnClose = useRef(false)
  const lastIdRef = useRef(null)
  const readTimer = useRef(null)
  const t = thread.data
  const ready = thread.status === 'ready'

  lastIdRef.current = messages.at(-1)?.id ?? null

  function notify(text) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 내 정보(체크리스트 비교 · 성별) + 정지 여부
  useEffect(() => {
    if (!signedIn) return
    let active = true
    fetchMyProfile(user.id)
      .then((p) => active && setProfile(p ?? null))
      .catch(() => {})
    fetchMyStatus(user.id)
      .then((s) => active && setSuspended(Boolean(s?.suspended)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [signedIn, user?.id])

  // 있는 대화: 대화방 정보 + 최근 메시지
  useEffect(() => {
    if (!signedIn || isDraft) return
    let active = true
    setThread({ status: 'loading', data: null })
    setMessages([])
    setPending([])
    setMode(null)
    Promise.all([fetchThread(requestId, user.id), fetchMessages(requestId)])
      .then(([data, page]) => {
        if (!active) return
        if (!data) return setThread({ status: 'missing', data: null })
        setThread({ status: 'ready', data })
        setOtherRead(data.otherReadId ?? 0)
        setOtherLeft(Boolean(data.otherLeft))
        setMessages(page.messages)
        setHasMore(page.hasMore)
      })
      .catch((err) => active && setThread({ status: 'error', data: null, message: err.message }))
    return () => {
      active = false
    }
  }, [signedIn, user?.id, requestId, isDraft])

  // 새 대화창: 이미 이 글의 글쓴이와 대화 중이면 그 대화로, 아니면 글 정보로 임시 대화방을 만든다
  useEffect(() => {
    if (!signedIn || !isDraft) return
    let active = true
    setThread({ status: 'loading', data: null })
    setMessages([])
    setPending([])
    ;(async () => {
      const existing = await findMyThreadForPost(postId, user.id)
      if (!active) return
      if (existing) return navigate(`/chats/${existing.id}`, { replace: true })
      const given = location.state?.post
      const post = given?.id === postId ? given : await fetchRoommatePost(postId, user.id)
      if (!active) return
      if (!post) return setThread({ status: 'missing', data: null })
      setDraftPost(post)
      setThread({ status: 'ready', data: draftThread(post) })
    })().catch((err) => active && setThread({ status: 'error', data: null, message: err.message }))
    return () => {
      active = false
    }
  }, [signedIn, user?.id, postId, isDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // 놓친 새 메시지 확인 (다른 탭에서 돌아왔을 때 · 실시간 연결이 끊겼을 때)
  const catchUp = useCallback(async () => {
    if (isDraft || lastIdRef.current == null) return
    try {
      const { messages: more } = await fetchMessages(requestId, { after: lastIdRef.current })
      if (more.length) setMessages((list) => mergeMessages(list, more))
    } catch {
      // 다음 확인 때 다시
    }
  }, [requestId, isDraft])

  // 실시간: 이 대화방의 새 메시지 · 고친/지운 메시지 · 상대의 읽음 위치
  const liveRoom = ready && !isDraft
  useEffect(() => {
    if (!liveRoom) return
    const myRole = t.role
    return subscribeMessages({
      requestId,
      onMessage: (m) => {
        setMessages((list) => mergeMessages(list, [m]))
        // 상대가 나갔으면 입력칸을 잠근다
        if (m.kind === 'left' && m.senderRole !== myRole) setOtherLeft(true)
      },
      onRead: (role, lastId) => role !== myRole && setOtherRead((v) => Math.max(v, lastId)),
      onStatus: (s) => {
        setLive(s)
        // 다시 연결되면 끊긴 사이의 메시지를 채운다
        if (s === 'live') catchUp()
      },
    })
  }, [liveRoom, requestId, catchUp]) // eslint-disable-line react-hooks/exhaustive-deps

  // 실시간 연결이 끊긴 동안에만: 화면이 보일 때 몇 초마다 확인
  useEffect(() => {
    if (!liveRoom || live === 'live') return
    const id = setInterval(() => document.visibilityState === 'visible' && catchUp(), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [liveRoom, live, catchUp])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && catchUp()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [catchUp])

  // 보고 있는 동안 온 메시지는 읽음으로 (잠깐 모아서 한 번에). 헤더의 새 소식 표시도 맞춘다
  const lastId = messages.at(-1)?.id ?? null
  useEffect(() => {
    if (!liveRoom || lastId == null) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      markRead(t, lastId)
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
  }, [liveRoom, lastId, requestId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // 수정: 고친 내용을 바로 보여 주고 저장
    if (!retryOf && mode?.type === 'edit') {
      const target = mode.message
      setMode(null)
      try {
        const saved = await editMessage(t, target, body, user.id)
        setMessages((list) => mergeMessages(list, [saved]))
      } catch (err) {
        notify(err.message)
      }
      return
    }
    const replyTo = retryOf ? retryOf.replyTo : mode?.type === 'reply' ? mode.message.id : null
    if (!retryOf) setMode(null)
    const tempId = retryOf?.tempId ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item = { tempId, body, replyTo, status: 'sending' }
    setPending((list) => (retryOf ? list.map((p) => (p.tempId === tempId ? item : p)) : [...list, item]))
    try {
      // 새 대화창의 첫 메시지: 이때 룸메 신청과 함께 대화가 생긴다
      if (isDraft) {
        const { requestId: created } = await startChat(draftPost, body, user.id, profile?.gender)
        navigate(`/chats/${created}`, { replace: true })
        return
      }
      const saved = await sendMessage(t, body, user.id, replyTo)
      setPending((list) => list.filter((p) => p.tempId !== tempId))
      setMessages((list) => mergeMessages(list, [saved]))
    } catch (err) {
      setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, status: 'failed', error: err.message } : p)))
      // 그사이 다른 화면에서 대화를 시작했으면 그 대화로
      if (isDraft) {
        const existing = await findMyThreadForPost(postId, user.id).catch(() => null)
        if (existing) navigate(`/chats/${existing.id}`, { replace: true })
      }
    }
  }

  // 말풍선 메뉴
  async function pickAction(kind) {
    const m = pressed
    setPressed(null)
    if (kind === 'copy') notify((await copyText(m.body ?? '')) ? '복사했어요.' : '복사하지 못했어요.')
    if (kind === 'select') setSelecting(m)
    if (kind === 'reply') setMode({ type: 'reply', message: m, label: `${m.senderRole === t.role ? '나' : counterpartRole(t)}에게 답장` })
    if (kind === 'edit') setMode({ type: 'edit', message: m })
    if (kind === 'delete') setDeleting(m)
  }

  async function copySelected(text) {
    if (!text) return notify('복사할 부분을 먼저 선택해 주세요.')
    setSelecting(null)
    notify((await copyText(text)) ? '선택한 부분을 복사했어요.' : '복사하지 못했어요.')
  }

  async function confirmDelete() {
    const m = deleting
    setDeleting(null)
    if (mode?.message?.id === m.id) setMode(null)
    try {
      const saved = await deleteMessage(t, m)
      setMessages((list) => mergeMessages(list, [saved]))
    } catch (err) {
      notify(err.message)
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
    if (leaveOnClose.current) navigate('/chats', { replace: true })
  }

  async function confirmBlock() {
    await blockCounterpart(t, user.id)
    navigate('/chats', { replace: true })
  }

  async function confirmLeave() {
    await leaveThread({ ...t, otherLeft }, user.id)
    fetchInboxCounts(user.id).then(announceInboxCounts).catch(() => {})
    navigate('/chats', { replace: true })
  }

  if (!signedIn) {
    return (
      <div className="container chat-list-page">
        <ChatGate status={authStatus} />
      </div>
    )
  }

  const context = t && `${counterpartRole(t)} · ${threadContext(t)}`
  // 새 대화창에서 대화를 시작할 수 없는 경우 (입력칸에 이유를 보여 준다)
  const draftBlock =
    isDraft && draftPost
      ? draftPost.authorId === user.id
        ? '내 글에는 채팅을 보낼 수 없어요.'
        : profile && draftPost.gender !== profile.gender
          ? '같은 성별만 신청할 수 있어요.'
          : draftPost.isClosed
            ? '모집이 끝난 글이라 채팅을 시작할 수 없어요.'
            : (draftPost.semester ?? recruit) !== recruit
              ? '지난 학기 글이라 채팅을 시작할 수 없어요.'
              : ''
      : ''
  const disabled = otherLeft
    ? `${t ? counterpartRole(t) : '상대'}가 채팅방을 나가서 메시지를 보낼 수 없어요.`
    : suspended
      ? '이용이 정지된 계정이라 메시지를 보낼 수 없어요.'
      : draftBlock

  return (
    <div className="chat-room">
      <title>{t ? `${threadTitle(t)} | 채팅` : '채팅 | JBNU Dormi'}</title>
      <header className="chat-bar">
        <Link to="/chats" className="chat-icon-btn" aria-label="채팅 목록으로">
          <IconArrowLeft width={20} height={20} />
        </Link>
        <div className="chat-bar-title">
          <h1>{t ? threadTitle(t) : '채팅'}</h1>
          {t && (
            <p>
              {threadContext(t)}
              {liveRoom && live === 'offline' && <span className="chat-offline"> · 연결이 불안정해 몇 초마다 확인 중</span>}
            </p>
          )}
        </div>
        {t && !isDraft && <RoomMenu thread={t} onPick={setAction} />}
      </header>

      {thread.status === 'loading' && <p className="chat-empty">불러오는 중…</p>}
      {thread.status === 'missing' && (
        <div className="chat-gate">
          <p>
            {isDraft
              ? '글을 찾을 수 없어요. 삭제되었거나 볼 수 없는 글이에요.'
              : '대화를 찾을 수 없어요. 상대가 채팅방을 나갔거나 차단했을 수 있어요.'}
          </p>
          <Link to="/chats" className="btn btn-secondary">
            채팅 목록으로
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
          <PushPrompt userId={user.id} />
          <MessageList
            key={requestId ?? `new-${postId}`}
            thread={t}
            header={<PostCard thread={t} myChecklist={profile?.checklist ?? null} />}
            empty={
              isDraft && (
                <p className="chat-start-hint">
                  첫 메시지를 보내면 글쓴이에게 룸메 신청이 가요.
                  <br />
                  보내기 전까지는 글쓴이에게 아무것도 알려지지 않아요.
                </p>
              )
            }
            messages={messages}
            pending={pending}
            otherReadId={otherRead}
            hasMore={hasMore}
            onLoadOlder={loadOlder}
            onRetry={(p) => send(p.body, p)}
            onDiscard={(p) => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
            onAction={setPressed}
          />
          <Composer
            onSend={(body) => send(body)}
            mode={mode}
            onCancelMode={() => setMode(null)}
            disabled={disabled}
            placeholder={isDraft ? '첫 메시지를 입력하세요' : '메시지를 입력하세요'}
          />

          {pressed && (
            <MessageActions
              message={pressed}
              mine={pressed.senderRole === t.role}
              onPick={pickAction}
              onClose={() => setPressed(null)}
            />
          )}
          {selecting && <SelectCopySheet message={selecting} onCopy={copySelected} onClose={() => setSelecting(null)} />}
          {toast && (
            <p className="chat-toast" role="status">
              {toast}
            </p>
          )}

          <Modal
            open={Boolean(deleting)}
            onClose={() => setDeleting(null)}
            title="메시지를 삭제할까요?"
            subtitle={`${counterpartRole(t)}의 화면에도 “삭제된 메시지입니다.”로 보여요.`}
            footer={
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                  삭제
                </button>
              </>
            }
          />
          {!isDraft && (
            <>
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
              <LeaveConfirmModal
                key={action === 'leave' ? 'leave-open' : 'leave'}
                thread={action === 'leave' ? { ...t, otherLeft } : null}
                onClose={() => setAction(null)}
                onConfirm={confirmLeave}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
