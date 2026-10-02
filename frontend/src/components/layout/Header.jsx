import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { useAdmin } from '../../hooks/useAdmin.js'
import { INBOX_EVENT, fetchInboxCounts } from '../../lib/roommateRequests.js'
import { useSiteSettings } from '../../lib/siteSettings.js'
import { IconMenu, IconShield } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import MobileDrawer from './MobileDrawer.jsx'
import TabBar from './TabBar.jsx'
import './Header.css'

export const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/roommates', label: '룸메이트 찾기' },
  { to: '/dorms', label: '생활관 안내' },
  { to: '/support', label: '개발자 삼각김밥 사주기' },
]

/**
 * 안 읽은 대화 수 (모바일 메뉴 표시용). 로그인했을 때 한 번, 메뉴를 열 때, 다른 탭에서 돌아올 때 확인하고,
 * 룸메이트 페이지가 새로 센 값을 알려 주면(INBOX_EVENT) 그대로 쓴다. 주기적으로 묻지 않는다.
 */
function useInboxCounts(userId, menuOpen) {
  const [counts, setCounts] = useState({ requests: 0, replies: 0 })
  const [tick, setTick] = useState(0)

  // 메뉴를 열 때마다 다시 센다
  useEffect(() => {
    if (menuOpen) setTick((t) => t + 1)
  }, [menuOpen])

  // 로그인했을 때 · 메뉴를 열 때 · 다른 탭에서 돌아올 때(tick) 새로 센다
  useEffect(() => {
    if (!userId) return setCounts({ requests: 0, replies: 0 })
    let active = true
    fetchInboxCounts(userId)
      .then((next) => active && setCounts(next))
      .catch(() => {}) // 표시만 생략
    return () => {
      active = false
    }
  }, [userId, tick])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setTick((t) => t + 1)
    const onAnnounce = (e) => setCounts(e.detail)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(INBOX_EVENT, onAnnounce)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(INBOX_EVENT, onAnnounce)
    }
  }, [])
  return counts
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const auth = useAdmin()
  const { supportEnabled } = useSiteSettings()
  // 후원을 끄면(관리자 [설정]) 메뉴에서 뺀다
  const navItems = supportEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.to !== '/support')
  const inbox = useInboxCounts(auth.status === 'signedIn' ? auth.user?.id : null, menuOpen)
  const inboxNew = inbox.requests + inbox.replies

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Logo onClick={closeMenu} />

        {/* 넓은 화면: 헤더 메뉴 */}
        <nav className="site-nav" aria-label="주요 메뉴">
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {auth.isAdmin && (
          <NavLink to="/admin" className="nav-admin" aria-label="관리자 페이지" title="관리자 페이지">
            <IconShield width={18} height={18} />
            <span>관리</span>
          </NavLink>
        )}

        {/* 모바일: 오른쪽에서 밀려 나오는 메뉴 (프로필 · 페이지 이동 · 로그아웃) */}
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-label={inboxNew > 0 ? `메뉴 열기 (안 읽은 대화 ${inboxNew}개)` : '메뉴 열기'}
          onClick={() => setMenuOpen(true)}
        >
          <IconMenu width={22} height={22} />
          {/* 안 읽은 대화가 있으면 빨간 점, 아니면 로그인 상태(초록 점) */}
          {auth.status === 'signedIn' && (
            <span className={`nav-toggle-dot${inboxNew > 0 ? ' is-new' : ''}`} aria-hidden="true" />
          )}
        </button>
      </div>
      <MobileDrawer open={menuOpen} onClose={closeMenu} items={navItems} auth={auth} inboxNew={inboxNew} />
      {/* 모바일 하단 탭 바 (안 읽은 대화 수를 함께 쓴다) */}
      <TabBar inboxNew={inboxNew} />
    </header>
  )
}
