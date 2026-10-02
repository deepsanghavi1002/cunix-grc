// Run daily in the client's CI or trusted scheduler using Node 22+.
// GitHub credentials stay in that environment; only the check result is sent.
const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_BRANCH = "main",
  CUNIX_URL,
  CUNIX_TENANT,
  CUNIX_COLLECTOR_TOKEN,
} = process.env;
if (!GITHUB_REPOSITORY || !CUNIX_URL || !CUNIX_TENANT || !CUNIX_COLLECTOR_TOKEN)
  throw Error(
    "Set GITHUB_REPOSITORY, CUNIX_URL, CUNIX_TENANT and CUNIX_COLLECTOR_TOKEN.",
  );
if (
  !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPOSITORY) ||
  !/^[a-f0-9-]{36}$/.test(CUNIX_TENANT)
)
  throw Error("Invalid repository or tenant identifier.");
const destination = new URL(CUNIX_URL);
if (
  destination.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(destination.hostname)
)
  throw Error("Collector submissions require HTTPS outside localhost.");
let status = "unknown",
  detail = "Could not verify branch protection.";
try {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/branches/${encodeURIComponent(GITHUB_BRANCH)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (response.ok) {
    const branch = await response.json();
    status =
      branch.protected === true
        ? "pass"
        : branch.protected === false
          ? "fail"
          : "unknown";
    detail =
      status === "pass"
        ? "GitHub reports this branch is protected. Review the specific rule configuration separately."
        : status === "fail"
          ? "GitHub reports this branch is not protected. Configure appropriate protection or rulesets."
          : "GitHub did not return a protection status.";
  } else
    detail = `GitHub returned HTTP ${response.status}. Check repository access and token permissions.`;
} catch {
  detail = "GitHub lookup failed or timed out. No passing result assumed.";
}
const payload = {
  key: `github.${GITHUB_REPOSITORY.replace("/", ".")}.${Buffer.from(GITHUB_BRANCH).toString("hex").slice(0, 80)}`,
  title: `${GITHUB_REPOSITORY}: ${GITHUB_BRANCH} protection`,
  status,
  detail,
  observedAt: new Date().toISOString(),
  source: "github-branch-protection",
};
const result = await fetch(
  new URL(`/api/service/collect/${CUNIX_TENANT}`, destination),
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CUNIX_COLLECTOR_TOKEN}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  },
);
if (!result.ok)
  throw Error(`Cunix rejected observation (HTTP ${result.status}).`);
console.log(`Submitted branch protection observation: ${status}`);
