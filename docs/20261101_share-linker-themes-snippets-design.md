# Share Linker：共享 themes 与 snippets，并可设置目标库启用的插件

## 摘要

在现有 Share Linker（只共享 `.obsidian/plugins/`）之上，扩展为一次共享三类资源：插件、主题（`.obsidian/themes/`）、CSS 片段（`.obsidian/snippets/`），并且把"共享之后目标库还要手动打开"这一步也接过来——插件写目标库的 `.obsidian/community-plugins.json`，片段写 `.obsidian/appearance.json` 的 `enabledCssSnippets`，主题按需写 `appearance.json` 的 `cssTheme`。所有写入都只做追加、写前备份、原子替换；目标库的 `workspace.json` 等布局状态一律不碰。设置页仍是单一"目标 Vault 路径" + 页内三分区（插件 / 主题 / CSS 片段），每个分区各有一组"复制 / 软链接"按钮，插件与片段各自多一列"启用"勾选。

高保真原型：[20261101_share-linker-themes-snippets-visual.html](./20261101_share-linker-themes-snippets-visual.html)（Obsidian 设置页内三分区的可交互原型，勾选、复制/软链接、启用汇总都可点）。

## 术语

| 术语 | 定义 | 避免 |
|---|---|---|
| 目标库 | 接收共享写入的另一个 Obsidian Vault；本插件始终从当前库读取、向目标库写入。 | 目标仓库、target vault |
| 启用列表 | 目标库 `.obsidian/community-plugins.json` 里记录的、该库当前启用的社区插件 ID 数组；它不在 `plugins/` 目录内，所以目录共享不会带上它。 | 插件清单、插件列表 |
| 外观配置 | 目标库 `.obsidian/appearance.json`，记录当前主题名（`cssTheme`）、深/浅底色（`theme`）与启用中的片段名数组（`enabledCssSnippets`）。 | 主题设置 |
| 片段 | `.obsidian/snippets/` 下扁平的 `.css` 文件，一个文件即一个片段。 | 插件片段、CSS 插件 |
| 落地 | 某个资源在目标库产生了可用副本：新建或链接成功，或目标库原本就有同名项；冲突与失败不算落地。 | 成功写入、完成共享 |

## 为什么

Obsidian 没有"全局插件"开关，插件、主题、片段都按仓库隔离在 `<vault>/.obsidian/` 下（见 [20261031_obsidian插件跨仓库共享方案.md](./prd/20261031_obsidian插件跨仓库共享方案.md)）。现在的 Share Linker 只能把 `plugins/<插件>/` 复制或软链接过去，于是每接一个新库都要做两遍事：搬文件，再进目标库设置里一个个打开插件。PRD 已经点破关键：**`data.json` 就在插件目录里，整目录共享会连设置一起共享；而"启用哪些插件"在 `community-plugins.json`、主题在 `themes/`、片段在 `snippets/`，这些都能由插件代写。** 所以这次要做的是把"搬文件"扩到三类资源，并把"共享当次勾选的资源在目标库处于启用状态"这件事顺手完成——同时保持 PRD 的红线：`workspace.json`、窗口状态绝不共享。

## 已定决策

### D1 目标库启用列表只做增量追加，不接管全量（q1）

- **决策：** 本次共享且勾选"启用"的插件 ID 加入目标库既有 `community-plugins.json`，不动任何已有项；不提供"整体替换目标库启用集合"的入口。
- **理由：** 对客人库最小侵入，写进去的每一项都是用户刚勾选过的；取消共享时还能回退。全量编辑会顺手关掉目标库自己开着的插件，且难以撤销。

| 选项 | 用户体验 | 技术正确性 | 风险 | 成本 |
|---|---|---|---|---|
| A 增量追加（**决策**） | good | good | mixed | good |
| B 全量编辑 | mixed | good | poor | mixed |
| C 只展示、不写 | poor | good | good | good |

- **被否决：** B 会关闭目标库自开的插件、难以撤销；C 把本可自动完成的动作推回用户。
- **一致性说明：** 决策 A 的最弱轴是 risk（mixed）——目标库的 Obsidian 正在运行时，其内存中的启用列表可能在退出时覆盖我们写入的文件。这一点不是靠 B/C 能解决的，改用"写前备份 + 原子写 + 固定提示先关闭目标库"兜底（见 D1 的配套与常规选择 q4）。

### D2 主题切换默认不动，由主题区单选显式指定（q5 → q10 → q13 连续细化）

- **决策：** 主题区提供一个单选"设为目标库当前主题"（默认"不设置"）。显式选中某个共享主题 → 写目标库 `appearance.json` 的 `cssTheme` 为该主题名，**即使目标库原本已有自定义主题也覆盖**（显式意图优先）。未显式选择时：只有"目标库没有自定义主题（`cssTheme` 为空/缺失）且本次恰好共享一个主题"才自动设为该主题；其余情况一律不动。
- **理由：** 主题是纯外观偏好，不该被别人的库悄悄接管；但单选存在的意义就是"我来指定"，把它置灰等于让控件在最需要时不可用。显式覆盖可撤销（用户能在目标库外观里改回），且默认不选时仍走保守规则。

q5 的选项评分（决策为 C）：

| 选项 | 用户体验 | 技术正确性 | 风险 | 成本 |
|---|---|---|---|---|
| A 不切换 | good | good | good | good |
| B 直接切换 | mixed | mixed | poor | good |
| C 仅当目标库没有自定义主题时切换（**决策**） | mixed | good | mixed | mixed |

- **被否决：** q5 的 A（完全不切换）和 B（直接切换）都过于一边倒：A 让"共享主题"永远差最后一步，B 会静默改客人库外观。C 在 ux/risk/cost 上都是 mixed——需要多一个单选控件、多一次目标库外观写入、且规则依赖目标库现有状态。
- **两处细化（q10、q13）：** q10 在"一次共享多个主题时谁当目标主题"上选择了"加单选由用户指定"（否决"按名称排序取第一个"与"只共享一个主题时自动切换"）；q13 在"目标库已有自定义主题时单选还能不能用"上选择了"可用且覆盖"（否决"禁用"与"隐藏单选"）——显式指定与自动判断是两回事，q5=C 保护的是自动行为，不该顺带否决用户明确指令。
- **一致性说明：** 决策 C 的最弱轴是 risk（mixed）：显式覆盖会改目标库外观。它可撤销、默认不触发，且结果里会写明"目标库当前主题已设为 X"。

### D3 复制模式不覆盖目标库已有副本，也不做内容比较（q9）

- **决策：** 目标位置已存在同名项就跳过，结果写"已存在（未更新）"；不提供"覆盖更新"选项，也不自动比较修改时间。文档记为后续项。
- **理由：** 覆盖会改写目标库已有内容，而插件目录里躺着 `data.json`——目标库可能改过设置，覆盖等于把别人的设置冲掉。mtime 比较对插件必然误报（`data.json` 每次运行都会变），噪音大于价值。

| 选项 | 用户体验 | 技术正确性 | 风险 | 成本 |
|---|---|---|---|---|
| A 不覆盖 + 文案标"未更新"（**决策**） | mixed | good | good | good |
| B 增加覆盖更新 | good | good | mixed | mixed |
| C 比较 mtime/大小后提示 | good | mixed | good | mixed |

- **被否决：** B 的风险来自插件 `data.json`（目标库改过的设置会被冲掉）；C 在插件上必然误报。A 的最弱轴是 ux（mixed）——复制模式下用户仍可能把"已存在"误读为"已同步"，因此结果文案必须写清"已存在（未更新）"。

### D4 软链接继续使用绝对路径（q14）

- **决策：** 插件、主题、片段三类资源的软链接统一用绝对路径（下方 PRD 建议相对路径，但选择保持现状）；新建链接结果里显示实际写入的链接目标，便于核对。已有绝对链接不迁移。
- **理由：** 绝对路径在"移动源库、移动目标库、跨盘符"三种情况里的行为是已知的，且 Windows 上相对目标无法跨盘符表达；改为相对路径需要改动已经在 1.0.1 里发出去的链接行为，收益（整包挪动不断链）不足以覆盖回归风险。

| 选项 | 用户体验 | 技术正确性 | 风险 | 成本 |
|---|---|---|---|---|
| A 统一改相对路径 | good | good | mixed | mixed |
| B 保持绝对路径（**决策**） | mixed | good | mixed | good |
| C 加设置项选择相对/绝对 | mixed | good | mixed | poor |

- **被否决：** A 能扛住父目录改名，但需要处理 Windows 相对链接兼容与跨盘符回退，且会改变存量链接行为；C 把选择权交给通常没有能力判断的用户，还要多维护一条设置。
- **一致性说明：** 决策 B 的最弱轴是 risk（mixed）：移动源库后链接全断。与 PRD 的"相对路径"建议相抵，这是本次有意的取舍——文档把它列进风险与后续项。

## 常规选择

- **q2 主题共享方式：** 与插件一致，同时支持"复制"和"软链接"，复用现有 `sharePlugins` 的 copy/link 两条路径与"已存在/冲突就跳过"的规则；主题没有 `data.json`，链接的收益是"一处改、处处生效"。
- **q3 目标库配置模型：** 一个目标 Vault 路径 + 页内三分区（插件 / 主题 / CSS 片段），不引入"每类资源一条路径"或"多目标 profile"（后者留作后续）。
- **q4 写入安全：** 写 `community-plugins.json` 前备份为 `community-plugins.json.bak`；先写临时文件再 `rename` 原子替换；只写"已落地"的插件（created / linked / exists），冲突与失败的不写；页面固定提示"目标库里的 Obsidian 请先关闭"。固件无法可靠检测目标库是否在运行（Obsidian 没有锁文件），因此不承诺检测，只做提示。
- **q6 片段启用：** 片段行也带"启用"勾选，写目标库 `appearance.json` 的 `enabledCssSnippets`；与插件一致只追加、不删除。**注意：片段启用与主题切换写的是同一个 `appearance.json`，必须合并为一次读-改-写**，否则两次独立写会互相覆盖。
- **q7 操作按钮：** 每个分区一组"复制 / 软链接"按钮，作用于该区所有勾选项；各分区可以各选各的模式（例：插件软链接保持同步、片段复制留独立副本）。不做"每行各自带按钮"，也不做"顶部统一模式 + 一次共享全部"。
- **q8 识别规则：** 主题只认 `themes/` 下含 `theme.css` 的子目录（`manifest.json` 可选，缺失时用文件夹名兜底，有则显示 `name` + `version`）；片段只认 `snippets/` 第一层的 `*.css`（大小写不敏感）；`themes/` 根下的裸文件（如 `obsidian.css`）、隐藏文件、无 `theme.css` 的目录一律忽略。列表为空时提示，而不是报错。
- **q9 结果与重复共享：** 复制模式"已存在就跳过"的文案必须写"已存在（未更新）"（见 D3）。
- **q10 / q13：** 见 D2 的细化规则（主题区单选 + 显式覆盖）。
- **q11 启用写入时机：** 与文件共享同一次点击完成——点"复制 / 软链接"即写文件 + 写目标库启用配置；结果摘要把"文件结果"和"目标库配置结果"分列，因为二者不是原子事务。
- **q12 结果呈现：** 每个分区一段文件明细（复用现在的摘要 + 列表），顶部一行总摘要，含"目标库启用：新增 N 个插件、M 个片段"与"目标库当前主题：X / 未改动"。
- **q15 目标库校验：** 目标路径必须存在、是目录、且不是当前 Vault（沿用现状）；`.obsidian` 不存在时允许创建（保持 1.0.1 的行为），但页面文案里提示"该目录看起来还不是 Obsidian 库，共享会在其中创建 .obsidian"。

### 功能与实现要点

**设置项（`data.json`，向后兼容现有键）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `targetVaultPath` | string | 沿用 |
| `selectedPluginIds` | string[] | 沿用：插件"共享"勾选 |
| `enabledPluginIds` | string[] | 新增：插件"启用"勾选（只对该次执行的落地插件生效） |
| `selectedThemeNames` | string[] | 新增：主题"共享"勾选（主题文件夹名） |
| `targetThemeName` | string | 新增：主题区单选值（空 = 不设置） |
| `selectedSnippetNames` | string[] | 新增：片段"共享"勾选（文件名的去 `.css` 名） |
| `enabledSnippetNames` | string[] | 新增：片段"启用"勾选 |
| `pageSize` / `language` | number / string | 沿用 |

**读取：**

- `listThemes()`：读 `当前库/.obsidian/themes/`，对每个子目录检查 `theme.css`；读可选的 `manifest.json`（`name`、`version`）；返回 `{ name, folderName, version, sourcePath }`，按 `name` 排序。
- `listSnippets()`：读 `当前库/.obsidian/snippets/` 下第一层 `*.css`（忽略隐藏文件），返回 `{ name, fileName, sourcePath }`。
- 目标库 `community-plugins.json` / `appearance.json` 的读取放在写入流程里：文件缺失或 JSON 解析失败时按空结构处理，但**先把原文件备份**再继续。

**写入：**

- `writeEnabledPlugins(targetVault, pluginIds)`：读目标库 `community-plugins.json`（缺失 → `[]`）→ 追加缺失的 ID（保持原顺序、去重）→ 备份 → 临时文件 + `rename` 原子替换。
- `writeEnabledSnippets(targetVault, snippetNames)` 与 `writeTargetTheme(targetVault, themeName)`：**合并为一次 `appearance.json` 读-改-写**；只改 `enabledCssSnippets`（追加、去重）与 `cssTheme`，其余键原样保留；同样备份 + 原子替换。
- `shareThemes(names, targetVaultPath, mode)` / `shareSnippets(names, targetVaultPath, mode)`：目录用 `fs.cp`（递归）或 `fs.symlink(..., 'dir')`；片段文件用 `fs.copyFile` 或 `fs.symlink(..., 'file')`；冲突规则与插件一致（目标已存在且非指向源的链接 → `exists`；指向别处的链接 → `conflict`；已是本链 → `linked`）。
- 目标 `.obsidian/plugins|themes|snippets` 目录按需 `mkdir -p`。

**结果模型：** 每条 `{ kind: 'plugin'|'theme'|'snippet', name, status: created|linked|exists|conflict|error, message }`；另有 `configResult: { pluginsEnabled, snippetsEnabled, themeSet, error? }`。摘要文案按分区聚合（q12）。

**UI：** 沿用 Obsidian `Setting`/`PluginSettingTab`；三个分区各含计数行、分页（仅插件区需要）、列表与工具栏；插件/片段行两个勾选（共享、启用），主题行一个勾选 + 版本；主题分区上方是单选组（"不设置" + 各已勾选主题）；底部结果区。所有新文案进 `TEXT.zh` / `TEXT.en` 两张表，保持 1.0.1 的双语结构。

**提醒：** 写入完成后 `Notice` 提示"文件已共享；目标库重启 Obsidian（或 Ctrl/Cmd+R）后生效"，与 PRD 第 3 条一致。

**交付：** `manifest.json` 版本升到 `1.0.2`；`README.md` 功能、用法、安全行为三节补 themes / snippets / 启用写入；`styles.css` 补分区与单选样式；`docs/` 保留本设计与原型。

**验收清单：**
1. 目标库未安装某插件时，勾选"共享 + 启用"→ 目标库出现插件目录且 `community-plugins.json` 追加该 ID；重启目标库后插件为启用状态。
2. 目标库已有插件且已启用时，只勾"共享"不勾"启用"→ 目标库启用状态不变，结果不出现"已禁用"字样。
3. 主题：勾选一个主题 → 目标库 `themes/<名>/theme.css` 出现；若目标库 `cssTheme` 为空且只共享一个主题，单选默认不写时自动设为该主题；显式选中则覆盖目标库已有 `cssTheme`。
4. 片段：勾选"共享 + 启用"→ 目标库 `snippets/<名>.css` 出现且 `appearance.json` 的 `enabledCssSnippets` 追加；同时设了目标主题时，两个改动落在同一次写入里、互不覆盖。
5. 三类资源在目标库已存在同名项 → 跳过并标"已存在（未更新）"；指向别处的软链接 → `conflict`；不出现覆盖。
6. 目标库 `community-plugins.json` 为损坏 JSON → 备份原文件、按空数组处理并在结果里报错，不抛未捕获异常。
7. 目标库 `.obsidian` 不存在 → 按 q15=B 创建，并在共享前给出"还不是 Obsidian 库"的提示。
8. 双向语言切换下所有新文案都有 zh/en 版本。

## 已验证的事实

- **本机三个真实 vault 实测**（`E:\ProjectSrc/amyj-zzgl`、`webtestrpa`、`gdyjxk-knowledge`）：其中两个库的 `appearance.json` 实际键为 `baseFontSize`、`theme`（`moonstone`）、`translucency`、`cssTheme`（`"Blue Topaz"`）、`accentColor`、`showViewHeader`，第三个是空对象 `{}`；`community-plugins.json` 是纯字符串 ID 数组；`themes/` 里既有 `Blue Topaz` 这类"文件夹 + manifest.json + theme.css"，也有一个裸的 `obsidian.css` 文件；三个库都没有 `snippets/` 目录，说明片段目录经常不存在、需要容忍为空。
- **主题 manifest 结构**（实测 `Blue Topaz/manifest.json`）：`name`、`version`、`minAppVersion`、`author`、`authorUrl`，没有 `description`；插件 manifest 则是 `id`、`name`、`version`、`description` 等——所以主题行只显示名字与版本。
- **Obsidian 配置字段**（obsidian-typings `AppVaultConfig` 文档）：`enabledCssSnippets: string[]`（Appearance > CSS snippets）、`cssTheme: string`（Appearance > Theme）、`theme: 'moonstone' | 'obsidian' | 'system'`（Appearance > Base color scheme）。来源：<https://obsidian-typings.github.io/obsidian-typings/public/api/obsidian/internals/app-vault-config/AppVaultConfig/>。
- **现有代码结构**（`main.js` 1.0.1，620 行）：`listPlugins()` 读当前库插件目录并解析 manifest；`sharePlugins(pluginIds, targetVaultPath, mode)` 统一处理 copy/symlink，内部 `copyPlugin`/`createPluginLink` 负责冲突判定；软链接用 `fs.symlink(plugin.sourcePath, targetPath, "dir")`（**绝对路径**）；目标目录硬编码 `path.join(targetVaultPath, ".obsidian", "plugins")`，而当前库用 `getConfigDir()`；结果状态只有 `created|linked|exists|conflict|error`，摘要按状态计数；UI 全部由一个 `PluginSettingTab` 手写，分页固定 `[5,10,20,50]`。
- **PRD 已确认的红线：** 不要链接整个 `.obsidian/`（`workspace.json`、窗口状态会互相打架）；目标位置必须为空才能建链接；建完必须重启 Obsidian；每个新库仍要手动关一次受限模式；删链接时不要 `rm -r`；iCloud/Dropbox 仓库别这么做。
- **`appearance.json` 中 `enabledCssSnippets` 与 `cssTheme` 同文件**，这一点决定实现里必须合并写（见常规选择 q6）。

## 风险

- **目标库 Obsidian 运行中覆盖写入：** 写完 `community-plugins.json` / `appearance.json` 后，目标库退出时可能用内存状态覆盖。无法可靠检测（没有锁文件），只能固定提示"先关闭目标库"。
- **复制模式副本陈旧：** 重复共享同一插件/主题/片段时目标库不会更新（D3 有意为之），用户可能误以为已同步；靠"已存在（未更新）"文案缓解，策略本身留给后续。
- **插件 `data.json` 随目录链路共享：** 软链接 / 复制都会带上设置，A 库改设置 B 库跟着变（PRD 已确认这是共享的副作用）；本次不拆 `data.json`。
- **Windows 符号链接权限：** 目录与文件符号链接都需要开发者模式或管理员权限，首次失败要在结果里给出可操作的错误信息（不能只说 "EPERM"）。
- **云盘仓库：** iCloud/Dropbox 里做符号链接容易与同步冲突（PRD 第 6 条），提示而不阻止。
- **只追加语义的误导：** D1 下"取消勾选启用"不会停用目标库已启用的插件；行上要显示"已在目标库启用"之类的既有状态说明，避免用户以为取消勾选就停用。
- **q15=B 下路径填错：** 允许创建 `.obsidian` 意味着路径填错会在错误位置留下目录；靠共享前的提示与结果里的目标路径文案降低概率。
- **显式覆盖目标库主题：** q13=B 允许覆盖，可撤销但会让目标库外观立刻变化；结果里必须写明。
- **`appearance.json` 双写冲突：** 片段启用与主题切换同文件，若拆成两次独立写入会互相覆盖——实现约束，已写入功能要点。

## 后续项（Deferred）

- **复制模式的覆盖/更新策略**（q9 的 B/C 方案）：等真正需要"热更新目标库副本"时再设计，配套要处理插件 `data.json` 的保留/覆盖问题。
- **每类资源独立目标路径 / 多目标 profile**（q3 的 B/C 方案）：维护 3 个以上库的用户提出后再做。
- **相对路径软链接与存量绝对链接迁移**（q14 的 A 方案）：结合 Windows 实测再定。
- **主题 / 片段分页**：列表变长后再加，当前按短列表处理。
- **片段启用状态的"取消"操作**：D1 只追加；若用户需要"目标库停用某片段"，需要单独的安全设计。

## 未决讨论

无。全部 15 个问题均已作答并收敛；q14（保持绝对路径）与 q15（允许创建 `.obsidian`）用户选择了偏离推荐但风险已知的现状方案，已分别记入 D4 与风险清单。

## 实施状态

已于 2026-11-01 按本设计实现（`main.js` 约 1150 行，`manifest.json` 当前 **1.0.4**）：插件 / 主题 / CSS 片段三分区共享、目标库启用写入（`community-plugins.json` 与 `appearance.json`，写前备份 + 临时文件 rename 原子替换）、主题单选与自动规则、结果分区摘要、中英双语。

验证方式：`node --check main.js` 通过；据此设计编写的 **50 项文件系统行为测试**（列表识别、复制、软链接、启用写入、备份、损坏 JSON、非 vault 目录、错误路径、绝对链接目标）、**39 项 UI 交互测试**（三分区渲染、工具栏按钮、共享/启用勾选联动、主题单选写入、双语切换、空库、错误态、目标路径自检）与 **7 项超时/中断测试**（15 秒目标超时、错误含路径、失败复制清理半成品）全部通过。

首次真机验收时发现并修复了一个只在 Obsidian 里暴露的 bug：**Obsidian 的 `setText()` 返回 `void`**，早期代码写成 `createDiv(...).setText(...)` 再 `.addClass(...)` 会抛 `TypeError`，导致动作在插入 busy 文案后立即中断、界面永久停在"正在…"（文件系统完全正常）。v1.0.4 已改为分步调用，并把测试用 DOM stub 改成与 Obsidian 一致（`setText`/`addClass`/`empty` 返回 `void`）以防回归；同时在插件目录写入 `debug.log`（同步追加、200KB 截断）作为后续排障手段。

