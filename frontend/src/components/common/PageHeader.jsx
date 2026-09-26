export default function PageHeader({ title, lead, children }) {
  return (
    <header className="page-header">
      <div className="container">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </header>
  )
}
