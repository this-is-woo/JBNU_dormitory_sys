import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { counterpartRole } from './chatFormat.js'

/**
 * 채팅방 나가기 확인 (목록에서 꾹 눌러서 · 대화방 [⋯] 메뉴에서)
 * thread: 나갈 대화방 · onConfirm(quiet): 실제로 나가기 (실패하면 오류를 던진다)
 *   [나가기]: 상대에게 "OO가 채팅방을 나갔어요"가 보이고 상대 입력칸이 잠긴다
 *   [조용히 나가기]: 상대에게 알리지 않는다 (상대가 이미 나갔으면 어차피 대화가 지워지므로 보이지 않는다)
 */
export default function LeaveConfirmModal({ thread, onClose, onConfirm }) {
  const [pending, setPending] = useState(null) // 누른 버튼: 'quiet' | 'normal'
  const [error, setError] = useState('')
  const other = thread ? counterpartRole(thread) : ''
  const subtitle = !thread
    ? ''
    : thread.otherLeft
      ? `${other}도 이미 나가서, 나가면 이 대화가 완전히 지워져요.`
      : thread.role === 'applicant'
        ? `나가면 이 대화가 내 목록에서 사라지고 룸메 신청도 취소돼요. ${other}에게는 “신청자가 채팅방을 나갔어요”로 보여요. 조용히 나가면 ${other}에게 알리지 않아요.`
        : `나가면 이 대화가 내 목록에서 사라져요. ${other}에게는 “글쓴이가 채팅방을 나갔어요”로 보이고, 더는 메시지를 보낼 수 없어요. 조용히 나가면 ${other}에게 알리지 않아요.`

  async function confirm(quiet) {
    if (pending) return
    setPending(quiet ? 'quiet' : 'normal')
    setError('')
    try {
      await onConfirm(quiet)
    } catch (err) {
      setError(err.message)
      setPending(null)
    }
  }
  const canQuiet = thread && !thread.otherLeft

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
          {canQuiet && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => confirm(true)}
              disabled={Boolean(pending)}
              title={`${other}에게 알리지 않고 나가요`}
            >
              {pending === 'quiet' && <span className="spinner" aria-hidden="true" />}
              조용히 나가기
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => confirm(false)} disabled={Boolean(pending)}>
            {pending === 'normal' && <span className="spinner" aria-hidden="true" />}
            나가기
          </button>
        </>
      }
    />
  )
}
