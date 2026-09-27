import { useState } from 'react'
import { CONTENT_MAX } from '../../data/roommateOptions.js'
import { semesterLabel } from '../../lib/semester.js'
import Modal from '../common/Modal.jsx'
import { collegeName, dormName, genderLabel } from './postFormat.js'

const EMPTY = { content: '' }
const fromPost = (post) => ({ content: post.content ?? '' })

/**
 * 글쓰기: 기본 정보·체크리스트는 내 정보(프로필)에서 가져오고, 소개만 적는다. 연락은 룸메 신청으로 한다.
 * 학기는 고르지 않는다: 새 글은 지금 모집 학기(semester)로 올라가고, 수정해도 학기는 그대로다.
 * initial 이 있으면 그 글을 수정한다.
 */
export default function RoommateForm({ open, initial = null, profile, semester, onEditProfile, onClose, onSubmit }) {
  const isEdit = Boolean(initial)
  const [form, setForm] = useState(() => (initial ? fromPost(initial) : EMPTY))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setError('')
  }

  function close() {
    // 수정을 취소하면 다음에 열 때 원래 내용부터 다시 보여 준다 (새 글은 쓰던 내용 유지)
    if (isEdit) setForm(fromPost(initial))
    setError('')
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ content: form.content.trim() })
      if (!isEdit) setForm(EMPTY)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={isEdit ? '글 수정' : '글쓰기'}
      subtitle={`${semesterLabel(isEdit ? initial.semester ?? semester : semester)} 룸메이트 모집 글이에요. 기본 정보와 체크리스트는 등록해 둔 내 정보가 그대로 들어가요.`}
      as="form"
      wrapperProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <p className="rm-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn btn-ghost" onClick={close}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <span className="spinner" aria-hidden="true" />}
            {isEdit ? '수정하기' : '등록하기'}
          </button>
        </>
      }
    >
      <div className="rm-fieldset">
        {profile && (
          <div className="rm-profile-summary">
            <div>
              <strong>{dormName(profile.dormitory)}</strong>
              <span>
                {collegeName(profile.collegeCode)} · {profile.age}세 · {genderLabel(profile.gender)} ·{' '}
                {profile.mbti ?? 'MBTI 비공개'}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEditProfile}>
              내 정보 수정
            </button>
          </div>
        )}

        <label className="rm-field">
          <span className="rm-label">
            자기소개 <small>선택 · 체크리스트에 없는 내용을 자유롭게 적어 주세요</small>
          </span>
          <textarea
            className="input rm-textarea"
            rows={7}
            maxLength={CONTENT_MAX}
            placeholder="예: 주말엔 본가에 가요. 향이 강한 음식은 방에서 먹지 않았으면 좋겠어요."
            value={form.content}
            onChange={(e) => set({ content: e.target.value })}
          />
          <span className="rm-counter tabular">
            {form.content.length} / {CONTENT_MAX}
          </span>
        </label>
      </div>
    </Modal>
  )
}
