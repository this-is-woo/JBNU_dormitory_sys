import { useEffect, useState } from "react";
import { IconExternal, IconInfo } from "../components/common/Icons.jsx";
import PageHeader from "../components/common/PageHeader.jsx";
import FeeTable from "../components/dorms/FeeTable.jsx";
import MealTable from "../components/dorms/MealTable.jsx";
import { OFFICIAL_DORM_URL } from "../config.js";
import {
  FEE_SOURCE,
  MEAL_TIMES,
  SEMESTER_FEES,
  WINTER_FEES,
} from "../data/dormFees.js";
import { DORMITORIES, SELECTION_TYPES } from "../data/dormitories.js";
import { fetchDormitories } from "../lib/dormitories.js";
import "./DormsPage.css";

const SECTIONS = [
  { id: "dorms", label: "생활관 소개" },
  { id: "fees", label: "학기 생활관비" },
  { id: "winter", label: "겨울방학 관리비" },
  { id: "meals", label: "식당 이용 시간" },
];

function Source() {
  return (
    <p className="fee-source">
      출처:{" "}
      <a href={FEE_SOURCE.url} target="_blank" rel="noreferrer">
        {FEE_SOURCE.label} <IconExternal width={12} height={12} />
      </a>{" "}
      · {FEE_SOURCE.checkedAt} 확인
    </p>
  );
}

function Notes({ items }) {
  return (
    <ul className="fee-notes">
      {items.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function Section({ id, title, desc, children }) {
  return (
    <section id={id} className="dorm-section" aria-labelledby={`${id}-title`}>
      <header className="dorm-section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {desc && <p>{desc}</p>}
      </header>
      {children}
    </section>
  );
}

export default function DormsPage() {
  const [dorms, setDorms] = useState({ items: DORMITORIES, source: "static" });

  useEffect(() => {
    let active = true;
    fetchDormitories().then((res) => active && setDorms(res));
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <title>생활관 안내 | JBNU Dormi</title>
      <PageHeader
        title="전주캠퍼스 생활관 한눈에 보기"
        lead="생활관은 지원 타입(A~D)별로, 같은 관이라도 호실 유형별로 환산점수 고득점순 선발됩니다. 생활관비와 식당 이용 시간도 한곳에 모았어요."
      >
        <nav className="dorms-nav" aria-label="생활관 안내 목차">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="dorms-nav-link">
              {s.label}
            </a>
          ))}
        </nav>
        <div className="dorms-meta">
          <a
            href={OFFICIAL_DORM_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
          >
            생활관 공식 홈페이지 <IconExternal width={14} height={14} />
          </a>
        </div>
      </PageHeader>

      <div className="container dorms-content">
        <Section
          id="dorms"
          title="생활관 소개"
          desc="호관별 호실 유형, 성별, 식사, 지원 대상"
        >
          <div className="dorm-grid">
            {dorms.items.map((d) => (
              <article key={d.code} className="card dorm-card">
                <div className="dorm-card-head">
                  <h3>{d.name}</h3>
                  <span className="chip chip-primary">
                    {SELECTION_TYPES[d.type]?.label ?? d.type}
                  </span>
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
                    <dd>{d.genders.join(" · ")}</dd>
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
                  <a
                    href={d.infoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm dorm-link"
                  >
                    생활관 소개 <IconExternal width={14} height={14} />
                  </a>
                )}
              </article>
            ))}
          </div>

          <div className="notice">
            <IconInfo width={18} height={18} />
            <p>
              평화관은 운영하지 않습니다. 환경생명자원대학·수의과대학 학생은
              특성화캠퍼스(익산) 생활관만 지원할 수 있습니다. 모집 인원, 호실,
              생활관비는 학기마다 달라지므로 반드시 최신 모집요강을 확인하세요.
            </p>
          </div>
        </Section>

        <Section
          id="fees"
          title={SEMESTER_FEES.title}
          desc="합계 = 관리비 + 급식비 + 공공요금 (단위: 원)"
        >
          <ul className="fee-pay">
            {SEMESTER_FEES.payment.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <FeeTable data={SEMESTER_FEES} showUtility />
          <Notes items={SEMESTER_FEES.notes} />
          <Source />
        </Section>

        <Section
          id="winter"
          title={WINTER_FEES.title}
          desc="방학 중 특별개관 기간의 관리비예요. 합계 = 관리비 + 급식비 (단위: 원)"
        >
          <FeeTable data={WINTER_FEES} />
          <Notes items={WINTER_FEES.notes} />
          <Source />
        </Section>

        <Section
          id="meals"
          title={MEAL_TIMES.title}
          desc="식사 시간은 반드시 지켜야 해요."
        >
          <MealTable data={MEAL_TIMES} />
          <dl className="meal-places">
            {MEAL_TIMES.places.map((p) => (
              <div key={p.label}>
                <dt>{p.label}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
          <Notes items={MEAL_TIMES.notes} />
          <Source />
        </Section>
      </div>
    </>
  );
}
