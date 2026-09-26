import { useState } from 'react'
import { moderateUser } from '../../lib/admin.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import { suspendedUntilLabel } from './adminFormat.js'

const NOTE_MAX = 500
const DURATIONS = [
  { value: '3', label: '3일' },
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: 'forever', label: '무기한' },
  { value: 'date', label: '날짜 지정' },
]

const DAY = 24 * 60 * 60 * 1000

// <input type="date"> 의 오늘(한국 시간) 값: YYYY-MM-DD
const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

function untilFrom(duration, date) {
  if (duration === 'forever') return null
  if (duration === 'date') return date ? new Date(`${date}T23:59:59+09:00`).toISOString() : undefined
  return new Date(Date.now() + Number(duration) * DAY).toISOString()
}

/**
 * 이용 정지 · 해제 창.
 * target: { userId, email, isSuspended, suspendedUntil, note? }
 *   note 가 undefined 면(게시글·신고에서 연 경우) 기존 메모를 모르므로, 새로 적었을 때만 메모를 바꾼다.
 * onDone(message) 는 작업이 끝났을 때 부른다.
 */
export default function SuspendModal({ target, onClose, onDone }) {
  const [duration, setDuration] = useState('7')
  const [date, setDate] = useState('')
  const [note, setNote] = useState(target?.note ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const knowsNote = target?.note !== undefined
  const noteArg = () => (knowsNote ? (note !== target.note ? note : null) : note.trim() ? note : null)

  async function run(action) {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  function suspend(e) {
    e.preventDefault()
    const until = untilFrom(duration, date)
    if (until === undefined) return setError('정지를 끝낼 날짜를 골라 주세요.')
    run(async () => {
      await moderateUser(target.userId, { suspended: true, until, note: noteArg() })
      onDone(`${target.email ?? '사용자'}의 이용을 정지했어요 (${suspendedUntilLabel(until)}).`)
    })
  }

  const release = () =>
    run(async () => {
      await moderateUser(target.userId, { suspended: false, note: noteArg() })
      onDone(`${target.email ?? '사용자'}의 정지를 풀었어요.`)
    })

  const saveNote = () =>
    run(async () => {
      await moderateUser(target.userId, { note })
      onDone('메모를 저장했어요.')
    })

  const suspended = Boolean(target?.isSuspended)

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={suspended ? '이용 정지 관리' : '이용 정지'}
      subtitle={target?.email ?? target?.userId}
      as="form"
      wrapperProps={{ onSubmit: suspend, noValidate: true }}
      footer={
        <>
          <button type="button" className="btn btn-ghost rq-foot-cancel" onClick={onClose}>
            닫기
          </button>
          {knowsNote && (
            <button type="button" className="btn btn-secondary" onClick={saveNote} disabled={pending || note === target?.note}>
              메모만 저장
            </button>
          )}
          {suspended && (
            <button type="button" className="btn btn-secondary" onClick={release} disabled={pending}>
              정지 해제
            </button>
          )}
          <button type="submit" className="btn btn-danger" disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : suspended ? '기한 바꾸기' : '정지하기'}
          </button>
        </>
      }
    >
      {target && (
        <div className="adm-suspend">
          {suspended && (
            <p className="adm-suspend-now">
              지금 정지 중이에요 · <strong>{suspendedUntilLabel(target.suspendedUntil)}</strong>
            </p>
          )}
          <ul className="rq-block-effects">
            <li>룸메이트 찾기에서 글쓰기·수정, 룸메 신청, 답장, 신고를 할 수 없어요.</li>
            <li>이 사용자의 글과 신청은 다른 사람에게 보이지 않아요. 지우지는 않아서 해제하면 다시 보여요.</li>
            <li>정지 사실은 본인에게만 안내돼요.</li>
          </ul>

          <fieldset className="rp-field">
            <legend>정지 기간</legend>
            <ChoiceGroup label="정지 기간" options={DURATIONS} value={duration} onChange={setDuration} size="sm" />
            {duration === 'date' && (
              <label className="adm-date">
                <span>이 날까지 (한국 시간 밤 11시 59분)</span>
                <input
                  type="date"
                  className="input"
                  min={todayKst()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
          </fieldset>

          <label className="rp-field">
            <span className="rp-label">
              운영자 메모 <em>(선택 · 본인에게 보이지 않아요)</em>
              <span className="tabular">
                {note.length}/{NOTE_MAX}
              </span>
            </span>
            <textarea
              className="input"
              rows={3}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={knowsNote ? '정지 사유 등' : '정지 사유 등 (비워 두면 기존 메모를 그대로 둬요)'}
            />
          </label>

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
