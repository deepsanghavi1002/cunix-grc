import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FeedbackContext,
  Badge,
  Empty,
  Icon,
  Modal,
  PageHeading,
  Stat,
  label,
} from "./ui.jsx";
import { Pipeline, StageDetail, RecordsPanel, Team } from "./Workspace.jsx";
import { Documents } from "./Documents.jsx";
import { ComplianceWorkbench } from "./ComplianceWorkbench.jsx";
import { ISMS, AttentionQueue } from "./ISMS.jsx";
import "./styles.css";
import "./isms.css";

async function api(path, method = "GET", body, signal) {
  const response = await fetch("/api/service" + path, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "The request could not be completed.");
  return data;
}
const navigate = (path) => {
  window.location.hash = path;
};
function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const parts = hash.replace(/^#\/?/, "").split("/");
  return {
    workspaceId: parts[0] === "workspace" ? parts[1] : "",
    page: parts[0] === "workspace" ? parts[2] || "pipeline" : "clients",
    detail: parts[3] || "",
  };
}
const navigation = [
  ["isms", "shield", "Guided ISMS & monitoring"],
  ["pipeline", "layers", "Engagement timeline"],
  ["documents", "file", "Document library"],
  ["reviews", "check", "Review workspace"],
  ["readiness", "shield", "Readiness & audits"],
  ["registers", "grid", "Registers"],
  ["team", "people", "People & access"],
  ["activity", "clock", "Activity log"],
];

function Login({ onLogin, error, busy }) {
  const [register, setRegister] = useState(false);
  const [centralLogin, setCentralLogin] = useState(false);
  useEffect(() => {
    let mounted = true;
    api("/auth-config")
      .then((config) => {
        if (mounted) setCentralLogin(config.centralLogin);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <div className="login-layout">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="shield" size={24} />
          </span>
          <div>
            <strong>
              CUNIX <span>GRC</span>
            </strong>
            <small>Compliance delivery workspace</small>
          </div>
        </div>
        <div className="story-copy">
          <p className="eyebrow">CLARITY AT EVERY STAGE</p>
          <h1>
            From client onboarding
            <br />
            to audit readiness.
          </h1>
          <p>
            Bring your clients, documents and review decisions together in one
            connected delivery workflow.
          </p>
          <div className="story-steps">
            {[
              "Onboard the client",
              "Collect the evidence",
              "Review and deliver",
            ].map((text, index) => (
              <div key={text}>
                <span>0{index + 1}</span>
                {text}
                <Icon name="check" size={16} />
              </div>
            ))}
          </div>
        </div>
        <p className="story-footer">
          <Icon name="shield" size={16} />
          Dedicated client workspaces. Human-reviewed outcomes.
        </p>
      </section>
      <main className="login-side">
        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(
              Object.fromEntries(new FormData(event.currentTarget)),
              register,
            );
          }}
        >
          <p className="eyebrow">YOUR DELIVERY WORKSPACE</p>
          <h2>{register ? "Create your workspace" : "Welcome back"}</h2>
          <p className="muted">
            {register
              ? "Set up your organization to begin managing client engagements."
              : "Sign in to continue your client engagements."}
          </p>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {centralLogin && !register && (
            <>
              <button
                className="primary full-button"
                type="button"
                onClick={() =>
                  window.location.assign("/api/service/oidc/login")
                }
              >
                Sign in with CUNIX Inspire
              </button>
              <p className="muted">Emergency local sign-in</p>
            </>
          )}
          {register && (
            <>
              <label>
                Organization
                <input name="company" required autoComplete="organization" />
              </label>
              <label>
                Your name
                <input name="name" required autoComplete="name" />
              </label>
            </>
          )}
          <label>
            Email address
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={register ? 12 : undefined}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          <button className="primary full-button" disabled={busy}>
            {busy
              ? "Opening workspace…"
              : register
                ? "Create workspace"
                : "Open workspace"}
            <Icon name="arrow" size={17} />
          </button>
          <button
            type="button"
            className="text-button login-switch"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create an organization"}
          </button>
        </form>
        <p className="login-footnote">
          Cunix GRC · Organized evidence. Clear ownership.
        </p>
      </main>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [me, setMe] = useState(null),
    [booting, setBooting] = useState(true),
    [portfolio, setPortfolio] = useState([]),
    [data, setData] = useState(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState("");
  const activeWorkspace = useRef(route.workspaceId);
  activeWorkspace.current = route.workspaceId;
  const requestVersion = useRef(0);
  const workspace = me?.workspaces.find(
    (item) => item.id === route.workspaceId,
  );
  const base = workspace ? `/workspaces/${workspace.id}` : "";
  const loadWorkspace = useCallback(async (id, signal) => {
    const version = ++requestVersion.current;
    const paths = [
      "records",
      "stages",
      "events",
      "members",
      "readiness",
      "trash",
      "isms",
      "isms/collector",
    ];
    const results = await Promise.all(
      paths.map((path) =>
        api(`/workspaces/${id}/${path}`, "GET", undefined, signal),
      ),
    );
    if (activeWorkspace.current === id && requestVersion.current === version)
      setData({
        id,
        ...Object.fromEntries(
          paths.map((path, index) => [path, results[index]]),
        ),
      });
  }, []);
  const refreshPortfolio = useCallback(
    async () => setPortfolio(await api("/portfolio")),
    [],
  );
  useEffect(() => {
    api("/me")
      .then((profile) => {
        setMe(profile);
        return refreshPortfolio();
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    setMobile(false);
    setError("");
    setNotice("");
    if (!workspace) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setData(null);
    loadWorkspace(workspace.id, controller.signal).catch((error) => {
      if (error.name !== "AbortError") setError(error.message);
    });
    return () => controller.abort();
  }, [workspace?.id, loadWorkspace]);
  const refresh = async () => {
    await Promise.all([
      refreshPortfolio(),
      workspace ? loadWorkspace(workspace.id) : Promise.resolve(),
    ]);
  };
  const perform = async (action, message = "") => {
    setBusy(true);
    setError("");
    setNotice("");
    const id = activeWorkspace.current;
    try {
      await action();
      if (id === activeWorkspace.current) await refresh();
      setNotice(message);
      return true;
    } catch (error) {
      setError(error.message);
      if (id && id === activeWorkspace.current)
        await loadWorkspace(id).catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  };
  const onLogin = async (values, register) => {
    setBusy(true);
    setError("");
    try {
      if (register) await api("/register", "POST", values);
      await api("/login", "POST", values);
      setMe(await api("/me"));
      await refreshPortfolio();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  if (booting)
    return (
      <div className="loading-screen">
        <span className="brand-mark">
          <Icon name="shield" />
        </span>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!me) return <Login onLogin={onLogin} busy={busy} error={error} />;
  const canCreate = me.workspaces.some((item) => item.role === "admin");
  const toPage = (page, detail = "") => {
    setError("");
    setNotice("");
    setMobile(false);
    navigate(`/workspace/${workspace.id}/${page}${detail ? "/" + detail : ""}`);
  };
  const currentData = data?.id === workspace?.id ? data : null;
  const props = currentData && {
    ...currentData,
    workspace,
    role: workspace.role,
    api,
    perform,
    busy,
  };
  const currentStage = currentData?.stages.find(
    (stage) => stage.key === route.detail,
  );
  const filtered = portfolio.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <FeedbackContext.Provider value={error}>
      <div className="app-shell">
        {mobile && (
          <button
            className="mobile-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
          <a
            href="#/clients"
            className="brand"
            onClick={() => setMobile(false)}
          >
            <span className="brand-mark">
              <Icon name="shield" size={24} />
            </span>
            <div>
              <strong>
                CUNIX <span>GRC</span>
              </strong>
              <small>Compliance delivery workspace</small>
            </div>
          </a>
          <div className="sidebar-context">
            <span className="context-dot" />
            <div>
              <strong>Client delivery</strong>
              <small>Human-reviewed outcomes</small>
            </div>
          </div>
          <a
            href="#/clients"
            className={`nav-link ${!workspace ? "selected" : ""}`}
            onClick={() => setMobile(false)}
          >
            <Icon name="building" />
            Client workspaces
            <span className="nav-count">{me.workspaces.length}</span>
          </a>
          <div className="nav-label">ACTIVE WORKSPACE</div>
          <select
            className="workspace-select"
            aria-label="Switch client workspace"
            value={workspace?.id || ""}
            onChange={(event) => {
              setMobile(false);
              navigate(
                event.target.value
                  ? `/workspace/${event.target.value}/isms`
                  : "/clients",
              );
            }}
          >
            <option value="">Select a client workspace</option>
            {me.workspaces.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <nav>
            {workspace ? (
              navigation.map(([page, icon, text]) => (
                <button
                  key={page}
                  className={`nav-link ${route.page === page || (page === "pipeline" && route.page === "stage") ? "selected" : ""}`}
                  onClick={() => toPage(page)}
                >
                  <Icon name={icon} />
                  {text}
                  {page === "reviews" &&
                    currentData?.records.filter(
                      (item) =>
                        item.kind === "documents" &&
                        item.data.status !== "approved",
                    ).length > 0 && (
                      <span className="nav-count">
                        {
                          currentData.records.filter(
                            (item) =>
                              item.kind === "documents" &&
                              item.data.status !== "approved",
                          ).length
                        }
                      </span>
                    )}
                </button>
              ))
            ) : (
              <div className="sidebar-help">
                <Icon name="layers" size={25} />
                <p>
                  Select a client to open their delivery timeline, documents and
                  review workspace.
                </p>
              </div>
            )}
          </nav>
          <div className="sidebar-footer">
            <span className="avatar">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {workspace ? label(workspace.role) : "Your account"}
              </small>
            </div>
            <button
              className="logout"
              aria-label="Sign out"
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/logout", "POST", {});
                  setMe(null);
                  setData(null);
                  navigate("/clients");
                } catch (error) {
                  setError(error.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <div className="topbar">
            <div className="topbar-location">
              <button
                className="icon-button mobile-toggle"
                aria-label="Toggle navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Icon name="menu" />
              </button>
              <Icon name="building" size={16} />
              <span>Client workspaces</span>
              {workspace && (
                <>
                  <Icon name="chevron" size={13} />
                  <strong>{workspace.name}</strong>
                </>
              )}
            </div>
            <span className="topbar-status">
              <span />
              Private workspace
            </span>
          </div>
          <main className="page-content">
            {error && (
              <div className="error-banner" role="alert">
                <Icon name="alert" size={18} />
                {error}
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="success-banner" role="status">
                <Icon name="check" size={17} />
                {notice}
              </div>
            )}
            {busy && (
              <div className="saving-indicator" role="status">
                Saving changes…
              </div>
            )}
            {!workspace ? (
              <>
                <PageHeading
                  eyebrow="YOUR CLIENT PORTFOLIO"
                  title="Client workspaces"
                  description="One clear path from onboarding to audit readiness. Every client gets their own people, documents and delivery stages."
                  actions={
                    canCreate && (
                      <button
                        className="primary"
                        onClick={() => {
                          setError("");
                          setCreating(true);
                        }}
                      >
                        <Icon name="plus" size={18} />
                        Onboard client
                      </button>
                    )
                  }
                />
                <div className="portfolio-intro">
                  <div>
                    <span className="eyebrow">BUILT AROUND YOUR DELIVERY</span>
                    <h2>
                      Every engagement. Every stage.
                      <br />
                      One shared view.
                    </h2>
                    <p>
                      Bring the right evidence, owners and approvals together in
                      a dedicated workspace for each client.
                    </p>
                  </div>
                  <div className="intro-stages">
                    {[
                      ["01", "Onboard", "people"],
                      ["02", "Collect", "file"],
                      ["03", "Review", "check"],
                      ["04", "Deliver", "shield"],
                    ].map(([number, text, icon]) => (
                      <div key={number}>
                        <span>
                          <Icon name={icon} size={22} />
                        </span>
                        <small>{number}</small>
                        <strong>{text}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="stats-grid portfolio-stats">
                  <Stat
                    icon="building"
                    title="Client workspaces"
                    value={portfolio.length}
                    detail="Accessible to your account"
                  />
                  <Stat
                    icon="layers"
                    title="Stages approved"
                    value={portfolio.reduce(
                      (sum, item) => sum + item.approvedStages,
                      0,
                    )}
                    detail="Across client engagements"
                  />
                  <Stat
                    icon="file"
                    title="Evidence documents"
                    value={portfolio.reduce(
                      (sum, item) => sum + item.documents,
                      0,
                    )}
                    detail="Active documents in the library"
                  />
                  <Stat
                    icon="clock"
                    title="Awaiting review"
                    value={portfolio.reduce(
                      (sum, item) => sum + item.pending,
                      0,
                    )}
                    detail="Ready for a reviewer’s attention"
                    tone="amber"
                  />
                </div>
                <div className="section-heading">
                  <div>
                    <h2>
                      Your clients <span>{portfolio.length}</span>
                    </h2>
                    <p>Open a workspace to continue the engagement.</p>
                  </div>
                  <label className="search">
                    <Icon name="search" />
                    <input
                      aria-label="Search clients"
                      placeholder="Search client workspaces…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>
                <AttentionQueue portfolio={portfolio} />
                <div className="client-grid">
                  {filtered.map((item) => (
                    <article className="client-card" key={item.id}>
                      <div className="client-card-top">
                        <span className="client-avatar">
                          {item.name.slice(0, 2).toUpperCase()}
                        </span>
                        <Badge
                          status={
                            item.approvedStages === 6
                              ? "approved"
                              : item.stages.some(
                                    (stage) => stage.status !== "not_started",
                                  )
                                ? "in_progress"
                                : "not_started"
                          }
                        />
                      </div>
                      <h3>{item.name}</h3>
                      <p>ISO 27001 · Compliance engagement</p>
                      <div className="client-progress">
                        <div>
                          <span>Delivery progress</span>
                          <strong>{item.approvedStages} of 6 stages</strong>
                        </div>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${(item.approvedStages / 6) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="client-card-meta">
                        <span>
                          <Icon name="file" size={15} />
                          {item.documents} documents
                        </span>
                        <span>
                          <Icon name="clock" size={15} />
                          {item.pending} to review
                        </span>
                      </div>
                      <a
                        className="client-card-link"
                        href={`#/workspace/${item.id}/isms`}
                      >
                        Open workspace
                        <Icon name="arrow" size={17} />
                      </a>
                    </article>
                  ))}
                </div>
                {!filtered.length && (
                  <section className="panel">
                    <Empty
                      icon="building"
                      title={
                        search
                          ? "No matching clients"
                          : "Your next engagement starts here"
                      }
                    >
                      {search
                        ? "Try a different client name."
                        : "Onboard a client to create their dedicated delivery workspace."}
                    </Empty>
                  </section>
                )}
              </>
            ) : !currentData ? (
              <div className="workspace-loading">
                <span className="spinner" />
                <h2>Loading {workspace.name}</h2>
                <p>Bringing together stages, documents and review decisions.</p>
              </div>
            ) : (
              <>
                {route.page === "isms" && (
                  <ISMS key={workspace.id} {...props} onPage={toPage} />
                )}
                {route.page === "pipeline" && (
                  <Pipeline
                    {...props}
                    onStage={(key) => toPage("stage", key)}
                    onDocuments={() => toPage("documents")}
                  />
                )}
                {route.page === "stage" &&
                  (currentStage ? (
                    <StageDetail
                      key={workspace.id + currentStage.key}
                      {...props}
                      stage={currentStage}
                      onBack={() => toPage("pipeline")}
                      onPage={toPage}
                    />
                  ) : (
                    <Empty
                      title="Stage not found"
                      action={
                        <button
                          className="secondary"
                          onClick={() => toPage("pipeline")}
                        >
                          Back to timeline
                        </button>
                      }
                    >
                      Choose a stage from this client’s engagement timeline.
                    </Empty>
                  ))}
                {["documents", "reviews"].includes(route.page) && (
                  <>
                    <PageHeading
                      eyebrow={workspace.name}
                      title={
                        route.page === "reviews"
                          ? "Review workspace"
                          : "Document library"
                      }
                      description={
                        route.page === "reviews"
                          ? "Review submitted evidence, record your decision and keep delivery moving."
                          : "Upload, organize and review the documents behind this client’s engagement."
                      }
                    />
                    <Documents
                      key={workspace.id + route.page}
                      {...props}
                      reviewOnly={route.page === "reviews"}
                    />
                  </>
                )}
                {route.page === "registers" && (
                  <>
                    <PageHeading
                      eyebrow={workspace.name}
                      title="Compliance registers"
                      description="Keep client controls, policies, risks and responsibilities organized."
                    />
                    <div className="register-tabs">
                      {[
                        "controls",
                        "scope",
                        "policies",
                        "risks",
                        "tasks",
                        "assets",
                        "vendors",
                        "training",
                        "integrations",
                      ].map((kind) => (
                        <button
                          key={kind}
                          className={
                            (route.detail || "controls") === kind
                              ? "active"
                              : ""
                          }
                          onClick={() => toPage("registers", kind)}
                        >
                          {kind === "scope" ? "ISMS scope" : kind}
                        </button>
                      ))}
                    </div>
                    <RecordsPanel
                      key={workspace.id + route.detail}
                      {...props}
                      kind={
                        [
                          "controls",
                          "scope",
                          "policies",
                          "risks",
                          "tasks",
                          "assets",
                          "vendors",
                          "training",
                          "integrations",
                        ].includes(route.detail)
                          ? route.detail
                          : "controls"
                      }
                    />
                  </>
                )}
                {route.page === "team" && (
                  <Team key={workspace.id} {...props} />
                )}
                {route.page === "readiness" && (
                  <>
                    <PageHeading
                      eyebrow={workspace.name}
                      title="Readiness & audit preparation"
                      description="Review evidence freshness, coordinate audit requests and prepare the client handover."
                    />
                    <ComplianceWorkbench
                      key={workspace.id}
                      base={base}
                      role={workspace.role}
                      api={api}
                      records={currentData.records}
                      refresh={refresh}
                      run={perform}
                    />
                  </>
                )}
                {route.page === "activity" && (
                  <>
                    <PageHeading
                      eyebrow={workspace.name}
                      title="Activity log"
                      description="A clear record of document changes, delivery progress and review decisions."
                      actions={
                        <a
                          className="secondary"
                          href={"/api/service" + base + "/export"}
                        >
                          <Icon name="download" size={16} />
                          Export audit register
                        </a>
                      }
                    />
                    <section className="panel">
                      <div className="activity-list">
                        {currentData.events.map((event) => (
                          <article key={event.id}>
                            <span className="activity-dot">
                              <Icon
                                name={
                                  event.action.startsWith("stage")
                                    ? "layers"
                                    : "file"
                                }
                                size={16}
                              />
                            </span>
                            <div>
                              <h3>
                                {event.action
                                  .replaceAll(".", " · ")
                                  .replaceAll("_", " ")}
                              </h3>
                              <p>{event.actor}</p>
                            </div>
                            <time>
                              {new Date(event.created_at).toLocaleString()}
                            </time>
                          </article>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
            <footer className="page-footer">
              <span>CUNIX GRC</span>
              <span>
                Clear stages. Accountable reviews. Organized evidence.
              </span>
            </footer>
          </main>
        </div>
        {creating && (
          <Modal
            title="Onboard a new client"
            onClose={() => !busy && setCreating(false)}
          >
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const values = Object.fromEntries(
                  new FormData(event.currentTarget),
                );
                const done = await perform(async () => {
                  const created = await api("/workspaces", "POST", values);
                  const profile = await api("/me");
                  setMe(profile);
                  await refreshPortfolio();
                  navigate(`/workspace/${created.id}/stage/onboarding`);
                }, "Client workspace created. Start with the onboarding checklist.");
                if (done) setCreating(false);
              }}
            >
              <label>
                Client / organization name
                <input
                  name="company"
                  required
                  autoFocus
                  placeholder="e.g. Acme Technologies"
                  maxLength={150}
                />
              </label>
              <div className="onboarding-preview">
                <span className="eyebrow">INCLUDED IN THIS WORKSPACE</span>
                <p>
                  <Icon name="layers" size={17} />
                  Six structured delivery stages
                </p>
                <p>
                  <Icon name="file" size={17} />A private document and evidence
                  library
                </p>
                <p>
                  <Icon name="people" size={17} />
                  Client, reviewer and auditor access
                </p>
                <p>
                  <Icon name="shield" size={17} />
                  ISO 27001 starter control register
                </p>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCreating(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  Create client workspace
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
