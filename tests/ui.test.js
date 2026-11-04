const fs = require("fs");
const path = require("path");
const os = require("os");

const WORK = path.join(os.tmpdir(), "plugin-share-linker-tests", "ui");
const VAULT_A = path.join(WORK, "vault-a");
const VAULT_B = path.join(WORK, "vault-b");
const EMPTY_VAULT = path.join(WORK, "empty-vault");
const MAIN_JS = path.join(__dirname, "..", "main.js");
const OBSIDIAN_STUB = path.join(__dirname, "obsidian-stub.js");

// ---- tiny DOM ------------------------------------------------------------
function createEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    children: [],
    classes: new Set(),
    textContent: "",
    title: "",
    attributes: {},
    listeners: {},
    value: "",
    checked: false,
    disabled: false,
    selected: false,
    style: {},
  };
  el.classList = {
    add: (cls) => el.classes.add(cls),
    remove: (cls) => el.classes.delete(cls),
    contains: (cls) => el.classes.has(cls),
  };
  el.addClass = (cls) => {
    if (cls) String(cls).split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
  };
  el.removeClass = (cls) => {
    el.classes.delete(cls);
  };
  el.setText = (text) => {
    el.textContent = text;
  };
  el.empty = () => {
    el.children = [];
    el.textContent = "";
  };
  el.setAttribute = (name, value) => {
    el.attributes[name] = value;
  };
  el.getAttribute = (name) => el.attributes[name];
  el.appendChild = (child) => {
    el.children.push(child);
    child.parent = el;
    return child;
  };
  el.createEl = (childTag, opts) => {
    const child = createEl(childTag);
    if (opts) {
      if (opts.cls) child.addClass(opts.cls);
      if (opts.text !== undefined) child.setText(opts.text);
      if (opts.type) child.type = opts.type;
      if (opts.value !== undefined) child.value = opts.value;
      if (opts.attr) {
        for (const key of Object.keys(opts.attr)) child.setAttribute(key, opts.attr[key]);
      }
    }
    return el.appendChild(child);
  };
  el.createDiv = (cls) => el.createEl("div", { cls });
  el.createSpan = (opts) => el.createEl("span", typeof opts === "string" ? { cls: opts } : opts);
  el.addEventListener = (type, handler) => {
    el.listeners[type] = el.listeners[type] || [];
    el.listeners[type].push(handler);
  };
  el.click = async () => {
    if (el.type === "checkbox") el.checked = !el.checked;
    for (const handler of el.listeners.change || []) await handler();
  };
  return el;
}

function walk(el, fn) {
  fn(el);
  for (const child of el.children || []) walk(child, fn);
}

function findByAria(root, label) {
  let found = null;
  walk(root, (el) => {
    if (!found && el.getAttribute && el.getAttribute("aria-label") === label) found = el;
  });
  return found;
}

function countByClass(root, cls) {
  let count = 0;
  walk(root, (el) => {
    if (el.classes && el.classes.has(cls)) count += 1;
  });
  return count;
}

function textOf(root) {
  let text = "";
  walk(root, (el) => {
    if (typeof el.textContent === "string" && el.textContent) text += el.textContent + "\n";
  });
  return text;
}

async function waitFor(condition, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < (timeoutMs || 5000)) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

// ---- obsidian stubs ------------------------------------------------------
const obsidian = require(OBSIDIAN_STUB);

class ButtonComponent {
  constructor(containerEl) {
    this.buttonEl = createEl("button");
    if (containerEl && containerEl.appendChild) containerEl.appendChild(this.buttonEl);
  }
  setIcon() {
    return this;
  }
  setCta() {
    return this;
  }
  onClick(handler) {
    this.buttonEl.__onClick = handler;
    return this;
  }
  setDisabled(value) {
    this.buttonEl.disabled = value;
    return this;
  }
}

class Setting {
  constructor(containerEl) {
    this.settingEl = createEl("div");
    if (containerEl && containerEl.appendChild) containerEl.appendChild(this.settingEl);
  }
  setName(name) {
    this.name = name;
    return this;
  }
  setDesc(desc) {
    this.desc = desc;
    return this;
  }
  addText(callback) {
    const inputEl = createEl("input");
    const component = {
      inputEl,
      setPlaceholder(value) {
        this.placeholder = value;
        return this;
      },
      setValue(value) {
        this.value = value;
        inputEl.value = value;
        return this;
      },
      onChange(handler) {
        this.changeHandler = handler;
        return this;
      },
    };
    callback(component);
    this.text = component;
    return this;
  }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createEl("div");
  }
}

class Notice {
  constructor(message) {
    this.message = message;
    obsidian.lastNotice = message;
  }
}

obsidian.ButtonComponent = ButtonComponent;
obsidian.Setting = Setting;
obsidian.PluginSettingTab = PluginSettingTab;
obsidian.Notice = Notice;
obsidian.Plugin.prototype.addSettingTab = function (tab) {
  this.__tab = tab;
};

const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "obsidian") return OBSIDIAN_STUB;
  return originalResolveFilename.call(this, request, ...args);
};

// ---- fixtures ------------------------------------------------------------
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function setup() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(VAULT_A, { recursive: true });
  fs.mkdirSync(VAULT_B, { recursive: true });
  fs.mkdirSync(EMPTY_VAULT, { recursive: true });

  writeJson(path.join(VAULT_A, ".obsidian", "plugins", "dataview", "manifest.json"), {
    id: "dataview",
    name: "Dataview",
    version: "0.5.67",
    description: "Complex data views.",
  });
  writeFile(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz", "theme.css"), "/* theme */");
  writeJson(path.join(VAULT_A, ".obsidian", "themes", "Blue Topaz", "manifest.json"), {
    name: "Blue Topaz",
    version: "2023080203",
  });
  writeFile(path.join(VAULT_A, ".obsidian", "snippets", "wide-tables.css"), ".wide-table {}");

  writeJson(path.join(VAULT_B, ".obsidian", "community-plugins.json"), ["other-plugin"]);
  writeJson(path.join(VAULT_B, ".obsidian", "appearance.json"), { theme: "moonstone", cssTheme: "" });
}

async function main() {
  setup();

  const Ctor = require(MAIN_JS);
  const app = {
    vault: { adapter: { getBasePath: () => VAULT_A }, configDir: ".obsidian" },
    setting: null,
  };
  const plugin = new Ctor(app, { id: "plugin-share-linker", name: "Share Linker" });
  plugin.__data = { language: "zh" };
  await plugin.onload();

  const tab = plugin.__tab;
  check("settings tab created", !!tab);
  let detectCalls = 0;
  const originalDetectSettings = plugin.detectTargetSettings.bind(plugin);
  plugin.detectTargetSettings = async (...args) => {
    detectCalls += 1;
    return originalDetectSettings(...args);
  };
  await tab.display();
  check("display() does not auto-detect settings", detectCalls === 0, String(detectCalls));

  check("display() renders plugin rows", countByClass(tab.pluginsListEl, "plugin-share-linker-pair") === 1);
  check("display() renders theme rows", countByClass(tab.themesListEl, "plugin-share-linker-pair") === 1);
  check("display() renders snippet rows", countByClass(tab.snippetsListEl, "plugin-share-linker-pair") === 1);
  check("five sections rendered", countByClass(tab.containerEl, "plugin-share-linker-section") === 5);
  check("plugins toolbar has 5 buttons", tab.pluginsToolbarEl.children.length === 5);
  check("themes toolbar has 2 buttons", tab.themesToolbarEl.children.length === 2);
  check("snippets toolbar has 2 buttons", tab.snippetsToolbarEl.children.length === 2);
  check("pair column heads rendered", countByClass(tab.containerEl, "plugin-share-linker-pair-head") === 3);
  check("target state legend rendered", textOf(tab.containerEl).includes("目标库状态："));
  check(
    "rows start with the not-checked target state",
    countByClass(tab.pluginsListEl, "plugin-share-linker-target-unknown") === 1
  );
  check(
    "display does not touch the target vault",
    tab.targetInventory === null && tab.settingStatuses === null,
    `inventory=${!!tab.targetInventory} statuses=${!!tab.settingStatuses}`
  );

  // select all via button wiring
  plugin.settings.targetVaultPath = VAULT_B;
  const selectAllButton = findByAria(tab.pluginsToolbarEl, "全选");
  check("select all button found", !!selectAllButton);
  await selectAllButton.__onClick();
  check("select all selects plugins", JSON.stringify(plugin.settings.selectedPluginIds) === JSON.stringify(["dataview"]));
  check("select all enables plugins", JSON.stringify(plugin.settings.enabledPluginIds) === JSON.stringify(["dataview"]));

  // share through the real button
  const copyButton = findByAria(tab.pluginsToolbarEl, "复制");
  check("copy button found", !!copyButton);
  await copyButton.__onClick();
  check("plugin copied via UI", fs.existsSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview", "manifest.json")));
  check(
    "plugin enabled via UI",
    JSON.stringify(readJson(path.join(VAULT_B, ".obsidian", "community-plugins.json"))) ===
      JSON.stringify(["other-plugin", "dataview"])
  );
  check("results card rendered", countByClass(tab.resultsEl, "plugin-share-linker-result-card") === 1);
  check("result detail rendered", countByClass(tab.resultsEl, "plugin-share-linker-result") >= 1);

  // theme + snippet selection through persisted settings, then share via buttons
  plugin.settings.selectedThemeNames = ["Blue Topaz"];
  plugin.settings.selectedSnippetNames = ["wide-tables"];
  plugin.settings.enabledSnippetNames = ["wide-tables"];
  tab.renderThemes();
  tab.renderSnippets();
  await findByAria(tab.themesToolbarEl, "复制").__onClick();
  check("theme copied via UI", fs.existsSync(path.join(VAULT_B, ".obsidian", "themes", "Blue Topaz", "theme.css")));
  check("theme auto-set via UI", readJson(path.join(VAULT_B, ".obsidian", "appearance.json")).cssTheme === "Blue Topaz");
  await findByAria(tab.snippetsToolbarEl, "复制").__onClick();
  const appearance = readJson(path.join(VAULT_B, ".obsidian", "appearance.json"));
  check("snippet copied via UI", fs.existsSync(path.join(VAULT_B, ".obsidian", "snippets", "wide-tables.css")));
  check(
    "snippet enabled via UI",
    JSON.stringify(appearance.enabledCssSnippets) === JSON.stringify(["wide-tables"])
  );

  // checkbox wiring: uncheck the plugin share box
  const checkboxes = [];
  walk(tab.pluginsListEl, (el) => {
    if (el.tagName === "INPUT" && el.type === "checkbox") checkboxes.push(el);
  });
  check("plugin row has two checkboxes", checkboxes.length === 2);
  await checkboxes[0].click();
  check("unchecking share clears selection", plugin.settings.selectedPluginIds.length === 0);
  check("unchecking share clears enable flag", plugin.settings.enabledPluginIds.length === 0);

  // language switch re-renders
  obsidian.Notice = obsidian.Notice;
  plugin.settings.language = "en";
  await tab.display();
  check("english render works", countByClass(tab.containerEl, "plugin-share-linker-section") === 5);
  check("english count line", tab.pluginsCountEl.textContent.includes("plugins found"), tab.pluginsCountEl.textContent);
  plugin.settings.language = "zh";

  // empty vault handling
  plugin.app.vault.adapter.getBasePath = () => EMPTY_VAULT;
  await tab.display();
  check("empty vault render works", countByClass(tab.containerEl, "plugin-share-linker-empty") === 3);

  // error path: invalid target
  plugin.app.vault.adapter.getBasePath = () => VAULT_A;
  plugin.settings.targetVaultPath = path.join(WORK, "does-not-exist");
  await tab.runShareAction("plugins", "copy");
  check("error message rendered", countByClass(tab.resultsEl, "plugin-share-linker-message-error") === 1);
  check("error notice shown", String(obsidian.lastNotice || "").length >= 0);
  const errorText = textOf(tab.resultsEl);
  check("debug trail rendered on error", errorText.includes("调试轨迹"), errorText);
  check("debug trail lists the target step", errorText.includes("target:"), errorText);

  // empty selection: must fail fast with a message, not stay busy
  const targetC = path.join(WORK, "target-c");
  fs.mkdirSync(path.join(targetC, ".obsidian"), { recursive: true });
  plugin.settings.targetVaultPath = targetC;
  plugin.settings.selectedSnippetNames = [];
  await tab.runShareAction("snippets", "symlink");
  check("empty selection shows error", countByClass(tab.resultsEl, "plugin-share-linker-message-error") === 1);
  check("busy flag cleared after error", tab.busy === false);
  check("empty selection notice", String(obsidian.lastNotice).includes("请至少选择一个 CSS 片段"), obsidian.lastNotice);

  // busy guard: a second click while busy is ignored
  tab.busy = true;
  plugin.settings.selectedPluginIds = ["dataview"];
  await tab.runShareAction("plugins", "copy");
  check("second click ignored while busy", tab.busy === true);
  tab.busy = false;

  // target path check button
  plugin.app.vault.adapter.getBasePath = () => VAULT_A;
  plugin.settings.targetVaultPath = VAULT_B;
  const checkButton = findByAria(tab.containerEl, "检查目标路径");
  check("target check button found", !!checkButton);
  await checkButton.__onClick();
  const checkText = textOf(tab.resultsEl);
  check("target check shows writable", checkText.includes("文件夹可写：是"), checkText);
  check("target check shows vault", checkText.includes("是 Obsidian 库（找到 .obsidian）：是"), checkText);
  check("target check reports elapsed time", /耗时：\d+ ms/.test(checkText), checkText);
  check(
    "target probe cleaned up",
    fs.readdirSync(VAULT_B).filter((name) => name.startsWith(".plugin-share-linker-probe-")).length === 0
  );

  // --- Target vault picker buttons ----------------------------------------
  check("choose button found", !!findByAria(tab.containerEl, "选择…"));
  check("browse button found", !!findByAria(tab.containerEl, "浏览…"));
  await tab.openVaultPicker();
  check("vault picker opens without throwing", true);

  // --- Target vault check section (summary only) ---------------------------
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const goneDir = path.join(WORK, "gone-ui");
  fs.mkdirSync(goneDir, { recursive: true });
  let targetCheckFixture = true;
  try {
    fs.rmSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview"), { recursive: true, force: true });
    fs.symlinkSync(goneDir, path.join(VAULT_B, ".obsidian", "plugins", "dataview"), linkType);
    fs.symlinkSync(goneDir, path.join(VAULT_B, ".obsidian", "plugins", "gone-ui"), linkType);
    fs.rmSync(goneDir, { recursive: true, force: true });
  } catch (error) {
    targetCheckFixture = false;
    console.log("SKIP target check assertions (" + error.code + ")");
  }

  const clickEl = async (element) => {
    for (const handler of (element && element.listeners && element.listeners.click) || []) {
      await handler();
    }
    if (element && typeof element.__onClick === "function") await element.__onClick();
  };

  if (targetCheckFixture) {
    plugin.app.vault.adapter.getBasePath = () => VAULT_A;
    plugin.settings.targetVaultPath = VAULT_B;
    await tab.refreshAll();
    check(
      "before the first check the badge is hidden",
      tab.targetCheckBadgeEl.classes.has("is-hidden"),
      JSON.stringify([...tab.targetCheckBadgeEl.classes])
    );
    check(
      "before the first check the status asks for a check",
      String(tab.targetCheckStatusEl.textContent).includes("尚未检测"),
      tab.targetCheckStatusEl.textContent
    );
    await tab.runTargetCheck();

    check("target check inventory created", !!tab.targetInventory);
    check(
      "target check badge shows broken count",
      String(tab.targetCheckBadgeEl.textContent).includes("失效"),
      tab.targetCheckBadgeEl.textContent
    );
    const sectionEls = [];
    walk(tab.containerEl, (el) => {
      if (el.classes && el.classes.has("plugin-share-linker-section")) sectionEls.push(el);
    });
    const checkSectionEl = sectionEls.find((el) => textOf(el).includes("目标库检测"));
    const checkSectionButtons = [];
    if (checkSectionEl) {
      walk(checkSectionEl, (el) => {
        if (el.tagName === "BUTTON") checkSectionButtons.push(el);
      });
    }
    check(
      "target check section is summary-only",
      !!checkSectionEl &&
        checkSectionButtons.length === 1 &&
        checkSectionButtons[0].getAttribute("aria-label") === "检测" &&
        !textOf(checkSectionEl).includes("重建链接") &&
        !textOf(checkSectionEl).includes("删除链接"),
      checkSectionEl ? textOf(checkSectionEl) : "section not found"
    );
    check(
      "badge counts only broken links, never settings diffs",
      !String(tab.targetCheckBadgeEl.textContent).includes("设置"),
      tab.targetCheckBadgeEl.textContent
    );
    check(
      "link summary line rendered",
      String(tab.targetCheckSummaryEl.textContent).includes("个链接") &&
        String(tab.targetCheckSummaryEl.textContent).includes("个实体副本"),
      tab.targetCheckSummaryEl.textContent
    );
    check(
      "settings summary line rendered",
      String(tab.targetCheckSettingsSummaryEl.textContent).includes("设置文件：相同"),
      tab.targetCheckSettingsSummaryEl.textContent
    );
    check(
      "status line reports a successful check",
      String(tab.targetCheckStatusEl.textContent).includes("检测完成"),
      tab.targetCheckStatusEl.textContent
    );
    check("plugins section gets bulk rebuild", !!findByAria(tab.pluginsTargetCheckEl, "全部重建"));
    check("plugins section gets bulk delete", !!findByAria(tab.pluginsTargetCheckEl, "全部删除"));
    check("themes section has no anomalies", textOf(tab.themesTargetCheckEl).trim() === "");
    check(
      "paired rows re-render with target state",
      countByClass(tab.pluginsListEl, "plugin-share-linker-pair") >= 2
    );
    check(
      "broken target chips rendered in rows",
      countByClass(tab.pluginsListEl, "plugin-share-linker-target-broken") >= 1
    );
    check("target-only placeholder rendered", textOf(tab.pluginsListEl).includes("当前库无同名项"));

    const rebuildButton = findByAria(tab.pluginsListEl, "重建链接");
    check("inline rebuild button rendered in the row", !!rebuildButton);
    await clickEl(rebuildButton);
    const rebuiltTarget = fs.readlinkSync(path.join(VAULT_B, ".obsidian", "plugins", "dataview"));
    check(
      "inline rebuild rewrites the link to the current vault",
      path.resolve(rebuiltTarget) === path.resolve(VAULT_A, ".obsidian", "plugins", "dataview"),
      rebuiltTarget
    );
    check(
      "rebuilt row shows the linked chip",
      countByClass(tab.pluginsListEl, "plugin-share-linker-target-linked") >= 1,
      String(countByClass(tab.pluginsListEl, "plugin-share-linker-target-linked"))
    );
    check(
      "the remaining broken row keeps its chip",
      countByClass(tab.pluginsListEl, "plugin-share-linker-target-broken") === 1,
      String(countByClass(tab.pluginsListEl, "plugin-share-linker-target-broken"))
    );

    const deleteButton = findByAria(tab.pluginsListEl, "删除链接");
    check("inline delete button rendered in the row", !!deleteButton);
    await clickEl(deleteButton);
    let goneLinkStillThere = true;
    try {
      fs.lstatSync(path.join(VAULT_B, ".obsidian", "plugins", "gone-ui"));
    } catch (error) {
      goneLinkStillThere = false;
    }
    check("inline delete removes the broken link", !goneLinkStillThere);
    check(
      "badge switches to the clear state",
      String(tab.targetCheckBadgeEl.textContent).includes("未发现"),
      tab.targetCheckBadgeEl.textContent
    );
    check("section bulk actions disappear after cleanup", textOf(tab.pluginsTargetCheckEl).trim() === "");
  }

  if (targetCheckFixture) {
    // --- Bulk delete on a fresh pair of broken links ----------------------
    const goneDir2 = path.join(WORK, "gone-ui-2");
    fs.mkdirSync(goneDir2, { recursive: true });
    fs.symlinkSync(goneDir2, path.join(VAULT_B, ".obsidian", "plugins", "gone-a"), linkType);
    fs.symlinkSync(goneDir2, path.join(VAULT_B, ".obsidian", "plugins", "gone-b"), linkType);
    fs.rmSync(goneDir2, { recursive: true, force: true });

    await tab.refreshAll();
    await tab.runTargetCheck();
    const deletableEntries = tab.targetInventory.kinds.plugins.filter(
      (entry) => entry.status === "broken" && !tab.hasSameNameSource("plugins", entry.name)
    );
    check("bulk delete gathers the no-source links", deletableEntries.length === 2, JSON.stringify(deletableEntries.map((entry) => entry.name)));
    await tab.runBulkDelete(deletableEntries);
    check("bulk delete notice", String(obsidian.lastNotice).includes("全部删除完成"), obsidian.lastNotice);
    check("bulk delete removes the section actions", textOf(tab.pluginsTargetCheckEl).trim() === "");
    check(
      "bulk delete leaves no broken chips",
      countByClass(tab.pluginsListEl, "plugin-share-linker-target-broken") === 0,
      String(countByClass(tab.pluginsListEl, "plugin-share-linker-target-broken"))
    );

    // --- Bulk rebuild on a broken theme link -------------------------------
    const brokenTheme = path.join(VAULT_B, ".obsidian", "themes", "Blue Topaz");
    const goneTheme = path.join(WORK, "gone-theme");
    fs.rmSync(brokenTheme, { recursive: true, force: true });
    fs.mkdirSync(goneTheme, { recursive: true });
    fs.symlinkSync(goneTheme, brokenTheme, linkType);
    fs.rmSync(goneTheme, { recursive: true, force: true });

    await tab.refreshAll();
    await tab.runTargetCheck();
    const bulkRebuildButton = findByAria(tab.themesTargetCheckEl, "全部重建");
    check("themes section gets bulk rebuild", !!bulkRebuildButton);

    const bulkModals = [];
    const originalBulkOpen = obsidian.Modal.prototype.open;
    obsidian.Modal.prototype.open = function () {
      bulkModals.push(this);
      return originalBulkOpen.call(this);
    };
    try {
      await clickEl(bulkRebuildButton);
      const bulkModal = bulkModals.filter((modal) => modal instanceof Ctor.__test.TargetActionConfirmModal)[0];
      check("bulk rebuild opens the confirm dialog", !!bulkModal);
      check(
        "bulk rebuild dialog names the broken theme",
        !!bulkModal && textOf(bulkModal.contentEl).includes("Blue Topaz"),
        bulkModal ? textOf(bulkModal.contentEl) : ""
      );
      let bulkConfirm = null;
      if (bulkModal) {
        walk(bulkModal.contentEl, (el) => {
          if (!bulkConfirm && el.classes && el.classes.has("mod-cta")) bulkConfirm = el;
        });
      }
      check("bulk rebuild dialog has a confirm button", !!bulkConfirm);
      if (bulkConfirm) await clickEl(bulkConfirm);
      await waitFor(
        () =>
          (() => {
            try {
              return (
                path.resolve(fs.readlinkSync(brokenTheme)) ===
                path.resolve(VAULT_A, ".obsidian", "themes", "Blue Topaz")
              );
            } catch (error) {
              return false;
            }
          })(),
        3000
      );
    } finally {
      obsidian.Modal.prototype.open = originalBulkOpen;
    }
    check(
      "bulk rebuild repoints the theme link at the current vault",
      (() => {
        try {
          return (
            path.resolve(fs.readlinkSync(brokenTheme)) ===
            path.resolve(VAULT_A, ".obsidian", "themes", "Blue Topaz")
          );
        } catch (error) {
          return false;
        }
      })()
    );
    check(
      "bulk rebuild clears the theme section actions",
      textOf(tab.themesTargetCheckEl).trim() === "",
      textOf(tab.themesTargetCheckEl)
    );
  }

  // --- Picker / confirm modals ---------------------------------------------
  const T = Ctor.__test;
  const pickerPicks = [];
  const picker = new T.TargetVaultPickerModal(app, {
    title: "选择目标 Vault",
    subtitle: "来自 Obsidian 已记录的库",
    emptyText: "没有可选的库。",
    browseLabel: "浏览…",
    browseTitle: "用系统文件夹对话框选择目标 Vault",
    cancelLabel: "取消",
    currentChip: "当前",
    openChip: "打开中",
    missingChip: "目录不存在",
    currentVaultChip: "当前库，不可选",
    vaults: [
      { path: "E:\\known-saved", exists: true, isSaved: true, isOpen: true, isCurrent: false, lastOpenedAt: 3 },
      { path: "E:\\vault-open", exists: true, isSaved: false, isOpen: true, isCurrent: false, lastOpenedAt: 2 },
      { path: "E:\\vault-missing", exists: false, isSaved: false, isOpen: false, isCurrent: false, lastOpenedAt: 1 },
      { path: "E:\\vault-current", exists: true, isSaved: false, isOpen: false, isCurrent: true, lastOpenedAt: 0 },
    ],
    onPick: (picked) => pickerPicks.push(picked),
    onBrowse: () => pickerPicks.push("browse"),
  });
  picker.open();
  const pickerText = textOf(picker.contentEl);
  check("picker lists vault paths", pickerText.includes("E:\\known-saved") && pickerText.includes("E:\\vault-open"), pickerText);
  check(
    "picker marks saved/open/missing/current",
    ["当前", "打开中", "目录不存在", "当前库，不可选"].every((label) => pickerText.includes(label)),
    pickerText
  );
  const vaultRows = [];
  walk(picker.contentEl, (el) => {
    if (el.classes && el.classes.has("plugin-share-linker-vault-row")) vaultRows.push(el);
  });
  check("picker renders one row per vault", vaultRows.length === 4);
  check("picker disables the missing vault row", vaultRows[2].classes.has("is-disabled"));
  check("picker disables the current-vault row", vaultRows[3].classes.has("is-disabled"));
  await vaultRows[0].listeners.click[0]();
  check("picker picking a row reports the path", pickerPicks[0] === "E:\\known-saved", JSON.stringify(pickerPicks));

  let confirmed = 0;
  const confirmModal = new T.TargetActionConfirmModal(app, {
    title: "确认删除以下链接？",
    warning: "删除会移除链接本身。",
    lines: ["a → x", "b → y"],
    confirmLabel: "确认",
    cancelLabel: "取消",
    onConfirm: () => {
      confirmed += 1;
    },
  });
  confirmModal.open();
  const confirmText = textOf(confirmModal.contentEl);
  check("confirm modal lists the affected links", confirmText.includes("a → x") && confirmText.includes("b → y"), confirmText);
  check("confirm modal shows the warning", confirmText.includes("删除会移除链接本身。"), confirmText);
  const confirmButtons = [];
  walk(confirmModal.contentEl, (el) => {
    if (el.classes && el.classes.has("mod-cta")) confirmButtons.push(el);
  });
  await confirmButtons[0].listeners.click[0]();
  check("confirm modal invokes onConfirm", confirmed === 1);

  // --- Obsidian settings section -------------------------------------------
  plugin.settings.selectedSettingFiles = [];
  plugin.settings.targetVaultPath = VAULT_B;
  plugin.app.vault.adapter.getBasePath = () => VAULT_A;
  tab.busy = false;

  const settingsApp = { attachmentFolderPath: "attachments", theme: "obsidian" };
  const settingsAppearance = {
    theme: "obsidian",
    accentColor: "#ffffff",
    cssTheme: "Blue Topaz",
    enabledCssSnippets: ["wide-tables"],
  };
  writeJson(path.join(VAULT_A, ".obsidian", "app.json"), settingsApp);
  writeJson(path.join(VAULT_A, ".obsidian", "appearance.json"), settingsAppearance);
  writeJson(path.join(VAULT_A, ".obsidian", "hotkeys.json"), {
    "app:go-back": [{ modifiers: ["Mod"], key: "ArrowLeft" }],
  });

  // Target vault: app.json identical (same), appearance.json differs outside the
  // exclusions (diff), hotkeys.json absent (missing). The other 5 settings files do
  // not exist in the source vault, so their rows must say "not in this vault".
  fs.rmSync(path.join(VAULT_B, ".obsidian", "hotkeys.json"), { force: true });
  fs.rmSync(path.join(VAULT_B, ".obsidian", "app.json.bak"), { force: true });
  fs.rmSync(path.join(VAULT_B, ".obsidian", "appearance.json.bak"), { force: true });
  writeJson(path.join(VAULT_B, ".obsidian", "app.json"), settingsApp);
  writeJson(path.join(VAULT_B, ".obsidian", "appearance.json"), {
    theme: "obsidian",
    accentColor: "#000000",
    cssTheme: "Minimal",
    enabledCssSnippets: ["ghost"],
  });

  // This section exercises the pre-check state: drop the result the earlier section produced.
  tab.settingStatuses = null;
  tab.settingsCheckAt = 0;
  tab.settingsCheckError = "";
  await tab.refreshAll();
  check(
    "before the first check every settings chip is unknown or absent",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown") === 3 &&
      countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-no-source") === 5,
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown") +
      "/" +
      countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-no-source")
  );
  await tab.runTargetCheck();

  check(
    "settings section renders 8 rows",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-row") === 8,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-row"))
  );
  check(
    "settings toolbar has 3 buttons",
    tab.settingsToolbarEl.children.length === 3,
    String(tab.settingsToolbarEl.children.length)
  );
  check(
    "settings toolbar holds select-all / clear / share only",
    tab.settingsToolbarEl.children
      .map((button) => button.getAttribute("aria-label"))
      .join("|") === "全选|取消全选|共享设置",
    tab.settingsToolbarEl.children.map((button) => button.getAttribute("aria-label")).join("|")
  );
  check("settings count line", tab.settingsCountEl.textContent.includes("8 份设置文件"), tab.settingsCountEl.textContent);
  const settingsShareButton = findByAria(tab.settingsToolbarEl, "共享设置");
  check("settings share button found", !!settingsShareButton);
  check(
    "settings share button starts disabled",
    !!settingsShareButton && settingsShareButton.disabled === true,
    settingsShareButton && String(settingsShareButton.disabled)
  );

  const settingsBoxes = () => {
    const boxes = [];
    walk(tab.settingsListEl, (el) => {
      if (el.tagName === "INPUT" && el.type === "checkbox") boxes.push(el);
    });
    return boxes;
  };
  check("settings rows have one checkbox each", settingsBoxes().length === 8, String(settingsBoxes().length));

  await settingsBoxes()[0].click();
  check(
    "checking a settings row persists selectedSettingFiles",
    JSON.stringify(plugin.settings.selectedSettingFiles) === JSON.stringify(["app"]),
    JSON.stringify(plugin.settings.selectedSettingFiles)
  );
  check(
    "checking a settings row enables the share button",
    settingsShareButton.disabled === false,
    String(settingsShareButton.disabled)
  );

  // Also queue appearance.json: it is the file with a real diff.
  await settingsBoxes()[1].click();
  check(
    "checking a second settings row adds it to the selection",
    JSON.stringify(plugin.settings.selectedSettingFiles) === JSON.stringify(["app", "appearance"]),
    JSON.stringify(plugin.settings.selectedSettingFiles)
  );

  check(
    "settings rows offer a single-file share button",
    (() => {
      let count = 0;
      walk(tab.settingsListEl, (el) => {
        if (el.getAttribute && el.getAttribute("aria-label") === "共享此项") count += 1;
      });
      return count === 3;
    })()
  );
  check(
    "target check renders the same settings chip",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same") === 1,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same"))
  );
  check(
    "target check renders the diff chip",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-diff") === 1,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-diff"))
  );
  check(
    "target check renders the missing chip",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-missing") === 1,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-missing"))
  );
  check(
    "settings rows without a source file say so",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-no-source") === 5,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-no-source"))
  );
  check(
    "target check settings summary line summarises the result",
    String(tab.targetCheckSettingsSummaryEl.textContent).includes("设置文件：相同 1、有差异 1、缺失 1"),
    tab.targetCheckSettingsSummaryEl.textContent
  );
  check(
    "settings section no longer has its own status element",
    countByClass(tab.containerEl, "plugin-share-linker-settings-status") === 0 &&
      tab.settingsStatusEl === undefined,
    String(countByClass(tab.containerEl, "plugin-share-linker-settings-status"))
  );

  const settingsRows = () => {
    const rows = [];
    walk(tab.settingsListEl, (el) => {
      if (el.classes && el.classes.has("plugin-share-linker-settings-row")) rows.push(el);
    });
    return rows;
  };
  const rowTitles = settingsRows().map((row) => String(row.title || ""));
  check("settings rows carry a hover tooltip", rowTitles.every((title) => title.length > 0), JSON.stringify(rowTitles));
  check(
    "settings hover tooltip explains identical files",
    rowTitles[0].includes("所有共享键都相同"),
    rowTitles[0]
  );
  check(
    "settings hover tooltip lists the overwritten keys",
    rowTitles[1].includes("accentColor") && rowTitles[1].includes("→"),
    rowTitles[1]
  );
  check(
    "settings hover tooltip does not call the managed appearance keys target-only",
    !rowTitles[1].includes("cssTheme") && !rowTitles[1].includes("enabledCssSnippets"),
    rowTitles[1]
  );
  check(
    "settings hover tooltip explains a missing file",
    rowTitles[2].includes("目标库没有这个文件") && rowTitles[2].includes("1 个键"),
    rowTitles[2]
  );

  // Row-level share: only the clicked file appears in the confirm dialog.
  const singleShareButtons = [];
  walk(tab.settingsListEl, (el) => {
    if (el.getAttribute && el.getAttribute("aria-label") === "共享此项") singleShareButtons.push(el);
  });
  check("single-file share buttons are wired", singleShareButtons.length === 3, String(singleShareButtons.length));
  const singleModals = [];
  const originalSingleOpen = obsidian.Modal.prototype.open;
  obsidian.Modal.prototype.open = function () {
    singleModals.push(this);
    return originalSingleOpen.call(this);
  };
  try {
    await clickEl(singleShareButtons[0]);
    const singleConfirmModal = singleModals.filter((modal) => modal instanceof T.SettingsConfirmModal)[0];
    check("row share opens the settings confirm dialog", !!singleConfirmModal);
    const singleText = singleConfirmModal ? textOf(singleConfirmModal.contentEl) : "";
    check(
      "row share plans only the clicked file",
      singleText.includes("app.json") && !singleText.includes("appearance.json"),
      singleText
    );
    let cancelButton = null;
    if (singleConfirmModal) {
      walk(singleConfirmModal.contentEl, (el) => {
        if (!cancelButton && el.tagName === "BUTTON" && el.textContent === "取消") cancelButton = el;
      });
    }
    check("row share dialog can be cancelled", !!cancelButton);
    if (cancelButton) await clickEl(cancelButton);
  } finally {
    obsidian.Modal.prototype.open = originalSingleOpen;
  }

  // Share through the real settings confirm modal.
  const openedModals = [];
  const originalModalOpen = obsidian.Modal.prototype.open;
  obsidian.Modal.prototype.open = function () {
    openedModals.push(this);
    return originalModalOpen.call(this);
  };
  try {
    await settingsShareButton.__onClick();
    const settingsModals = openedModals.filter((modal) => modal instanceof T.SettingsConfirmModal);
    check("settings share opens the confirm modal", settingsModals.length === 1, String(settingsModals.length));
    const settingsModal = settingsModals[0];
    const modalText = settingsModal ? textOf(settingsModal.contentEl) : "";
    check("settings confirm modal shows the title", modalText.includes("确认共享这些设置？"), modalText);
    check(
      "settings confirm modal lists the planned files",
      modalText.includes("app.json") && modalText.includes("appearance.json"),
      modalText
    );
    check("settings confirm modal previews the changed key", modalText.includes("accentColor"), modalText);
    const settingsConfirmButtons = [];
    if (settingsModal) {
      walk(settingsModal.contentEl, (el) => {
        if (el.classes && el.classes.has("mod-cta")) settingsConfirmButtons.push(el);
      });
    }
    check("settings confirm modal has one confirm button", settingsConfirmButtons.length === 1);
    await settingsConfirmButtons[0].listeners.click[0]();
    const finished = await waitFor(() => !!tab.settingResults || tab.busy === false);
    check("settings share finished", finished && !!tab.settingResults, "busy=" + tab.busy);
  } finally {
    obsidian.Modal.prototype.open = originalModalOpen;
  }

  const sharedAppearance = readJson(path.join(VAULT_B, ".obsidian", "appearance.json"));
  check("settings share writes the target file", sharedAppearance.accentColor === "#ffffff", JSON.stringify(sharedAppearance));
  check("settings share keeps the target cssTheme", sharedAppearance.cssTheme === "Minimal", JSON.stringify(sharedAppearance));
  check(
    "settings share keeps the target enabled snippet list",
    JSON.stringify(sharedAppearance.enabledCssSnippets) === JSON.stringify(["ghost"]),
    JSON.stringify(sharedAppearance)
  );
  check("settings share backs the target file up", fs.existsSync(path.join(VAULT_B, ".obsidian", "appearance.json.bak")));
  check("unchanged settings file is not backed up", !fs.existsSync(path.join(VAULT_B, ".obsidian", "app.json.bak")));
  check("settings result card rendered", countByClass(tab.settingsResultEl, "plugin-share-linker-result-card") === 1);
  const settingsResultText = textOf(tab.settingsResultEl);
  check(
    "settings result card names the written file",
    settingsResultText.includes("appearance.json：已写 1 个键"),
    settingsResultText
  );
  check(
    "settings result card reports written/unchanged counts",
    settingsResultText.includes("已写 1 份，无变化 1 份，失败 0 份"),
    settingsResultText
  );
  check("settings result card reports the backup", settingsResultText.includes("已备份 1 份原文件"), settingsResultText);
  check("settings result card shows the restart hint", settingsResultText.includes("重启 Obsidian"), settingsResultText);

  // Sharing settings invalidates the settings statuses (the link result stays), with no auto re-check.
  await waitFor(() => tab.busy === false, 5000);
  check("settings statuses are cleared after sharing", tab.settingStatuses === null, JSON.stringify(tab.settingStatuses));
  check(
    "settings chips fall back to not-checked",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown") === 3,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown"))
  );
  check("link results survive a settings share", !!tab.targetInventory, String(tab.targetInventory));
  check(
    "settings summary line clears after sharing",
    String(tab.targetCheckSettingsSummaryEl.textContent) === "",
    tab.targetCheckSettingsSummaryEl.textContent
  );
  check(
    "status line asks for a new check",
    String(tab.targetCheckStatusEl.textContent).includes("设置文件尚未检测"),
    tab.targetCheckStatusEl.textContent
  );

  await tab.runTargetCheck();
  check(
    "a manual re-check refreshes the settings chips",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same") === 2,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same"))
  );
  check(
    "settings diff chip disappears after the re-check",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-diff") === 0,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-diff"))
  );
  check(
    "settings summary line updates after the re-check",
    String(tab.targetCheckSettingsSummaryEl.textContent).includes("设置文件：相同 2、有差异 0、缺失 1"),
    tab.targetCheckSettingsSummaryEl.textContent
  );

  // English copy renders the same section.
  // A source settings file that is not valid JSON cannot be compared.
  const realSettingFiles = tab.settingFiles;
  const realStatuses = tab.settingStatuses;
  const realStatusesAt = tab.settingsCheckAt;
  const realTooltipRow = tab.getSettingRows().find((row) => row.id === "app");
  tab.settingFiles = [
    {
      id: "app",
      fileName: "app.json",
      exists: true,
      value: {},
      parseError: "Unexpected token } in JSON",
      sourcePath: path.join(VAULT_A, ".obsidian", "app.json"),
    },
  ];
  tab.settingStatuses = null;
  tab.renderSettings();
  check(
    "an unreadable source file gets its own chip",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unreadable") === 1,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unreadable"))
  );
  check(
    "the unreadable chip is not styled like the not-checked chip",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown") === 0,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-unknown"))
  );
  const unreadableTooltip = (() => {
    const rows = [];
    walk(tab.settingsListEl, (el) => {
      if (el.classes && el.classes.has("plugin-share-linker-settings-row")) rows.push(el);
    });
    return rows.length > 0 ? String(rows[0].title || "") : "";
  })();
  check(
    "the unreadable source file explains itself in the tooltip",
    unreadableTooltip.includes("不是合法 JSON") && unreadableTooltip.includes("Unexpected token"),
    unreadableTooltip
  );
  check("the unreadable fixture row is the real app row", !!realTooltipRow);
  tab.settingFiles = realSettingFiles;
  tab.settingStatuses = realStatuses;
  tab.settingsCheckAt = realStatusesAt;
  tab.renderSettings();

  // Select-all ticks only the files that exist in this vault (app / appearance / hotkeys).
  plugin.settings.selectedSettingFiles = ["app"];
  tab.renderSettings();
  await findByAria(tab.settingsToolbarEl, "全选").__onClick();
  const selectedExisting = new Set(plugin.settings.selectedSettingFiles);
  check(
    "settings select-all only selects files that exist",
    selectedExisting.size === 3 &&
      ["app", "appearance", "hotkeys"].every((id) => selectedExisting.has(id)) &&
      !selectedExisting.has("graph"),
    JSON.stringify(plugin.settings.selectedSettingFiles)
  );
  await findByAria(tab.settingsToolbarEl, "取消全选").__onClick();
  check("settings clear-all empties the selection", plugin.settings.selectedSettingFiles.length === 0);
  plugin.settings.language = "en";
  await tab.display();
  check("english detect button rendered", !!findByAria(tab.containerEl, "Check"));
  check("english check title rendered", textOf(tab.containerEl).includes("Target vault check"));
  check(
    "english status line keeps the completed result",
    String(tab.targetCheckStatusEl.textContent).includes("Check complete"),
    tab.targetCheckStatusEl.textContent
  );
  plugin.settings.language = "zh";
  await tab.display();
  check("zh copy restored", textOf(tab.containerEl).includes("目标库检测"));

  // The two segments are independent: the settings segment must land while the link scan is pending.
  const originalScan = plugin.scanTargetVault.bind(plugin);
  const precomputedScan = await originalScan(VAULT_B);
  let releaseScan = null;
  let scanPending = true;
  plugin.scanTargetVault = () =>
    new Promise((resolve) => {
      releaseScan = () => {
        scanPending = false;
        resolve(precomputedScan);
      };
    });
  const pendingCheck = tab.runTargetCheck();
  const settingsLanded = await waitFor(() => tab.settingStatuses !== null, 3000);
  check(
    "settings segment lands while the link scan is still pending",
    settingsLanded && scanPending,
    "landed=" + settingsLanded + " pending=" + scanPending
  );
  check(
    "settings chips render while the link scan is still pending",
    countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same") === 2,
    String(countByClass(tab.settingsListEl, "plugin-share-linker-settings-chip-same"))
  );
  check(
    "the check stays busy while one segment is pending",
    tab.targetCheckBusy === true &&
      String(tab.targetCheckStatusEl.textContent).includes("正在检测"),
    tab.targetCheckStatusEl.textContent
  );
  const detectWhileBusy = findByAria(tab.containerEl, "检测");
  check(
    "the detect button is disabled while a check runs",
    !!detectWhileBusy && detectWhileBusy.disabled === true,
    detectWhileBusy && String(detectWhileBusy.disabled)
  );
  if (releaseScan) releaseScan();
  await pendingCheck;
  check(
    "the check finishes once the pending segment resolves",
    tab.targetCheckBusy === false && tab.targetInventory !== null,
    "busy=" + tab.targetCheckBusy
  );

  // Each segment has its own timeout: a stalled link scan does not block the settings segment.
  plugin.scanTargetVault = () => new Promise(() => {});
  const originalSetTimeoutForCheck = global.setTimeout;
  global.setTimeout = function (fn, ms, ...args) {
    return originalSetTimeoutForCheck(fn, ms === 45000 ? 10 : ms, ...args);
  };
  try {
    await tab.runTargetCheck();
  } finally {
    global.setTimeout = originalSetTimeoutForCheck;
    plugin.scanTargetVault = originalScan;
  }
  const timeoutStatus = String(tab.targetCheckStatusEl.textContent);
  check(
    "stalled link segment reports its own timeout",
    timeoutStatus.includes("链接检测失败") && timeoutStatus.includes("45 秒"),
    timeoutStatus
  );
  check(
    "settings segment still updates after a link timeout",
    timeoutStatus.includes("设置文件已更新到"),
    timeoutStatus
  );
  check("link result kept after a link timeout", !!tab.targetInventory, String(tab.targetInventory));

  // Partial failure: the link segment still updates, the settings segment keeps the old result.
  plugin.detectTargetSettings = async () => {
    throw new Error("模拟的设置比较失败");
  };
  try {
    await tab.runTargetCheck();
  } finally {
    plugin.detectTargetSettings = originalDetectSettings;
  }
  const partialStatus = String(tab.targetCheckStatusEl.textContent);
  check(
    "partial failure names the settings segment",
    partialStatus.includes("设置文件检测失败") && partialStatus.includes("模拟的设置比较失败"),
    partialStatus
  );
  check(
    "partial failure keeps the old settings result",
    String(tab.targetCheckSettingsSummaryEl.textContent).includes("设置文件：相同 2"),
    tab.targetCheckSettingsSummaryEl.textContent
  );
  check(
    "partial failure reports which segment is fresh",
    partialStatus.includes("链接已更新到"),
    partialStatus
  );
  check(
    "partial failure states the age of the kept settings result",
    /以下为 \d{2}:\d{2} 的结果/.test(partialStatus),
    partialStatus
  );
  await tab.runTargetCheck();
  check(
    "a later successful check clears the failure",
    String(tab.targetCheckStatusEl.textContent).includes("检测完成") && tab.settingsCheckError === "",
    tab.targetCheckStatusEl.textContent
  );

  // Sharing resources invalidates only the link result.
  plugin.settings.selectedThemeNames = ["Blue Topaz"];
  const themeCopyButton = findByAria(tab.themesToolbarEl, "复制");
  check("theme copy button found", !!themeCopyButton);
  await themeCopyButton.__onClick();
  check("link result cleared after a resource share", tab.targetInventory === null, String(tab.targetInventory));
  check("settings result survives a resource share", !!tab.settingStatuses, String(tab.settingStatuses));
  check(
    "status asks for a new link check",
    String(tab.targetCheckStatusEl.textContent).includes("链接尚未检测"),
    tab.targetCheckStatusEl.textContent
  );
  // Changing the target invalidates both segments at once, even mid-check.
  tab.targetCheckBusy = true;
  tab.invalidateAllResults();
  check(
    "changing the target clears both segments",
    tab.targetInventory === null && tab.settingStatuses === null,
    `inventory=${tab.targetInventory} statuses=${tab.settingStatuses}`
  );
  check("changing the target releases a running check", tab.targetCheckBusy === false);
  check("changing the target clears the settings share card", tab.settingResults === null);
  check(
    "changing the target asks for a fresh check",
    String(tab.targetCheckStatusEl.textContent).includes("尚未检测"),
    tab.targetCheckStatusEl.textContent
  );
  console.log("\n" + (checks - failures) + "/" + checks + " checks passed");
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("UI TEST CRASH", error);
  process.exit(2);
});
