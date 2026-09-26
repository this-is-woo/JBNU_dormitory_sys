// 단과대학 목록. code 는 backend/app/colleges.py, Supabase colleges 테이블과 같아야 합니다.
// 출처: 전북대학교 홈페이지 > 대학 (2026)
// specialCampus: 특성화캠퍼스(익산) 생활관만 지원 가능

export const COLLEGE_GROUPS = [
  {
    label: '학부',
    colleges: [
      { code: 'nursing', name: '간호대학' },
      { code: 'business', name: '경상대학' },
      { code: 'engineering', name: '공과대학' },
      { code: 'agriculture', name: '농업생명과학대학' },
      { code: 'education', name: '사범대학' },
      { code: 'social_science', name: '사회과학대학' },
      { code: 'human_ecology', name: '생활과학대학' },
      { code: 'veterinary', name: '수의과대학', specialCampus: true },
      { code: 'pharmacy', name: '약학대학' },
      { code: 'arts', name: '예술대학' },
      { code: 'medicine', name: '의과대학' },
      { code: 'humanities', name: '인문대학' },
      { code: 'natural_science', name: '자연과학대학' },
      { code: 'dentistry', name: '치과대학' },
      { code: 'environment', name: '환경생명자원대학', specialCampus: true },
      { code: 'ai', name: 'AI대학' },
    ],
  },
  {
    label: '대학원',
    colleges: [
      { code: 'graduate', name: '일반대학원' },
      { code: 'law', name: '법학전문대학원' },
    ],
  },
]

export const COLLEGES = COLLEGE_GROUPS.flatMap((g) => g.colleges)

// 드롭다운용: 가나다순
export const koCompare = new Intl.Collator('ko').compare
export const COLLEGES_SORTED = [...COLLEGES].sort((a, b) => koCompare(a.name, b.name))
export const findCollege = (code) => COLLEGES.find((c) => c.code === code) ?? null
