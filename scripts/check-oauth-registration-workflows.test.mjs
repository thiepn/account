import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const guard = fileURLToPath(
  new URL("./check-oauth-registration-workflows.mjs", import.meta.url),
);

async function runGuard(workflowSource) {
  const root = await mkdtemp(path.join(tmpdir(), "account-oauth-workflow-"));
  try {
    const workflowDir = path.join(root, ".github", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(path.join(workflowDir, "fixture.yml"), workflowSource, "utf8");
    return spawnSync(process.execPath, [guard], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const dcrBody = String.raw`
jobs:
  register:
    runs-on: ubuntu-latest
    steps:
      - run: |
          node <<'NODE'
          const endpoint = metadata.registration_endpoint;
          await fetch(endpoint, { method: "POST" });
          NODE
`;

test("allows deliberate workflow_dispatch-only DCR", async () => {
  const result = await runGuard(String.raw`
name: Manual registration
on:
  workflow_dispatch:
permissions:
  contents: read
${dcrBody}
`);
  assert.equal(result.status, 0, result.stderr);
});

test("rejects pull_request-triggered DCR", async () => {
  const result = await runGuard(String.raw`
name: Unsafe PR registration
on:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
${dcrBody}
`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not run from automatic GitHub events/);
});

test("rejects inline automatic DCR triggers", async () => {
  const result = await runGuard(String.raw`
name: Unsafe inline registration
on: [push, workflow_dispatch]
permissions:
  contents: read
${dcrBody}
`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not run from automatic GitHub events/);
});

test("allows automatic read-only OAuth discovery", async () => {
  const result = await runGuard(String.raw`
name: OAuth discovery
on:
  pull_request:
permissions:
  contents: read
jobs:
  discovery:
    runs-on: ubuntu-latest
    steps:
      - run: |
          node <<'NODE'
          const endpoint = metadata.registration_endpoint;
          console.log(endpoint);
          NODE
`);
  assert.equal(result.status, 0, result.stderr);
});
