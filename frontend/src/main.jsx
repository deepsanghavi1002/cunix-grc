import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const badge = status => <span className={`badge ${status}`}>{status.replace('_', ' ')}</span>;

function App() {
  const [data, setData] = useState();
  const [error, setError] = useState();
  const [filename, setFilename] = useState('');
  const [text, setText] = useState('');
  const [processing, setProcessing] = useState(false);
  const load = () => fetch('/api/dashboard/acme-health').then(r => r.ok ? r.json() : Promise.reject(r)).then(setData).catch(() => setError('Unable to load compliance data.'));
  useEffect(() => {
    load();
  }, []);
  if (error) return <main className="center">{error}</main>;
  if (!data) return <main className="center">Loading Cunix GRC…</main>;
  const { tenant, controls, findings, frameworks, onboarding, documents } = data;
  const readiness = Math.round((Number(tenant.controls_passing) / Math.max(Number(tenant.controls_total), 1)) * 100);
  const onboardingSteps = [['Company profile', onboarding?.company_profile_complete], ['ISO 27001 scope', onboarding?.scope_complete], ['Connect systems', onboarding?.integrations_connected], ['Review controls', onboarding?.controls_reviewed]];
  const submitDocument = async event => {
    event.preventDefault();
    if (!filename) return;
    setProcessing(true);
    await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tenant.id, filename, extractedText: text }) });
    setFilename(''); setText(''); setProcessing(false); load();
  };
  return <main>
    <header><div><p className="eyebrow">CUNIX GRC / CLIENT WORKSPACE</p><h1>{tenant.name}</h1><p>Continuous evidence, controls, and remediation in one workspace.</p></div><button>Invite client user</button></header>
    <section className="metrics">
      <article><span>Audit readiness</span><strong>{readiness}%</strong><small>{tenant.controls_passing} of {tenant.controls_total} controls passing</small></article>
      <article><span>Open remediation</span><strong>{tenant.findings_open}</strong><small>Findings with an assigned owner</small></article>
      <article><span>Expired evidence</span><strong>{tenant.evidence_expired}</strong><small>Requires collection or review</small></article>
    </section>
    <section className="onboarding"><div><p className="eyebrow">CLIENT ONBOARDING</p><h2>ISO 27001 readiness plan</h2><small>Owned by {onboarding?.owner || 'Cunix Compliance Team'}</small></div><div className="steps">{onboardingSteps.map(([label, done], index) => <div className={done ? 'step done' : 'step'} key={label}><b>{index + 1}</b><span>{label}</span></div>)}</div></section>
    <section className="grid">
      <article className="card wide"><h2>Control health</h2><table><thead><tr><th>Control</th><th>Owner</th><th>Status</th></tr></thead><tbody>{controls.map(c => <tr key={c.external_id}><td><b>{c.external_id}</b><br/><small>{c.title}</small></td><td>{c.owner}</td><td>{badge(c.status)}</td></tr>)}</tbody></table></article>
      <article className="card"><h2>Frameworks</h2>{frameworks.map(f => <div className="row" key={f.code}><div><b>{f.name}</b><br/><small>{f.code}</small></div>{badge(f.status)}</div>)}</article>
      <article className="card wide"><h2>Remediation queue</h2>{findings.map(f => <div className="finding" key={f.id}><div><b>{f.title}</b><br/><small>{f.owner} · due {new Date(f.due_date).toLocaleDateString()}</small></div>{badge(f.severity)}</div>)}</article>
      <article className="card wide"><h2>ISO 27001 document review</h2><small>Register a client document. The demo maps it to controls and identifies required evidence.</small><form onSubmit={submitDocument} className="document-form"><input value={filename} onChange={e => setFilename(e.target.value)} placeholder="Document filename, e.g. ISMS Policy.pdf" required/><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste extracted text for this demo. Include annual review and approval to pass the evidence check."/><button disabled={processing}>{processing ? 'Reviewing…' : 'Process document'}</button></form>{documents.map(doc => <div className="finding" key={doc.id}><div><b>{doc.filename}</b><br/><small>{doc.document_type.replace('_', ' ')}{doc.gap_summary ? ` · ${doc.gap_summary}` : ' · Evidence accepted and mapped to control CC6.1'}</small></div>{badge(doc.status)}</div>)}</article>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
