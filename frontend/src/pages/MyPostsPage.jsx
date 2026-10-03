import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import ChoiceGroup from '../components/common/ChoiceGroup.jsx'
import { IconAlert, IconArrowLeft, IconChevronRight, IconFile, IconPencil, IconPlus } from '../components/common/Icons.jsx'
import DeletePostModal from '../components/roommates/DeletePostModal.jsx'
import ProfileForm from '../components/roommates/ProfileForm.jsx'
import RoommateForm from '../components/roommates/RoommateForm.jsx'
import { Intro } from '../components/roommates/RoommateCard.jsx'
import { dormTitle, timeAgo } from '../components/roommates/postFormat.js'
import { useAuth } from '../hooks/useAuth.js'
import { cachedProfile, fetchMyProfile, profileFields, saveProfile } from '../lib/roommateProfile.js'
import { deleteRoommatePost, fetchMyPosts, setRoommatePostClosed, updateRoommatePost } from '../lib/roommates.js'
import { semesterLabel } from '../lib/semester.js'
import { useSiteSettings } from '../lib/siteSettings.js'
// 글쓰기 · 내 정보 창, 한마디(더보기) 스타일은 룸메이트 찾기와 같다
import './RoommatesPage.css'
import './MyPostsPage.css'

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '모집 중' },
  { value: 'closed', label: '모집완료' },
]
const matches = (filter) => (post) => filter === 'all' || (filter === 'closed' ? post.isClosed : !post.isClosed)

function postStatus(post, recruit) {
  if (post.isOpen === false) return { tone: 'hidden', label: '숨겨짐' }
  if (post.isClosed) return { tone: 'closed', label: '모집완료' }
  if (post.semester && post.semester !== recruit) return { tone: 'past', label: '지난 학기' }
  return { tone: 'open', label: '모집 중' }
}

/** 내가 쓴 글 한 장: 제목(호관 호실) · 상태 · 한마디 · 받은 신청 · [모집완료] [수정] [삭제] */
function MyPostCard({ post, recruit, busy, onToggle, onEdit, onDelete }) {
  const status = postStatus(post, recruit)
  const edited = post.updatedAt && post.updatedAt !== post.createdAt
  return (
    <article className={`card mp-card is-${status.tone}`}>
      <header className="mp-card-head">
        <div className="mp-card-title">
          <strong>{dormTitle(post)}</strong>
          <span>
            {post.semester ? `${semesterLabel(post.semester)} · ` : ''}
            {timeAgo(post.createdAt)} 작성{edited ? ` · ${timeAgo(post.updatedAt)} 수정` : ''}
          </span>
        </div>
        <span className={`mp-status is-${status.tone}`}>{status.label}</span>
      </header>

      {post.isOpen === false && (
        <p className="mp-note">운영자가 숨긴 글이에요. 다른 사람에게 보이지 않고 신청을 받을 수 없어요.</p>
      )}

      {post.content ? <Intro text={post.content} /> : <p className="mp-no-content">룸메이트에게 한마디를 적지 않았어요.</p>}

      {post.requestCount > 0 ? (
        <Link to={`/chats?post=${post.id}`} className="mp-requests">
          <span>
            받은 신청 <b className="tabular">{post.requestCount}</b>
          </span>
          <IconChevronRight width={16} height={16} />
        </Link>
      ) : (
        <p className="mp-requests is-empty">아직 받은 신청이 없어요</p>
      )}

      <footer className="mp-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggle(post)} disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {post.isClosed ? '다시 모집하기' : '모집완료로 바꾸기'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(post)}>
          <IconPencil width={14} height={14} />
          수정
        </button>
        <button type="button" className="btn btn-ghost btn-sm mp-delete" onClick={() => onDelete(post)}>
          삭제
        </button>
      </footer>
    </article>
  )
}

/**
 * 내가 쓴 글 (/me/posts): 내 정보 탭에서 들어오는 관리 페이지.
 * 모집 중 · 모집완료로 걸러 보고, 글마다 모집완료 전환 · 수정 · 삭제 · 받은 신청(그 글의 채팅)으로 이동한다.
 */
export default function MyPostsPage() {
  const { status: authStatus, user } = useAuth()
  const { roommateSemester: recruit } = useSiteSettings()
  const navigate = useNavigate()
  const signedIn = authStatus === 'signedIn'
  const [state, setState] = useState({ status: 'loading', posts: [] })
  const [reload, setReload] = useState(0)
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [profile, setProfile] = useState(() => cachedProfile(user?.id) ?? null)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    fetchMyPosts(user.id)
      .then((posts) => active && setState({ status: 'ready', posts }))
      .catch((err) => active && setState({ status: 'error', posts: [], message: err.message }))
    // 수정할 때 내 성별에 맞는 호관만 고를 수 있게 (내 정보)
    fetchMyProfile(user.id)
      .then((p) => active && setProfile(p))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [signedIn, user?.id, reload])

  const replace = (saved) => setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === saved.id ? saved : p)) }))

  async function toggleClosed(post) {
    if (busyId) return
    setBusyId(post.id)
    setError('')
    try {
      replace(await setRoommatePostClosed(post.id, !post.isClosed, user.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function submitEdit(values) {
    const next = { ...editing, ...(profile ? profileFields(profile) : {}), ...values }
    replace(await updateRoommatePost(editing.id, next, user.id))
    setEditing(null)
  }

  async function confirmDelete() {
    await deleteRoommatePost(deleting.id, user.id)
    setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== deleting.id) }))
    setDeleting(null)
  }

  async function saveMyProfile(values) {
    const saved = await saveProfile(values, user.id, Boolean(profile))
    setProfile(saved)
    setProfileOpen(false)
    // 내 정보를 고치면 내 글에도 반영된다 (DB 트리거) → 목록을 새로 받는다
    setReload((n) => n + 1)
  }

  const posts = state.posts
  const count = (value) => posts.filter(matches(value)).length
  const shown = posts.filter(matches(filter))
  const write = () => navigate('/roommates', { state: { action: 'write' } })

  return (
    <>
      <title>내가 쓴 글 | JBNU Dormi</title>
      <header className="page-header mp-header">
        <div className="container">
          <Link to="/me" className="mp-back">
            <IconArrowLeft width={18} height={18} />내 정보
          </Link>
          <div className="mp-title-row">
            <h1>내가 쓴 글</h1>
            {signedIn && (
              <button type="button" className="btn btn-primary btn-sm" onClick={write}>
                <IconPlus width={16} height={16} />
                글쓰기
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="container mp-page">
        {authStatus === 'loading' && <div className="card mp-skeleton" aria-busy="true" />}

        {authStatus === 'signedOut' && (
          <section className="card mp-empty">
            <p>로그인하면 내가 쓴 룸메이트 글을 관리할 수 있어요.</p>
            <Link to="/me" className="btn btn-primary">
              로그인하러 가기
            </Link>
          </section>
        )}

        {signedIn && (
          <>
            {state.status === 'ready' && posts.length > 0 && (
              <ChoiceGroup
                label="글 상태"
                size="sm"
                options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${count(f.value)}` }))}
                value={filter}
                onChange={setFilter}
              />
            )}

            {error && (
              <p className="rm-error" role="alert">
                {error}
              </p>
            )}

            {state.status === 'loading' && (
              <>
                <div className="card mp-skeleton" aria-busy="true" />
                <div className="card mp-skeleton" aria-hidden="true" />
              </>
            )}

            {state.status === 'error' && (
              <div className="notice notice-danger" role="alert">
                <IconAlert width={18} height={18} />
                <p>{state.message}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReload((n) => n + 1)}>
                  다시 시도
                </button>
              </div>
            )}

            {state.status === 'ready' && !posts.length && (
              <section className="card mp-empty">
                <span className="mp-empty-icon" aria-hidden="true">
                  <IconFile width={22} height={22} />
                </span>
                <p>아직 쓴 글이 없어요. 구하는 호관 · 호실을 고르고 한마디만 적으면 바로 올라가요.</p>
                <button type="button" className="btn btn-primary" onClick={write}>
                  첫 글 쓰기
                </button>
              </section>
            )}

            {state.status === 'ready' && posts.length > 0 && !shown.length && (
              <p className="mp-filter-empty">{FILTERS.find((f) => f.value === filter)?.label} 글이 없어요.</p>
            )}

            <div className="mp-list">
              {shown.map((post) => (
                <MyPostCard
                  key={post.id}
                  post={post}
                  recruit={recruit}
                  busy={busyId === post.id}
                  onToggle={toggleClosed}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {user && (
        <>
          <RoommateForm
            key={`edit-${editing?.id ?? 'none'}`}
            open={Boolean(editing)}
            initial={editing}
            profile={profile}
            semester={recruit}
            onEditProfile={() => setProfileOpen(true)}
            onClose={() => setEditing(null)}
            onSubmit={submitEdit}
          />
          <ProfileForm
            key={profile ? `profile-${profile.updatedAt}` : 'profile-new'}
            open={profileOpen}
            initial={profile}
            onClose={() => setProfileOpen(false)}
            onSubmit={saveMyProfile}
          />
          <DeletePostModal
            key={`delete-${deleting?.id ?? 'none'}`}
            post={deleting}
            onClose={() => setDeleting(null)}
            onConfirm={confirmDelete}
          />
        </>
      )}
    </>
  )
}
