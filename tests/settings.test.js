const fs = require("fs");
const path = require("path");
const os = require("os");

const WORK = path.join(os.tmpdir(), "plugin-share-linker-tests", "settings");
const SRC_VAULT = path.join(WORK, "vault-source");
const SCAN_TARGET = path.join(WORK, "vault-target-scan");
const PLAN_TARGET = path.join(WORK, "vault-target-plan");
const APPLY_TARGET = path.join(WORK, "vault-target-apply");
const APPLY_NEW = path.join(WORK, "vault-target-new");
const APPLY_FAIL = path.join(WORK, "vault-target-fail");
const MAIN_JS = path.join(__dirname, "..", "main.js");

// Resolve the `obsidian` import to the local stub module.
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "obsidian") return path.join(__dirname, "obsidian-stub.js");
  return originalResolveFilename.call(this, request, ...args);
};

// ---- source vault values (also reused by the assertions) ------------------
const SOURCE_APP = {
  attachmentFolderPath: "attachments",
  newFileLocation: "root",
  userIgnoreFilters: ["node_modules", ".trash"],
  newKey: "yes",
};
const SOURCE_APPEARANCE = {
  theme: "obsidian",
  accentColor: "#ffffff",
  cssTheme: "Blue Topaz",
  enabledCssSnippets: ["wide-tables"],
  baseFontSize: 17,
};
const SOURCE_HOTKEYS = {
  "app:go-back": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
  "editor:toggle-bold": [{ modifiers: ["Mod", "Shift"], key: "P" }],
};
const SOURCE_CORE = {
  "file-explorer": true,
  graph: false,
  "daily-notes": false,
  canvas: true,
  backlink: true,
};
const SOURCE_GRAPH = { scale: 1.5, showTags: true };
const SOURCE_TEMPLATES = { folder: "Templates", dateFormat: "YYYY-MM-DD" };
const SOURCE_DAILY = { folder: "Journal", format: "YYYY-MM-DD" };
const SOURCE_ZK = { prefix: "2026" };
const SETTING_IDS = [
  "app",
  "appearance",
  "hotkeys",
  "core-plugins",
  "graph",
  "templates",
  "daily-notes",
  "zk-prefixer",
];

let failures = 0;
let checks = 0;

function check(name, condition, extra) {
  checks += 1;
  if (condition) {
    console.log("PASS " + name);
  } else {
    failures += 1;
    console.log("FAIL " + name + (extra !== undefined ? " :: " + extra : ""));
  }
}

function eq(name, actual, expected) {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    "actual=" + JSON.stringify(actual) + " expected=" + JSON.stringify(expected)
  );
}

// Key order must not matter when asserting merged JSON files.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

function eqObject(name, actual, expected) {
  eq(name, canonical(actual), canonical(expected));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, value) {
  writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function tmpLeftovers(dirPath) {
  return fs.readdirSync(dirPath).filter((name) => name.endsWith(".tmp"));
}

function configOf(vaultPath) {
  return path.join(vaultPath, ".obsidian");
}

function setupVaults() {
  rmrf(WORK);
  fs.mkdirSync(SRC_VAULT, { recursive: true });

  // Current vault: every settings file exists and parses.
  writeJson(path.join(configOf(SRC_VAULT), "app.json"), SOURCE_APP);
  writeJson(path.join(configOf(SRC_VAULT), "appearance.json"), SOURCE_APPEARANCE);
  writeJson(path.join(configOf(SRC_VAULT), "hotkeys.json"), SOURCE_HOTKEYS);
  writeJson(path.join(configOf(SRC_VAULT), "core-plugins.json"), SOURCE_CORE);
  writeJson(path.join(configOf(SRC_VAULT), "graph.json"), SOURCE_GRAPH);
  writeJson(path.join(configOf(SRC_VAULT), "templates.json"), SOURCE_TEMPLATES);
  writeJson(path.join(configOf(SRC_VAULT), "daily-notes.json"), SOURCE_DAILY);
  writeJson(path.join(configOf(SRC_VAULT), "zk-prefixer.json"), SOURCE_ZK);

  // Scan target: same / diff (with the appearance exclusions) / missing / broken JSON.
  const scanConfig = configOf(SCAN_TARGET);
  writeJson(path.join(scanConfig, "app.json"), SOURCE_APP);
  writeJson(path.join(scanConfig, "appearance.json"), {
    theme: "obsidian",
    accentColor: "#ffffff",
    baseFontSize: 17,
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
  });
  writeJson(path.join(scanConfig, "hotkeys.json"), {
    "other:cmd": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
  });
  writeFile(path.join(scanConfig, "templates.json"), "{ this is not json");

  // Plan target: mixed merge cases, one invalid target JSON, one same file.
  const planConfig = configOf(PLAN_TARGET);
  writeJson(path.join(planConfig, "app.json"), {
    attachmentFolderPath: "target-attachments",
    newFileLocation: "root",
    legacyAppKey: true,
  });
  writeJson(path.join(planConfig, "appearance.json"), {
    theme: "obsidian",
    accentColor: "#123456",
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
    textFontFamily: "Target Font",
  });
  writeJson(path.join(planConfig, "hotkeys.json"), {
    "other:cmd": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
  });
  writeJson(path.join(planConfig, "core-plugins.json"), {
    "file-explorer": true,
    graph: true,
    "daily-notes": true,
    canvas: false,
  });
  writeFile(path.join(planConfig, "templates.json"), "{ not json");
  writeJson(path.join(planConfig, "zk-prefixer.json"), SOURCE_ZK);

  // Apply target: merge + backup + unchanged + broken JSON target.
  const applyConfig = configOf(APPLY_TARGET);
  writeJson(path.join(applyConfig, "app.json"), {
    attachmentFolderPath: "target-attachments",
    legacyAppKey: true,
  });
  writeJson(path.join(applyConfig, "appearance.json"), {
    theme: "moonstone",
    accentColor: "#000000",
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
    textFontFamily: "Target Font",
  });
  writeFile(path.join(applyConfig, "templates.json"), "{ not json");
  writeJson(path.join(applyConfig, "zk-prefixer.json"), SOURCE_ZK);

  // A target folder that is not a vault yet (no .obsidian directory).
  fs.mkdirSync(APPLY_NEW, { recursive: true });

  // A target vault used to prove one failing file does not stop the others.
  fs.mkdirSync(configOf(APPLY_FAIL), { recursive: true });
}

async function main() {
  setupVaults();

  const Ctor = require(MAIN_JS);
  const T = Ctor.__test;
  const app = {
    vault: { adapter: { getBasePath: () => SRC_VAULT }, configDir: ".obsidian" },
    setting: null,
  };
  const plugin = new Ctor(app, { id: "plugin-share-linker", name: "Share Linker" });
  await plugin.onload();
  plugin.settings.language = "zh";

  const sourceRows = await plugin.readCurrentSettingFiles();
  eq(
    "readCurrentSettingFiles returns the 8 setting rows",
    sourceRows.map((row) => row.id),
    SETTING_IDS
  );
  check(
    "readCurrentSettingFiles marks every source file as present",
    sourceRows.every((row) => row.exists),
    JSON.stringify(sourceRows.map((row) => [row.id, row.exists]))
  );

  // --- SETTING_FILES whitelist --------------------------------------------
  eq(
    "SETTING_FILES has exactly the 8 expected ids",
    T.SETTING_FILES.map((def) => def.id),
    SETTING_IDS
  );
  eq(
    "SETTING_FILES has exactly the 8 expected file names",
    T.SETTING_FILES.map((def) => def.fileName),
    SETTING_IDS.map((id) => id + ".json")
  );
  check(
    "SETTING_FILES never lists workspace / bookmarks / community-plugins",
    !T.SETTING_FILES.some((def) =>
      ["workspace.json", "workspace-mobile.json", "bookmarks.json", "community-plugins.json"].includes(def.fileName)
    ),
    JSON.stringify(T.SETTING_FILES.map((def) => def.fileName))
  );

  // --- filterSettingValue --------------------------------------------------
  const appearanceSnapshot = JSON.stringify(SOURCE_APPEARANCE);
  const appearanceFiltered = T.filterSettingValue("appearance", SOURCE_APPEARANCE);
  eq(
    "filterSettingValue drops cssTheme + enabledCssSnippets",
    Object.keys(appearanceFiltered).sort(),
    ["accentColor", "baseFontSize", "theme"]
  );
  check(
    "filterSettingValue keeps the other appearance keys with their values",
    appearanceFiltered.theme === "obsidian" &&
      appearanceFiltered.accentColor === "#ffffff" &&
      appearanceFiltered.baseFontSize === 17
  );
  check(
    "filterSettingValue does not mutate the source object",
    JSON.stringify(SOURCE_APPEARANCE) === appearanceSnapshot,
    JSON.stringify(SOURCE_APPEARANCE)
  );
  const appFiltered = T.filterSettingValue("app", { cssTheme: "Keep Me", enabledCssSnippets: ["keep"] });
  eq(
    "filterSettingValue leaves non-appearance ids untouched",
    appFiltered,
    { cssTheme: "Keep Me", enabledCssSnippets: ["keep"] }
  );
  check("filterSettingValue returns a copy for filtered ids", appearanceFiltered !== SOURCE_APPEARANCE);
  eq("filterSettingValue tolerates non-object input", T.filterSettingValue("app", null), {});

  // --- diffSettingValues ---------------------------------------------------
  const diff = T.diffSettingValues(
    { changedKey: "new", nested: { a: 1, b: 2 }, arr: [1, 2], addedKey: 1 },
    { changedKey: "old", nested: { a: 1, b: 3 }, arr: [2, 1], removedKey: 1 }
  );
  eq("diffSettingValues reports changed keys", diff.changed, ["changedKey", "nested", "arr"]);
  eq("diffSettingValues reports added keys", diff.added, ["addedKey"]);
  eq("diffSettingValues reports removed keys", diff.removed, ["removedKey"]);
  check(
    "diffSettingValues compares nested objects by value",
    T.diffSettingValues({ nested: { a: 1, b: 2 } }, { nested: { a: 1, b: 2 } }).changed.length === 0
  );
  check(
    "diffSettingValues compares arrays order-sensitively",
    JSON.stringify(T.diffSettingValues({ arr: [1, 2] }, { arr: [2, 1] }).changed) === JSON.stringify(["arr"]),
    JSON.stringify(T.diffSettingValues({ arr: [1, 2] }, { arr: [2, 1] }))
  );
  const reordered = T.diffSettingValues({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 });
  check(
    "diffSettingValues treats differently ordered object keys as equal",
    reordered.changed.length === 0 && reordered.added.length === 0 && reordered.removed.length === 0,
    JSON.stringify(reordered)
  );
  const reorderedInArray = T.diffSettingValues(
    { hotkeys: [{ modifiers: ["Mod"], key: "P" }] },
    { hotkeys: [{ key: "P", modifiers: ["Mod"] }] }
  );
  check(
    "diffSettingValues ignores object key order inside arrays",
    reorderedInArray.changed.length === 0,
    JSON.stringify(reorderedInArray)
  );

  // --- findHotkeyConflicts -------------------------------------------------
  const conflicts = T.findHotkeyConflicts(
    {
      "app:go-back": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
      "editor:toggle-bold": [{ modifiers: ["Mod", "Shift"], key: "P" }],
      "internal:duplicate": [{ modifiers: ["Shift", "Mod"], key: "p" }],
    },
    {
      "other:cmd": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
      "editor:toggle-bold": [{ modifiers: ["Shift", "Mod"], key: "P" }],
    }
  );
  const crossConflict = conflicts.find((conflict) => conflict.combo === "mod+arrowleft");
  check(
    "findHotkeyConflicts reports a cross-command conflict",
    !!crossConflict &&
      !crossConflict.internal &&
      crossConflict.sourceCommand === "app:go-back" &&
      crossConflict.targetCommand === "other:cmd",
    JSON.stringify(conflicts)
  );
  check(
    "findHotkeyConflicts never pairs a command with itself",
    !conflicts.some((conflict) => !conflict.internal && conflict.sourceCommand === conflict.targetCommand),
    JSON.stringify(conflicts)
  );
  check(
    "findHotkeyConflicts normalizes modifier order and key case",
    conflicts.every((conflict) => ["mod+arrowleft", "mod+shift+p"].includes(conflict.combo)),
    JSON.stringify(conflicts.map((conflict) => conflict.combo))
  );
  const internalConflict = conflicts.find((conflict) => conflict.internal);
  check(
    "findHotkeyConflicts reports an internal duplicate in the source",
    !!internalConflict &&
      internalConflict.combo === "mod+shift+p" &&
      ["editor:toggle-bold", "internal:duplicate"].includes(internalConflict.sourceCommand) &&
      ["editor:toggle-bold", "internal:duplicate"].includes(internalConflict.targetCommand),
    JSON.stringify(internalConflict)
  );
  const noConflicts = T.findHotkeyConflicts(
    { "cmd:a": [{ modifiers: ["Mod"], key: "K" }] },
    { "cmd:b": [{ modifiers: ["Mod"], key: "J" }] }
  );
  eq("findHotkeyConflicts returns nothing for distinct combos", noConflicts, []);
  eq(
    "findHotkeyConflicts ignores the same command bound to the same combo",
    T.findHotkeyConflicts(
      { "cmd:a": [{ modifiers: ["Mod"], key: "P" }] },
      { "cmd:a": [{ modifiers: ["mod"], key: "p" }] }
    ),
    []
  );

  // --- summarizeCorePluginChanges -----------------------------------------
  const coreSummary = T.summarizeCorePluginChanges(SOURCE_CORE, {
    "file-explorer": true,
    graph: true,
    "daily-notes": true,
    canvas: false,
    "target-only": true,
  });
  eq("summarizeCorePluginChanges lists enabled ids", coreSummary.enabled, ["canvas", "backlink"]);
  eq("summarizeCorePluginChanges lists disabled ids", coreSummary.disabled, ["graph", "daily-notes"]);
  check(
    "summarizeCorePluginChanges ignores target-only ids",
    !coreSummary.enabled.includes("target-only") && !coreSummary.disabled.includes("target-only"),
    JSON.stringify(coreSummary)
  );

  // --- scanTargetSettings --------------------------------------------------
  const scan = await T.scanTargetSettings(configOf(SCAN_TARGET), sourceRows);
  eq("scanTargetSettings returns a status for every setting file", Object.keys(scan).sort(), [...SETTING_IDS].sort());
  eq("scanTargetSettings: identical file is same", scan.app.state, "same");
  eq("scanTargetSettings: identical file counts 0 keys", scan.app.count, 0);
  eq("scanTargetSettings: appearance with only excluded keys differs is same", scan.appearance.state, "same");
  eq("scanTargetSettings: excluded appearance keys are not counted", scan.appearance.count, 0);
  check(
    "scanTargetSettings fixture: appearance cssTheme really differs",
    SOURCE_APPEARANCE.cssTheme !== "Minimal" && SOURCE_APPEARANCE.enabledCssSnippets[0] !== "ghost",
    JSON.stringify(SOURCE_APPEARANCE)
  );
  eq("scanTargetSettings: differing file is diff", scan.hotkeys.state, "diff");
  eq("scanTargetSettings: diff counts added keys", scan.hotkeys.count, 2);
  eq("scanTargetSettings: absent target file is missing", scan.graph.state, "missing");
  eq("scanTargetSettings: missing file counts the keys that would be added", scan.graph.count, 2);
  eq("scanTargetSettings: absent core-plugins is missing", scan["core-plugins"].state, "missing");
  eq("scanTargetSettings: invalid target JSON is diff", scan.templates.state, "diff");
  eq("scanTargetSettings: invalid target JSON counts every source key", scan.templates.count, 2);
  check("scanTargetSettings: invalid target JSON carries the parse error", typeof scan.templates.parseError === "string", JSON.stringify(scan.templates));
  eq(
    "scanTargetSettings: diff details carry the added keys",
    scan.hotkeys.added.map((item) => item.key).sort(),
    ["app:go-back", "editor:toggle-bold"]
  );
  check(
    "scanTargetSettings: added details carry the source value",
    scan.hotkeys.added.every((item) => item.to !== undefined),
    JSON.stringify(scan.hotkeys.added)
  );
  eq(
    "scanTargetSettings: same file has no detail entries",
    [scan.app.changed.length, scan.app.added.length, scan.app.removed.length],
    [0, 0, 0]
  );
  eq(
    "scanTargetSettings: missing file lists every source key as added",
    scan.graph.added.map((item) => item.key).sort(),
    ["scale", "showTags"]
  );
  eq(
    "scanTargetSettings: invalid target JSON adds every source key",
    scan.templates.added.map((item) => item.key).sort(),
    ["dateFormat", "folder"]
  );

  // --- formatSettingValue (hover tooltip values) ---------------------------
  const formatValue = T.formatSettingValue;
  eq("formatSettingValue renders compact JSON", formatValue({ a: 1 }), '{"a":1}');
  check(
    "formatSettingValue truncates long values",
    formatValue("x".repeat(200)).length <= 61 && formatValue("x".repeat(200)).endsWith("…")
  );
  eq("formatSettingValue renders undefined as a dash", formatValue(undefined), "—");

  // --- buildSettingsSharePlan ---------------------------------------------
  const planConfig = configOf(PLAN_TARGET);
  const plan = await T.buildSettingsSharePlan(planConfig, sourceRows);
  eq(
    "buildSettingsSharePlan builds one entry per settings file",
    plan.files.map((file) => file.id),
    SETTING_IDS
  );
  eq("buildSettingsSharePlan: app file path", plan.files[0].filePath, path.join(planConfig, "app.json"));
  check("buildSettingsSharePlan: existing target marked existed", plan.files[0].existed === true);
  check(
    "buildSettingsSharePlan: absent target not marked existed",
    plan.files.find((file) => file.id === "graph").existed === false
  );
  check(
    "buildSettingsSharePlan: invalid target JSON still marked existed",
    plan.files.find((file) => file.id === "templates").existed === true &&
      typeof plan.files.find((file) => file.id === "templates").parseError === "string"
  );

  const appPlan = plan.files.find((file) => file.id === "app");
  eq("buildSettingsSharePlan: app changed keys", appPlan.changed, ["attachmentFolderPath"]);
  eq("buildSettingsSharePlan: app added keys", appPlan.added, ["userIgnoreFilters", "newKey"]);
  eq("buildSettingsSharePlan: app removed keys", appPlan.removed, ["legacyAppKey"]);
  check(
    "buildSettingsSharePlan: target-only app key stays out of changed/added",
    !appPlan.changed.includes("legacyAppKey") && !appPlan.added.includes("legacyAppKey"),
    JSON.stringify(appPlan)
  );
  eqObject("buildSettingsSharePlan: app targetValue is the target file", appPlan.targetValue, {
    attachmentFolderPath: "target-attachments",
    newFileLocation: "root",
    legacyAppKey: true,
  });
  eq("buildSettingsSharePlan: changed vault-bound key is flagged", plan.vaultBoundKeys, [
    "attachmentFolderPath",
    "userIgnoreFilters",
  ]);
  check(
    "buildSettingsSharePlan: unchanged vault-bound key is not flagged",
    !plan.vaultBoundKeys.includes("newFileLocation"),
    JSON.stringify(plan.vaultBoundKeys)
  );
  eq(
    "buildSettingsSharePlan: invalid target JSON becomes a warning",
    plan.warnings.filter((filePath) => filePath.endsWith("templates.json")),
    [path.join(planConfig, "templates.json")]
  );
  eq("buildSettingsSharePlan: source warnings stay empty", plan.sourceWarnings, []);

  const appearancePlan = plan.files.find((file) => file.id === "appearance");
  eq("buildSettingsSharePlan: appearance changed keys", appearancePlan.changed, ["accentColor"]);
  eq("buildSettingsSharePlan: appearance added keys", appearancePlan.added, ["baseFontSize"]);
  eq("buildSettingsSharePlan: appearance removed keys", appearancePlan.removed, [
    "cssTheme",
    "enabledCssSnippets",
    "textFontFamily",
  ]);
  check(
    "buildSettingsSharePlan: appearance sourceValue excludes cssTheme/enabledCssSnippets",
    !Object.prototype.hasOwnProperty.call(appearancePlan.sourceValue, "cssTheme") &&
      !Object.prototype.hasOwnProperty.call(appearancePlan.sourceValue, "enabledCssSnippets"),
    JSON.stringify(appearancePlan.sourceValue)
  );
  check(
    "buildSettingsSharePlan: appearance plan keeps the target cssTheme",
    appearancePlan.targetValue.cssTheme === "Minimal",
    JSON.stringify(appearancePlan.targetValue)
  );
  eq(
    "buildSettingsSharePlan: appearance plan keeps the target enabled snippet list",
    appearancePlan.targetValue.enabledCssSnippets,
    ["ghost"]
  );
  check(
    "buildSettingsSharePlan: excluded appearance keys are never changed/added",
    !["cssTheme", "enabledCssSnippets"].some(
      (key) => appearancePlan.changed.includes(key) || appearancePlan.added.includes(key)
    ),
    JSON.stringify(appearancePlan)
  );
  check(
    "buildSettingsSharePlan: excluded appearance keys stay out of the source write payload",
    !["cssTheme", "enabledCssSnippets"].some((key) =>
      Object.prototype.hasOwnProperty.call(appearancePlan.sourceValue, key)
    )
  );

  eq("buildSettingsSharePlan: hotkey conflicts collected", plan.hotkeyConflicts.length, 1);
  const planConflict = plan.hotkeyConflicts[0];
  check(
    "buildSettingsSharePlan: hotkey conflict names both commands",
    planConflict.combo === "mod+arrowleft" &&
      planConflict.sourceCommand === "app:go-back" &&
      planConflict.targetCommand === "other:cmd" &&
      planConflict.internal === false,
    JSON.stringify(planConflict)
  );
  eq("buildSettingsSharePlan: core plugins to enable", plan.corePlugins.enabled, ["canvas", "backlink"]);
  eq("buildSettingsSharePlan: core plugins to disable", plan.corePlugins.disabled, ["graph", "daily-notes"]);
  check("buildSettingsSharePlan: sawHotkeys/sawCorePlugins set", plan.sawHotkeys === true && plan.sawCorePlugins === true);
  const zkPlan = plan.files.find((file) => file.id === "zk-prefixer");
  check(
    "buildSettingsSharePlan: identical file has nothing to write",
    zkPlan.changed.length === 0 && zkPlan.added.length === 0,
    JSON.stringify(zkPlan)
  );

  const missingDirPlan = await T.buildSettingsSharePlan(path.join(WORK, "no-such-config"), sourceRows);
  check(
    "buildSettingsSharePlan tolerates a target without .obsidian",
    missingDirPlan.files.length === 8 && missingDirPlan.files.every((file) => file.existed === false),
    JSON.stringify(missingDirPlan.files.map((file) => file.existed))
  );

  // --- applySettingsSharePlan ---------------------------------------------
  const applyConfig = configOf(APPLY_TARGET);
  const applyPlan = await T.buildSettingsSharePlan(applyConfig, sourceRows);
  const zkFile = path.join(applyConfig, "zk-prefixer.json");
  const zkBefore = fs.statSync(zkFile).mtimeMs;
  const zkContentBefore = fs.readFileSync(zkFile, "utf8");
  const applyOutcome = await T.applySettingsSharePlan(applyConfig, applyPlan, (key) => key, () => {});
  const statusById = {};
  for (const result of applyOutcome.results) statusById[result.id] = result.status;
  eq("applySettingsSharePlan: written files", statusById, {
    app: "written",
    appearance: "written",
    hotkeys: "written",
    "core-plugins": "written",
    graph: "written",
    templates: "written",
    "daily-notes": "written",
    "zk-prefixer": "unchanged",
  });
  eqObject("applySettingsSharePlan: merged app overrides source and keeps target-only keys", readJson(path.join(applyConfig, "app.json")), {
    attachmentFolderPath: "attachments",
    newFileLocation: "root",
    userIgnoreFilters: ["node_modules", ".trash"],
    newKey: "yes",
    legacyAppKey: true,
  });
  check(
    "applySettingsSharePlan: source value wins over the target value",
    readJson(path.join(applyConfig, "app.json")).attachmentFolderPath === "attachments"
  );
  eqObject("applySettingsSharePlan: appearance keeps cssTheme + enabledCssSnippets of the target", readJson(path.join(applyConfig, "appearance.json")), {
    theme: "obsidian",
    accentColor: "#ffffff",
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
    textFontFamily: "Target Font",
    baseFontSize: 17,
  });
  eqObject("applySettingsSharePlan: created file holds the source value", readJson(path.join(applyConfig, "graph.json")), SOURCE_GRAPH);
  eqObject("applySettingsSharePlan: invalid target JSON is replaced by the source value", readJson(path.join(applyConfig, "templates.json")), SOURCE_TEMPLATES);
  eqObject("applySettingsSharePlan: app backup holds the original target file", readJson(path.join(applyConfig, "app.json.bak")), {
    attachmentFolderPath: "target-attachments",
    legacyAppKey: true,
  });
  eqObject("applySettingsSharePlan: appearance backup holds the original target file", readJson(path.join(applyConfig, "appearance.json.bak")), {
    theme: "moonstone",
    accentColor: "#000000",
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
    textFontFamily: "Target Font",
  });
  check(
    "applySettingsSharePlan: invalid target JSON is backed up verbatim",
    fs.readFileSync(path.join(applyConfig, "templates.json.bak"), "utf8") === "{ not json"
  );
  check(
    "applySettingsSharePlan: newly created file has no backup",
    !fs.existsSync(path.join(applyConfig, "graph.json.bak")) &&
      applyOutcome.results.find((result) => result.id === "graph").backupPath === null
  );
  const unchangedResult = applyOutcome.results.find((result) => result.id === "zk-prefixer");
  check(
    "applySettingsSharePlan: unchanged file is not backed up",
    !fs.existsSync(path.join(applyConfig, "zk-prefixer.json.bak")) && unchangedResult.backupPath === null,
    JSON.stringify(unchangedResult)
  );
  check(
    "applySettingsSharePlan: unchanged file is not written",
    fs.readFileSync(zkFile, "utf8") === zkContentBefore && fs.statSync(zkFile).mtimeMs === zkBefore,
    "content or mtime changed"
  );
  eq("applySettingsSharePlan: no temp files left behind", tmpLeftovers(applyConfig), []);

  // A target that is not a vault yet: .obsidian must be created.
  const newConfig = configOf(APPLY_NEW);
  const newPlan = await T.buildSettingsSharePlan(newConfig, sourceRows);
  const newOutcome = await T.applySettingsSharePlan(newConfig, newPlan, (key) => key, () => {});
  check("applySettingsSharePlan: creates .obsidian when missing", fs.existsSync(newConfig));
  check(
    "applySettingsSharePlan: writes into the new .obsidian",
    fs.existsSync(path.join(newConfig, "app.json")) && fs.existsSync(path.join(newConfig, "hotkeys.json"))
  );
  check(
    "applySettingsSharePlan: new target files are not backed up",
    newOutcome.results.every((result) => result.status === "written" && result.backupPath === null),
    JSON.stringify(newOutcome.results.map((result) => [result.fileName, result.status]))
  );
  eq("applySettingsSharePlan: no backups in a fresh target", fs.readdirSync(newConfig).filter((name) => name.endsWith(".bak")), []);

  // One failing file must not stop the others (simulated rename failure, Windows safe).
  const failConfig = configOf(APPLY_FAIL);
  const failPlan = await T.buildSettingsSharePlan(failConfig, sourceRows);
  const originalRename = fs.promises.rename;
  fs.promises.rename = async function (from, to) {
    if (String(to).replace(/\\/g, "/").endsWith("/hotkeys.json")) {
      throw new Error("simulated rename failure");
    }
    return originalRename.call(fs.promises, from, to);
  };
  let failOutcome;
  try {
    failOutcome = await T.applySettingsSharePlan(failConfig, failPlan, (key) => key, () => {});
  } finally {
    fs.promises.rename = originalRename;
  }
  const failedResult = failOutcome.results.find((result) => result.fileName === "hotkeys.json");
  check(
    "applySettingsSharePlan: failed file reported as error",
    failedResult && failedResult.status === "error",
    JSON.stringify(failedResult)
  );
  check(
    "applySettingsSharePlan: failed file keeps the error message",
    failedResult && failedResult.message.includes("simulated rename failure"),
    JSON.stringify(failedResult)
  );
  check(
    "applySettingsSharePlan: failed file is not left half written",
    !fs.existsSync(path.join(failConfig, "hotkeys.json"))
  );
  check(
    "applySettingsSharePlan: files around the failure still land",
    fs.existsSync(path.join(failConfig, "app.json")) &&
      fs.existsSync(path.join(failConfig, "appearance.json")) &&
      fs.existsSync(path.join(failConfig, "core-plugins.json")) &&
      fs.existsSync(path.join(failConfig, "graph.json")) &&
      fs.existsSync(path.join(failConfig, "zk-prefixer.json")),
    JSON.stringify(failOutcome.results.map((result) => [result.fileName, result.status]))
  );
  eq(
    "applySettingsSharePlan: only the failing file is an error",
    failOutcome.results.filter((result) => result.status !== "written").map((result) => result.fileName),
    ["hotkeys.json"]
  );
  eq("applySettingsSharePlan: failure leaves no temp files", tmpLeftovers(failConfig), []);

  // The modal can stay open long enough for Obsidian to rewrite the target: merge onto the file as it is now.
  const lateTarget = path.join(WORK, "vault-target-late");
  const lateConfig = configOf(lateTarget);
  writeJson(path.join(lateConfig, "app.json"), { attachmentFolderPath: "target-attachments", legacyAppKey: true });
  const latePlan = await T.buildSettingsSharePlan(lateConfig, sourceRows);
  writeJson(path.join(lateConfig, "app.json"), {
    attachmentFolderPath: "target-attachments",
    legacyAppKey: true,
    lateKey: "written-while-asking",
  });
  const lateOutcome = await T.applySettingsSharePlan(lateConfig, latePlan, (key) => key, () => {});
  const lateApp = readJson(path.join(lateConfig, "app.json"));
  check(
    "applySettingsSharePlan: keys written while the confirm was open are kept",
    lateApp.lateKey === "written-while-asking" && lateApp.attachmentFolderPath === SOURCE_APP.attachmentFolderPath,
    JSON.stringify(lateApp)
  );
  check(
    "applySettingsSharePlan: late merge is still reported as written",
    lateOutcome.results.find((result) => result.id === "app").status === "written",
    JSON.stringify(lateOutcome.results.find((result) => result.id === "app"))
  );

  // The target may also settle on its own while the modal is open: then there is nothing left to write.
  const settledTarget = path.join(WORK, "vault-target-settled");
  const settledConfig = configOf(settledTarget);
  writeJson(path.join(settledConfig, "app.json"), { attachmentFolderPath: "target-attachments", legacyAppKey: true });
  const settledPlan = await T.buildSettingsSharePlan(settledConfig, sourceRows);
  writeJson(path.join(settledConfig, "app.json"), SOURCE_APP);
  const settledOutcome = await T.applySettingsSharePlan(settledConfig, settledPlan, (key) => key, () => {});
  const settledResult = settledOutcome.results.find((result) => result.id === "app");
  check(
    "applySettingsSharePlan: a target that already matches is left untouched",
    settledResult.status === "unchanged" && !fs.existsSync(path.join(settledConfig, "app.json.bak")),
    JSON.stringify(settledResult)
  );

  // Appearance's managed keys belong to the theme/snippet controls, never to "target-only".
  const appearanceExclusionScan = await T.scanTargetSettings(configOf(SCAN_TARGET), [
    { id: "appearance", fileName: "appearance.json", value: SOURCE_APPEARANCE },
  ]);
  eq(
    "scanTargetSettings: managed appearance keys are not reported as target-only",
    appearanceExclusionScan.appearance.removed,
    []
  );

  console.log("\n" + (checks - failures) + "/" + checks + " checks passed");
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("SETTINGS TEST CRASH", error);
  process.exit(2);
});
