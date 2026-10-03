import { useState } from 'react'
import { promptInstall, useInstallMode } from '../../lib/install.js'
import { IconClose } from './Icons.jsx'
import './InstallBanner.css'

const DISMISS_KEY = 'jbnu-dorm:install-dismissed'
const DISMISS_DAYS = 7

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86400000
  } catch {
    return false
  }
}

/**
 * 홈 맨 위 "앱으로 설치하기" 안내 띠.
 * 설치할 수 있는 브라우저면 [설치하기]로 설치 창을, 아이폰 · 메뉴로만 설치되는 경우엔 순서를 안내한다.
 * 닫으면 7일 동안 다시 띄우지 않고, 이미 앱으로 열었으면 보이지 않는다.
 */
export default function InstallBanner() {
  const mode = useInstallMode()
  const [hidden, setHidden] = useState(dismissedRecently)
  const [guideOpen, setGuideOpen] = useState(false)
  const [pending, setPending] = useState(false)

  if (hidden || mode === 'none') return null

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // 저장하지 못하면 다음에 다시 보일 뿐
    }
    setHidden(true)
  }

  async function install() {
    if (mode !== 'prompt') return setGuideOpen((v) => !v)
    setPending(true)
    try {
      await promptInstall()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="container">
      <section className="install-banner" aria-labelledby="install-title">
        <img className="install-icon" src="/icons/icon-192.png" alt="" width="44" height="44" />
        <div className="install-text">
          <strong id="install-title">앱으로 설치하기</strong>
          <span>홈 화면에서 바로 열고 채팅 알림도 받아요</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm install-btn" onClick={install} disabled={pending} aria-expanded={mode === 'prompt' ? undefined : guideOpen}>
          {mode === 'prompt' ? '설치하기' : '설치 방법'}
        </button>
        <button type="button" className="install-close" aria-label="닫기 (7일 동안 보지 않기)" onClick={close}>
          <IconClose width={16} height={16} />
        </button>
        {guideOpen && mode === 'ios' && (
          <ol className="install-guide">
            <li>
              Safari 아래(아이패드는 위)의 <b>[공유]</b> 버튼을 눌러요.
            </li>
            <li>
              목록에서 <b>[홈 화면에 추가]</b>를 누르고 <b>[추가]</b>를 눌러요.
            </li>
            <li>홈 화면에 생긴 JBNU Dormi 아이콘으로 열면 돼요.</li>
          </ol>
        )}
        {guideOpen && mode === 'android' && (
          <ol className="install-guide">
            <li>
              주소창 오른쪽의 <b>[⋮] 메뉴</b>를 눌러요.
            </li>
            <li>
              <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 누르고 <b>[설치]</b>를 눌러요.
            </li>
            <li>홈 화면에 생긴 JBNU Dormi 아이콘으로 열면 돼요.</li>
          </ol>
        )}
      </section>
    </div>
  )
}
