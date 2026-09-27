import { useState } from 'react'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'

/**
 * 차단 확인 창. target: { title, context } (title 예: "이 글쓴이를 차단할까요?")
 * onConfirm() 이 끝나면 닫힌다. 실패하면 창에 오류를 보여 준다.
 */
export default function BlockConfirmModal({ target, onClose, onConfirm }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target?.title ?? ''}
      subtitle={target?.context}
      as="form"
      wrapperProps={{ onSubmit: submit, noValidate: true }}
      footer={
        <>
          <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : '차단하기'}
          </button>
        </>
      }
    >
      {target && (
        <div className="rq-confirm">
          <ul className="rq-block-effects">
            <li>서로의 글이 목록에 보이지 않아요.</li>
            <li>서로 룸메 신청을 보낼 수 없고, 두 사람 사이의 채팅은 지워져요.</li>
            <li>상대에게 차단 사실은 알리지 않아요.</li>
            <li>[채팅 → 차단 관리]에서 언제든 해제할 수 있어요.</li>
          </ul>
          {error && (
            <div className="notice notice-danger" role="alert">
              <IconAlert width={18} height={18} />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
