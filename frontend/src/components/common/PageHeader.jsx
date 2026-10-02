/** leadClassName: 소개 문구에 붙일 클래스 (예: 모바일에서만 숨기기) */
export default function PageHeader({ title, lead, leadClassName, children }) {
  return (
    <header className="page-header">
      <div className="container">
        <h1>{title}</h1>
        {lead && <p className={leadClassName ? `lead ${leadClassName}` : 'lead'}>{lead}</p>}
        {children}
      </div>
    </header>
  )
}
