import React, { useState, useEffect } from "react";
import { PageHeading, Badge, Stat, Modal, Empty } from "./ui.jsx";
const day = () => new Date().toISOString().slice(0, 10);
export function ClientPortal({
  portal,
  workspace,
  role,
  api,
  perform,
  busy,
  onPage,
}) {
  const base = "/workspaces/" + workspace.id,
    employee = role === "employee",
    reviewer = ["admin", "reviewer"].includes(role),
    readOnly = role === "auditor";
  const [view, setView] = useState(employee ? "mine" : "open"),
    [adding, setAdding] = useState(false),
    [detail, setDetail] = useState(null),
    [turns, setTurns] = useState([]),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false),
    [aiError, setAiError] = useState(""),
    [selected, setSelected] = useState({}),
    [assignee, setAssignee] = useState("");
  useEffect(() => {
    let active = true;
    api(base + "/portal/guide")
      .then((r) => active && setTurns(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [base]);
  const openTask = async (id) => {
    try {
      setDetail(await api(base + "/portal/tasks/" + id));
    } catch (e) {
      await perform(() => Promise.reject(e));
    }
  };
  const update = async (values) => {
    const id = detail.task.id;
    if (
      await perform(
        () => api(base + "/portal/tasks/" + id, "PATCH", values),
        "Task updated.",
      )
    )
      await openTask(id);
  };
  const tasks = portal.tasks || [],
    open = tasks.filter((t) => t.data.status !== "resolved"),
    mine = tasks.filter((t) => t.data.assigneeId === portal.userId),
    shown =
      view === "mine"
        ? mine
        : view === "review"
          ? tasks.filter((t) => t.data.status === "in_review")
          : view === "all"
            ? tasks
            : open;
  const pendingPolicies = portal.policies.filter((p) => !p.acknowledged),
    overdue = open.filter((t) => t.data.dueDate && t.data.dueDate < day()),
    staff = !employee;
  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setAiError("");
    try {
      const result = await api(base + "/portal/guide", "POST", {
        question,
        requestId: crypto.randomUUID(),
      });
      setTurns((t) => [...t, result]);
      setSelected((s) => ({
        ...s,
        [result.id]: result.data.tasks.map((_t, i) => i),
      }));
      setQuestion("");
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAsking(false);
    }
  };
  const toggle = (id, index) =>
    setSelected((s) => ({
      ...s,
      [id]: (
        s[id] ||
        turns.find((t) => t.id === id)?.data.tasks.map((_t, i) => i) ||
        []
      ).includes(index)
        ? (
            s[id] || turns.find((t) => t.id === id).data.tasks.map((_t, i) => i)
          ).filter((i) => i !== index)
        : [...(s[id] || []), index],
    }));
  return (
    <>
      <PageHeading
        eyebrow={workspace.name}
        title={employee ? "My compliance tasks" : "Client home"}
        description={
          employee
            ? "Your assigned actions, policies and support in one place."
            : "Know what to do next, coordinate owners and keep the ISMS operating."
        }
        actions={
          !employee && (
            <><a className="secondary" href={"/#/client/"+encodeURIComponent(workspace.slug)} target="_blank" rel="noopener">Open client portal</a><button
              className="secondary"
              onClick={() =>
                navigator.clipboard?.writeText(
                  location.origin + "/#/client/" + workspace.slug,
                )
              }
            >
              Copy client portal URL
            </button></>
          )
        }
      />
      <div className="stats-grid">
        <Stat
          title={employee ? "My open tasks" : "Open tasks"}
          value={open.length}
          detail="Work needing action"
          icon="check"
        />
        <Stat
          title="Overdue"
          value={overdue.length}
          detail="Review dates and blockers"
          icon="clock"
        />
        <Stat
          title="Awaiting review"
          value={tasks.filter((t) => t.data.status === "in_review").length}
          detail="Needs a separate reviewer"
          icon="file"
        />
        <Stat
          title="My policy acknowledgements"
          value={pendingPolicies.length}
          detail="Read the current published version"
          icon="shield"
        />
      </div>
      {staff && (
        <section className="panel portal-section">
          <div className="panel-heading">
            <div>
              <h2>Your ISMS journey</h2>
              <p>
                {portal.mode === "existing"
                  ? "Existing ISMS: preserve the accepted baseline and continue operating."
                  : portal.mode === "new"
                    ? "New implementation: work through the baseline and operating cycle."
                    : "Choose your starting point. Existing clients do not need to recreate valid documents."}
              </p>
            </div>
          </div>
          {!portal.mode && !readOnly && (
            <div className="portal-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  perform(
                    () =>
                      api(base + "/portal/journey", "POST", { mode: "new" }),
                    "New implementation journey started.",
                  )
                }
              >
                Start a new ISMS
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  perform(
                    () =>
                      api(base + "/portal/journey", "POST", {
                        mode: "existing",
                      }),
                    "Existing ISMS journey started.",
                  )
                }
              >
                We already have an ISMS
              </button>
            </div>
          )}
          <div className="portal-journey">
            {portal.phases.map((p, i) => {
              const phaseTasks = tasks.filter((t) => t.data.phase === p.key),
                done =
                  phaseTasks.length &&
                  phaseTasks.every((t) => t.data.status === "resolved");
              return (
                <button
                  key={p.key}
                  className="portal-phase"
                  onClick={() => onPage(p.page)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{p.title}</strong>
                  <small>{p.description}</small>
                  <small>
                    {done
                      ? "Tasks reviewed"
                      : phaseTasks.length
                        ? phaseTasks.filter((t) => t.data.status !== "resolved")
                            .length + " open actions"
                        : "Open workspace section"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel portal-section portal-guide">
        <div className="panel-heading">
          <div>
            <h2>Ask your ISMS guide</h2>
            <p>
              Explain a task, choose the next step or turn an improvement into
              actions.
            </p>
          </div>
          {reviewer && (
            <button
              className="secondary"
              disabled={busy || !portal.ai.configured}
              onClick={() =>
                perform(
                  () =>
                    api(base + "/portal/ai-settings", "PATCH", {
                      enabled: !portal.ai.enabled,
                    }),
                  portal.ai.enabled
                    ? "AI guide disabled."
                    : "AI guide enabled for this workspace.",
                )
              }
            >
              {portal.ai.enabled ? "Disable guide" : "Enable guide"}
            </button>
          )}
        </div>
        <p className="portal-privacy">
          Sends your question and this workspace’s scope, task, policy-title and
          status metadata to Fireworks/DeepSeek. Original files and document
          contents are not sent. Replies are guidance; human review is required.
        </p>
        {!portal.ai.configured ? (
          <p>
            The AI connection is not configured. The task board works
            independently.
          </p>
        ) : !portal.ai.enabled ? (
          <p>
            Your CUNIX reviewer needs to enable the guide for this workspace.
          </p>
        ) : (
          <>
            <div className="portal-quick-prompts">
              {(employee
                ? [
                    "Explain my next task in simple steps",
                    "Which policies do I still need to read?",
                  ]
                : [
                    "What should we do next?",
                    "Plan the next month of continuous compliance",
                    "Help me resolve overdue work",
                    "We already have an ISMS. What should we reuse?",
                  ]
              ).map((q) => (
                <button
                  className="secondary"
                  disabled={asking}
                  key={q}
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="portal-chat">
              {turns.map((turn) => (
                <article key={turn.id}>
                  <h3>{turn.data.question}</h3>
                  <div className="portal-text">{turn.data.answer}</div>
                  {turn.data.nextSteps?.length > 0 && (
                    <ol>
                      {turn.data.nextSteps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {turn.data.updates?.length > 0 && !employee && !readOnly && (
                    <div className="portal-proposals">
                      <h4>Suggested task updates</h4>
                      {turn.data.updates.map((u) => (
                        <p key={u.taskId}>
                          <strong>
                            {portal.tasks.find((t) => t.id === u.taskId)?.data
                              .title || "Existing task"}
                          </strong>
                          <br />
                          {u.reason}
                          {u.dueInDays
                            ? " · Due in " + u.dueInDays + " days"
                            : ""}
                        </p>
                      ))}
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          turn.data.updatesApplied ||
                          turn.data.updatesUndone
                        }
                        onClick={async () => {
                          if (
                            await perform(
                              () =>
                                api(
                                  base +
                                    "/portal/guide/" +
                                    turn.id +
                                    "/updates",
                                  "POST",
                                  {},
                                ),
                              "Suggested task updates applied.",
                            )
                          )
                            setTurns(await api(base + "/portal/guide"));
                        }}
                      >
                        {turn.data.updatesUndone
                          ? "Updates undone"
                          : turn.data.updatesApplied
                            ? "Updates applied"
                            : "Apply suggested updates"}
                      </button>
                      {turn.data.updatesApplied && !turn.data.updatesUndone && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await perform(
                                () =>
                                  api(
                                    base +
                                      "/portal/guide/" +
                                      turn.id +
                                      "/undo-updates",
                                    "POST",
                                    {},
                                  ),
                                "Untouched task updates undone.",
                              )
                            )
                              setTurns(await api(base + "/portal/guide"));
                          }}
                        >
                          Undo task updates
                        </button>
                      )}
                    </div>
                  )}
                  {turn.data.tasks?.length > 0 && !employee && !readOnly && (
                    <div className="portal-proposals">
                      <h4>Suggested tasks</h4>
                      {turn.data.tasks.map((t, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            disabled={
                              busy || turn.data.tasksAdded || turn.data.undone
                            }
                            checked={(
                              selected[turn.id] ||
                              turn.data.tasks.map((_t, j) => j)
                            ).includes(i)}
                            onChange={() => toggle(turn.id, i)}
                          />
                          <span>
                            <strong>{t.title}</strong>
                            <small>
                              {t.description} · Suggested due in {t.dueInDays}{" "}
                              days
                            </small>
                          </span>
                        </label>
                      ))}
                      {turn.data.undone ? (
                        <p>Tasks undone. Later work was preserved.</p>
                      ) : turn.data.tasksAdded ? (
                        <>
                          <p>
                            {turn.data.createdTaskIds?.length || 0} tasks added;
                            duplicate open tasks were skipped.
                          </p>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await perform(
                                  () =>
                                    api(
                                      base +
                                        "/portal/guide/" +
                                        turn.id +
                                        "/undo",
                                      "POST",
                                      {},
                                    ),
                                  "Untouched suggested tasks undone.",
                                )
                              )
                                setTurns(await api(base + "/portal/guide"));
                            }}
                          >
                            Undo added tasks
                          </button>
                        </>
                      ) : (
                        <>
                          <label>
                            Assign selected tasks
                            <select
                              aria-label="Suggested task owner"
                              value={assignee}
                              onChange={(e) => setAssignee(e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {portal.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !(
                                selected[turn.id] ||
                                turn.data.tasks.map((_t, i) => i)
                              ).length
                            }
                            onClick={async () => {
                              if (
                                await perform(
                                  () =>
                                    api(
                                      base +
                                        "/portal/guide/" +
                                        turn.id +
                                        "/tasks",
                                      "POST",
                                      {
                                        indexes:
                                          selected[turn.id] ||
                                          turn.data.tasks.map((_t, i) => i),
                                        assigneeId: assignee,
                                      },
                                    ),
                                  "Suggested tasks added to the action board.",
                                )
                              )
                                setTurns(await api(base + "/portal/guide"));
                            }}
                          >
                            Add selected tasks
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <form onSubmit={ask}>
              <label>
                Your question or improvement
                <textarea
                  aria-label="Ask the ISMS guide"
                  value={question}
                  maxLength={3000}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="For example: We have completed implementation. Help us prepare for next quarter’s reviews."
                  required
                />
              </label>
              <button className="primary" disabled={asking || readOnly}>
                {asking ? "Preparing guidance…" : "Ask guide"}
              </button>
              {aiError && (
                <p className="error-banner" role="alert">
                  {aiError}
                </p>
              )}
            </form>
          </>
        )}
      </section>
      <section className="panel portal-section">
        <div className="panel-heading">
          <div>
            <h2>{employee ? "My actions" : "Action board"}</h2>
            <p>
              Start work, add evidence and submit it. A separate reviewer
              completes the task.
            </p>
          </div>
          {!employee && !readOnly && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => setAdding(true)}
            >
              Add task
            </button>
          )}
        </div>
        {!employee && (
          <div className="portal-actions">
            {[
              ["open", "Open"],
              ["mine", "Assigned to me"],
              ["review", "For review"],
              ["all", "All tasks"],
            ].map(([key, title]) => (
              <button
                key={key}
                className={view === key ? "primary" : "secondary"}
                onClick={() => setView(key)}
              >
                {title}
              </button>
            ))}
          </div>
        )}
        <div className="portal-task-list">
          {shown.map((t) => (
            <button
              className="portal-task"
              key={t.id}
              onClick={() => openTask(t.id)}
            >
              <div>
                <strong>{t.data.title}</strong>
                <small>
                  {t.data.owner || "Unassigned"} ·{" "}
                  {t.data.dueDate || "Set a due date"}
                  {t.data.dueDate < day() && t.data.status !== "resolved"
                    ? " · Overdue"
                    : ""}
                </small>
              </div>
              <Badge status={t.data.status} />
            </button>
          ))}
        </div>
        {!shown.length && (
          <Empty title="No tasks in this view">
            Your tasks appear here when assigned.
          </Empty>
        )}
      </section>
      <section className="panel portal-section">
        <h2>My published policies</h2>
        <p>Read the policy before acknowledging its current version.</p>
        <div className="portal-policies">
          {portal.policies.map((p) => (
            <details key={p.id}>
              <summary>
                {p.title} · v{p.version} ·{" "}
                {p.acknowledged ? "Acknowledged" : "Please read"}
              </summary>
              <div className="portal-text">
                {p.description ||
                  "Ask your coordinator for the complete published policy."}
              </div>
              {!p.acknowledged && !readOnly && (
                <button
                  className="secondary"
                  disabled={busy || !p.description}
                  onClick={() =>
                    perform(
                      () =>
                        api(
                          base + "/records/" + p.id + "/acknowledge",
                          "POST",
                          {},
                        ),
                      "Policy version acknowledged.",
                    )
                  }
                >
                  I have read and understood this version
                </button>
              )}
            </details>
          ))}
        </div>
        {!portal.policies.length && <p>No published policies yet.</p>}
      </section>
      {adding && (
        <Modal title="Add an action" onClose={() => !busy && setAdding(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              if (
                await perform(
                  () => api(base + "/portal/tasks", "POST", values),
                  "Task created.",
                )
              )
                setAdding(false);
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Task title
                <input name="title" maxLength={180} required />
              </label>
              <label>
                What needs to be done?
                <textarea name="description" maxLength={1800} />
              </label>
              <label>
                Owner
                <select aria-label="Task owner" name="assigneeId">
                  <option value="">Unassigned</option>
                  {portal.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input type="date" name="dueDate" required />
              </label>
              <label>
                Journey step
                <select name="phase">
                  {portal.phases.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary">Create task</button>
            </fieldset>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.task.data.title}
          onClose={() => !busy && setDetail(null)}
        >
          <TaskDetail
            key={detail.task.id + detail.task.updated_at}
            detail={detail}
            employee={employee}
            reviewer={reviewer}
            readOnly={readOnly}
            portal={portal}
            busy={busy}
            update={update}
            perform={perform}
            api={api}
            base={base}
            reload={() => openTask(detail.task.id)}
          />
        </Modal>
      )}
    </>
  );
}
function TaskDetail({
  detail,
  employee,
  reviewer,
  readOnly,
  portal,
  busy,
  update,
  perform,
  api,
  base,
  reload,
}) {
  const [note, setNote] = useState(""),
    [approveEvidence, setApproveEvidence] = useState(false),
    task = detail.task,
    closed = task.data.status === "resolved";
  return (
    <>
      <Badge status={task.data.status} />
      <div className="portal-text">{task.data.description}</div>
      {!employee && !readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Owner
              <select
                aria-label="Task owner"
                name="assigneeId"
                defaultValue={task.data.assigneeId || ""}
              >
                <option value="">Unassigned</option>
                {portal.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                name="dueDate"
                defaultValue={task.data.dueDate || ""}
                required
              />
            </label>
            <button className="secondary">Save assignment</button>
          </fieldset>
        </form>
      )}
      {detail.evidence && (
        <section className="portal-evidence">
          <h3>Attached evidence</h3>
          <strong>{detail.evidence.title}</strong>
          <Badge status={detail.evidence.status} />
          <div className="portal-text">{detail.evidence.description}</div>
          <a
            className="secondary"
            href={
              "/api/service" +
              base +
              "/portal/tasks/" +
              task.id +
              "/files/" +
              detail.evidence.id
            }
          >
            Download evidence original
          </a>
          {reviewer && detail.evidence.status !== "approved" && (
            <label>
              <input
                type="checkbox"
                checked={approveEvidence}
                onChange={(e) => setApproveEvidence(e.target.checked)}
              />
              I reviewed the original and approve this evidence with my decision
              note
            </label>
          )}
        </section>
      )}
      {!readOnly && !closed && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = e.currentTarget.elements.file.files[0];
            if (!file || file.size > 5 * 1024 * 1024) {
              await perform(() =>
                Promise.reject(Error("Choose a file up to 5 MB.")),
              );
              return;
            }
            const expiresAt = e.currentTarget.elements.expiresAt.value;
            const content = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(",")[1]);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            if (
              await perform(
                () =>
                  api(base + "/portal/tasks/" + task.id + "/evidence", "POST", {
                    filename: file.name,
                    content,
                    expiresAt,
                  }),
                "Evidence uploaded for review.",
              )
            )
              await reload();
          }}
        >
          <label>
            Upload operating evidence
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
            />
          </label>
          <label>
            Evidence valid until
            <input type="date" name="expiresAt" />
          </label>
          <button className="secondary" disabled={busy}>
            Attach evidence
          </button>
        </form>
      )}
      <h3>Discussion and decisions</h3>
      {detail.comments.map((c) => (
        <article className="portal-comment" key={c.id}>
          <strong>{c.name}</strong>
          <small>{new Date(c.created_at).toLocaleString()}</small>
          <p>{c.body}</p>
        </article>
      ))}
      {!readOnly && (
        <>
          <label>
            Work performed, question or review decision
            <textarea
              aria-label="Task note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={3000}
            />
          </label>
          <div className="portal-actions">
            <button
              className="secondary"
              disabled={busy || !note.trim()}
              onClick={async () => {
                if (
                  await perform(
                    () =>
                      api(
                        base + "/portal/tasks/" + task.id + "/comments",
                        "POST",
                        { body: note },
                      ),
                    "Task note added.",
                  )
                ) {
                  setNote("");
                  await reload();
                }
              }}
            >
              Add note
            </button>
            {!closed && task.data.status !== "in_review" && (
              <>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => update({ status: "in_progress" })}
                >
                  Start work
                </button>
                <button
                  className="primary"
                  disabled={busy || !note.trim()}
                  onClick={() => update({ status: "in_review", note })}
                >
                  Submit for review
                </button>
              </>
            )}
            {reviewer && task.data.status === "in_review" && (
              <>
                <button
                  className="secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => update({ status: "not_started", note })}
                >
                  Request changes
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !note.trim() ||
                    (detail.evidence &&
                      detail.evidence.status !== "approved" &&
                      !approveEvidence)
                  }
                  onClick={() =>
                    update({
                      status: "resolved",
                      note,
                      ...(approveEvidence
                        ? { evidenceDecision: "approved" }
                        : {}),
                    })
                  }
                >
                  Accept and complete
                </button>
              </>
            )}
            {reviewer && closed && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => update({ status: "in_progress", note })}
              >
                Reopen task
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
