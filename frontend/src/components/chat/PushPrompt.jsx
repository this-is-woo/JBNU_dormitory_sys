import { useEffect, useRef, useState } from 'react'
import {
  disablePush,
  dismissPushPrompt,
  enablePush,
  hasPushSubscription,
  PUSH_EVENT,
  pushHelp,
  pushPermission,
  pushPromptDismissed,
  pushSupport,
  pushUnavailable,
  registerPush,
  requestPushPermission,
  syncPush,
} from '../../lib/push.js'
import { IconBell, IconClose } from '../common/Icons.jsx'
import PushHelpAction from './PushHelp.jsx'

// 이 기기를 한 번 확인·등록한 계정 (페이지를 옮겨 다녀도 다시 묻지 않게)
const synced = new Set()

/**
 * 채팅 화면 위의 알림 안내 띠.
 *   · 아직 안 물어본 기기: "새 채팅을 알림으로 받아 보세요 [알림 받기]" → 누르면 브라우저 권한 창
 *   · 알림을 받을 수 없는 곳(카카오톡 안 · 아이폰 Safari · 지원하지 않는 브라우저): 받을 수 있는 브라우저로 안내
 *     ([브라우저로 열기] · [크롬으로 열기] · [링크 복사])
 *   · 이미 허용한 기기: 아무것도 보이지 않고, 이 계정으로 조용히 다시 등록한다
 * 닫으면 7일 동안은 다시 띄우지 않는다.
 */
export default function PushPrompt({ userId }) {
  const support = pushSupport()
  const [status, setStatus] = useState(() => {
    if (support === 'off' || pushPromptDismissed()) return 'hidden'
    if (pushUnavailable(support)) return 'help'
    return pushPermission() === 'default' ? 'ask' : 'hidden'
  })
  const help = status === 'help' ? pushHelp(support) : null
  const [error, setError] = useState('')

  // 스위치로 켜면 안내 띠는 바로 닫는다
  useEffect(() => {
    const sync = (e) => e.detail?.on && setStatus((s) => (s === 'ask' ? 'hidden' : s))
    window.addEventListener(PUSH_EVENT, sync)
    return () => window.removeEventListener(PUSH_EVENT, sync)
  }, [])

  // 이미 허용한 기기는 로그인한 계정으로 다시 등록
  useEffect(() => {
    if (!userId || synced.has(userId) || pushPermission() !== 'granted') return
    synced.add(userId)
    syncPush().catch(() => synced.delete(userId))
  }, [userId])

  function close() {
    dismissPushPrompt()
    setStatus('hidden')
  }

  async function turnOn() {
    setStatus('working')
    setError('')
    try {
      const result = await enablePush()
      if (result === 'granted') {
        synced.add(userId)
        setStatus('done')
        setTimeout(() => setStatus('hidden'), 2500)
      } else {
        setStatus(result === 'denied' ? 'denied' : 'ask')
      }
    } catch (err) {
      setError(err.message)
      setStatus('ask')
    }
  }

  if (status === 'hidden') return null
  return (
    <div className={`push-prompt${help ? ' is-help' : ''}`} role="status">
      <span className="push-prompt-icon" aria-hidden="true">
        <IconBell width={18} height={18} />
      </span>
      <p className="push-prompt-text">
        {help?.message}
        {(status === 'ask' || status === 'working') && (error || '새 채팅이 오면 폰 상단 알림으로 알려 드릴까요?')}
        {status === 'done' && '알림을 켰어요. 새 채팅이 오면 알려 드릴게요.'}
        {status === 'denied' && '알림이 꺼져 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용하면 받을 수 있어요.'}
      </p>
      {help && <PushHelpAction action={help.action} />}
      {(status === 'ask' || status === 'working') && (
        <button type="button" className="btn btn-primary btn-sm" onClick={turnOn} disabled={status === 'working'}>
          알림 받기
        </button>
      )}
      {status !== 'done' && (
        <button type="button" className="push-prompt-close" aria-label="닫기" onClick={close}>
          <IconClose width={16} height={16} />
        </button>
      )}
    </div>
  )
}

/**
 * 채팅 목록 위의 [채팅 알림] 토글 스위치 (이 기기만).
 * 누르는 즉시 스위치를 옮기고(낙관적 갱신) 서버 저장은 뒤에서 한다. 실패하면 되돌리고 이유를 보여 준다.
 * 알림을 받을 수 없는 곳이면 꺼진 채 흐리게 보이고, 누르면 받을 수 있는 브라우저로 안내한다
 * (showHelp=false: 안내는 옆에서 따로 보여 준다 — 내 정보 > 설정).
 */
export function PushToggle({ userId, showHelp = true }) {
  const support = pushSupport()
  if (support === 'off') return null
  if (pushUnavailable(support)) return <UnavailableSwitch support={support} showHelp={showHelp} />
  return <AvailableSwitch userId={userId} support={support} />
}

/** 알림을 받을 수 없는 곳: 꺼진 스위치(비활성) + 누르면 안내 */
function UnavailableSwitch({ support, showHelp }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const help = pushHelp(support)

  // 바깥을 누르거나 Esc 를 누르면 안내를 닫는다
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

  return (
    <div className="push-switch-wrap" ref={ref}>
      <button
        type="button"
        role="switch"
        aria-checked="false"
        aria-disabled="true"
        className="push-switch is-unavailable"
        onClick={() => showHelp && setOpen((v) => !v)}
        aria-expanded={showHelp ? open : undefined}
        title={help.message}
      >
        <IconBell width={16} height={16} />
        <span className="push-switch-label">채팅 알림</span>
        <span className="push-switch-track" aria-hidden="true">
          <span className="push-switch-thumb" />
        </span>
      </button>
      {showHelp && open && (
        <div className="push-switch-help" role="note">
          <p>{help.message}</p>
          <PushHelpAction action={help.action} />
        </div>
      )}
    </div>
  )
}

function AvailableSwitch({ userId, support }) {
  // 처음에는 권한으로 바로 짐작해 그리고(기다리는 동안 버튼이 사라지지 않게), 구독 여부를 확인해 맞춘다
  const [on, setOn] = useState(() => support === 'supported' && pushPermission() === 'granted')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (support !== 'supported') return
    let active = true
    hasPushSubscription()
      .then((has) => active && setOn(has && pushPermission() === 'granted'))
      .catch(() => {})
    // 안내 띠의 [알림 받기] 등 다른 곳에서 켜고 끈 것도 바로 반영한다
    const sync = (e) => setOn(Boolean(e.detail?.on))
    window.addEventListener(PUSH_EVENT, sync)
    return () => {
      active = false
      window.removeEventListener(PUSH_EVENT, sync)
    }
  }, [support, userId])

  async function toggle() {
    if (busy) return
    setNote('')
    if (on) {
      // 끄기: 바로 끈 것으로 보이고, 구독 해지 · 서버 삭제는 뒤에서
      setOn(false)
      disablePush().catch(() => {
        setOn(true)
        setNote('알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
      return
    }
    // 켜기: 권한 창(처음 한 번)만 기다리고, 허용하면 바로 켠 것으로 보인 뒤 등록은 뒤에서
    setBusy(true)
    try {
      const result = await requestPushPermission()
      if (result !== 'granted') {
        if (result === 'denied') setNote('브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용해 주세요.')
        return
      }
      setOn(true)
      setBusy(false)
      registerPush().catch((err) => {
        setOn(false)
        setNote(err.message)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="push-switch-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`push-switch${on ? ' is-on' : ''}`}
        onClick={toggle}
        disabled={busy}
        title={on ? '이 기기에서 채팅 알림 끄기' : '이 기기에서 채팅 알림 켜기'}
      >
        <IconBell width={16} height={16} />
        <span className="push-switch-label">채팅 알림</span>
        <span className="push-switch-track" aria-hidden="true">
          <span className="push-switch-thumb" />
        </span>
      </button>
      {note && (
        <p className="push-switch-note" role="alert">
          {note}
        </p>
      )}
    </div>
  )
}
