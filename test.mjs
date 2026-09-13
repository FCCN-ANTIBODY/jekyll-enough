// test — run every *.test.mjs in this repository. No installer, no runner, no config.
//
//   node test.mjs
//
// A missing suite is a FAILURE, not a skip. The runner this was extracted from tolerated a
// directory that was not there, which is correct for an optional folder and wrong for a
// submodule: an unfilled mount then reads as a clean pass. See docs/mounting.md.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

if (files.length === 0) {
  console.error("test: no suites found. Either this checkout is empty or a rename went wrong —\n" +
                "      an empty run must never read as a pass.");
  process.exit(1);
}

const failed = [];
for (const f of files) {
  process.stdout.write(`\n▶ ${f}\n`);
  try { execFileSync("node", [join(here, f)], { stdio: "inherit" }); }
  catch { failed.push(f); }
}

console.log(`\n${files.length - failed.length}/${files.length} suites passed`);
if (failed.length) { console.error("FAILED: " + failed.join(", ")); process.exit(1); }
