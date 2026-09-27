import { useState } from 'react'
import { setSupportEnabled } from '../../lib/admin.js'
import { useSiteSettings } from '../../lib/siteSettings.js'

/** 사이트 설정: 지금은 후원(개발자 삼각김밥 사주기) 메뉴 켜기/끄기 */
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
    </section>
  )
}
