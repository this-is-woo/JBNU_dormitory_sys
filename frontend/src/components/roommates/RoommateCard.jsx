import { CHECKLIST_ITEMS } from '../../data/roommateChecklist.js'
import { semesterLabel } from '../../lib/semester.js'
import { collegeName, dormName, genderLabel, timeAgo } from './postFormat.js'

/** 카드·자세히 보기 공통: 룸메 신청 버튼의 문구와 모양 */
export function requestButton(post, mine, sent, myGender) {
  if (mine) return { label: '받은 신청', tone: 'btn-secondary', count: post.requestCount }
  if (sent) return { label: '신청함 ✓', tone: 'btn-secondary is-sent' }
  // 룸메이트는 같은 성별끼리만
  if (myGender && post.gender !== myGender) return { label: '같은 성별만 신청 가능', tone: 'btn-secondary', disabled: true }
  if (post.isClosed) return { label: '모집 마감', tone: 'btn-secondary', disabled: true }
  return { label: '룸메 신청', tone: 'btn-primary' }
}

/**
 * match: 내 체크리스트와 같은 답의 수 (내 글이거나 모르면 null)
 * sent: 내가 이 글에 룸메 신청을 보냈는지, myGender: 내 체크리스트의 성별
 * onRequest: 남의 글이면 신청 보내기/취소, 내 글이면 받은 신청 보기
 */
export default function RoommateCard({ post, mine, sent = false, myGender = null, match = null, onOpen, onRequest, onEdit }) {
  const action = requestButton(post, mine, sent, myGender)
  return (
    <article className={`rm-card${post.isClosed ? ' is-closed' : ''}`}>
      <header className="rm-card-head">
        <div className="rm-who">
          <strong>{collegeName(post.collegeCode)}</strong>
          <span>
            {post.age}세 · {genderLabel(post.gender)}
          </span>
        </div>
        <div className="rm-when">
          {post.isClosed && <span className="rm-closed-badge">모집완료</span>}
          {mine && <span className="chip chip-primary">내 글</span>}
          {post.isSample && <span className="chip">예시</span>}
          <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
        </div>
      </header>

      <div className="rm-dorm">
        <div className="rm-dorm-main">
          <span className="rm-dorm-name">{dormName(post.dormitory)}</span>
          {post.semester && <span className="rm-semester">{semesterLabel(post.semester)} 입주</span>}
        </div>
        <span className="rm-mbti">{post.mbti ?? 'MBTI 비공개'}</span>
      </div>

      {match !== null && (
        <div className="rm-match" title="내 체크리스트와 답이 같은 항목 수">
          <span className="rm-match-bar" aria-hidden="true">
            <span style={{ width: `${(match / CHECKLIST_ITEMS.length) * 100}%` }} />
          </span>
          <span className="tabular">
            나와 <strong>{match}</strong>/{CHECKLIST_ITEMS.length} 일치
          </span>
        </div>
      )}

      {post.content ? <p className="rm-content">{post.content}</p> : <div className="rm-content" />}

      <footer className="rm-card-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(post)}>
          체크리스트 보기
        </button>
        <button
          type="button"
          className={`btn btn-sm rm-request-btn ${action.tone}`}
          disabled={action.disabled}
          onClick={() => onRequest(post)}
        >
          {action.label}
          {action.count > 0 && <span className="rm-request-count tabular">{action.count}</span>}
        </button>
        {mine && (
          <button type="button" className="btn btn-ghost btn-sm rm-edit-btn" onClick={() => onEdit(post)}>
            수정
          </button>
        )}
      </footer>
    </article>
  )
}
