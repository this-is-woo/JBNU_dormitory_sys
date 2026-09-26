import { useState } from 'react'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'

/**
 * 되돌릴 수 없는 관리 작업(삭제 등) 확인 창.
 * target 이 있으면 열리고, onConfirm() 이 끝나면 부모가 닫는다. 실패하면 창에 오류를 보여 준다.
 */
export default function ConfirmModal({ target, title, subtitle, confirmLabel, tone = 'danger', onClose, onConfirm, children }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm(target)
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
      title={title}
      subtitle={subtitle}
      as="form"
      wrapperProps={{ onSubmit: submit, noValidate: true }}
      footer={
        <>
          <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
            취소
          </button>
          <button type="submit" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : confirmLabel}
          </button>
        </>
      }
    >
      {target && (
        <div className="adm-confirm">
          {children}
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
