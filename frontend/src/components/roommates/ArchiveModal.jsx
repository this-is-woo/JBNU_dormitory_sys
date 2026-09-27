import { useEffect, useState } from 'react'
import { fetchPostSemesters } from '../../lib/roommates.js'
import { semesterLabel } from '../../lib/semester.js'
import { IconAlert, IconChevronRight } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'

/**
 * 지난 학기 글 보기: 글이 있는 학기(모집 학기 제외)를 고르면 게시판이 그 학기 글을 읽기 전용으로 보여 준다.
 * recruit: 지금 모집 학기 · current: 지금 보고 있는 학기 · onPick(semester)
 */
export default function ArchiveModal({ open, userId, recruit, current, onPick, onClose }) {
  // status: 'loading' | 'ready' | 'error'
  const [list, setList] = useState({ status: 'loading', items: [] })

  // 열 때마다 새로 불러온다 (글 수가 바뀌었을 수 있다)
  useEffect(() => {
    if (!open) return
    let active = true
    setList({ status: 'loading', items: [] })
    fetchPostSemesters(userId)
      .then((items) => active && setList({ status: 'ready', items: items.filter((s) => s.semester !== recruit) }))
      .catch(() => active && setList({ status: 'error', items: [] }))
    return () => {
      active = false
    }
  }, [open, userId, recruit])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="지난 학기 글"
      subtitle={`지금은 ${semesterLabel(recruit)} 룸메이트를 모집하고 있어요. 지난 학기 글은 읽기만 할 수 있고 룸메 신청은 보낼 수 없어요.`}
    >
      {list.status === 'loading' && <p className="archive-status">불러오는 중…</p>}
      {list.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>학기 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
        </div>
      )}
      {list.status === 'ready' &&
        (list.items.length ? (
          <ul className="archive-list">
            {list.items.map(({ semester, count }) => (
              <li key={semester}>
                <button
                  type="button"
                  className={`archive-item${semester === current ? ' is-current' : ''}`}
                  aria-current={semester === current || undefined}
                  onClick={() => onPick(semester)}
                >
                  <strong>{semesterLabel(semester)}</strong>
                  <span className="tabular">글 {count}개</span>
                  <IconChevronRight width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="archive-status">아직 지난 학기 글이 없어요.</p>
        ))}
    </Modal>
  )
}
