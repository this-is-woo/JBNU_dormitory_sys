import { useEffect, useRef } from 'react'
import { quoteText } from './chatFormat.js'

/** 아래에서 올라오는 작은 창 (Esc · 바깥을 누르면 닫힘) */
export function Sheet({ label, onClose, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    panelRef.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="chat-sheet-root" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chat-sheet" role="dialog" aria-modal="true" aria-label={label} ref={panelRef}>
        {children}
      </div>
    </div>
  )
}

/**
 * 말풍선을 꾹 눌렀을 때: 상대 말풍선은 전체 복사 · 선택 복사 · 답장,
 * 내 말풍선은 전체 복사 · 선택 복사 · 수정 · 삭제
 */
export function MessageActions({ message, mine, onPick, onClose }) {
  const items = [
    { action: 'copy', label: '전체 복사' },
    { action: 'select', label: '선택 복사' },
    ...(mine ? [{ action: 'edit', label: '수정' }, { action: 'delete', label: '삭제', danger: true }] : [{ action: 'reply', label: '답장' }]),
  ]
  return (
    <Sheet label="메시지 메뉴" onClose={onClose}>
      <p className="chat-sheet-preview">{quoteText(message)}</p>
      <ul className="chat-sheet-list">
        {items.map((item) => (
          <li key={item.action}>
            <button type="button" className={item.danger ? 'is-danger' : ''} onClick={() => onPick(item.action)}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="chat-sheet-cancel" onClick={onClose}>
        닫기
      </button>
    </Sheet>
  )
}

/** 채팅 목록에서 대화방을 꾹 눌렀을 때: 채팅방 나가기 */
export function ThreadActions({ title, onLeave, onClose }) {
  return (
    <Sheet label="채팅방 메뉴" onClose={onClose}>
      <p className="chat-sheet-preview">{title}</p>
      <ul className="chat-sheet-list">
        <li>
          <button type="button" className="is-danger" onClick={onLeave}>
            채팅방 나가기
          </button>
        </li>
      </ul>
      <button type="button" className="chat-sheet-cancel" onClick={onClose}>
        닫기
      </button>
    </Sheet>
  )
}

/** 선택 복사: 글자를 골라(드래그·길게 눌러 선택) 그 부분만 복사한다 */
export function SelectCopySheet({ message, onCopy, onClose }) {
  const textRef = useRef(null)

  function copySelection() {
    const selection = window.getSelection()
    const inside = selection && textRef.current?.contains(selection.anchorNode) && textRef.current?.contains(selection.focusNode)
    const text = inside ? selection.toString() : ''
    onCopy(text)
  }

  return (
    <Sheet label="선택 복사" onClose={onClose}>
      <p className="chat-sheet-title">복사할 부분을 선택하세요</p>
      <div className="chat-select-text" ref={textRef}>
        {message.body}
      </div>
      <div className="chat-sheet-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="btn btn-primary" onClick={copySelection}>
          선택한 부분 복사
        </button>
      </div>
    </Sheet>
  )
}

// 클립보드에 쓰기 (lib/share.js 로 옮김. 대화방에서 쓰던 이름 그대로)
export { copyText } from '../../lib/share.js'
