import { useEffect, useState } from "react";
import { IconExternal, IconInfo } from "../components/common/Icons.jsx";
import PageHeader from "../components/common/PageHeader.jsx";
import DormGallery from "../components/dorms/DormGallery.jsx";
import FeeTable from "../components/dorms/FeeTable.jsx";
import MealTable from "../components/dorms/MealTable.jsx";
import {
  FEE_SOURCE,
  MEAL_TIMES,
  SEMESTER_FEES,
  WINTER_FEES,
} from "../data/dormFees.js";
import { DORMITORIES, SELECTION_TYPES, SPECIAL_CAMPUS_DORMITORIES } from "../data/dormitories.js";
import chambitPhoto from "../assets/dorms/chambit.webp";
import changuiPhoto from "../assets/dorms/changui.webp";
import cheongunPhoto from "../assets/dorms/cheongun.webp";
import daedongPhoto from "../assets/dorms/daedong.webp";
import hanbitPhoto from "../assets/dorms/hanbit.webp";
import hyeminPhoto from "../assets/dorms/hyemin.webp";
import saebitPhoto from "../assets/dorms/saebit.webp";
import { COMMON_CONTACTS, CONTACTS_CHECKED_AT, DORM_CONTACTS, telHref } from "../data/dormContacts.js";
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

// 생활관 사진 (생활관 홍보 영상 화면, 16:9 로 같은 크기로 맞춤)
const PHOTOS = {
  chambit: chambitPhoto,
  changui: changuiPhoto,
  cheongun: cheongunPhoto,
  daedong: daedongPhoto,
  hanbit: hanbitPhoto,
  hyemin: hyeminPhoto,
  saebit: saebitPhoto,
};

// 내부 사진: src/assets/dorms/interior/{호관 code}-{번호}.webp (생활관 홈페이지의 호관 소개 사진, 16:9 로 맞춤)
// 파일을 넣기만 하면 번호 순서대로 그 호관 카드의 슬라이더에 붙는다.
const INTERIOR = Object.entries(
  import.meta.glob("../assets/dorms/interior/*.webp", { eager: true, import: "default" }),
)
  .map(([path, src]) => {
    const [, code, n] = path.match(/\/([a-z]+)-(\d+)\.webp$/) ?? [];
    return { code, n: Number(n), src };
  })
  .filter((p) => p.code)
  .sort((a, b) => a.n - b.n);

/** 카드 사진: 외관 1장 + 내부 사진 */
function dormPhotos(d) {
  const list = [];
  if (PHOTOS[d.code]) list.push({ src: PHOTOS[d.code], alt: `${d.name} 전경` });
  for (const p of INTERIOR) {
    if (p.code === d.code) list.push({ src: p.src, alt: `${d.name} 내부 사진 ${p.n}` });
  }
  return list;
}

/** 연락처 목록: 이름(+ 주간/야간) · 번호 (휴대폰에서는 누르면 바로 전화) */
function ContactList({ items }) {
  return (
    <ul className="dorm-contacts">
      {items.map((c) => (
        <li key={c.label + (c.note ?? "")}>
          <span className="dorm-contact-label">
            {c.label}
            {c.note && <small>{c.note}</small>}
          </span>
          <span className="dorm-contact-tels">
            {c.tel.map((tel) => (
              <a key={tel} href={telHref(tel)} className="dorm-tel tabular">
                {tel}
              </a>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 생활관 카드: 사진 · 이름 · 선발 유형 · 호실 · 성별 · 식사 · 지원 대상 · 연락처 */
function DormCard({ d }) {
  const contacts = DORM_CONTACTS[d.code];
  return (
    <article className="card dorm-card">
      <DormGallery name={d.name} photos={dormPhotos(d)} />
      <div className="dorm-card-head">
        <h3>{d.name}</h3>
        <span className="dorm-type">{d.typeLabel ?? SELECTION_TYPES[d.type]?.label ?? d.type}</span>
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
      {contacts && (
        <section className="dorm-contact-box" aria-label={`${d.name} 연락처`}>
          <h4>연락처</h4>
          <ContactList items={contacts} />
        </section>
      )}
    </article>
  );
}

/** 제목 없이 쓸 때는 label 로 화면 읽기 프로그램에만 이름을 알린다 */
function Section({ id, title, label, desc, children }) {
  return (
    <section
      id={id}
      className="dorm-section"
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-label={title ? undefined : label}
    >
      {title && (
        <header className="dorm-section-head">
          <h2 id={`${id}-title`}>{title}</h2>
          {desc && <p>{desc}</p>}
        </header>
      )}
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
      <PageHeader title="생활관 한눈에 보기" />

      <div className="container dorms-content">
        {/* 생활관 카드 (페이지 제목 "생활관 한눈에 보기" 바로 아래, 섹션 제목 없이) */}
        <Section id="dorms" label="생활관 소개">
          <div className="dorm-grid">
            {[...dorms.items, ...SPECIAL_CAMPUS_DORMITORIES].map((d) => (
              <DormCard key={d.code} d={d} />
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
          id="contacts"
          title="생활관 공통 연락처"
          desc={`호관과 상관없는 업무는 행정실 담당자에게 문의하세요. (${CONTACTS_CHECKED_AT} 기준)`}
        >
          <div className="card dorm-contact-common">
            <ContactList items={COMMON_CONTACTS} />
          </div>
        </Section>

        <Section
          id="fees"
          title={SEMESTER_FEES.title}
          desc="합계 = 관리비 + 급식비 + 공공요금 (단위: 원)"
        >
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
