import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import AdminActivity from '../components/admin/AdminActivity.jsx'
import AdminAdmissions from '../components/admin/AdminAdmissions.jsx'
import AdminGpaStats from '../components/admin/AdminGpaStats.jsx'
import AdminOverview from '../components/admin/AdminOverview.jsx'
import AdminPosts from '../components/admin/AdminPosts.jsx'
import AdminReports from '../components/admin/AdminReports.jsx'
import AdminUsers from '../components/admin/AdminUsers.jsx'
import LoginModal from '../components/auth/LoginModal.jsx'
import { IconAlert, IconInfo } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import { useAdmin } from '../hooks/useAdmin.js'
import { fetchOverview } from '../lib/admin.js'
import NotFoundPage from './NotFoundPage.jsx'
// 체크리스트 보기(ChecklistView) · 확인 창 목록 스타일은 룸메이트 페이지와 같이 쓴다
import './RoommatesPage.css'
import './AdminPage.css'

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'posts', label: '게시글' },
  { id: 'reports', label: '신고' },
  { id: 'users', label: '사용자' },
  { id: 'admissions', label: '합격 제보' },
  { id: 'gpa', label: '학점 통계' },
  { id: 'activity', label: '기록' },
]

const LOGIN_POINTS = ['관리자 구글 계정으로 로그인해 주세요.', '관리 권한은 서버에서 한 번 더 확인해요.']

function AdminShell({ children }) {
  return (
    <>
      <title>관리자 | JBNU Dormi</title>
      <meta name="robots" content="noindex, nofollow" />
      {children}
    </>
  )
}

export default function AdminPage() {
  const { status, adminStatus, isAdminEmail, signIn, signInWithIdToken } = useAdmin()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview'
  const initial = { search: params.get('q') ?? '', status: params.get('status') }
  const [overview, setOverview] = useState({ status: 'loading' })
  const [flash, setFlash] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const flashTimer = useRef(null)
  const tabsRef = useRef(null)

  const loadOverview = useCallback(() => {
    setOverview((o) => ({ ...o, loading: true }))
    fetchOverview()
      .then((data) => setOverview({ status: 'ready', data }))
      .catch((err) => setOverview({ status: 'error', message: err.message }))
  }, [])

  useEffect(() => {
    if (adminStatus === 'yes') loadOverview()
  }, [adminStatus, loadOverview])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const notify = useCallback((message, tone = 'ok') => {
    clearTimeout(flashTimer.current)
    setFlash({ message, tone, key: Date.now() })
    flashTimer.current = setTimeout(() => setFlash(null), 4000)
  }, [])

  /** 다른 탭으로 이동 (예: 신고 → 그 사용자의 글). search·status 는 이동한 탭의 첫 검색어·필터 */
  const go = useCallback(
    (nextTab, { search, status: nextStatus } = {}) => {
      const next = { tab: nextTab }
      if (search) next.q = search
      if (nextStatus) next.status = nextStatus
      setParams(next)
      tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    },
    [setParams],
  )

  if (status === 'loading' || adminStatus === 'loading') {
    return (
      <AdminShell>
        <div className="container adm-gate">
          <p className="adm-empty">확인하는 중…</p>
        </div>
      </AdminShell>
    )
  }

  if (status === 'signedOut') {
    return (
      <AdminShell>
        <PageHeader title="관리자" lead="관리자 계정으로 로그인하면 이용할 수 있어요." />
        <div className="container adm-gate">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setLoginOpen(true)}>
            구글 계정으로 로그인
          </button>
        </div>
        <LoginModal
          open={loginOpen}
          reason="관리자 페이지는 로그인이 필요해요."
          points={LOGIN_POINTS}
          onClose={() => setLoginOpen(false)}
          onSignIn={signIn}
          onIdToken={signInWithIdToken}
        />
      </AdminShell>
    )
  }

  if (adminStatus !== 'yes') {
    // 관리자 이메일인데 DB 에 등록되지 않은 경우만 안내하고, 그 밖에는 없는 페이지처럼 보인다
    if (!isAdminEmail) return <NotFoundPage />
    return (
      <AdminShell>
        <PageHeader title="관리자 등록이 필요해요" />
        <div className="container adm-gate">
          <div className="notice notice-warning">
            <IconInfo width={18} height={18} />
            <div>
              <p>
                이 계정은 관리자 이메일이지만 서버의 관리자 목록(admins)에 아직 없어요. Supabase SQL Editor 에서{' '}
                <code>supabase/migrations/20261010000000_admin.sql</code> 을 실행해 주세요.
              </p>
              <p>이미 실행했다면, 이 계정으로 로그인한 지금 파일 맨 아래 “관리자 등록” insert 문만 다시 실행하면 돼요.</p>
            </div>
          </div>
        </div>
      </AdminShell>
    )
  }

  const pending = overview.data?.reportsPending ?? 0
  const panelKey = `${tab}:${params.toString()}`

  return (
    <AdminShell>
      <PageHeader
        title="관리자"
        lead="룸메이트 게시글, 신고, 사용자, 합격 제보를 한곳에서 관리해요. 여기서 한 일은 모두 관리 기록에 남아요."
      />

      <div className="container adm-page">
        <nav className="adm-tabs" role="tablist" aria-label="관리 메뉴" ref={tabsRef}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`adm-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="adm-tabpanel"
              className={`adm-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => go(t.id)}
            >
              {t.label}
              {t.id === 'reports' && pending > 0 && (
                <span className="adm-tab-badge tabular" aria-label={`처리 대기 ${pending}건`}>
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div id="adm-tabpanel" role="tabpanel" aria-labelledby={`adm-tab-${tab}`} key={panelKey}>
          {tab === 'overview' && <AdminOverview overview={overview} onGo={go} />}
          {tab === 'posts' && (
            <AdminPosts
              initial={initial}
              notify={notify}
              onChanged={loadOverview}
              onOpenUser={(search) => go('users', { search })}
            />
          )}
          {tab === 'reports' && (
            <AdminReports
              notify={notify}
              onChanged={loadOverview}
              onOpenPost={(id) => go('posts', { search: id })}
              onOpenUser={(search) => go('users', { search })}
            />
          )}
          {tab === 'users' && (
            <AdminUsers initial={initial} notify={notify} onChanged={loadOverview} onOpenPosts={(search) => go('posts', { search })} />
          )}
          {tab === 'admissions' && <AdminAdmissions notify={notify} onChanged={loadOverview} />}
          {tab === 'gpa' && <AdminGpaStats />}
          {tab === 'activity' && <AdminActivity initial={initial} />}
        </div>
      </div>

      <div className="adm-toast-region" role="status" aria-live="polite">
        {flash && (
          <div key={flash.key} className={`adm-toast${flash.tone === 'error' ? ' is-error' : ''}`}>
            {flash.tone === 'error' && <IconAlert width={16} height={16} />}
            {flash.message}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
