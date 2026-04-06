#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const projectId =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!projectId) {
  console.error(
    "Missing FIREBASE_PROJECT_ID. Set it in the environment and rerun `node scripts/deploy-firebase.mjs`.",
  );
  process.exit(1);
}

run("npm", ["install"], { cwd: `${cwd}/frontend` });
run("npm", ["run", "build"], { cwd: `${cwd}/frontend` });
run("firebase", ["deploy", "--project", projectId, "--only", "hosting"]);

