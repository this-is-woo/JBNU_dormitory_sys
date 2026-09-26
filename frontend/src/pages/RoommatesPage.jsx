import { useEffect, useMemo, useState } from 'react'
import { IconAlert, IconInfo } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import ChecklistFilter, { countChecklistFilters, matchesChecklist } from '../components/roommates/ChecklistFilter.jsx'
import ChoiceGroup from '../components/roommates/ChoiceGroup.jsx'
import LoginGate from '../components/roommates/LoginGate.jsx'
import MyPostsModal from '../components/roommates/MyPostsModal.jsx'
import PostDetailModal from '../components/roommates/PostDetailModal.jsx'
import RoommateCard from '../components/roommates/RoommateCard.jsx'
import RoommateForm from '../components/roommates/RoommateForm.jsx'
import { DORMITORIES } from '../data/dormitories.js'
import { GENDERS } from '../data/roommateOptions.js'
import { authMode, useAuth } from '../hooks/useAuth.js'
import { createRoommatePost, fetchRoommatePosts, roommateStorage, updateRoommatePost } from '../lib/roommates.js'
import './RoommatesPage.css'

const ALL = 'all'
const withAll = (options) => [{ value: ALL, label: '전체' }, ...options]
const INITIAL_FILTERS = { dormitory: ALL, gender: ALL, checklist: {} }

function matches(post, f) {
  return (
    (f.dormitory === ALL || post.dormitory === f.dormitory) &&
    (f.gender === ALL || post.gender === f.gender) &&
    matchesChecklist(post.checklist, f.checklist)
  )
}

function RoommateBoard({ user }) {
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('loading')
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  // null: 닫힘 / { post: null }: 새 글 / { post }: 수정
  const [editor, setEditor] = useState(null)
  const [myPostsOpen, setMyPostsOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let active = true
    fetchRoommatePosts()
      .then((data) => {
        if (!active) return
        setPosts(data)
        setStatus('ready')
      })
      .catch(() => active && setStatus('error'))
    return () => {
      active = false
    }
  }, [])

  // 모집 중인 글을 먼저, 모집완료 글은 뒤로 (각각 최신순 유지)
  const visible = useMemo(
    () => posts.filter((p) => matches(p, filters)).sort((a, b) => Number(Boolean(a.isClosed)) - Number(Boolean(b.isClosed))),
    [posts, filters],
  )
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))
  const filtered = filters.dormitory !== ALL || filters.gender !== ALL || countChecklistFilters(filters.checklist) > 0
  const isMine = (post) => post.authorId === user.id

  const replacePost = (post) => setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)))

  async function handleSubmit(values) {
    if (editor?.post) {
      replacePost(await updateRoommatePost(editor.post.id, values, user.id))
    } else {
      const saved = await createRoommatePost(values, user.id)
      setPosts((prev) => [saved, ...prev])
    }
    setEditor(null)
  }

  function openEditor(post) {
    setDetail(null)
    setMyPostsOpen(false)
    setEditor({ post })
  }

  return (
    <>
      <div className="container rm-toolbar">
        <div className="rm-header-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setEditor({ post: null })}>
            글쓰기
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setMyPostsOpen(true)}>
            내가 쓴 글
          </button>
          {status === 'ready' && <span className="rm-count tabular">게시글 {posts.length}개</span>}
        </div>
      </div>

      <div className="container rm-layout">
        <aside className="rm-filters" aria-label="게시글 필터">
          <div className="rm-filter">
            <h2>호관</h2>
            <ChoiceGroup
              label="호관 필터"
              size="sm"
              options={withAll(DORMITORIES.map((d) => ({ value: d.code, label: d.name })))}
              value={filters.dormitory}
              onChange={setFilter('dormitory')}
            />
          </div>
          <div className="rm-filter">
            <h2>성별</h2>
            <ChoiceGroup label="성별 필터" size="sm" options={withAll(GENDERS)} value={filters.gender} onChange={setFilter('gender')} />
          </div>
          <ChecklistFilter value={filters.checklist} onChange={setFilter('checklist')} />
          {filtered && (
            <button type="button" className="btn btn-ghost btn-sm rm-filter-reset" onClick={() => setFilters(INITIAL_FILTERS)}>
              필터 모두 초기화
            </button>
          )}
        </aside>

        <section className="rm-feed" aria-label="룸메이트 찾기 게시글">
          {roommateStorage === 'local' && (
            <div className="notice">
              <IconInfo width={18} height={18} />
              <p>
                아직 데이터베이스가 연결되지 않아 새 글은 이 브라우저에만 저장됩니다. “예시” 글은 화면 확인용이에요.
              </p>
            </div>
          )}

          {status === 'loading' && (
            <div className="rm-grid">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="rm-card rm-skeleton" />
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="notice notice-danger" role="alert">
              <IconAlert width={18} height={18} />
              <p>게시글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            </div>
          )}

          {status === 'ready' &&
            (visible.length ? (
              <>
                {filtered && <p className="rm-result-count tabular">조건에 맞는 글 {visible.length}개</p>}
                <div className="rm-grid">
                  {visible.map((post) => (
                    <RoommateCard key={post.id} post={post} mine={isMine(post)} onOpen={setDetail} onEdit={openEditor} />
                  ))}
                </div>
              </>
            ) : (
              <div className="rm-empty">
                <p>{filtered ? '조건에 맞는 글이 없어요.' : '아직 등록된 글이 없어요.'}</p>
                {filtered ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setFilters(INITIAL_FILTERS)}>
                    필터 초기화
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={() => setEditor({ post: null })}>
                    첫 글 남기기
                  </button>
                )}
              </div>
            ))}
        </section>
      </div>

      <RoommateForm
        key={editor?.post?.id ?? 'new'}
        open={Boolean(editor)}
        initial={editor?.post ?? null}
        onClose={() => setEditor(null)}
        onSubmit={handleSubmit}
      />
      <MyPostsModal
        open={myPostsOpen}
        userId={user.id}
        onClose={() => setMyPostsOpen(false)}
        onView={setDetail}
        onEdit={openEditor}
        onChanged={replacePost}
        onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
      />
      <PostDetailModal post={detail} mine={detail ? isMine(detail) : false} onClose={() => setDetail(null)} onEdit={openEditor} />
    </>
  )
}

export default function RoommatesPage() {
  const { status, user, signIn, signInWithIdToken, signOut } = useAuth()

  return (
    <>
      <title>룸메이트 찾기 | JBNU 생활관</title>
      <PageHeader
        title="나와 잘 맞는 룸메이트 찾기"
        lead="전북대 룸메이트 체크리스트로 생활 습관을 남기고, 마음에 드는 글에 연락해 보세요. 비슷한 생활 패턴의 룸메이트를 만나면 기숙사 생활이 훨씬 편해져요."
      >
        {status === 'signedIn' && (
          <div className="rm-account">
            <span className="rm-account-dot" aria-hidden="true" />
            <span className="rm-account-who">
              <strong>{user.name}</strong>
              {user.email !== user.name && <span className="rm-account-email">{user.email}</span>}
            </span>
            {authMode === 'demo' && <span className="chip">데모</span>}
            <button type="button" className="rm-account-signout" onClick={signOut}>
              로그아웃
            </button>
          </div>
        )}
      </PageHeader>

      {status === 'loading' && (
        <div className="container">
          <div className="rm-card rm-skeleton" />
        </div>
      )}
      {status === 'signedOut' && (
        <div className="container">
          <LoginGate onSignIn={signIn} onIdToken={signInWithIdToken} />
        </div>
      )}
      {status === 'signedIn' && <RoommateBoard key={user.id} user={user} />}
    </>
  )
}
