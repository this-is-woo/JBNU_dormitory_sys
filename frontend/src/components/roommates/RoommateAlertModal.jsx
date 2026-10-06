import { useState } from 'react'
import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { DORMITORIES } from '../../data/dormitories.js'
import { hasPushSubscription, pushHelp, pushPermission, pushSupport, pushUnavailable, registerPush, requestPushPermission } from '../../lib/push.js'
import { ALERT_THRESHOLDS, DEFAULT_THRESHOLD, deleteRoommateAlert, saveRoommateAlert } from '../../lib/roommateAlerts.js'
import PushHelpAction from '../chat/PushHelp.jsx'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconInfo } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'

const ALL = ''

/** 알림 설정 한 줄 요약 (예: "10개 이상 · 모든 호관") */
export function alertSummary(setting) {
  if (!setting) return '꺼짐'
  const dorm = DORMITORIES.find((d) => d.code === setting.dormitory)?.name ?? '모든 호관'
  return `${setting.minMatch}개 이상 · ${dorm}`
}

/**
 * 맞춤 룸메 알림 설정 창: 몇 개 이상 맞을 때 · 어느 호관 글을 알릴지
 * 저장하면 이 기기의 휴대폰 알림도 함께 켠다 (권한 창은 [알림 받기]를 누른 순간에 뜬다).
 * profile: 내 정보 (없으면 체크리스트부터 등록하도록) · initial: 지금 설정 (꺼져 있으면 null)
 */
export default function RoommateAlertModal({ open, userId, profile, initial, onClose, onSaved, onNeedProfile }) {
  const [minMatch, setMinMatch] = useState(initial?.minMatch ?? DEFAULT_THRESHOLD)
  const [dormitory, setDormitory] = useState(initial?.dormitory ?? ALL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const support = pushSupport()
  const help = pushUnavailable(support) ? pushHelp(support) : null
  const denied = support === 'supported' && pushPermission() === 'denied'

  // 내 성별이 들어갈 수 있는 호관만
  const dorms = DORMITORIES.filter((d) => !profile || d.genders.includes(profile.gender))
  const total = CHECKLIST_ITEMS.length

  async function save() {
    setBusy(true)
    setError('')
    try {
      // 이 기기 알림도 켠다: 권한 창은 누른 순간에 먼저 띄워야 한다 (특히 아이폰)
      if (support === 'supported' && pushPermission() !== 'denied') {
        const result = await requestPushPermission()
        if (result === 'granted' && !(await hasPushSubscription().catch(() => false))) {
          await registerPush().catch(() => {}) // 이 기기 등록에 실패해도 설정은 저장한다 (다른 기기로 받을 수 있다)
        }
      }
      const saved = await saveRoommateAlert(userId, { minMatch, dormitory: dormitory || null })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setError('')
    try {
      await deleteRoommateAlert(userId)
      onSaved(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="맞춤 룸메 알림"
      subtitle="나와 잘 맞는 새 글이 올라오면 휴대폰 알림으로 알려 드려요"
      footer={
        profile && (
          <>
            <p className="rm-error" role="alert">
              {error}
            </p>
            {initial && (
              <button type="button" className="btn btn-ghost" onClick={turnOff} disabled={busy}>
                알림 끄기
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {initial ? '저장' : '알림 받기'}
            </button>
          </>
        )
      }
    >
      {!profile ? (
        <div className="ra-empty">
          <p>내 체크리스트와 비교해서 알려 드려요. 먼저 내 정보(생활 습관 체크리스트)를 등록해 주세요.</p>
          <button type="button" className="btn btn-primary" onClick={onNeedProfile}>
            내 정보 등록하기
          </button>
        </div>
      ) : (
        <div className="rm-fieldset">
          {help && (
            <div className="notice ra-device" role="note">
              <IconInfo width={18} height={18} />
              <div>
                <p>{help.message} 다른 기기에서 알림을 켜 두었다면 그 기기로 받아요.</p>
                <PushHelpAction action={help.action} />
              </div>
            </div>
          )}
          {denied && (
            <div className="notice ra-device" role="note">
              <IconInfo width={18} height={18} />
              <p>이 기기는 알림이 차단되어 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용해 주세요.</p>
            </div>
          )}

          <div className="rm-field">
            <span className="rm-label">
              몇 개 이상 맞을 때 <small>체크리스트 {total}개 중</small>
            </span>
            <ChoiceGroup
              label="몇 개 이상 맞을 때"
              options={ALERT_THRESHOLDS.map((n) => ({ value: n, label: `${n}개 이상` }))}
              value={minMatch}
              onChange={setMinMatch}
            />
          </div>

          <div className="rm-field">
            <span className="rm-label">
              호관 <small>이 호관 글만 알려 드려요</small>
            </span>
            <ChoiceGroup
              label="호관"
              options={[{ value: ALL, label: '전체' }, ...dorms.map((d) => ({ value: d.code, label: d.name }))]}
              value={dormitory}
              onChange={setDormitory}
            />
          </div>

          <ul className="ra-notes">
            <li>같은 성별이 올린 이번 모집 학기 글만 알려 드려요.</li>
            <li>알림이 너무 많지 않게 하루에 5개까지만 보내요.</li>
            <li>알림을 누르면 그 글의 체크리스트가 바로 열려요.</li>
          </ul>
        </div>
      )}
    </Modal>
  )
}
