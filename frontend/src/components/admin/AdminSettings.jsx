import { useState } from 'react'
import { setRoommateSemester, setSupportEnabled } from '../../lib/admin.js'
import { currentSemester, nextSemester, previousSemester, semesterLabel } from '../../lib/semester.js'
import { useSiteSettings } from '../../lib/siteSettings.js'

// 고를 수 있는 모집 학기: 지난 학기 ~ 두 학기 뒤 (지금 값이 범위 밖이면 그것도)
function semesterChoices(value) {
  const now = currentSemester()
  const list = [previousSemester(now), now, nextSemester(now), nextSemester(nextSemester(now))]
  return [...new Set([...list, value])].sort().reverse()
}

/** 룸메이트 찾기 모집 학기: 고른 뒤 [저장] (바꾸면 지금 글들이 모두 지난 학기 글이 되므로 바로 저장하지 않는다) */
function RoommateSemesterSetting({ notify }) {
  const { roommateSemester } = useSiteSettings()
  const [draft, setDraft] = useState(roommateSemester)
  const [saving, setSaving] = useState(false)
  const changed = draft !== roommateSemester

  async function save() {
    if (saving || !changed) return
    setSaving(true)
    try {
      await setRoommateSemester(draft)
      notify(`룸메이트 모집 학기를 ${semesterLabel(draft)}로 바꿨어요.`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="adm-setting">
      <div className="adm-setting-text">
        <strong id="adm-setting-semester">룸메이트 모집 학기</strong>
        <p>
          지금은 <b>{semesterLabel(roommateSemester)}</b>예요. 룸메이트 찾기에는 이 학기 글만 보이고, 새 글도 이 학기로
          올라가요. 다른 학기 글은 [지난 학기 글]에서 읽기만 할 수 있어요.
        </p>
      </div>
      <div className="adm-setting-control">
        <select
          className="select"
          aria-labelledby="adm-setting-semester"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
        >
          {semesterChoices(roommateSemester).map((s) => (
            <option key={s} value={s}>
              {semesterLabel(s)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!changed || saving} onClick={save}>
          저장
        </button>
      </div>
    </div>
  )
}

/** 사이트 설정: 후원(개발자 삼각김밥 사주기) 메뉴 켜기/끄기 · 룸메이트 모집 학기 */
export default function AdminSettings({ notify }) {
  const { supportEnabled } = useSiteSettings()
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (saving) return
    const next = !supportEnabled
    setSaving(true)
    try {
      await setSupportEnabled(next)
      notify(next ? '후원 메뉴를 켰어요.' : '후원 메뉴를 껐어요.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="adm-panel" aria-labelledby="adm-settings-title">
      <div className="adm-panel-head">
        <h2 id="adm-settings-title">설정</h2>
        <p>바꾸면 바로 저장되고 관리 기록에 남아요. 다른 사람 화면에는 새로고침하거나 새로 들어올 때 반영돼요.</p>
      </div>

      <div className="adm-setting">
        <div className="adm-setting-text">
          <strong id="adm-setting-support">후원 메뉴 (개발자 삼각김밥 사주기)</strong>
          <p>
            {supportEnabled
              ? '켜져 있어요. 헤더·모바일 메뉴·하단에 후원 메뉴가 보이고 후원 페이지를 열 수 있어요.'
              : '꺼져 있어요. 메뉴에서 사라지고, 후원 페이지 주소로 들어와도 없는 페이지로 보여요.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={supportEnabled}
          aria-labelledby="adm-setting-support"
          className={`adm-switch${supportEnabled ? ' is-on' : ''}`}
          disabled={saving}
          onClick={toggle}
        >
          <span className="adm-switch-knob" />
        </button>
      </div>

      <RoommateSemesterSetting notify={notify} />
    </section>
  )
}
