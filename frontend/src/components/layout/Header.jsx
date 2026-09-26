import { useCallback, useState } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../../hooks/useAuth.js'
import { IconMenu } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import MobileDrawer from './MobileDrawer.jsx'
import './Header.css'

export const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/roommates', label: '룸메이트 찾기' },
  { to: '/dorms', label: '생활관 안내' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const auth = useAuth()

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Logo onClick={closeMenu} />

        {/* 넓은 화면: 헤더 메뉴 */}
        <nav className="site-nav" aria-label="주요 메뉴">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* 모바일: 오른쪽에서 밀려 나오는 메뉴 (프로필 · 페이지 이동 · 로그아웃) */}
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-label="메뉴 열기"
          onClick={() => setMenuOpen(true)}
        >
          <IconMenu width={22} height={22} />
          {auth.status === 'signedIn' && <span className="nav-toggle-dot" aria-hidden="true" />}
        </button>
      </div>
      <MobileDrawer open={menuOpen} onClose={closeMenu} items={NAV_ITEMS} auth={auth} />
    </header>
  )
}
