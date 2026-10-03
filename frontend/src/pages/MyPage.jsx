import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import LoginModal from '../components/auth/LoginModal.jsx'
import { PushToggle } from '../components/chat/PushPrompt.jsx'
import {
  IconAlert,
  IconArchive,
  IconBell,
  IconBlock,
  IconChevronRight,
  IconDownload,
  IconExternal,
  IconFile,
  IconLogout,
  IconMoon,
  IconPencil,
  IconShield,
  IconVibrate,
  IconWave,
} from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import Switch from '../components/common/Switch.jsx'
import { OFFICIAL_DORM_URL } from '../config.js'
import ChecklistView from '../components/roommates/ChecklistView.jsx'
import { collegeName, genderLabel } from '../components/roommates/postFormat.js'
import ProfileForm from '../components/roommates/ProfileForm.jsx'
import { authMode, useAuth } from '../hooks/useAuth.js'
import { promptInstall, useInstallMode } from '../lib/install.js'
import { canVibrate, setPreference, usePreferences } from '../lib/preferences.js'
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

const THEMES = [
  { value: 'system', label: '자동' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

/** 설정 한 줄: 아이콘 · 이름 · 설명 + 오른쪽 조작(스위치 등) */
function SettingRow({ Icon, title, desc, children, stacked = false }) {
  return (
    <li className={`me-set-row${stacked ? ' is-stacked' : ''}`}>
      <span className="me-set-icon" aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className="me-set-text">
        <strong>{title}</strong>
        {desc && <span>{desc}</span>}
      </span>
      {children && <div className="me-set-control">{children}</div>}
    </li>
  )
}

/** 설정 안의 이동 줄 (약관 · 바깥 사이트) */
function SettingLink({ to, href, Icon, title }) {
  const inner = (
    <>
      <span className="me-set-icon" aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className="me-set-text">
        <strong>{title}</strong>
      </span>
      {href ? (
        <IconExternal className="me-link-arrow" width={14} height={14} />
      ) : (
        <IconChevronRight className="me-link-arrow" width={16} height={16} />
      )}
    </>
  )
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="me-set-row me-set-link">
          {inner}
        </a>
      ) : (
        <Link to={to} className="me-set-row me-set-link">
          {inner}
        </Link>
      )}
    </li>
  )
}

/** 앱 설치: 설치 창을 띄울 수 있으면 [설치], 아이폰 · 메뉴로만 되면 순서 안내. 이미 앱이면 보이지 않는다 */
function InstallRow() {
  const mode = useInstallMode()
  const [guide, setGuide] = useState(false)
  const [pending, setPending] = useState(false)
  if (mode === 'none') return null

  async function install() {
    if (mode !== 'prompt') return setGuide((v) => !v)
    setPending(true)
    try {
      await promptInstall()
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <SettingRow Icon={IconDownload} title="앱으로 설치" desc="홈 화면에서 바로 열고 채팅 알림도 받아요">
        <button type="button" className="btn btn-secondary btn-sm" onClick={install} disabled={pending} aria-expanded={mode === 'prompt' ? undefined : guide}>
          {mode === 'prompt' ? '설치' : '방법'}
        </button>
      </SettingRow>
      {guide && (
        <li className="me-set-guide">
          <ol>
            {mode === 'ios' ? (
              <>
                <li>
                  Safari 아래(아이패드는 위)의 <b>[공유]</b> 버튼을 눌러요.
                </li>
                <li>
                  <b>[홈 화면에 추가]</b>를 누르고 <b>[추가]</b>를 눌러요.
                </li>
              </>
            ) : (
              <>
                <li>
                  주소창 오른쪽의 <b>[⋮] 메뉴</b>를 눌러요.
                </li>
                <li>
                  <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 눌러요.
                </li>
              </>
            )}
            <li>홈 화면에 생긴 아이콘으로 열면 돼요.</li>
          </ol>
        </li>
      )}
    </>
  )
}

/** 설정: 알림 · 화면 · 앱 · 정보. 화면 설정은 이 기기에만 저장된다 (lib/preferences.js) */
function Settings({ user }) {
  const prefs = usePreferences()
  const push = pushSupport()
  return (
    <section className="card me-card me-settings" aria-labelledby="me-settings-title">
      <h2 id="me-settings-title" className="me-card-title">
        설정
      </h2>

      {user && (
        <div className="me-set-group">
          <h3>알림</h3>
          <ul className="me-set-list">
            <SettingRow
              Icon={IconBell}
              title="채팅 알림"
              desc={
                push === 'supported'
                  ? '새 채팅을 이 기기의 휴대폰 상단 알림으로 받아요'
                  : push === 'ios-install'
                    ? '아이폰은 앱으로 설치하면 알림을 받을 수 있어요'
                    : '이 브라우저에서는 알림을 받을 수 없어요'
              }
            >
              {push === 'supported' && <PushToggle userId={user.id} />}
            </SettingRow>
          </ul>
        </div>
      )}

      <div className="me-set-group">
        <h3>화면</h3>
        <ul className="me-set-list">
          <SettingRow Icon={IconMoon} title="테마" desc="자동은 휴대폰의 다크 모드 설정을 따라가요" stacked>
            <div className="me-seg" role="radiogroup" aria-label="테마">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={prefs.theme === t.value}
                  className={prefs.theme === t.value ? 'is-selected' : ''}
                  onClick={() => setPreference('theme', t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow Icon={IconWave} title="애니메이션 줄이기" desc="화면 전환 · 누를 때 움직임을 줄여요">
            <Switch
              label="애니메이션 줄이기"
              checked={prefs.motion === 'reduce'}
              onChange={(on) => setPreference('motion', on ? 'reduce' : 'system')}
            />
          </SettingRow>
          {canVibrate() && (
            <SettingRow Icon={IconVibrate} title="진동" desc="꾹 눌러 메뉴를 열 때 짧게 진동해요">
              <Switch label="진동" checked={prefs.haptics} onChange={(on) => setPreference('haptics', on)} />
            </SettingRow>
          )}
        </ul>
      </div>

      <InstallGroup />

      <div className="me-set-group">
        <h3>정보</h3>
        <ul className="me-set-list">
          <SettingLink to="/privacy" Icon={IconShield} title="개인정보처리방침" />
          <SettingLink to="/terms" Icon={IconFile} title="서비스 약관" />
          <SettingLink href={OFFICIAL_DORM_URL} Icon={IconExternal} title="전북대 생활관 홈페이지" />
        </ul>
      </div>
    </section>
  )
}

/** 앱 설치 묶음 (설치할 수 없거나 이미 앱이면 묶음째 숨긴다) */
function InstallGroup() {
  const mode = useInstallMode()
  if (mode === 'none') return null
  return (
    <div className="me-set-group">
      <h3>앱</h3>
      <ul className="me-set-list">
        <InstallRow />
      </ul>
    </div>
  )
}

/**
 * 내 정보 (/me): 계정 · 룸메이트 찾기 정보(기본 정보 + 체크리스트) · 바로가기 · 설정 · 로그아웃.
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

        {/* 화면 설정은 로그인하지 않아도 바꿀 수 있다 (이 기기에만 저장) */}
        {status === 'signedOut' && <Settings user={null} />}

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
                <Shortcut to="/me/posts" Icon={IconFile} label="내가 쓴 글" desc="모집완료 · 수정 · 삭제 · 받은 신청" />
                <Shortcut to="/chats" state={{ action: 'blocks' }} Icon={IconBlock} label="차단 관리" desc="차단한 사용자 보기 · 해제" />
                <Shortcut to="/roommates" state={{ action: 'archive' }} Icon={IconArchive} label="지난 학기 글" />
              </ul>
            </section>

            <Settings user={user} />

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
