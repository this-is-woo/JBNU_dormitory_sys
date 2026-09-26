import Modal from '../common/Modal.jsx'
import ChecklistView from './ChecklistView.jsx'
import { requestButton } from './RoommateCard.jsx'
import { collegeName, dormName, genderLabel, timeAgo } from './postFormat.js'

/** 게시글 전체 보기: 기본 정보 + 체크리스트 + 자기소개. 연락은 룸메 신청으로 */
export default function PostDetailModal({ post, mine = false, sent = false, myGender = null, onClose, onEdit, onRequest, onBlock }) {
  const action = post && requestButton(post, mine, sent, myGender)
  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      size="lg"
      title={post ? `${dormName(post.dormitory)} 룸메이트 ${post.isClosed ? '모집완료' : '찾아요'}` : ''}
      subtitle={post && `${collegeName(post.collegeCode)} · ${post.age}세 · ${genderLabel(post.gender)} · ${timeAgo(post.createdAt)}`}
      footer={
        post && (
          <>
            <p className="rm-contact">
              {mine
                ? '신청한 사람들의 체크리스트를 나와 비교해 볼 수 있어요.'
                : action.disabled && !post.isClosed
                  ? '룸메이트는 같은 성별끼리만 신청할 수 있어요.'
                  : sent
                    ? '신청을 보냈어요. 글쓴이의 답장은 [신청 내역 → 보낸 신청]에서 볼 수 있어요.'
                    : '마음에 들면 룸메 신청을 보내 보세요.'}
            </p>
            <button
              type="button"
              className={`btn rm-request-btn ${action.tone}`}
              disabled={action.disabled}
              onClick={() => onRequest(post)}
            >
              {action.label}
              {action.count > 0 && <span className="rm-request-count tabular">{action.count}</span>}
            </button>
            {mine && (
              <button type="button" className="btn btn-secondary" onClick={() => onEdit(post)}>
                수정
              </button>
            )}
            {!mine && onBlock && (
              <button type="button" className="btn btn-ghost rq-block" onClick={() => onBlock(post)}>
                차단
              </button>
            )}
          </>
        )
      }
    >
      {post && (
        <div className="post-detail">
          <div className="post-detail-summary">
            <div>
              <span>호관</span>
              <strong>{dormName(post.dormitory)}</strong>
            </div>
            <div>
              <span>MBTI</span>
              <strong>{post.mbti ?? '비공개'}</strong>
            </div>
            <div>
              <span>단과대학</span>
              <strong>{collegeName(post.collegeCode)}</strong>
            </div>
          </div>
          {post.isClosed && (
            <p className="post-detail-closed">글쓴이가 룸메이트를 구해 모집을 마감했어요.</p>
          )}
          {post.content && <p className="post-detail-content">{post.content}</p>}
          <ChecklistView checklist={post.checklist} />
        </div>
      )}
    </Modal>
  )
}
