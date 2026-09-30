import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const badge = status => <span className={`badge ${status}`}>{status.replace('_', ' ')}</span>;

function App() {
  const [data, setData] = useState();
  const [error, setError] = useState();
  useEffect(() => {
    fetch('/api/dashboard/acme-health').then(r => r.ok ? r.json() : Promise.reject(r)).then(setData).catch(() => setError('Unable to load compliance data.'));
  }, []);
  if (error) return <main className="center">{error}</main>;
  if (!data) return <main className="center">Loading Cunix GRC…</main>;
  const { tenant, controls, findings, frameworks } = data;
  const readiness = Math.round((Number(tenant.controls_passing) / Math.max(Number(tenant.controls_total), 1)) * 100);
  return <main>
    <header><div><p className="eyebrow">CUNIX GRC / CLIENT WORKSPACE</p><h1>{tenant.name}</h1><p>Continuous evidence, controls, and remediation in one workspace.</p></div><button>Invite client user</button></header>
    <section className="metrics">
      <article><span>Audit readiness</span><strong>{readiness}%</strong><small>{tenant.controls_passing} of {tenant.controls_total} controls passing</small></article>
      <article><span>Open remediation</span><strong>{tenant.findings_open}</strong><small>Findings with an assigned owner</small></article>
      <article><span>Expired evidence</span><strong>{tenant.evidence_expired}</strong><small>Requires collection or review</small></article>
    </section>
    <section className="grid">
      <article className="card wide"><h2>Control health</h2><table><thead><tr><th>Control</th><th>Owner</th><th>Status</th></tr></thead><tbody>{controls.map(c => <tr key={c.external_id}><td><b>{c.external_id}</b><br/><small>{c.title}</small></td><td>{c.owner}</td><td>{badge(c.status)}</td></tr>)}</tbody></table></article>
      <article className="card"><h2>Frameworks</h2>{frameworks.map(f => <div className="row" key={f.code}><div><b>{f.name}</b><br/><small>{f.code}</small></div>{badge(f.status)}</div>)}</article>
      <article className="card wide"><h2>Remediation queue</h2>{findings.map(f => <div className="finding" key={f.id}><div><b>{f.title}</b><br/><small>{f.owner} · due {new Date(f.due_date).toLocaleDateString()}</small></div>{badge(f.severity)}</div>)}</article>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);

