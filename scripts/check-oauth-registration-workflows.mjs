import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const WORKFLOW_DIR = path.resolve(".github/workflows");
const DCR_ENDPOINT_RE = /\bregistration_endpoint\b|\/oauth\/clients\/register\b/;
const HTTP_POST_RE = /\bmethod\s*:\s*["']POST["']/;
const MANUAL_TRIGGER_RE = /(?:^|\n)\s{2}workflow_dispatch\s*:/;
const AUTO_TRIGGER_RE =
  /(?:^|\n)\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch)\s*:/;

function eventSection(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start < 0) {
    const inline = lines.find((line) => /^on:\s*\[/.test(line));
    return inline ?? "";
  }

  const collected = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    collected.push(line);
  }
  return collected.join("\n");
}

function createsOAuthClient(source) {
  return DCR_ENDPOINT_RE.test(source) && HTTP_POST_RE.test(source);
}

function validateRegistrationWorkflow(filename, source) {
  if (!createsOAuthClient(source)) return [];

  const events = eventSection(source);
  const errors = [];

  if (!MANUAL_TRIGGER_RE.test(events)) {
    errors.push(
      `${filename}: OAuth DCR client creation must require workflow_dispatch.`,
    );
  }

  if (AUTO_TRIGGER_RE.test(events) || /^on:\s*\[/.test(events)) {
    errors.push(
      `${filename}: OAuth DCR client creation must not run from automatic GitHub events.`,
    );
  }

  return errors;
}

const entries = await readdir(WORKFLOW_DIR, { withFileTypes: true });
const workflowFiles = entries
  .filter(
    (entry) =>
      entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
  )
  .map((entry) => entry.name)
  .sort();

const errors = [];
for (const filename of workflowFiles) {
  const source = await readFile(path.join(WORKFLOW_DIR, filename), "utf8");
  errors.push(...validateRegistrationWorkflow(filename, source));
}

if (errors.length > 0) {
  console.error("Unsafe OAuth client-registration workflow detected:");
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "Register first-party OAuth clients only through a deliberate one-shot manual action, then pin the issued client ID in an Account migration.",
  );
  process.exit(1);
}

console.log(
  "OAuth workflow governance passed: no automatically triggered DCR client creation is present.",
);
