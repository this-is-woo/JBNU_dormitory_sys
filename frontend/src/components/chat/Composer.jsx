import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MESSAGE_MAX } from '../../lib/roommateChat.js'
import { IconClose, IconSend } from '../common/Icons.jsx'
import { quoteText } from './chatFormat.js'

// 손가락으로 쓰는 화면(휴대폰)에서는 Enter 가 줄바꿈, 보내기는 버튼으로
const touchScreen = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * 메시지 입력칸. Enter 로 보내고 Shift+Enter 로 줄바꿈 (한글 조합 중인 Enter 는 무시).
 * mode: null | { type: 'reply', message, label } | { type: 'edit', message }
 *   답장이면 입력칸 위에 "OO에게 답장" 줄, 수정이면 원래 내용을 채워 넣는다. onCancelMode 로 취소
 * disabled: 보낼 수 없을 때 안내 문구 (예: 정지된 계정) · placeholder: 입력칸 안내
 */
export default function Composer({ onSend, mode = null, onCancelMode, disabled = '', placeholder = '메시지를 입력하세요' }) {
  const [text, setText] = useState('')
  const ref = useRef(null)
  const editing = mode?.type === 'edit'

  // 수정을 시작하면 원래 내용을, 답장을 시작하면 입력칸에 커서를
  useEffect(() => {
    if (!mode) return
    if (mode.type === 'edit') setText(mode.message.body ?? '')
    ref.current?.focus()
  }, [mode?.type, mode?.message?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 내용에 맞춰 높이를 늘린다 (최대 5줄쯤, 넘치면 스크롤)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    // 최대 높이를 넘을 때만 스크롤 막대
    el.style.overflowY = el.scrollHeight > 128 ? 'auto' : 'hidden'
  }, [text])

  function cancelMode() {
    if (editing) setText('')
    onCancelMode?.()
  }

  function submit() {
    const body = text.trim()
    if (!body || disabled) return
    if (editing && body === (mode.message.body ?? '').trim()) return cancelMode()
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
      {mode && (
        <div className="chat-mode">
          <div className="chat-mode-text">
            <b>{editing ? '메시지 수정' : mode.label}</b>
            <span>{quoteText(mode.message)}</span>
          </div>
          <button type="button" className="chat-mode-cancel" aria-label={editing ? '수정 취소' : '답장 취소'} onClick={cancelMode}>
            <IconClose width={16} height={16} />
          </button>
        </div>
      )}
      <div className="chat-composer-row">
        <div className="chat-input-wrap">
          <textarea
            ref={ref}
            className="chat-input"
            rows={1}
            maxLength={MESSAGE_MAX}
            placeholder={disabled || (editing ? '고칠 내용을 입력하세요' : placeholder)}
            aria-label="메시지"
            value={text}
            disabled={Boolean(disabled)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && mode) return cancelMode()
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
        <button type="submit" className="chat-send" disabled={!text.trim() || Boolean(disabled)} aria-label={editing ? '수정하기' : '보내기'}>
          <IconSend width={18} height={18} />
        </button>
      </div>
    </form>
  )
}
