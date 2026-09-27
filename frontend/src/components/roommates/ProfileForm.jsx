import { useState } from 'react'
import { COLLEGES_SORTED } from '../../data/colleges.js'
import { DORMITORIES } from '../../data/dormitories.js'
import {
  CHECKLIST_ITEMS,
  CHECKLIST_SECTIONS,
  isAnswered,
  itemNumber,
  normalizeChecklist,
  toggleMulti,
} from '../../data/roommateChecklist.js'
import { AGE_MAX, AGE_MIN, GENDERS, MBTI_AXES } from '../../data/roommateOptions.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import Modal from '../common/Modal.jsx'

const STEPS = ['기본 정보', '룸메이트 체크리스트']
const OX = [
  { value: true, label: 'O' },
  { value: false, label: 'X' },
]

const EMPTY = {
  dormitory: '',
  gender: '',
  age: '',
  collegeCode: '',
  mbti: ['', '', '', ''],
  mbtiUnknown: false,
  checklist: {},
}

const fromProfile = (p) => ({
  dormitory: p.dormitory,
  gender: p.gender,
  age: String(p.age),
  collegeCode: p.collegeCode,
  mbti: p.mbti ? p.mbti.split('') : ['', '', '', ''],
  mbtiUnknown: !p.mbti,
  // 예전 형식의 답(잠버릇 O/X 등)은 새 형식으로, 옮길 수 없는 답은 비워 다시 고르게 한다
  checklist: normalizeChecklist(p.checklist),
})

function validateStep(step, f) {
  if (step === 0) {
    const age = Number(f.age)
    if (!f.gender) return '성별을 골라 주세요.'
    if (!f.dormitory) return '호관을 골라 주세요.'
    if (!DORMITORIES.find((d) => d.code === f.dormitory)?.genders.includes(f.gender))
      return '고른 호관은 다른 성별 전용이에요. 호관을 다시 골라 주세요.'
    if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) return `나이는 ${AGE_MIN}~${AGE_MAX} 사이로 입력해 주세요.`
    if (!f.collegeCode) return '단과대학을 골라 주세요.'
    if (!f.mbtiUnknown && f.mbti.some((c) => !c)) return 'MBTI 네 글자를 모두 고르거나 “잘 모름”을 선택해 주세요.'
  }
  if (step === 1) {
    const missing = CHECKLIST_ITEMS.find((i) => !isAnswered(f.checklist[i.key]))
    if (missing) return `${itemNumber(missing.key)}번 “${missing.label}”에 답해 주세요.`
  }
  return null
}

function ChecklistQuestion({ item, value, onChange }) {
  const multi = item.type === 'multi'
  const options =
    item.type === 'ox'
      ? OX
      : [...item.options, ...(multi ? [item.none] : [])].map((o) => ({ value: o, label: o }))
  // 복수 선택: 누른 선택지를 찾아 '없음'과 다른 선택지가 함께 골라지지 않게 한다
  function changeMulti(next) {
    const current = Array.isArray(value) ? value : []
    const clicked = next.find((v) => !current.includes(v)) ?? current.find((v) => !next.includes(v))
    if (clicked) onChange(toggleMulti(item, current, clicked))
  }
  return (
    <div className={`cl-question${isAnswered(value) ? ' is-answered' : ''}`}>
      <div className="cl-question-label">
        <span className="cl-no tabular">{itemNumber(item.key)}</span>
        <span>
          {item.label}
          {multi && <small className="cl-multi-hint"> (여러 개 선택 가능)</small>}
        </span>
      </div>
      <ChoiceGroup
        label={item.label}
        size="sm"
        variant={item.type === 'ox' ? 'ox' : undefined}
        multiple={multi}
        options={options}
        value={multi ? (Array.isArray(value) ? value : []) : value}
        onChange={multi ? changeMulti : onChange}
      />
    </div>
  )
}

/**
 * 내 기본 정보 + 룸메이트 체크리스트. 등록해야 룸메이트 찾기 게시판을 볼 수 있다.
 * initial 이 있으면 수정. 수정하면 내가 쓴 글에도 반영된다.
 */
export default function ProfileForm({ open, initial = null, onClose, onSubmit }) {
  const isEdit = Boolean(initial)
  const [form, setForm] = useState(() => (initial ? fromProfile(initial) : EMPTY))
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // patch 는 객체 또는 (이전 상태) => 객체
  const set = (patch) => {
    setForm((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
    setError('')
  }
  const answer = (key) => (value) => set((prev) => ({ checklist: { ...prev.checklist, [key]: value } }))

  const answeredCount = CHECKLIST_ITEMS.filter((i) => isAnswered(form.checklist[i.key])).length

  // 성별 전용 호관(한빛·대동관 남자, 새빛관 여자)은 다른 성별을 고르면 선택할 수 없다
  const dormOptions = DORMITORIES.map((d) => ({
    value: d.code,
    label: d.name,
    disabled: form.gender !== '' && !d.genders.includes(form.gender),
  }))

  function changeGender(gender) {
    const dorm = DORMITORIES.find((d) => d.code === form.dormitory)
    set({ gender, dormitory: dorm && !dorm.genders.includes(gender) ? '' : form.dormitory })
  }

  function goBack() {
    setStep(step - 1)
    setError('')
  }

  function close() {
    // 수정을 취소하면 다음에 열 때 원래 내용부터 다시 보여 준다
    if (isEdit) setForm(fromProfile(initial))
    setStep(0)
    setError('')
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    const message = validateStep(step, form)
    if (message) return setError(message)
    if (step < STEPS.length - 1) return setStep(step + 1)

    setSubmitting(true)
    try {
      await onSubmit({
        dormitory: form.dormitory,
        gender: form.gender,
        age: Number(form.age),
        collegeCode: form.collegeCode,
        mbti: form.mbtiUnknown ? null : form.mbti.join(''),
        checklist: form.checklist,
      })
      setStep(0)
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
      title={isEdit ? '내 정보 수정' : '내 정보 등록'}
      as="form"
      wrapperProps={{ onSubmit: handleSubmit, noValidate: true }}
      subtitle={
        <>
          <ol className="rm-steps" aria-label="진행 단계">
            {STEPS.map((label, i) => (
              <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
                <span className="rm-step-no">{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <p className="rm-profile-note">
            {isEdit
              ? '수정하면 내가 쓴 글에도 함께 반영돼요.'
              : '한 번만 등록하면 돼요. 등록하면 다른 사람의 글과 체크리스트를 볼 수 있고, 글쓰기는 소개만 적으면 끝나요. 마음에 드는 글에는 룸메 신청을 보낼 수 있어요.'}
          </p>
        </>
      }
      footer={
        <>
          <p className="rm-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn btn-ghost" onClick={step > 0 ? goBack : close}>
            {step > 0 ? '이전' : '취소'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <span className="spinner" aria-hidden="true" />}
            {step < STEPS.length - 1 ? '다음' : isEdit ? '수정하기' : '등록하기'}
          </button>
        </>
      }
    >
      {step === 0 && (
        <div className="rm-fieldset">
          <div className="rm-field">
            <span className="rm-label">성별</span>
            <ChoiceGroup label="성별" options={GENDERS} value={form.gender} onChange={changeGender} />
          </div>

          <div className="rm-field">
            <span className="rm-label">
              호관 <small>지원했거나 지원할 호관</small>
            </span>
            <ChoiceGroup label="호관" options={dormOptions} value={form.dormitory} onChange={(dormitory) => set({ dormitory })} />
          </div>

          <div className="rm-field-row">
            <label className="rm-field">
              <span className="rm-label">나이</span>
              <input
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={AGE_MIN}
                max={AGE_MAX}
                placeholder="나이"
                value={form.age}
                onChange={(e) => set({ age: e.target.value })}
              />
            </label>
            <label className="rm-field">
              <span className="rm-label">단과대학</span>
              <select
                className={`select${form.collegeCode ? '' : ' is-empty'}`}
                value={form.collegeCode}
                onChange={(e) => set({ collegeCode: e.target.value })}
              >
                <option value="" hidden>
                  단과대학
                </option>
                {COLLEGES_SORTED.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rm-field">
            <span className="rm-label">MBTI</span>
            <div className="rm-mbti-picker">
              {MBTI_AXES.map((pair, i) => (
                <ChoiceGroup
                  key={pair.join('')}
                  label={`MBTI ${i + 1}번째 글자`}
                  size="sm"
                  options={pair.map((c) => ({ value: c, label: c, disabled: form.mbtiUnknown }))}
                  value={form.mbti[i]}
                  onChange={(c) => set((prev) => ({ mbti: prev.mbti.map((x, j) => (j === i ? c : x)) }))}
                />
              ))}
              <ChoiceGroup
                label="MBTI 모름"
                size="sm"
                multiple
                options={[{ value: 'unknown', label: '잘 모름' }]}
                value={form.mbtiUnknown ? ['unknown'] : []}
                onChange={(v) => set({ mbtiUnknown: v.length > 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="cl-form">
          <div className="cl-progress" aria-live="polite">
            <span>
              전북대 룸메이트 체크리스트 · <strong className="tabular">{answeredCount}</strong> / {CHECKLIST_ITEMS.length}
            </span>
            <span className="cl-progress-bar">
              <span style={{ width: `${(answeredCount / CHECKLIST_ITEMS.length) * 100}%` }} />
            </span>
          </div>
          {CHECKLIST_SECTIONS.map((section) => (
            <section key={section.title} className="cl-section">
              <h3>{section.title}</h3>
              <div className="cl-questions">
                {section.items.map((item) => (
                  <ChecklistQuestion key={item.key} item={item} value={form.checklist[item.key]} onChange={answer(item.key)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
