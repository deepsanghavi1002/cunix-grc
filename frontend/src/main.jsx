import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./service.css";
import { ComplianceWorkbench } from "./ComplianceWorkbench.jsx";
const modules = [
  "Overview",
  "Readiness",
  "Scope",
  "Controls",
  "Documents",
  "Risks",
  "Vendors",
  "Assets",
  "Policies",
  "Tasks",
  "Training",
  "Integrations",
  "Activity",
  "Members",
];
async function api(path, method = "GET", body) {
  const r = await fetch("/api/service" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
function App() {
  const [me, setMe] = useState(null),
    [tenant, setTenant] = useState(""),
    [records, setRecords] = useState([]),
    [events, setEvents] = useState([]),
    [page, setPage] = useState("Overview"),
    [error, setError] = useState(""),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  const base = `/workspaces/${tenant}`;
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (tenant) {
      setRecords(await api(base + "/records"));
      setEvents(await api(base + "/events"));
    }
  };
  useEffect(() => {
    api("/me")
      .then((x) => {
        setMe(x);
        setTenant(x.workspaces[0]?.id || "");
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    run(refresh);
  }, [tenant]);
  const login = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    run(async () => {
      if (register) {
        await api("/register", "POST", body);
        setRegister(false);
      }
      await api("/login", "POST", body);
      const x = await api("/me");
      setMe(x);
      setTenant(x.workspaces[0]?.id || "");
    });
  };
  const save = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    run(async () => {
      await api(base + "/records/" + page.toLowerCase(), "POST", body);
      e.target.reset();
      await refresh();
    });
  };
  const upload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Maximum upload size is 5 MB.");
      return;
    }
    run(async () => {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api(base + "/upload", "POST", { filename: file.name, content });
      await refresh();
    });
  };
  const update = (id, body) =>
    run(async () => {
      await api(base + "/records/" + id, "PATCH", body);
      await refresh();
    });
  if (!me)
    return (
      <main className="auth">
        <p className="eyebrow">CUNIX / CONTINUOUS COMPLIANCE</p>
        <h1>Your compliance workspace</h1>
        <p>Manage the work behind audit readiness.</p>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={login}>
          {register && (
            <>
              <label>
                Company
                <input name="company" required />
              </label>
              <label>
                Your name
                <input name="name" required />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              minLength={12}
              required
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          <button disabled={busy}>
            {register ? "Create workspace" : "Sign in"}
          </button>
        </form>
        <button className="secondary" onClick={() => setRegister(!register)}>
          {register ? "Back to sign in" : "Create a client workspace"}
        </button>
      </main>
    );
  const role = me.workspaces.find((w) => w.id === tenant)?.role;
  const current = records.filter((r) => r.kind === page.toLowerCase());
  const controls = records.filter((r) => r.kind === "controls"),
    docs = records.filter((r) => r.kind === "documents"),
    tasks = records.filter((r) => r.kind === "tasks");
  return (
    <div className="shell">
      <aside>
        <h2>
          CUNIX <span>GRC</span>
        </h2>
        <select
          aria-label="Workspace"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
        >
          {me.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <nav>
          {modules.map((m) => (
            <button
              key={m}
              className={page === m ? "selected" : "secondary"}
              onClick={() => setPage(m)}
            >
              {m}
            </button>
          ))}
        </nav>
        <small>
          {me.user.name} · {role}
        </small>
        <button
          className="secondary"
          onClick={() =>
            run(async () => {
              await api("/logout", "POST");
              setMe(null);
            })
          }
        >
          Sign out
        </button>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">CLIENT WORKSPACE / ISO 27001</p>
            <h1>{page}</h1>
          </div>
          <a className="export" href={"/api/service" + base + "/export"}>
            Export audit package
          </a>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {busy && <p role="status">Updating workspace…</p>}
        {page === "Documents" && role !== "auditor" && (
          <article className="card">
            <h2>Upload evidence</h2>
            <label>
              PDF, DOCX, TXT, Markdown or CSV · maximum 5 MB
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={upload}
                disabled={busy}
              />
            </label>
            <p>
              Originals are retained privately in this workspace. Extracted text
              requires human review. Scanned PDFs require OCR.
            </p>
          </article>
        )}
        {page === "Readiness" ? (
          <ComplianceWorkbench
            base={base}
            role={role}
            api={api}
            records={records}
            refresh={refresh}
            run={run}
          />
        ) : page === "Overview" ? (
          <>
            <section className="metrics">
              <article>
                <span>Control implementation</span>
                <strong>
                  {controls.filter((c) => c.data.status === "passing").length}/
                  {controls.length}
                </strong>
                <small>Based on recorded control status</small>
              </article>
              <article>
                <span>Evidence awaiting review</span>
                <strong>
                  {
                    docs.filter((d) => d.data.status === "review_required")
                      .length
                  }
                </strong>
              </article>
              <article>
                <span>Open tasks</span>
                <strong>
                  {tasks.filter((t) => t.data.status !== "resolved").length}
                </strong>
              </article>
            </section>
            <article className="card">
              <h2>Client onboarding</h2>
              <ol>
                <li>
                  Complete Scope: describe services, locations, systems and
                  information.
                </li>
                <li>Review the starter controls and their applicability.</li>
                <li>
                  Assign owners and register policies and operational evidence.
                </li>
                <li>
                  Submit documents for a Cunix reviewer to approve or return.
                </li>
                <li>
                  Track gaps through Tasks and export the evidence register.
                </li>
              </ol>
              <p>
                The starter control set is illustrative. Complete your licensed
                ISO requirements and Statement of Applicability with your
                compliance lead.
              </p>
            </article>
          </>
        ) : page === "Activity" ? (
          <article className="card">
            {events.map((e) => (
              <div className="finding" key={e.id}>
                <b>{e.action}</b>
                <small>
                  {e.actor} · {new Date(e.created_at).toLocaleString()}
                </small>
              </div>
            ))}
          </article>
        ) : page === "Members" ? (
          <article className="card">
            <h2>Onboard another client</h2>
            {role === "admin" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  run(async () => {
                    const created = await api("/workspaces", "POST", body);
                    const profile = await api("/me");
                    setMe(profile);
                    setTenant(created.id);
                  });
                }}
              >
                <label>
                  Client company
                  <input name="company" required />
                </label>
                <button disabled={busy}>Create isolated workspace</button>
              </form>
            )}
            <h2>Create client or reviewer access</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.target));
                run(async () => {
                  await api(base + "/members", "POST", body);
                  e.target.reset();
                });
              }}
            >
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Initial password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                Role
                <select name="role">
                  <option>client</option>
                  <option>reviewer</option>
                  <option>auditor</option>
                </select>
              </label>
              <button disabled={busy || role !== "admin"}>
                Create account
              </button>
            </form>
            <p>
              Share initial credentials through your approved secure channel.
              Email invitation delivery is not configured.
            </p>
          </article>
        ) : (
          <>
            <section className="grid">
              <article className="card">
                <h2>Add {page.toLowerCase().replace(/s$/, "")}</h2>
                {role !== "auditor" && (
                  <form onSubmit={save}>
                    <label>
                      Title
                      <input name="title" required />
                    </label>
                    <label>
                      Owner
                      <input name="owner" defaultValue={me.user.name} />
                    </label>
                    <label>
                      Description / evidence text
                      <textarea name="description" />
                    </label>
                    {page === "Documents" && (
                      <>
                        <label>
                          Document category
                          <select name="category">
                            <option>policy</option>
                            <option>risk assessment</option>
                            <option>access review</option>
                            <option>audit report</option>
                            <option>training evidence</option>
                          </select>
                        </label>
                        <p>
                          Register extracted text here. Or upload an original
                          using the form above.
                        </p>
                      </>
                    )}
                    {["Risks", "Tasks", "Vendors"].includes(page) && (
                      <label>
                        Severity
                        <select name="severity">
                          <option>medium</option>
                          <option>high</option>
                          <option>low</option>
                          <option>critical</option>
                        </select>
                      </label>
                    )}
                    {page === "Risks" && (
                      <>
                        <label>
                          Inherent likelihood (1–5)
                          <input
                            type="number"
                            min="1"
                            max="5"
                            name="likelihood"
                            defaultValue="3"
                            required
                          />
                        </label>
                        <label>
                          Inherent impact (1–5)
                          <input
                            type="number"
                            min="1"
                            max="5"
                            name="impact"
                            defaultValue="3"
                            required
                          />
                        </label>
                        <label>
                          Residual likelihood (1–5)
                          <input
                            type="number"
                            min="1"
                            max="5"
                            name="residualLikelihood"
                            defaultValue="3"
                            required
                          />
                        </label>
                        <label>
                          Residual impact (1–5)
                          <input
                            type="number"
                            min="1"
                            max="5"
                            name="residualImpact"
                            defaultValue="3"
                            required
                          />
                        </label>
                        <label>
                          Treatment plan
                          <textarea name="treatment" />
                        </label>
                      </>
                    )}
                    <label>
                      Due / review date
                      <input type="date" name="dueDate" />
                    </label>
                    <button disabled={busy}>Save record</button>
                  </form>
                )}
              </article>
              <article className="card">
                <h2>{current.length} records</h2>
                {current.length === 0 && (
                  <p>No records yet. Add the first record to begin.</p>
                )}
                {current.map((r) => (
                  <div className="record" key={r.id}>
                    <div className="finding">
                      <b>{r.data.title}</b>
                      <span className="badge">
                        {r.data.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <small>
                      {r.data.reference} · {r.data.owner}
                    </small>
                    <p>{r.data.description}</p>
                    {r.kind === "risks" && (
                      <p>
                        Inherent: {r.data.inherentScore}/25 · Residual:{" "}
                        {r.data.residualScore}/25 · {r.data.rating}
                        <br />
                        {r.data.treatment}
                      </p>
                    )}
                    {r.data.note && <p>{r.data.note}</p>}
                    {role !== "auditor" && (
                      <>
                        {page === "Documents" ? (
                          <>
                            <label>
                              Mapped control
                              <select
                                value={r.data.controlId || ""}
                                onChange={(e) =>
                                  update(r.id, {
                                    controlId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Select control</option>
                                {controls.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.data.reference} {c.data.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Reviewer note
                              <textarea
                                defaultValue={r.data.reviewNote}
                                onBlur={(e) => {
                                  if (e.target.value !== r.data.reviewNote)
                                    update(r.id, {
                                      reviewNote: e.target.value,
                                    });
                                }}
                              />
                            </label>
                            {["admin", "reviewer"].includes(role) && (
                              <div className="actions">
                                <button
                                  onClick={() =>
                                    update(r.id, { status: "approved" })
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() =>
                                    update(r.id, { status: "review_required" })
                                  }
                                >
                                  Return for revision
                                </button>
                              </div>
                            )}
                            <small>
                              {r.data.reviewedBy &&
                                `Reviewed by ${r.data.reviewedBy}`}
                            </small>
                          </>
                        ) : (
                          page !== "Integrations" && (
                            <label>
                              Status
                              <select
                                value={r.data.status}
                                onChange={(e) =>
                                  update(r.id, { status: e.target.value })
                                }
                              >
                                {[
                                  "draft",
                                  "not_started",
                                  "in_progress",
                                  "attention",
                                  "passing",
                                  "resolved",
                                  "approved",
                                ].map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            </label>
                          )
                        )}
                      </>
                    )}
                  </div>
                ))}
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
