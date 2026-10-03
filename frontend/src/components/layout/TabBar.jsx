import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { IconBuilding, IconChat, IconHome, IconUser, IconUsers } from '../common/Icons.jsx'
import './TabBar.css'

// 대화방(/chats/:id, /chats/new/:id)은 입력칸이 화면 아래에 붙어 있어 탭 바를 숨긴다
const HIDDEN = /^\/chats\/.+/

const TABS = [
  { to: '/', label: '홈', Icon: IconHome, end: true },
  { to: '/dorms', label: '생활관 안내', Icon: IconBuilding },
  { to: '/roommates', label: '룸메이트 찾기', Icon: IconUsers },
  { to: '/chats', label: '채팅', Icon: IconChat },
  { to: '/me', label: '내 정보', Icon: IconUser },
]

/**
 * 모바일 하단 탭 바: 홈 · 생활관 안내 · 룸메이트 찾기 · 채팅 · 내 정보 (760px 이하에서만 보인다)
 * 내 정보는 /me 페이지 (로그인 전이면 그 페이지가 로그인을 안내한다)
 * 헤더는 backdrop-filter 때문에 fixed 위치의 기준이 되므로, body 에 따로 그린다.
 */
export default function TabBar({ inboxNew = 0 }) {
  const { pathname } = useLocation()
  const hidden = HIDDEN.test(pathname)

  // 탭 바가 있는 동안: 페이지 맨 아래 내용이 가리지 않게 여백을 준다 (TabBar.css 의 body.has-tabbar)
  useEffect(() => {
    if (hidden) return
    document.body.classList.add('has-tabbar')
    return () => document.body.classList.remove('has-tabbar')
  }, [hidden])

  if (hidden) return null

  return createPortal(
    <nav className="tabbar" aria-label="하단 메뉴">
      <ul>
        {TABS.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} className="tabbar-item">
              <span className="tabbar-icon">
                <Icon width={22} height={22} />
                {to === '/chats' && inboxNew > 0 && (
                  <span className="tabbar-badge tabular" aria-label={`안 읽은 대화 ${inboxNew}개`}>
                    {inboxNew > 99 ? '99+' : inboxNew}
                  </span>
                )}
              </span>
              <span className="tabbar-label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>,
    document.body,
  )
}
