import { IconExternal } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import ChecklistView from './ChecklistView.jsx'
import { collegeName, dormName, genderLabel, isLink, timeAgo } from './postFormat.js'

/** 게시글 전체 보기: 기본 정보 + 체크리스트 + 자기소개 + 연락 방법 */
export default function PostDetailModal({ post, mine = false, onClose, onEdit }) {
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
              <span>연락 방법</span>
              {post.contact}
            </p>
            {mine && (
              <button type="button" className="btn btn-secondary" onClick={() => onEdit(post)}>
                수정
              </button>
            )}
            {isLink(post.contact) && !post.isClosed && !mine && (
              <a href={post.contact} target="_blank" rel="noreferrer nofollow" className="btn btn-primary">
                연락하기 <IconExternal width={14} height={14} />
              </a>
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
