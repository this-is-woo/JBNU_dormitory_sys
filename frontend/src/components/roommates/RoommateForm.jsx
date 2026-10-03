import { useState } from 'react'
import { DORMITORIES } from '../../data/dormitories.js'
import { CONTENT_MAX } from '../../data/roommateOptions.js'
import { semesterLabel } from '../../lib/semester.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import Modal from '../common/Modal.jsx'
import { SINGLE_ROOM, collegeName, dormRooms, genderLabel, recruitRooms } from './postFormat.js'

// 구할 수 있는 호실이 하나뿐인 호관(대동 · 새빛 · 참빛관 2인실, 창의 · 혜민관은 1인실을 빼면 2인실)은 바로 그 호실로
const onlyRoom = (dormitory) => {
  const rooms = recruitRooms(dormitory)
  return rooms.length === 1 ? rooms[0] : ''
}

const EMPTY = { dormitory: '', roomType: '', content: '' }
// 예전 글: 호실이 비어 있거나 1인실이면 다시 고르게 한다
const fromPost = (post) => ({
  dormitory: post.dormitory ?? '',
  roomType: recruitRooms(post.dormitory).includes(post.roomType) ? post.roomType : onlyRoom(post.dormitory),
  content: post.content ?? '',
})

function validate(f, gender) {
  const dorm = DORMITORIES.find((d) => d.code === f.dormitory)
  if (!dorm) return '어느 호관 룸메이트를 구하는지 골라 주세요.'
  if (gender && !dorm.genders.includes(gender)) return '고른 호관은 다른 성별 전용이에요. 호관을 다시 골라 주세요.'
  if (!recruitRooms(f.dormitory).includes(f.roomType)) return '몇 인실 룸메이트를 구하는지 골라 주세요.'
  return null
}

/**
 * 글쓰기: 어느 관 몇 인실 룸메이트를 구하는지 고르고 '룸메이트에게 한마디'를 적는다.
 * 성별 · 나이 · 단과대학 · MBTI · 체크리스트는 내 정보(프로필)에서 가져온다. 연락은 룸메 신청으로 한다.
 * 1인실은 혼자 쓰는 방이라 고를 수 없다 (DB 도 1인실 글은 받지 않는다).
 * 학기는 고르지 않는다: 새 글은 지금 모집 학기(semester)로 올라가고, 수정해도 학기는 그대로다.
 * initial 이 있으면 그 글을 수정한다.
 */
export default function RoommateForm({ open, initial = null, profile, semester, onEditProfile, onClose, onSubmit }) {
  const isEdit = Boolean(initial)
  const [form, setForm] = useState(() => (initial ? fromPost(initial) : EMPTY))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const gender = profile?.gender ?? null

  const set = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setError('')
  }

  // 성별 전용 호관(한빛 · 대동관 남자, 새빛관 여자)은 내 성별과 다르면 고를 수 없다
  const dormOptions = DORMITORIES.map((d) => ({
    value: d.code,
    label: d.name,
    disabled: (gender && !d.genders.includes(gender)) || recruitRooms(d.code).length === 0,
  }))
  // 호관을 바꾸면 호실은 다시 고른다 (하나뿐이면 자동)
  const changeDormitory = (dormitory) =>
    set({ dormitory, roomType: dormitory === form.dormitory ? form.roomType : onlyRoom(dormitory) })
  const rooms = recruitRooms(form.dormitory)
  const hasSingle = dormRooms(form.dormitory).includes(SINGLE_ROOM)

  function close() {
    // 수정을 취소하면 다음에 열 때 원래 내용부터 다시 보여 준다 (새 글은 쓰던 내용 유지)
    if (isEdit) setForm(fromPost(initial))
    setError('')
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    const message = validate(form, gender)
    if (message) return setError(message)
    setSubmitting(true)
    try {
      await onSubmit({ dormitory: form.dormitory, roomType: form.roomType, content: form.content.trim() })
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
              <strong>
                {genderLabel(profile.gender)} · {profile.age}세
              </strong>
              <span>
                {collegeName(profile.collegeCode)} · {profile.mbti ?? 'MBTI 비공개'}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEditProfile}>
              내 정보 수정
            </button>
          </div>
        )}

        <div className="rm-field">
          <span className="rm-label">
            호관 <small>룸메이트를 구하는 호관</small>
          </span>
          <ChoiceGroup label="호관" options={dormOptions} value={form.dormitory} onChange={changeDormitory} />
        </div>

        {form.dormitory && (
          <div className="rm-field">
            <span className="rm-label">
              호실 <small>{hasSingle ? '1인실은 혼자 쓰는 방이라 모집하지 않아요' : '몇 인실 룸메이트를 구하나요'}</small>
            </span>
            <ChoiceGroup
              label="호실"
              options={rooms.map((r) => ({ value: r, label: r }))}
              value={form.roomType}
              onChange={(roomType) => set({ roomType })}
            />
          </div>
        )}

        {/* 칸 이름 없이 입력칸만 (화면 읽기 프로그램에는 aria-label 로 알려 준다) */}
        <label className="rm-field">
          <textarea
            aria-label="룸메이트에게 한마디 (선택)"
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
