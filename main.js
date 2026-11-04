const { ButtonComponent, Modal, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const fs = require("fs");
const path = require("path");

const CONFIG_DIR_NAME = ".obsidian";
const PAGE_SIZES = [5, 10, 20, 50];
const SETTING_FILES = [
  { id: "app", fileName: "app.json" },
  { id: "appearance", fileName: "appearance.json" },
  { id: "hotkeys", fileName: "hotkeys.json" },
  { id: "core-plugins", fileName: "core-plugins.json" },
  { id: "graph", fileName: "graph.json" },
  { id: "templates", fileName: "templates.json" },
  { id: "daily-notes", fileName: "daily-notes.json" },
  { id: "zk-prefixer", fileName: "zk-prefixer.json" },
];
const SETTING_FILE_KEY_EXCLUSIONS = {
  // The theme and the enabled-snippet list are written by the theme / snippet controls.
  appearance: ["cssTheme", "enabledCssSnippets"],
};
const VAULT_BOUND_KEYS = ["attachmentFolderPath", "newFileLocation", "userIgnoreFilters"];
const TARGET_ACCESS_TIMEOUT_MS = 15000;
const SYMLINK_TIMEOUT_MS = 20000;
const ACTION_TIMEOUT_MS = 300000;

const DEFAULT_SETTINGS = {
  targetVaultPath: "",
  selectedPluginIds: [],
  enabledPluginIds: [],
  selectedThemeNames: [],
  targetThemeName: "",
  selectedSnippetNames: [],
  enabledSnippetNames: [],
  selectedSettingFiles: [],
  pageSize: 10,
  language: "zh",
};

const TEXT = {
  zh: {
    commandOpen: "打开共享面板",
    title: "共享面板",
    switchLanguage: "English",
    currentVault: "当前 Vault：",
    currentVaultUnknown: "无法识别当前 Vault 路径",
    targetVaultName: "目标 Vault 路径 A",
    targetVaultDesc: "填写另一个 Obsidian Vault 的文件夹路径。插件、主题与 CSS 片段都写入这一个库。",
    targetVaultHint: "如果该目录还不是 Obsidian 库，共享会在其中创建 .obsidian 目录。",
    refresh: "刷新",
    refreshTitle: "重新读取当前 Vault 的插件、主题与片段列表",
    selectAll: "全选",
    selectAllTitle: "选择当前列表中的全部插件（含所有分页），并默认勾选启用",
    clear: "取消全选",
    clearTitle: "取消所有已选插件与启用勾选",
    copy: "复制",
    copyTitle: "将选中的项目完整复制到目标 Vault",
    symlink: "软连接",
    symlinkTitle: "将选中的项目以软链接方式连接到目标 Vault",
    sectionPlugins: "插件",
    sectionThemes: "主题",
    sectionSnippets: "CSS 片段",
    pluginsCount: (total, selected, page, totalPages) => `已发现 ${total} 个插件，已选择 ${selected} 个。当前第 ${page} / ${totalPages} 页。`,
    themesCount: (total, selected) => `已发现 ${total} 个主题，已选择 ${selected} 个。`,
    snippetsCount: (total, selected) => `已发现 ${total} 个片段，已选择 ${selected} 个。`,
    listReadFailed: (message) => `读取资源列表失败：${message}`,
    previousPage: "上一页",
    nextPage: "下一页",
    pageInfo: (page, totalPages) => `第 ${page} / ${totalPages} 页`,
    pageSizePrefix: "每页",
    pageSizeSuffix: "个",
    busyProgress: (label, seconds) => `${label}（已等待 ${seconds} 秒）`,
    targetAccessTimeout: (seconds, targetPath) =>
      `目标路径 ${seconds} 秒内没有响应：${targetPath}。请确认它是本地可访问的文件夹——网络盘、云盘占位文件或已断开的移动硬盘会长时间无响应。`,
    symlinkTimeout: (seconds, name) => `为 ${name} 创建软链接超过 ${seconds} 秒，已停止等待。目标路径可能不可访问。`,
    actionTimeout: (seconds) =>
      `操作超过 ${seconds} 秒仍未完成，已停止等待。请检查目标路径是否可访问（网络盘 / 云盘占位文件常见），或改用软链接模式避免复制大文件。复制模式下文件可能仍在后台写入，稍后重试会显示“已存在”。`,
    checkTarget: "检查目标路径",
    checkTargetTitle: "验证目标路径是否存在、是否为 Obsidian 库、是否可写",
    checkingTarget: "正在检查目标路径...",
    targetCheckExists: "存在且是文件夹",
    targetCheckVault: "是 Obsidian 库（找到 .obsidian）",
    targetCheckWritable: "文件夹可写",
    targetCheckElapsed: (ms) => `耗时：${ms} ms`,
    targetCheckHint: "若这里显示正常但共享动作仍然卡住，请把下方的调试轨迹截图反馈。",
    targetCheckLine: (label, value) => `${label}：${value}`,
    yes: "是",
    no: "否",
    debugTrailTitle: "调试轨迹（动作卡住时截图这一段即可）",
    debugLogPath: (path) => `日志文件：${path}`,
    emptyPlugins: "当前 Vault 未发现可共享插件。",
    emptyThemes: "当前 Vault 未发现可共享主题。",
    emptySnippets: "当前 Vault 未发现可共享 CSS 片段。",
    emptyThemeRadio: "勾选主题后可在这里指定目标库当前主题。",
    noVersion: "未标注版本",
    share: "共享",
    enable: "启用",
    pluginEnableHint:
      "勾选“启用”会把插件 ID 追加到目标库 .obsidian/community-plugins.json：写前备份为 .bak，再临时文件 + rename 原子写；只启用成功落到目标库的插件；只追加、不删除。取消勾选不会停用目标库已启用的插件。",
    snippetEnableHint: "勾选“启用”会把片段名追加到目标库 .obsidian/appearance.json 的 enabledCssSnippets：只追加、不删除。",
    themeRadioTitle: "设为目标库当前主题",
    themeRadioNone: "不设置",
    themeRadioHint:
      "显式选中会覆盖目标库已有主题（appearance.json 的 cssTheme）；不选时，只有目标库没有自定义主题、且本次只共享一个主题，才自动设为该主题。",
    copying: "正在复制...",
    linking: "正在添加软链接...",
    copyNotice: (count) => `复制完成：新建 ${count} 项。`,
    linkNotice: (count) => `软链接完成：新建 ${count} 项。`,
    shareFailed: (message) => `共享失败：${message}`,
    copySummary: (created, exists, conflict, error) => `复制 ${created}，已存在 ${exists}，冲突 ${conflict}，失败 ${error}。`,
    linkSummary: (created, linked, exists, conflict, error) =>
      `新建 ${created}，已连接 ${linked}，已存在 ${exists}，冲突 ${conflict}，失败 ${error}。`,
    resultLine: (name, status) => `${name}：${status}`,
    resultsTitle: "共享结果",
    resultsPlugins: "插件",
    resultsThemes: "主题",
    resultsSnippets: "CSS 片段",
    configEnableLine: (plugins, snippets) => `目标库启用：新增 ${plugins} 个插件、${snippets} 个片段。`,
    configThemeLine: (theme) => `目标库当前主题：已设为 ${theme}。`,
    configThemeUnchanged: "目标库当前主题：未改动。",
    targetCreatedVault: "目标目录之前不是 Obsidian 库，已创建 .obsidian 目录。",
    restartHint: "目标库重启 Obsidian（或 Ctrl/Cmd+R）后生效。",
    configParseWarning: (file) => `${file} 不是有效的 JSON，已备份原文件后按空内容处理。`,
    backupMade: (file) => `已备份原文件：${file}`,
    targetRequired: "请输入目标 Obsidian Vault 路径。",
    targetInvalid: "目标路径不存在，或不是一个文件夹。",
    targetIsCurrent: "目标 Vault 不能是当前 Vault。",
    selectPluginRequired: "请至少选择一个插件。",
    selectThemeRequired: "请至少选择一个主题。",
    selectSnippetRequired: "请至少选择一个 CSS 片段。",
    alreadyLinked: "目标位置已经是指向当前项的软链接。",
    linkConflict: (target) => `目标位置已有软链接，但指向 ${target}。`,
    existsSkipped: "目标位置已有同名文件夹或文件，已跳过（未更新）。",
    copySymlinkConflict: "目标位置已有同名软链接，已跳过复制。",
    copyExistsSkipped: "目标位置已有同名文件夹或文件，已跳过复制（未更新）。",
    "status.created": "已创建",
    "status.linked": "已连接",
    "status.exists": "已存在（未更新）",
    "status.conflict": "冲突",
    "status.error": "失败",
    pickerOpen: "选择…",
    pickerOpenTitle: "从 Obsidian 记录过的库里选择目标 Vault",
    pickerBrowse: "浏览…",
    pickerBrowseTitle: "用系统文件夹对话框选择目标 Vault",
    pickerTitle: "选择目标 Vault",
    pickerSubtitle: "来自 Obsidian 已记录的库",
    pickerCurrentChip: "当前",
    pickerOpenChip: "打开中",
    pickerMissingChip: "目录不存在",
    pickerCurrentVaultChip: "当前库，不可选",
    pickerRegistryFallback: "没有读到库注册表，下面只显示设置里已保存的路径。",
    pickerEmpty: "没有可选的库。",
    pickerSelected: (path) => `已选择目标库：${path}`,
    pickerCancel: "取消",
    pickerBrowseUnsupported: "当前环境不支持系统文件夹对话框，请手动输入路径，或从已知库里选择。",
    pickerBrowseFailed: (message) => `打开系统文件夹对话框失败：${message}`,
    targetCheckTitle: "目标库检测",
    targetCheckDetect: "检测",
    targetCheckDetectTitle: "扫描目标库 plugins / themes / snippets 下的链接与 8 份设置文件，找出失效链接与设置差异",
    targetCheckSectionHint:
      "检测是手动的：点「检测」才会访问目标库，一次同时扫描目标库 .obsidian 下的链接与 8 份设置文件，避免目标库失联时卡住设置页。",
    targetCheckNotScanned: "尚未检测。点「检测」扫描目标库的链接与设置文件。",
    targetCheckChecking: "正在检测…",
    targetCheckBadge: (broken, unreachable) =>
      unreachable > 0 ? `${broken} 个失效 · ${unreachable} 个不可达` : `${broken} 个失效`,
    targetCheckBadgeNone: "未发现失效链接",
    targetCheckSummary: (total, links, healthy, broken, unreachable, copies) =>
      `共 ${total} 项：${links} 个链接（${healthy} 健康、${broken} 失效、${unreachable} 源库不可达），${copies} 个实体副本。`,
    targetCheckSettingsSummary: (same, diff, missing) =>
      `设置文件：相同 ${same}、有差异 ${diff}、缺失 ${missing}。`,
    targetCheckStatusDone: (broken, unreachable, same, diff, missing) =>
      `检测完成：${broken} 个失效、${unreachable} 个源库不可达；设置文件 ${same} 份相同、${diff} 份有差异、${missing} 份缺失。`,
    targetCheckStatusClear: "检测完成：未发现失效链接；设置文件全部相同。",
    targetCheckFailed: (segment, message) => `${segment}检测失败：${message}`,
    targetCheckFailedKept: (segment, message, time) => `${segment}检测失败：${message}（以下为 ${time} 的结果）`,
    targetCheckUpdatedSegments: (segments, time) => `${segments}已更新到 ${time}`,
    targetCheckSegmentLinks: "链接",
    targetCheckSegmentSettings: "设置文件",
    targetCheckStaleSettings: (time) => `设置文件尚未检测（链接结果来自 ${time}）。`,
    targetCheckStaleLinks: (time) => `链接尚未检测（设置结果来自 ${time}）。`,
    targetCheckShareItem: "共享此项",
    targetCheckShareItemTitle: "只共享这一份设置文件（先确认要覆盖的键）",
    targetCheckPointsTo: (target) => `指向 ${target}`,
    targetCheckUnreachableHint: (root) => `先挂载源库（${root}）再检测。`,
    targetCheckRebuild: "重建链接",
    targetCheckRebuildTitle: "把链接重新指向当前库里的同名资源",
    targetCheckDelete: "删除链接",
    targetCheckDeleteTitle: "删除目标库里的这个失效链接，并清理目标库启用记录里的对应项",
    targetCheckRebuildAll: "全部重建",
    targetCheckRebuildAllTitle: "重建所有「当前库有同名资源」的失效链接",
    targetCheckDeleteAll: "全部删除",
    targetCheckDeleteAllTitle: "删除所有「当前库没有同名资源」的失效链接",
    targetCheckRebuilt: (name, from, to) => `${name}：已重建链接（原指向 ${from} → 新指向 ${to}）`,
    targetCheckRebuiltLine: (from, to) => `原指向 ${from} → 新指向 ${to}`,
    targetCheckRebuildFailed: (name, message) => `${name}：重建失败——${message}`,
    targetCheckRebuildRestored: "旧链接已恢复。",
    targetCheckRebuildNotRestored: "旧链接未能恢复，请检查目标位置。",
    targetCheckDeleted: (name) => `已删除链接：${name}`,
    targetCheckDeletedWithConfig: (name, config) => `已删除链接：${name}；${config}`,
    targetCheckConfigUnchanged: "目标库启用记录没有需要清理的条目。",
    targetCheckConfigRemovedPlugins: (count) => `从 community-plugins.json 移除 ${count} 个插件 ID`,
    targetCheckConfigRemovedSnippets: (count) => `从 enabledCssSnippets 移除 ${count} 个片段名`,
    targetCheckConfigClearedTheme: (theme) => `cssTheme 已清空（原为 ${theme}）`,
    targetCheckConfigFailed: (message) => `链接已删除，但清理目标库配置失败：${message}`,
    targetCheckConfigJoined: (parts) => parts.join("，"),
    targetCheckNoticeFound: (broken, unreachable) => `检测完成：${broken} 个失效、${unreachable} 个源库不可达。`,
    targetCheckNoticeClear: "检测完成：未发现失效链接。",
    targetCheckDeleteFailed: (message) => `删除链接失败：${message}`,
    targetCheckNotLink: (path) => `${path} 已经不是链接，已跳过。`,
    targetCheckLinkHealthy: "这个链接现在指向有效目标，已跳过（重新检测即可刷新状态）。",
    targetCheckNoSource: (name) => `当前库没有同名资源，无法重建：${name}`,
    targetCheckBulkConfirmRebuild: "确认重建以下链接？",
    targetCheckBulkConfirmDelete: "确认删除以下链接？",
    targetCheckConfirmRebuildWarning:
      "重建会先删掉旧链接，再创建指向当前库同名资源的新链接（绝对路径）。若创建失败会尝试恢复旧链接。",
    targetCheckConfirmDeleteWarning:
      "删除会移除目标库里的链接本身，并清理 community-plugins.json、appearance.json（enabledCssSnippets / cssTheme）里对应的条目；物理资源不会被删除。写前会备份为 .bak。",
    targetCheckConfirmOk: "确认",
    targetCheckConfirmCancel: "取消",
    targetCheckBulkRebuildDone: (ok, failed) => `全部重建完成：成功 ${ok}，失败 ${failed}。`,
    targetCheckBulkDeleteDone: (ok, failed) => `全部删除完成：成功 ${ok}，失败 ${failed}。`,
    pairHeadSource: "当前 Vault",
    pairHeadTarget: "目标库",
    pairPlaceholderSource: "当前库无同名项",
    pairLegendTitle: "目标库状态：",
    targetOnlySuffix: (count) => `（另有 ${count} 项只在目标库）`,
    "targetState.linked": "已链接",
    "targetState.copy": "已存在副本",
    "targetState.conflict": "冲突",
    "targetState.broken": "链接失效",
    "targetState.unreachable": "源库不可达",
    "targetState.unshared": "未共享",
    "targetState.unknown": "未检测",
    "targetState.copyHint": "目标库里的同名项是实体副本，不来自当前库。",
    sectionSettings: "Obsidian 设置",
    settingsCount: (total, selected) => `已发现 ${total} 份设置文件，已勾选 ${selected} 份。`,
    settingsShare: "共享设置",
    settingsShareTitle: "把勾选的设置文件写入目标库（先展示将要覆盖的键）",
    settingsSelectAllTitle: "选中全部设置文件",
    settingsClearAllTitle: "清空设置文件勾选",
    settingsSharing: "正在共享设置…",
    settingsSelectRequired: "请至少选择一份设置文件。",
    settingsHint:
      "共享设置只写目标库 .obsidian 下的设置文件：按顶层键合并，源文件里出现的键覆盖目标库同名键，目标库独有的键保留；写前备份为 .bak 并原子替换。外观文件不含启用列表与当前主题；workspace / bookmarks / community-plugins 不参与共享。目标库的设置状态见上方「目标库检测」：检测后在这里勾选要共享的文件，把鼠标移到文件行上可看差异详情。建议先关闭目标库的 Obsidian。",
    settingsTooltipSame: "与目标库一致：所有共享键都相同。",
    settingsTooltipMissing: (count) => `目标库没有这个文件；共享时会写入 ${count} 个键。`,
    settingsTooltipUnknown: "尚未检测。点上方「目标库检测」里的「检测」后再看差异。",
    settingsTooltipNoSource: "当前库没有这个文件，无法共享。",
    settingsTooltipSourceParseError: (message) => `当前库这份文件不是合法 JSON，无法共享：${message}`,
    settingsTooltipParseError: (message) => `目标文件不是合法 JSON：${message}；共享时会整体重写并备份原文件。`,
    settingsTooltipHeader: (fileName, changed, added, removed) => {
      const parts = [`覆盖 ${changed} 个键`];
      if (added > 0) parts.push(`新增 ${added} 个键`);
      if (removed > 0) parts.push(`目标库独有 ${removed} 个键（不会删除）`);
      return `${fileName}：${parts.join("，")}`;
    },
    settingsTooltipChanged: (pairs) => `覆盖：${pairs}`,
    settingsTooltipAdded: (pairs) => `新增：${pairs}`,
    settingsTooltipRemoved: (keys) => `目标库独有（不会删除）：${keys}`,
    settingsTooltipPair: (key, from, to) => `${key}：${from} → ${to}`,
    settingsTooltipAddedPair: (key, to) => `${key}：${to}`,
    settingsConfirmTitle: "确认共享这些设置？",
    settingsConfirmHint: "以下键会被源库的值覆盖；目标文件写前备份为 .bak。",
    settingsConfirmFile: (file, changed, added) => `${file}：覆盖 ${changed} 个键，新增 ${added} 个键`,
    settingsConfirmUnchanged: (file) => `${file}：无变化`,
    settingsConfirmOverwriteKeys: (keys) => `覆盖：${keys}`,
    settingsConfirmAddKeys: (keys) => `新增：${keys}`,
    settingsConfirmOk: "确认共享",
    settingsSourceParseWarning: (file) => `${file} 不是合法 JSON，已跳过该文件。`,
    settingsCoreEnabled: (names) => `将启用核心插件：${names}`,
    settingsCoreDisabled: (names) => `将停用核心插件：${names}`,
    settingsCoreNone: "核心插件开关无变化。",
    settingsVaultBoundWarning:
      "注意：attachmentFolderPath / newFileLocation / userIgnoreFilters 属于库绑定键，共享后会改变目标库的文件存放与搜索可见性；仍会写入，请确认这是想要的。",
    settingsVaultBoundLine: (warning, keys) => `${warning}（${keys}）`,
    listSeparator: "、",
    sentenceSeparator: "；",
    settingsHotkeyConflict: (combo, from, to) => `快捷键冲突：${combo}（源库命令 ${from}，目标库命令 ${to}）`,
    settingsHotkeyConflictInternal: (combo, a, b) => `快捷键冲突：${combo}（源库内 ${a} 与 ${b} 重复）`,
    settingsNoConflict: "未发现快捷键冲突。",
    settingsResultTitle: "设置共享结果",
    settingsResultSummary: (written, unchanged, failed) => `已写 ${written} 份，无变化 ${unchanged} 份，失败 ${failed} 份。`,
    settingsResultFile: (file, total, changed, added) =>
      `${file}：已写 ${total} 个键（覆盖 ${changed} / 新增 ${added}）`,
    settingsResultUnchanged: (file) => `${file}：无变化`,
    settingsResultFailed: (file, message) => `${file}：失败——${message}`,
    settingsResultCore: (enabled, disabled) => `目标库核心插件：启用 ${enabled} 个、停用 ${disabled} 个。`,
    settingsResultBackups: (count) => `已备份 ${count} 份原文件（.bak）。`,
    settingsRestartHint: "目标库重启 Obsidian（或 Ctrl/Cmd+R）后生效。",
    "settingsState.unknown": "未检测",
    "settingsState.checking": "检测中…",
    "settingsState.same": "相同",
    "settingsState.diff": (count) => `有差异 ${count} 个键`,
    "settingsState.missing": "缺失",
    "settingsState.noSource": "源库无此文件",
    "settingsState.unreadable": "无法读取",
    "settingsFile.app": "编辑器与文件行为",
    "settingsFile.appearance": "外观（不含启用列表与当前主题）",
    "settingsFile.hotkeys": "快捷键",
    "settingsFile.core-plugins": "核心插件开关",
    "settingsFile.graph": "关系图谱参数",
    "settingsFile.templates": "模板插件设置",
    "settingsFile.daily-notes": "日记插件设置",
    "settingsFile.zk-prefixer": "ZK 前缀插件设置",
  },
  en: {
    commandOpen: "Open share panel",
    title: "Share Panel",
    switchLanguage: "中文",
    currentVault: "Current Vault:",
    currentVaultUnknown: "Unable to detect current vault path",
    targetVaultName: "Target Vault Path A",
    targetVaultDesc: "Enter another Obsidian vault folder. Plugins, themes and CSS snippets are written into that vault.",
    targetVaultHint: "If the folder is not an Obsidian vault yet, .obsidian will be created there.",
    refresh: "Refresh",
    refreshTitle: "Reload plugins, themes and snippets from the current vault",
    selectAll: "Select All",
    selectAllTitle: "Select every plugin in the list (across pages) and enable them by default",
    clear: "Clear",
    clearTitle: "Clear all selected plugins and their enable flags",
    copy: "Copy",
    copyTitle: "Copy the selected items into the target vault",
    symlink: "Symlink",
    symlinkTitle: "Create symbolic links for the selected items in the target vault",
    sectionPlugins: "Plugins",
    sectionThemes: "Themes",
    sectionSnippets: "CSS snippets",
    pluginsCount: (total, selected, page, totalPages) => `${total} plugins found, ${selected} selected. Page ${page} / ${totalPages}.`,
    themesCount: (total, selected) => `${total} themes found, ${selected} selected.`,
    snippetsCount: (total, selected) => `${total} snippets found, ${selected} selected.`,
    listReadFailed: (message) => `Failed to read resource list: ${message}`,
    previousPage: "Previous",
    nextPage: "Next",
    pageInfo: (page, totalPages) => `Page ${page} / ${totalPages}`,
    pageSizePrefix: "Per page",
    pageSizeSuffix: "",
    busyProgress: (label, seconds) => `${label} (waited ${seconds}s)`,
    targetAccessTimeout: (seconds, targetPath) =>
      `The target path did not respond within ${seconds}s: ${targetPath}. Make sure it is a locally reachable folder — network drives, cloud placeholder files or disconnected external disks can hang.`,
    symlinkTimeout: (seconds, name) =>
      `Creating the symlink for ${name} took longer than ${seconds}s; stopped waiting. The target path may be unreachable.`,
    actionTimeout: (seconds) =>
      `The operation did not finish within ${seconds}s and was stopped. Check that the target path is reachable (network drives and cloud placeholders commonly hang), or use Symlink mode to avoid copying large files. In Copy mode files may still be written in the background; retrying later will report them as existing.`,
    checkTarget: "Check target path",
    checkTargetTitle: "Verify that the target path exists, is an Obsidian vault, and is writable",
    checkingTarget: "Checking target path...",
    targetCheckExists: "Exists and is a folder",
    targetCheckVault: "Is an Obsidian vault (.obsidian found)",
    targetCheckWritable: "Folder is writable",
    targetCheckElapsed: (ms) => `Took ${ms} ms`,
    targetCheckHint: "If this looks fine but sharing still stalls, screenshot the debug trail below.",
    targetCheckLine: (label, value) => `${label}: ${value}`,
    yes: "Yes",
    no: "No",
    debugTrailTitle: "Debug trail (screenshot this if an action stalls)",
    debugLogPath: (path) => `Log file: ${path}`,
    emptyPlugins: "No shareable plugins were found in the current vault.",
    emptyThemes: "No shareable themes were found in the current vault.",
    emptySnippets: "No shareable CSS snippets were found in the current vault.",
    emptyThemeRadio: "Select themes to pick the target vault's current theme here.",
    noVersion: "No version",
    share: "Share",
    enable: "Enable",
    pluginEnableHint:
      "Enabling appends plugin IDs to the target vault's .obsidian/community-plugins.json: the file is backed up to .bak and replaced atomically; only plugins that landed in the target are enabled; entries are appended, never removed. Unchecking does not disable an already-enabled plugin in the target vault.",
    snippetEnableHint: "Enabling appends snippet names to the target vault's .obsidian/appearance.json enabledCssSnippets: appended, never removed.",
    themeRadioTitle: "Set as target vault's current theme",
    themeRadioNone: "Do not set",
    themeRadioHint:
      "An explicit pick overrides the target vault's theme (cssTheme in appearance.json). When nothing is picked, the theme is set automatically only if the target has no custom theme and exactly one theme is shared.",
    copying: "Copying...",
    linking: "Creating symlinks...",
    copyNotice: (count) => `Copy complete: ${count} item(s) created.`,
    linkNotice: (count) => `Symlink complete: ${count} item(s) created.`,
    shareFailed: (message) => `Share failed: ${message}`,
    copySummary: (created, exists, conflict, error) => `Copied ${created}, exists ${exists}, conflicts ${conflict}, failed ${error}.`,
    linkSummary: (created, linked, exists, conflict, error) =>
      `Created ${created}, already linked ${linked}, exists ${exists}, conflicts ${conflict}, failed ${error}.`,
    resultLine: (name, status) => `${name}: ${status}`,
    resultsTitle: "Share results",
    resultsPlugins: "Plugins",
    resultsThemes: "Themes",
    resultsSnippets: "CSS snippets",
    configEnableLine: (plugins, snippets) => `Target vault enabled: ${plugins} plugin(s), ${snippets} snippet(s) added.`,
    configThemeLine: (theme) => `Target vault theme: set to ${theme}.`,
    configThemeUnchanged: "Target vault theme: unchanged.",
    targetCreatedVault: "The target folder was not a vault; .obsidian was created.",
    restartHint: "Restart Obsidian in the target vault (or press Ctrl/Cmd+R) to apply.",
    configParseWarning: (file) => `${file} is not valid JSON; the original file was backed up and treated as empty.`,
    backupMade: (file) => `Original backed up to: ${file}`,
    targetRequired: "Enter a target Obsidian vault path.",
    targetInvalid: "The target path does not exist, or is not a folder.",
    targetIsCurrent: "The target vault cannot be the current vault.",
    selectPluginRequired: "Select at least one plugin.",
    selectThemeRequired: "Select at least one theme.",
    selectSnippetRequired: "Select at least one CSS snippet.",
    alreadyLinked: "The target already points to this item.",
    linkConflict: (target) => `The target already has a symlink pointing to ${target}.`,
    existsSkipped: "A folder or file with the same name already exists at the target. Skipped (not updated).",
    copySymlinkConflict: "A symlink with the same name already exists at the target. Copy skipped.",
    copyExistsSkipped: "A folder or file with the same name already exists at the target. Copy skipped (not updated).",
    "status.created": "Created",
    "status.linked": "Linked",
    "status.exists": "Exists (not updated)",
    "status.conflict": "Conflict",
    "status.error": "Failed",
    pickerOpen: "Choose…",
    pickerOpenTitle: "Pick the target vault from the vaults Obsidian knows",
    pickerBrowse: "Browse…",
    pickerBrowseTitle: "Pick the target vault with the system folder dialog",
    pickerTitle: "Choose target vault",
    pickerSubtitle: "From the vaults Obsidian has recorded",
    pickerCurrentChip: "Current",
    pickerOpenChip: "Open",
    pickerMissingChip: "Folder missing",
    pickerCurrentVaultChip: "Current vault — not selectable",
    pickerRegistryFallback: "No vault registry found; only the saved path is shown below.",
    pickerEmpty: "No vaults to choose from.",
    pickerSelected: (path) => `Target vault selected: ${path}`,
    pickerCancel: "Cancel",
    pickerBrowseUnsupported: "The system folder dialog is unavailable here; type the path or pick a known vault.",
    pickerBrowseFailed: (message) => `Could not open the system folder dialog: ${message}`,
    targetCheckTitle: "Target vault check",
    targetCheckDetect: "Check",
    targetCheckDetectTitle:
      "Scan links under plugins / themes / snippets and the 8 settings files in the target vault for broken links and settings differences",
    targetCheckSectionHint:
      "Detection is manual: the target vault is only touched when you press Check, and one run scans both the links and the 8 settings files, so a missing drive cannot stall the settings page.",
    targetCheckNotScanned: "Not checked yet. Press Check to scan the target vault's links and settings files.",
    targetCheckChecking: "Checking…",
    targetCheckBadge: (broken, unreachable) =>
      unreachable > 0 ? `${broken} broken · ${unreachable} unreachable` : `${broken} broken`,
    targetCheckBadgeNone: "No broken links",
    targetCheckSummary: (total, links, healthy, broken, unreachable, copies) =>
      `${total} items: ${links} links (${healthy} healthy, ${broken} broken, ${unreachable} unreachable), ${copies} physical copies.`,
    targetCheckSettingsSummary: (same, diff, missing) =>
      `Settings: ${same} same, ${diff} different, ${missing} missing.`,
    targetCheckStatusDone: (broken, unreachable, same, diff, missing) =>
      `Check complete: ${broken} broken, ${unreachable} unreachable; settings ${same} same, ${diff} different, ${missing} missing.`,
    targetCheckStatusClear: "Check complete: no broken links; all settings files match.",
    targetCheckFailed: (segment, message) => `${segment} check failed: ${message}`,
    targetCheckFailedKept: (segment, message, time) =>
      `${segment} check failed: ${message} (showing the ${time} result)`,
    targetCheckUpdatedSegments: (segments, time) => `${segments} updated to ${time}`,
    targetCheckSegmentLinks: "Links",
    targetCheckSegmentSettings: "Settings files",
    targetCheckStaleSettings: (time) => `Settings files not checked yet (link result from ${time}).`,
    targetCheckStaleLinks: (time) => `Links not checked yet (settings result from ${time}).`,
    targetCheckShareItem: "Share this file",
    targetCheckShareItemTitle: "Share only this settings file (the keys about to change are shown first)",
    targetCheckPointsTo: (target) => `Points to ${target}`,
    targetCheckUnreachableHint: (root) => `Mount the source vault (${root}) and check again.`,
    targetCheckRebuild: "Rebuild link",
    targetCheckRebuildTitle: "Point the link back at the same-named item in the current vault",
    targetCheckDelete: "Delete link",
    targetCheckDeleteTitle: "Delete this broken link and remove its entry from the target vault's enable records",
    targetCheckRebuildAll: "Rebuild all",
    targetCheckRebuildAllTitle: "Rebuild every broken link that has a same-named item in the current vault",
    targetCheckDeleteAll: "Delete all",
    targetCheckDeleteAllTitle: "Delete every broken link that has no same-named item in the current vault",
    targetCheckRebuilt: (name, from, to) => `${name}: link rebuilt (was ${from} → now ${to})`,
    targetCheckRebuiltLine: (from, to) => `Was ${from} → now ${to}`,
    targetCheckRebuildFailed: (name, message) => `${name}: rebuild failed — ${message}`,
    targetCheckRebuildRestored: "The old link was restored.",
    targetCheckRebuildNotRestored: "The old link could not be restored; check the target location.",
    targetCheckDeleted: (name) => `Deleted link: ${name}`,
    targetCheckDeletedWithConfig: (name, config) => `Deleted link: ${name}; ${config}`,
    targetCheckConfigUnchanged: "No enable-record entries needed cleaning.",
    targetCheckConfigRemovedPlugins: (count) => `removed ${count} plugin ID(s) from community-plugins.json`,
    targetCheckConfigRemovedSnippets: (count) => `removed ${count} snippet name(s) from enabledCssSnippets`,
    targetCheckConfigClearedTheme: (theme) => `cleared cssTheme (was ${theme})`,
    targetCheckConfigFailed: (message) => `The link was deleted, but cleaning the target config failed: ${message}`,
    targetCheckConfigJoined: (parts) => parts.join(", "),
    targetCheckNoticeFound: (broken, unreachable) => `Check complete: ${broken} broken, ${unreachable} unreachable.`,
    targetCheckNoticeClear: "Check complete: no broken links.",
    targetCheckDeleteFailed: (message) => `Could not delete the link: ${message}`,
    targetCheckNotLink: (path) => `${path} is no longer a link; skipped.`,
    targetCheckLinkHealthy: "This link now points at a valid target; skipped (run the check again to refresh the state).",
    targetCheckNoSource: (name) => `No same-named item in the current vault to rebuild from: ${name}`,
    targetCheckBulkConfirmRebuild: "Rebuild these links?",
    targetCheckBulkConfirmDelete: "Delete these links?",
    targetCheckConfirmRebuildWarning:
      "Rebuilding deletes the old link first, then creates a new one pointing at the same-named item in the current vault (absolute path). If creating it fails, the old link is restored.",
    targetCheckConfirmDeleteWarning:
      "Deleting removes the link itself and cleans the matching entries in community-plugins.json and appearance.json (enabledCssSnippets / cssTheme); physical resources are not touched. The file is backed up to .bak first.",
    targetCheckConfirmOk: "Confirm",
    targetCheckConfirmCancel: "Cancel",
    targetCheckBulkRebuildDone: (ok, failed) => `Rebuild all done: ${ok} succeeded, ${failed} failed.`,
    targetCheckBulkDeleteDone: (ok, failed) => `Delete all done: ${ok} succeeded, ${failed} failed.`,
    pairHeadSource: "Current Vault",
    pairHeadTarget: "Target",
    pairPlaceholderSource: "No same-named item here",
    pairLegendTitle: "Target state:",
    targetOnlySuffix: (count) => ` (${count} more only in the target)`,
    "targetState.linked": "Linked",
    "targetState.copy": "Physical copy",
    "targetState.conflict": "Conflict",
    "targetState.broken": "Broken link",
    "targetState.unreachable": "Source unreachable",
    "targetState.unshared": "Not shared",
    "targetState.unknown": "Not checked",
    "targetState.copyHint": "The same-named item in the target is a physical copy, not from this vault.",
    sectionSettings: "Obsidian settings",
    settingsCount: (total, selected) => `${total} settings files found, ${selected} selected.`,
    settingsShare: "Share settings",
    settingsShareTitle: "Write the checked settings files to the target vault (the keys about to change are shown first)",
    settingsSelectAllTitle: "Select every settings file",
    settingsClearAllTitle: "Clear all settings file selections",
    settingsSharing: "Sharing settings…",
    settingsSelectRequired: "Select at least one settings file.",
    settingsHint:
      "Sharing settings only writes settings files under the target vault's .obsidian: keys merge at the top level, so keys present in the source override the target's and keys only in the target stay; each file is backed up to .bak and replaced atomically. Appearance excludes the enabled snippet list and the current theme; workspace / bookmarks / community-plugins are never shared. The target vault's settings state is shown in Target vault check above: tick the files you want to share here, then hover a file row to see the differences. Close Obsidian in the target vault first.",
    settingsTooltipSame: "Matches the target vault: all shared keys are identical.",
    settingsTooltipMissing: (count) => `The target vault has no such file; sharing will write ${count} keys.`,
    settingsTooltipUnknown: "Not checked yet. Press Check in Target vault check above to see the differences.",
    settingsTooltipNoSource: "This vault has no such file, so it cannot be shared.",
    settingsTooltipSourceParseError: (message) => `This vault's copy is not valid JSON, so it cannot be shared: ${message}`,
    settingsTooltipParseError: (message) =>
      `The target file is not valid JSON: ${message}; sharing will rewrite it and back up the original.`,
    settingsTooltipHeader: (fileName, changed, added, removed) => {
      const parts = [`${changed} overwritten`];
      if (added > 0) parts.push(`${added} added`);
      if (removed > 0) parts.push(`${removed} target-only kept`);
      return `${fileName}: ${parts.join(", ")}`;
    },
    settingsTooltipChanged: (pairs) => `Overwrite: ${pairs}`,
    settingsTooltipAdded: (pairs) => `Add: ${pairs}`,
    settingsTooltipRemoved: (keys) => `Target-only (kept): ${keys}`,
    settingsTooltipPair: (key, from, to) => `${key}: ${from} → ${to}`,
    settingsTooltipAddedPair: (key, to) => `${key}: ${to}`,
    settingsConfirmTitle: "Share these settings?",
    settingsConfirmHint: "These keys will be overwritten by the source values; the target files are backed up to .bak first.",
    settingsConfirmFile: (file, changed, added) => `${file}: ${changed} key(s) overwritten, ${added} added`,
    settingsConfirmUnchanged: (file) => `${file}: no change`,
    settingsConfirmOverwriteKeys: (keys) => `Overwritten: ${keys}`,
    settingsConfirmAddKeys: (keys) => `Added: ${keys}`,
    settingsConfirmOk: "Share",
    settingsSourceParseWarning: (file) => `${file} is not valid JSON; the file was skipped.`,
    settingsCoreEnabled: (names) => `Core plugins to enable: ${names}`,
    settingsCoreDisabled: (names) => `Core plugins to disable: ${names}`,
    settingsCoreNone: "No core plugin toggles change.",
    settingsVaultBoundWarning:
      "Note: attachmentFolderPath / newFileLocation / userIgnoreFilters are vault-bound keys; sharing them changes where the target vault stores files and which notes stay hidden. They are still written.",
    settingsVaultBoundLine: (warning, keys) => `${warning} (${keys})`,
    listSeparator: ", ",
    sentenceSeparator: "; ",
    settingsHotkeyConflict: (combo, from, to) =>
      `Hotkey conflict: ${combo} (source command ${from}, target command ${to})`,
    settingsHotkeyConflictInternal: (combo, a, b) => `Hotkey conflict: ${combo} (bound to ${a} and ${b} in the source)`,
    settingsNoConflict: "No hotkey conflicts found.",
    settingsResultTitle: "Settings shared",
    settingsResultSummary: (written, unchanged, failed) =>
      `Written ${written}, unchanged ${unchanged}, failed ${failed}.`,
    settingsResultFile: (file, total, changed, added) =>
      `${file}: ${total} key(s) written (${changed} overwritten / ${added} added)`,
    settingsResultUnchanged: (file) => `${file}: no change`,
    settingsResultFailed: (file, message) => `${file}: failed — ${message}`,
    settingsResultCore: (enabled, disabled) => `Target core plugins: ${enabled} enabled, ${disabled} disabled.`,
    settingsResultBackups: (count) => `${count} original file(s) backed up (.bak).`,
    settingsRestartHint: "Restart Obsidian in the target vault (or press Ctrl/Cmd+R) to apply.",
    "settingsState.unknown": "Not checked",
    "settingsState.checking": "Checking…",
    "settingsState.same": "Same",
    "settingsState.diff": (count) => `Different (${count} keys)`,
    "settingsState.missing": "Missing",
    "settingsState.noSource": "Not in this vault",
    "settingsState.unreadable": "Unreadable",
    "settingsFile.app": "Editor and file behaviour",
    "settingsFile.appearance": "Appearance (not the snippet list or current theme)",
    "settingsFile.hotkeys": "Hotkeys",
    "settingsFile.core-plugins": "Core plugin toggles",
    "settingsFile.graph": "Graph view settings",
    "settingsFile.templates": "Templates plugin settings",
    "settingsFile.daily-notes": "Daily notes plugin settings",
    "settingsFile.zk-prefixer": "ZK prefixer plugin settings",
  },
};

module.exports = class PluginShareLinker extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
    this.normalizeSettings();
    this.debugTrail = [];
    this.actionStartedAt = 0;
    this.addSettingTab(new PluginShareLinkerSettingTab(this.app, this));

    this.beginDebugSession(`onload v${this.manifest.version}`);
    this.debug("onload", `plugin v${this.manifest.version} obsidian=${(this.app && this.app.version) || "?"}`);

    if (typeof window !== "undefined") {
      this.registerDomEvent(window, "unhandledrejection", (event) => {
        const reason = event && event.reason;
        this.debug("unhandled-rejection", String((reason && (reason.stack || reason.message)) || reason));
      });
      this.registerDomEvent(window, "error", (event) => {
        this.debug("window-error", String((event && (event.message || event.error)) || event));
      });
    }

    this.addCommand({
      id: "open-plugin-share-linker",
      name: this.t("commandOpen"),
      callback: () => this.openSettings(),
    });
  }

  debug(label, detail) {
    const entry = {
      at: Date.now(),
      label,
      detail: typeof detail === "string" ? detail : JSON.stringify(detail),
    };
    this.debugTrail.push(entry);
    if (this.debugTrail.length > 120) this.debugTrail.shift();
    logDebug(label, detail);
    this.appendDebugLog(entry);
  }

  getDebugLogPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir(), "plugins", this.manifest.id, "debug.log");
  }

  appendDebugLog(entry) {
    const filePath = this.getDebugLogPath();
    if (!filePath) return;
    const offset = entry.at - (this.actionStartedAt || entry.at);
    const line = `+${String(offset).padStart(6, " ")}ms [${entry.label}] ${entry.detail}\n`;
    try {
      // 同步写：卡住时保证最后一条日志已经落盘，这是诊断的关键。
      fs.appendFileSync(filePath, line, "utf8");
    } catch (error) {
      // logging must never break sharing
    }
  }

  beginDebugSession(title) {
    this.debugTrail = [];
    this.actionStartedAt = Date.now();
    const filePath = this.getDebugLogPath();
    if (!filePath) return;
    const header = `=== ${new Date().toISOString()} ${title} (v${this.manifest.version}) pid=${process.pid}\n`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      let size = 0;
      try {
        size = fs.statSync(filePath).size;
      } catch (error) {
        size = 0;
      }
      if (size > 200 * 1024) {
        fs.writeFileSync(filePath, header, "utf8");
      } else {
        fs.appendFileSync(filePath, header, "utf8");
      }
    } catch (error) {
      // logging must never break sharing
    }
  }

  normalizeSettings() {
    const settings = this.settings;
    settings.language = settings.language === "en" ? "en" : "zh";
    settings.pageSize = normalizePageSize(Number(settings.pageSize));
    settings.targetVaultPath = typeof settings.targetVaultPath === "string" ? settings.targetVaultPath : "";
    settings.targetThemeName = typeof settings.targetThemeName === "string" ? settings.targetThemeName : "";
    settings.selectedPluginIds = normalizeStringArray(settings.selectedPluginIds);
    settings.enabledPluginIds = normalizeStringArray(settings.enabledPluginIds);
    settings.selectedThemeNames = normalizeStringArray(settings.selectedThemeNames);
    settings.selectedSnippetNames = normalizeStringArray(settings.selectedSnippetNames);
    settings.enabledSnippetNames = normalizeStringArray(settings.enabledSnippetNames);
    settings.selectedSettingFiles = normalizeStringArray(settings.selectedSettingFiles);
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
    return this.app.vault.configDir || CONFIG_DIR_NAME;
  }

  getCurrentPluginsPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir(), "plugins");
  }

  getCurrentThemesPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir(), "themes");
  }

  getCurrentSnippetsPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir(), "snippets");
  }

  async listPlugins() {
    const pluginsPath = this.getCurrentPluginsPath();
    if (!pluginsPath) return [];

    const entries = await readDirSafe(pluginsPath);
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === this.manifest.id || entry.name.startsWith(".")) continue;

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

    return plugins.sort(compareByName);
  }

  async listThemes() {
    const themesPath = this.getCurrentThemesPath();
    if (!themesPath) return [];

    const entries = await readDirSafe(themesPath);
    const themes = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const themePath = path.join(themesPath, entry.name);
      if (!(await isFile(path.join(themePath, "theme.css")))) continue;

      let manifest = null;
      try {
        manifest = JSON.parse(await fs.promises.readFile(path.join(themePath, "manifest.json"), "utf8"));
      } catch (error) {
        manifest = null;
      }

      themes.push({
        folderName: entry.name,
        name: (manifest && manifest.name) || entry.name,
        version: (manifest && manifest.version) || "",
        sourcePath: themePath,
      });
    }

    return themes.sort(compareByName);
  }

  async listSnippets() {
    const snippetsPath = this.getCurrentSnippetsPath();
    if (!snippetsPath) return [];

    const entries = await readDirSafe(snippetsPath);
    const snippets = [];

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".") || !/\.css$/i.test(entry.name)) continue;

      snippets.push({
        name: entry.name.replace(/\.css$/i, ""),
        fileName: entry.name,
        sourcePath: path.join(snippetsPath, entry.name),
      });
    }

    return snippets.sort(compareByName);
  }

  getCurrentConfigDirPath() {
    const vaultPath = this.getCurrentVaultPath();
    if (!vaultPath) return "";
    return path.join(vaultPath, this.getConfigDir());
  }

  async readCurrentSettingFiles() {
    const configDir = this.getCurrentConfigDirPath();
    const rows = [];

    for (const def of SETTING_FILES) {
      const row = {
        id: def.id,
        fileName: def.fileName,
        exists: false,
        value: {},
        parseError: null,
        sourcePath: "",
      };
      if (configDir) {
        row.sourcePath = path.join(configDir, def.fileName);
        const read = await readJsonFile(row.sourcePath, {});
        row.exists = read.existed;
        row.parseError = read.parseError;
        row.value = isPlainObject(read.value) ? read.value : {};
      }
      rows.push(row);
    }

    return rows;
  }

  async detectTargetSettings(targetVaultPath) {
    if (!normalizePathInput(targetVaultPath)) throw new Error(this.t("targetRequired"));
    const target = await this.resolveTargetVault(targetVaultPath);
    const sources = await this.readCurrentSettingFiles();
    const statuses = await scanTargetSettings(target.configDir, sources);
    this.debug("settings", `detect done files=${Object.keys(statuses).length}`);
    return { target, statuses, detectedAt: Date.now() };
  }

  async planSettingsShare(fileIds, targetVaultPath) {
    if (!normalizePathInput(targetVaultPath)) throw new Error(this.t("targetRequired"));
    const selected = new Set(normalizeStringArray(fileIds));
    const sources = (await this.readCurrentSettingFiles()).filter((row) => selected.has(row.id) && row.exists);
    if (sources.length === 0) throw new Error(this.t("settingsSelectRequired"));

    const target = await this.resolveTargetVault(targetVaultPath);
    const plan = await buildSettingsSharePlan(target.configDir, sources);
    this.debug(
      "settings",
      `plan files=${plan.files.length} conflicts=${plan.hotkeyConflicts.length} coreEnabled=${plan.corePlugins.enabled.length} coreDisabled=${plan.corePlugins.disabled.length}`
    );
    return { target, plan };
  }

  async applySettingsPlan(target, plan) {
    const outcome = await applySettingsSharePlan(target.configDir, plan, this.t.bind(this), this.debug.bind(this));
    this.debug(
      "settings",
      outcome.results.map((result) => `${result.fileName}:${result.status}`).join(", ") || "nothing to write"
    );
    logDebug("share settings", {
      target: target.configDir,
      written: outcome.results.filter((result) => result.status === "written").length,
      failed: outcome.results.filter((result) => result.status === "error").length,
    });
    return outcome;
  }

  async resolveTargetVault(targetVaultPath) {
    const normalized = normalizePathInput(targetVaultPath);
    if (!normalized) throw new Error(this.t("targetRequired"));

    this.debug("target", `start ${normalized}`);
    let stats = null;
    try {
      stats = await runWithTimeout(
        () => fs.promises.stat(normalized),
        TARGET_ACCESS_TIMEOUT_MS,
        this.t("targetAccessTimeout", Math.round(TARGET_ACCESS_TIMEOUT_MS / 1000), normalized)
      );
    } catch (error) {
      this.debug("target", `stat failed: ${error && error.message}`);
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        throw new Error(this.t("targetInvalid"));
      }
      throw error;
    }

    if (!stats || !stats.isDirectory()) throw new Error(this.t("targetInvalid"));
    this.debug("target", `stat ok, isDirectory`);

    const currentVaultPath = this.getCurrentVaultPath();
    if (currentVaultPath && path.resolve(normalized) === path.resolve(currentVaultPath)) {
      throw new Error(this.t("targetIsCurrent"));
    }

    const configDir = path.join(normalized, CONFIG_DIR_NAME);
    let isVault = false;
    try {
      const configStats = await runWithTimeout(
        () => fs.promises.stat(configDir),
        TARGET_ACCESS_TIMEOUT_MS,
        this.t("targetAccessTimeout", Math.round(TARGET_ACCESS_TIMEOUT_MS / 1000), configDir)
      );
      isVault = !!configStats && configStats.isDirectory();
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        isVault = false;
      } else {
        this.debug("target", `config stat failed: ${error && error.message}`);
        throw error;
      }
    }

    this.debug("target", `resolved isVault=${isVault}`);
    logDebug("target resolved", { targetPath: normalized, configDir, isVault });
    return { targetPath: normalized, configDir, isVault };
  }

  async inspectTarget(targetVaultPath) {
    const startedAt = Date.now();
    this.debug("check", "resolve target start");
    const target = await this.resolveTargetVault(targetVaultPath);
    this.debug("check", `resolve target done vault=${target.isVault}`);
    const probePath = path.join(target.targetPath, `.plugin-share-linker-probe-${Date.now()}`);
    let writable = false;

    this.debug("check", `probe write start ${probePath}`);
    try {
      await runWithTimeout(
        () => fs.promises.writeFile(probePath, "probe", "utf8"),
        TARGET_ACCESS_TIMEOUT_MS,
        this.t("targetAccessTimeout", Math.round(TARGET_ACCESS_TIMEOUT_MS / 1000), probePath)
      );
      writable = true;
      this.debug("check", "probe write done");
    } catch (error) {
      this.debug("check", `write probe failed: ${error && error.message}`);
    }

    this.debug("check", "probe cleanup start");
    try {
      await fs.promises.rm(probePath, { force: true });
      this.debug("check", "probe cleanup done");
    } catch (error) {
      this.debug("check", `probe cleanup failed: ${error && error.message}`);
    }

    const elapsedMs = Date.now() - startedAt;
    this.debug("check", `done writable=${writable} elapsed=${elapsedMs}ms`);
    return { target, writable, elapsedMs };
  }

  async listKnownVaults() {
    const currentVaultPath = this.getCurrentVaultPath();
    const savedPath = normalizePathInput(this.settings.targetVaultPath);
    const registry = await readVaultRegistry();
    const vaults = [];
    const seen = new Set();

    const addVault = async (rawPath, meta) => {
      const normalized = normalizePathInput(rawPath);
      if (!normalized) return;
      const resolved = path.resolve(normalized);
      if (seen.has(resolved)) return;
      seen.add(resolved);

      let exists = false;
      try {
        const stats = await fs.promises.stat(resolved);
        exists = !!stats && stats.isDirectory();
      } catch (error) {
        exists = false;
      }

      vaults.push({
        path: normalized,
        exists,
        isCurrent: !!currentVaultPath && path.resolve(currentVaultPath) === resolved,
        isSaved: !!savedPath && path.resolve(savedPath) === resolved,
        isOpen: !!meta && !!meta.open,
        lastOpenedAt: meta && typeof meta.ts === "number" ? meta.ts : 0,
      });
    };

    if (savedPath) await addVault(savedPath, null);
    for (const entry of registry.vaults) await addVault(entry.path, entry);

    vaults.sort((left, right) => {
      if (left.isSaved !== right.isSaved) return left.isSaved ? -1 : 1;
      if (left.lastOpenedAt !== right.lastOpenedAt) return right.lastOpenedAt - left.lastOpenedAt;
      return left.path.localeCompare(right.path);
    });

    this.debug("vaults", `known=${vaults.length} registry=${registry.ok ? "ok" : "error"}`);
    return { ok: registry.ok, source: registry.source, error: registry.error, vaults };
  }

  async browseTargetVault() {
    const electron = safeRequire("electron");
    const remote = (electron && (electron.remote || safeRequire("@electron/remote"))) || null;
    const dialog = remote && remote.dialog;
    if (!dialog || typeof dialog.showOpenDialog !== "function") {
      throw new Error(this.t("pickerBrowseUnsupported"));
    }

    const result = await dialog.showOpenDialog({
      title: this.t("pickerBrowseTitle"),
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return "";
    }
    return result.filePaths[0];
  }

  async scanTargetVault(targetVaultPath) {
    const startedAt = Date.now();
    this.debug("targetCheck", "scan start");
    const target = await this.resolveTargetVault(targetVaultPath);
    const scanned = await runWithTimeout(
      () => scanTargetConfigDirs(target.configDir),
      45 * 1000,
      this.t("actionTimeout", 45)
    );
    const elapsedMs = Date.now() - startedAt;
    this.debug(
      "targetCheck",
      `scan done links=${scanned.summary.totalLinks} broken=${scanned.summary.broken} unreachable=${scanned.summary.unreachable} copies=${scanned.summary.copies} elapsed=${elapsedMs}ms`
    );
    return {
      target,
      kinds: scanned.kinds,
      summary: scanned.summary,
      scannedAt: Date.now(),
      elapsedMs,
    };
  }

  async findSameNameSource(kind, name) {
    if (kind === "plugins") {
      const match = (await this.listPlugins()).find((plugin) => plugin.folderName === name);
      return match ? { name: match.folderName, sourcePath: match.sourcePath, linkType: "dir" } : null;
    }
    if (kind === "themes") {
      const match = (await this.listThemes()).find((theme) => theme.folderName === name);
      return match ? { name: match.folderName, sourcePath: match.sourcePath, linkType: "dir" } : null;
    }
    if (kind === "snippets") {
      const match = (await this.listSnippets()).find((snippet) => snippet.fileName === name);
      return match ? { name: match.fileName, sourcePath: match.sourcePath, linkType: "file" } : null;
    }
    return null;
  }

  async rebuildTargetLink(kind, name, targetVaultPath) {
    const target = await this.resolveTargetVault(targetVaultPath);
    const entryPath = path.join(target.configDir, kind, name);
    const existing = await fs.promises.lstat(entryPath).catch(() => null);
    if (!existing || !existing.isSymbolicLink()) {
      throw new Error(this.t("targetCheckNotLink", entryPath));
    }
    const validTarget = await fs.promises.stat(entryPath).catch(() => null);
    if (validTarget) throw new Error(this.t("targetCheckLinkHealthy"));

    const source = await this.findSameNameSource(kind, name);
    if (!source) throw new Error(this.t("targetCheckNoSource", name));

    const outcome = await rebuildLink(
      entryPath,
      source.sourcePath,
      source.linkType,
      this.t.bind(this),
      this.debug.bind(this)
    );
    this.debug("targetCheck", `rebuild ${kind}/${name} ${outcome.status} ${outcome.oldTarget} -> ${outcome.newTarget}`);
    return { kind, name, source: source.sourcePath, ...outcome };
  }

  async deleteTargetLink(kind, name, targetVaultPath) {
    const target = await this.resolveTargetVault(targetVaultPath);
    const entryPath = path.join(target.configDir, kind, name);
    const existing = await fs.promises.lstat(entryPath).catch(() => null);
    if (!existing || !existing.isSymbolicLink()) {
      throw new Error(this.t("targetCheckNotLink", entryPath));
    }
    const validTarget = await fs.promises.stat(entryPath).catch(() => null);
    if (validTarget) throw new Error(this.t("targetCheckLinkHealthy"));

    const linkTarget = await fs.promises.readlink(entryPath).catch(() => null);
    try {
      await fs.promises.rm(entryPath, { force: true });
    } catch (error) {
      throw new Error(this.t("targetCheckDeleteFailed", error.message));
    }

    const removed = { pluginIds: [], snippetNames: [], themeNames: [] };
    if (kind === "plugins") removed.pluginIds.push(name);
    if (kind === "themes") removed.themeNames.push(name);
    if (kind === "snippets") removed.snippetNames.push(name.replace(/\.css$/i, ""));

    let config = null;
    try {
      config = await cleanEnabledRecords(target.configDir, removed, this.t.bind(this), this.debug.bind(this));
    } catch (error) {
      this.debug("targetCheck", `clean records failed: ${error.message}`);
      config = {
        error: error.message,
        pluginsRemoved: [],
        snippetsRemoved: [],
        themeCleared: null,
        backups: [],
        warnings: [],
      };
    }

    this.debug("targetCheck", `delete ${kind}/${name} target=${linkTarget}`);
    return { kind, name, linkTarget, config };
  }

  async sharePlugins(pluginIds, targetVaultPath, mode) {
    const target = await this.resolveTargetVault(targetVaultPath);
    const selected = new Set(pluginIds);
    const plugins = (await this.listPlugins()).filter((plugin) => selected.has(plugin.id));

    if (plugins.length === 0) throw new Error(this.t("selectPluginRequired"));

    const pluginsPath = path.join(target.configDir, "plugins");
    await fs.promises.mkdir(pluginsPath, { recursive: true });

    const results = [];
    this.debug("plugins", `start mode=${mode} count=${plugins.length}`);
    for (const plugin of plugins) {
      const targetPath = path.join(pluginsPath, plugin.folderName);
      results.push(await shareEntry(plugin, targetPath, mode, "dir", this.t.bind(this), this.debug.bind(this)));
    }
    this.debug("plugins", results.map((result) => `${result.entry.name}:${result.status}`).join(", "));
    logDebug("share plugins", { mode, target: target.configDir, count: plugins.length });

    const landedIds = results.filter((result) => isLanded(result.status)).map((result) => result.entry.id);
    const enabledIds = this.settings.enabledPluginIds.filter((id) => landedIds.includes(id));
    const config = enabledIds.length
      ? await this.writeTargetConfig(target.configDir, { pluginIds: enabledIds }, this.t.bind(this))
      : null;

    return { results, config, target };
  }

  async shareThemes(themeNames, targetVaultPath, mode) {
    const target = await this.resolveTargetVault(targetVaultPath);
    const selected = new Set(themeNames);
    const themes = (await this.listThemes()).filter((theme) => selected.has(theme.folderName));

    if (themes.length === 0) throw new Error(this.t("selectThemeRequired"));

    const themesPath = path.join(target.configDir, "themes");
    await fs.promises.mkdir(themesPath, { recursive: true });

    const results = [];
    this.debug("themes", `start mode=${mode} count=${themes.length}`);
    for (const theme of themes) {
      const targetPath = path.join(themesPath, theme.folderName);
      results.push(await shareEntry(theme, targetPath, mode, "dir", this.t.bind(this), this.debug.bind(this)));
    }
    this.debug("themes", results.map((result) => `${result.entry.name}:${result.status}`).join(", "));
    logDebug("share themes", { mode, target: target.configDir, count: themes.length });

    const landedThemes = results.filter((result) => isLanded(result.status)).map((result) => result.entry);
    const themeName = await this.resolveTargetTheme(target, landedThemes);
    const config = themeName ? await this.writeTargetConfig(target.configDir, { themeName }, this.t.bind(this)) : null;

    return { results, config, target };
  }

  async shareSnippets(snippetNames, targetVaultPath, mode) {
    const target = await this.resolveTargetVault(targetVaultPath);
    const selected = new Set(snippetNames);
    const snippets = (await this.listSnippets()).filter((snippet) => selected.has(snippet.name));

    if (snippets.length === 0) throw new Error(this.t("selectSnippetRequired"));

    const snippetsPath = path.join(target.configDir, "snippets");
    await fs.promises.mkdir(snippetsPath, { recursive: true });

    const results = [];
    this.debug("snippets", `start mode=${mode} count=${snippets.length}`);
    for (const snippet of snippets) {
      const targetPath = path.join(snippetsPath, snippet.fileName);
      results.push(await shareEntry(snippet, targetPath, mode, "file", this.t.bind(this), this.debug.bind(this)));
    }
    this.debug("snippets", results.map((result) => `${result.entry.name}:${result.status}`).join(", "));
    logDebug("share snippets", { mode, target: target.configDir, count: snippets.length });

    const landedNames = results.filter((result) => isLanded(result.status)).map((result) => result.entry.name);
    const enabledNames = this.settings.enabledSnippetNames.filter((name) => landedNames.includes(name));
    const config = enabledNames.length
      ? await this.writeTargetConfig(target.configDir, { snippetNames: enabledNames }, this.t.bind(this))
      : null;

    return { results, config, target };
  }

  async createLinks(pluginIds, targetVaultPath) {
    return this.sharePlugins(pluginIds, targetVaultPath, "symlink");
  }

  async copyPlugins(pluginIds, targetVaultPath) {
    return this.sharePlugins(pluginIds, targetVaultPath, "copy");
  }

  async createThemeLinks(themeNames, targetVaultPath) {
    return this.shareThemes(themeNames, targetVaultPath, "symlink");
  }

  async copyThemes(themeNames, targetVaultPath) {
    return this.shareThemes(themeNames, targetVaultPath, "copy");
  }

  async createSnippetLinks(snippetNames, targetVaultPath) {
    return this.shareSnippets(snippetNames, targetVaultPath, "symlink");
  }

  async copySnippets(snippetNames, targetVaultPath) {
    return this.shareSnippets(snippetNames, targetVaultPath, "copy");
  }

  async resolveTargetTheme(target, landedThemes) {
    const explicitTheme = this.settings.targetThemeName;
    if (explicitTheme) {
      return landedThemes.some((theme) => theme.folderName === explicitTheme) ? explicitTheme : null;
    }

    if (landedThemes.length !== 1) return null;

    const appearanceFile = path.join(target.configDir, "appearance.json");
    const { value } = await readJsonFile(appearanceFile, {});
    const currentTheme = isPlainObject(value) && typeof value.cssTheme === "string" ? value.cssTheme.trim() : "";
    if (currentTheme) return null;

    return landedThemes[0].folderName;
  }

  async writeTargetConfig(configDir, changes) {
    const summary = { pluginsEnabled: [], snippetsEnabled: [], themeSet: null, warnings: [], backups: [] };

    if (Array.isArray(changes.pluginIds) && changes.pluginIds.length) {
      const result = await writeCommunityPlugins(configDir, changes.pluginIds, this.t.bind(this), this.debug.bind(this));
      summary.pluginsEnabled = result.added;
      summary.warnings.push(...result.warnings);
      if (result.backupPath) summary.backups.push(result.backupPath);
    }

    if ((Array.isArray(changes.snippetNames) && changes.snippetNames.length) || changes.themeName) {
      const result = await writeAppearanceConfig(
        configDir,
        { snippetNames: changes.snippetNames || [], themeName: changes.themeName || "" },
        this.t.bind(this),
        this.debug.bind(this)
      );
      summary.snippetsEnabled = result.snippetsAdded;
      summary.themeSet = result.themeSet;
      summary.warnings.push(...result.warnings);
      if (result.backupPath) summary.backups.push(result.backupPath);
    }

    if (summary.pluginsEnabled.length > 0) this.debug("config", `plugins +${summary.pluginsEnabled.length}`);
    if (summary.snippetsEnabled.length > 0) this.debug("config", `snippets +${summary.snippetsEnabled.length}`);
    if (summary.themeSet) this.debug("config", `theme ${summary.themeSet}`);
    if (summary.warnings.length > 0) this.debug("config", `warnings ${summary.warnings.length}`);

    if (
      summary.pluginsEnabled.length === 0 &&
      summary.snippetsEnabled.length === 0 &&
      !summary.themeSet &&
      summary.warnings.length === 0
    ) {
      return null;
    }

    logDebug("target config written", summary);
    return summary;
  }
};

class PluginShareLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugins = [];
    this.themes = [];
    this.snippets = [];
    this.currentPage = 1;
    this.actionResults = { plugins: null, themes: null, snippets: null };
    this.configState = { pluginsEnabled: [], snippetsEnabled: [], themeSet: null };
    this.warnings = [];
    this.notes = [];
    this.themeActionSeen = false;
    this.busy = false;
    this.targetInventory = null;
    this.targetCheckBusy = false;
    this.targetScanAt = 0;
    this.settingsCheckAt = 0;
    this.targetScanError = "";
    this.settingsCheckError = "";
    this.targetScanToken = 0;
    this.settingsCheckToken = 0;
    this.targetCheckRunId = 0;
    this.settingFiles = [];
    this.settingStatuses = null;
    this.settingResults = null;
  }

  async display() {
    const { containerEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    this.busy = false;
    containerEl.empty();
    containerEl.addClass("plugin-share-linker-settings");

    const headerEl = containerEl.createDiv("plugin-share-linker-header");
    headerEl.createEl("h2", { text: t("title") });
    headerEl.createSpan({ cls: "plugin-share-linker-version", text: `v${this.plugin.manifest.version}` });
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
            this.invalidateAllResults();
          });
        text.inputEl.addClass("plugin-share-linker-path-input");
      });
    containerEl.createDiv("plugin-share-linker-hint").setText(t("targetVaultHint"));

    const targetToolsEl = containerEl.createDiv("plugin-share-linker-target-tools");

    const pickButton = new ButtonComponent(targetToolsEl)
      .setIcon("folder-search")
      .onClick(() => this.openVaultPicker());
    setToolbarButtonLabel(pickButton, t("pickerOpen"), t("pickerOpenTitle"));

    const browseButton = new ButtonComponent(targetToolsEl)
      .setIcon("folder-open")
      .onClick(() => this.browseVault());
    setToolbarButtonLabel(browseButton, t("pickerBrowse"), t("pickerBrowseTitle"));

    const checkButton = new ButtonComponent(targetToolsEl)
      .setIcon("search")
      .onClick(() => this.checkTargetPath());
    setToolbarButtonLabel(checkButton, t("checkTarget"), t("checkTargetTitle"));

    this.buildTargetCheckSection(containerEl);
    this.buildSettingsSection(containerEl);
    this.buildPluginsSection(containerEl);
    this.buildThemesSection(containerEl);
    this.buildSnippetsSection(containerEl);

    this.resultsEl = containerEl.createDiv("plugin-share-linker-results");

    await this.refreshAll();
  }

  buildPluginsSection(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const section = createSection(containerEl, t("sectionPlugins"));
    this.pluginsCountEl = section.bodyEl.createDiv("plugin-share-linker-count");
    this.pluginsToolbarEl = section.bodyEl.createDiv("plugin-share-linker-toolbar");
    this.pluginsPaginationEl = section.bodyEl.createDiv("plugin-share-linker-pagination");
    this.pluginsTargetCheckEl = section.bodyEl.createDiv("plugin-share-linker-target-check-inline");
    this.renderStatusLegend(section.bodyEl);
    this.createPairHead(section.bodyEl);
    this.pluginsListEl = section.bodyEl.createDiv("plugin-share-linker-list");
    section.bodyEl.createDiv("plugin-share-linker-hint").setText(t("pluginEnableHint"));

    const refreshButton = new ButtonComponent(this.pluginsToolbarEl)
      .setIcon("refresh-cw")
      .onClick(() => this.refreshAll());
    setToolbarButtonLabel(refreshButton, t("refresh"), t("refreshTitle"));

    const selectAllButton = new ButtonComponent(this.pluginsToolbarEl)
      .setIcon("check-square")
      .onClick(async () => {
        this.plugin.settings.selectedPluginIds = this.plugins.map((plugin) => plugin.id);
        this.plugin.settings.enabledPluginIds = this.plugins.map((plugin) => plugin.id);
        await this.plugin.saveSettings();
        this.renderPlugins();
      });
    setToolbarButtonLabel(selectAllButton, t("selectAll"), t("selectAllTitle"));

    const clearButton = new ButtonComponent(this.pluginsToolbarEl)
      .setIcon("square")
      .onClick(async () => {
        this.plugin.settings.selectedPluginIds = [];
        this.plugin.settings.enabledPluginIds = [];
        await this.plugin.saveSettings();
        this.renderPlugins();
      });
    setToolbarButtonLabel(clearButton, t("clear"), t("clearTitle"));

    this.addActionButtons(this.pluginsToolbarEl, "plugins");
  }

  buildThemesSection(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const section = createSection(containerEl, t("sectionThemes"));
    this.themesCountEl = section.bodyEl.createDiv("plugin-share-linker-count");
    this.themesToolbarEl = section.bodyEl.createDiv("plugin-share-linker-toolbar");
    this.themesTargetCheckEl = section.bodyEl.createDiv("plugin-share-linker-target-check-inline");
    this.createPairHead(section.bodyEl);
    this.themesListEl = section.bodyEl.createDiv("plugin-share-linker-list");

    const radioEl = section.bodyEl.createDiv("plugin-share-linker-radio");
    this.themesRadioEl = radioEl;

    section.bodyEl.createDiv("plugin-share-linker-hint").setText(t("themeRadioHint"));

    this.addActionButtons(this.themesToolbarEl, "themes");
  }

  buildSnippetsSection(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const section = createSection(containerEl, t("sectionSnippets"));
    this.snippetsCountEl = section.bodyEl.createDiv("plugin-share-linker-count");
    this.snippetsToolbarEl = section.bodyEl.createDiv("plugin-share-linker-toolbar");
    this.snippetsTargetCheckEl = section.bodyEl.createDiv("plugin-share-linker-target-check-inline");
    this.createPairHead(section.bodyEl);
    this.snippetsListEl = section.bodyEl.createDiv("plugin-share-linker-list");
    section.bodyEl.createDiv("plugin-share-linker-hint").setText(t("snippetEnableHint"));

    this.addActionButtons(this.snippetsToolbarEl, "snippets");
  }

  buildSettingsSection(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const section = createSection(containerEl, t("sectionSettings"));
    this.settingsCountEl = section.bodyEl.createDiv("plugin-share-linker-count");
    this.settingsToolbarEl = section.bodyEl.createDiv("plugin-share-linker-toolbar");

    const selectAllButton = new ButtonComponent(this.settingsToolbarEl)
      .setIcon("check-square")
      .onClick(async () => {
        // Only files that exist in the current vault can be shared; ticking the rest does nothing.
        this.plugin.settings.selectedSettingFiles = this.getSettingRows()
          .filter((row) => row.exists)
          .map((row) => row.id);
        await this.plugin.saveSettings();
        this.renderSettings();
      });
    setToolbarButtonLabel(selectAllButton, t("selectAll"), t("settingsSelectAllTitle"));

    const clearButton = new ButtonComponent(this.settingsToolbarEl)
      .setIcon("square")
      .onClick(async () => {
        this.plugin.settings.selectedSettingFiles = [];
        await this.plugin.saveSettings();
        this.renderSettings();
      });
    setToolbarButtonLabel(clearButton, t("clear"), t("settingsClearAllTitle"));

    const shareButton = new ButtonComponent(this.settingsToolbarEl)
      .setIcon("upload")
      .setCta()
      .onClick(async () => {
        await this.runSettingsShareAction();
      });
    this.settingsShareButton = shareButton;
    setToolbarButtonLabel(shareButton, t("settingsShare"), t("settingsShareTitle"));

    section.bodyEl.createDiv("plugin-share-linker-hint").setText(t("settingsHint"));
    this.settingsListEl = section.bodyEl.createDiv("plugin-share-linker-settings-list");
    this.settingsResultEl = section.bodyEl.createDiv("plugin-share-linker-settings-results");
    this.renderSettings();
  }

  getSettingRows() {
    if (Array.isArray(this.settingFiles) && this.settingFiles.length > 0) return this.settingFiles;
    return SETTING_FILES.map((def) => ({
      id: def.id,
      fileName: def.fileName,
      exists: false,
      value: {},
      parseError: null,
      sourcePath: "",
    }));
  }

  selectedSettingIds() {
    const known = new Set(this.getSettingRows().map((row) => row.id));
    return this.plugin.settings.selectedSettingFiles.filter((id) => known.has(id));
  }

  settingStatusesSummary() {
    const summary = { same: 0, diff: 0, missing: 0 };
    if (!this.settingStatuses) return summary;

    for (const row of this.getSettingRows()) {
      if (!row.exists || row.parseError) continue;
      const status = this.settingStatuses[row.id];
      if (!status) continue;
      if (summary[status.state] !== undefined) summary[status.state] += 1;
    }
    return summary;
  }

  settingChipState(row) {
    const t = this.plugin.t.bind(this.plugin);
    if (!row.exists) return { key: "no-source", text: t("settingsState.noSource") };
    if (row.parseError) return { key: "unreadable", text: t("settingsState.unreadable") };
    if (this.targetCheckBusy && !this.settingStatuses) {
      return { key: "checking", text: t("settingsState.checking") };
    }
    const status = this.settingStatuses ? this.settingStatuses[row.id] : null;
    if (!status) return { key: "unknown", text: t("settingsState.unknown") };
    if (status.state === "same") return { key: "same", text: t("settingsState.same") };
    if (status.state === "diff") return { key: "diff", text: t("settingsState.diff", status.count) };
    return { key: "missing", text: t("settingsState.missing") };
  }

  settingsTooltip(row) {
    const t = this.plugin.t.bind(this.plugin);
    if (!row.exists) return t("settingsTooltipNoSource");
    if (row.parseError) return t("settingsTooltipSourceParseError", row.parseError);
    const status = this.settingStatuses ? this.settingStatuses[row.id] : null;
    if (!status) return t("settingsTooltipUnknown");
    if (status.state === "same") return t("settingsTooltipSame");
    if (status.state === "missing") return t("settingsTooltipMissing", status.count);

    const changed = Array.isArray(status.changed) ? status.changed : [];
    const added = Array.isArray(status.added) ? status.added : [];
    const removed = Array.isArray(status.removed) ? status.removed : [];
    const lines = [t("settingsTooltipHeader", row.fileName, changed.length, added.length, removed.length)];

    if (changed.length > 0) {
      const pairs = changed.map((item) =>
        t("settingsTooltipPair", item.key, formatSettingValue(item.from), formatSettingValue(item.to))
      );
      lines.push(t("settingsTooltipChanged", this.formatSettingsKeys(pairs)));
    }
    if (added.length > 0) {
      const pairs = added.map((item) => t("settingsTooltipAddedPair", item.key, formatSettingValue(item.to)));
      lines.push(t("settingsTooltipAdded", this.formatSettingsKeys(pairs)));
    }
    if (removed.length > 0) {
      lines.push(t("settingsTooltipRemoved", this.formatSettingsKeys(removed)));
    }
    if (status.parseError) lines.push(t("settingsTooltipParseError", status.parseError));
    return lines.join("\n");
  }

  renderSettings() {
    if (!this.settingsListEl || !this.settingsCountEl) return;

    const t = this.plugin.t.bind(this.plugin);
    const rows = this.getSettingRows();
    const selectedIds = this.selectedSettingIds();
    const selected = new Set(selectedIds);

    this.settingsCountEl.setText(t("settingsCount", rows.length, selected.size));
    if (this.settingsShareButton) this.settingsShareButton.setDisabled(selected.size === 0 || this.busy);

    this.settingsListEl.empty();
    for (const row of rows) {
      this.renderSettingRow(row, selected);
    }
  }

  renderSettingRow(row, selected) {
    const t = this.plugin.t.bind(this.plugin);
    const rowEl = this.settingsListEl.createDiv("plugin-share-linker-settings-row");

    const labelEl = rowEl.createEl("label", { cls: "plugin-share-linker-check" });
    const boxEl = labelEl.createEl("input", { type: "checkbox" });
    labelEl.createSpan({ text: t("share") });
    boxEl.checked = selected.has(row.id);
    boxEl.addEventListener("change", async () => {
      const next = new Set(this.selectedSettingIds());
      if (boxEl.checked) next.add(row.id);
      else next.delete(row.id);
      this.plugin.settings.selectedSettingFiles = Array.from(next);
      await this.plugin.saveSettings();
      this.renderSettings();
    });

    const contentEl = rowEl.createDiv("plugin-share-linker-settings-content");
    const titleEl = contentEl.createDiv("plugin-share-linker-settings-title");
    titleEl.createEl("code", { text: row.fileName });
    const chip = this.settingChipState(row);
    titleEl.createSpan({
      cls: `plugin-share-linker-target-chip plugin-share-linker-settings-chip-${chip.key}`,
      text: chip.text,
    });
    contentEl.createDiv("plugin-share-linker-settings-desc").setText(t(`settingsFile.${row.id}`));

    if (row.exists) {
      const actionsEl = rowEl.createDiv("plugin-share-linker-settings-actions");
      const shareOneButton = actionsEl.createEl("button", {
        cls: "plugin-share-linker-settings-share-one",
        text: t("targetCheckShareItem"),
      });
      shareOneButton.title = t("targetCheckShareItemTitle");
      shareOneButton.setAttribute("aria-label", t("targetCheckShareItem"));
      shareOneButton.disabled = this.busy;
      shareOneButton.addEventListener("click", () => this.runSettingsShareAction([row.id]));
    }

    const tooltip = this.settingsTooltip(row);
    if (tooltip) {
      rowEl.title = tooltip;
      rowEl.setAttribute("title", tooltip);
    }
  }

  formatSettingsKeys(keys) {
    const list = Array.isArray(keys) ? keys : [];
    const shown = list.slice(0, 8);
    return shown.join(this.plugin.t("listSeparator")) + (list.length > shown.length ? "…" : "");
  }

  hotkeyConflictText(conflict) {
    const t = this.plugin.t.bind(this.plugin);
    return conflict.internal
      ? t("settingsHotkeyConflictInternal", conflict.combo, conflict.sourceCommand, conflict.targetCommand)
      : t("settingsHotkeyConflict", conflict.combo, conflict.sourceCommand, conflict.targetCommand);
  }

  async runSettingsShareAction(fileIds) {
    if (this.busy) return;

    const t = this.plugin.t.bind(this.plugin);
    const requested = normalizeStringArray(fileIds);
    const ids = requested.length > 0 ? requested : this.selectedSettingIds();
    if (ids.length === 0) {
      this.showError(t("settingsSelectRequired"));
      return;
    }

    this.busy = true;
    this.plugin.beginDebugSession("plan-settings");
    this.renderTargetCheck();
    const startedAt = Date.now();
    this.setStatusMessage(t("busyProgress", t("settingsSharing"), 0));
    const ticker = setInterval(() => {
      if (!this.busy) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      this.setStatusMessage(t("busyProgress", t("settingsSharing"), seconds));
      this.plugin.debug("tick", `settings-plan ${seconds}s`);
    }, 1000);

    let planned = null;
    try {
      planned = await runWithTimeout(
        () => this.plugin.planSettingsShare(ids, this.plugin.settings.targetVaultPath),
        45 * 1000,
        t("actionTimeout", 45)
      );
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.plugin.debug("settings", `plan failed: ${message}`);
      this.showError(message);
      this.renderDebugTrail();
      new Notice(t("shareFailed", message));
    } finally {
      this.busy = false;
      clearInterval(ticker);
      this.renderSettings();
      this.renderTargetCheck();
    }

    if (planned) {
      this.renderResults();
      this.openSettingsConfirm(planned);
    }
  }

  openSettingsConfirm({ target, plan }) {
    const t = this.plugin.t.bind(this.plugin);
    const files = plan.files.map((file) => {
      const touched = file.changed.length + file.added.length;
      const details = [];
      if (file.changed.length > 0) {
        details.push(t("settingsConfirmOverwriteKeys", this.formatSettingsKeys(file.changed)));
      }
      if (file.added.length > 0) details.push(t("settingsConfirmAddKeys", this.formatSettingsKeys(file.added)));
      return {
        summary:
          touched === 0
            ? t("settingsConfirmUnchanged", file.fileName)
            : t("settingsConfirmFile", file.fileName, file.changed.length, file.added.length),
        details: details.join(t("sentenceSeparator")),
      };
    });

    const modal = new SettingsConfirmModal(this.app, {
      title: t("settingsConfirmTitle"),
      hint: t("settingsConfirmHint"),
      files,
      warnings: [
        ...plan.sourceWarnings.map((file) => t("settingsSourceParseWarning", file)),
        ...plan.warnings.map((filePath) => t("configParseWarning", filePath)),
      ],
      coreEnabled:
        plan.sawCorePlugins && plan.corePlugins.enabled.length > 0
          ? t("settingsCoreEnabled", plan.corePlugins.enabled.join(t("listSeparator")))
          : "",
      coreDisabled:
        plan.sawCorePlugins && plan.corePlugins.disabled.length > 0
          ? t("settingsCoreDisabled", plan.corePlugins.disabled.join(t("listSeparator")))
          : "",
      conflicts: plan.hotkeyConflicts.map((conflict) => this.hotkeyConflictText(conflict)),
      vaultWarning:
        plan.vaultBoundKeys.length > 0
          ? t("settingsVaultBoundLine", t("settingsVaultBoundWarning"), this.formatSettingsKeys(plan.vaultBoundKeys))
          : "",
      confirmLabel: t("settingsConfirmOk"),
      cancelLabel: t("pickerCancel"),
      onConfirm: () => {
        this.executeSettingsShare({ target, plan });
      },
    });
    modal.open();
  }

  async executeSettingsShare({ target, plan }) {
    if (this.busy) return;

    const t = this.plugin.t.bind(this.plugin);
    this.busy = true;
    this.plugin.beginDebugSession("share-settings");
    this.renderTargetCheck();
    const startedAt = Date.now();
    this.setStatusMessage(t("busyProgress", t("settingsSharing"), 0));
    const ticker = setInterval(() => {
      if (!this.busy) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      this.setStatusMessage(t("busyProgress", t("settingsSharing"), seconds));
      this.plugin.debug("tick", `settings-write ${seconds}s`);
    }, 1000);

    try {
      const outcome = await runWithTimeout(
        () => this.plugin.applySettingsPlan(target, plan),
        ACTION_TIMEOUT_MS,
        t("actionTimeout", Math.round(ACTION_TIMEOUT_MS / 1000))
      );
      this.settingResults = { target, plan, results: outcome.results };
      // Settings files changed in the target: their statuses are stale, the link scan is not.
      this.invalidateSettingsResults();
      this.renderSettingsResults();
      this.renderResults();

      const written = outcome.results.filter((result) => result.status === "written").length;
      const failed = outcome.results.filter((result) => result.status === "error").length;
      new Notice(t("settingsResultSummary", written, outcome.results.length - written - failed, failed));
      this.plugin.debug("settings", `share done written=${written} failed=${failed}`);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.plugin.debug("settings", `share failed: ${message}`);
      this.showError(message);
      this.renderDebugTrail();
      new Notice(t("shareFailed", message));
    } finally {
      this.busy = false;
      clearInterval(ticker);
      this.renderSettings();
      this.renderTargetCheck();
    }
  }

  renderSettingsResults() {
    if (!this.settingsResultEl) return;

    const t = this.plugin.t.bind(this.plugin);
    this.settingsResultEl.empty();
    if (!this.settingResults) return;

    const { plan, results } = this.settingResults;
    const written = results.filter((result) => result.status === "written").length;
    const failed = results.filter((result) => result.status === "error").length;
    const unchanged = results.filter((result) => result.status === "unchanged").length;

    const cardEl = this.settingsResultEl.createDiv("plugin-share-linker-result-card");
    cardEl.createDiv("plugin-share-linker-result-title").setText(t("settingsResultTitle"));
    const linesEl = cardEl.createDiv("plugin-share-linker-result-lines");
    linesEl.createDiv("plugin-share-linker-result-line").setText(t("settingsResultSummary", written, unchanged, failed));

    for (const result of results) {
      const lineEl = linesEl.createDiv("plugin-share-linker-result-line");
      if (result.status === "written") {
        lineEl.setText(
          t(
            "settingsResultFile",
            result.fileName,
            result.changed.length + result.added.length,
            result.changed.length,
            result.added.length
          )
        );
      } else if (result.status === "unchanged") {
        lineEl.setText(t("settingsResultUnchanged", result.fileName));
      } else {
        lineEl.addClass("plugin-share-linker-result-error");
        lineEl.setText(t("settingsResultFailed", result.fileName, result.message || ""));
      }
    }

    if (plan.sawCorePlugins) {
      if (plan.corePlugins.enabled.length === 0 && plan.corePlugins.disabled.length === 0) {
        linesEl.createDiv("plugin-share-linker-config-line").setText(t("settingsCoreNone"));
      } else {
        linesEl
          .createDiv("plugin-share-linker-config-line")
          .setText(t("settingsResultCore", plan.corePlugins.enabled.length, plan.corePlugins.disabled.length));
      }
    }

    if (plan.sawHotkeys) {
      if (plan.hotkeyConflicts.length === 0) {
        linesEl.createDiv("plugin-share-linker-config-line").setText(t("settingsNoConflict"));
      } else {
        for (const conflict of plan.hotkeyConflicts) {
          linesEl.createDiv("plugin-share-linker-warning").setText(this.hotkeyConflictText(conflict));
        }
      }
    }

    if (plan.vaultBoundKeys.length > 0) {
      linesEl
        .createDiv("plugin-share-linker-warning")
        .setText(t("settingsVaultBoundLine", t("settingsVaultBoundWarning"), this.formatSettingsKeys(plan.vaultBoundKeys)));
    }

    const backups = results.filter((result) => result.backupPath).length;
    if (backups > 0) {
      linesEl.createDiv("plugin-share-linker-config-line").setText(t("settingsResultBackups", backups));
    }
    if (written > 0) {
      linesEl.createDiv("plugin-share-linker-restart-hint").setText(t("settingsRestartHint"));
    }
  }

  createPairHead(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const headEl = containerEl.createDiv("plugin-share-linker-pair-head");
    headEl.createSpan({ cls: "plugin-share-linker-pair-head-left", text: t("pairHeadSource") });
    headEl.createSpan({ cls: "plugin-share-linker-pair-head-right", text: t("pairHeadTarget") });
    return headEl;
  }

  renderTargetCell(pairEl, row) {
    const t = this.plugin.t.bind(this.plugin);
    const cellEl = pairEl.createDiv("plugin-share-linker-pair-right");
    const state = this.targetInventory ? describeTargetRow(row) : { key: "unknown", detail: "" };
    cellEl.createSpan({
      cls: `plugin-share-linker-target-chip plugin-share-linker-target-${state.key}`,
      text: t(`targetState.${state.key}`),
    });

    if (row.target && row.target.rebuiltFrom) {
      cellEl
        .createDiv("plugin-share-linker-target-path")
        .setText(t("targetCheckRebuiltLine", row.target.rebuiltFrom, row.target.absoluteTarget || ""));
    } else if (state.detail) {
      cellEl.createDiv("plugin-share-linker-target-path").createEl("code", { text: t("targetCheckPointsTo", state.detail) });
    } else if (row.target && row.target.status === "copy") {
      cellEl.createDiv("plugin-share-linker-target-path").setText(t("targetState.copyHint"));
    }

    if (row.target && row.target.status === "unreachable") {
      const root = row.target.absoluteTarget
        ? path.parse(row.target.absoluteTarget).root || row.target.absoluteTarget
        : "?";
      cellEl.createDiv("plugin-share-linker-target-check-hint").setText(t("targetCheckUnreachableHint", root));
    } else if (row.target && row.target.status === "broken") {
      const actionsEl = cellEl.createDiv("plugin-share-linker-target-check-row-actions");
      if (this.hasSameNameSource(row.kind, row.name)) {
        this.createTargetCheckButton(
          actionsEl,
          t("targetCheckRebuild"),
          t("targetCheckRebuildTitle"),
          () => this.rebuildSingle(row.target)
        );
      }
      this.createTargetCheckButton(
        actionsEl,
        t("targetCheckDelete"),
        t("targetCheckDeleteTitle"),
        () => this.deleteSingle(row.target),
        true
      );
    }

    return cellEl;
  }

  renderStatusLegend(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const legendEl = containerEl.createDiv("plugin-share-linker-legend");
    legendEl.createSpan({ cls: "plugin-share-linker-legend-title", text: t("pairLegendTitle") });
    for (const key of ["linked", "copy", "conflict", "broken", "unreachable", "unshared", "unknown"]) {
      legendEl.createSpan({
        cls: `plugin-share-linker-target-chip plugin-share-linker-target-${key}`,
        text: t(`targetState.${key}`),
      });
    }
    return legendEl;
  }

  buildTargetCheckSection(containerEl) {
    const t = this.plugin.t.bind(this.plugin);
    const section = createSection(containerEl, t("targetCheckTitle"));
    const headEl = section.bodyEl.createDiv("plugin-share-linker-target-check-head");
    this.targetCheckBadgeEl = headEl.createSpan({ cls: "plugin-share-linker-target-check-badge" });
    const detectButton = new ButtonComponent(headEl)
      .setIcon("activity")
      .onClick(() => this.runTargetCheck());
    setToolbarButtonLabel(detectButton, t("targetCheckDetect"), t("targetCheckDetectTitle"));
    this.targetCheckButton = detectButton;
    this.targetCheckStatusEl = headEl.createSpan({ cls: "plugin-share-linker-target-check-status" });

    section.bodyEl.createDiv("plugin-share-linker-hint").setText(t("targetCheckSectionHint"));
    this.targetCheckSummaryEl = section.bodyEl.createDiv("plugin-share-linker-target-check-summary");
    this.targetCheckSettingsSummaryEl = section.bodyEl.createDiv("plugin-share-linker-target-check-summary");
    this.renderTargetCheck();
  }

  formatTargetCheckTime(atMs) {
    const date = new Date(atMs || Date.now());
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  describeTargetCheckFailure(segment, message, atMs) {
    const t = this.plugin.t.bind(this.plugin);
    return atMs
      ? t("targetCheckFailedKept", segment, message, this.formatTargetCheckTime(atMs))
      : t("targetCheckFailed", segment, message);
  }

  composeTargetCheckDone() {
    const t = this.plugin.t.bind(this.plugin);
    const summary = this.targetInventory ? this.targetInventory.summary : null;
    const settings = this.settingStatusesSummary();
    const anomalies = summary ? summary.broken + summary.unreachable : 0;
    const compared = this.getSettingRows().filter(
      (row) => row.exists && !row.parseError && this.settingStatuses && this.settingStatuses[row.id]
    );
    const allSame =
      compared.length > 0 && compared.every((row) => this.settingStatuses[row.id].state === "same");
    if (anomalies === 0 && allSame && settings.diff + settings.missing === 0) {
      return t("targetCheckStatusClear");
    }
    return t(
      "targetCheckStatusDone",
      summary ? summary.broken : 0,
      summary ? summary.unreachable : 0,
      settings.same,
      settings.diff,
      settings.missing
    );
  }

  targetCheckStatusText() {
    const t = this.plugin.t.bind(this.plugin);
    if (this.targetCheckBusy) return t("targetCheckChecking");
    const failures = [];
    if (this.targetScanError) {
      failures.push(
        this.describeTargetCheckFailure(
          t("targetCheckSegmentLinks"),
          this.targetScanError,
          this.targetInventory ? this.targetScanAt : 0
        )
      );
    }
    if (this.settingsCheckError) {
      failures.push(
        this.describeTargetCheckFailure(
          t("targetCheckSegmentSettings"),
          this.settingsCheckError,
          this.settingStatuses ? this.settingsCheckAt : 0
        )
      );
    }
    if (failures.length === 0) {
      if (this.targetInventory && this.settingStatuses) return this.composeTargetCheckDone();
      if (this.targetInventory) return t("targetCheckStaleSettings", this.formatTargetCheckTime(this.targetScanAt));
      if (this.settingStatuses) return t("targetCheckStaleLinks", this.formatTargetCheckTime(this.settingsCheckAt));
      return t("targetCheckNotScanned");
    }

    const updated = [];
    if (!this.targetScanError && this.targetInventory && this.targetScanAt) updated.push(t("targetCheckSegmentLinks"));
    if (!this.settingsCheckError && this.settingStatuses && this.settingsCheckAt) {
      updated.push(t("targetCheckSegmentSettings"));
    }
    if (updated.length > 0) {
      const latest = Math.max(this.targetScanAt || 0, this.settingsCheckAt || 0);
      failures.push(t("targetCheckUpdatedSegments", updated.join(t("listSeparator")), this.formatTargetCheckTime(latest)));
    }
    return failures.join(t("sentenceSeparator"));
  }

  renderTargetCheck() {
    const t = this.plugin.t.bind(this.plugin);
    const inventory = this.targetInventory;
    const summary = inventory ? inventory.summary : null;

    if (this.targetCheckBadgeEl) {
      if (!inventory) {
        this.targetCheckBadgeEl.setText("");
        this.targetCheckBadgeEl.addClass("is-hidden");
      } else {
        const found = summary.broken + summary.unreachable;
        this.targetCheckBadgeEl.removeClass("is-hidden");
        this.targetCheckBadgeEl.setText(
          found > 0 ? t("targetCheckBadge", summary.broken, summary.unreachable) : t("targetCheckBadgeNone")
        );
        if (found === 0) this.targetCheckBadgeEl.addClass("is-clear");
        else this.targetCheckBadgeEl.removeClass("is-clear");
      }
    }
    if (this.targetCheckStatusEl) this.targetCheckStatusEl.setText(this.targetCheckStatusText());
    if (this.targetCheckButton && typeof this.targetCheckButton.setDisabled === "function") {
      this.targetCheckButton.setDisabled(this.targetCheckBusy || this.busy);
    }

    if (this.targetCheckSummaryEl) {
      this.targetCheckSummaryEl.empty();
      if (inventory) {
        this.targetCheckSummaryEl.setText(
          t(
            "targetCheckSummary",
            summary.total,
            summary.totalLinks,
            summary.healthy,
            summary.broken,
            summary.unreachable,
            summary.copies
          ) +
            " " +
            t("targetCheckElapsed", inventory.elapsedMs)
        );
      }
    }
    if (this.targetCheckSettingsSummaryEl) {
      this.targetCheckSettingsSummaryEl.empty();
      if (this.settingStatuses) {
        const settings = this.settingStatusesSummary();
        this.targetCheckSettingsSummaryEl.setText(
          t("targetCheckSettingsSummary", settings.same, settings.diff, settings.missing)
        );
      }
    }
  }

  renderKindTargetCheckActions(kind) {
    const containerEl =
      kind === "plugins" ? this.pluginsTargetCheckEl : kind === "themes" ? this.themesTargetCheckEl : this.snippetsTargetCheckEl;
    if (!containerEl) return;
    const t = this.plugin.t.bind(this.plugin);
    containerEl.empty();
    if (!this.targetInventory || !this.targetInventory.kinds) return;
    const entries = (this.targetInventory.kinds[kind] || []).filter(
      (entry) => entry.status === "broken" || entry.status === "unreachable"
    );
    if (entries.length === 0) return;
    const rebuildable = entries.filter(
      (entry) => entry.status === "broken" && this.hasSameNameSource(kind, entry.name)
    );
    const deletable = entries.filter(
      (entry) => entry.status === "broken" && !this.hasSameNameSource(kind, entry.name)
    );
    if (rebuildable.length > 0) {
      this.createTargetCheckButton(
        containerEl,
        t("targetCheckRebuildAll"),
        t("targetCheckRebuildAllTitle"),
        () => this.confirmBulkRebuild(rebuildable)
      );
    }
    if (deletable.length > 0) {
      this.createTargetCheckButton(
        containerEl,
        t("targetCheckDeleteAll"),
        t("targetCheckDeleteAllTitle"),
        () => this.confirmBulkDelete(deletable),
        true
      );
    }
  }

  createTargetCheckButton(containerEl, label, title, onClick, isDanger) {
    // Plain buttons on purpose: the toolbar helper would add its 96px min-width to these inline actions.
    const buttonEl = containerEl.createEl("button", {
      cls: "plugin-share-linker-target-check-button",
      text: label,
    });
    buttonEl.title = title;
    buttonEl.setAttribute("aria-label", label);
    if (isDanger) buttonEl.addClass("is-danger");
    buttonEl.addEventListener("click", () => onClick());
    return buttonEl;
  }

  addActionButtons(containerEl, kind) {
    const t = this.plugin.t.bind(this.plugin);
    const copyButton = new ButtonComponent(containerEl)
      .setIcon("copy")
      .onClick(async () => {
        await this.runShareAction(kind, "copy");
      });
    copyButton.buttonEl.addClass("plugin-share-linker-copy-button");
    setToolbarButtonLabel(copyButton, t("copy"), t("copyTitle"));

    const createButton = new ButtonComponent(containerEl)
      .setIcon("link")
      .setCta()
      .onClick(async () => {
        await this.runShareAction(kind, "symlink");
      });
    createButton.buttonEl.addClass("plugin-share-linker-create-button");
    setToolbarButtonLabel(createButton, t("symlink"), t("symlinkTitle"));
  }

  async refreshAll() {
    const t = this.plugin.t.bind(this.plugin);
    this.actionResults = { plugins: null, themes: null, snippets: null };
    this.configState = { pluginsEnabled: [], snippetsEnabled: [], themeSet: null };
    this.warnings = [];
    this.notes = [];
    this.themeActionSeen = false;

    try {
      this.plugins = await this.plugin.listPlugins();
      this.themes = await this.plugin.listThemes();
      this.snippets = await this.plugin.listSnippets();
    } catch (error) {
      this.plugins = [];
      this.themes = [];
      this.snippets = [];
      this.showError(t("listReadFailed", error.message));
    }

    // Settings files are optional for the resource lists: reading them must not empty those sections.
    try {
      this.settingFiles = await this.plugin.readCurrentSettingFiles();
    } catch (error) {
      this.settingFiles = [];
      this.showError(t("listReadFailed", error.message));
    }

    this.renderPlugins();
    this.renderThemes();
    this.renderSnippets();
    this.renderSettings();
    this.renderTargetCheck();
    this.renderResults();
  }

  async checkTargetPath() {
    if (this.busy) return;

    this.busy = true;
    this.plugin.beginDebugSession("check-target");
    const t = this.plugin.t.bind(this.plugin);
    const startedAt = Date.now();
    this.plugin.debug("check", `start target=${this.plugin.settings.targetVaultPath || "(empty)"}`);
    this.setStatusMessage(t("busyProgress", t("checkingTarget"), 0));
    const ticker = setInterval(() => {
      if (!this.busy) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      this.setStatusMessage(t("busyProgress", t("checkingTarget"), seconds));
      this.plugin.debug("tick", `${seconds}s`);
    }, 1000);

    try {
      const info = await runWithTimeout(
        () => this.plugin.inspectTarget(this.plugin.settings.targetVaultPath),
        45000,
        t("actionTimeout", 45)
      );
      this.renderTargetPathCheck(info);
      this.plugin.debug("check", `rendered elapsed=${Date.now() - startedAt}ms`);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.plugin.debug("check", `failed: ${message}`);
      this.showError(message);
      this.renderDebugTrail();
      new Notice(t("shareFailed", message));
    } finally {
      this.busy = false;
      clearInterval(ticker);
      this.renderTargetCheck();
    }
  }

  renderTargetPathCheck(info) {
    if (!this.resultsEl) return;

    const t = this.plugin.t.bind(this.plugin);
    this.resultsEl.empty();
    const cardEl = this.resultsEl.createDiv("plugin-share-linker-result-card");
    cardEl.createDiv("plugin-share-linker-result-title").setText(t("checkTarget"));
    const linesEl = cardEl.createDiv("plugin-share-linker-result-lines");

    linesEl.createDiv("plugin-share-linker-config-line").setText(info.target.targetPath);
    const line = (label, ok) =>
      linesEl
        .createDiv("plugin-share-linker-result-line")
        .setText(t("targetCheckLine", label, ok ? t("yes") : t("no")));
    line(t("targetCheckExists"), true);
    line(t("targetCheckVault"), info.target.isVault);
    line(t("targetCheckWritable"), info.writable);
    linesEl.createDiv("plugin-share-linker-config-line").setText(t("targetCheckElapsed", info.elapsedMs));
    linesEl.createDiv("plugin-share-linker-restart-hint").setText(t("targetCheckHint"));
  }

  getSourceRows(kind) {
    if (kind === "plugins") return this.plugins.map((plugin) => ({ name: plugin.folderName, source: plugin }));
    if (kind === "themes") return this.themes.map((theme) => ({ name: theme.folderName, source: theme }));
    return this.snippets.map((snippet) => ({ name: snippet.fileName, source: snippet }));
  }

  getMergedRows(kind) {
    const entries =
      this.targetInventory && this.targetInventory.kinds && this.targetInventory.kinds[kind]
        ? this.targetInventory.kinds[kind]
        : [];
    return mergeDiffRows(kind, this.getSourceRows(kind), entries);
  }

  hasSameNameSource(kind, name) {
    if (kind === "plugins") return this.plugins.some((plugin) => plugin.folderName === name);
    if (kind === "themes") return this.themes.some((theme) => theme.folderName === name);
    return this.snippets.some((snippet) => snippet.fileName === name);
  }

  renderPlugins() {
    if (!this.pluginsListEl || !this.pluginsCountEl) return;

    const t = this.plugin.t.bind(this.plugin);
    const selected = new Set(this.plugin.settings.selectedPluginIds);
    const enabled = new Set(this.plugin.settings.enabledPluginIds);
    const rows = this.getMergedRows("plugins");
    const targetOnlyCount = rows.filter((row) => !row.source).length;
    const pageSize = normalizePageSize(this.plugin.settings.pageSize);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    this.currentPage = clamp(this.currentPage, 1, totalPages);
    const startIndex = (this.currentPage - 1) * pageSize;
    const pageRows = rows.slice(startIndex, startIndex + pageSize);

    this.pluginsCountEl.setText(
      t("pluginsCount", this.plugins.length, selected.size, this.currentPage, totalPages) +
        (targetOnlyCount > 0 ? t("targetOnlySuffix", targetOnlyCount) : "")
    );
    this.pluginsListEl.empty();
    this.renderPagination(totalPages, pageSize);
    this.renderKindTargetCheckActions("plugins");

    if (rows.length === 0) {
      this.pluginsListEl.createDiv("plugin-share-linker-empty").setText(t("emptyPlugins"));
      return;
    }

    for (const row of pageRows) {
      this.renderPluginPair(row, selected, enabled);
    }
  }

  renderPluginPair(row, selected, enabled) {
    const t = this.plugin.t.bind(this.plugin);
    const pairEl = this.pluginsListEl.createDiv("plugin-share-linker-pair");
    const leftEl = pairEl.createDiv("plugin-share-linker-pair-left");

    if (!row.source) {
      leftEl.addClass("is-empty");
      leftEl.createDiv("plugin-share-linker-pair-placeholder").setText(t("pairPlaceholderSource"));
      this.renderTargetCell(pairEl, row);
      return;
    }

    const plugin = row.source;
    const checksEl = leftEl.createDiv("plugin-share-linker-checks");

    const shareLabel = checksEl.createEl("label", { cls: "plugin-share-linker-check" });
    const shareBox = shareLabel.createEl("input", { type: "checkbox" });
    shareLabel.createSpan({ text: t("share") });

    const enableLabel = checksEl.createEl("label", { cls: "plugin-share-linker-check" });
    const enableBox = enableLabel.createEl("input", { type: "checkbox" });
    enableLabel.createSpan({ text: t("enable") });

    shareBox.checked = selected.has(plugin.id);
    enableBox.checked = enabled.has(plugin.id);
    enableBox.disabled = !shareBox.checked;

    shareBox.addEventListener("change", async () => {
      const nextSelected = new Set(this.plugin.settings.selectedPluginIds);
      const nextEnabled = new Set(this.plugin.settings.enabledPluginIds);
      if (shareBox.checked) {
        nextSelected.add(plugin.id);
        nextEnabled.add(plugin.id);
      } else {
        nextSelected.delete(plugin.id);
        nextEnabled.delete(plugin.id);
      }
      this.plugin.settings.selectedPluginIds = Array.from(nextSelected);
      this.plugin.settings.enabledPluginIds = Array.from(nextEnabled);
      await this.plugin.saveSettings();
      this.renderPlugins();
    });

    enableBox.addEventListener("change", async () => {
      const nextEnabled = new Set(this.plugin.settings.enabledPluginIds);
      if (enableBox.checked) {
        nextEnabled.add(plugin.id);
      } else {
        nextEnabled.delete(plugin.id);
      }
      this.plugin.settings.enabledPluginIds = Array.from(nextEnabled);
      await this.plugin.saveSettings();
      this.renderPlugins();
    });

    const contentEl = leftEl.createDiv("plugin-share-linker-row-content");
    const titleEl = contentEl.createDiv("plugin-share-linker-row-title");
    titleEl.createSpan({ text: plugin.name });
    titleEl.createEl("code", { text: plugin.folderName });

    const metaText = plugin.version ? `v${plugin.version}` : t("noVersion");
    contentEl.createDiv("plugin-share-linker-row-meta").setText(metaText);

    if (plugin.description) {
      contentEl.createDiv("plugin-share-linker-row-desc").setText(plugin.description);
    }

    this.renderTargetCell(pairEl, row);
  }

  renderPagination(totalPages, pageSize) {
    if (!this.pluginsPaginationEl) return;
    this.pluginsPaginationEl.empty();

    const t = this.plugin.t.bind(this.plugin);
    const previousButton = new ButtonComponent(this.pluginsPaginationEl)
      .setIcon("chevron-left")
      .onClick(() => {
        if (this.currentPage <= 1) return;
        this.currentPage -= 1;
        this.renderPlugins();
      });
    setToolbarButtonLabel(previousButton, t("previousPage"), t("previousPage"));
    previousButton.setDisabled(this.currentPage <= 1);

    const pageInfoEl = this.pluginsPaginationEl.createDiv("plugin-share-linker-page-info");
    pageInfoEl.setText(t("pageInfo", this.currentPage, totalPages));

    const nextButton = new ButtonComponent(this.pluginsPaginationEl)
      .setIcon("chevron-right")
      .onClick(() => {
        if (this.currentPage >= totalPages) return;
        this.currentPage += 1;
        this.renderPlugins();
      });
    setToolbarButtonLabel(nextButton, t("nextPage"), t("nextPage"));
    nextButton.setDisabled(this.currentPage >= totalPages);

    const sizeWrapperEl = this.pluginsPaginationEl.createDiv("plugin-share-linker-page-size");
    sizeWrapperEl.createSpan({ text: t("pageSizePrefix") });
    const selectEl = sizeWrapperEl.createEl("select");
    for (const size of PAGE_SIZES) {
      const optionEl = selectEl.createEl("option", { text: `${size}`, value: `${size}` });
      optionEl.selected = size === pageSize;
    }
    selectEl.addEventListener("change", async () => {
      this.plugin.settings.pageSize = normalizePageSize(Number(selectEl.value));
      this.currentPage = 1;
      await this.plugin.saveSettings();
      this.renderPlugins();
    });
    const suffix = t("pageSizeSuffix");
    if (suffix) sizeWrapperEl.createSpan({ text: suffix });
  }

  renderThemes() {
    if (!this.themesListEl || !this.themesCountEl) return;

    const t = this.plugin.t.bind(this.plugin);
    const selected = new Set(this.plugin.settings.selectedThemeNames);
    const rows = this.getMergedRows("themes");
    const targetOnlyCount = rows.filter((row) => !row.source).length;

    if (this.plugin.settings.targetThemeName && !selected.has(this.plugin.settings.targetThemeName)) {
      this.plugin.settings.targetThemeName = "";
      this.plugin.saveSettings();
    }

    this.themesCountEl.setText(
      t("themesCount", this.themes.length, selected.size) +
        (targetOnlyCount > 0 ? t("targetOnlySuffix", targetOnlyCount) : "")
    );
    this.themesListEl.empty();
    this.renderKindTargetCheckActions("themes");

    if (rows.length === 0) {
      this.themesListEl.createDiv("plugin-share-linker-empty").setText(t("emptyThemes"));
    } else {
      for (const row of rows) {
        this.renderThemePair(row, selected);
      }
    }

    this.renderThemeRadio();
  }

  renderThemePair(row, selected) {
    const t = this.plugin.t.bind(this.plugin);
    const pairEl = this.themesListEl.createDiv("plugin-share-linker-pair");
    const leftEl = pairEl.createDiv("plugin-share-linker-pair-left");

    if (!row.source) {
      leftEl.addClass("is-empty");
      leftEl.createDiv("plugin-share-linker-pair-placeholder").setText(t("pairPlaceholderSource"));
      this.renderTargetCell(pairEl, row);
      return;
    }

    const theme = row.source;
    const checkLabel = leftEl.createEl("label", { cls: "plugin-share-linker-check" });
    const checkBox = checkLabel.createEl("input", { type: "checkbox" });
    checkLabel.createSpan({ text: t("share") });
    checkBox.checked = selected.has(theme.folderName);
    checkBox.addEventListener("change", async () => {
      const nextSelected = new Set(this.plugin.settings.selectedThemeNames);
      if (checkBox.checked) {
        nextSelected.add(theme.folderName);
      } else {
        nextSelected.delete(theme.folderName);
        if (this.plugin.settings.targetThemeName === theme.folderName) {
          this.plugin.settings.targetThemeName = "";
        }
      }
      this.plugin.settings.selectedThemeNames = Array.from(nextSelected);
      await this.plugin.saveSettings();
      this.renderThemes();
    });

    const contentEl = leftEl.createDiv("plugin-share-linker-row-content");
    const titleEl = contentEl.createDiv("plugin-share-linker-row-title");
    titleEl.createSpan({ text: theme.name });
    const metaText = theme.version ? `v${theme.version}` : t("noVersion");
    contentEl.createDiv("plugin-share-linker-row-meta").setText(metaText);

    this.renderTargetCell(pairEl, row);
  }

  renderThemeRadio() {
    if (!this.themesRadioEl) return;

    const t = this.plugin.t.bind(this.plugin);
    this.themesRadioEl.empty();
    this.themesRadioEl.createDiv("plugin-share-linker-radio-title").setText(t("themeRadioTitle"));

    const optionsEl = this.themesRadioEl.createDiv("plugin-share-linker-radio-options");
    const selectedThemes = this.themes.filter((theme) =>
      this.plugin.settings.selectedThemeNames.includes(theme.folderName)
    );

    if (selectedThemes.length === 0) {
      optionsEl.createSpan({ cls: "plugin-share-linker-radio-empty", text: t("emptyThemeRadio") });
      return;
    }

    const addOption = (value, label) => {
      const labelEl = optionsEl.createEl("label", { cls: "plugin-share-linker-radio-option" });
      const inputEl = labelEl.createEl("input", {
        type: "radio",
        attr: { name: "plugin-share-linker-target-theme", value },
      });
      inputEl.checked = this.plugin.settings.targetThemeName === value;
      inputEl.addEventListener("change", async () => {
        this.plugin.settings.targetThemeName = value;
        await this.plugin.saveSettings();
        this.renderThemeRadio();
      });
      labelEl.createSpan({ text: label });
    };

    addOption("", t("themeRadioNone"));
    for (const theme of selectedThemes) {
      addOption(theme.folderName, theme.name);
    }
  }

  renderSnippets() {
    if (!this.snippetsListEl || !this.snippetsCountEl) return;

    const t = this.plugin.t.bind(this.plugin);
    const selected = new Set(this.plugin.settings.selectedSnippetNames);
    const enabled = new Set(this.plugin.settings.enabledSnippetNames);
    const rows = this.getMergedRows("snippets");
    const targetOnlyCount = rows.filter((row) => !row.source).length;

    this.snippetsCountEl.setText(
      t("snippetsCount", this.snippets.length, selected.size) +
        (targetOnlyCount > 0 ? t("targetOnlySuffix", targetOnlyCount) : "")
    );
    this.snippetsListEl.empty();
    this.renderKindTargetCheckActions("snippets");

    if (rows.length === 0) {
      this.snippetsListEl.createDiv("plugin-share-linker-empty").setText(t("emptySnippets"));
      return;
    }

    for (const row of rows) {
      this.renderSnippetPair(row, selected, enabled);
    }
  }

  renderSnippetPair(row, selected, enabled) {
    const t = this.plugin.t.bind(this.plugin);
    const pairEl = this.snippetsListEl.createDiv("plugin-share-linker-pair");
    const leftEl = pairEl.createDiv("plugin-share-linker-pair-left");

    if (!row.source) {
      leftEl.addClass("is-empty");
      leftEl.createDiv("plugin-share-linker-pair-placeholder").setText(t("pairPlaceholderSource"));
      this.renderTargetCell(pairEl, row);
      return;
    }

    const snippet = row.source;
    const checksEl = leftEl.createDiv("plugin-share-linker-checks");

    const shareLabel = checksEl.createEl("label", { cls: "plugin-share-linker-check" });
    const shareBox = shareLabel.createEl("input", { type: "checkbox" });
    shareLabel.createSpan({ text: t("share") });

    const enableLabel = checksEl.createEl("label", { cls: "plugin-share-linker-check" });
    const enableBox = enableLabel.createEl("input", { type: "checkbox" });
    enableLabel.createSpan({ text: t("enable") });

    shareBox.checked = selected.has(snippet.name);
    enableBox.checked = enabled.has(snippet.name);
    enableBox.disabled = !shareBox.checked;

    shareBox.addEventListener("change", async () => {
      const nextSelected = new Set(this.plugin.settings.selectedSnippetNames);
      const nextEnabled = new Set(this.plugin.settings.enabledSnippetNames);
      if (shareBox.checked) {
        nextSelected.add(snippet.name);
        nextEnabled.add(snippet.name);
      } else {
        nextSelected.delete(snippet.name);
        nextEnabled.delete(snippet.name);
      }
      this.plugin.settings.selectedSnippetNames = Array.from(nextSelected);
      this.plugin.settings.enabledSnippetNames = Array.from(nextEnabled);
      await this.plugin.saveSettings();
      this.renderSnippets();
    });

    enableBox.addEventListener("change", async () => {
      const nextEnabled = new Set(this.plugin.settings.enabledSnippetNames);
      if (enableBox.checked) {
        nextEnabled.add(snippet.name);
      } else {
        nextEnabled.delete(snippet.name);
      }
      this.plugin.settings.enabledSnippetNames = Array.from(nextEnabled);
      await this.plugin.saveSettings();
      this.renderSnippets();
    });

    const contentEl = leftEl.createDiv("plugin-share-linker-row-content");
    const titleEl = contentEl.createDiv("plugin-share-linker-row-title");
    titleEl.createEl("code", { text: snippet.fileName });

    this.renderTargetCell(pairEl, row);
  }

  renderAllResourceLists() {
    this.renderPlugins();
    this.renderThemes();
    this.renderSnippets();
  }

  async runTargetCheck() {
    if (this.targetCheckBusy || this.busy) return;

    const t = this.plugin.t.bind(this.plugin);
    const targetVaultPath = this.plugin.settings.targetVaultPath;
    if (!normalizePathInput(targetVaultPath)) {
      new Notice(t("targetRequired"));
      return;
    }

    this.targetCheckBusy = true;
    this.targetScanError = "";
    this.settingsCheckError = "";
    this.targetScanToken += 1;
    this.settingsCheckToken += 1;
    const runId = ++this.targetCheckRunId;
    const linkToken = this.targetScanToken;
    const settingsToken = this.settingsCheckToken;
    this.renderTargetCheck();
    this.renderSettings();
    this.plugin.beginDebugSession("check-target-vault");
    this.plugin.debug("targetCheck", `start target=${targetVaultPath || "(empty)"}`);
    const checkStartedAt = Date.now();

    const targetUnchanged = () =>
      normalizePathInput(this.plugin.settings.targetVaultPath) === normalizePathInput(targetVaultPath);
    const stillCurrent = () => runId === this.targetCheckRunId && targetUnchanged();

    // Each segment paints its own result as soon as it lands, so a slow segment never hides a ready one.
    const renderSegment = () => {
      if (runId !== this.targetCheckRunId) return;
      this.renderAllResourceLists();
      this.renderSettings();
      this.renderTargetCheck();
    };

    const linkTask = (async () => {
      try {
        const scan = await runWithTimeout(
          () => this.plugin.scanTargetVault(targetVaultPath),
          45 * 1000,
          t("actionTimeout", 45)
        );
        if (linkToken !== this.targetScanToken || !stillCurrent()) return;
        this.targetInventory = scan;
        this.targetScanAt = Date.now();
      } catch (error) {
        if (linkToken !== this.targetScanToken || !stillCurrent()) return;
        this.targetScanError = error && error.message ? error.message : String(error);
        this.plugin.debug("targetCheck", `link scan failed: ${this.targetScanError}`);
      }
      renderSegment();
    })();

    const settingsTask = (async () => {
      try {
        const result = await runWithTimeout(
          () => this.plugin.detectTargetSettings(targetVaultPath),
          45 * 1000,
          t("actionTimeout", 45)
        );
        if (settingsToken !== this.settingsCheckToken || !stillCurrent()) return;
        this.settingStatuses = result.statuses;
        this.settingsCheckAt = Date.now();
      } catch (error) {
        if (settingsToken !== this.settingsCheckToken || !stillCurrent()) return;
        this.settingsCheckError = error && error.message ? error.message : String(error);
        this.plugin.debug("targetCheck", `settings check failed: ${this.settingsCheckError}`);
      }
      renderSegment();
    })();

    // The two segments run independently: a slow link scan cannot hold back the settings comparison.
    await Promise.all([linkTask, settingsTask]);

    // A newer check (or a target-path change that invalidated the results) owns the state now.
    if (runId !== this.targetCheckRunId) return;

    this.targetCheckBusy = false;
    this.plugin.debug(
      "targetCheck",
      `done links=${this.targetScanError ? "error" : "ok"} settings=${this.settingsCheckError ? "error" : "ok"} elapsed=${
        Date.now() - checkStartedAt
      }ms`
    );

    if (this.targetScanError || this.settingsCheckError) {
      new Notice(this.targetCheckStatusText());
    } else if (this.targetInventory) {
      const summary = this.targetInventory.summary;
      new Notice(
        summary.broken + summary.unreachable > 0
          ? t("targetCheckNoticeFound", summary.broken, summary.unreachable)
          : t("targetCheckNoticeClear")
      );
    }

    this.renderAllResourceLists();
    this.renderSettings();
    this.renderTargetCheck();
  }

  async rebuildSingle(entry) {
    const t = this.plugin.t.bind(this.plugin);
    this.plugin.debug("targetCheck", `rebuild ${entry.kind}/${entry.name}`);
    try {
      const outcome = await this.plugin.rebuildTargetLink(
        entry.kind,
        entry.name,
        this.plugin.settings.targetVaultPath
      );
      if (!outcome || outcome.status !== "rebuilt") {
        const message = (outcome && outcome.message) || t("targetCheckRebuildNotRestored");
        new Notice(`${message}${outcome && outcome.restored ? ` ${t("targetCheckRebuildRestored")}` : ""}`);
      } else {
        new Notice(outcome.message);
        this.markEntryRepaired(entry);
        entry.rebuiltFrom = outcome.oldTarget;
        entry.linkTarget = outcome.newTarget;
        entry.absoluteTarget = outcome.newTarget;
        entry.isLink = true;
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      new Notice(t("targetCheckRebuildFailed", entry.name, message));
    }
    this.renderAllResourceLists();
    this.renderTargetCheck();
  }

  async deleteSingle(entry) {
    const t = this.plugin.t.bind(this.plugin);
    this.plugin.debug("targetCheck", `delete ${entry.kind}/${entry.name}`);
    try {
      const outcome = await this.plugin.deleteTargetLink(
        entry.kind,
        entry.name,
        this.plugin.settings.targetVaultPath
      );
      const configText = this.describeConfigCleanup(outcome.config);
      new Notice(
        configText
          ? t("targetCheckDeletedWithConfig", entry.name, configText)
          : t("targetCheckDeleted", entry.name)
      );
      this.removeInventoryEntry(entry);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      new Notice(t("targetCheckDeleteFailed", message));
    }
    this.renderAllResourceLists();
    this.renderTargetCheck();
  }

  describeConfigCleanup(config) {
    const t = this.plugin.t.bind(this.plugin);
    if (!config) return "";
    if (config.error) return t("targetCheckConfigFailed", config.error);
    const parts = [];
    if (config.pluginsRemoved && config.pluginsRemoved.length > 0) {
      parts.push(t("targetCheckConfigRemovedPlugins", config.pluginsRemoved.length));
    }
    if (config.snippetsRemoved && config.snippetsRemoved.length > 0) {
      parts.push(t("targetCheckConfigRemovedSnippets", config.snippetsRemoved.length));
    }
    if (config.themeCleared) {
      parts.push(t("targetCheckConfigClearedTheme", config.themeCleared));
    }
    return parts.length > 0 ? t("targetCheckConfigJoined", parts) : t("targetCheckConfigUnchanged");
  }

  removeInventoryEntry(entry) {
    if (!this.targetInventory || !this.targetInventory.kinds) return;
    const list = this.targetInventory.kinds[entry.kind];
    if (!Array.isArray(list)) return;
    const index = list.findIndex((item) => item.name === entry.name);
    if (index >= 0) list.splice(index, 1);
    if (this.targetInventory.summary) {
      const summary = this.targetInventory.summary;
      const key = entry.status === "unreachable" ? "unreachable" : "broken";
      summary[key] = Math.max(0, (summary[key] || 0) - 1);
      summary.total = Math.max(0, (summary.total || 1) - 1);
      if (entry.isLink) summary.totalLinks = Math.max(0, (summary.totalLinks || 1) - 1);
    }
  }

  markEntryRepaired(entry) {
    if (!this.targetInventory || !this.targetInventory.summary) return;
    const summary = this.targetInventory.summary;
    if (entry.status === "broken") summary.broken = Math.max(0, (summary.broken || 0) - 1);
    if (entry.status === "unreachable") summary.unreachable = Math.max(0, (summary.unreachable || 0) - 1);
    summary.healthy = (summary.healthy || 0) + 1;
    entry.status = "healthy";
  }

  confirmBulkRebuild(entries) {
    const t = this.plugin.t.bind(this.plugin);
    const lines = entries.map((entry) => {
      const source = this.getSourcePath(entry.kind, entry.name);
      return `${entry.name}: ${entry.absoluteTarget || "-"} → ${source || "?"}`;
    });
    new TargetActionConfirmModal(this.app, {
      title: t("targetCheckBulkConfirmRebuild"),
      warning: t("targetCheckConfirmRebuildWarning"),
      lines,
      confirmLabel: t("targetCheckConfirmOk"),
      cancelLabel: t("targetCheckConfirmCancel"),
      onConfirm: () => this.runBulkRebuild(entries),
    }).open();
  }

  confirmBulkDelete(entries) {
    const t = this.plugin.t.bind(this.plugin);
    const lines = entries.map((entry) => `${entry.name}: ${entry.absoluteTarget || entry.linkTarget || "-"}`);
    new TargetActionConfirmModal(this.app, {
      title: t("targetCheckBulkConfirmDelete"),
      warning: t("targetCheckConfirmDeleteWarning"),
      lines,
      confirmLabel: t("targetCheckConfirmOk"),
      cancelLabel: t("targetCheckConfirmCancel"),
      onConfirm: () => this.runBulkDelete(entries),
    }).open();
  }

  getSourcePath(kind, name) {
    if (kind === "plugins") {
      const match = this.plugins.find((plugin) => plugin.folderName === name);
      return match ? match.sourcePath : "";
    }
    if (kind === "themes") {
      const match = this.themes.find((theme) => theme.folderName === name);
      return match ? match.sourcePath : "";
    }
    const match = this.snippets.find((snippet) => snippet.fileName === name);
    return match ? match.sourcePath : "";
  }

  async runBulkRebuild(entries) {
    const t = this.plugin.t.bind(this.plugin);
    let ok = 0;
    let failed = 0;
    for (const entry of entries) {
      try {
        const outcome = await this.plugin.rebuildTargetLink(
          entry.kind,
          entry.name,
          this.plugin.settings.targetVaultPath
        );
        if (outcome && outcome.status === "rebuilt") {
          this.markEntryRepaired(entry);
          entry.rebuiltFrom = outcome.oldTarget;
          entry.linkTarget = outcome.newTarget;
          entry.absoluteTarget = outcome.newTarget;
          ok += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        this.plugin.debug("targetCheck", `bulk rebuild failed ${entry.name}: ${error && error.message}`);
      }
    }
    new Notice(t("targetCheckBulkRebuildDone", ok, failed));
    this.renderAllResourceLists();
    this.renderTargetCheck();
  }

  async runBulkDelete(entries) {
    const t = this.plugin.t.bind(this.plugin);
    let ok = 0;
    let failed = 0;
    for (const entry of entries) {
      try {
        await this.plugin.deleteTargetLink(entry.kind, entry.name, this.plugin.settings.targetVaultPath);
        this.removeInventoryEntry(entry);
        ok += 1;
      } catch (error) {
        failed += 1;
        this.plugin.debug("targetCheck", `bulk delete failed ${entry.name}: ${error && error.message}`);
      }
    }
    new Notice(t("targetCheckBulkDeleteDone", ok, failed));
    this.renderAllResourceLists();
    this.renderTargetCheck();
  }

  async openVaultPicker() {
    const t = this.plugin.t.bind(this.plugin);
    let known = { ok: false, vaults: [], error: null };
    try {
      known = await this.plugin.listKnownVaults();
    } catch (error) {
      known = { ok: false, vaults: [], error: error && error.message ? error.message : String(error) };
    }
    new TargetVaultPickerModal(this.app, {
      title: t("pickerTitle"),
      subtitle: known.ok ? t("pickerSubtitle") : t("pickerRegistryFallback"),
      emptyText: t("pickerEmpty"),
      browseLabel: t("pickerBrowse"),
      browseTitle: t("pickerBrowseTitle"),
      cancelLabel: t("pickerCancel"),
      currentChip: t("pickerCurrentChip"),
      openChip: t("pickerOpenChip"),
      missingChip: t("pickerMissingChip"),
      currentVaultChip: t("pickerCurrentVaultChip"),
      vaults: known.vaults,
      onPick: (vaultPath) => this.applyTargetVaultPath(vaultPath),
      onBrowse: () => this.browseVault(),
    }).open();
  }

  async browseVault() {
    const t = this.plugin.t.bind(this.plugin);
    try {
      const picked = await this.plugin.browseTargetVault();
      if (!picked) return;
      await this.applyTargetVaultPath(picked);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      new Notice(t("pickerBrowseFailed", message));
    }
  }

  invalidateLinkResults() {
    this.targetScanToken += 1;
    this.targetInventory = null;
    this.targetScanAt = 0;
    this.targetScanError = "";
    this.renderAllResourceLists();
    this.renderTargetCheck();
  }

  invalidateSettingsResults() {
    this.settingsCheckToken += 1;
    this.settingStatuses = null;
    this.settingsCheckAt = 0;
    this.settingsCheckError = "";
    this.renderSettings();
    this.renderTargetCheck();
  }

  invalidateAllResults() {
    this.targetScanToken += 1;
    this.settingsCheckToken += 1;
    this.targetCheckRunId += 1;
    this.targetCheckBusy = false;
    this.targetInventory = null;
    this.targetScanAt = 0;
    this.targetScanError = "";
    this.settingStatuses = null;
    this.settingsCheckAt = 0;
    this.settingsCheckError = "";
    this.settingResults = null;
    this.renderAllResourceLists();
    this.renderSettings();
    this.renderSettingsResults();
    this.renderTargetCheck();
  }

  async applyTargetVaultPath(vaultPath) {
    const t = this.plugin.t.bind(this.plugin);
    const normalized = normalizePathInput(vaultPath);
    if (!normalized) return;
    this.plugin.settings.targetVaultPath = normalized;
    await this.plugin.saveSettings();
    this.invalidateAllResults();
    new Notice(t("pickerSelected", normalized));
    this.display();
  }

  async runShareAction(kind, mode) {
    if (this.busy) return;

    this.busy = true;
    this.plugin.beginDebugSession(`action ${kind}/${mode}`);
    this.renderTargetCheck();
    const t = this.plugin.t.bind(this.plugin);
    const targetVaultPath = this.plugin.settings.targetVaultPath;
    this.plugin.debug("action", `start ${kind}/${mode} target=${targetVaultPath || "(empty)"}`);
    const isCopyMode = mode === "copy";
    const targetLabel = targetVaultPath ? ` → ${targetVaultPath}` : "";
    const busyLabel = `${isCopyMode ? t("copying") : t("linking")} [${this.kindLabel(kind)}${targetLabel}]`;
    const startedAt = Date.now();

    this.setStatusMessage(t("busyProgress", busyLabel, 0));
    const ticker = setInterval(() => {
      if (!this.busy) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      this.setStatusMessage(t("busyProgress", busyLabel, seconds));
      this.plugin.debug("tick", `${seconds}s`);
    }, 1000);

    try {
      const outcome = await runWithTimeout(
        () => this.dispatchShare(kind, mode, targetVaultPath),
        ACTION_TIMEOUT_MS,
        t("actionTimeout", Math.round(ACTION_TIMEOUT_MS / 1000))
      );

      this.recordOutcome(kind, mode, outcome);
      this.renderResults();

      // Only the link results are out of date: the settings comparison is unaffected.
      this.invalidateLinkResults();

      const createdCount = outcome.results.filter((result) => result.status === "created").length;
      new Notice(isCopyMode ? t("copyNotice", createdCount) : t("linkNotice", createdCount));
      this.plugin.debug("action", `done ${kind}/${mode} created=${createdCount}`);
      logDebug("action done", kind, mode, outcome.results.map((result) => result.status).join(","));
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.plugin.debug("action", `failed ${kind}/${mode}: ${message}`);
      logDebug("action failed", kind, mode, message, error && error.stack);
      this.showError(message);
      this.renderDebugTrail();
      new Notice(t("shareFailed", message));
    } finally {
      this.busy = false;
      clearInterval(ticker);
      this.renderTargetCheck();
    }
  }

  dispatchShare(kind, mode, targetVaultPath) {
    if (kind === "plugins") {
      return this.plugin.sharePlugins(this.plugin.settings.selectedPluginIds, targetVaultPath, mode);
    }
    if (kind === "themes") {
      return this.plugin.shareThemes(this.plugin.settings.selectedThemeNames, targetVaultPath, mode);
    }
    return this.plugin.shareSnippets(this.plugin.settings.selectedSnippetNames, targetVaultPath, mode);
  }

  kindLabel(kind) {
    if (kind === "plugins") return this.plugin.t("sectionPlugins");
    if (kind === "themes") return this.plugin.t("sectionThemes");
    return this.plugin.t("sectionSnippets");
  }

  recordOutcome(kind, mode, outcome) {
    this.actionResults[kind] = { mode, results: outcome.results };

    if (outcome.target && !outcome.target.isVault) {
      this.warnings.push(this.plugin.t("targetCreatedVault"));
    }

    if (outcome.config) {
      const config = outcome.config;
      this.configState.pluginsEnabled = [...new Set([...this.configState.pluginsEnabled, ...config.pluginsEnabled])];
      this.configState.snippetsEnabled = [
        ...new Set([...this.configState.snippetsEnabled, ...config.snippetsEnabled]),
      ];
      if (config.themeSet) this.configState.themeSet = config.themeSet;
      this.warnings.push(...config.warnings);
      this.notes.push(...config.backups.map((backupPath) => this.plugin.t("backupMade", backupPath)));
    }

    if (kind === "themes") this.themeActionSeen = true;
    this.warnings = [...new Set(this.warnings)];
  }

  renderResults() {
    if (!this.resultsEl) return;

    const t = this.plugin.t.bind(this.plugin);
    this.resultsEl.empty();

    const kinds = [
      { key: "plugins", label: t("resultsPlugins") },
      { key: "themes", label: t("resultsThemes") },
      { key: "snippets", label: t("resultsSnippets") },
    ];
    const present = kinds.filter((kind) => this.actionResults[kind.key]);
    const hasConfig =
      this.configState.pluginsEnabled.length > 0 ||
      this.configState.snippetsEnabled.length > 0 ||
      !!this.configState.themeSet ||
      this.themeActionSeen;

    if (present.length === 0 && !hasConfig && this.warnings.length === 0) return;

    const cardEl = this.resultsEl.createDiv("plugin-share-linker-result-card");
    cardEl.createDiv("plugin-share-linker-result-title").setText(t("resultsTitle"));
    const linesEl = cardEl.createDiv("plugin-share-linker-result-lines");

    for (const kind of present) {
      const data = this.actionResults[kind.key];
      const summary = summarizeResults(data.results);
      const line =
        data.mode === "copy"
          ? t("copySummary", summary.created, summary.exists, summary.conflict, summary.error)
          : t("linkSummary", summary.created, summary.linked, summary.exists, summary.conflict, summary.error);
      linesEl.createDiv("plugin-share-linker-result-line").setText(`${kind.label}：${line}`);
    }

    if (this.configState.pluginsEnabled.length > 0 || this.configState.snippetsEnabled.length > 0) {
      linesEl
        .createDiv("plugin-share-linker-config-line")
        .setText(t("configEnableLine", this.configState.pluginsEnabled.length, this.configState.snippetsEnabled.length));
    }

    if (this.configState.themeSet) {
      linesEl.createDiv("plugin-share-linker-config-line").setText(t("configThemeLine", this.configState.themeSet));
    } else if (this.themeActionSeen) {
      linesEl.createDiv("plugin-share-linker-config-line").setText(t("configThemeUnchanged"));
    }

    if (present.length > 0) {
      linesEl.createDiv("plugin-share-linker-restart-hint").setText(t("restartHint"));
    }

    for (const warning of this.warnings) {
      cardEl.createDiv("plugin-share-linker-warning").setText(warning);
    }

    for (const note of this.notes) {
      cardEl.createDiv("plugin-share-linker-config-line").setText(note);
    }

    for (const kind of present) {
      const data = this.actionResults[kind.key];
      const detailEl = cardEl.createDiv("plugin-share-linker-result-detail");
      detailEl.createDiv("plugin-share-linker-subheading").setText(kind.label);
      const listEl = detailEl.createEl("ul", { cls: "plugin-share-linker-result-list" });
      for (const result of data.results) {
        const itemEl = listEl.createEl("li", {
          cls: `plugin-share-linker-result plugin-share-linker-result-${result.status}`,
        });
        itemEl.createSpan({
          text: t("resultLine", result.entry.name, t(`status.${result.status}`)),
        });
        if (result.message) itemEl.createDiv("plugin-share-linker-result-message").setText(result.message);
      }
    }
  }

  setStatusMessage(message) {
    if (!this.resultsEl) return;
    this.resultsEl.empty();
    const resultEl = this.resultsEl.createDiv("plugin-share-linker-message");
    resultEl.setText(message);
    resultEl.addClass("plugin-share-linker-message-busy");
  }

  showError(message) {
    if (!this.resultsEl) return;
    this.resultsEl.empty();
    this.resultsEl.createDiv("plugin-share-linker-message plugin-share-linker-message-error").setText(message);
  }

  renderDebugTrail() {
    const trail = (this.plugin.debugTrail || []).slice(-24);
    if (!this.resultsEl || trail.length === 0) return;

    const t = this.plugin.t.bind(this.plugin);
    const boxEl = this.resultsEl.createDiv("plugin-share-linker-debug");
    boxEl.createDiv("plugin-share-linker-debug-title").setText(t("debugTrailTitle"));
    boxEl.createDiv("plugin-share-linker-debug-line").setText(t("debugLogPath", this.plugin.getDebugLogPath() || "-"));
    const startAt = this.plugin.actionStartedAt || trail[0].at;
    for (const entry of trail) {
      const offset = Math.max(0, entry.at - startAt);
      boxEl.createDiv("plugin-share-linker-debug-line").setText(`+${offset}ms  ${entry.label}: ${entry.detail}`);
    }
  }
}

class TargetVaultPickerModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
  }

  onOpen() {
    const opts = this.options;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("plugin-share-linker-vault-modal");
    contentEl.createEl("h3", { text: opts.title || "" });
    if (opts.subtitle) contentEl.createDiv("plugin-share-linker-hint").setText(opts.subtitle);

    const listEl = contentEl.createDiv("plugin-share-linker-vault-list");
    const vaults = Array.isArray(opts.vaults) ? opts.vaults : [];
    if (vaults.length === 0) {
      listEl.createDiv("plugin-share-linker-empty").setText(opts.emptyText || "");
    }

    for (const vault of vaults) {
      const rowEl = listEl.createDiv("plugin-share-linker-vault-row");
      const selectable = vault.exists && !vault.isCurrent;
      if (!selectable) rowEl.addClass("is-disabled");

      const mainEl = rowEl.createDiv("plugin-share-linker-vault-main");
      mainEl.createEl("code", { text: vault.path });

      const chipsEl = rowEl.createDiv("plugin-share-linker-vault-chips");
      if (vault.isSaved) {
        chipsEl.createSpan({ cls: "plugin-share-linker-vault-chip is-current", text: opts.currentChip });
      }
      if (vault.isOpen) {
        chipsEl.createSpan({ cls: "plugin-share-linker-vault-chip is-open", text: opts.openChip });
      }
      if (vault.isCurrent) {
        chipsEl.createSpan({ cls: "plugin-share-linker-vault-chip is-disabled", text: opts.currentVaultChip });
      }
      if (!vault.exists) {
        chipsEl.createSpan({ cls: "plugin-share-linker-vault-chip is-missing", text: opts.missingChip });
      }

      if (selectable) {
        rowEl.addEventListener("click", () => {
          this.close();
          if (typeof opts.onPick === "function") opts.onPick(vault.path);
        });
      }
    }

    const footerEl = contentEl.createDiv("plugin-share-linker-vault-footer");
    const browseButton = footerEl.createEl("button", { cls: "mod-cta", text: opts.browseLabel || "" });
    browseButton.addEventListener("click", () => {
      this.close();
      if (typeof opts.onBrowse === "function") opts.onBrowse();
    });
    const cancelButton = footerEl.createEl("button", { text: opts.cancelLabel || "" });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TargetActionConfirmModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
  }

  onOpen() {
    const opts = this.options;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("plugin-share-linker-confirm-modal");
    contentEl.createEl("h3", { text: opts.title || "" });
    if (opts.warning) contentEl.createDiv("plugin-share-linker-warning").setText(opts.warning);

    const listEl = contentEl.createEl("ul", { cls: "plugin-share-linker-confirm-list" });
    for (const line of opts.lines || []) {
      listEl.createEl("li", { text: line });
    }

    const footerEl = contentEl.createDiv("plugin-share-linker-vault-footer");
    const confirmButton = footerEl.createEl("button", { cls: "mod-cta", text: opts.confirmLabel || "" });
    confirmButton.addEventListener("click", () => {
      this.close();
      if (typeof opts.onConfirm === "function") opts.onConfirm();
    });
    const cancelButton = footerEl.createEl("button", { text: opts.cancelLabel || "" });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SettingsConfirmModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
  }

  onOpen() {
    const opts = this.options;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("plugin-share-linker-confirm-modal");
    contentEl.createEl("h3", { text: opts.title || "" });
    if (opts.hint) contentEl.createDiv("plugin-share-linker-hint").setText(opts.hint);

    const listEl = contentEl.createEl("ul", { cls: "plugin-share-linker-confirm-list" });
    for (const file of opts.files || []) {
      const itemEl = listEl.createEl("li", { cls: "plugin-share-linker-settings-confirm-file" });
      itemEl.createSpan({ text: file.summary });
      if (file.details) itemEl.createDiv("plugin-share-linker-settings-keys").setText(file.details);
    }

    if (opts.coreEnabled) contentEl.createDiv("plugin-share-linker-result-line").setText(opts.coreEnabled);
    if (opts.coreDisabled) contentEl.createDiv("plugin-share-linker-result-line").setText(opts.coreDisabled);
    for (const warning of opts.warnings || []) {
      contentEl.createDiv("plugin-share-linker-config-line").setText(warning);
    }
    for (const conflict of opts.conflicts || []) {
      contentEl.createDiv("plugin-share-linker-warning").setText(conflict);
    }
    if (opts.vaultWarning) contentEl.createDiv("plugin-share-linker-warning").setText(opts.vaultWarning);

    const footerEl = contentEl.createDiv("plugin-share-linker-vault-footer");
    const confirmButton = footerEl.createEl("button", { cls: "mod-cta", text: opts.confirmLabel || "" });
    confirmButton.addEventListener("click", () => {
      this.close();
      if (typeof opts.onConfirm === "function") opts.onConfirm();
    });
    const cancelButton = footerEl.createEl("button", { text: opts.cancelLabel || "" });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports.__test = {
  mergeDiffRows,
  describeTargetRow,
  classifyLinkExistence,
  readVaultRegistry,
  getVaultRegistryCandidates,
  scanTargetConfigDirs,
  rebuildLink,
  cleanEnabledRecords,
  filterSettingValue,
  formatSettingValue,
  diffSettingValues,
  findHotkeyConflicts,
  summarizeCorePluginChanges,
  scanTargetSettings,
  buildSettingsSharePlan,
  applySettingsSharePlan,
  TargetVaultPickerModal,
  TargetActionConfirmModal,
  SettingsConfirmModal,
  SETTING_FILES,
  TEXT,
};

function safeRequire(request) {
  try {
    return require(request);
  } catch (error) {
    return null;
  }
}

function getVaultRegistryCandidates() {
  const candidates = [];
  const electron = safeRequire("electron");
  const electronApp = electron && (electron.app || (electron.remote && electron.remote.app));
  if (electronApp && typeof electronApp.getPath === "function") {
    try {
      const userData = electronApp.getPath("userData");
      if (userData) candidates.push(path.join(userData, "obsidian.json"));
    } catch (error) {
      // fall through to the platform defaults
    }
  }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || (home ? path.join(home, "AppData", "Roaming") : "");
    if (appData) candidates.push(path.join(appData, "obsidian", "obsidian.json"));
  } else if (process.platform === "darwin") {
    if (home) candidates.push(path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"));
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : "");
    if (configHome) candidates.push(path.join(configHome, "obsidian", "obsidian.json"));
  }

  return Array.from(new Set(candidates));
}

async function readVaultRegistry() {
  const candidates = getVaultRegistryCandidates();
  for (const candidate of candidates) {
    let raw;
    try {
      raw = await fs.promises.readFile(candidate, "utf8");
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) continue;
      return { ok: false, source: candidate, error: error.message, vaults: [] };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, source: candidate, error: error.message, vaults: [] };
    }

    const vaultMap = isPlainObject(parsed) && isPlainObject(parsed.vaults) ? parsed.vaults : {};
    const vaults = [];
    for (const key of Object.keys(vaultMap)) {
      const item = vaultMap[key];
      if (!isPlainObject(item) || typeof item.path !== "string" || !item.path.trim()) continue;
      vaults.push({
        path: item.path,
        ts: typeof item.ts === "number" ? item.ts : 0,
        open: !!item.open,
      });
    }
    return { ok: true, source: candidate, error: null, vaults };
  }
  return { ok: false, source: "", error: null, vaults: [] };
}

const TARGET_KINDS = ["plugins", "themes", "snippets"];

async function scanTargetConfigDirs(configDir) {
  const kinds = { plugins: [], themes: [], snippets: [] };
  const summary = {
    total: 0,
    totalLinks: 0,
    healthy: 0,
    broken: 0,
    unreachable: 0,
    copies: 0,
  };

  for (const kind of TARGET_KINDS) {
    const dirPath = path.join(configDir, kind);
    const entries = await readDirSafe(dirPath);

    for (const dirent of entries) {
      if (!dirent.name || dirent.name.startsWith(".")) continue;
      const isLink = dirent.isSymbolicLink();
      if (kind === "snippets" && !/\.css$/i.test(dirent.name)) continue;
      if (kind === "snippets" && !isLink && !dirent.isFile()) continue;
      if ((kind === "plugins" || kind === "themes") && !isLink && !dirent.isDirectory()) continue;

      const entryPath = path.join(dirPath, dirent.name);
      const record = {
        kind,
        name: dirent.name,
        entryPath,
        isLink,
        linkTarget: null,
        absoluteTarget: null,
        status: "copy",
        errorCode: null,
      };

      if (isLink) {
        summary.totalLinks += 1;
        let rawTarget = null;
        try {
          rawTarget = await fs.promises.readlink(entryPath);
        } catch (error) {
          record.status = "unreachable";
          record.errorCode = (error && error.code) || "UNKNOWN";
          summary.unreachable += 1;
          summary.total += 1;
          kinds[kind].push(record);
          continue;
        }
        record.linkTarget = rawTarget;
        record.absoluteTarget = path.resolve(path.dirname(entryPath), rawTarget);
        const classification = await classifyLinkExistence(entryPath, record.absoluteTarget);
        record.status = classification.status;
        record.errorCode = classification.errorCode;
        if (classification.status === "healthy") summary.healthy += 1;
        if (classification.status === "broken") summary.broken += 1;
        if (classification.status === "unreachable") summary.unreachable += 1;
      } else {
        summary.copies += 1;
      }

      summary.total += 1;
      kinds[kind].push(record);
    }
  }

  return { kinds, summary };
}

async function classifyLinkExistence(entryPath, absoluteTarget) {
  let linkErrorCode = "UNKNOWN";
  try {
    const stats = await fs.promises.stat(entryPath);
    if (stats) return { status: "healthy", errorCode: null };
  } catch (error) {
    linkErrorCode = (error && error.code) || "UNKNOWN";
    if (!["ENOENT", "ENOTDIR", "ELOOP"].includes(linkErrorCode)) {
      return { status: "unreachable", errorCode: linkErrorCode };
    }
  }

  const root = path.parse(absoluteTarget).root;
  const ancestors = [];
  let current = path.dirname(absoluteTarget);
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || current === root) break;
    ancestors.push(current);
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }

  for (const ancestor of ancestors) {
    try {
      const stats = await fs.promises.stat(ancestor);
      if (stats) return { status: "broken", errorCode: linkErrorCode };
    } catch (error) {
      const code = (error && error.code) || "UNKNOWN";
      if (code === "EACCES" || code === "EPERM" || code === "ELOOP") {
        return { status: "unreachable", errorCode: code };
      }
    }
  }

  if (root) {
    try {
      const rootStats = await fs.promises.stat(root);
      if (rootStats) return { status: "broken", errorCode: linkErrorCode };
    } catch (error) {
      return { status: "unreachable", errorCode: (error && error.code) || linkErrorCode };
    }
  }

  return { status: "unreachable", errorCode: linkErrorCode };
}

async function rebuildLink(entryPath, sourcePath, linkType, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  const existing = await fs.promises.lstat(entryPath).catch(() => null);
  if (!existing || !existing.isSymbolicLink()) {
    return {
      status: "error",
      oldTarget: null,
      newTarget: sourcePath,
      restored: false,
      message: t("targetCheckNotLink", entryPath),
    };
  }

  const oldTarget = await fs.promises.readlink(entryPath).catch(() => null);
  try {
    await fs.promises.rm(entryPath, { force: true });
  } catch (error) {
    return {
      status: "error",
      oldTarget,
      newTarget: sourcePath,
      restored: true,
      message: t("targetCheckDeleteFailed", error.message),
    };
  }

  try {
    await runWithTimeout(
      () => fs.promises.symlink(sourcePath, entryPath, linkType),
      SYMLINK_TIMEOUT_MS,
      t("symlinkTimeout", Math.round(SYMLINK_TIMEOUT_MS / 1000), sourcePath)
    );
    return {
      status: "rebuilt",
      oldTarget,
      newTarget: sourcePath,
      restored: false,
      message: t("targetCheckRebuilt", path.basename(entryPath), oldTarget || "?", sourcePath),
    };
  } catch (error) {
    let restored = false;
    if (oldTarget) {
      try {
        await fs.promises.symlink(oldTarget, entryPath, linkType);
        restored = true;
      } catch (restoreError) {
        log("targetCheck", `restore failed ${entryPath}: ${restoreError && restoreError.message}`);
      }
    }
    return {
      status: "error",
      oldTarget,
      newTarget: sourcePath,
      restored,
      message: t("targetCheckRebuildFailed", path.basename(entryPath), error.message),
    };
  }
}

async function cleanEnabledRecords(configDir, removed, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  const result = {
    pluginsRemoved: [],
    snippetsRemoved: [],
    themeCleared: null,
    backups: [],
    warnings: [],
    error: null,
  };
  const pluginIds = Array.isArray(removed.pluginIds) ? removed.pluginIds : [];
  const snippetNames = Array.isArray(removed.snippetNames) ? removed.snippetNames : [];
  const themeNames = Array.isArray(removed.themeNames) ? removed.themeNames : [];

  if (pluginIds.length > 0) {
    const filePath = path.join(configDir, "community-plugins.json");
    const { existed, value, parseError } = await readJsonFile(filePath, []);
    if (parseError) result.warnings.push(t("configParseWarning", filePath));
    const current = Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
    const removeSet = new Set(pluginIds);
    const next = current.filter((id) => !removeSet.has(id));
    const removedIds = current.filter((id) => removeSet.has(id));
    if (removedIds.length > 0) {
      if (existed) result.backups.push(await backupFile(filePath));
      await writeJsonFile(filePath, next);
      result.pluginsRemoved = removedIds;
      log("targetCheck", `community cleaned ${removedIds.length}`);
    }
  }

  const appearancePath = path.join(configDir, "appearance.json");
  const appearanceRead = await readJsonFile(appearancePath, {});
  const appearance = isPlainObject(appearanceRead.value) ? Object.assign({}, appearanceRead.value) : {};
  if (appearanceRead.parseError) result.warnings.push(t("configParseWarning", appearancePath));
  let appearanceChanged = false;

  if (snippetNames.length > 0) {
    const current = Array.isArray(appearance.enabledCssSnippets)
      ? appearance.enabledCssSnippets.filter((name) => typeof name === "string")
      : [];
    const removeSet = new Set(snippetNames);
    const next = current.filter((name) => !removeSet.has(name));
    const removedNames = current.filter((name) => removeSet.has(name));
    if (removedNames.length > 0) {
      appearance.enabledCssSnippets = next;
      result.snippetsRemoved = removedNames;
      appearanceChanged = true;
    }
  }

  if (themeNames.length > 0 && typeof appearance.cssTheme === "string") {
    if (themeNames.includes(appearance.cssTheme)) {
      result.themeCleared = appearance.cssTheme;
      delete appearance.cssTheme;
      appearanceChanged = true;
    }
  }

  if (appearanceChanged) {
    if (appearanceRead.existed) result.backups.push(await backupFile(appearancePath));
    await writeJsonFile(appearancePath, appearance);
    log("targetCheck", `appearance cleaned snippets=${result.snippetsRemoved.length} theme=${result.themeCleared || "-"}`);
  }

  return result;
}

function mergeDiffRows(kind, sourceRows, targetEntries) {
  const map = new Map();
  for (const row of sourceRows) {
    map.set(row.name, { name: row.name, kind, source: row.source || row, target: null });
  }
  for (const entry of targetEntries) {
    if (!map.has(entry.name)) {
      map.set(entry.name, { name: entry.name, kind, source: null, target: null });
    }
    map.get(entry.name).target = entry;
  }
  return Array.from(map.values()).sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-Hans-CN"));
}

function describeTargetRow(row) {
  if (!row.target) return { key: "unshared", detail: "" };
  const target = row.target;
  if (target.status === "copy") return { key: "copy", detail: "" };
  if (target.status === "broken") return { key: "broken", detail: target.absoluteTarget || target.linkTarget || "" };
  if (target.status === "unreachable") {
    return { key: "unreachable", detail: target.absoluteTarget || target.linkTarget || "" };
  }
  if (!row.source) return { key: "linked", detail: target.absoluteTarget || target.linkTarget || "" };
  if (target.absoluteTarget && row.source.sourcePath) {
    try {
      const same = path.resolve(target.absoluteTarget) === path.resolve(row.source.sourcePath);
      return same ? { key: "linked", detail: "" } : { key: "conflict", detail: target.absoluteTarget };
    } catch (error) {
      return { key: "conflict", detail: target.absoluteTarget };
    }
  }
  return { key: "linked", detail: "" };
}

async function shareEntry(entry, targetPath, mode, symlinkType, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  log("entry", `start ${entry.name} → ${targetPath}`);
  const existing = await fs.promises.lstat(targetPath).catch(() => null);
  const existedBefore = !!existing;
  log(
    "entry",
    `lstat done ${entry.name} existing=${existing ? (existing.isSymbolicLink() ? "symlink" : "file/dir") : "none"}`
  );
  try {

    if (existing) {
      if (existing.isSymbolicLink()) {
        const linkTarget = await fs.promises.readlink(targetPath);
        const absoluteLinkTarget = path.resolve(path.dirname(targetPath), linkTarget);
        if (path.resolve(absoluteLinkTarget) === path.resolve(entry.sourcePath)) {
          return { entry, status: "linked", message: t("alreadyLinked"), targetPath };
        }
        return { entry, status: "conflict", message: t("linkConflict", linkTarget), targetPath };
      }

      return {
        entry,
        status: "exists",
        message: mode === "copy" ? t("copyExistsSkipped") : t("existsSkipped"),
        targetPath,
      };
    }

    if (mode === "copy") {
      log("entry", `copy start ${entry.name}`);
      if (symlinkType === "dir") {
        await fs.promises.cp(entry.sourcePath, targetPath, {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      } else {
        await fs.promises.copyFile(entry.sourcePath, targetPath);
      }
      log("entry", `copy done ${entry.name}`);
    } else {
      log("entry", `symlink start ${entry.name}`);
      await runWithTimeout(
        () => fs.promises.symlink(entry.sourcePath, targetPath, symlinkType),
        SYMLINK_TIMEOUT_MS,
        t("symlinkTimeout", Math.round(SYMLINK_TIMEOUT_MS / 1000), entry.name)
      );
      log("entry", `symlink done ${entry.name}`);
    }

    return { entry, status: "created", message: targetPath, targetPath };
  } catch (error) {
    if (mode === "copy" && !existedBefore) {
      // 复制中断会留下半个目录，清掉它，避免下次被当成“已存在”而跳过。
      try {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
      } catch (cleanupError) {
        logDebug("copy cleanup failed", targetPath, cleanupError && cleanupError.message);
      }
    }
    logDebug("share entry failed", entry && entry.name, error && error.message);
    log("entry", `failed ${entry.name}: ${error && error.message}`);
    return { entry, status: "error", message: error.message, targetPath };
  }
}

async function writeCommunityPlugins(configDir, pluginIds, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  const filePath = path.join(configDir, "community-plugins.json");
  log("config", `community read start ${filePath}`);
  const { existed, value, parseError } = await readJsonFile(filePath, []);
  const current = Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  const currentSet = new Set(current);
  const added = [];

  for (const id of pluginIds) {
    if (currentSet.has(id)) continue;
    currentSet.add(id);
    added.push(id);
  }

  const result = { added, filePath, backupPath: null, warnings: [] };
  if (parseError) result.warnings.push(t("configParseWarning", filePath));
  log("config", `community read done existing=${existed} current=${current.length} added=${added.length}`);
  if (added.length === 0) return result;

  await fs.promises.mkdir(configDir, { recursive: true });
  if (existed) {
    log("config", "community backup start");
    result.backupPath = await backupFile(filePath);
    log("config", `community backup done ${result.backupPath}`);
  }
  log("config", "community write start");
  await writeJsonFile(filePath, [...current, ...added]);
  log("config", "community write done");

  return result;
}

async function writeAppearanceConfig(configDir, options, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  const filePath = path.join(configDir, "appearance.json");
  log("config", `appearance read start ${filePath}`);
  const { existed, value, parseError } = await readJsonFile(filePath, {});
  const appearance = isPlainObject(value) ? Object.assign({}, value) : {};

  const result = { snippetsAdded: [], themeSet: null, filePath, backupPath: null, warnings: [] };
  if (parseError) result.warnings.push(t("configParseWarning", filePath));

  if (Array.isArray(options.snippetNames) && options.snippetNames.length > 0) {
    const current = Array.isArray(appearance.enabledCssSnippets)
      ? appearance.enabledCssSnippets.filter((name) => typeof name === "string")
      : [];
    const currentSet = new Set(current);
    const added = [];
    for (const name of options.snippetNames) {
      if (currentSet.has(name)) continue;
      currentSet.add(name);
      added.push(name);
    }
    if (added.length > 0) {
      appearance.enabledCssSnippets = [...current, ...added];
      result.snippetsAdded = added;
    }
  }

  if (options.themeName) {
    appearance.cssTheme = options.themeName;
    result.themeSet = options.themeName;
  }

  log("config", `appearance read done existing=${existed} snippets=${result.snippetsAdded.length} theme=${result.themeSet}`);
  if (result.snippetsAdded.length === 0 && !result.themeSet) return result;

  await fs.promises.mkdir(configDir, { recursive: true });
  if (existed) {
    log("config", "appearance backup start");
    result.backupPath = await backupFile(filePath);
    log("config", `appearance backup done ${result.backupPath}`);
  }
  log("config", "appearance write start");
  await writeJsonFile(filePath, appearance);
  log("config", "appearance write done");

  return result;
}

function filterSettingValue(fileId, value) {
  const source = isPlainObject(value) ? value : {};
  const excluded = SETTING_FILE_KEY_EXCLUSIONS[fileId];
  if (!excluded) return Object.assign({}, source);

  const filtered = {};
  for (const key of Object.keys(source)) {
    if (excluded.includes(key)) continue;
    filtered[key] = source[key];
  }
  return filtered;
}

function formatSettingValue(value) {
  if (value === undefined) return "—";
  let text;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function stableStringify(value) {  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function diffSettingValues(sourceValue, targetValue) {
  const source = isPlainObject(sourceValue) ? sourceValue : {};
  const target = isPlainObject(targetValue) ? targetValue : {};
  const changed = [];
  const added = [];
  const removed = [];

  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) added.push(key);
    else if (stableStringify(source[key]) !== stableStringify(target[key])) changed.push(key);
  }
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) removed.push(key);
  }

  return { changed, added, removed };
}

function normalizeHotkeyCombo(hotkey) {
  if (!isPlainObject(hotkey)) return "";
  const modifiers = Array.isArray(hotkey.modifiers)
    ? hotkey.modifiers.filter((modifier) => typeof modifier === "string").map((modifier) => modifier.toLowerCase())
    : [];
  const key = typeof hotkey.key === "string" ? hotkey.key : "";
  if (!key) return "";
  return [...modifiers.sort(), key.toLowerCase()].join("+");
}

function normalizeHotkeyMap(hotkeys) {
  const map = new Map();
  if (!isPlainObject(hotkeys)) return map;

  for (const commandId of Object.keys(hotkeys)) {
    const entries = Array.isArray(hotkeys[commandId]) ? hotkeys[commandId] : [];
    for (const hotkey of entries) {
      const combo = normalizeHotkeyCombo(hotkey);
      if (!combo) continue;
      if (!map.has(combo)) map.set(combo, new Set());
      map.get(combo).add(commandId);
    }
  }

  return map;
}

function findHotkeyConflicts(sourceHotkeys, targetHotkeys) {
  const sourceMap = normalizeHotkeyMap(sourceHotkeys);
  const targetMap = normalizeHotkeyMap(targetHotkeys);
  const conflicts = [];

  for (const [combo, sourceCommands] of sourceMap) {
    const targetCommands = targetMap.get(combo) || new Set();
    for (const sourceCommand of sourceCommands) {
      for (const targetCommand of targetCommands) {
        if (targetCommand === sourceCommand) continue;
        conflicts.push({ combo, sourceCommand, targetCommand, internal: false });
      }
    }
    if (sourceCommands.size > 1) {
      const [first, second] = Array.from(sourceCommands);
      conflicts.push({ combo, sourceCommand: first, targetCommand: second, internal: true });
    }
  }

  const seen = new Set();
  return conflicts.filter((conflict) => {
    const key = `${conflict.combo}|${conflict.sourceCommand}|${conflict.targetCommand}|${conflict.internal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeCorePluginChanges(coreSource, coreTarget) {
  const source = isPlainObject(coreSource) ? coreSource : {};
  const target = isPlainObject(coreTarget) ? coreTarget : {};
  const enabled = [];
  const disabled = [];

  for (const id of Object.keys(source)) {
    if (source[id] === true && target[id] !== true) enabled.push(id);
    if (source[id] === false && target[id] === true) disabled.push(id);
  }

  return { enabled, disabled };
}

async function scanTargetSettings(configDir, sourceRows) {
  const statuses = {};

  for (const row of sourceRows) {
    const read = await readJsonFile(path.join(configDir, row.fileName), {});
    const targetValue = isPlainObject(read.value) ? read.value : {};
    const sourceValue = filterSettingValue(row.id, row.value);
    const diff = diffSettingValues(sourceValue, targetValue);
    const touched = diff.changed.length + diff.added.length;
    const excluded = SETTING_FILE_KEY_EXCLUSIONS[row.id] || [];
    statuses[row.id] = {
      state: !read.existed ? "missing" : touched === 0 ? "same" : "diff",
      count: touched,
      parseError: read.parseError || null,
      changed: diff.changed.map((key) => ({ key, from: targetValue[key], to: sourceValue[key] })),
      added: diff.added.map((key) => ({ key, to: sourceValue[key] })),
      removed: diff.removed.filter((key) => !excluded.includes(key)),
    };
  }

  return statuses;
}

async function buildSettingsSharePlan(configDir, sourceRows) {
  const files = [];
  const warnings = [];
  const sourceWarnings = [];
  const vaultBoundKeys = [];
  const corePlugins = { enabled: [], disabled: [] };
  let hotkeyConflicts = [];
  let sawHotkeys = false;
  let sawCorePlugins = false;

  for (const row of sourceRows) {
    const filePath = path.join(configDir, row.fileName);
    const read = await readJsonFile(filePath, {});
    const targetValue = isPlainObject(read.value) ? read.value : {};
    if (read.parseError) warnings.push(filePath);
    if (row.parseError) sourceWarnings.push(row.sourcePath || row.fileName);

    const sourceValue = filterSettingValue(row.id, row.value);
    const diff = diffSettingValues(sourceValue, targetValue);

    files.push({
      id: row.id,
      fileName: row.fileName,
      filePath,
      existed: read.existed,
      parseError: read.parseError,
      sourceValue,
      targetValue,
      changed: diff.changed,
      added: diff.added,
      removed: diff.removed,
    });

    if (row.id === "hotkeys") {
      sawHotkeys = true;
      hotkeyConflicts = findHotkeyConflicts(sourceValue, targetValue);
    }
    if (row.id === "core-plugins") {
      sawCorePlugins = true;
      const summary = summarizeCorePluginChanges(sourceValue, targetValue);
      corePlugins.enabled = summary.enabled;
      corePlugins.disabled = summary.disabled;
    }
    if (row.id === "app") {
      const touching = [...diff.changed, ...diff.added];
      for (const key of touching) {
        if (VAULT_BOUND_KEYS.includes(key) && !vaultBoundKeys.includes(key)) vaultBoundKeys.push(key);
      }
    }
  }

  return { files, hotkeyConflicts, corePlugins, vaultBoundKeys, warnings, sourceWarnings, sawHotkeys, sawCorePlugins };
}

async function applySettingsSharePlan(configDir, plan, t, debug) {
  const log = typeof debug === "function" ? debug : logDebug;
  const results = [];

  for (const file of plan.files) {
    const touched = file.changed.length + file.added.length;
    if (touched === 0) {
      results.push({
        id: file.id,
        fileName: file.fileName,
        status: "unchanged",
        changed: [],
        added: [],
        backupPath: null,
        message: "",
      });
      continue;
    }

    try {
      await fs.promises.mkdir(configDir, { recursive: true });
      // The plan may have waited in a modal: re-read the target so keys Obsidian wrote in the
      // meantime are kept instead of being overwritten with the stale merge.
      const fresh = await readJsonFile(file.filePath, {});
      const freshTarget = isPlainObject(fresh.value) ? fresh.value : {};
      const freshDiff = diffSettingValues(file.sourceValue, freshTarget);
      const freshTouched = freshDiff.changed.length + freshDiff.added.length;
      if (freshTouched === 0) {
        results.push({
          id: file.id,
          fileName: file.fileName,
          status: "unchanged",
          changed: [],
          added: [],
          backupPath: null,
          message: "",
        });
        continue;
      }
      let backupPath = null;
      if (fresh.existed) backupPath = await backupFile(file.filePath);
      await writeJsonFile(file.filePath, Object.assign({}, freshTarget, file.sourceValue));
      log("settings", `wrote ${file.fileName} changed=${freshDiff.changed.length} added=${freshDiff.added.length}`);
      results.push({
        id: file.id,
        fileName: file.fileName,
        status: "written",
        changed: freshDiff.changed,
        added: freshDiff.added,
        backupPath,
        message: "",
      });
    } catch (error) {
      log("settings", `failed ${file.fileName}: ${error && error.message}`);
      results.push({
        id: file.id,
        fileName: file.fileName,
        status: "error",
        changed: file.changed,
        added: file.added,
        backupPath: null,
        message: (error && error.message) || String(error),
      });
    }
  }

  return { results };
}

async function readJsonFile(filePath, fallback) {
  const result = { existed: false, value: fallback, parseError: null };
  let raw;

  try {
    raw = await fs.promises.readFile(filePath, "utf8");
    result.existed = true;
  } catch (error) {
    if (error.code === "ENOENT") return result;
    throw error;
  }

  try {
    result.value = JSON.parse(raw);
  } catch (error) {
    result.parseError = error.message;
    result.value = fallback;
  }

  return result;
}

async function backupFile(filePath) {
  const backupPath = `${filePath}.bak`;
  try {
    await fs.promises.copyFile(filePath, backupPath);
    return backupPath;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.promises.rename(tmpPath, filePath);
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function readDirSafe(dirPath) {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function isFile(filePath) {
  const stats = await fs.promises.stat(filePath).catch(() => null);
  return !!stats && stats.isFile();
}

function runWithTimeout(task, timeoutMs, timeoutMessage) {
  let timer = null;
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(task), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function logDebug(...args) {
  try {
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug("[share-linker]", ...args);
    }
  } catch (error) {
    // logging must never break sharing
  }
}

function isLanded(status) {
  return status === "created" || status === "linked" || status === "exists";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeResults(results) {
  const summary = { created: 0, linked: 0, exists: 0, conflict: 0, error: 0 };
  for (const result of results) {
    if (summary[result.status] !== undefined) summary[result.status] += 1;
  }
  return summary;
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

function createSection(containerEl, title) {
  const sectionEl = containerEl.createDiv("plugin-share-linker-section");
  sectionEl.createEl("h3", { text: title });
  const bodyEl = sectionEl.createDiv("plugin-share-linker-section-body");
  return { sectionEl, bodyEl };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

function normalizePathInput(value) {
  return (value || "").trim().replace(/^~(?=$|\/|\\)/, process.env.HOME || process.env.USERPROFILE || "~");
}

function normalizePageSize(value) {
  return PAGE_SIZES.includes(value) ? value : 10;
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

