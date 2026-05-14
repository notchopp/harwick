#!/usr/bin/env node
// Audit Harwick assistant trajectories for failure patterns.
// Run: node scripts/audit-harwick-trajectories.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function pct(n, total) {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function bucket(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key] ?? "(null)";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log("=== Harwick Trajectory Audit ===\n");

  // 1) Trajectory volume by workspace + completion reason
  const { data: trajectories, error: trajErr } = await supabase
    .from("agent_trajectories")
    .select("id, workspace_id, lead_id, channel, completion_reason, outcome_label, step_count, started_at, completed_at, summary_text")
    .order("started_at", { ascending: false })
    .limit(500);

  if (trajErr) {
    console.error("trajectory query failed:", trajErr.message);
    process.exit(1);
  }

  console.log(`Total recent trajectories: ${trajectories.length}`);
  if (trajectories.length === 0) {
    console.log("\n>>> No trajectories logged. Harwick assistant has never been called, OR trajectory persistence is broken.");
    console.log(">>> Try sending a message in the rail, then re-run this script.");
    return;
  }

  // Group by workspace
  console.log("\n-- By workspace --");
  for (const [ws, count] of bucket(trajectories, "workspace_id").slice(0, 5)) {
    console.log(`  ${ws}: ${count}`);
  }

  // Completion reasons
  console.log("\n-- Completion reasons --");
  for (const [reason, count] of bucket(trajectories, "completion_reason")) {
    console.log(`  ${reason.padEnd(28)} ${count}  (${pct(count, trajectories.length)})`);
  }

  // Outcome labels
  console.log("\n-- Outcome labels --");
  for (const [label, count] of bucket(trajectories, "outcome_label")) {
    console.log(`  ${(label || "(null)").padEnd(12)} ${count}  (${pct(count, trajectories.length)})`);
  }

  // Step count distribution
  const stepCounts = trajectories.map((t) => t.step_count ?? 0);
  const avgSteps = stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length;
  const maxSteps = Math.max(...stepCounts);
  const overOne = stepCounts.filter((n) => n > 1).length;
  console.log(`\n-- Step counts -- avg ${avgSteps.toFixed(2)}, max ${maxSteps}, >1 step ${overOne} (${pct(overOne, stepCounts.length)})`);

  // 2) Inspect failure-shaped trajectories — pull their last step
  const failureIds = trajectories
    .filter((t) => ["max_iterations", "tool_failed", "no_tool_calls", "queued_for_approval"].includes(t.completion_reason ?? ""))
    .slice(0, 20)
    .map((t) => t.id);

  if (failureIds.length > 0) {
    console.log(`\n=== Inspecting ${failureIds.length} failure-shaped trajectories ===`);
    const { data: steps } = await supabase
      .from("agent_steps")
      .select("trajectory_id, iteration, turn_output, tool_executions, exit_reason")
      .in("trajectory_id", failureIds)
      .order("iteration", { ascending: false });

    const byTraj = new Map();
    for (const step of steps ?? []) {
      if (!byTraj.has(step.trajectory_id)) byTraj.set(step.trajectory_id, step);
    }

    let emptyReplies = 0;
    let genericFallbacks = 0;
    const genericPhrases = [
      /i couldn'?t catch/i,
      /try again/i,
      /something went wrong/i,
      /^thinking/i,
      /^\s*$/,
    ];

    for (const [trajId, lastStep] of byTraj.entries()) {
      const traj = trajectories.find((t) => t.id === trajId);
      const reply = lastStep.turn_output?.reply ?? "";
      const isEmpty = reply.trim().length === 0;
      const isGeneric = genericPhrases.some((rx) => rx.test(reply));
      if (isEmpty) emptyReplies += 1;
      if (isGeneric) genericFallbacks += 1;
      const preview = reply.slice(0, 100).replace(/\s+/g, " ");
      console.log(`  [${traj.completion_reason}] iter=${lastStep.iteration} reply="${preview}"`);
    }

    console.log(`\n  Empty replies: ${emptyReplies} / ${byTraj.size}`);
    console.log(`  Generic fallbacks: ${genericFallbacks} / ${byTraj.size}`);
  } else {
    console.log("\n(no failure-shaped trajectories in recent batch)");
  }

  // 3) harwick_ai_turns table for non-trajectory paths
  const { data: turns, error: turnsErr } = await supabase
    .from("harwick_ai_turns")
    .select("id, workspace_id, status, decision, reply, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!turnsErr && turns?.length) {
    console.log(`\n=== Harwick AI turns (legacy/lead path) — ${turns.length} recent ===`);
    console.log("\n-- By status --");
    for (const [s, c] of bucket(turns, "status")) console.log(`  ${s}: ${c}`);
    console.log("\n-- By decision --");
    for (const [d, c] of bucket(turns, "decision")) console.log(`  ${d}: ${c}`);

    const emptyReplies = turns.filter((t) => !t.reply || t.reply.trim().length === 0).length;
    console.log(`\n  Empty replies: ${emptyReplies} / ${turns.length} (${pct(emptyReplies, turns.length)})`);
  }

  // 4) Outcomes — what signals are we capturing?
  const { data: outcomes } = await supabase
    .from("agent_outcomes")
    .select("signal_type")
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (outcomes?.length) {
    console.log(`\n=== Recent outcomes (training signals) — ${outcomes.length} ===`);
    for (const [s, c] of bucket(outcomes, "signal_type")) {
      console.log(`  ${s.padEnd(28)} ${c}`);
    }
  } else {
    console.log("\n=== Outcomes: 0 logged — no training signal yet. ===");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
