import Modal from '../common/Modal.jsx'
import ChecklistView from './ChecklistView.jsx'
import { requestButton } from './RoommateCard.jsx'
import { collegeName, dormName, genderLabel, matchCount, timeAgo } from './postFormat.js'
import { semesterLabel } from '../../lib/semester.js'

/** 체크리스트: 창을 열면 바로 보인다. 내 체크리스트가 있으면 나와 맞는 항목을 초록색으로 표시하고 개수를 제목 옆에 */
function ChecklistSection({ checklist, myChecklist }) {
  const same = myChecklist ? matchCount(myChecklist, checklist) : null
  return (
    <section className="post-detail-section">
      <h3 className="post-detail-heading">
        생활 습관 체크리스트
        {same !== null && <span className="post-detail-match tabular">나와 맞는 항목 {same}개</span>}
      </h3>
      <ChecklistView checklist={checklist} compare={myChecklist} />
    </section>
  )
}

/**
 * 자세히 보기: 체크리스트 (자기소개는 카드에서 본다). 연락은 룸메 신청으로
 * archived: 지난 학기 글이면 읽기만 (룸메 신청 버튼 없음)
 */
export default function PostDetailModal({ post, mine = false, sent = false, archived = false, myGender = null, myChecklist = null, onClose, onEdit, onRequest, onBlock, onReport }) {
  const action = post && requestButton(post, mine, sent, myGender)
  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      size="lg"
      title={post ? `${dormName(post.dormitory)} 룸메이트 ${post.isClosed ? '모집완료' : '찾아요'}` : ''}
      subtitle={
        post &&
        [
          archived && post.semester && semesterLabel(post.semester),
          genderLabel(post.gender),
          `${post.age}세`,
          collegeName(post.collegeCode),
          post.mbti ?? 'MBTI 비공개',
          timeAgo(post.createdAt),
        ]
          .filter(Boolean)
          .join(' · ')
      }
      footer={
        post && (
          <>
            <p className="rm-contact">
              {archived && !mine
                ? '지난 학기 글이라 룸메 신청은 할 수 없어요.'
                : mine
                ? '신청한 사람들의 체크리스트를 나와 비교해 볼 수 있어요.'
                : action.disabled && !post.isClosed
                  ? '룸메이트는 같은 성별끼리만 신청할 수 있어요.'
                  : sent
                    ? '신청을 보냈어요. 글쓴이의 답장은 [신청 내역 → 보낸 신청]에서 볼 수 있어요.'
                    : '마음에 들면 룸메 신청을 보내 보세요.'}
            </p>
            {(!archived || mine) && (
              <button
                type="button"
                className={`btn rm-request-btn ${action.tone}`}
                disabled={action.disabled}
                onClick={() => onRequest(post)}
              >
                {action.label}
                {action.count > 0 && <span className="rm-request-count tabular">{action.count}</span>}
              </button>
            )}
            {mine && (
              <button type="button" className="btn btn-secondary" onClick={() => onEdit(post)}>
                수정
              </button>
            )}
            {!mine && onReport && (
              <button type="button" className="btn btn-ghost rq-block" onClick={() => onReport(post)}>
                신고
              </button>
            )}
            {!mine && onBlock && (
              <button type="button" className="btn btn-ghost rq-danger" onClick={() => onBlock(post)}>
                차단
              </button>
            )}
          </>
        )
      }
    >
      {post && (
        <div className="post-detail">
          {mine && post.isOpen === false && (
            <p className="post-detail-closed">
              운영자가 이 글을 숨겼어요. 다른 사람에게 보이지 않고 신청을 받을 수 없어요. 궁금한 점은 운영자에게 문의해 주세요.
            </p>
          )}
          {post.isClosed && (
            <p className="post-detail-closed">글쓴이가 룸메이트를 구해 모집을 마감했어요.</p>
          )}
          <ChecklistSection checklist={post.checklist} myChecklist={mine ? null : myChecklist} />
        </div>
      )}
    </Modal>
  )
}
