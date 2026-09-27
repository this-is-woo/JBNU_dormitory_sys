import { useEffect, useState } from 'react'
import { deleteRoommatePost, fetchMyPosts, setRoommatePostClosed } from '../../lib/roommates.js'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { dormName, timeAgo } from './postFormat.js'

/** 로그인한 구글 계정으로 쓴 글 목록 + 모집완료 / 수정 / 자세히 보기 / 삭제 */
export default function MyPostsModal({ open, reloadKey = 0, userId, onClose, onView, onRequests, onEdit, onDeleted, onChanged }) {
  const [state, setState] = useState({ status: 'loading', posts: [] })
  const [confirmId, setConfirmId] = useState(null)
  const [error, setError] = useState('')
  // 처리 중인 글 (두 번 눌러 같은 요청이 두 번 가지 않게)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setState({ status: 'loading', posts: [] })
    setConfirmId(null)
    setError('')
    fetchMyPosts(userId)
      .then((posts) => active && setState({ status: 'ready', posts }))
      .catch((err) => active && setState({ status: 'error', posts: [], message: err.message }))
    return () => {
      active = false
    }
  }, [open, userId, reloadKey])

  async function remove(id) {
    if (busyId) return
    setBusyId(id)
    try {
      await deleteRoommatePost(id, userId)
      setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== id) }))
      setConfirmId(null)
      onDeleted(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleClosed(post) {
    if (busyId) return
    setBusyId(post.id)
    try {
      const saved = await setRoommatePostClosed(post.id, !post.isClosed, userId)
      setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === post.id ? saved : p)) }))
      setError('')
      onChanged(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="내가 쓴 글"
      subtitle="지금 로그인한 구글 계정으로 쓴 글이에요. 다른 기기에서도 같은 계정으로 로그인하면 관리할 수 있어요."
    >
      {state.status === 'loading' && <p className="my-posts-empty">불러오는 중…</p>}
      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'ready' && !state.posts.length && <p className="my-posts-empty">아직 작성한 글이 없어요.</p>}

      {error && (
        <p className="rm-error my-posts-error" role="alert">
          {error}
        </p>
      )}

      {state.posts.length > 0 && (
        <ul className="my-posts">
          {state.posts.map((post) => (
            <li key={post.id} className={`my-post${post.isClosed ? ' is-closed' : ''}`}>
              <div className="my-post-main">
                <div className="my-post-title">
                  <strong>{dormName(post.dormitory)}</strong>
                  {post.isClosed && <span className="rm-closed-badge">모집완료</span>}
                  {post.isOpen === false && (
                    <span className="chip chip-danger" title="다른 사람에게 보이지 않고 신청을 받을 수 없어요.">
                      운영자가 숨김
                    </span>
                  )}
                  {post.requestCount > 0 && (
                    <button type="button" className="my-post-requests" onClick={() => onRequests(post)}>
                      받은 신청 {post.requestCount}
                    </button>
                  )}
                  <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
                </div>
                <p>{post.content || '자기소개 없음'}</p>
              </div>
              <div className="my-post-actions">
                {confirmId === post.id ? (
                  <>
                    <span className="my-post-confirm">정말 삭제할까요?</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => remove(post.id)}
                      disabled={busyId === post.id}
                    >
                      삭제
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleClosed(post)}
                      disabled={busyId === post.id}
                    >
                      {post.isClosed ? '다시 모집하기' : '모집완료'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(post)}>
                      자세히
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(post)}>
                      수정
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(post.id)}>
                      삭제
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
