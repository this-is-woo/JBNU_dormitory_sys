import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconUser } from '../common/Icons.jsx'
import { clockLabel, counterpartRole, dayLabel } from './chatFormat.js'

// 같은 사람이 같은 분에 이어 보낸 메시지는 한 묶음: 이름은 첫 메시지에, 시각은 마지막 메시지에만
const sameGroup = (a, b) =>
  a && b && a.senderRole === b.senderRole && clockLabel(a.createdAt) === clockLabel(b.createdAt) && dayLabel(a.createdAt) === dayLabel(b.createdAt)

// 화면 맨 아래에서 이만큼 안이면 "맨 아래를 보고 있다"고 본다 (새 메시지가 오면 따라 내려간다)
const NEAR_BOTTOM = 120

/**
 * 대화 메시지 목록 (스크롤 영역).
 * header: 맨 위에 둘 내용 (게시물 카드) · messages: 저장된 메시지 · pending: 보내는 중/실패한 내 메시지
 * hasMore + onLoadOlder: 맨 위에 닿으면 앞의 메시지를 더 불러온다
 */
export default function MessageList({ thread, header, messages, pending, hasMore, onLoadOlder, onRetry, onDiscard }) {
  const scrollRef = useRef(null)
  const topRef = useRef(null)
  const atBottom = useRef(true)
  const prevHeight = useRef(null) // 앞의 메시지를 붙이기 전 높이 (보던 자리 유지)
  const loadingOlder = useRef(false)
  const lastId = messages.at(-1)?.id ?? null
  const seenLast = useRef(lastId)
  const [newBelow, setNewBelow] = useState(false)
  const mine = (m) => m.senderRole === thread.role

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setNewBelow(false)
  }

  // 처음 열 때는 맨 아래부터
  useLayoutEffect(() => {
    scrollToBottom()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 앞의 메시지를 붙였으면 보던 메시지가 제자리에 있게
    if (prevHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevHeight.current
      prevHeight.current = null
      loadingOlder.current = false
      return
    }
    // 새 메시지: 맨 아래를 보고 있었거나 내가 보낸 것이면 따라 내려가고, 아니면 [새 메시지] 표시
    if (lastId !== seenLast.current) {
      const last = messages.at(-1)
      if (atBottom.current || (last && mine(last))) scrollToBottom(seenLast.current != null)
      else setNewBelow(true)
      seenLast.current = lastId
    }
  }, [messages, lastId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 보내는 중인 내 메시지가 생기면 맨 아래로
  useLayoutEffect(() => {
    if (pending.length) scrollToBottom(true)
  }, [pending.length])

  // 맨 위에 닿으면 앞의 메시지를 더 불러온다
  useEffect(() => {
    const el = topRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingOlder.current) return
        loadingOlder.current = true
        prevHeight.current = scrollRef.current.scrollHeight
        const added = await onLoadOlder()
        if (!added) {
          prevHeight.current = null
          loadingOlder.current = false
        }
      },
      { root: scrollRef.current, rootMargin: '200px 0px 0px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadOlder])

  function onScroll() {
    const el = scrollRef.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (atBottom.current) setNewBelow(false)
  }

  const other = counterpartRole(thread)

  return (
    <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
      {header}
      {hasMore && (
        <div ref={topRef} className="chat-more">
          이전 메시지 불러오는 중…
        </div>
      )}
      <ol className="chat-messages" aria-label="메시지">
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const next = messages[i + 1]
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
          const isMine = mine(m)
          // 룸메 신청: 가운데 안내 줄 + (한마디가 있으면) 말풍선
          const request = m.kind === 'request'
          const groupStart = request || !sameGroup(prev, m) || prev?.kind === 'request' || newDay
          const groupEnd = !sameGroup(m, next) || next?.kind === 'request'
          return (
            <Fragment key={m.id}>
              {newDay && (
                <li className="chat-day">
                  <span>{dayLabel(m.createdAt)}</span>
                </li>
              )}
              {request && (
                <li className="chat-note">
                  {isMine ? '룸메 신청을 보냈어요' : `${other}가 룸메 신청을 보냈어요`}
                  <time dateTime={m.createdAt}> · {clockLabel(m.createdAt)}</time>
                </li>
              )}
              {(!request || m.body) && (
                <li className={`chat-msg${isMine ? ' is-mine' : ''}${groupStart ? ' is-start' : ''}`}>
                  {!isMine && (
                    <span className="chat-msg-avatar" aria-hidden="true">
                      {groupStart && <IconUser width={16} height={16} />}
                    </span>
                  )}
                  <div className="chat-msg-body">
                    {!isMine && groupStart && <span className="chat-msg-name">{other}</span>}
                    <div className="chat-msg-line">
                      <p className="chat-bubble">{m.body}</p>
                      {(groupEnd || request) && (
                        <time className="chat-time tabular" dateTime={m.createdAt}>
                          {clockLabel(m.createdAt)}
                        </time>
                      )}
                    </div>
                  </div>
                </li>
              )}
            </Fragment>
          )
        })}
        {pending.map((p) => (
          <li key={p.tempId} className={`chat-msg is-mine is-start${p.status === 'failed' ? ' is-failed' : ' is-sending'}`}>
            <div className="chat-msg-body">
              <div className="chat-msg-line">
                <p className="chat-bubble">{p.body}</p>
                {p.status === 'sending' && <span className="chat-time">보내는 중</span>}
              </div>
              {p.status === 'failed' && (
                <p className="chat-failed">
                  {p.error}
                  <button type="button" onClick={() => onRetry(p)}>
                    다시 보내기
                  </button>
                  <button type="button" onClick={() => onDiscard(p)}>
                    지우기
                  </button>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {newBelow && (
        <button type="button" className="chat-new-below" onClick={() => scrollToBottom(true)}>
          새 메시지 ↓
        </button>
      )}
    </div>
  )
}
