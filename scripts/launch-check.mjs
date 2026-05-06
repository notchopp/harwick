import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = [
  {
    label: "launch readiness fixtures",
    args: ["run", "test:launch-readiness"],
  },
  {
    label: "deployed environment name audit",
    args: ["run", "launch:env:audit"],
    requireEnv: "LAUNCH_ENV_AUDIT_REQUIRED",
  },
  {
    label: "staging provider smoke fixture",
    args: ["run", "test:staging-provider-smoke"],
  },
  {
    label: "repo release gate",
    args: ["run", "release:check"],
  },
  {
    label: "production build",
    args: ["run", "build"],
  },
  {
    label: "remote Supabase RLS verifier",
    args: ["run", "supabase:test:rls"],
  },
];

function isEnabled(value) {
  return value === "1" || value?.toLowerCase() === "true";
}

function runCheck(check) {
  return new Promise((resolve, reject) => {
    console.log(`\n[launch-check] ${check.label}`);
    const child = spawn(npmCommand, check.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${check.label} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

for (const check of checks) {
  if (check.requireEnv !== undefined && !isEnabled(process.env[check.requireEnv])) {
    console.log(`\n[launch-check] ${check.label}`);
    console.log(`[launch-check] skipped: set ${check.requireEnv}=true to require this check.`);
    continue;
  }

  await runCheck(check);
}

console.log("\n[launch-check] passed: launch fixtures, staging provider smoke fixture, release gate, production build, and remote RLS verification are green.");
