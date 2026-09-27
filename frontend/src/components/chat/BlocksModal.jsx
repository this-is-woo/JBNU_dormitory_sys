import { useEffect, useState } from 'react'
import { fetchBlocks, unblock } from '../../lib/roommateRequests.js'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { timeAgo } from '../roommates/postFormat.js'

/** 차단 관리: 내가 차단한 사용자 (서로 익명이라 누구인지 대신 어디서 차단했는지만) */
export default function BlocksModal({ open, userId, onClose }) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    setState({ status: 'loading', items: [] })
    setError('')
    fetchBlocks(userId)
      .then((items) => active && setState({ status: 'ready', items }))
      .catch((err) => active && setState({ status: 'error', items: [], message: err.message }))
    return () => {
      active = false
    }
  }, [open, userId])

  async function release(id) {
    setError('')
    try {
      await unblock(id, userId)
      setState((s) => ({ ...s, items: s.items.filter((b) => b.id !== id) }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="차단 관리"
      subtitle="서로 익명이라 누구인지 대신 어디서 차단했는지만 보여요. 해제하면 서로의 글이 다시 보여요."
    >
      {state.status === 'loading' && <p className="chat-empty">불러오는 중…</p>}
      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {error && <p className="rm-error">{error}</p>}
      {state.status === 'ready' &&
        (state.items.length ? (
          <ul className="chat-blocks">
            {state.items.map((b) => (
              <li key={b.id}>
                <div>
                  <strong>{b.context || '차단한 사용자'}</strong>
                  <time dateTime={b.createdAt}>{timeAgo(b.createdAt)} 차단</time>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => release(b.id)}>
                  해제
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chat-empty">차단한 사용자가 없어요.</p>
        ))}
    </Modal>
  )
}
