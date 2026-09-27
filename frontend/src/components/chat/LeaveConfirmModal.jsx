import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { counterpartRole } from './chatFormat.js'

/**
 * 채팅방 나가기 확인 (목록에서 꾹 눌러서 · 대화방 [⋯] 메뉴에서)
 * thread: 나갈 대화방 · onConfirm: 실제로 나가기 (실패하면 오류를 던진다)
 */
export default function LeaveConfirmModal({ thread, onClose, onConfirm }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const other = thread ? counterpartRole(thread) : ''
  const subtitle = !thread
    ? ''
    : thread.otherLeft
      ? `${other}도 이미 나가서, 나가면 이 대화가 완전히 지워져요.`
      : thread.role === 'applicant'
        ? `나가면 이 대화가 내 목록에서 사라지고 룸메 신청도 취소돼요. ${other}에게는 “신청자가 채팅방을 나갔어요”로 보여요.`
        : `나가면 이 대화가 내 목록에서 사라져요. ${other}에게는 “글쓴이가 채팅방을 나갔어요”로 보이고, 더는 메시지를 보낼 수 없어요.`

  async function confirm() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message)
      setPending(false)
    }
  }

  return (
    <Modal
      open={Boolean(thread)}
      onClose={onClose}
      title="채팅방을 나갈까요?"
      subtitle={subtitle}
      footer={
        <>
          <p className="rm-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            아니요
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={pending}>
            나가기
          </button>
        </>
      }
    />
  )
}
