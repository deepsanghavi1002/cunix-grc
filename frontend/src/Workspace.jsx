import React, { useState, useEffect } from "react";
import {
  Badge,
  Empty,
  Icon,
  Modal,
  PageHeading,
  Stat,
  date,
  label,
} from "./ui.jsx";
import { Documents } from "./Documents.jsx";

export function Pipeline({
  workspace,
  stages,
  records,
  readiness,
  onStage,
  onDocuments,
}) {
  const complete = stages.filter((stage) => stage.status === "approved").length;
  const next = stages.find((stage) => stage.status !== "approved");
  const documents = records.filter((item) => item.kind === "documents");
  return (
    <>
      <PageHeading
        eyebrow="CLIENT DELIVERY / ISO 27001"
        title={workspace.name}
        description="A shared workspace for the people, evidence and decisions behind audit readiness."
        actions={
          <button
            className="primary"
            onClick={() => (next ? onStage(next.key) : onDocuments())}
          >
            {next ? "Continue engagement" : "View documents"}
            <Icon name="arrow" size={17} />
          </button>
        }
      />
      <div className="stats-grid">
        <Stat
          icon="layers"
          title="Delivery progress"
          value={`${complete} / ${stages.length}`}
          detail="Stages approved"
        />
        <Stat
          icon="file"
          title="Client documents"
          value={documents.length}
          detail={`${documents.filter((item) => item.data.status === "approved").length} approved evidence records`}
        />
        <Stat
          icon="clock"
          title="Awaiting review"
          value={
            documents.filter((item) => item.data.status !== "approved").length
          }
          detail="Documents needing a decision"
          tone="amber"
        />
        <Stat
          icon="shield"
          title="Control readiness"
          value={`${readiness?.percentage || 0}%`}
          detail="Based on current approved evidence"
          tone="green"
        />
      </div>
      <div className="pipeline-layout">
        <section className="panel timeline-panel">
          <div className="panel-heading">
            <div>
              <h2>Engagement timeline</h2>
              <p>Move from client onboarding to a reviewed audit handover.</p>
            </div>
            <span className="count-label">{stages.length} stages</span>
          </div>
          <div className="timeline">
            {stages.map((stage) => {
              const stageDocuments = documents.filter(
                (item) => (item.data.stageKey || "evidence") === stage.key,
              );
              return (
                <button
                  className={`stage-row ${stage.status === "approved" ? "done" : ""} ${next?.key === stage.key ? "next" : ""}`}
                  onClick={() => onStage(stage.key)}
                  key={stage.key}
                >
                  <span className="stage-number">
                    {stage.status === "approved" ? (
                      <Icon name="check" size={18} />
                    ) : (
                      String(stage.number).padStart(2, "0")
                    )}
                  </span>
                  <div className="stage-copy">
                    <div className="stage-title">
                      <h3>{stage.title}</h3>
                      <Badge status={stage.status} />
                    </div>
                    <p>{stage.description}</p>
                    <div className="stage-meta">
                      <span>
                        <Icon name="people" size={13} />
                        {stage.data.owner || "Owner unassigned"}
                      </span>
                      <span>
                        <Icon name="file" size={13} />
                        {stageDocuments.length} documents
                      </span>
                      <span>
                        <Icon name="clock" size={13} />
                        {date(stage.data.dueDate)}
                      </span>
                    </div>
                  </div>
                  <Icon name="chevron" size={19} />
                </button>
              );
            })}
          </div>
        </section>
        <aside className="workspace-aside">
          <article className="next-action">
            <span className="eyebrow">NEXT ACTION</span>
            <span className="next-icon">
              <Icon name="layers" size={26} />
            </span>
            <h2>{next ? next.title : "Your delivery stages are approved"}</h2>
            <p>
              {next
                ? next.description
                : "Review the evidence library and prepare your final handover."}
            </p>
            <button
              className="primary"
              onClick={() => (next ? onStage(next.key) : onDocuments())}
            >
              Open {next ? "stage" : "documents"}
              <Icon name="arrow" size={16} />
            </button>
          </article>
          <article className="panel">
            <h3>Workspace at a glance</h3>
            <dl className="fact-list">
              <div>
                <dt>Framework</dt>
                <dd>ISO 27001:2022</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{label(workspace.role)}</dd>
              </div>
              <div>
                <dt>Delivery model</dt>
                <dd>Human reviewed</dd>
              </div>
            </dl>
            <p className="helper">
              The starter library contains 12 illustrative controls. Extend it
              to match the client’s agreed scope.
            </p>
          </article>
          <article className="mini-note">
            <Icon name="shield" />
            <p>Every document and review is scoped to this client workspace.</p>
          </article>
        </aside>
      </div>
    </>
  );
}

const kindForStage = {
  scope: "scope",
  controls: "controls",
  remediation: "tasks",
};
export function StageDetail(props) {
  const {
    stage,
    workspace,
    records,
    perform,
    api,
    busy,
    role,
    onBack,
    onPage,
  } = props;
  const [tab, setTab] = useState("work");
  const review = ["admin", "reviewer"].includes(role);
  const readOnly = role === "auditor";
  const base = `/workspaces/${workspace.id}`;
  const save = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const status = event.nativeEvent.submitter?.value;
    if (status) values.status = status;
    await perform(
      () => api(base + "/stages/" + stage.key, "PATCH", values),
      status === "approved"
        ? "Stage approved."
        : status === "waiting_review"
          ? "Stage submitted for review."
          : "Stage updated.",
    );
  };
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        Back to {workspace.name}
      </button>
      <PageHeading
        eyebrow={`STAGE ${String(stage.number).padStart(2, "0")} / ${workspace.name}`}
        title={stage.title}
        description={stage.description}
        actions={<Badge status={stage.status} />}
      />
      <div className="stage-summary">
        <span>
          <Icon name="people" size={16} />
          {stage.data.owner || "Assign a stage owner"}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {date(stage.data.dueDate)}
        </span>
        <span>
          <Icon name="check" size={16} />
          {stage.data.checklist?.length || 0} of {stage.checklist.length}{" "}
          actions complete
        </span>
      </div>
      <div className="page-tabs">
        <button
          className={tab === "work" ? "active" : ""}
          onClick={() => setTab("work")}
        >
          Stage workspace
        </button>
        <button
          className={tab === "documents" ? "active" : ""}
          onClick={() => setTab("documents")}
        >
          Documents{" "}
          <span>
            {
              records.filter(
                (item) =>
                  item.kind === "documents" &&
                  (item.data.stageKey || "evidence") === stage.key,
              ).length
            }
          </span>
        </button>
      </div>
      {tab === "documents" ? (
        <Documents {...props} stageKey={stage.key} />
      ) : (
        <>
          <div className="stage-work-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Stage checklist</h2>
                  <p>Complete each action, then submit the stage for review.</p>
                </div>
                <span className="count-label">
                  {stage.data.checklist?.length || 0}/{stage.checklist.length}
                </span>
              </div>
              <div className="checklist">
                {stage.checklist.map((item, index) => (
                  <label
                    className={`check-row ${stage.data.checklist?.includes(index) ? "checked" : ""}`}
                    key={item}
                  >
                    <input
                      type="checkbox"
                      checked={stage.data.checklist?.includes(index) || false}
                      disabled={readOnly || busy}
                      onChange={(event) => {
                        const checklist = event.target.checked
                          ? [...(stage.data.checklist || []), index]
                          : (stage.data.checklist || []).filter(
                              (value) => value !== index,
                            );
                        perform(
                          () =>
                            api(base + "/stages/" + stage.key, "PATCH", {
                              checklist,
                            }),
                          "Checklist saved.",
                        );
                      }}
                    />
                    <span>{item}</span>
                    <Icon name="check" size={16} />
                  </label>
                ))}
              </div>
              <div className="stage-shortcuts">
                <button
                  className="secondary"
                  onClick={() => setTab("documents")}
                >
                  <Icon name="file" size={16} />
                  Manage stage documents
                </button>
                {stage.key === "onboarding" && (
                  <button className="secondary" onClick={() => onPage("team")}>
                    <Icon name="people" size={16} />
                    Manage client access
                  </button>
                )}
                {stage.key === "controls" && (
                  <button
                    className="secondary"
                    onClick={() => onPage("registers", "policies")}
                  >
                    Open policy register
                    <Icon name="arrow" size={15} />
                  </button>
                )}
                {stage.key === "remediation" && (
                  <button
                    className="secondary"
                    onClick={() => onPage("registers", "risks")}
                  >
                    Open risk register
                    <Icon name="arrow" size={15} />
                  </button>
                )}
                {stage.key === "audit" && (
                  <button
                    className="secondary"
                    onClick={() => onPage("readiness")}
                  >
                    Open audit preparation
                    <Icon name="arrow" size={15} />
                  </button>
                )}
              </div>
            </section>
            <article className="panel deliverable-panel">
              <span className="eyebrow">EXPECTED OUTPUT</span>
              <Icon name="file" size={28} />
              <h2>{stage.output}</h2>
              <p>
                Capture the supporting documents and record a reviewer decision
                before closing this stage.
              </p>
              {stage.data.approvedBy && (
                <div className="approval-note">
                  <Icon name="check" size={16} />
                  Approved by {stage.data.approvedBy}
                  <small>{date(stage.data.approvedAt)}</small>
                </div>
              )}
            </article>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Delivery notes & ownership</h2>
                <p>
                  Keep the next action, responsibilities and review decision in
                  one place.
                </p>
              </div>
            </div>
            <form key={stage.updated_at} onSubmit={save}>
              <fieldset disabled={readOnly || busy}>
                <div className="form-grid">
                  <label>
                    Stage owner
                    <input
                      name="owner"
                      defaultValue={stage.data.owner || ""}
                      placeholder="Who owns this stage?"
                    />
                  </label>
                  <label>
                    Target date
                    <input
                      name="dueDate"
                      type="date"
                      defaultValue={stage.data.dueDate || ""}
                    />
                  </label>
                  <label className="full">
                    Delivery notes
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={stage.data.notes || ""}
                      placeholder="Record client requirements, scope decisions and the next action."
                    />
                  </label>
                  {review && (
                    <label className="full">
                      Reviewer note
                      <textarea
                        name="reviewNote"
                        rows={2}
                        defaultValue={stage.data.reviewNote || ""}
                        placeholder="Summarize what was reviewed and the handover decision."
                      />
                    </label>
                  )}
                </div>
              </fieldset>
              {!readOnly && (
                <div className="form-actions">
                  <button className="secondary" disabled={busy}>
                    Save details
                  </button>
                  {stage.status === "approved" ? (
                    <button
                      className="secondary"
                      value="in_progress"
                      disabled={busy}
                    >
                      <Icon name="restore" size={16} />
                      Reopen stage
                    </button>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        value="waiting_review"
                        disabled={busy}
                      >
                        Submit for review
                      </button>
                      {review && (
                        <button
                          className="primary"
                          value="approved"
                          disabled={busy}
                        >
                          <Icon name="check" size={16} />
                          Approve stage
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </form>
          </section>
          {kindForStage[stage.key] && (
            <RecordsPanel {...props} kind={kindForStage[stage.key]} />
          )}
          {stage.key === "evidence" && (
            <Documents {...props} stageKey={stage.key} />
          )}
        </>
      )}
    </>
  );
}

const titles = {
  scope: "ISMS scope",
  controls: "Control register",
  risks: "Risk register",
  policies: "Policy register",
  tasks: "Remediation tasks",
  vendors: "Vendor register",
  assets: "Asset inventory",
  training: "Training register",
  integrations: "Integration inventory",
};
export function RecordsPanel({
  workspace,
  records,
  kind,
  role,
  api,
  perform,
  busy,
}) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const readOnly =
    role === "auditor" ||
    (["scope", "controls", "policies"].includes(kind) &&
      !["admin", "reviewer"].includes(role));
  const items = records.filter(
    (item) =>
      item.kind === kind &&
      `${item.data.title} ${item.data.owner}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const controls = records.filter((item) => item.kind === "controls");
  const title = titles[kind];
  const statuses = {
    controls: ["not_started", "in_progress", "passing", "attention"],
    tasks: ["not_started", "in_progress", "resolved"],
    policies: ["draft", "approved"],
  }[kind] || ["draft", "in_progress", "approved", "resolved"];
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>
            {kind === "integrations"
              ? "Connection inventory only. Live provider connections are not configured."
              : "Client-specific records, ownership and review status."}
          </p>
        </div>
        {!readOnly && (
          <button
            className="secondary"
            onClick={() => setEditing({ data: {} })}
          >
            <Icon name="plus" size={16} />
            Add record
          </button>
        )}
      </div>
      <label className="search register-search">
        <Icon name="search" />
        <input
          aria-label={`Search ${title}`}
          placeholder={`Search ${title.toLowerCase()}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {items.length ? (
        <div className="register-list">
          {items.map((item) => (
            <article key={item.id} className="register-row">
              <div className="register-mark">
                <Icon name={kind === "controls" ? "shield" : "file"} />
              </div>
              <div className="register-copy">
                <h3>{item.data.title}</h3>
                <p>
                  {item.data.reference ? `${item.data.reference} · ` : ""}
                  {item.data.owner || "Owner unassigned"}
                  {kind === "risks"
                    ? ` · Inherent ${item.data.inherentScore}/25 · Residual ${item.data.residualScore}/25`
                    : ""}
                </p>
                {item.data.description && (
                  <p className="clamp-text">{item.data.description}</p>
                )}
              </div>
              <Badge status={item.data.status} />
              <button
                className="icon-button"
                aria-label={`${readOnly ? "View" : "Edit"} ${item.data.title}`}
                onClick={() => setEditing(item)}
              >
                <Icon name="edit" size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={`No ${title.toLowerCase()} records yet`}>
          Create the first record to capture the client’s requirements and
          responsibilities.
        </Empty>
      )}
      {editing && (
        <Modal
          title={`${editing.id ? (readOnly ? "View" : "Edit") : "Add"} ${kind === "scope" ? "scope" : "record"}`}
          wide
          onClose={() => !busy && setEditing(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              if (kind === "controls")
                values.applicable = values.applicable !== "false";
              const base = `/workspaces/${workspace.id}/records/`;
              if (
                await perform(
                  () =>
                    api(
                      base + (editing.id || kind),
                      editing.id ? "PATCH" : "POST",
                      values,
                    ),
                  "Record saved.",
                )
              )
                setEditing(null);
            }}
          >
            <fieldset disabled={readOnly || busy}>
              <div className="form-grid">
                <label>
                  Title
                  <input
                    required
                    name="title"
                    defaultValue={editing.data.title || ""}
                  />
                </label>
                <label>
                  Owner
                  <input name="owner" defaultValue={editing.data.owner || ""} />
                </label>
                <label className="full">
                  {kind === "scope"
                    ? "Services, systems, locations and information in scope"
                    : "Description"}
                  <textarea
                    rows={4}
                    name="description"
                    defaultValue={editing.data.description || ""}
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={editing.data.status || statuses[0]}
                  >
                    {[
                      ...new Set(
                        [editing.data.status, ...statuses].filter(Boolean),
                      ),
                    ].map((status) => (
                      <option key={status} value={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due / review date
                  <input
                    type="date"
                    name="dueDate"
                    defaultValue={editing.data.dueDate || ""}
                  />
                </label>
                {kind === "controls" && (
                  <>
                    <label>
                      Framework reference
                      <input
                        name="reference"
                        defaultValue={editing.data.reference || ""}
                      />
                    </label>
                    <label>
                      Applicability
                      <select
                        name="applicable"
                        defaultValue={
                          editing.data.applicable === false ? "false" : "true"
                        }
                      >
                        <option value="true">Applicable</option>
                        <option value="false">Excluded</option>
                      </select>
                    </label>
                    <label className="full">
                      Applicability rationale
                      <textarea
                        name="justification"
                        defaultValue={editing.data.justification || ""}
                      />
                    </label>
                  </>
                )}
                {kind === "tasks" && (
                  <label className="full">
                    Related control
                    <select
                      name="controlId"
                      defaultValue={editing.data.controlId || ""}
                    >
                      <option value="">No control selected</option>
                      {controls.map((control) => (
                        <option key={control.id} value={control.id}>
                          {control.data.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === "risks" && (
                  <>
                    {[
                      ["likelihood", "Inherent likelihood"],
                      ["impact", "Inherent impact"],
                      ["residualLikelihood", "Residual likelihood"],
                      ["residualImpact", "Residual impact"],
                    ].map(([name, text]) => (
                      <label key={name}>
                        {text} (1–5)
                        <input
                          type="number"
                          min="1"
                          max="5"
                          required
                          name={name}
                          defaultValue={editing.data[name] || 3}
                        />
                      </label>
                    ))}
                    <label className="full">
                      Treatment plan
                      <textarea
                        name="treatment"
                        defaultValue={editing.data.treatment || ""}
                      />
                    </label>
                  </>
                )}
              </div>
            </fieldset>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Close
              </button>
              {!readOnly && (
                <button className="primary" disabled={busy}>
                  Save record
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function Team({ workspace, members, role, api, perform, busy }) {
  const [adding, setAdding] = useState(false);
  const [invitations,setInvitations]=useState([]),[createdInvite,setCreatedInvite]=useState(null);
  const loadInvites=()=>role==='admin'?api(`/workspaces/${workspace.id}/invitations`).then(setInvitations):Promise.resolve();
  useEffect(()=>{loadInvites().catch(()=>{});},[workspace.id,role]);
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE ADMINISTRATION"
        title="People & access"
        description={`Manage who can work with ${workspace.name} and review its delivery outputs.`}
        actions={
          role === "admin" && (
            <button className="primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={17} />
              Invite member
            </button>
          )
        }
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Workspace members</h2>
            <p>Access applies only to this client workspace.</p>
          </div>
          <span className="count-label">{members.length} members</span>
        </div>
        <div className="member-list">
          {members.map((member) => (
            <article className="member" key={member.id}>
              <span className="avatar">
                {member.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h3>{member.name}</h3>
                <p>{member.email}</p>
              </div>
              <Badge status={member.role} />
              {role==='admin'&&member.role!=='admin'&&<button className="secondary" disabled={busy} onClick={()=>{if(window.confirm(`Remove ${member.name} from this workspace?`))perform(()=>api(`/workspaces/${workspace.id}/members/${member.id}`,'DELETE'),'Workspace access removed.');}}>Remove access</button>}
            </article>
          ))}
        </div>
      </section>
      {createdInvite&&<section className="panel" style={{padding:24}}><h2>Share this invitation privately</h2><p>Send it only to the named recipient. This link is shown now; it is not stored in readable form.</p><input aria-label="Private invitation URL" value={createdInvite.url} readOnly/><button className="secondary" onClick={()=>navigator.clipboard?.writeText(createdInvite.url)}>Copy invitation</button><button className="secondary" onClick={()=>setCreatedInvite(null)}>Hide link</button></section>}
      {role==='admin'&&<section className="panel" style={{padding:24}}><h2>Invitations</h2>{invitations.length?invitations.map(invite=><div key={invite.id} className="member"><span>{invite.name} · {invite.email} · {invite.role}</span><span>{invite.accepted_at?'Accepted':invite.revoked_at?'Cancelled':new Date(invite.expires_at)<new Date()?'Expired':'Pending'}</span>{!invite.accepted_at&&!invite.revoked_at&&new Date(invite.expires_at)>new Date()&&<button className="secondary" onClick={async()=>{const done=await perform(()=>api(`/workspaces/${workspace.id}/invitations/${invite.id}/revoke`,'POST',{}),'Invitation cancelled.');if(done)await loadInvites();}}>Cancel invitation</button>}</div>):<p>No invitations yet.</p>}</section>}
      <div className="role-cards">
        {[
          ["admin", "Manage the workspace and client access."],
          ["reviewer", "Review documents and approve delivery stages."],
          ["client", "Coordinate client tasks, records and evidence."],
          ["employee", "Access only assigned tasks and published policies."],
          ["auditor", "Inspect evidence with read-only access."],
        ].map(([name, description]) => (
          <article className="panel" key={name}>
            <h3>{label(name)}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
      {adding && (
        <Modal
          title="Invite workspace member"
          onClose={() => !busy && setAdding(false)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              if (
                await perform(
                  async()=>{const result=await api(`/workspaces/${workspace.id}/invitations`, "POST", values);setCreatedInvite(result);await loadInvites();},
                  "Private invitation created.",
                )
              )
                setAdding(false);
            }}
          >
            <label>
              Full name
              <input name="name" required autoComplete="off" />
            </label>
            <label>
              Email address
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Role
              <select name="role" aria-label="Role">
                <option value="client">Client</option>
                <option value="reviewer">Reviewer</option>
                <option value="employee">Employee</option>
                <option value="auditor">Auditor · read only</option>
              </select>
            </label>
            <p className="helper">The recipient chooses their own password. Invitations expire in 72 hours and can be used once. Share the link privately with the named person.</p>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Create private invitation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
