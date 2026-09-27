import { useState } from 'react'
import { semesterLabel } from '../../lib/semester.js'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { dormName } from './postFormat.js'

/**
 * 내 글 삭제 확인 창. post 가 있으면 열린다.
 * onConfirm() 이 끝나면 닫힌다. 실패하면 창에 오류를 보여 준다.
 */
export default function DeletePostModal({ post, onClose, onConfirm }) {
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
      open={Boolean(post)}
      onClose={onClose}
      title="이 글을 삭제할까요?"
      subtitle={post && `${dormName(post.dormitory)}${post.semester ? ` · ${semesterLabel(post.semester)} 입주` : ''}`}
      as="form"
      wrapperProps={{ onSubmit: submit, noValidate: true }}
      footer={
        <>
          <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : '삭제하기'}
          </button>
        </>
      }
    >
      {post && (
        <div className="rq-confirm">
          <ul className="rq-block-effects">
            <li>삭제한 글은 되돌릴 수 없어요.</li>
            <li>이 글로 시작된 채팅은 지워지지 않아요. 채팅 목록에서 계속 이어 갈 수 있어요.</li>
            <li>모집만 멈추고 싶다면 [내가 쓴 글]에서 모집완료로 바꿀 수 있어요.</li>
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
