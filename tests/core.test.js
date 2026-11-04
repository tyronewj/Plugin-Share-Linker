const fs = require("fs");
const path = require("path");
const os = require("os");

const WORK = path.join(os.tmpdir(), "plugin-share-linker-tests", "core");
const VAULT_A = path.join(WORK, "vault-a");
const VAULT_B = path.join(WORK, "vault-b");
const VAULT_C = path.join(WORK, "vault-c");
const MAIN_JS = path.join(__dirname, "..", "main.js");

// Resolve the `obsidian` import to the local stub module.
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "obsidian") return path.join(__dirname, "obsidian-stub.js");
  return originalResolveFilename.call(this, request, ...args);
};

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

async function expectThrows(name, fn, includes) {
  try {
    await fn();
    check(name, false, "did not throw");
  } catch (error) {
    check(name, error.message.includes(includes), "message=" + error.message);
  }
}

function setupVaults() {
  rmrf(WORK);
  fs.mkdirSync(VAULT_A, { recursive: true });
  fs.mkdirSync(VAULT_B, { recursive: true });
  fs.mkdirSync(VAULT_C, { recursive: true });

  // Current vault (A)
  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "dataview", "manifest.json"), {
    id: "dataview",
    name: "Dataview",
    version: "0.5.67",
    description: "Complex data views for the data-obsessed.",
  });
  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "dataview", "data.json"), { refreshInterval: 2500 });
  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "templater-obsidian", "manifest.json"), {
    id: "templater-obsidian",
    name: "Templater",
    version: "2.4.1",
    description: "Create and use templates.",
  });
  writeFile(path.join(VAULT_A, ".obsidian", "plugins", "broken-plugin", "readme.txt"), "no manifest here");
  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "plugin-share-linker", "manifest.json"), {
    id: "plugin-share-linker",
    name: "Share Linker",
    version: "1.0.2",
  });

  writeFile(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz", "theme.css"), "/* blue topaz */");
  writeJson(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz", "manifest.json"), {
    name: "Blue Topaz",
    version: "2023080203",
    minAppVersion: "1.0.0",
    author: "WhyI",
  });
  writeFile(path.join(VAULT_A, ".obsidian", "themes", "legacy", "theme.css"), "/* legacy, no manifest */");
  writeFile(path.join(VAULT_A, ".obsidian", "themes", "obsidian.css"), "/* stray file, must be ignored */");

  writeFile(path.join(VAULT_A, ".obsidian", "snippets", "wide-tables.css"), ".wide-table { width: 100%; }");
  writeFile(path.join(VAULT_A, ".obsidian", "snippets", "callout-tweaks.css"), ".callout { border: 0; }");
  writeFile(path.join(VAULT_A, ".obsidian", "snippets", "notes.txt"), "not a snippet");
  writeFile(path.join(VAULT_A, ".obsidian", "snippets", ".hidden.css"), ".hidden {}");

  // Target vault (B) - already a vault, with its own enabled plugin and appearance
  writeJson(path.join(VAULT_B, ".obsidian", "community-plugins.json"), ["other-plugin"]);
  writeJson(path.join(VAULT_B, ".obsidian", "appearance.json"), { theme: "moonstone", cssTheme: "" });

  // Target folder (C) - exists but is not a vault yet
}

async function main() {
  setupVaults();

  const Ctor = require(MAIN_JS);
  const app = {
    vault: { adapter: { getBasePath: () => VAULT_A }, configDir: ".obsidian" },
    setting: null,
  };
  const plugin = new Ctor(app, { id: "plugin-share-linker", name: "Share Linker" });
  await plugin.onload();
  plugin.settings.language = "zh";

  // --- Listing -------------------------------------------------------------
  const plugins = await plugin.listPlugins();
  eq("listPlugins finds dataview + templater", plugins.map((item) => item.id), ["dataview", "templater-obsidian"]);
  check("listPlugins skips broken plugin folder", !plugins.some((item) => item.folderName === "broken-plugin"));
  check("listPlugins skips itself", !plugins.some((item) => item.folderName === "plugin-share-linker"));

  const themes = await plugin.listThemes();
  eq("listThemes finds folder themes, ignores stray css", themes.map((item) => item.folderName), ["Blue Topaz", "legacy"]);
  eq("listThemes uses manifest name", themes[0].name, "Blue Topaz");
  eq("listThemes falls back to folder name", themes[1].name, "legacy");

  const snippets = await plugin.listSnippets();
  eq("listSnippets finds css files only", snippets.map((item) => item.name), ["callout-tweaks", "wide-tables"]);

  // --- Plugin copy + enable ------------------------------------------------
  plugin.settings.targetVaultPath = VAULT_B;
  plugin.settings.selectedPluginIds = ["dataview"];
  plugin.settings.enabledPluginIds = ["dataview", "templater-obsidian"];

  const firstShare = await plugin.copyPlugins(["dataview"], VAULT_B);
  eq("plugin copy status", firstShare.results.map((item) => item.status), ["created"]);
  check("plugin copied", fs.existsSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview", "manifest.json")));
  check(
    "plugin data.json copied (settings travel with the folder)",
    fs.existsSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview", "data.json"))
  );
  eq(
    "enable list appended only for landed+enabled",
    readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json")),
    ["other-plugin", "dataview"]
  );
  eq("enable summary", firstShare.config.pluginsEnabled, ["dataview"]);
  check("community-plugins backup created", fs.existsSync(path.join(VAULT_B, ".obsidian", "community-plugins.json.bak")));
  eq(
    "backup holds original content",
    readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json.bak")),
    ["other-plugin"]
  );

  // Re-share: exists, no overwrite, message says not updated
  const secondShare = await plugin.copyPlugins(["dataview"], VAULT_B);
  eq("re-share status is exists", secondShare.results.map((item) => item.status), ["exists"]);
  check("re-share message says not updated", secondShare.results[0].message.includes("未更新"), secondShare.results[0].message);
  eq(
    "community list unchanged on re-share",
    readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json")),
    ["other-plugin", "dataview"]
  );

  // Enable an already-existing plugin: exists still counts as landed
  writeJson(path.join(VAULT_B, ".obsidian", "community-plugins.json"), ["other-plugin"]);
  plugin.settings.enabledPluginIds = ["dataview"];
  const thirdShare = await plugin.copyPlugins(["dataview"], VAULT_B);
  eq("exists counts as landed for enable", thirdShare.config.pluginsEnabled, ["dataview"]);
  eq(
    "community list rebuilt with landed id",
    readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json")),
    ["other-plugin", "dataview"]
  );

  // --- Themes --------------------------------------------------------------
  plugin.settings.targetThemeName = "";
  const themeShare = await plugin.copyThemes(["Blue Topaz"], VAULT_B);
  eq("theme copy status", themeShare.results.map((item) => item.status), ["created"]);
  check("theme folder copied", fs.existsSync(path.join(VAULT_B, ".obsidian", "themes", "Blue Topaz", "theme.css")));
  eq(
    "auto theme set when target has no custom theme",
    readJson(path.join(VAULT_B, ".obsidian", "appearance.json")).cssTheme,
    "Blue Topaz"
  );
  check("appearance backup created", fs.existsSync(path.join(VAULT_B, ".obsidian", "appearance.json.bak")));
  eq("theme summary", themeShare.config.themeSet, "Blue Topaz");

  // Re-share theme: exists status; target already has a custom theme, so no config write
  const themeReshare = await plugin.copyThemes(["Blue Topaz"], VAULT_B);
  eq("theme re-share status exists", themeReshare.results.map((item) => item.status), ["exists"]);
  eq("no config write when target already has a theme", themeReshare.config, null);

  // Explicit pick overrides an existing target theme
  const appearanceAfter = readJson(path.join(VAULT_B, ".obsidian", "appearance.json"));
  appearanceAfter.cssTheme = "Minimal";
  writeJson(path.join(VAULT_B, ".obsidian", "appearance.json"), appearanceAfter);
  fs.rmSync(path.join(VAULT_B, ".obsidian", "themes", "Blue Topaz"), { recursive: true, force: true });
  plugin.settings.targetThemeName = "Blue Topaz";
  const themeOverride = await plugin.copyThemes(["Blue Topaz"], VAULT_B);
  eq(
    "explicit theme overrides target theme",
    readJson(path.join(VAULT_B, ".obsidian", "appearance.json")).cssTheme,
    "Blue Topaz"
  );
  eq("explicit theme summary", themeOverride.config.themeSet, "Blue Topaz");

  // --- Snippets ------------------------------------------------------------
  plugin.settings.selectedSnippetNames = ["wide-tables"];
  plugin.settings.enabledSnippetNames = ["wide-tables", "callout-tweaks"];
  const snippetShare = await plugin.copySnippets(["wide-tables"], VAULT_B);
  eq("snippet copy status", snippetShare.results.map((item) => item.status), ["created"]);
  check("snippet file copied", fs.existsSync(path.join(VAULT_B, ".obsidian", "snippets", "wide-tables.css")));
  const appearanceWithSnippets = readJson(path.join(VAULT_B, ".obsidian", "appearance.json"));
  eq("snippet enabled append", appearanceWithSnippets.enabledCssSnippets, ["wide-tables"]);
  eq("theme untouched by snippet write", appearanceWithSnippets.cssTheme, "Blue Topaz");
  eq("snippet summary", snippetShare.config.snippetsEnabled, ["wide-tables"]);

  // Re-share snippets: enabled already present, so no config rewrite
  const snippetReshare = await plugin.copySnippets(["wide-tables"], VAULT_B);
  eq("snippet re-share status exists", snippetReshare.results.map((item) => item.status), ["exists"]);
  eq("no config write when snippet already enabled", snippetReshare.config, null);

  // --- Broken JSON in target config ---------------------------------------
  writeFile(path.join(VAULT_B, ".obsidian", "community-plugins.json"), "{ this is not json");
  plugin.settings.enabledPluginIds = ["templater-obsidian"];
  const brokenShare = await plugin.copyPlugins(["templater-obsidian"], VAULT_B);
  eq(
    "broken JSON treated as empty",
    readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json")),
    ["templater-obsidian"]
  );
  check("broken JSON backed up", fs.existsSync(path.join(VAULT_B, ".obsidian", "community-plugins.json.bak")));
  eq(
    "broken JSON backup holds original",
    fs.readFileSync(path.join(VAULT_B, ".obsidian", "community-plugins.json.bak"), "utf8"),
    "{ this is not json"
  );
  check(
    "broken JSON warning reported",
    brokenShare.config.warnings.some((warning) => warning.includes("不是有效的 JSON")),
    JSON.stringify(brokenShare.config.warnings)
  );

  // --- Target folder that is not a vault ----------------------------------
  const nonVaultShare = await plugin.copyPlugins(["dataview"], VAULT_C);
  check("non-vault target reports isVault=false", nonVaultShare.target.isVault === false);
  check(
    "non-vault target gets .obsidian created",
    fs.existsSync(path.join(VAULT_C, ".obsidian", "plugins", "dataview", "manifest.json"))
  );

  // --- Errors --------------------------------------------------------------
  await expectThrows("rejects current vault as target", () => plugin.copyPlugins(["dataview"], VAULT_A), "不能是当前 Vault");
  await expectThrows("rejects empty target path", () => plugin.copyPlugins(["dataview"], "   "), "请输入目标");
  await expectThrows("rejects missing target", () => plugin.copyPlugins(["dataview"], path.join(WORK, "nope")), "不存在");
  await expectThrows("requires selected plugin", () => plugin.copyPlugins([], VAULT_B), "请至少选择一个插件");
  await expectThrows("requires selected theme", () => plugin.copyThemes([], VAULT_B), "请至少选择一个主题");
  await expectThrows("requires selected snippet", () => plugin.copySnippets([], VAULT_B), "请至少选择一个 CSS 片段");

  // --- Symlink mode (needs the OS privilege; skipped when unavailable) ----
  fs.rmSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview"), { recursive: true, force: true });
  plugin.settings.enabledPluginIds = [];
  const linkShare = await plugin.createLinks(["dataview"], VAULT_B);
  const linkPath = path.join(VAULT_B, ".obsidian", "plugins", "dataview");
  if (linkShare.results[0].status === "created" && fs.lstatSync(linkPath).isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(linkPath);
    check("symlink created", true);
    check(
      "symlink target is absolute",
      path.isAbsolute(linkTarget) && path.resolve(linkTarget) === path.resolve(VAULT_A, ".obsidian", "plugins", "dataview"),
      linkTarget
    );
  } else {
    console.log("SKIP symlink assertions (status=" + linkShare.results[0].status + " message=" + linkShare.results[0].message + ")");
  }

  // --- Link health: scan / pair / rebuild / delete + config cleanup --------
  const VAULT_D = path.join(WORK, "vault-d");
  rmrf(VAULT_D);
  fs.mkdirSync(path.join(VAULT_D, ".obsidian", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(VAULT_D, ".obsidian", "themes"), { recursive: true });
  fs.mkdirSync(path.join(VAULT_D, ".obsidian", "snippets"), { recursive: true });
  writeJson(path.join(VAULT_D, ".obsidian", "community-plugins.json"), [
    "other-plugin",
    "gone-plugin",
    "ghost-unreachable",
  ]);
  writeJson(path.join(VAULT_D, ".obsidian", "appearance.json"), {
    cssTheme: "Ghost Theme",
    enabledCssSnippets: ["ghost", "other-snippet"],
  });

  const goneDir = path.join(WORK, "gone-source");
  fs.mkdirSync(goneDir, { recursive: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  let linksAvailable = true;
  const makeLink = (targetPath, linkPath) => {
    try {
      fs.symlinkSync(targetPath, linkPath, linkType);
      return true;
    } catch (error) {
      linksAvailable = false;
      console.log("SKIP link health fixture (" + error.code + ")");
      return false;
    }
  };

  makeLink(path.join(VAULT_A, ".obsidian", "plugins", "dataview"), path.join(VAULT_D, ".obsidian", "plugins", "dataview"));
  makeLink(goneDir, path.join(VAULT_D, ".obsidian", "plugins", "templater-obsidian"));
  makeLink(goneDir, path.join(VAULT_D, ".obsidian", "plugins", "gone-plugin"));
  makeLink(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz"), path.join(VAULT_D, ".obsidian", "themes", "Blue Topaz"));
  makeLink(goneDir, path.join(VAULT_D, ".obsidian", "themes", "Ghost Theme"));
  makeLink(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz"), path.join(VAULT_D, ".obsidian", "themes", "legacy"));
  makeLink(goneDir, path.join(VAULT_D, ".obsidian", "snippets", "ghost.css"));
  fs.rmSync(goneDir, { recursive: true, force: true });

  writeJson(path.join(VAULT_D, ".obsidian", "plugins", "copied-plugin", "manifest.json"), {
    id: "copied-plugin",
    name: "Copied Plugin",
    version: "1.0.0",
  });
  writeFile(path.join(VAULT_D, ".obsidian", "snippets", "other-snippet.css"), ".other {}");

  let unreachableLinkCreated = false;
  if (process.platform === "win32" && linksAvailable) {
    const letters = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const freeLetter = letters.find((letter) => !fs.existsSync(letter + ":\\"));
    if (freeLetter) {
      try {
        fs.symlinkSync(freeLetter + ":\\nope\\plugins\\ghost", path.join(VAULT_D, ".obsidian", "plugins", "ghost-unreachable"), "junction");
        unreachableLinkCreated = true;
      } catch (error) {
        console.log("SKIP unreachable fixture (" + error.code + ")");
      }
    }
  }

  if (linksAvailable) {
    plugin.settings.targetVaultPath = VAULT_D;
    const scan = await plugin.scanTargetVault(VAULT_D);
    const statusOf = (kind, name) => {
      const entry = scan.kinds[kind].find((item) => item.name === name);
      return entry ? entry.status : "missing";
    };

    eq("scan: healthy plugin link", statusOf("plugins", "dataview"), "healthy");
    eq("scan: broken plugin link", statusOf("plugins", "templater-obsidian"), "broken");
    eq("scan: broken link without source", statusOf("plugins", "gone-plugin"), "broken");
    eq("scan: healthy theme link", statusOf("themes", "Blue Topaz"), "healthy");
    eq("scan: broken theme link", statusOf("themes", "Ghost Theme"), "broken");
    eq("scan: broken snippet link", statusOf("snippets", "ghost.css"), "broken");
    eq("scan: physical copy detected", statusOf("plugins", "copied-plugin"), "copy");
    if (unreachableLinkCreated) {
      eq("scan: unreachable link classified separately", statusOf("plugins", "ghost-unreachable"), "unreachable");
      eq("scan: unreachable not counted as broken", scan.summary.unreachable, 1);
    }
    eq("scan: broken count", scan.summary.broken, 4);
    eq("scan: link count", scan.summary.totalLinks, unreachableLinkCreated ? 8 : 7);
    eq("scan: copy count", scan.summary.copies, 2);

    // Pairing + right-column state description
    const T = Ctor.__test;
    const pluginSourceRows = (await plugin.listPlugins()).map((item) => ({ name: item.folderName, source: item }));
    const pluginRows = T.mergeDiffRows("plugins", pluginSourceRows, scan.kinds.plugins);
    check(
      "merge keeps target-only rows",
      pluginRows.some((row) => row.name === "copied-plugin" && !row.source),
      JSON.stringify(pluginRows.map((row) => row.name))
    );
    eq("describe: linked", T.describeTargetRow(pluginRows.find((row) => row.name === "dataview")).key, "linked");
    eq(
      "describe: target-only copy",
      T.describeTargetRow(pluginRows.find((row) => row.name === "copied-plugin")).key,
      "copy"
    );
    const themeSourceRows = (await plugin.listThemes()).map((item) => ({ name: item.folderName, source: item }));
    const themeRows = T.mergeDiffRows("themes", themeSourceRows, scan.kinds.themes);
    eq(
      "describe: healthy link pointing elsewhere is a conflict",
      T.describeTargetRow(themeRows.find((row) => row.name === "legacy")).key,
      "conflict"
    );
    const snippetSourceRows = (await plugin.listSnippets()).map((item) => ({ name: item.fileName, source: item }));
    const snippetRows = T.mergeDiffRows("snippets", snippetSourceRows, scan.kinds.snippets);
    eq(
      "describe: source row without target is unshared",
      T.describeTargetRow(snippetRows.find((row) => row.name === "wide-tables.css")).key,
      "unshared"
    );

    // Rebuild a broken link that has a same-named source
    const rebuilt = await plugin.rebuildTargetLink("plugins", "templater-obsidian", VAULT_D);
    eq("rebuild status", rebuilt.status, "rebuilt");
    const rebuiltTarget = fs.readlinkSync(path.join(VAULT_D, ".obsidian", "plugins", "templater-obsidian"));
    check(
      "rebuild points at the current vault copy",
      path.resolve(rebuiltTarget) === path.resolve(VAULT_A, ".obsidian", "plugins", "templater-obsidian"),
      rebuiltTarget
    );

    await expectThrows(
      "rebuild without a same-named source is rejected",
      () => plugin.rebuildTargetLink("plugins", "gone-plugin", VAULT_D),
      "没有同名资源"
    );
    await expectThrows(
      "rebuild on a non-link is rejected",
      () => T.rebuildLink(
        path.join(VAULT_D, ".obsidian", "plugins", "copied-plugin"),
        path.join(VAULT_A, ".obsidian", "plugins", "dataview"),
        "dir",
        plugin.t.bind(plugin),
        () => {}
      ).then((outcome) => {
        if (outcome.status !== "rebuilt") throw new Error(outcome.message);
      }),
      "已经不是链接"
    );

    await expectThrows(
      "rebuild on a healthy link is rejected",
      () => plugin.rebuildTargetLink("plugins", "dataview", VAULT_D),
      "有效目标"
    );
    await expectThrows(
      "deleting a healthy link is rejected",
      () => plugin.deleteTargetLink("plugins", "dataview", VAULT_D),
      "有效目标"
    );

    // Delete a broken link with no source, cleaning the target config
    const deleted = await plugin.deleteTargetLink("plugins", "gone-plugin", VAULT_D);
    check("delete removes the link", !fs.existsSync(path.join(VAULT_D, ".obsidian", "plugins", "gone-plugin")));
    eq("delete reports removed plugin ids", deleted.config.pluginsRemoved, ["gone-plugin"]);
    eq(
      "delete cleans community-plugins.json only for the removed id",
      readJson(path.join(VAULT_D, ".obsidian", "community-plugins.json")),
      ["other-plugin", "ghost-unreachable"]
    );
    check(
      "delete backs up community-plugins.json",
      fs.existsSync(path.join(VAULT_D, ".obsidian", "community-plugins.json.bak"))
    );

    // Delete the broken theme link: cssTheme follows
    const deletedTheme = await plugin.deleteTargetLink("themes", "Ghost Theme", VAULT_D);
    eq("delete reports the cleared theme", deletedTheme.config.themeCleared, "Ghost Theme");
    const appearanceAfterTheme = readJson(path.join(VAULT_D, ".obsidian", "appearance.json"));
    check("cssTheme cleared", appearanceAfterTheme.cssTheme === undefined, JSON.stringify(appearanceAfterTheme));
    eq("other appearance fields untouched", appearanceAfterTheme.enabledCssSnippets, ["ghost", "other-snippet"]);

    // Delete the broken snippet link: enabledCssSnippets follows
    const deletedSnippet = await plugin.deleteTargetLink("snippets", "ghost.css", VAULT_D);
    eq("delete reports removed snippet names", deletedSnippet.config.snippetsRemoved, ["ghost"]);
    eq(
      "delete cleans enabledCssSnippets only for the removed name",
      readJson(path.join(VAULT_D, ".obsidian", "appearance.json")).enabledCssSnippets,
      ["other-snippet"]
    );

    // Unreachable links stay untouched by design (UI disables the actions)
    if (unreachableLinkCreated) {
      check(
        "unreachable link survives scan",
        !!fs.lstatSync(path.join(VAULT_D, ".obsidian", "plugins", "ghost-unreachable")).isSymbolicLink()
      );
    }
  }

  // --- Known vault registry list (shape only; machine independent) ---------
  plugin.settings.targetVaultPath = VAULT_B;
  const known = await plugin.listKnownVaults();
  check("listKnownVaults returns a vault list", Array.isArray(known.vaults) && typeof known.ok === "boolean");
  check(
    "listKnownVaults pins the saved path first",
    known.vaults.length > 0 && path.resolve(known.vaults[0].path) === path.resolve(VAULT_B),
    JSON.stringify(known.vaults.slice(0, 2))
  );

  await expectThrows(
    "browseTargetVault reports a missing Electron dialog",
    () => plugin.browseTargetVault(),
    "不支持系统文件夹对话框"
  );

  const zhKeys = Object.keys(Ctor.__test.TEXT.zh).sort();
  const enKeys = Object.keys(Ctor.__test.TEXT.en).sort();
  check("zh/en text key sets are identical", JSON.stringify(zhKeys) === JSON.stringify(enKeys));

  // --- Quick sanity on the exported class ---------------------------------
  check("plugin is an instance of the stubbed Plugin", plugin instanceof require("obsidian").Plugin);

  console.log("\n" + (checks - failures) + "/" + checks + " checks passed");
  if (failures > 0) {
    console.log(failures + " FAILED");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("TEST CRASH", error);
  process.exit(2);
});

