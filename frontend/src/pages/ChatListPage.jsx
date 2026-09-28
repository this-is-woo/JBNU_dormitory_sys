import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import BlocksModal from '../components/chat/BlocksModal.jsx'
import LeaveConfirmModal from '../components/chat/LeaveConfirmModal.jsx'
import { ThreadActions } from '../components/chat/MessageActions.jsx'
import PushPrompt, { PushToggle } from '../components/chat/PushPrompt.jsx'
import { useLongPress } from '../components/chat/useLongPress.js'
import { previewText, threadTitle } from '../components/chat/chatFormat.js'
import ChoiceGroup from '../components/common/ChoiceGroup.jsx'
import { IconAlert, IconArrowLeft, IconChat, IconUser } from '../components/common/Icons.jsx'
import { dormName, timeAgo } from '../components/roommates/postFormat.js'
import { useAuth } from '../hooks/useAuth.js'
import { fetchThreads, leaveThread, subscribeMessages } from '../lib/roommateChat.js'
import { announceInboxCounts } from '../lib/roommateRequests.js'
import './ChatPage.css'

const TABS = [
  { value: 'all', label: '전체' },
  { value: 'author', label: '받은 신청' },
  { value: 'applicant', label: '보낸 신청' },
]

/** 로그인 전: 룸메이트 찾기에서 로그인·내 정보 등록을 마치면 이 페이지로 돌아온다 */
export function ChatGate({ status }) {
  const navigate = useNavigate()
  if (status === 'loading') return <p className="chat-empty">불러오는 중…</p>
  return (
    <div className="chat-gate">
      <IconChat width={28} height={28} />
      <p>로그인하면 룸메 신청으로 시작된 대화를 볼 수 있어요.</p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/roommates', { state: { action: 'requests' } })}>
        로그인
      </button>
    </div>
  )
}

/** 대화방 한 줄. 누르면 대화방으로, 꾹 누르면(PC 는 오른쪽 클릭) 메뉴 (채팅방 나가기) */
function ThreadRow({ thread, onPress }) {
  const closed = thread.postClosed
  const press = useLongPress(() => onPress(thread))
  return (
    <li>
      <Link to={`/chats/${thread.id}`} className={`chat-row${thread.unread > 0 ? ' is-unread' : ''}`} {...press}>
        <span className="chat-avatar" aria-hidden="true">
          <IconUser width={22} height={22} />
        </span>
        <span className="chat-row-main">
          <span className="chat-row-title">
            <strong>{threadTitle(thread)}</strong>
            <span className="chat-row-tag">
              {thread.role === 'author' ? `받은 신청 · ${dormName(thread.dormitory)}` : '보낸 신청'}
              {closed && ' · 모집완료'}
              {thread.otherLeft && ' · 상대가 나감'}
            </span>
          </span>
          <span className="chat-row-preview">{previewText(thread)}</span>
        </span>
        <span className="chat-row-side">
          {thread.lastMessage && (
            <time className="tabular" dateTime={thread.lastMessage.createdAt}>
              {timeAgo(thread.lastMessage.createdAt)}
            </time>
          )}
          {thread.unread > 0 && (
            <span className="chat-unread tabular" aria-label={`안 읽은 메시지 ${thread.unread}개`}>
              {thread.unread > 99 ? '99+' : thread.unread}
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

/**
 * 채팅: 룸메 신청으로 시작된 대화 목록 (받은 신청 · 보낸 신청).
 * ?post=글id 이면 그 글의 대화만 (카드의 [받은 신청]에서 들어온 경우)
 * 새 메시지는 실시간으로 받아 목록을 다시 불러온다.
 */
export default function ChatListPage() {
  const { status: authStatus, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const postFilter = params.get('post')
  const [tab, setTab] = useState('all')
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [reloadKey, setReloadKey] = useState(0)
  const [blocksOpen, setBlocksOpen] = useState(false)
  const [pressed, setPressed] = useState(null) // 꾹 누른 대화방 (메뉴)
  const [leaving, setLeaving] = useState(null) // 나가기 확인 중인 대화방
  const signedIn = authStatus === 'signedIn'
  const timer = useRef(null)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    fetchThreads(user.id)
      .then((items) => {
        if (!active) return
        setState({ status: 'ready', items })
        // 헤더·메뉴의 새 소식 표시도 맞춘다
        announceInboxCounts({
          requests: items.filter((t) => t.role === 'author' && t.unread > 0).length,
          replies: items.filter((t) => t.role === 'applicant' && t.unread > 0).length,
        })
      })
      .catch((err) => active && setState({ status: 'error', items: [], message: err.message }))
    return () => {
      active = false
    }
  }, [signedIn, user?.id, reloadKey])

  // 새 메시지가 오면(실시간) · 다른 탭에서 돌아오면 목록을 다시 불러온다
  useEffect(() => {
    if (!signedIn) return
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setReloadKey((k) => k + 1), 300)
    }
    const stop = subscribeMessages({ onInsert: refresh })
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn, user?.id])

  const items = useMemo(() => state.items.filter((t) => !postFilter || t.postId === postFilter), [state.items, postFilter])
  const shown = items.filter((t) => tab === 'all' || t.role === tab)

  return (
    <div className="container chat-list-page">
      <title>채팅 | JBNU Dormi</title>
      <div className="chat-list-head">
        <Link to="/roommates" className="chat-back" aria-label="룸메이트 찾기로">
          <IconArrowLeft width={20} height={20} />
        </Link>
        <h1>채팅</h1>
        {signedIn && (
          <div className="chat-head-actions">
            <PushToggle userId={user.id} />
            <button type="button" className="btn btn-ghost btn-sm chat-blocks-btn" onClick={() => setBlocksOpen(true)}>
              차단 관리
            </button>
          </div>
        )}
      </div>

      {!signedIn ? (
        <ChatGate status={authStatus} />
      ) : (
        <>
          <PushPrompt userId={user.id} />
          <ChoiceGroup label="대화 보기" size="sm" options={TABS} value={tab} onChange={setTab} />
          {postFilter && (
            <p className="chat-filter">
              선택한 글의 대화만 보고 있어요.
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({}, { replace: true })}>
                전체 보기
              </button>
            </p>
          )}

          {state.status === 'loading' && <p className="chat-empty">불러오는 중…</p>}
          {state.status === 'error' && (
            <div className="notice notice-danger" role="alert">
              <IconAlert width={18} height={18} />
              <p>{state.message}</p>
            </div>
          )}
          {state.status === 'ready' &&
            (shown.length ? (
              <ul className="chat-list">
                {shown.map((t) => (
                  <ThreadRow key={t.id} thread={t} onPress={setPressed} />
                ))}
              </ul>
            ) : (
              <p className="chat-empty">
                {tab === 'applicant'
                  ? '아직 보낸 채팅이 없어요. 마음에 드는 글에서 [룸메 신청] → [채팅 보내기]로 대화를 시작해 보세요.'
                  : tab === 'author'
                    ? '아직 받은 채팅이 없어요. 다른 사람이 내 글에 채팅을 보내면 여기에 모여요.'
                    : '아직 채팅이 없어요. 마음에 드는 글에 채팅을 보내 보세요.'}
              </p>
            ))}
          <BlocksModal open={blocksOpen} userId={user.id} onClose={() => setBlocksOpen(false)} />
          {pressed && (
            <ThreadActions
              title={threadTitle(pressed)}
              onLeave={() => {
                setLeaving(pressed)
                setPressed(null)
              }}
              onClose={() => setPressed(null)}
            />
          )}
          <LeaveConfirmModal
            key={leaving?.id ?? 'none'}
            thread={leaving}
            onClose={() => setLeaving(null)}
            onConfirm={async () => {
              await leaveThread(leaving, user.id)
              setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== leaving.id) }))
              setLeaving(null)
              setReloadKey((k) => k + 1)
            }}
          />
        </>
      )}
    </div>
  )
}
