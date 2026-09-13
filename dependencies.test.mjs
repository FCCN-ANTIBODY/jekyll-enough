// dependencies — the family's promise, as a test.
//
// `-enough` means "enough of that tool to do the work HERE, with nothing installed." The
// membership test is not about size, it is about WHERE it can run: the real tool needs a machine,
// this needs a tab. So the thing that would end it is not a bad feature — it is an import.
//
// A member that quietly starts needing a package, a workstation filesystem, or a file from
// whatever repository it happens to be vendored into has stopped being an `-enough` tool while
// keeping the name. That failure is invisible from inside the repository, which is exactly why it
// belongs in a suite rather than in a README.
//
// TESTS ARE HELD TO A LOOSER RULE ON PURPOSE. A test reads its fixtures off a disk; that is what a
// test is. Production modules get no such allowance.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// What a *.test.mjs may reach for beyond its siblings, and nothing else. Kept explicit rather than
// "any node: builtin", because `node:child_process` and `node:net` are the ones that would matter
// and they should have to be argued for.
const TEST_BUILTINS = new Set(["node:fs", "node:path", "node:url"]);

// The harness is not shipped, so it is held to the test rule rather than the module rule. Named
// explicitly, and it is one file — a pattern here would eventually excuse something real.
const HARNESS = new Set(["test.mjs"]);
const RUNNER_BUILTINS = new Set([...TEST_BUILTINS, "node:child_process"]);

const IMPORT = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?\sfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(IMPORT)) out.push(m[1] ?? m[2]);
  return out;
}

const files = readdirSync(here).filter((f) => f.endsWith(".mjs"));
const modules = files.filter((f) => !f.endsWith(".test.mjs") && !HARNESS.has(f));
const problems = [];

if (modules.length === 0) problems.push("no modules found — this test would pass vacuously");

for (const f of files) {
  const isTest = f.endsWith(".test.mjs") || HARNESS.has(f);
  const allowed = HARNESS.has(f) ? RUNNER_BUILTINS : TEST_BUILTINS;
  for (const spec of importsOf(readFileSync(join(here, f), "utf8"))) {
    // A sibling. The only thing a production module may ever import.
    if (/^\.\/[^/]+\.mjs$/.test(spec)) continue;

    if (spec.startsWith("../") || spec.startsWith("/")) {
      problems.push(`${f}: imports ${spec} — outside this repository. The whole point of the
    extraction was that this folder is a repository; an import that climbs out of it puts the
    dependency back and hides it in a relative path.`);
      continue;
    }
    if (spec.startsWith("node:")) {
      if (isTest && allowed.has(spec)) continue;
      problems.push(isTest
        ? `${f}: imports ${spec} — may use only ${[...allowed].join(", ")}.`
        : `${f}: imports ${spec} — a production module may not import a node: builtin. This is
    the failure the suffix exists to prevent: it still works on your machine and no longer works
    in a tab.`);
      continue;
    }
    problems.push(`${f}: imports ${spec} — a package. There are no dependencies here and adding
    one is a conversation, not a commit.`);
  }
}

if (problems.length) {
  console.error("dependencies: FAILED\n");
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}
const suites = files.filter((f) => f.endsWith(".test.mjs")).length;
console.log(`dependencies: ok — ${modules.length} module(s) import only each other; ${suites} suite(s) and ${HARNESS.size} harness file within the allowance`);
