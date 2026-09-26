import { useState } from 'react'

const NOTE_MAX = 500

/** 운영자 메모: 평소엔 한 줄로 보이고, [메모]를 누르면 고쳐 쓸 수 있다. onSave(text) 는 Promise */
export default function NoteEditor({ value, onSave, label = '운영자 메모' }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setPending(true)
    setError('')
    try {
      await onSave(text)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  if (!editing) {
    return (
      <div className="adm-note">
        <span className="adm-note-label">{label}</span>
        <p className={value ? '' : 'is-empty'}>{value || '없음'}</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setText(value ?? '')
            setEditing(true)
          }}
        >
          {value ? '고치기' : '메모'}
        </button>
      </div>
    )
  }

  return (
    <div className="adm-note is-editing">
      <label>
        <span className="adm-note-label">
          {label}{' '}
          <span className="tabular">
            {text.length}/{NOTE_MAX}
          </span>
        </span>
        <textarea className="input" rows={2} maxLength={NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      {error && <p className="adm-note-error">{error}</p>}
      <div className="adm-note-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={pending}>
          취소
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending || text === (value ?? '')}>
          {pending ? <span className="spinner" aria-hidden="true" /> : '저장'}
        </button>
      </div>
    </div>
  )
}
