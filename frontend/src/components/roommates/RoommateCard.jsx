import { IconExternal } from '../common/Icons.jsx'
import { collegeName, dormName, genderLabel, highlights, isLink, timeAgo } from './postFormat.js'

export default function RoommateCard({ post, mine, onOpen, onEdit }) {
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
        <span className="rm-dorm-name">{dormName(post.dormitory)}</span>
        <span className="rm-mbti">{post.mbti ?? 'MBTI 비공개'}</span>
      </div>

      <ul className="rm-traits">
        {highlights(post.checklist).map((h) => (
          <li key={h.label} className={h.warn ? 'is-warn' : ''}>
            {h.label}
          </li>
        ))}
      </ul>

      {post.content ? <p className="rm-content">{post.content}</p> : <div className="rm-content" />}

      <footer className="rm-card-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(post)}>
          체크리스트 보기
        </button>
        {mine ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(post)}>
            수정
          </button>
        ) : isLink(post.contact) && !post.isClosed && (
          <a href={post.contact} target="_blank" rel="noreferrer nofollow" className="btn btn-primary btn-sm">
            연락하기 <IconExternal width={14} height={14} />
          </a>
        )}
      </footer>
    </article>
  )
}
