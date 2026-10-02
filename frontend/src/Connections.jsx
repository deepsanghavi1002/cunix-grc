import React, { useState } from "react";
import { Badge, Icon, Modal } from "./ui.jsx";
export function Connections({
  collector,
  workspace,
  role,
  api,
  perform,
  busy,
}) {
  const [token, setToken] = useState(null),
    [confirm, setConfirm] = useState(null);
  const base = `/workspaces/${workspace.id}/isms/collector`;
  return (
    <>
      <section className="panel isms-section">
        <span className="eyebrow">CONNECTED EVIDENCE</span>
        <h2>GitHub branch protection collector</h2>
        <p>
          Run the included collector in your client’s CI or trusted scheduler.
          It reads GitHub branch protection and sends the result here. GitHub
          credentials stay with the client.
        </p>
        <div className="isms-button-row">
          <Badge
            status={
              !collector.config
                ? "not_connected"
                : !collector.config.enabled
                  ? "revoked"
                  : new Date(collector.config.expires_at) < new Date()
                    ? "expired"
                    : collector.observations.length
                      ? "receiving"
                      : "awaiting_data"
            }
          />
          {collector.config && (
            <small>
              Token expires{" "}
              {new Date(collector.config.expires_at).toLocaleDateString()}
            </small>
          )}
        </div>
        <p>
          Reported observations do not automatically approve evidence or confirm
          compliance. Missing permissions produce “unknown”; results older than
          26 hours become stale.
        </p>
        {role === "admin" && (
          <div className="isms-button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => setConfirm("rotate")}
            >
              {collector.config
                ? "Rotate collector token"
                : "Create collector token"}
            </button>
            {collector.config?.enabled && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setConfirm("revoke")}
              >
                Revoke collector
              </button>
            )}
          </div>
        )}
        <div className="isms-evidence-box">
          <h3>Client installation</h3>
          <ol>
            <li>
              Use Node 22 or later and the repository’s{" "}
              <code>scripts/github-collector.mjs</code>.
            </li>
            <li>
              Store <code>CUNIX_COLLECTOR_TOKEN</code> and, for private
              repositories, <code>GITHUB_TOKEN</code> as CI secrets. GitHub
              requires repository Contents read access.
            </li>
            <li>
              Set <code>CUNIX_URL</code> to your deployed HTTPS app,{" "}
              <code>CUNIX_TENANT</code> to <code>{workspace.id}</code>,{" "}
              <code>GITHUB_REPOSITORY</code> to owner/repo and{" "}
              <code>GITHUB_BRANCH</code> to the protected branch.
            </li>
            <li>
              Schedule <code>node scripts/github-collector.mjs</code> daily.
              Localhost requires a runner on this machine; hosted runners need a
              reachable deployment.
            </li>
          </ol>
        </div>
      </section>
      {collector.observations.map((o) => (
        <article className="panel isms-signal" key={o.key}>
          <span
            className={`isms-signal-icon ${o.status === "pass" && !o.stale ? "clear" : "attention"}`}
          >
            <Icon name={o.status === "pass" && !o.stale ? "check" : "alert"} />
          </span>
          <div>
            <h3>{o.title}</h3>
            <p>{o.detail}</p>
            <small>{o.provenance}</small>
            <p>
              Observed {new Date(o.observedAt).toLocaleString()} · {o.ref}
            </p>
          </div>
          <Badge status={o.stale ? "stale" : o.status} />
        </article>
      ))}
      {confirm && (
        <Modal
          title={
            confirm === "rotate"
              ? "Create a scoped collector credential"
              : "Revoke the collector credential"
          }
          onClose={() => setConfirm(null)}
        >
          <div className="isms-guide-detail">
            <p>
              {confirm === "rotate"
                ? "This credential can submit GitHub check results to this client workspace for 90 days. It cannot read documents. Creating it replaces the previous token."
                : "Existing collectors will stop submitting observations. Historical results remain visible and will become stale."}
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await perform(async () => {
                    const result = await api(
                      base,
                      confirm === "rotate" ? "POST" : "DELETE",
                      {},
                    );
                    if (result.token) setToken(result.token);
                  }, "Collector configuration updated.")
                )
                  setConfirm(null);
              }}
            >
              Confirm {confirm === "rotate" ? "creation" : "revocation"}
            </button>
          </div>
        </Modal>
      )}
      {token && (
        <Modal title="Save your collector token" onClose={() => setToken(null)}>
          <div className="isms-guide-detail">
            <p>
              This token is shown only once. Store it in the client runner’s
              secret store. Only its hash is retained by the server.
            </p>
            <label>
              Collector token
              <textarea readOnly value={token} rows={3} />
            </label>
            <button className="primary" onClick={() => setToken(null)}>
              I have saved the token
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
