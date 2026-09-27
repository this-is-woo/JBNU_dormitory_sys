import { useEffect, useState } from "react";
import { IconExternal, IconInfo } from "../components/common/Icons.jsx";
import PageHeader from "../components/common/PageHeader.jsx";
import FeeTable from "../components/dorms/FeeTable.jsx";
import MealTable from "../components/dorms/MealTable.jsx";
import {
  FEE_SOURCE,
  MEAL_TIMES,
  SEMESTER_FEES,
  WINTER_FEES,
} from "../data/dormFees.js";
import { DORMITORIES, SELECTION_TYPES } from "../data/dormitories.js";
import { fetchDormitories } from "../lib/dormitories.js";
import "./DormsPage.css";

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
      <PageHeader title="전주캠퍼스 생활관 한눈에 보기" />

      <div className="container dorms-content">
        <Section
          id="dorms"
          title="생활관 소개"
        >
          <div className="dorm-grid">
            {dorms.items.map((d) => (
              <article key={d.code} className="card dorm-card">
                <div className="dorm-card-head">
                  <h3>{d.name}</h3>
                  <span className="dorm-type">
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
                    className="dorm-link"
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
          <Source />
        </Section>

        <Section id="winter" title={WINTER_FEES.title}>
          <FeeTable data={WINTER_FEES} />
          <Source />
        </Section>

        <Section id="meals" title={MEAL_TIMES.title}>
          <MealTable data={MEAL_TIMES} />
          <dl className="meal-places">
            {MEAL_TIMES.places.map((p) => (
              <div key={p.label}>
                <dt>{p.label}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
          <Source />
        </Section>
      </div>
    </>
  );
}
