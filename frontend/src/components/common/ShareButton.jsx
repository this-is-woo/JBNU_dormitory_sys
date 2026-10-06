import { useEffect, useRef, useState } from 'react'
import { share } from '../../lib/share.js'
import { IconCheck, IconShare } from './Icons.jsx'
import './ShareButton.css'

/**
 * [공유] 버튼: 휴대폰은 공유 창, PC 는 링크 복사 (lib/share.js)
 * 복사하면 버튼 글자가 잠깐 "링크 복사됨"으로 바뀐다 (따로 알림 창을 띄우지 않는다).
 * @param {() => {title?: string, text?: string, url: string}} getData  누를 때 공유할 내용
 * @param {string} label  버튼 글자 · tone: 'ghost' | 'secondary' · size: 'sm' | 'md'
 */
export default function ShareButton({ getData, label = '공유', tone = 'ghost', size = 'sm', className = '' }) {
  const [state, setState] = useState('idle') // idle · copied · failed
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function onClick() {
    const result = await share(getData())
    if (result !== 'copied' && result !== 'failed') return
    setState(result)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      className={`btn btn-${tone}${size === 'sm' ? ' btn-sm' : ''} share-btn${state === 'copied' ? ' is-copied' : ''} ${className}`}
      onClick={onClick}
    >
      {state === 'copied' ? <IconCheck width={16} height={16} /> : <IconShare width={16} height={16} />}
      <span aria-live="polite">{state === 'copied' ? '링크 복사됨' : state === 'failed' ? '복사 실패' : label}</span>
    </button>
  )
}
