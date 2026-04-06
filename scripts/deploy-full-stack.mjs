#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const projectId =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT;
const region = process.env.CLOUD_RUN_REGION ?? "europe-west1";
const service = process.env.CLOUD_RUN_SERVICE ?? "eu-funding-signal-api";
const databaseUrl = process.env.DATABASE_URL;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

if (!projectId) {
  console.error("Missing FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT.");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Set it before running deploy-full-stack.");
  process.exit(1);
}

try {
  const backendEnvVars = [
    "APP_MODE=live",
    `DATABASE_URL=${databaseUrl}`,
    "DEMO_DATASET_PATH=frontend/lib/demo-dataset.json",
  ].join(",");

  run("gcloud", [
    "run",
    "deploy",
    service,
    "--source",
    "./backend",
    "--project",
    projectId,
    "--region",
    region,
    "--allow-unauthenticated",
    "--set-env-vars",
    backendEnvVars,
  ]);

  const serviceUrl = run("gcloud", [
    "run",
    "services",
    "describe",
    service,
    "--project",
    projectId,
    "--region",
    region,
    "--format=value(status.url)",
  ]).trim();

  run("npm", ["install"], { cwd: `${cwd}/frontend` });
  run("npm", ["run", "build"], {
    cwd: `${cwd}/frontend`,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: "backend",
      NEXT_PUBLIC_API_BASE_URL: serviceUrl,
    },
  });
  run("firebase", ["deploy", "--project", projectId, "--only", "hosting", "--non-interactive"]);

  console.log(`Backend URL: ${serviceUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

