import { useEffect, useRef, useState } from 'react'
import { copyText } from '../../lib/share.js'

/**
 * 알림을 받을 수 없는 곳(카카오톡 안 · 아이폰 Safari 밖 등)에서 알림을 받을 수 있는 브라우저로 옮기는 버튼.
 * lib/push.js 의 pushHelp().action: [브라우저로 열기] · [크롬으로 열기] · [링크 복사]
 */
export default function PushHelpAction({ action, className = 'btn btn-secondary btn-sm' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!action) return null

  async function onClick() {
    if (action.kind === 'open') return action.run()
    if (await copyText(window.location.href)) {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      <span aria-live="polite">{copied ? '링크 복사됨' : action.label}</span>
    </button>
  )
}
