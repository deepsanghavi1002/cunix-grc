import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

test("central identity requires matching state and verified email and distinguishes the master account", async (context) => {
  process.env.OIDC_CLIENT_SECRET = "synthetic-test-secret";
  process.env.OIDC_ADMIN_EMAIL = "master@example.com";
  process.env.OIDC_ALLOWED_DOMAIN = "staff.example.com";
  const { oidcRouter } = await import("./oidc.js");
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let profile = {
      sub: "test-subject",
      email: "analyst@staff.example.com",
      email_verified: true,
    },
    calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    return {
      ok: true,
      json: async () =>
        String(url).endsWith("/token/")
          ? { access_token: "synthetic-access-token" }
          : profile,
    };
  };
  const app = express();
  app.use(
    "/oidc",
    oidcRouter(async (req, res, user) =>
      res.json({ email: user.email, isAdmin: user.isAdmin }),
    ),
  );
  app.use((e, req, res, next) => res.status(400).json({ error: e.message }));
  const cookie =
    "grc_oidc_tx=" +
    Buffer.from(
      JSON.stringify({ state: "test-state", verifier: "test-verifier" }),
    ).toString("base64url");
  await request(app)
    .get("/oidc/callback?code=test-code&state=incorrect")
    .set("Cookie", cookie)
    .expect(400);
  assert.equal(calls, 0);
  const login = () =>
    request(app)
      .get("/oidc/callback?code=test-code&state=test-state")
      .set("Cookie", cookie);
  assert.equal((await login().expect(200)).body.isAdmin, false);
  profile = { ...profile, email: "master@example.com" };
  assert.equal((await login().expect(200)).body.isAdmin, true);
  profile = { ...profile, email_verified: false };
  await login().expect(403);
  profile = { sub: "test-subject", email: "master@example.com" };
  await login().expect(403);
  profile = { ...profile, email_verified: true, email: "outsider@example.net" };
  await login().expect(403);
});
