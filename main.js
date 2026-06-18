const { ButtonComponent, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  targetVaultPath: "",
  selectedPluginIds: [],
  pageSize: 10,
  language: "zh",
};

const TEXT = {
  zh: {
    commandOpen: "打开插件共享",
    title: "插件共享",
    switchLanguage: "English",
    currentVault: "当前 Vault：",
    currentVaultUnknown: "无法识别当前 Vault 路径",
    targetVaultName: "目标 Vault 路径 A",
    targetVaultDesc: "填写另一个 Obsidian Vault 的文件夹路径。插件会复制或软链接到 A/.obsidian/plugins/ 中。",
    refresh: "刷新",
    refreshTitle: "重新读取当前 Vault 的插件列表",
    selectAll: "全选",
    selectAllTitle: "选择当前列表中的全部插件，包含所有分页",
    clear: "取消全选",
    clearTitle: "取消所有已选插件",
    copy: "复制",
    copyTitle: "将选中的插件完整复制到目标 Vault 的插件目录",
    symlink: "软连接",
    symlinkTitle: "将选中的插件以软链接方式连接到目标 Vault",
    listReadFailed: (message) => `读取插件清单失败：${message}`,
    count: (total, selected, page, totalPages) => `已发现 ${total} 个插件，已选择 ${selected} 个。当前第 ${page} / ${totalPages} 页。`,
    empty: "当前 Vault 未发现可共享插件。",
    noVersion: "未标注版本",
    previousPage: "上一页",
    nextPage: "下一页",
    pageInfo: (page, totalPages) => `第 ${page} / ${totalPages} 页`,
    pageSizePrefix: "每页",
    pageSizeSuffix: "个",
    copying: "正在复制插件...",
    linking: "正在添加软链接...",
    copyNotice: (count) => `插件复制完成：复制 ${count} 个插件。`,
    linkNotice: (count) => `软链接添加完成：新建 ${count} 个软链接。`,
    shareFailed: (message) => `插件共享失败：${message}`,
    copySummary: (created, exists, conflict, error) => `复制 ${created}，已存在 ${exists}，冲突 ${conflict}，失败 ${error}。`,
    linkSummary: (created, linked, exists, conflict, error) =>
      `新建 ${created}，已连接 ${linked}，已存在 ${exists}，冲突 ${conflict}，失败 ${error}。`,
    resultLine: (name, status) => `${name}：${status}`,
    targetRequired: "请输入目标 Obsidian Vault 路径。",
    targetInvalid: "目标路径不存在，或不是一个文件夹。",
    targetIsCurrent: "目标 Vault 不能是当前 Vault。",
    selectRequired: "请至少选择一个插件。",
    alreadyLinked: "目标位置已经是指向当前插件的软链接。",
    linkConflict: (target) => `目标位置已有软链接，但指向 ${target}。`,
    existsSkipped: "目标位置已有同名文件夹或文件，已跳过。",
    copySymlinkConflict: "目标位置已有同名软链接，已跳过复制。",
    copyExistsSkipped: "目标位置已有同名文件夹或文件，已跳过复制。",
    "status.created": "已创建",
    "status.linked": "已连接",
    "status.exists": "已存在",
    "status.conflict": "冲突",
    "status.error": "失败",
  },
  en: {
    commandOpen: "Open plugin share",
    title: "Plugin Share",
    switchLanguage: "中文",
    currentVault: "Current Vault:",
    currentVaultUnknown: "Unable to detect current vault path",
    targetVaultName: "Target Vault Path A",
    targetVaultDesc: "Enter another Obsidian vault folder. Plugins will be copied or symlinked into A/.obsidian/plugins/.",
    refresh: "Refresh",
    refreshTitle: "Reload the plugin list from the current vault",
    selectAll: "Select All",
    selectAllTitle: "Select every plugin in the list, across all pages",
    clear: "Clear",
    clearTitle: "Clear all selected plugins",
    copy: "Copy",
    copyTitle: "Copy selected plugin folders into the target vault plugin directory",
    symlink: "Symlink",
    symlinkTitle: "Create symbolic links for selected plugins in the target vault",
    listReadFailed: (message) => `Failed to read plugin list: ${message}`,
    count: (total, selected, page, totalPages) => `${total} plugins found, ${selected} selected. Page ${page} / ${totalPages}.`,
    empty: "No shareable plugins were found in the current vault.",
    noVersion: "No version",
    previousPage: "Previous",
    nextPage: "Next",
    pageInfo: (page, totalPages) => `Page ${page} / ${totalPages}`,
    pageSizePrefix: "Per page",
    pageSizeSuffix: "",
    copying: "Copying plugins...",
    linking: "Creating symlinks...",
    copyNotice: (count) => `Plugin copy complete: ${count} plugin(s) copied.`,
    linkNotice: (count) => `Symlink complete: ${count} symlink(s) created.`,
    shareFailed: (message) => `Plugin share failed: ${message}`,
    copySummary: (created, exists, conflict, error) => `Copied ${created}, exists ${exists}, conflicts ${conflict}, failed ${error}.`,
    linkSummary: (created, linked, exists, conflict, error) =>
      `Created ${created}, already linked ${linked}, exists ${exists}, conflicts ${conflict}, failed ${error}.`,
    resultLine: (name, status) => `${name}: ${status}`,
    targetRequired: "Enter a target Obsidian vault path.",
    targetInvalid: "The target path does not exist, or is not a folder.",
    targetIsCurrent: "The target vault cannot be the current vault.",
    selectRequired: "Select at least one plugin.",
    alreadyLinked: "The target already points to this plugin.",
    linkConflict: (target) => `The target already has a symlink pointing to ${target}.`,
    existsSkipped: "A folder or file with the same name already exists at the target. Skipped.",
    copySymlinkConflict: "A symlink with the same name already exists at the target. Copy skipped.",
    copyExistsSkipped: "A folder or file with the same name already exists at the target. Copy skipped.",
    "status.created": "Created",
    "status.linked": "Linked",
    "status.exists": "Exists",
    "status.conflict": "Conflict",
    "status.error": "Failed",
  },
};

module.exports = class PluginShareLinker extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
    this.settings.language = this.settings.language === "en" ? "en" : "zh";
    this.addSettingTab(new PluginShareLinkerSettingTab(this.app, this));

    this.addCommand({
      id: "open-plugin-share-linker",
      name: this.t("commandOpen"),
      callback: () => this.openSettings(),
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  t(key, ...args) {
    const messages = TEXT[this.settings.language] || TEXT.zh;
    const fallback = TEXT.zh[key] || key;
    const value = messages[key] || fallback;
    return typeof value === "function" ? value(...args) : value;
  }

  openSettings() {
    if (this.app.setting) {
      this.app.setting.open();
      this.app.setting.openTabById(this.manifest.id);
    }
  }

  getCurrentVaultPath() {
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === "function") {
      return adapter.getBasePath();
    }
    return "";
  }

  getConfigDir() {
    return this.app.vault.configDir || ".obsidian";
  }

  getCurrentPluginsPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir(), "plugins");
  }

  async listPlugins() {
    const pluginsPath = this.getCurrentPluginsPath();
    if (!pluginsPath) return [];

    const entries = await fs.promises.readdir(pluginsPath, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === this.manifest.id) continue;

      const pluginPath = path.join(pluginsPath, entry.name);
      const manifestPath = path.join(pluginPath, "manifest.json");
      let manifest = {};

      try {
        manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
      } catch (error) {
        continue;
      }

      plugins.push({
        id: manifest.id || entry.name,
        folderName: entry.name,
        name: manifest.name || entry.name,
        version: manifest.version || "",
        description: manifest.description || "",
        sourcePath: pluginPath,
      });
    }

    return plugins.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }

  async sharePlugins(pluginIds, targetVaultPath, mode) {
    const normalizedTargetVaultPath = normalizePathInput(targetVaultPath);
    if (!normalizedTargetVaultPath) {
      throw new Error(this.t("targetRequired"));
    }

    const targetStats = await fs.promises.stat(normalizedTargetVaultPath).catch(() => null);
    if (!targetStats || !targetStats.isDirectory()) {
      throw new Error(this.t("targetInvalid"));
    }

    const currentVaultPath = this.getCurrentVaultPath();
    if (path.resolve(normalizedTargetVaultPath) === path.resolve(currentVaultPath)) {
      throw new Error(this.t("targetIsCurrent"));
    }

    const selected = new Set(pluginIds);
    const allPlugins = await this.listPlugins();
    const plugins = allPlugins.filter((plugin) => selected.has(plugin.id));

    if (plugins.length === 0) {
      throw new Error(this.t("selectRequired"));
    }

    const targetPluginsPath = path.join(normalizedTargetVaultPath, ".obsidian", "plugins");
    await fs.promises.mkdir(targetPluginsPath, { recursive: true });

    const results = [];
    for (const plugin of plugins) {
      const targetPath = path.join(targetPluginsPath, plugin.folderName);
      const result =
        mode === "copy"
          ? await copyPlugin(plugin, targetPath, this.t.bind(this))
          : await createPluginLink(plugin, targetPath, this.t.bind(this));
      results.push(result);
    }

    return results;
  }

  async createLinks(pluginIds, targetVaultPath) {
    return this.sharePlugins(pluginIds, targetVaultPath, "symlink");
  }

  async copyPlugins(pluginIds, targetVaultPath) {
    return this.sharePlugins(pluginIds, targetVaultPath, "copy");
  }
};

class PluginShareLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugins = [];
    this.resultEl = null;
    this.listEl = null;
    this.countEl = null;
    this.paginationEl = null;
    this.currentPage = 1;
  }

  async display() {
    const { containerEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    containerEl.empty();
    containerEl.addClass("plugin-share-linker-settings");

    const headerEl = containerEl.createDiv("plugin-share-linker-header");
    headerEl.createEl("h2", { text: t("title") });
    const languageButton = new ButtonComponent(headerEl)
      .setIcon("languages")
      .onClick(async () => {
        this.plugin.settings.language = this.plugin.settings.language === "en" ? "zh" : "en";
        await this.plugin.saveSettings();
        this.display();
      });
    setToolbarButtonLabel(languageButton, t("switchLanguage"), t("switchLanguage"));

    const currentVault = this.plugin.getCurrentVaultPath();
    const currentInfo = containerEl.createDiv("plugin-share-linker-current");
    currentInfo.createSpan({ text: t("currentVault") });
    currentInfo.createEl("code", { text: currentVault || t("currentVaultUnknown") });

    new Setting(containerEl)
      .setName(t("targetVaultName"))
      .setDesc(t("targetVaultDesc"))
      .addText((text) => {
        text
          .setPlaceholder("/Users/sean/Documents/Another Vault")
          .setValue(this.plugin.settings.targetVaultPath)
          .onChange(async (value) => {
            this.plugin.settings.targetVaultPath = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass("plugin-share-linker-path-input");
      });

    const toolbarEl = containerEl.createDiv("plugin-share-linker-toolbar");
    const refreshButton = new ButtonComponent(toolbarEl)
      .setIcon("refresh-cw")
      .onClick(() => this.refreshPluginList());
    setToolbarButtonLabel(refreshButton, t("refresh"), t("refreshTitle"));

    const selectAllButton = new ButtonComponent(toolbarEl)
      .setIcon("check-square")
      .onClick(async () => {
        this.plugin.settings.selectedPluginIds = this.plugins.map((plugin) => plugin.id);
        await this.plugin.saveSettings();
        this.renderPluginList();
      });
    setToolbarButtonLabel(selectAllButton, t("selectAll"), t("selectAllTitle"));

    const clearButton = new ButtonComponent(toolbarEl)
      .setIcon("square")
      .onClick(async () => {
        this.plugin.settings.selectedPluginIds = [];
        await this.plugin.saveSettings();
        this.renderPluginList();
      });
    setToolbarButtonLabel(clearButton, t("clear"), t("clearTitle"));

    const copyButton = new ButtonComponent(toolbarEl)
      .setIcon("copy")
      .onClick(async () => {
        await this.copyPlugins();
      });
    copyButton.buttonEl.addClass("plugin-share-linker-copy-button");
    setToolbarButtonLabel(copyButton, t("copy"), t("copyTitle"));

    const createButton = new ButtonComponent(toolbarEl)
      .setIcon("link")
      .setCta()
      .onClick(async () => {
        await this.createLinks();
      });
    createButton.buttonEl.addClass("plugin-share-linker-create-button");
    setToolbarButtonLabel(createButton, t("symlink"), t("symlinkTitle"));

    this.countEl = containerEl.createDiv("plugin-share-linker-count");
    this.paginationEl = containerEl.createDiv("plugin-share-linker-pagination");
    this.listEl = containerEl.createDiv("plugin-share-linker-list");
    this.resultEl = containerEl.createDiv("plugin-share-linker-results");

    await this.refreshPluginList();
  }

  async refreshPluginList() {
    this.setResult("");
    try {
      this.plugins = await this.plugin.listPlugins();
      this.renderPluginList();
    } catch (error) {
      this.plugins = [];
      this.renderPluginList();
      this.setResult(this.plugin.t("listReadFailed", error.message), "error");
    }
  }

  renderPluginList() {
    if (!this.listEl || !this.countEl) return;

    const selected = new Set(this.plugin.settings.selectedPluginIds);
    const pageSize = normalizePageSize(this.plugin.settings.pageSize);
    const totalPages = Math.max(1, Math.ceil(this.plugins.length / pageSize));
    this.currentPage = clamp(this.currentPage, 1, totalPages);
    const startIndex = (this.currentPage - 1) * pageSize;
    const pagePlugins = this.plugins.slice(startIndex, startIndex + pageSize);

    this.countEl.setText(this.plugin.t("count", this.plugins.length, selected.size, this.currentPage, totalPages));
    this.listEl.empty();
    this.renderPagination(totalPages, pageSize);

    if (this.plugins.length === 0) {
      this.listEl.createDiv("plugin-share-linker-empty").setText(this.plugin.t("empty"));
      return;
    }

    for (const plugin of pagePlugins) {
      const rowEl = this.listEl.createEl("label", { cls: "plugin-share-linker-plugin" });
      const checkboxEl = rowEl.createEl("input", { type: "checkbox" });
      checkboxEl.checked = selected.has(plugin.id);
      checkboxEl.addEventListener("change", async () => {
        const nextSelected = new Set(this.plugin.settings.selectedPluginIds);
        if (checkboxEl.checked) {
          nextSelected.add(plugin.id);
        } else {
          nextSelected.delete(plugin.id);
        }
        this.plugin.settings.selectedPluginIds = Array.from(nextSelected);
        await this.plugin.saveSettings();
        this.renderPluginList();
      });

      const contentEl = rowEl.createDiv("plugin-share-linker-plugin-content");
      const titleEl = contentEl.createDiv("plugin-share-linker-plugin-title");
      titleEl.createSpan({ text: plugin.name });
      titleEl.createEl("code", { text: plugin.folderName });

      const metaText = plugin.version ? `v${plugin.version}` : this.plugin.t("noVersion");
      contentEl.createDiv("plugin-share-linker-plugin-meta").setText(metaText);

      if (plugin.description) {
        contentEl.createDiv("plugin-share-linker-plugin-desc").setText(plugin.description);
      }
    }
  }

  renderPagination(totalPages, pageSize) {
    if (!this.paginationEl) return;
    this.paginationEl.empty();

    const previousButton = new ButtonComponent(this.paginationEl)
      .setIcon("chevron-left")
      .onClick(() => {
        if (this.currentPage <= 1) return;
        this.currentPage -= 1;
        this.renderPluginList();
      });
    setToolbarButtonLabel(previousButton, this.plugin.t("previousPage"), this.plugin.t("previousPage"));
    previousButton.setDisabled(this.currentPage <= 1);

    const pageInfoEl = this.paginationEl.createDiv("plugin-share-linker-page-info");
    pageInfoEl.setText(this.plugin.t("pageInfo", this.currentPage, totalPages));

    const nextButton = new ButtonComponent(this.paginationEl)
      .setIcon("chevron-right")
      .onClick(() => {
        if (this.currentPage >= totalPages) return;
        this.currentPage += 1;
        this.renderPluginList();
      });
    setToolbarButtonLabel(nextButton, this.plugin.t("nextPage"), this.plugin.t("nextPage"));
    nextButton.setDisabled(this.currentPage >= totalPages);

    const sizeWrapperEl = this.paginationEl.createDiv("plugin-share-linker-page-size");
    sizeWrapperEl.createSpan({ text: this.plugin.t("pageSizePrefix") });
    const selectEl = sizeWrapperEl.createEl("select");
    for (const size of [5, 10, 20, 50]) {
      const optionEl = selectEl.createEl("option", {
        text: `${size}`,
        value: `${size}`,
      });
      optionEl.selected = size === pageSize;
    }
    selectEl.addEventListener("change", async () => {
      this.plugin.settings.pageSize = normalizePageSize(Number(selectEl.value));
      this.currentPage = 1;
      await this.plugin.saveSettings();
      this.renderPluginList();
    });
    const suffix = this.plugin.t("pageSizeSuffix");
    if (suffix) sizeWrapperEl.createSpan({ text: suffix });
  }

  async createLinks() {
    await this.runShareAction("symlink");
  }

  async copyPlugins() {
    await this.runShareAction("copy");
  }

  async runShareAction(mode) {
    const isCopyMode = mode === "copy";
    this.setResult(isCopyMode ? this.plugin.t("copying") : this.plugin.t("linking"));

    try {
      const results = isCopyMode
        ? await this.plugin.copyPlugins(this.plugin.settings.selectedPluginIds, this.plugin.settings.targetVaultPath)
        : await this.plugin.createLinks(this.plugin.settings.selectedPluginIds, this.plugin.settings.targetVaultPath);
      this.renderResults(results, mode);

      const createdCount = results.filter((result) => result.status === "created").length;
      new Notice(isCopyMode ? this.plugin.t("copyNotice", createdCount) : this.plugin.t("linkNotice", createdCount));
    } catch (error) {
      this.setResult(error.message, "error");
      new Notice(this.plugin.t("shareFailed", error.message));
    }
  }

  renderResults(results, mode) {
    if (!this.resultEl) return;
    this.resultEl.empty();

    const summary = {
      created: results.filter((result) => result.status === "created").length,
      linked: results.filter((result) => result.status === "linked").length,
      exists: results.filter((result) => result.status === "exists").length,
      conflict: results.filter((result) => result.status === "conflict").length,
      error: results.filter((result) => result.status === "error").length,
    };

    this.resultEl.createDiv("plugin-share-linker-result-summary").setText(
      mode === "copy"
        ? this.plugin.t("copySummary", summary.created, summary.exists, summary.conflict, summary.error)
        : this.plugin.t("linkSummary", summary.created, summary.linked, summary.exists, summary.conflict, summary.error)
    );

    const listEl = this.resultEl.createEl("ul", { cls: "plugin-share-linker-result-list" });
    for (const result of results) {
      const itemEl = listEl.createEl("li", {
        cls: `plugin-share-linker-result plugin-share-linker-result-${result.status}`,
      });
      itemEl.createSpan({ text: this.plugin.t("resultLine", result.plugin.name, this.plugin.t(`status.${result.status}`)) });
      if (result.message) itemEl.createDiv("plugin-share-linker-result-message").setText(result.message);
    }
  }

  setResult(message, type) {
    if (!this.resultEl) return;
    this.resultEl.empty();
    if (!message) return;
    const resultEl = this.resultEl.createDiv("plugin-share-linker-message");
    if (type) resultEl.addClass(`plugin-share-linker-message-${type}`);
    resultEl.setText(message);
  }
}

async function createPluginLink(plugin, targetPath, t) {
  try {
    const existing = await fs.promises.lstat(targetPath).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink()) {
        const linkTarget = await fs.promises.readlink(targetPath);
        const absoluteLinkTarget = path.resolve(path.dirname(targetPath), linkTarget);
        if (path.resolve(absoluteLinkTarget) === path.resolve(plugin.sourcePath)) {
          return {
            plugin,
            status: "linked",
            message: t("alreadyLinked"),
          };
        }
        return {
          plugin,
          status: "conflict",
          message: t("linkConflict", linkTarget),
        };
      }

      return {
        plugin,
        status: "exists",
        message: t("existsSkipped"),
      };
    }

    await fs.promises.symlink(plugin.sourcePath, targetPath, "dir");
    return {
      plugin,
      status: "created",
      message: targetPath,
    };
  } catch (error) {
    return {
      plugin,
      status: "error",
      message: error.message,
    };
  }
}

async function copyPlugin(plugin, targetPath, t) {
  try {
    const existing = await fs.promises.lstat(targetPath).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink()) {
        return {
          plugin,
          status: "conflict",
          message: t("copySymlinkConflict"),
        };
      }

      return {
        plugin,
        status: "exists",
        message: t("copyExistsSkipped"),
      };
    }

    await fs.promises.cp(plugin.sourcePath, targetPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });

    return {
      plugin,
      status: "created",
      message: targetPath,
    };
  } catch (error) {
    return {
      plugin,
      status: "error",
      message: error.message,
    };
  }
}

function normalizePathInput(value) {
  return (value || "").trim().replace(/^~(?=$|\/|\\)/, process.env.HOME || "~");
}

function normalizePageSize(value) {
  const allowed = [5, 10, 20, 50];
  return allowed.includes(value) ? value : 10;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setToolbarButtonLabel(button, label, title) {
  button.buttonEl.addClass("plugin-share-linker-toolbar-button");
  button.buttonEl.title = title;
  button.buttonEl.setAttribute("aria-label", label);
  button.buttonEl.createSpan({
    text: label,
    cls: "plugin-share-linker-button-label",
  });
}
