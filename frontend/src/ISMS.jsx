import React, { useState } from "react";
import { Badge, Icon, Modal, PageHeading, Stat, date, Empty } from "./ui.jsx";
import { Connections } from "./Connections.jsx";

const today = () => new Date().toISOString().slice(0, 10);
export function ISMS({
  isms,
  "isms/collector": collector,
  workspace,
  role,
  api,
  perform,
  busy,
  records,
  onPage,
}) {
  const [tab, setTab] = useState("home"),
    [guide, setGuide] = useState(null),
    [modal, setModal] = useState(null),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState("All");
  const base = `/workspaces/${workspace.id}/isms`;
  const reviewer = ["admin", "reviewer"].includes(role),
    editable = role !== "auditor";
  const { program, coverage, guides, routines, signals, sites, runs } = isms;
  const accepted = coverage.filter(
    (c) => c.applicable && c.accepted > 0,
  ).length;
  const applicable = coverage.filter((c) => c.applicable).length;
  const attention = signals.filter((s) => s.status === "attention");
  const due = routines.filter((r) => r.data.dueDate <= today());
  const documents = records.filter((r) => r.kind === "documents" && !r.data.referenceOnly);
  const mutate = (path, method, body, message) =>
    perform(() => api(base + path, method, body), message);
  const destination = (key) => {
    if (key === "documents") onPage("documents");
    else if (key === "tasks") onPage("registers", "tasks");
    else setTab(key);
  };
  if (!program)
    return (
      <>
        <PageHeading
          eyebrow={workspace.name}
          title="Your guided ISMS"
          description="Build a security program one clear action at a time. We explain what to do, what to document and what to keep reviewing."
        />
        <section className="isms-welcome">
          <span className="eyebrow">
            FROM FIRST POLICY TO CONTINUOUS OVERSIGHT
          </span>
          <h2>Security work, with a clear next step.</h2>
          <p>
            Activate a dedicated program for {workspace.name}. Existing
            documents and decisions stay in this workspace.
          </p>
          <div className="isms-benefits">
            {[
              [
                "layers",
                "118 coverage topics",
                "93 Annex A controls and 25 management-system topics.",
              ],
              [
                "file",
                "12 practical guides",
                "Turn business answers into editable document drafts.",
              ],
              [
                "clock",
                "8 recurring routines",
                "Access, backups, vulnerabilities, training, risk and more.",
              ],
            ].map(([icon, title, text]) => (
              <div key={title}>
                <Icon name={icon} size={28} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          {reviewer ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                mutate(
                  "/activate",
                  "POST",
                  {},
                  "Guided ISMS activated. Start with your organization profile.",
                )
              }
            >
              Activate ISMS program <Icon name="arrow" />
            </button>
          ) : (
            <p>
              Ask your Cunix reviewer to activate this client’s ISMS program.
            </p>
          )}
          <p className="muted">
            Coverage is a navigation aid. Applicability, implementation and
            certification require assessment.
          </p>
        </section>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow={`${workspace.name} / MANAGED COMPLIANCE`}
        title="Your security program"
        description="Know what to do next. Keep decisions, evidence and recurring work connected."
        actions={
          <button className="secondary" onClick={() => setTab("profile")}>
            <Icon name="building" />
            Organization profile
          </button>
        }
      />
      <div className="isms-tabs" role="tablist" aria-label="ISMS workspace">
        {[
          ["home", "Overview"],
          ["scopes", "Scope areas"],
          ["references", "Reference pack"],
          ["guides", "Guided setup"],
          ["coverage", "Control coverage"],
          ["routines", "Recurring evidence"],
          ["signals", "Monitoring"],
          ["connections", "Connections"],
          ["sites", "Client sites"],
          ["profile", "Profile"],
        ].map(([key, title]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {title}
            {key === "signals" && attention.length > 0 && (
              <span>{attention.length}</span>
            )}
          </button>
        ))}
      </div>
      {tab === "scopes" && <section className="panel isms-section"><h2>ISMS scope areas</h2><p>Define the actual boundary for each client. The sample deliberately spans every area below.</p><div className="scope-area-grid">{(program.profile.scopeAreas || []).map(area=><article key={area.key}><h3>{area.title}</h3><p>{area.details}</p><small>Owner: {area.owner}</small></article>)}</div>{!program.profile.scopeAreas?.length && <p>Describe the client boundary in Profile and the Scope register.</p>}</section>}
      {tab === "references" && <section className="panel isms-section"><h2>ISMS 2022 reference pack</h2><p>Private source templates guide policies and working records. Templates never count as completed evidence.</p><div className="scope-area-grid">{Object.entries(records.filter(r=>r.kind==='documents'&&r.data.referenceOnly).reduce((groups,r)=>{const category=r.data.referenceCategory||'Reference';groups[category]=(groups[category]||0)+1;return groups;},{})).map(([category,count])=><article key={category}><h3>{category}</h3><p>{count} source files</p></article>)}</div><button className="primary" onClick={()=>onPage('documents')}>Open private document library</button></section>}
      {tab === "home" && (
        <>
          <div className="isms-hero">
            <div>
              <span className="eyebrow">YOUR NEXT BEST ACTION</span>
              <h2>
                {!program.profile.services
                  ? "Tell us about your business"
                  : due.length
                    ? "Keep your operating evidence current"
                    : "Build confidence in every control"}
              </h2>
              <p>
                {!program.profile.services
                  ? "A few business details personalize your document drafts and clarify who owns security."
                  : due.length
                    ? `${due.length} recurring requests are ready. Each includes practical guidance and a review handoff.`
                    : "Use the guided setup to document your actual practices, then link evidence to the control index."}
              </p>
              <button
                className="primary"
                onClick={() =>
                  setTab(
                    !program.profile.services
                      ? "profile"
                      : due.length
                        ? "routines"
                        : "guides",
                  )
                }
              >
                {!program.profile.services
                  ? "Complete organization profile"
                  : due.length
                    ? "Open evidence requests"
                    : "Explore guided setup"}
                <Icon name="arrow" />
              </button>
            </div>
            <div className="isms-orbit">
              <strong>
                {accepted}
                <span> / {applicable}</span>
              </strong>
              <p>topics with accepted evidence</p>
              <small>Evidence coverage · not certification</small>
            </div>
          </div>
          <div className="stats-grid">
            <Stat
              icon="file"
              title="Working documents"
              value={documents.length}
              detail="Drafts and evidence in this workspace"
            />
            <Stat
              icon="clock"
              title="Recurring requests due"
              value={due.length}
              detail="Needs current-cycle evidence"
            />
            <Stat
              icon="alert"
              title="Checks needing attention"
              value={attention.length}
              detail={
                program.last_run_at
                  ? `Last run ${new Date(program.last_run_at).toLocaleString()}`
                  : "No checks run yet"
              }
            />
            <Stat
              icon="building"
              title="Client sites"
              value={sites.length}
              detail="Office, remote and cloud locations"
            />
          </div>
          <div className="isms-two-col">
            <section className="panel isms-section">
              <div className="section-heading">
                <h2>Start with the essentials</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("guides")}
                >
                  All guides
                </button>
              </div>
              {guides.slice(0, 4).map((g, i) => (
                <button
                  className="isms-next"
                  key={g.key}
                  onClick={() => setGuide(g)}
                >
                  <span>0{i + 1}</span>
                  <div>
                    <strong>{g.title}</strong>
                    <small>
                      {g.phase} · {g.refs.length} mapped topics
                    </small>
                  </div>
                  <Icon name="chevron" />
                </button>
              ))}
            </section>
            <section className="panel isms-section">
              <div className="section-heading">
                <h2>Needs your attention</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("signals")}
                >
                  All checks
                </button>
              </div>
              {attention.slice(0, 4).map((s) => (
                <button
                  className="isms-next"
                  key={s.key}
                  onClick={() => destination(s.destination)}
                >
                  <Icon name="alert" />
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.detail}</small>
                  </div>
                  <Icon name="chevron" />
                </button>
              ))}
              {!attention.length && (
                <p>
                  No issues detected by the latest metadata checks. Continue
                  reviewing control effectiveness with your consultant.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {tab === "guides" && (
        <>
          <div className="section-heading">
            <div>
              <h2>You do not need to know ISO terminology to begin.</h2>
              <p>
                Follow the instructions, prepare your draft and ask your
                consultant to review it.
              </p>
            </div>
          </div>
          <div className="isms-guide-grid">
            {guides.map((g, i) => {
              const count = documents.filter(
                (d) => d.data.guideKey === g.key,
              ).length;
              return (
                <button
                  className="isms-guide"
                  key={g.key}
                  onClick={() => setGuide(g)}
                >
                  <div>
                    <span className="eyebrow">{g.phase}</span>
                    <span className="isms-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3>{g.title}</h3>
                  <p>{g.why}</p>
                  <footer>
                    {count
                      ? `${count} draft(s) prepared`
                      : `${g.steps.length} practical steps`}
                    <Icon name="arrow" />
                  </footer>
                </button>
              );
            })}
          </div>
        </>
      )}
      {tab === "coverage" && (
        <section className="panel isms-section">
          <div className="section-heading">
            <div>
              <h2>Every topic has a place</h2>
              <p>
                93 Annex A controls + 25 management-system topics. Short labels
                are guidance, not the normative standard.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => onPage("registers", "controls")}
            >
              Manage applicability
            </button>
          </div>
          <div className="isms-filters">
            <label className="search">
              <Icon name="search" />
              <input
                aria-label="Search control coverage"
                placeholder="Search reference or topic…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              {[
                "All",
                "Management system",
                "Organization",
                "People",
                "Physical",
                "Technology",
                "Missing evidence",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference / topic</th>
                  <th>Owner</th>
                  <th>Applicability</th>
                  <th>Evidence</th>
                  <th>Implementation</th>
                </tr>
              </thead>
              <tbody>
                {coverage
                  .filter(
                    (c) =>
                      (theme === "All" ||
                        c.theme === theme ||
                        (theme === "Missing evidence" &&
                          c.applicable &&
                          !c.accepted)) &&
                      `${c.ref} ${c.title}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((c) => (
                    <tr key={c.ref}>
                      <td>
                        <strong>{c.ref}</strong>
                        <div>{c.title}</div>
                        <small className="muted">{c.theme}</small>
                      </td>
                      <td>{c.owner || "Assign owner"}</td>
                      <td>
                        {c.applicable
                          ? "Applicable"
                          : `Excluded: ${c.justification}`}
                      </td>
                      <td>
                        <Badge
                          status={
                            !c.applicable
                              ? "not_applicable"
                              : c.accepted
                                ? "approved"
                                : "missing"
                          }
                        />
                        <small className="muted"> {c.evidence} linked</small>
                      </td>
                      <td>
                        {c.implemented
                          ? "Recorded as implemented"
                          : "Not confirmed"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "routines" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Evidence that stays current</h2>
              <p>
                Submit a record from the current cycle. A different reviewer
                accepts it and schedules the next request.
              </p>
            </div>
            <button className="secondary" onClick={() => onPage("documents")}>
              <Icon name="upload" />
              Upload evidence
            </button>
          </div>
          <div className="isms-guide-grid">
            {routines.map(({ key, data: r }) => (
              <article className="panel isms-section" key={key}>
                <div className="isms-card-top">
                  <Badge
                    status={
                      r.status === "in_review"
                        ? "waiting_review"
                        : r.status === "changes_requested"
                          ? "changes_requested"
                          : r.dueDate <= today()
                            ? "due"
                            : "scheduled"
                    }
                  />
                  <small>{r.ref}</small>
                </div>
                <h3>{r.title}</h3>
                <p>{r.guide}</p>
                <dl className="isms-facts">
                  <div>
                    <dt>Owner</dt>
                    <dd>{r.owner || "Unassigned"}</dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>{date(r.dueDate)}</dd>
                  </div>
                  <div>
                    <dt>Frequency</dt>
                    <dd>Every {r.days} days</dd>
                  </div>
                  <div>
                    <dt>Site</dt>
                    <dd>
                      {sites.find((s) => s.id === r.siteId)?.name ||
                        "All in-scope sites"}
                    </dd>
                  </div>
                </dl>
                {r.reviewNote && r.status === "changes_requested" && (
                  <p className="isms-review-note">
                    Changes requested: {r.reviewNote}
                  </p>
                )}
                <div className="isms-button-row">
                  {editable && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => setModal({ type: "submit", key, data: r })}
                    >
                      Submit evidence
                    </button>
                  )}
                  {reviewer && r.status === "in_review" && (
                    <button
                      className="secondary"
                      onClick={() => setModal({ type: "review", key, data: r })}
                    >
                      Review cycle
                    </button>
                  )}
                  {reviewer && (
                    <button
                      className="icon-button"
                      aria-label={`Configure ${r.title}`}
                      onClick={() =>
                        setModal({ type: "routine", key, data: r })
                      }
                    >
                      <Icon name="edit" />
                    </button>
                  )}
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal({ type: "history", key, data: r })}
                >
                  {r.history.length} accepted cycles · View history
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "signals" && (
        <>
          <div className="isms-monitor-bar">
            <div>
              <strong>
                {program.enabled
                  ? "Hourly monitoring enabled"
                  : "Scheduled monitoring paused"}
              </strong>
              <p>
                Checks workspace evidence, deadlines and document quality. No
                external systems are connected by these checks.
              </p>
              <small>
                Last run:{" "}
                {program.last_run_at
                  ? new Date(program.last_run_at).toLocaleString()
                  : "Not yet"}{" "}
                · Next scheduled:{" "}
                {program.enabled
                  ? new Date(program.next_run_at).toLocaleString()
                  : "Paused"}
              </small>
            </div>
            {reviewer && (
              <div className="isms-button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      "/monitor",
                      "PATCH",
                      { enabled: !program.enabled },
                      "Monitoring preference saved.",
                    )
                  }
                >
                  {program.enabled ? "Pause schedule" : "Enable schedule"}
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      "/monitor",
                      "POST",
                      {},
                      "Checks refreshed from current workspace data.",
                    )
                  }
                >
                  Run checks now
                </button>
              </div>
            )}
          </div>
          <div className="isms-signals">
            {signals.map((s) => (
              <article className="panel isms-signal" key={s.key}>
                <span className={`isms-signal-icon ${s.status}`}>
                  <Icon name={s.status === "clear" ? "check" : "alert"} />
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.detail}</p>
                  {s.status === "attention" && <small>{s.action}</small>}
                </div>
                <Badge status={s.status} />
                {s.status === "attention" && (
                  <button
                    className="secondary"
                    onClick={() => destination(s.destination)}
                  >
                    Resolve
                  </button>
                )}
              </article>
            ))}
          </div>
          <section className="panel isms-section">
            <h3>Run history</h3>
            {runs.map((r) => (
              <div className="isms-history" key={r.id}>
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <strong>
                  {r.data.checked} checks · {r.data.attention} needing attention
                </strong>
                <small>{r.data.source}</small>
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "connections" && (
        <Connections
          collector={collector}
          workspace={workspace}
          role={role}
          api={api}
          perform={perform}
          busy={busy}
        />
      )}
      {tab === "sites" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Your operating locations</h2>
              <p>
                Define the sites in scope and assign recurring evidence to the
                relevant location.
              </p>
            </div>
            {editable && (
              <button
                className="primary"
                onClick={() => setModal({ type: "site" })}
              >
                <Icon name="plus" />
                Add client site
              </button>
            )}
          </div>
          <div className="isms-guide-grid">
            {sites.map((s) => (
              <article className="panel isms-section" key={s.id}>
                <Icon name="building" size={30} />
                <h3>{s.name}</h3>
                <p>{s.data.location || "Location not specified"}</p>
                <Badge status={s.data.type} />
                <p>Owner: {s.data.owner || "Unassigned"}</p>
                <strong>
                  {routines.filter((r) => r.data.siteId === s.id).length}{" "}
                  assigned routines
                </strong>
              </article>
            ))}
          </div>
          {!sites.length && (
            <section className="panel">
              <Empty icon="building" title="Bring every site into scope">
                Add an office, remote workforce or cloud environment. Sites
                share this client’s access boundary.
              </Empty>
            </section>
          )}
        </>
      )}
      {tab === "profile" && (
        <section className="panel isms-section isms-profile">
          <span className="eyebrow">PLAIN-LANGUAGE SETUP</span>
          <h2>Tell us how your business works</h2>
          <p>
            These answers personalize your guided drafts. Your consultant will
            validate the scope with you.
          </p>
          <form
            key={JSON.stringify(program.profile)}
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate(
                "/profile",
                "PATCH",
                Object.fromEntries(new FormData(e.currentTarget)),
                "Organization profile saved. You can now generate contextual drafts.",
              );
            }}
          >
            <fieldset disabled={!editable || busy}>
              <label>
                What services do you provide?
                <textarea
                  name="services"
                  required
                  maxLength={2000}
                  defaultValue={program.profile.services}
                  placeholder="For example: We provide a cloud-based payroll service to small businesses."
                />
              </label>
              <label>
                What information do you handle?
                <textarea
                  name="information"
                  maxLength={2000}
                  defaultValue={program.profile.information}
                  placeholder="Customer records, employee details, payment information…"
                />
              </label>
              <div className="form-grid">
                <label>
                  ISMS coordinator
                  <input
                    name="coordinator"
                    required
                    maxLength={120}
                    defaultValue={program.profile.coordinator}
                  />
                </label>
                <label>
                  Management sponsor
                  <input
                    name="sponsor"
                    required
                    maxLength={120}
                    defaultValue={program.profile.sponsor}
                  />
                </label>
              </div>
              <label>
                Industry
                <input
                  name="industry"
                  maxLength={120}
                  defaultValue={program.profile.industry}
                />
              </label>
              {editable && (
                <button className="primary">Save organization profile</button>
              )}
            </fieldset>
          </form>
          <div className="isms-portal-link">
            <strong>Private client portal</strong><a className="secondary" href={"/#/client/"+encodeURIComponent(workspace.slug)} target="_blank" rel="noopener">Open client portal</a>
            <p>
              Share this address with existing workspace members. Signing in and
              membership are required.
            </p>
            <input
              aria-label="Private client portal address"
              readOnly
              value={`${window.location.origin}/#/client/${encodeURIComponent(workspace.slug)}`}
            />
            <button className="secondary" onClick={() => onPage("team")}>
              Manage client access
            </button>
          </div>
        </section>
      )}
      {guide && (
        <Modal title={guide.title} wide onClose={() => setGuide(null)}>
          <div className="isms-guide-detail">
            <Badge status={guide.phase.toLowerCase()} />
            <p>{guide.why}</p>
            <h3>What you need to do</h3>
            <ol>
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="isms-evidence-box">
              <h3>What good evidence looks like</h3>
              <p>{guide.evidence}</p>
            </div>
            <p className="muted">
              Maps to {guide.refs.join(", ")}. A draft is a starting point;
              complete its decision fields and verify actual practice.
            </p>
            <div className="isms-button-row">
              {editable && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await mutate(
                        `/drafts/${guide.key}`,
                        "POST",
                        {},
                        "Personalized draft prepared in the document library. Complete its decision fields before review.",
                      )
                    ) {
                      setGuide(null);
                      onPage("documents");
                    }
                  }}
                >
                  <Icon name="file" />
                  Prepare my draft
                </button>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setGuide(null);
                  onPage("documents");
                }}
              >
                Open document library
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "site"
              ? "Add a client site"
              : modal.type === "history"
                ? `Cycle history: ${modal.data.title}`
                : modal.type === "review"
                  ? `Review: ${modal.data.title}`
                  : modal.type === "routine"
                    ? `Configure: ${modal.data.title}`
                    : `Submit: ${modal.data.title}`
          }
          onClose={() => setModal(null)}
          wide
        >
          {modal.type === "history" ? (
            <div className="isms-guide-detail">
              {!modal.data.history.length ? (
                <p>No accepted cycles yet.</p>
              ) : (
                modal.data.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <article className="isms-history" key={i}>
                      <strong>
                        Accepted {date(h.acceptedAt)} · {h.reviewer}
                      </strong>
                      <span>
                        Evidence: {h.title} · Collected {date(h.collectedOn)}
                      </span>
                      <p>{h.note}</p>
                      <small>Document ID: {h.documentId}</small>
                    </article>
                  ))
              )}
            </div>
          ) : (
            <form
              className="isms-modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = Object.fromEntries(new FormData(e.currentTarget));
                if (modal.type === "routine") v.days = Number(v.days);
                const path =
                  modal.type === "site"
                    ? "/sites"
                    : `/routines/${modal.key}${modal.type === "routine" ? "" : `/${modal.type}`}`;
                if (
                  await mutate(
                    path,
                    modal.type === "routine" ? "PATCH" : "POST",
                    v,
                    "Saved successfully.",
                  )
                )
                  setModal(null);
              }}
            >
              <fieldset disabled={busy}>
                {modal.type === "site" && (
                  <>
                    <label>
                      Site name
                      <input name="name" required maxLength={120} />
                    </label>
                    <label>
                      Location
                      <input
                        name="location"
                        maxLength={200}
                        placeholder="City, region or hosting region"
                      />
                    </label>
                    <label>
                      Site owner
                      <input name="owner" maxLength={120} />
                    </label>
                    <label>
                      Site type
                      <select name="type">
                        <option value="office">Office</option>
                        <option value="remote">Remote workforce</option>
                        <option value="cloud">Cloud environment</option>
                        <option value="datacenter">Data center</option>
                      </select>
                    </label>
                  </>
                )}
                {modal.type === "routine" && (
                  <>
                    <label>
                      Owner
                      <input name="owner" defaultValue={modal.data.owner} />
                    </label>
                    <label>
                      Frequency (days)
                      <input
                        type="number"
                        name="days"
                        min="1"
                        max="730"
                        required
                        defaultValue={modal.data.days}
                      />
                    </label>
                    <label>
                      Next due date
                      <input
                        type="date"
                        name="dueDate"
                        min={modal.data.periodStart}
                        required
                        defaultValue={modal.data.dueDate}
                      />
                    </label>
                    <label>
                      Site
                      <select name="siteId" defaultValue={modal.data.siteId}>
                        <option value="">All in-scope sites</option>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {modal.type === "submit" && (
                  <>
                    <p>{modal.data.guide}</p>
                    <p>
                      Evidence must be from {date(modal.data.periodStart)}{" "}
                      onward. Upload new files in the document library first.
                    </p>
                    <label>
                      Evidence document
                      <select name="documentId" required defaultValue="">
                        <option value="" disabled>
                          Select a document
                        </option>
                        {documents.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.data.title} ({d.data.status})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date the evidence was collected
                      <input
                        name="collectedOn"
                        type="date"
                        required
                        min={modal.data.periodStart}
                        max={today()}
                        defaultValue={today()}
                      />
                    </label>
                    <label>
                      What does this demonstrate?
                      <textarea name="note" required maxLength={2000} />
                    </label>
                  </>
                )}
                {modal.type === "review" && (
                  <>
                    <div className="isms-evidence-box">
                      <strong>{modal.data.submission?.title}</strong>
                      <p>{modal.data.submission?.note}</p>
                      <small>
                        Collected {date(modal.data.submission?.collectedOn)}
                      </small>
                    </div>
                    <p>
                      A different reviewer must decide the cycle. The document
                      must already be approved and current.
                    </p>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setModal(null);
                        onPage("reviews");
                      }}
                    >
                      Inspect and approve the evidence document
                    </button>
                    <label>
                      Decision
                      <select name="decision">
                        <option value="accept">
                          Accept and schedule next cycle
                        </option>
                        <option value="changes">Request changes</option>
                      </select>
                    </label>
                    <label>
                      Review rationale
                      <textarea name="note" required maxLength={2000} />
                    </label>
                  </>
                )}
                <button className="primary">
                  {modal.type === "submit"
                    ? "Submit for independent review"
                    : modal.type === "review"
                      ? "Record decision"
                      : "Save"}
                </button>
              </fieldset>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

export function AttentionQueue({ portfolio }) {
  const active = portfolio.filter((p) => p.program?.active);
  if (!active.length) return null;
  return (
    <section className="panel isms-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CUNIX COMMAND CENTER</span>
          <h2>Continuous compliance across clients</h2>
          <p>
            Private client portals with shared delivery oversight. Results
            reflect the latest workspace checks.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Monitoring</th>
              <th>Attention</th>
              <th>Evidence due</th>
              <th>Last check</th>
              <th>Portal</th>
            </tr>
          </thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>{p.program.enabled ? "Hourly" : "Paused"}</td>
                <td>
                  <Badge status={p.program.attention ? "attention" : "clear"} />{" "}
                  {p.program.attention}
                </td>
                <td>{p.program.due} requests</td>
                <td>
                  {p.program.lastRun
                    ? new Date(p.program.lastRun).toLocaleString()
                    : "Not run"}
                </td>
                <td>
                  <a href={`#/workspace/${p.id}/isms`}>Open workspace →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
