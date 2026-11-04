const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SUITES = ["core.test.js", "settings.test.js", "ui.test.js", "timeout.test.js"];
const WORK_ROOT = path.join(os.tmpdir(), "plugin-share-linker-tests");

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: "inherit" });
  if (result.error) {
    failed += 1;
    console.error(result.error);
    continue;
  }
  if (result.status !== 0) failed += 1;
}

if (failed === 0) {
  fs.rmSync(WORK_ROOT, { recursive: true, force: true });
  console.log("\nALL SUITES PASSED");
} else {
  console.log(`\n${failed} SUITE(S) FAILED`);
}

process.exit(failed === 0 ? 0 : 1);
