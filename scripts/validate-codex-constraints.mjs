import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const constraintsPath = path.join(root, "docs", "codex-agent-constraints.json");

const requiredTopLevelKeys = [
  "schemaVersion",
  "loadPolicy",
  "productIdentity",
  "architecture",
  "typeAndContractSafety",
  "inputValidation",
  "sanitization",
  "security",
  "environmentsAndStaging",
  "supabase",
  "integrations",
  "testing",
  "releaseAndObservability",
  "sources",
];

const raw = await readFile(constraintsPath, "utf8");
const constraints = JSON.parse(raw);

for (const key of requiredTopLevelKeys) {
  if (!(key in constraints)) {
    throw new Error(`Missing required constraints section: ${key}`);
  }
}

for (const [sectionName, section] of Object.entries(constraints)) {
  if (
    sectionName === "sources" ||
    sectionName === "schemaVersion" ||
    sectionName === "name" ||
    sectionName === "refs" ||
    sectionName === "pathTriggers"
  ) {
    continue;
  }

  if (typeof section === "object" && section !== null && "rules" in section) {
    const rules = section.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error(`Constraint section ${sectionName} must contain at least one rule.`);
    }
  }
}

if (!Array.isArray(constraints.sources) || constraints.sources.length < 5) {
  throw new Error("Constraints must include primary source references.");
}

console.log(`Validated ${path.relative(root, constraintsPath)}`);

