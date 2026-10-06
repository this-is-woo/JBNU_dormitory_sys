import { useEffect, useRef, useState } from 'react'
import { IconBell, IconClose } from '../common/Icons.jsx'

const DISMISS_KEY = 'jbnu-dorm:alert-promo-dismissed'
const DISMISS_DAYS = 14

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86400000
  } catch {
    return false
  }
}

/**
 * 룸메이트 찾기 게시판 위 "맞춤 룸메 알림" 안내 띠 (알림을 아직 켜지 않은 사람에게만).
 * [맞춤 알림 받기] → 설정 창(onOpen). 켜면 잠깐 "켰어요"를 보여 주고 사라진다. 닫으면 14일 동안 숨긴다.
 * enabled: 지금 켜져 있는지 (켜는 순간 false → true 로 바뀌면 "켰어요")
 */
export default function AlertPromo({ enabled, onOpen }) {
  const [hidden, setHidden] = useState(() => enabled || dismissedRecently())
  const [done, setDone] = useState(false)
  const wasEnabled = useRef(enabled)

  useEffect(() => {
    if (enabled && !wasEnabled.current && !hidden) {
      setDone(true)
      const timer = setTimeout(() => setHidden(true), 3000)
      wasEnabled.current = enabled
      return () => clearTimeout(timer)
    }
    wasEnabled.current = enabled
  }, [enabled, hidden])

  if (hidden) return null

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // 저장하지 못하면 다음에 다시 보일 뿐
    }
    setHidden(true)
  }

  return (
    <div className="push-prompt rm-alert-promo" role="status">
      <span className="push-prompt-icon" aria-hidden="true">
        <IconBell width={18} height={18} />
      </span>
      <p className="push-prompt-text">
        {done ? (
          '맞춤 알림을 켰어요. 내 정보 > 설정에서 언제든 바꿀 수 있어요.'
        ) : (
          <>
            <b>나와 잘 맞는 새 글</b>이 올라오면 휴대폰 알림으로 알려 드릴까요?
          </>
        )}
      </p>
      {!done && (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>
            맞춤 알림 받기
          </button>
          <button type="button" className="push-prompt-close" aria-label="닫기 (14일 동안 보지 않기)" onClick={close}>
            <IconClose width={16} height={16} />
          </button>
        </>
      )}
    </div>
  )
}
