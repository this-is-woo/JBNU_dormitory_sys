import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import LoginModal from '../components/auth/LoginModal.jsx'
import { PushToggle } from '../components/chat/PushPrompt.jsx'
import {
  IconAlert,
  IconArchive,
  IconBlock,
  IconChat,
  IconChevronRight,
  IconFile,
  IconLogout,
  IconPencil,
} from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import ChecklistView from '../components/roommates/ChecklistView.jsx'
import { collegeName, dormTitle, genderLabel } from '../components/roommates/postFormat.js'
import ProfileForm from '../components/roommates/ProfileForm.jsx'
import { authMode, useAuth } from '../hooks/useAuth.js'
import { pushSupport } from '../lib/push.js'
import { cachedProfile, fetchMyProfile, saveProfile } from '../lib/roommateProfile.js'
// 내 정보 등록 창 · 체크리스트 표(룸메이트 찾기와 같은 스타일), 채팅 알림 스위치
import './RoommatesPage.css'
import './ChatPage.css'
import './MyPage.css'

const LOGIN_POINTS = [
  '구글 계정으로 한 번에 로그인해요. 따로 가입할 필요가 없어요.',
  '로그인하면 내 정보를 등록하고 룸메이트 글쓰기 · 룸메 신청을 할 수 있어요.',
  '이메일과 이름은 본인 확인에만 쓰고, 어디에도 표시하지 않아요.',
]

/** 바로가기 한 줄 (룸메이트 찾기 · 채팅의 창을 열며 이동) */
function Shortcut({ to, state, Icon, label, desc }) {
  return (
    <li>
      <Link to={to} state={state} className="me-link">
        <span className="me-link-icon" aria-hidden="true">
          <Icon width={18} height={18} />
        </span>
        <span className="me-link-text">
          <strong>{label}</strong>
          {desc && <span>{desc}</span>}
        </span>
        <IconChevronRight className="me-link-arrow" width={16} height={16} />
      </Link>
    </li>
  )
}

/**
 * 내 정보 (/me): 계정 · 룸메이트 찾기 정보(기본 정보 + 체크리스트) · 바로가기 · 채팅 알림 · 로그아웃.
 * 모바일 하단 탭 바의 [내 정보]가 이 페이지로 온다. 수정은 내 정보 창(ProfileForm)에서 한다.
 */
export default function MyPage() {
  const { status, user, signIn, signInWithIdToken, signOut } = useAuth()
  const navigate = useNavigate()
  const signedIn = status === 'signedIn'
  const [profile, setProfile] = useState(() => {
    const cached = cachedProfile(user?.id)
    return cached === undefined ? { status: 'loading', data: null } : { status: 'ready', data: cached }
  })
  const [retry, setRetry] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    const cached = cachedProfile(user.id)
    setProfile(cached === undefined ? { status: 'loading', data: null } : { status: 'ready', data: cached })
    fetchMyProfile(user.id)
      .then((data) => active && setProfile({ status: 'ready', data }))
      .catch(() => active && setProfile((p) => (p.status === 'ready' ? p : { status: 'error', data: null })))
    return () => {
      active = false
    }
  }, [signedIn, user?.id, retry])

  // 로그인 창에서 로그인을 마치면 창을 닫는다
  useEffect(() => {
    if (signedIn) setLoginOpen(false)
  }, [signedIn])

  async function handleSave(values) {
    const saved = await saveProfile(values, user.id, Boolean(profile.data))
    setProfile({ status: 'ready', data: saved })
    setFormOpen(false)
  }

  async function logout() {
    await signOut()
    navigate('/', { replace: true })
  }

  const p = profile.data
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <>
      <title>내 정보 | JBNU Dormi</title>
      <PageHeader title="내 정보" />

      <div className="container me-page">
        {status === 'loading' && <div className="card me-card me-skeleton" aria-busy="true" />}

        {status === 'signedOut' && (
          <section className="card me-card me-guest">
            <span className="me-avatar is-guest" aria-hidden="true">
              ?
            </span>
            <h2>로그인이 필요해요</h2>
            <p>로그인하면 내 정보를 등록하고, 룸메이트 글쓰기 · 룸메 신청 · 채팅을 할 수 있어요.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setLoginOpen(true)}>
              구글 계정으로 로그인
            </button>
          </section>
        )}

        {signedIn && (
          <>
            {/* 계정 */}
            <section className="card me-card me-account" aria-label="계정">
              <span className="me-avatar" aria-hidden="true">
                {initial}
              </span>
              <div className="me-account-text">
                <strong>
                  {user.name}
                  {authMode === 'demo' && <span className="chip">데모</span>}
                </strong>
                <span title={user.email}>{user.email}</span>
                <small>다른 이용자에게는 보이지 않아요</small>
              </div>
            </section>

            {/* 룸메이트 찾기 정보 */}
            <section className="card me-card" aria-labelledby="me-profile-title">
              <header className="me-card-head">
                <h2 id="me-profile-title">룸메이트 찾기 정보</h2>
                {p && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFormOpen(true)}>
                    <IconPencil width={14} height={14} />
                    수정
                  </button>
                )}
              </header>

              {profile.status === 'loading' && <p className="me-muted">불러오는 중…</p>}
              {profile.status === 'error' && (
                <div className="notice notice-danger" role="alert">
                  <IconAlert width={18} height={18} />
                  <p>내 정보를 불러오지 못했어요.</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry((n) => n + 1)}>
                    다시 시도
                  </button>
                </div>
              )}
              {profile.status === 'ready' && !p && (
                <div className="me-empty">
                  <p>아직 등록하지 않았어요. 한 번만 등록하면 글쓰기 · 룸메 신청을 할 수 있어요.</p>
                  <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
                    내 정보 등록하기
                  </button>
                </div>
              )}
              {p && (
                <>
                  <dl className="me-facts">
                    <div>
                      <dt>성별</dt>
                      <dd>{genderLabel(p.gender)}</dd>
                    </div>
                    <div>
                      <dt>호관</dt>
                      <dd>{dormTitle(p)}</dd>
                    </div>
                    <div>
                      <dt>나이</dt>
                      <dd className="tabular">{p.age}세</dd>
                    </div>
                    <div>
                      <dt>단과대학</dt>
                      <dd>{collegeName(p.collegeCode)}</dd>
                    </div>
                    <div>
                      <dt>MBTI</dt>
                      <dd>{p.mbti ?? '비공개'}</dd>
                    </div>
                  </dl>
                  {!p.roomType && (
                    <p className="me-hint">호실(몇 인실)을 아직 고르지 않았어요. [수정]에서 고르면 내 글 제목에도 함께 보여요.</p>
                  )}
                  <button
                    type="button"
                    className="me-toggle"
                    aria-expanded={checklistOpen}
                    onClick={() => setChecklistOpen((v) => !v)}
                  >
                    생활 습관 체크리스트 {checklistOpen ? '접기' : '보기'}
                    <IconChevronRight width={16} height={16} />
                  </button>
                  {checklistOpen && <ChecklistView checklist={p.checklist} />}
                </>
              )}
            </section>

            {/* 바로가기 */}
            <section className="card me-card" aria-labelledby="me-links-title">
              <h2 id="me-links-title" className="me-card-title">
                바로가기
              </h2>
              <ul className="me-links">
                <Shortcut to="/roommates" state={{ action: 'myPosts' }} Icon={IconFile} label="내가 쓴 글" desc="수정 · 모집완료 · 삭제" />
                <Shortcut to="/chats" Icon={IconChat} label="채팅" desc="룸메 신청으로 시작된 대화" />
                <Shortcut to="/chats" state={{ action: 'blocks' }} Icon={IconBlock} label="차단 관리" desc="차단한 사용자 보기 · 해제" />
                <Shortcut to="/roommates" state={{ action: 'archive' }} Icon={IconArchive} label="지난 학기 글" />
              </ul>
            </section>

            {/* 알림 */}
            {pushSupport() === 'supported' && (
              <section className="card me-card me-row" aria-label="알림">
                <div>
                  <h2 className="me-card-title">채팅 알림</h2>
                  <p className="me-muted">이 기기에서 새 채팅을 휴대폰 상단 알림으로 받아요.</p>
                </div>
                <PushToggle userId={user.id} />
              </section>
            )}

            <button type="button" className="me-logout" onClick={logout}>
              <IconLogout width={18} height={18} />
              로그아웃
            </button>
          </>
        )}
      </div>

      <LoginModal
        open={loginOpen}
        reason="내 정보를 보려면 로그인이 필요해요."
        points={LOGIN_POINTS}
        onClose={() => setLoginOpen(false)}
        onSignIn={signIn}
        onIdToken={signInWithIdToken}
      />
      {user && (
        <ProfileForm
          key={p ? `profile-${p.updatedAt}` : 'profile-new'}
          open={formOpen}
          initial={p}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSave}
        />
      )}
    </>
  )
}
