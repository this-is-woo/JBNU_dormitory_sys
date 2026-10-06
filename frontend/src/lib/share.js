// 공유하기 (components/common/ShareButton.jsx)
//   · 휴대폰: 휴대폰의 공유 창(카카오톡 · 메시지 · 인스타그램 …)을 띄운다
//   · PC · 공유 창이 없는 곳(카카오톡 안에서 연 화면 등): 링크를 복사한다
// 링크를 카카오톡 등에 붙이면 미리보기 카드가 뜬다 (index.html 의 og 태그, 룸메 글은 api/share-post.js)

/** 클립보드에 쓰기 (지원하지 않는 브라우저는 숨긴 입력칸으로) */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

/** 이 사이트의 전체 주소 (예: '/p/글id' → 'https://…/p/글id') */
export const siteUrl = (path = '/') => new URL(path, window.location.origin).href

/** 룸메이트 글 공유 주소: 카카오톡 등에 붙이면 그 글의 미리보기 카드가 뜬다 */
export const postShareUrl = (postId) => siteUrl(`/p/${postId}`)

// 휴대폰처럼 손가락으로 쓰는 기기인지 (PC 의 공유 창은 낯설어서 링크 복사를 쓴다)
const touchDevice = () => window.matchMedia?.('(pointer: coarse)').matches ?? false

/**
 * 공유하기
 * @param {{ title?: string, text?: string, url: string }} data
 *   text 가 있으면 복사할 때 "text 링크" 로 함께 복사한다
 * @returns {Promise<'shared' | 'copied' | 'cancelled' | 'failed'>}
 */
export async function share({ title, text, url }) {
  if (navigator.share && touchDevice()) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // 공유 창을 띄우지 못하면 링크 복사로
    }
  }
  return (await copyText(text ? `${text}\n${url}` : url)) ? 'copied' : 'failed'
}
