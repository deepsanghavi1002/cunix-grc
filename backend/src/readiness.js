/** Readiness is derived from reviewed, current evidence; a manual status is insufficient. */
export function readiness(records, now = new Date()) {
  const controls = records.filter((record) => record.kind === "controls");
  const documents = records.filter((record) => record.kind === "documents");
  const tasks = records.filter((record) => record.kind === "tasks");
  const results = controls.map((control) => {
    const evidence = documents.filter(
      (document) =>
        document.data.controlId === control.id &&
        document.data.status === "approved" &&
        document.data.reviewedAt &&
        document.data.expiresAt &&
        new Date(document.data.expiresAt) > now,
    );
    const blockers = tasks.filter(
      (task) =>
        task.data.controlId === control.id && task.data.status !== "resolved",
    );
    const excluded = control.data.applicable === false;
    const ready =
      !excluded &&
      evidence.length > 0 &&
      blockers.length === 0 &&
      control.data.status === "passing";
    return {
      id: control.id,
      reference: control.data.reference,
      title: control.data.title,
      owner: control.data.owner,
      applicable: !excluded,
      justification: control.data.justification || "",
      state: excluded ? "excluded" : ready ? "ready" : "gap",
      evidenceIds: evidence.map((item) => item.id),
      reasons: excluded
        ? []
        : [
            ...(!evidence.length
              ? ["No approved evidence with a future expiry date"]
              : []),
            ...(blockers.length ? ["Open remediation tasks"] : []),
            ...(control.data.status !== "passing"
              ? ["Implementation not confirmed"]
              : []),
          ],
    };
  });
  const applicable = results.filter((item) => item.applicable);
  const ready = applicable.filter((item) => item.state === "ready").length;
  return {
    evaluatedAt: now.toISOString(),
    ready,
    applicable: applicable.length,
    percentage: applicable.length
      ? Math.round((100 * ready) / applicable.length)
      : 0,
    controls: results,
    expiredEvidence: documents
      .filter(
        (item) =>
          item.data.status === "approved" &&
          (!item.data.expiresAt || new Date(item.data.expiresAt) <= now),
      )
      .map((item) => item.id),
    overdueTasks: tasks
      .filter(
        (item) =>
          item.data.status !== "resolved" &&
          item.data.dueDate &&
          new Date(item.data.dueDate + "T23:59:59Z") < now,
      )
      .map((item) => item.id),
  };
}

export function riskScores(data) {
  const values = [
    "likelihood",
    "impact",
    "residualLikelihood",
    "residualImpact",
  ];
  for (const key of values) {
    const value = Number(data[key] ?? 3);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw Object.assign(new Error(`${key} must be an integer from 1 to 5.`), {
        status: 400,
      });
    }
    data[key] = value;
  }
  data.inherentScore = data.likelihood * data.impact;
  data.residualScore = data.residualLikelihood * data.residualImpact;
  data.rating =
    data.residualScore >= 15
      ? "high"
      : data.residualScore >= 6
        ? "medium"
        : "low";
  return data;
}
