// 룸메이트 글 공유 주소(/p/글id)의 미리보기 카드 (Vercel Function, vercel.json 의 rewrites 로 연결)
//
// 카카오톡 · 페이스북 등은 링크의 HTML 에서 og 태그만 읽는다 (화면의 JS 는 실행하지 않는다).
// 그래서 공유한 글의 호관 · 성별 · 나이 · 소개를 og 태그에 담은 작은 HTML 을 돌려주고,
// 사람이 열면 바로 그 글의 자세히 보기(/roommates?post=글id)로 보낸다.
//   · 글은 로그인하지 않은 방문자 권한(publishable key)으로 읽는다 → 숨긴 글 · 정지된 사용자의 글은 보이지 않는다
//   · 글을 못 읽으면(삭제 · 설정 전) 사이트 기본 카드로 보여 주고 똑같이 이동한다
// 환경변수: VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY (프런트엔드와 같은 값을 그대로 쓴다)
import { findCollege } from '../src/data/colleges.js'
import { DORMITORIES } from '../src/data/dormitories.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE_TITLE = 'JBNU Dormi | 전북대 생활관 합격 예측 · 룸메이트 찾기'
const SITE_DESC = '환산점수 계산, 호관별 예상 합격률, 생활 습관이 맞는 룸메이트 찾기까지 한 곳에서.'

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

async function loadPost(id) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const res = await fetch(
    `${url.replace(/\/+$/, '')}/rest/v1/roommate_posts?id=eq.${id}&select=dormitory_code,room_type,gender,age,college_code,mbti,content,is_closed&limit=1`,
    { headers: { apikey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(3000) },
  )
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

/** 글 → 카드 제목 · 설명 */
export function describePost(post) {
  const dorm = DORMITORIES.find((d) => d.code === post.dormitory_code)?.name ?? '생활관'
  const where = [dorm, post.room_type].filter(Boolean).join(' ')
  const who = [post.gender === '여' ? '여자' : '남자', post.age && `${post.age}세`, findCollege(post.college_code)?.name, post.mbti]
    .filter(Boolean)
    .join(' · ')
  const intro = String(post.content ?? '').replace(/\s+/g, ' ').trim()
  const short = intro.length > 80 ? `${intro.slice(0, 80)}…` : intro
  return {
    title: `${where} 룸메이트 ${post.is_closed ? '모집완료' : '찾아요'} | JBNU Dormi`,
    description: [who, short || '생활 습관 체크리스트로 나와 잘 맞는지 확인하고 채팅으로 룸메 신청해 보세요.'].join(' — '),
  }
}

export function renderPage({ origin, target, card }) {
  const title = escapeHtml(card.title)
  const desc = escapeHtml(card.description)
  const to = escapeHtml(target)
  const image = escapeHtml(`${origin}/og/og-image.png`)
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="JBNU Dormi" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escapeHtml(origin + target)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0; url=${to}" />
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p><a href="${to}">룸메이트 글 보러 가기</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  const id = String(req.query?.id ?? '')
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'jbnu-dormitory-sys.vercel.app'
  const origin = `https://${String(host).split(',')[0].trim()}`
  const valid = UUID.test(id)
  const target = valid ? `/roommates?post=${id.toLowerCase()}` : '/roommates'

  let post = null
  if (valid) {
    try {
      post = await loadPost(id)
    } catch {
      post = null
    }
  }
  const card = post ? describePost(post) : { title: SITE_TITLE, description: SITE_DESC }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // 미리보기는 잠깐 캐시해 두고(같은 링크를 여러 사람이 열 때), 글이 없으면 짧게
  res.setHeader('Cache-Control', post ? 'public, s-maxage=300, stale-while-revalidate=600' : 'public, s-maxage=60')
  res.status(200).send(renderPage({ origin, target, card }))
}
