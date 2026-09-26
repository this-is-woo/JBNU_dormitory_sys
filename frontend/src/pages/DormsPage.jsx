import { useEffect, useState } from 'react'
import { IconExternal, IconInfo } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import { OFFICIAL_DORM_URL } from '../config.js'
import { DORMITORIES, SELECTION_TYPES } from '../data/dormitories.js'
import { fetchDormitories } from '../lib/dormitories.js'
import './DormsPage.css'

export default function DormsPage() {
  const [dorms, setDorms] = useState({ items: DORMITORIES, source: 'static' })

  useEffect(() => {
    let active = true
    fetchDormitories().then((res) => active && setDorms(res))
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <title>생활관 안내 | JBNU Dormi</title>
      <PageHeader
        title="전주캠퍼스 생활관 한눈에 보기"
        lead="생활관은 지원 타입(A~D)별로, 같은 관이라도 호실 유형(1인실·2인실·6인실)별로 환산점수 고득점순 선발됩니다."
      >
        <div className="dorms-meta">
          <span className="chip">{dorms.source === 'supabase' ? 'Supabase 데이터' : '2024학년도 모집안내 기준'}</span>
          <a href={OFFICIAL_DORM_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            생활관 공식 홈페이지 <IconExternal width={14} height={14} />
          </a>
        </div>
      </PageHeader>

      <div className="container dorms-content">
        <div className="dorm-grid">
          {dorms.items.map((d) => (
            <article key={d.code} className="card dorm-card">
              <div className="dorm-card-head">
                <h2>{d.name}</h2>
                <span className="chip chip-primary">{SELECTION_TYPES[d.type]?.label ?? d.type}</span>
              </div>
              <div className="dorm-rooms">
                {d.rooms.map((room) => (
                  <span key={room} className="dorm-room">
                    {room}
                  </span>
                ))}
              </div>
              <dl className="dorm-info">
                <div>
                  <dt>성별</dt>
                  <dd>{d.genders.join(' · ')}</dd>
                </div>
                <div>
                  <dt>식사</dt>
                  <dd>{d.meal}</dd>
                </div>
                <div>
                  <dt>지원 대상</dt>
                  <dd>{d.eligibility}</dd>
                </div>
              </dl>
              {d.infoUrl && (
                <a href={d.infoUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm dorm-link">
                  생활관 소개 <IconExternal width={14} height={14} />
                </a>
              )}
            </article>
          ))}
        </div>

        <div className="notice">
          <IconInfo width={18} height={18} />
          <p>
            평화관은 운영하지 않습니다. 환경생명자원대학·수의과대학 학생은 특성화캠퍼스(익산) 생활관만 지원할 수
            있습니다. 모집 인원, 호실, 생활관비는 학기마다 달라지므로 반드시 최신 모집요강을 확인하세요.
          </p>
        </div>
      </div>
    </>
  )
}
