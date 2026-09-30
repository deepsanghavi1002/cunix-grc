import test from "node:test";
import assert from "node:assert/strict";
import { readiness, riskScores } from "./readiness.js";

test("readiness requires approval, freshness, implementation and cleared remediation", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const control = {
    id: "control",
    kind: "controls",
    data: { status: "passing" },
  };
  const document = {
    id: "evidence",
    kind: "documents",
    data: {
      controlId: control.id,
      status: "approved",
      reviewedAt: "2026-09-20",
      expiresAt: "2026-10-20",
    },
  };
  assert.equal(readiness([control], now).ready, 0);
  assert.equal(readiness([control, document], now).ready, 1);
  assert.equal(
    readiness(
      [
        control,
        document,
        {
          id: "task",
          kind: "tasks",
          data: { controlId: control.id, status: "not_started" },
        },
      ],
      now,
    ).ready,
    0,
  );
  document.data.expiresAt = "2026-09-29";
  assert.equal(readiness([control, document], now).expiredEvidence.length, 1);
  assert.equal(readiness([control, document], now).ready, 0);
  control.data.applicable = false;
  assert.equal(readiness([control, document], now).applicable, 0);
});

test("risk scores validate bounds and derive rating from residual exposure", () => {
  const data = riskScores({
    likelihood: "5",
    impact: "4",
    residualLikelihood: 2,
    residualImpact: 2,
  });
  assert.equal(data.inherentScore, 20);
  assert.equal(data.residualScore, 4);
  assert.equal(data.rating, "low");
  assert.throws(() => riskScores({ impact: 6 }), /integer from 1 to 5/);
  assert.throws(() => riskScores({ likelihood: 1.5 }), /integer from 1 to 5/);
});
