import { useState } from 'react'
import { NavLink } from 'react-router'
import { IconClose, IconMenu } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import './Header.css'

export const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/roommates', label: '룸메이트 찾기' },
  { to: '/dorms', label: '생활관 안내' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Logo onClick={closeMenu} />

        <nav id="site-nav" className={`site-nav${menuOpen ? ' is-open' : ''}`} aria-label="주요 메뉴">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} onClick={closeMenu}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
        </button>
      </div>
    </header>
  )
}
