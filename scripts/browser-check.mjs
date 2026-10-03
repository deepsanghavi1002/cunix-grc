import { chromium } from "../frontend/node_modules/playwright/index.mjs";
import express from "../backend/node_modules/express/index.js";
import pgMem from "../backend/node_modules/pg-mem/index.js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import assert from "node:assert/strict";
import { pool } from "../backend/src/db.js";
import { service, passwordHash } from "../backend/src/service.js";
import { createSampleClient } from "../backend/src/sample-client.js";
const memory = pgMem.newDb();
memory.public.none(
  "CREATE TABLE tenants(id UUID PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL)",
);
memory.public.none(
  await readFile(new URL("../backend/db/service.sql", import.meta.url), "utf8"),
);
const adapter = memory.adapters.createPg(),
  db = new adapter.Pool();
pool.query = db.query.bind(db);
pool.connect = db.connect.bind(db);
const actor = randomUUID();
await pool.query("INSERT INTO service_users VALUES($1,$2,$3,$4)", [
  actor,
  "browser@sample.invalid",
  passwordHash("SampleBrowserPassword123!"),
  "Sample browser operator",
]);
const sample = await createSampleClient(pool, {
  actorId: actor,
  catalog: [
    {
      title: "Access policy",
      filename: "policy.txt",
      path: "sample/access.txt",
      text: "<<COMPANY NAME>> review accounts quarterly. <<Owner>>",
      category: "Policies",
      level: "Level 1",
      sha256: "fixture",
      bytes: 99,
    },
  ],
});
const app = express();
app.use(express.json({ limit: "8mb" }));
app.post("/mock-provider", (_req, res) =>
  res.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            answer:
              "Use the accepted baseline and review the upcoming activities.",
            nextSteps: ["Assign an owner to the recovery exercise."],
            tasks: [
              {
                title: "AI suggested review exercise",
                description:
                  "Confirm the exercise date and expected operating evidence.",
                dueInDays: 14,
                phase: "operation",
              },
            ],
          }),
        },
      },
    ],
  }),
);
app.use("/api/service", service);
app.use(express.static(new URL("../frontend/dist/", import.meta.url).pathname));
app.use((e, _req, res, _next) =>
  res.status(e.status || 500).json({ error: e.message }),
);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
process.env.FIREWORKS_API_KEY = "browser-mock-provider";
process.env.FIREWORKS_API_URL = base + "/mock-provider";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByLabel("Email address").fill("browser@sample.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("SampleBrowserPassword123!");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await page.waitForFunction(() => document.querySelector(".app-shell"));
  await page.goto(base + "/#/workspace/" + sample.id + "/isms");
  await page.getByText("Fictional sample workspace", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Scope areas", exact: true }).click();
  assert.equal(await page.locator(".scope-area-grid article").count(), 11);
  await page
    .getByRole("tab", { name: "Control coverage", exact: true })
    .click();
  await page.getByRole("tab", { name: "Reference pack", exact: true }).click();
  await page.getByText("1 source files", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Open private document library" })
    .click();
  await page.getByRole("button", { name: /Reference templates/ }).click();
  await page.getByText("Access policy", { exact: true }).click();
  await page
    .getByRole("button", { name: "Create working draft", exact: true })
    .click();
  await page
    .getByText(
      "Working draft prepared. Complete decisions and map it before review.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: /Reference templates/ }).click();
  assert.equal(
    await page.getByText("Access policy", { exact: true }).count(),
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#/workspace/" + sample.id + "/isms");
  await page.getByText("Fictional sample workspace", { exact: true }).waitFor();
  assert.ok(
    await page
      .getByRole("tab", { name: "Scope areas", exact: true })
      .isVisible(),
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/#/client/northstar-isms-working-release");
  await page
    .getByRole("heading", { name: "Client home", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "We already have an ISMS", exact: true })
    .click();
  await page
    .getByText("Existing ISMS journey started.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Enable guide", exact: true }).click();
  await page
    .getByRole("button", { name: "Disable guide", exact: true })
    .waitFor();
  const member = await page.request.post(
    base + "/api/service/workspaces/" + sample.id + "/members",
    {
      data: {
        name: "Browser employee",
        email: "employee-browser@sample.invalid",
        password: "SampleBrowserPassword123!",
        role: "employee",
      },
    },
  );
  assert.equal(member.status(), 201);
  const employeeId = (await member.json()).id;
  await page.reload();
  await page
    .getByLabel("Ask the ISMS guide")
    .fill("Guide our next review exercise.");
  await page.getByRole("button", { name: "Ask guide", exact: true }).click();
  await page
    .getByText(
      "Use the accepted baseline and review the upcoming activities.",
      { exact: true },
    )
    .waitFor();
  await page.getByLabel("Suggested task owner").selectOption(employeeId);
  await page
    .getByRole("button", { name: "Add selected tasks", exact: true })
    .click();
  await page
    .getByText("Suggested tasks added to the action board.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Undo added tasks", exact: true })
    .click();
  await page
    .getByText("Untouched suggested tasks undone.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add an action" });
  await dialog.getByLabel("Task title").fill("Browser employee recovery task");
  await dialog
    .getByLabel("What needs to be done?")
    .fill("Perform the recovery exercise and record the result.");
  await dialog
    .getByLabel("Task owner", { exact: true })
    .selectOption(employeeId);
  await dialog.getByLabel("Due date").fill("2027-01-01");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await page.getByText("Task created.", { exact: true }).waitFor();
  const employeeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const employeePage = await employeeContext.newPage();
  await employeePage.goto(base);
  await employeePage
    .getByLabel("Email address")
    .fill("employee-browser@sample.invalid");
  await employeePage
    .getByLabel("Password", { exact: true })
    .fill("SampleBrowserPassword123!");
  await employeePage
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await employeePage
    .getByRole("heading", { name: "My compliance tasks", exact: true })
    .waitFor();
  assert.equal(
    await employeePage
      .getByRole("button", { name: "People & access", exact: true })
      .count(),
    0,
  );
  assert.equal(
    (
      await employeePage.request.get(
        base + "/api/service/workspaces/" + sample.id + "/records",
      )
    ).status(),
    403,
  );
  await employeePage
    .getByRole("button", { name: /Browser employee recovery task/ })
    .click();
  await employeePage
    .getByLabel("Task note")
    .fill(
      "The exercise was completed and the results were reviewed with our coordinator.",
    );
  await employeePage
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await employeePage.getByText("Task updated.", { exact: true }).waitFor();
  await employeeContext.close();
  await page.reload();
  await page
    .getByRole("button", { name: /Browser employee recovery task/ })
    .click();
  await page
    .getByLabel("Task note")
    .fill("Reviewed the performed work with the coordinator; accepted.");
  await page
    .getByRole("button", { name: "Accept and complete", exact: true })
    .click();
  await page.getByText("Task updated.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Playwright passed: sample login, scope matrix, control/reference tabs, private template to working draft, preserved original, mobile visibility, client journey, mocked AI suggestions/undo, restricted employee submission and separate reviewer completion. Uses disposable in-memory data.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await db.end();
}
