import { useLayoutEffect, useRef, useState } from 'react'
import { MESSAGE_MAX } from '../../lib/roommateChat.js'
import { IconSend } from '../common/Icons.jsx'

// 손가락으로 쓰는 화면(휴대폰)에서는 Enter 가 줄바꿈, 보내기는 버튼으로
const touchScreen = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * 메시지 입력칸. Enter 로 보내고 Shift+Enter 로 줄바꿈 (한글 조합 중인 Enter 는 무시).
 * disabled: 보낼 수 없을 때 안내 문구 (예: 정지된 계정)
 */
export default function Composer({ onSend, disabled = '' }) {
  const [text, setText] = useState('')
  const ref = useRef(null)

  // 내용에 맞춰 높이를 늘린다 (최대 5줄쯤, 넘치면 스크롤)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    // 최대 높이를 넘을 때만 스크롤 막대
    el.style.overflowY = el.scrollHeight > 128 ? 'auto' : 'hidden'
  }, [text])

  function submit() {
    const body = text.trim()
    if (!body || disabled) return
    onSend(body)
    setText('')
    ref.current?.focus()
  }

  const over = text.length > MESSAGE_MAX * 0.9

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="chat-input-wrap">
        <textarea
          ref={ref}
          className="chat-input"
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder={disabled || '메시지를 입력하세요'}
          aria-label="메시지"
          value={text}
          disabled={Boolean(disabled)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || touchScreen()) return
            e.preventDefault()
            submit()
          }}
        />
        {over && (
          <span className="chat-count tabular">
            {text.length}/{MESSAGE_MAX}
          </span>
        )}
      </div>
      <button type="submit" className="chat-send" disabled={!text.trim() || Boolean(disabled)} aria-label="보내기">
        <IconSend width={18} height={18} />
      </button>
    </form>
  )
}
