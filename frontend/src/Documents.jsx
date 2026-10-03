import React, { useState } from "react";
import { Badge, Empty, Icon, Modal, date } from "./ui.jsx";

function encode(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function Documents({
  workspace,
  records,
  stages,
  trash,
  role,
  api,
  perform,
  busy,
  stageKey = "",
  reviewOnly = false,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("active");
  const [upload, setUpload] = useState(false);
  const [edit, setEdit] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [history, setHistory] = useState(null);
  const base = `/workspaces/${workspace.id}`;
  const readOnly = role === "auditor";
  const reviewer = ["admin", "reviewer"].includes(role);
  const controls = records.filter((item) => item.kind === "controls");
  const all =
    tab === "trash"
      ? trash
      : records.filter((item) => item.kind === "documents" && (tab === "references" ? item.data.referenceOnly : !item.data.referenceOnly));
  const documents = all.filter(
    (item) =>
      (!stageKey || (item.data.stageKey || "evidence") === stageKey) &&
      (!reviewOnly || (!item.data.referenceOnly && item.data.status !== "approved")) &&
      (status === "all" || item.data.status === status) &&
      `${item.data.title} ${item.data.owner || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const uploadFiles = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = files;
    const done = await perform(
      async () => {
        if (!selected.length) throw Error("Choose at least one document.");
        for (const file of selected) {
          if (file.size > 5 * 1024 * 1024)
            throw Error(`${file.name} exceeds the 5 MB limit.`);
          await api(base + "/upload", "POST", {
            filename: file.name,
            content: await encode(file),
            stageKey: data.get("stageKey"),
          });
          setFiles((current) => current.filter((item) => item !== file));
        }
      },
      `${selected.length} document${selected.length === 1 ? "" : "s"} uploaded for review.`,
    );
    if (done) {
      setUpload(false);
      setFiles([]);
    }
  };
  return (
    <section className="panel document-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {reviewOnly ? "Documents awaiting review" : "Document library"}
          </h2>
          <p>
            {stageKey
              ? "Evidence and supporting files for this delivery stage."
              : "All client evidence, organized by delivery stage."}
          </p>
        </div>
        {!readOnly && (
          <button className="primary" onClick={() => setUpload(true)}>
            <Icon name="upload" />
            Upload documents
          </button>
        )}
      </div>
      <div className="document-toolbar">
        <div className="segmented">
          <button
            className={tab === "active" ? "active" : ""}
            onClick={() => setTab("active")}
          >
            Working documents
          </button>
          <button className={tab === "references" ? "active" : ""} onClick={()=>{setTab("references");setStatus("all");}}>Reference templates <span>{records.filter(r=>r.kind==='documents'&&r.data.referenceOnly).length}</span></button>
          <button
            className={tab === "trash" ? "active" : ""}
            onClick={() => setTab("trash")}
          >
            Trash <span>{trash.length}</span>
          </button>
        </div>
        <div className="filters">
          <label className="search">
            <Icon name="search" />
            <input
              aria-label="Search documents"
              placeholder="Search documents…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter document status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="review_required">Awaiting review</option>
            <option value="approved">Approved</option>
            <option value="revision_requested">Changes requested</option>
          </select>
        </div>
      </div>
      {documents.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Stage</th>
                <th>Status</th>
                <th>{tab === "trash" ? "Deleted" : "Valid until"}</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="file-cell">
                      <span className="file-icon">
                        <Icon name="file" />
                      </span>
                      <div>
                        <button
                          className="text-button document-title"
                          onClick={() => {
                            setEdit(item);
                            setHistory(null);
                          }}
                        >
                          {item.data.title}
                        </button>
                        <small>
                          {item.data.owner ||
                            item.data.submittedBy ||
                            "Unassigned"}
                          {item.data.fileSize
                            ? ` · ${(item.data.fileSize / 1024).toFixed(1)} KB`
                            : " · Evidence record"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {stages.find(
                      (stage) =>
                        stage.key === (item.data.stageKey || "evidence"),
                    )?.title || "Evidence collection"}
                  </td>
                  <td>
                    <Badge status={item.data.status} />
                  </td>
                  <td>
                    {tab === "trash" ? (
                      date(item.deleted_at)
                    ) : item.data.expiresAt ? (
                      date(item.data.expiresAt)
                    ) : (
                      <span className="muted">Not set</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {tab === "trash" ? (
                        !readOnly && (
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() =>
                              perform(
                                () =>
                                  api(
                                    base + "/documents/" + item.id + "/restore",
                                    "POST",
                                    {},
                                  ),
                                "Document restored for review.",
                              )
                            }
                          >
                            <Icon name="restore" size={15} />
                            Restore
                          </button>
                        )
                      ) : (
                        <>
                          {item.data.checksum && (
                            <a
                              className="icon-button"
                              aria-label={`Download ${item.data.title}`}
                              title="Download original"
                              href={"/api/service" + base + "/files/" + item.id}
                            >
                              <Icon name="download" size={17} />
                            </a>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`View ${item.data.title}`}
                            title="View document"
                            onClick={() => {
                              setEdit(item);
                              setHistory(null);
                            }}
                          >
                            <Icon name="edit" size={17} />
                          </button>
                          {!readOnly && (
                            <button
                              className="icon-button danger-text"
                              aria-label={`Delete ${item.data.title}`}
                              title="Move to trash"
                              onClick={() => setDeleting(item)}
                            >
                              <Icon name="trash" size={17} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            search || status !== "all"
              ? "No matching documents"
              : tab === "trash"
                ? "Trash is empty"
                : reviewOnly
                  ? "All caught up"
                  : "Your evidence belongs here"
          }
        >
          {tab === "trash"
            ? "Deleted documents appear here and can be restored."
            : reviewOnly
              ? "Documents submitted by the client will appear here for review."
              : "Upload policies, reports and supporting documents to begin building this client’s evidence library."}
        </Empty>
      )}
      <div className="panel-footer">
        <span>
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </span>
        <span>
          <Icon name="shield" size={14} />
          Only members of {workspace.name} can access these files
        </span>
      </div>

      {upload && (
        <Modal
          title="Upload client documents"
          onClose={() => !busy && setUpload(false)}
        >
          <form onSubmit={uploadFiles}>
            <label>
              Delivery stage
              <select name="stageKey" defaultValue={stageKey || "evidence"}>
                {stages.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.number}. {stage.title}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                setFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <Icon name="upload" size={30} />
              <strong>Choose files or drag them here</strong>
              <span>PDF, DOCX, XLSX, TXT, Markdown or CSV · 5 MB per file</span>
              <input
                type="file"
                aria-label="Choose documents"
                multiple
                accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
                onChange={(event) => setFiles(Array.from(event.target.files))}
              />
            </label>
            {files.length > 0 && (
              <ul className="selected-files">
                {files.map((file, index) => (
                  <li key={file.name + index}>
                    <Icon name="file" size={16} />
                    <span>{file.name}</span>
                    <small>{(file.size / 1024).toFixed(1)} KB</small>
                  </li>
                ))}
              </ul>
            )}
            <p className="helper">
              Files are saved to this client workspace and submitted for human
              review. Scanned PDFs need OCR before their text can be reviewed.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setUpload(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy || !files.length}>
                {busy ? "Uploading…" : "Upload for review"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal
          title={edit.data.title}
          wide
          onClose={() => !busy && setEdit(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              const action = event.nativeEvent.submitter?.value;
              if (action === "approve") values.status = "approved";
              if (action === "return") values.status = "revision_requested";
              if (
                await perform(
                  () => api(base + "/records/" + edit.id, "PATCH", values),
                  action === "approve"
                    ? "Document review saved."
                    : "Document updated.",
                )
              )
                setEdit(null);
            }}
          >
            {edit.data.referenceOnly && <div className="sample-notice"><p>Private reference original. It is not operating evidence and cannot be approved. Download the original, or create a separate working draft.</p>{!readOnly && <button type="button" className="primary" disabled={busy} onClick={async()=>{const done=await perform(()=>api(base+'/isms/reference-drafts/'+edit.id,'POST',{}),'Working draft prepared. Complete decisions and map it before review.');if(done){setEdit(null);setTab('active');setStatus('all');setSearch('');}}}>Create working draft</button>}</div>}
            <div className="detail-strip">
              <Badge status={edit.data.status} />
              <span>
                Submitted by{" "}
                {edit.data.submittedBy || edit.data.owner || "workspace member"}
              </span>
              {edit.data.reviewedBy && (
                <span>Reviewed by {edit.data.reviewedBy}</span>
              )}
            </div>
            <fieldset disabled={readOnly || edit.data.referenceOnly || tab === "trash" || busy}>
              <div className="form-grid">
                <label>
                  Document title
                  <input name="title" defaultValue={edit.data.title} required />
                </label>
                <label>
                  Delivery stage
                  <select
                    name="stageKey"
                    defaultValue={edit.data.stageKey || "evidence"}
                  >
                    {stages.map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mapped control
                  <select
                    name="controlId"
                    defaultValue={edit.data.controlId || ""}
                  >
                    <option value="">No control selected</option>
                    {controls.map((control) => (
                      <option key={control.id} value={control.id}>
                        {control.data.reference} · {control.data.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Evidence valid until
                  <input
                    type="date"
                    name="expiresAt"
                    defaultValue={edit.data.expiresAt?.slice(0, 10) || ""}
                  />
                </label>
              </div>
            </fieldset>
            {edit.data.draftSource && (
              <label>
                Working document text
                <textarea
                  name="description"
                  defaultValue={edit.data.description}
                  rows={18}
                  disabled={readOnly || edit.data.referenceOnly || tab === "trash" || busy}
                />
                <small className="helper">
                  Replace every [DECISION REQUIRED] with your approved working
                  arrangements. Save edits before requesting approval.
                </small>
              </label>
            )}
            <details className="text-preview">
              <summary>Extracted document text</summary>
              <pre>
                {edit.data.description ||
                  "No text was extracted. Download the original to inspect this document."}
              </pre>
            </details>
            {!readOnly && !edit.data.referenceOnly && tab !== "trash" && (
              <label>
                Review note
                <textarea
                  name="reviewNote"
                  defaultValue={edit.data.reviewNote || ""}
                  placeholder="Record what was checked, or explain the changes needed."
                  rows={3}
                />
              </label>
            )}
            <button
              className="text-button"
              type="button"
              onClick={async () => {
                await perform(async () =>
                  setHistory(
                    await api(base + "/records/" + edit.id + "/history"),
                  ),
                );
              }}
            >
              View revision history
            </button>
            {history && (
              <div className="history-list">
                {history.length ? (
                  history.map((version) => (
                    <div key={version.id}>
                      <Badge status={version.data.status} />
                      <span>
                        {date(version.created_at)} ·{" "}
                        {version.data.reviewNote || "Record updated"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>No previous revisions.</p>
                )}
              </div>
            )}
            <div className="form-actions">
              {edit.data.checksum && tab !== "trash" && (
                <a
                  className="secondary"
                  href={"/api/service" + base + "/files/" + edit.id}
                >
                  <Icon name="download" size={16} />
                  Original file
                </a>
              )}
              {edit.data.draftSource && tab !== "trash" && (
                <a
                  className="secondary"
                  download={`${edit.data.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.txt`}
                  href={
                    "data:text/plain;charset=utf-8," +
                    encodeURIComponent(edit.data.description || "")
                  }
                >
                  <Icon name="download" size={16} />
                  Download saved text
                </a>
              )}
              {!readOnly && !edit.data.referenceOnly && tab !== "trash" && (
                <>
                  <button className="secondary" disabled={busy}>
                    Save changes
                  </button>
                  {reviewer && (
                    <>
                      <button
                        className="secondary"
                        value="return"
                        disabled={busy}
                      >
                        Request changes
                      </button>
                      <button
                        className="primary"
                        value="approve"
                        disabled={busy}
                      >
                        <Icon name="check" size={16} />
                        Approve evidence
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Move document to trash?"
          onClose={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.data.title}</strong> will be removed from the
            active library and readiness calculations. You can restore it from
            Trash.
          </p>
          <div className="form-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Keep document
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await perform(
                    () => api(base + "/documents/" + deleting.id, "DELETE"),
                    "Document moved to trash.",
                  )
                )
                  setDeleting(null);
              }}
            >
              <Icon name="trash" size={16} />
              Move to trash
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
