import React, { useEffect, useState } from "react";

export function ComplianceWorkbench({
  base,
  role,
  api,
  records,
  refresh,
  run,
}) {
  const [report, setReport] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState([]);
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let active = true;
    setReport(null);
    Promise.all([api(base + "/readiness"), api(base + "/acknowledgements")])
      .then(([result, acknowledgements]) => {
        if (active) {
          setReport(result);
          setAcknowledgements(acknowledgements);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [base, records]);
  const governance = ["admin", "reviewer"].includes(role);
  const patch = (id, data) =>
    run(async () => {
      await api(base + "/records/" + id, "PATCH", data);
      await refresh();
    });
  return (
    <section className="workbench">
      <article className="card">
        <h2>Audit engagement and evidence requests</h2>
        {governance && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = Object.fromEntries(new FormData(form));
              run(async () => {
                await api(base + "/audits", "POST", data);
                form.reset();
                await refresh();
              });
            }}
          >
            <label>
              Audit title
              <input
                name="title"
                required
                placeholder="ISO 27001 internal audit"
              />
            </label>
            <label>
              Evidence period start
              <input name="periodStart" type="date" required />
            </label>
            <label>
              Evidence period end
              <input name="periodEnd" type="date" required />
            </label>
            <button>Create audit and control evidence requests</button>
          </form>
        )}
        {records
          .filter((item) => item.kind === "audits")
          .map((audit) => (
            <p key={audit.id}>
              <b>{audit.data.title}</b> · {audit.data.periodStart} to{" "}
              {audit.data.periodEnd} · {audit.data.controlIds.length} scoped
              controls
              <br />
              <a
                href={
                  "/api/service" + base + "/audits/" + audit.id + "/package"
                }
              >
                Download audit evidence package
              </a>
            </p>
          ))}
      </article>
      <article className="card">
        <h2>Evidence-based readiness</h2>
        {report ? (
          <>
            <p>
              <strong>{report.percentage}%</strong> · {report.ready}/
              {report.applicable} applicable controls ready
            </p>
            <p>
              {report.expiredEvidence.length} expired or undated evidence
              records · {report.overdueTasks.length} overdue tasks
            </p>
            <p>
              Ready means implementation confirmed, approved evidence with a
              future expiry date, and no open control tasks.
            </p>
            <div className="actions">
              {governance && (
                <button
                  onClick={() =>
                    run(async () => {
                      const result = await api(base + "/monitor", "POST", {});
                      setReport(result);
                      await refresh();
                    })
                  }
                >
                  Run evidence monitoring
                </button>
              )}
              <a href={"/api/service" + base + "/statement-of-applicability"}>
                Download applicability statement
              </a>
            </div>
            {report.controls.map((control) => (
              <details key={control.id}>
                <summary>
                  {control.reference} {control.title} — {control.state}
                </summary>
                <p>
                  {control.reasons.join("; ") ||
                    control.justification ||
                    "Current approved evidence available."}
                </p>
                {governance && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      patch(control.id, {
                        applicable: form.get("applicable") === "yes",
                        justification: form.get("justification"),
                      });
                    }}
                  >
                    <label>
                      Applicability
                      <select
                        name="applicable"
                        defaultValue={control.applicable ? "yes" : "no"}
                      >
                        <option value="yes">Applicable</option>
                        <option value="no">Excluded</option>
                      </select>
                    </label>
                    <label>
                      Rationale
                      <textarea
                        name="justification"
                        defaultValue={control.justification}
                      />
                    </label>
                    <button>Save applicability</button>
                  </form>
                )}
              </details>
            ))}
          </>
        ) : (
          <p>Loading readiness…</p>
        )}
      </article>
      <article className="card">
        <h2>Evidence expiry and revision history</h2>
        {records
          .filter((item) => item.kind === "documents")
          .map((item) => (
            <details key={item.id}>
              <summary>
                {item.data.title} — {item.data.status}
              </summary>
              <p>
                Expiry: {item.data.expiresAt || "Not set"} · Reviewer:{" "}
                {item.data.reviewedBy || "Pending"}
              </p>
              {role !== "auditor" && (
                <label>
                  Evidence valid until
                  <input
                    type="date"
                    defaultValue={item.data.expiresAt?.slice(0, 10)}
                    onChange={(event) =>
                      patch(item.id, { expiresAt: event.target.value })
                    }
                  />
                </label>
              )}
              {item.data.checksum && (
                <a href={"/api/service" + base + "/files/" + item.id}>
                  Download original upload
                </a>
              )}
              <button
                className="secondary"
                onClick={() =>
                  run(async () =>
                    setHistory({
                      title: item.data.title,
                      versions: await api(
                        base + "/records/" + item.id + "/history",
                      ),
                    }),
                  )
                }
              >
                View revision history
              </button>
            </details>
          ))}
        {history && (
          <details open>
            <summary>
              {history.title}: {history.versions.length} prior revisions
            </summary>
            {history.versions.map((version) => (
              <p key={version.id}>
                {new Date(version.created_at).toLocaleString()} ·{" "}
                {version.data.status} ·{" "}
                {version.data.reviewNote || "No review note"}
              </p>
            ))}
          </details>
        )}
      </article>
      <article className="card">
        <h2>Policy acknowledgements</h2>
        {records
          .filter((item) => item.kind === "policies")
          .map((policy) => (
            <div key={policy.id}>
              <b>
                {policy.data.title} · version {policy.data.version || 1}
              </b>
              <p>
                {policy.data.status} ·{" "}
                {
                  acknowledgements.filter(
                    (item) =>
                      item.record_id === policy.id &&
                      item.version === (policy.data.version || 1),
                  ).length
                }{" "}
                acknowledgements for this version
              </p>
              {policy.data.status === "approved" && role !== "auditor" && (
                <button
                  onClick={() =>
                    run(async () => {
                      await api(
                        base + "/records/" + policy.id + "/acknowledge",
                        "POST",
                        {},
                      );
                      setAcknowledgements(
                        await api(base + "/acknowledgements"),
                      );
                    })
                  }
                >
                  I have read this policy
                </button>
              )}
            </div>
          ))}
        <p>
          Editing policy text creates a draft version that requires publication
          and fresh acknowledgements.
        </p>
      </article>
    </section>
  );
}
