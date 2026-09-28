import { useEffect, useState } from 'react'
import {
  disablePush,
  dismissPushPrompt,
  enablePush,
  hasPushSubscription,
  pushPermission,
  pushPromptDismissed,
  pushSupport,
  syncPush,
} from '../../lib/push.js'
import { IconBell, IconClose } from '../common/Icons.jsx'

// 이 기기를 한 번 확인·등록한 계정 (페이지를 옮겨 다녀도 다시 묻지 않게)
const synced = new Set()

/**
 * 채팅 화면 위의 알림 안내 띠.
 *   · 아직 안 물어본 기기: "새 채팅을 알림으로 받아 보세요 [알림 받기]" → 누르면 브라우저 권한 창
 *   · 아이폰 사파리: 홈 화면에 추가해야 알림을 받을 수 있다는 안내
 *   · 이미 허용한 기기: 아무것도 보이지 않고, 이 계정으로 조용히 다시 등록한다
 * 닫으면 7일 동안은 다시 띄우지 않는다.
 */
export default function PushPrompt({ userId }) {
  const support = pushSupport()
  const [status, setStatus] = useState(() => {
    if (support === 'unsupported' || pushPromptDismissed()) return 'hidden'
    if (support === 'ios-install') return 'ios'
    return pushPermission() === 'default' ? 'ask' : 'hidden'
  })
  const [error, setError] = useState('')

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
    <div className="push-prompt" role="status">
      <span className="push-prompt-icon" aria-hidden="true">
        <IconBell width={18} height={18} />
      </span>
      <p className="push-prompt-text">
        {status === 'ios' && (
          <>
            아이폰은 사파리 아래의 <b>[공유] → [홈 화면에 추가]</b>로 설치하면 새 채팅을 알림으로 받을 수 있어요.
          </>
        )}
        {(status === 'ask' || status === 'working') && (error || '새 채팅이 오면 폰 상단 알림으로 알려 드릴까요?')}
        {status === 'done' && '알림을 켰어요. 새 채팅이 오면 알려 드릴게요.'}
        {status === 'denied' && '알림이 꺼져 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용하면 받을 수 있어요.'}
      </p>
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

/** 채팅 목록 위의 [알림 켜짐 / 꺼짐] 버튼 (이 기기만) */
export function PushToggle({ userId }) {
  const support = pushSupport()
  const [on, setOn] = useState(null) // null: 확인 중
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (support !== 'supported') return
    let active = true
    hasPushSubscription()
      .then((has) => active && setOn(has && pushPermission() === 'granted'))
      .catch(() => active && setOn(false))
    return () => {
      active = false
    }
  }, [support, userId])

  if (support !== 'supported' || on === null) return null

  async function toggle() {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      if (on) {
        await disablePush()
        setOn(false)
      } else {
        const result = await enablePush()
        setOn(result === 'granted')
        if (result === 'denied') setNote('브라우저 설정에서 알림을 허용해 주세요.')
      }
    } catch (err) {
      setNote(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm push-toggle${on ? ' is-on' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={note || (on ? '이 기기에서 채팅 알림 끄기' : '이 기기에서 채팅 알림 켜기')}
    >
      <IconBell width={16} height={16} />
      {on ? '알림 켜짐' : '알림 꺼짐'}
    </button>
  )
}
