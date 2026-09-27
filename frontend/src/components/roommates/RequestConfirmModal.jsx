import { useState } from 'react'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { MESSAGE_MAX } from '../../lib/roommateRequests.js'
import { semesterLabel } from '../../lib/semester.js'
import { IconAlert, IconBell } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { collegeName, dormName, genderLabel } from './postFormat.js'

/**
 * 룸메 신청 확인 창.
 * target: { post, mode: 'send' | 'cancel' }
 * onConfirm(message) 가 끝나면 닫힌다. 실패하면 창에 오류를 보여 준다.
 */
export default function RequestConfirmModal({ target, match = null, onClose, onConfirm }) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const post = target?.post
  const cancel = target?.mode === 'cancel'

  async function submit(e) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm(message)
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
      title={cancel ? '신청을 취소할까요?' : '룸메 신청을 보낼까요?'}
      subtitle={
        cancel
          ? '글쓴이의 받은 신청 목록에서 내 정보가 빠져요. 모집 중이면 다시 신청할 수 있어요.'
          : '확인을 누르면 글쓴이에게 신청이 전달돼요.'
      }
      as="form"
      wrapperProps={{ onSubmit: submit, noValidate: true }}
      footer={
        <>
          <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
            {cancel ? '닫기' : '취소'}
          </button>
          <button type="submit" className={`btn ${cancel ? 'btn-danger' : 'btn-primary'}`} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : cancel ? '신청 취소' : '신청 보내기'}
          </button>
        </>
      }
    >
      {post && (
        <div className="rq-confirm">
          <div className="rq-target">
            <div>
              <strong>{dormName(post.dormitory)}</strong>
              {post.semester && <span>{semesterLabel(post.semester)} 입주</span>}
            </div>
            <span className="rq-target-who">
              {collegeName(post.collegeCode)} · {post.age}세 · {genderLabel(post.gender)}
            </span>
            {match !== null && (
              <span className="rq-target-match tabular">
                나와 <strong>{match}</strong>/{CHECKLIST_ITEMS.length} 일치
              </span>
            )}
          </div>

          {!cancel && (
            <>
              <div className="rq-notice">
                <span className="rq-notice-icon">
                  <IconBell width={18} height={18} />
                </span>
                <div>
                  <strong>글쓴이에게 알림이 가요</strong>
                  <ul>
                    <li>글쓴이의 [받은 신청] 목록에 내 기본 정보와 체크리스트 {CHECKLIST_ITEMS.length}개 답이 전달돼요.</li>
                    <li>이메일·이름은 전달되지 않아요.</li>
                    <li>보낸 신청은 [자세히 보기]의 [신청함] 버튼이나 [신청 내역]에서 언제든 취소할 수 있어요.</li>
                  </ul>
                </div>
              </div>

              <label className="rq-message">
                <span className="rq-message-label">
                  한마디 <em>(선택)</em>
                  <span className="tabular">
                    {message.length}/{MESSAGE_MAX}
                  </span>
                </span>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={MESSAGE_MAX}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="글쓴이가 연락할 수 있도록 오픈채팅 링크나 인사를 남겨 보세요. 글쓴이에게만 보여요."
                />
              </label>
            </>
          )}

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
