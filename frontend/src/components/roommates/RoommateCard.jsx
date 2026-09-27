import { Link } from 'react-router'
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
 * match: 내 정보와 같은 답의 수 (내 글이거나 모르면 null)
 * sent: 내가 이 글에 룸메 신청을 보냈는지 (카드에는 "신청함" 표시만, 신청은 자세히 보기 창에서)
 * onReport: 남의 글 신고 (없으면 버튼을 숨긴다), onDelete: 내 글 삭제 (없으면 버튼을 숨긴다)
 * adminLink: 관리자에게 이 글을 관리자 페이지에서 여는 [관리] 링크를 보여 준다
 */
export default function RoommateCard({ post, mine, sent = false, match = null, onOpen, onEdit, onReport, onDelete, adminLink = false }) {
  return (
    <article className={`rm-card${post.isClosed ? ' is-closed' : ''}`}>
      <header className="rm-card-head">
        <div className="rm-who">
          <strong>{collegeName(post.collegeCode)}</strong>
          <span>
            {post.age}세 · {genderLabel(post.gender)}
          </span>
        </div>
        {match !== null && (
          <div className="rm-match" title="내 정보와 답이 같은 항목 수">
            <span className="rm-match-bar" aria-hidden="true">
              <span style={{ width: `${(match / CHECKLIST_ITEMS.length) * 100}%` }} />
            </span>
            <span className="tabular">
              나와 <strong>{match}</strong>/{CHECKLIST_ITEMS.length} 일치
            </span>
          </div>
        )}
        <div className="rm-when">
          {post.isClosed && <span className="rm-closed-badge">모집완료</span>}
          {mine && post.isOpen === false && (
            <span className="chip chip-danger" title="운영자가 숨긴 글이에요. 다른 사람에게 보이지 않아요.">
              숨겨짐
            </span>
          )}
          {mine && <span className="chip chip-primary">내 글</span>}
          {mine && post.requestCount > 0 && <span className="chip tabular">받은 신청 {post.requestCount}</span>}
          {!mine && sent && <span className="chip chip-success">신청함</span>}
          {adminLink && !post.isSample && (
            <Link to={`/admin?tab=posts&q=${post.id}`} className="chip rm-admin-link" title="관리자 페이지에서 이 글 관리">
              관리
            </Link>
          )}
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

      <footer className="rm-card-foot">
        {/* 룸메 신청·받은 신청은 자세히 보기 창에서 (체크리스트와 자기소개를 본 뒤 신청하도록) */}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(post)}>
          자세히 보기
        </button>
        {mine ? (
          <div className="rm-own-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(post)}>
              수정
            </button>
            {onDelete && (
              <button type="button" className="btn btn-ghost btn-sm rm-delete-btn" onClick={() => onDelete(post)}>
                삭제
              </button>
            )}
          </div>
        ) : (
          onReport && (
            <button type="button" className="btn btn-ghost btn-sm rm-edit-btn rm-report-btn" onClick={() => onReport(post)}>
              신고
            </button>
          )
        )}
      </footer>
    </article>
  )
}
