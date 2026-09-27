import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router'
import { authMode } from '../../hooks/useAuth.js'
import {
  IconArchive,
  IconChat,
  IconBuilding,
  IconChevronRight,
  IconClipboard,
  IconClose,
  IconFile,
  IconHome,
  IconLogout,
  IconOnigiri,
  IconShield,
  IconUsers,
} from '../common/Icons.jsx'
import './MobileDrawer.css'

const NAV_ICONS = { '/': IconHome, '/roommates': IconUsers, '/dorms': IconBuilding }

// 후원 페이지는 페이지 목록이 아니라 맨 아래 '후원' 칸에 따로 둔다
const SUPPORT_PATH = '/support'

// 룸메이트 찾기 바로가기: /roommates 로 이동하면서 열 창을 알려 준다 (RoommatesPage 가 location.state 로 받는다)
const ROOMMATE_ACTIONS = [
  { action: 'profile', label: '내 정보', Icon: IconClipboard },
  { action: 'myPosts', label: '내가 쓴 글', Icon: IconFile },
  { action: 'requests', label: '신청 내역', Icon: IconChat },
  { action: 'archive', label: '지난 학기 글', Icon: IconArchive },
]

/**
 * 모바일 메뉴: 오른쪽에서 밀려 나오는 서랍.
 * 프로필(로그인 계정) · 페이지 이동 · 룸메이트 바로가기 · 로그아웃
 */
export default function MobileDrawer({ open, onClose, items: allItems, auth, inboxNew = 0 }) {
  const navigate = useNavigate()
  const items = allItems.filter((item) => item.to !== SUPPORT_PATH)
  const support = allItems.find((item) => item.to === SUPPORT_PATH)
  const closeRef = useRef(null)
  const { status, user, signOut } = auth
  const signedIn = status === 'signedIn'

  // 열려 있는 동안: 뒤 페이지 스크롤 잠금, Esc 로 닫기, 닫기 버튼에 포커스
  useEffect(() => {
    if (!open) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  function go(action) {
    onClose()
    // 신청 내역은 따로 된 페이지 (로그인 전이면 그 페이지가 로그인으로 안내한다)
    if (action === 'requests') return navigate('/roommates/requests')
    navigate('/roommates', { state: { action } })
  }

  async function logout() {
    onClose()
    await signOut()
  }

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  return createPortal(
    <div className={`drawer-root${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="메뉴">
        <div className="drawer-head">
          <span className="drawer-title">메뉴</span>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose} aria-label="메뉴 닫기">
            <IconClose width={20} height={20} />
          </button>
        </div>

        <div className="drawer-body">
          {/* 프로필 */}
          <section className="drawer-profile">
            {status === 'loading' ? (
              <div className="drawer-profile-skeleton" />
            ) : signedIn ? (
              <>
                <div className="drawer-me">
                  <span className="drawer-avatar" aria-hidden="true">
                    {initial}
                  </span>
                  <div className="drawer-me-text">
                    <strong>
                      {user.name}
                      {authMode === 'demo' && <span className="chip">데모</span>}
                      {auth.isAdmin && <span className="chip chip-primary">관리자</span>}
                    </strong>
                    <span title={user.email}>{user.email}</span>
                  </div>
                </div>
                <p className="drawer-note">
                  <span className="drawer-dot" aria-hidden="true" />
                  구글 계정으로 로그인됨 · 다른 이용자에게는 보이지 않아요
                </p>
              </>
            ) : (
              <>
                <div className="drawer-me">
                  <span className="drawer-avatar is-guest" aria-hidden="true">
                    ?
                  </span>
                  <div className="drawer-me-text">
                    <strong>로그인이 필요해요</strong>
                    <span>룸메이트 찾기는 로그인 후 이용할 수 있어요</span>
                  </div>
                </div>
                <button type="button" className="btn btn-primary drawer-login" onClick={() => go('unlock')}>
                  구글 계정으로 로그인
                </button>
              </>
            )}
          </section>

          {/* 페이지 이동 */}
          <nav className="drawer-section" aria-label="페이지">
            <h2>페이지</h2>
            <ul className="drawer-list">
              {items.map((item, i) => {
                const Icon = NAV_ICONS[item.to] ?? IconChevronRight
                return (
                  <li key={item.to} style={{ '--i': i }}>
                    <NavLink to={item.to} end={item.end} onClick={onClose} className="drawer-item">
                      <span className="drawer-item-icon">
                        <Icon width={18} height={18} />
                      </span>
                      <span className="drawer-item-label">{item.label}</span>
                      <IconChevronRight className="drawer-item-arrow" width={16} height={16} />
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* 룸메이트 바로가기 */}
          {signedIn && (
            <section className="drawer-section">
              <h2>룸메이트 찾기</h2>
              <ul className="drawer-list">
                {ROOMMATE_ACTIONS.map(({ action, label, Icon }, i) => (
                  <li key={action} style={{ '--i': items.length + i }}>
                    <button type="button" className="drawer-item" onClick={() => go(action)}>
                      <span className="drawer-item-icon">
                        <Icon width={18} height={18} />
                      </span>
                      <span className="drawer-item-label">{label}</span>
                      {action === 'requests' && inboxNew > 0 && (
                        <span className="drawer-badge tabular" aria-label={`안 읽은 대화 ${inboxNew}개`}>
                          {inboxNew > 99 ? '99+' : inboxNew}
                        </span>
                      )}
                      <IconChevronRight className="drawer-item-arrow" width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 관리자 */}
          {auth.isAdmin && (
            <nav className="drawer-section" aria-label="관리자">
              <h2>관리자</h2>
              <ul className="drawer-list">
                <li style={{ '--i': items.length + (signedIn ? ROOMMATE_ACTIONS.length : 0) }}>
                  <NavLink to="/admin" onClick={onClose} className="drawer-item">
                    <span className="drawer-item-icon">
                      <IconShield width={18} height={18} />
                    </span>
                    <span className="drawer-item-label">관리자 페이지</span>
                    <IconChevronRight className="drawer-item-arrow" width={16} height={16} />
                  </NavLink>
                </li>
              </ul>
            </nav>
          )}

          {/* 후원 */}
          {support && (
            <nav className="drawer-section" aria-label="후원">
              <h2>후원</h2>
              <ul className="drawer-list">
                <li style={{ '--i': items.length + (signedIn ? ROOMMATE_ACTIONS.length : 0) }}>
                  <NavLink to={support.to} onClick={onClose} className="drawer-item">
                    <span className="drawer-item-icon">
                      <IconOnigiri width={18} height={18} />
                    </span>
                    <span className="drawer-item-label">{support.label}</span>
                    <IconChevronRight className="drawer-item-arrow" width={16} height={16} />
                  </NavLink>
                </li>
              </ul>
            </nav>
          )}
        </div>

        {signedIn && (
          <div className="drawer-foot">
            <button type="button" className="drawer-logout" onClick={logout}>
              <IconLogout width={18} height={18} />
              로그아웃
            </button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}
