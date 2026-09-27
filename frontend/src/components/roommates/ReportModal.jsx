import { useState } from 'react'
import { DETAIL_MAX, REPORT_REASONS } from '../../lib/roommateReports.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'

/**
 * 신고 입력 창.
 * target: { title, context }  (예: "이 글을 신고할까요?", "게시글 · 대동관 · 2026년 2학기")
 * onSubmit({ reason, detail, block }) 가 끝나면 "접수 완료" 화면을 보여 준다.
 *   onSubmit 은 { blocked, blockFailed } 를 돌려줄 수 있다 (신고는 됐는데 차단만 실패한 경우를 알리려고).
 */
export default function ReportModal({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [block, setBlock] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [outcome, setOutcome] = useState(null) // { blocked, blockFailed }

  const needsDetail = reason === 'etc'

  async function submit(e) {
    e.preventDefault()
    if (pending || done) return
    if (!reason) return setError('신고 사유를 골라 주세요.')
    if (needsDetail && !detail.trim()) return setError('기타 사유는 신고 내용을 적어 주세요.')
    setPending(true)
    setError('')
    try {
      const result = await onSubmit({ reason, detail, block })
      setOutcome(result ?? { blocked: block })
      setDone(true)
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
      title={done ? '신고가 접수됐어요' : (target?.title ?? '')}
      subtitle={done ? '운영자가 확인한 뒤 필요하면 이용을 정지해요. 신고 사실은 상대에게 알리지 않아요.' : target?.context}
      as="form"
      wrapperProps={{ onSubmit: submit, noValidate: true }}
      footer={
        done ? (
          <button type="button" className="btn btn-primary rq-foot-cancel" onClick={onClose}>
            확인
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-danger" disabled={pending}>
              {pending ? <span className="spinner" aria-hidden="true" /> : '신고하기'}
            </button>
          </>
        )
      }
    >
      {target &&
        (done ? (
          <div className="rp-done">
            <span className="rp-done-mark" aria-hidden="true">
              ✓
            </span>
            <p>
              신고해 주셔서 고마워요.
              {outcome?.blocked && (
                <>
                  <br />이 사용자는 차단했어요. [채팅 → 차단 관리]에서 해제할 수 있어요.
                </>
              )}
              {outcome?.blockFailed && (
                <>
                  <br />
                  <strong>차단은 하지 못했어요.</strong> 잠시 후 [차단]을 다시 눌러 주세요.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="rp">
            <fieldset className="rp-field">
              <legend>
                신고 사유 <span className="rp-required">필수</span>
              </legend>
              <ChoiceGroup
                label="신고 사유"
                options={REPORT_REASONS}
                value={reason}
                onChange={(v) => {
                  setReason(v)
                  setError('')
                }}
              />
            </fieldset>

            <label className="rp-field">
              <span className="rp-label">
                신고 내용{' '}
                {needsDetail ? <span className="rp-required">필수</span> : <em>(선택)</em>}
                <span className="tabular">
                  {detail.length}/{DETAIL_MAX}
                </span>
              </span>
              <textarea
                className="input"
                rows={4}
                maxLength={DETAIL_MAX}
                value={detail}
                onChange={(e) => {
                  setDetail(e.target.value)
                  setError('')
                }}
                placeholder="어떤 점이 문제인지 구체적으로 적어 주시면 확인에 도움이 돼요."
              />
            </label>

            <label className="rp-check">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>
                이 사용자 차단하기
                <small>서로의 글이 보이지 않고 신청을 주고받을 수 없어요.</small>
              </span>
            </label>

            <p className="rp-note">
              신고한 순간의 글 내용이 함께 운영자에게 전달돼요. 신고 사실은 상대에게 알리지 않아요. 거짓 신고는 이용이
              제한될 수 있어요.
            </p>

            {error && (
              <div className="notice notice-danger" role="alert">
                <IconAlert width={18} height={18} />
                <p>{error}</p>
              </div>
            )}
          </div>
        ))}
    </Modal>
  )
}
