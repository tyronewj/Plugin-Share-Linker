const fs = require("fs");
const path = require("path");
const os = require("os");

const WORK = path.join(os.tmpdir(), "plugin-share-linker-tests", "timeout");
const VAULT_A = path.join(WORK, "vault-a");
const VAULT_B = path.join(WORK, "vault-b");
const MAIN_JS = path.join(__dirname, "..", "main.js");
const OBSIDIAN_STUB = path.join(__dirname, "obsidian-stub.js");

const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "obsidian") return OBSIDIAN_STUB;
  return originalResolveFilename.call(this, request, ...args);
};

let failures = 0;
let checks = 0;

function check(name, condition, extra) {
  checks += 1;
  if (condition) console.log("PASS " + name);
  else {
    failures += 1;
    console.log("FAIL " + name + (extra !== undefined ? " :: " + extra : ""));
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, value) {
  writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

function setup() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(VAULT_A, { recursive: true });
  fs.mkdirSync(VAULT_B, { recursive: true });
  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "dataview", "manifest.json"), {
    id: "dataview",
    name: "Dataview",
    version: "0.5.67",
  });
  writeFile(path.join(VAULT_A, ".obsidian", "plugins", "dataview", "data.json"), "{}");
  writeJson(path.join(VAULT_B, ".obsidian", "community-plugins.json"), []);
}

async function main() {
  setup();
  // The hung target directory must exist on disk (we only fake its stat).
  const hangTarget = path.join(WORK, "hang-target");
  fs.mkdirSync(hangTarget, { recursive: true });

  const Ctor = require(MAIN_JS);
  const app = { vault: { adapter: { getBasePath: () => VAULT_A }, configDir: ".obsidian" }, setting: null };
  const plugin = new Ctor(app, { id: "plugin-share-linker", name: "Share Linker" });
  await plugin.onload();
  plugin.settings.language = "zh";

  // 1) A stat that never resolves must be cut off by the 15s target timeout.
  const originalStat = fs.promises.stat;
  fs.promises.stat = function (target, ...args) {
    if (String(target).includes("hang-target")) return new Promise(() => {});
    return originalStat.call(fs.promises, target, ...args);
  };
  const startedAt = Date.now();
  let timeoutMessage = "";
  try {
    await plugin.sharePlugins(["dataview"], hangTarget, "copy");
    check("hung target rejected", false, "did not throw");
  } catch (error) {
    timeoutMessage = error.message;
    const elapsed = Date.now() - startedAt;
    check("hung target timed out", elapsed > 12000 && elapsed < 25000, "elapsed=" + elapsed);
    check("timeout names the path", timeoutMessage.includes("hang-target"), timeoutMessage);
    check("timeout explains the cause", timeoutMessage.includes("15 秒内没有响应"), timeoutMessage);
  }
  fs.promises.stat = originalStat;

  // 2) A failing copy must not leave a partial folder behind.
  const originalCp = fs.promises.cp;
  fs.promises.cp = async function (source, target) {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "partial.txt"), "half copied");
    throw new Error("fake copy failure");
  };
  const copyResult = await plugin.copyPlugins(["dataview"], VAULT_B);
  fs.promises.cp = originalCp;
  check("failed copy reported as error", copyResult.results[0].status === "error", JSON.stringify(copyResult.results[0]));
  check(
    "failed copy cleaned up partial folder",
    !fs.existsSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview")),
    "partial folder still exists"
  );

  // 3) Normal copy still works after cleanup path.
  const goodCopy = await plugin.copyPlugins(["dataview"], VAULT_B);
  check("copy after failure succeeds", goodCopy.results[0].status === "created");
  check("copied file exists", fs.existsSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview", "manifest.json")));

  // 4) A stalled link scan is cut off by the action timeout instead of hanging the page.
  const hangVault = path.join(WORK, "hang-links");
  fs.mkdirSync(path.join(hangVault, ".obsidian", "plugins"), { recursive: true });
  const originalReaddir = fs.promises.readdir;
  fs.promises.readdir = function (target, ...args) {
    if (String(target).includes("hang-links")) return new Promise(() => {});
    return originalReaddir.call(fs.promises, target, ...args);
  };
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = function (fn, ms, ...args) {
    return originalSetTimeout(fn, ms === 45000 ? 10 : ms, ...args);
  };
  let scanError = "";
  try {
    await plugin.scanTargetVault(hangVault);
    check("stalled link scan rejected", false, "did not throw");
  } catch (error) {
    scanError = error.message;
  }
  global.setTimeout = originalSetTimeout;
  fs.promises.readdir = originalReaddir;
  check("stalled link scan times out", scanError.includes("45 秒"), scanError);

  console.log("\n" + (checks - failures) + "/" + checks + " checks passed");
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("TIMEOUT TEST CRASH", error);
  process.exit(2);
});
