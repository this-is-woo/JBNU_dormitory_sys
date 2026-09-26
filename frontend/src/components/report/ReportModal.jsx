import { useEffect, useState } from 'react'
import { COLLEGES_SORTED, findCollege } from '../../data/colleges.js'
import { GENDERS } from '../../data/roommateOptions.js'
import {
  APPLY_ROOMS,
  GRADES,
  RESULTS,
  canApply,
  findApplyRoom,
  semesterLabel,
  semesterOptions,
} from '../../data/reportOptions.js'
import { deleteReport, fetchMyReports, saveReport } from '../../lib/admissionReports.js'
import { formatScore } from '../../lib/score.js'
import { IconAlert, IconInfo } from '../common/Icons.jsx'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import Modal from '../common/Modal.jsx'
import './ReportModal.css'

const SEMESTERS = semesterOptions()
const SCORE_PATTERN = /^\d{0,3}(\.\d{0,2})?$/

const emptyForm = (defaults) => ({
  gender: '',
  grade: '',
  collegeCode: defaults.collegeCode ?? '',
  score: defaults.score != null ? formatScore(defaults.score) : '',
  semester: SEMESTERS[0],
  appliedRoom: '',
  result: '',
  assignedDormitory: '',
})

const fromReport = (r) => ({
  gender: r.gender,
  grade: r.grade,
  collegeCode: r.collegeCode,
  score: formatScore(r.convertedScore),
  semester: r.semester,
  appliedRoom: r.appliedRoom,
  result: r.result,
  assignedDormitory: r.assignedDormitory ?? '',
})

const needsHall = (f) => f.appliedRoom === 'b_2' && f.result !== '' && f.result !== 'rejected'

function validate(f) {
  if (!f.gender) return '성별을 골라 주세요.'
  if (!f.grade) return '지원 당시 학년을 골라 주세요.'
  if (!f.collegeCode) return '단과대학을 골라 주세요.'
  if (findCollege(f.collegeCode)?.specialCampus) return '특성화캠퍼스(익산) 생활관 결과는 아직 받지 않아요.'
  const score = Number(f.score)
  if (f.score === '' || Number.isNaN(score) || score <= 0 || score > 120) return '환산점수를 확인해 주세요. (0 ~ 120)'
  if (!f.semester) return '학기를 골라 주세요.'
  const room = findApplyRoom(f.appliedRoom)
  if (!room) return '지원한 호실 유형을 골라 주세요.'
  if (!canApply(room, f)) return '성별·단과대학으로는 지원할 수 없는 호실이에요. 다시 확인해 주세요.'
  if (!f.result) return '결과를 골라 주세요.'
  if (needsHall(f) && !f.assignedDormitory) return '배정된 호관을 골라 주세요.'
  return null
}

function Field({ label, hint, children }) {
  return (
    <div className="rp-field">
      <span className="rp-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  )
}

/**
 * 합격 결과 제보 창. 계정당 학기별 1건이며, 이미 제보한 학기는 수정한다.
 * @param {{ collegeCode?: string, score?: number }} defaults  홈 계산기에서 가져온 값
 */
export default function ReportModal({ open, onClose, userId, defaults }) {
  const [reports, setReports] = useState({ status: 'loading', items: [] })
  const [form, setForm] = useState(() => emptyForm(defaults))
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null) // 방금 저장한 제보
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 창을 열 때마다 계산기 값으로 새로 시작하고 내 제보를 불러온다
  useEffect(() => {
    if (!open) return
    let active = true
    setForm(emptyForm(defaults))
    setEditingId(null)
    setError('')
    setDone(null)
    setConfirmDelete(false)
    setReports({ status: 'loading', items: [] })
    fetchMyReports(userId)
      .then((items) => active && setReports({ status: 'ready', items }))
      .catch((err) => active && setReports({ status: 'error', items: [], message: err.message }))
    return () => {
      active = false
    }
  }, [open, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      // 성별·단과대학이 바뀌어 더는 지원할 수 없는 호실이면 비운다
      const room = findApplyRoom(next.appliedRoom)
      if (room && !canApply(room, next)) next.appliedRoom = ''
      const hall = room?.halls?.find((h) => h.code === next.assignedDormitory)
      if (!needsHall(next) || (hall && !hall.genders.includes(next.gender))) next.assignedDormitory = ''
      return next
    })
    setError('')
    setDone(null)
    setConfirmDelete(false)
  }

  // 이미 제보한 학기를 새로 고르면 그 제보를 수정하도록 안내
  const existing = reports.items.find((r) => r.semester === form.semester && r.id !== editingId)
  const room = findApplyRoom(form.appliedRoom)
  const autofilled = !editingId && defaults.score != null && form.score === formatScore(defaults.score)

  function startEdit(report) {
    setForm(fromReport(report))
    setEditingId(report.id)
    setError('')
    setDone(null)
    setConfirmDelete(false)
  }

  function startNew() {
    setForm(emptyForm(defaults))
    setEditingId(null)
    setError('')
    setDone(null)
    setConfirmDelete(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (existing) return setError(`${semesterLabel(form.semester)}에는 이미 제보했어요. 위 목록에서 수정해 주세요.`)
    const message = validate(form)
    if (message) return setError(message)
    setSaving(true)
    try {
      const saved = await saveReport(
        {
          semester: form.semester,
          appliedRoom: form.appliedRoom,
          result: form.result,
          assignedDormitory: needsHall(form) ? form.assignedDormitory : null,
          convertedScore: Math.round(Number(form.score) * 100) / 100,
          gender: form.gender,
          collegeCode: form.collegeCode,
          grade: form.grade,
        },
        userId,
        editingId,
      )
      setReports((prev) => ({
        ...prev,
        items: [saved, ...prev.items.filter((r) => r.id !== saved.id)].sort((a, b) => b.semester.localeCompare(a.semester)),
      }))
      setDone({ ...saved, edited: Boolean(editingId) })
      setEditingId(saved.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      await deleteReport(editingId, userId)
      setReports((prev) => ({ ...prev, items: prev.items.filter((r) => r.id !== editingId) }))
      startNew()
    } catch (err) {
      setError(err.message)
    }
  }

  const resultLabel = (r) => {
    const base = RESULTS.find((x) => x.value === r.result)?.label
    const hall = findApplyRoom(r.appliedRoom)?.halls?.find((h) => h.code === r.assignedDormitory)
    return hall ? `${base} · ${hall.label}` : base
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editingId ? '제보 수정' : '합격 결과 제보'}
      subtitle="알려 주신 결과는 호실별 합격선을 추정하는 예측 모델 학습에만 쓰여요. 이메일·이름은 학습 데이터에 포함되지 않아요."
      as="form"
      wrapperProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        done ? (
          <>
            <p className="rp-done" role="status">
              {done.edited ? '수정했어요.' : '제보해 주셔서 고마워요!'} 다른 학기 결과도 있다면 알려 주세요.
            </p>
            <button type="button" className="btn btn-ghost" onClick={startNew}>
              다른 학기 제보
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              닫기
            </button>
          </>
        ) : (
          <>
            <p className="rp-error" role="alert">
              {error}
            </p>
            {editingId && (
              <button type="button" className={`btn ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`} onClick={handleDelete}>
                {confirmDelete ? '정말 삭제' : '삭제'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={editingId ? startNew : onClose}>
              {editingId ? '새로 쓰기' : '취소'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" aria-hidden="true" />}
              {editingId ? '수정하기' : '제보하기'}
            </button>
          </>
        )
      }
    >
      <div className="rp">
        {reports.status === 'error' && (
          <div className="notice notice-danger" role="alert">
            <IconAlert width={18} height={18} />
            <p>{reports.message}</p>
          </div>
        )}

        {reports.items.length > 0 && (
          <section className="rp-mine" aria-label="내 제보">
            <h3>내 제보</h3>
            <ul>
              {reports.items.map((r) => (
                <li key={r.id} className={r.id === editingId && !done ? 'is-editing' : ''}>
                  <span className="rp-mine-sem">{semesterLabel(r.semester)}</span>
                  <span className="rp-mine-room">{findApplyRoom(r.appliedRoom)?.label}</span>
                  <span className={`rp-mine-result is-${r.result}`}>{resultLabel(r)}</span>
                  <span className="rp-mine-score tabular">{formatScore(r.convertedScore)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(r)}
                    disabled={r.id === editingId && !done}
                  >
                    {r.id === editingId && !done ? '수정 중' : '수정·삭제'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rp-section">
          <h3>
            <span className="rp-step">1</span>내 정보
          </h3>
          <div className="rp-grid">
            <Field label="성별">
              <ChoiceGroup label="성별" options={GENDERS} value={form.gender} onChange={(gender) => set({ gender })} />
            </Field>
            <Field label="단과대학">
              <select
                className={`select${form.collegeCode ? '' : ' is-empty'}`}
                value={form.collegeCode}
                onChange={(e) => set({ collegeCode: e.target.value })}
                aria-label="단과대학"
              >
                <option value="" hidden>
                  단과대학
                </option>
                {COLLEGES_SORTED.filter((c) => !c.specialCampus).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="지원 당시 학년" hint="신입생은 입학 전·첫 학기에 지원한 경우">
            <ChoiceGroup label="지원 당시 학년" size="sm" options={GRADES} value={form.grade} onChange={(grade) => set({ grade })} />
          </Field>
          <Field label="환산점수" hint={autofilled ? '홈 계산기 값으로 채웠어요' : '선발 당시 환산점수'}>
            <div className="rp-score">
              <input
                className="input tabular"
                inputMode="decimal"
                placeholder="84.50"
                value={form.score}
                onChange={(e) => SCORE_PATTERN.test(e.target.value) && set({ score: e.target.value })}
                aria-label="환산점수"
              />
              <span>점</span>
            </div>
          </Field>
        </section>

        <section className="rp-section">
          <h3>
            <span className="rp-step">2</span>지원 정보
          </h3>
          <Field label="학기">
            <select className="select rp-semester" value={form.semester} onChange={(e) => set({ semester: e.target.value })} aria-label="학기">
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {semesterLabel(s)}
                  {reports.items.some((r) => r.semester === s) ? ' (제보함)' : ''}
                </option>
              ))}
            </select>
          </Field>
          {existing && (
            <div className="notice rp-existing">
              <IconInfo width={18} height={18} />
              <p>
                {semesterLabel(form.semester)}에는 이미 제보했어요.{' '}
                <button type="button" className="rp-link" onClick={() => startEdit(existing)}>
                  그 제보 수정하기
                </button>
              </p>
            </div>
          )}
          <Field label="지원한 호실 유형" hint={form.gender && form.collegeCode ? null : '성별·단과대학을 고르면 지원할 수 있는 호실만 선택돼요'}>
            <ChoiceGroup
              label="지원한 호실 유형"
              size="sm"
              options={APPLY_ROOMS.map((r) => ({
                value: r.code,
                label: r.hint ? `${r.label} (${r.hint})` : r.label,
                disabled: !canApply(r, form),
              }))}
              value={form.appliedRoom}
              onChange={(appliedRoom) => set({ appliedRoom })}
            />
          </Field>
        </section>

        <section className="rp-section">
          <h3>
            <span className="rp-step">3</span>결과
          </h3>
          <Field label="선발 결과">
            <ChoiceGroup
              label="선발 결과"
              options={RESULTS.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
              value={form.result}
              onChange={(result) => set({ result })}
            />
          </Field>
          {needsHall(form) && (
            <Field label="배정된 호관" hint="B타입 2인실은 합격 후 점수 순으로 호관이 배정돼요">
              <ChoiceGroup
                label="배정된 호관"
                options={room.halls.map((h) => ({
                  value: h.code,
                  label: h.label,
                  disabled: Boolean(form.gender) && !h.genders.includes(form.gender),
                }))}
                value={form.assignedDormitory}
                onChange={(assignedDormitory) => set({ assignedDormitory })}
              />
            </Field>
          )}
          <p className="rp-note">불합격 결과도 합격선을 찾는 데 똑같이 중요해요. 떨어졌더라도 꼭 알려 주세요.</p>
        </section>
      </div>
    </Modal>
  )
}
