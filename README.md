# Plugin Share Linker

Plugin Share Linker is a desktop-only Obsidian plugin for sharing community plugins, themes and CSS snippets — and Obsidian's own settings files — from the current vault to another Obsidian vault.

It supports two sharing modes:

- **Copy**: copies the selected items into the target vault.
- **Symlink**: creates symbolic links in the target vault that point back to items in the current vault.

## Features

- List community plugins, themes and CSS snippets from the current Obsidian vault.
- Pick the target vault instead of only typing its path: a **Choose…** button lists the vaults Obsidian has recorded (`obsidian.json`, most recently opened first, marked current / open / missing), and **Browse…** opens the system folder dialog for any other folder.
- See the target vault's state next to every resource: each row pairs the current-vault item with its target status (Linked / Physical copy / Conflict / Broken link / Source unreachable / Not shared), and items that exist only in the target vault are listed in the same paired list.
- Check the target vault on demand: one **Check** scans `.obsidian/plugins`, `themes` and `snippets` for links whose physical target is gone (distinguishing broken links from an unmounted source drive) and compares the eight settings files, showing each as Same / Different by N keys / Missing.
- Repair or clean up from the row that shows the problem: rebuild a broken link to the same-named item in the current vault, or delete a broken link that has no source left — and clean the matching entries from the target vault's enable records. The sections also offer **Rebuild all** / **Delete all** for their own links.
- Select plugins across paginated plugin lists; select themes and snippets from their own sections.
- Copy or symlink the selection per section, so each resource type can use its own mode.
- Optionally enable the shared plugins in the target vault by appending their IDs to `.obsidian/community-plugins.json`.
- Optionally enable the shared CSS snippets in the target vault by appending their names to `.obsidian/appearance.json` (`enabledCssSnippets`).
- Optionally set the target vault's current theme (`cssTheme`) from a theme radio, or let it be set automatically when the target has no custom theme and exactly one theme is shared.
- Share Obsidian's own settings files (`app.json`, `appearance.json`, `hotkeys.json`, `core-plugins.json`, `graph.json`, `templates.json`, `daily-notes.json`, `zk-prefixer.json`) with top-level key merging: the source's keys override the target's, target-only keys stay, and nothing is deleted.
- Compare the target vault's settings files as part of that same manual check (Same / Different by N keys / Missing), preview exactly which keys a share will overwrite or add, and get hotkey conflicts, core-plugin enable/disable changes and vault-bound keys flagged before writing. Hovering a file row shows the differing keys and their target → source values.
- Skip existing target folders, files or conflicting symlinks without overwriting (settings files are merged instead, see below).
- Back up and atomically replace target config files before writing them.
- Switch the plugin UI between English and Chinese.

## Requirements

- Obsidian desktop app.
- A filesystem that supports symbolic links if you use Symlink mode.
- The target vault folder must already exist; `.obsidian` is created inside it if missing.

This plugin is marked as desktop-only because it uses Node.js filesystem APIs.

## Installation

Copy these files into:

```text
<your-vault>/.obsidian/plugins/plugin-share-linker/
```

Required files:

```text
main.js
manifest.json
styles.css
README.md
```

Then enable **Plugin Share Linker** in Obsidian's Community Plugins settings.

## Usage

1. Open **Settings -> Share Linker**.
2. Pick the target vault: click **Choose…** for a vault Obsidian has recorded, **Browse…** for the system folder dialog, or keep typing/pasting the path. The current vault cannot be the target.
3. Optionally click **Check** in **Target vault check** to scan the target vault's existing links and settings files (see below).
4. Optionally, in the **Obsidian settings** section, review each file's state (hover a file row for the differing keys), tick the files to share, then click **Share settings** and confirm the keys about to change. A single row also has **Share this file**.
5. In the **Plugins** section, pick plugins and their **Enable** flags, then click **Copy** or **Symlink**.
6. In the **Themes** section, pick themes, optionally choose the target vault's current theme, then click **Copy** or **Symlink**.
7. In the **CSS snippets** section, pick snippets and their **Enable** flags, then click **Copy** or **Symlink**.

The target paths are:

```text
<target-vault>/.obsidian/plugins/<plugin-folder-name>
<target-vault>/.obsidian/themes/<theme-folder-name>
<target-vault>/.obsidian/snippets/<snippet-file-name>.css
```

## Target Vault Picker

The target vault path row keeps a normal, editable text field (hand-typed and pasted paths, including network paths, still work). Two extra buttons sit below it:

- **Choose…** opens a modal listing the vaults recorded in Obsidian's own registry (`obsidian.json` in Obsidian's user-data folder), sorted by most recently opened. Each entry shows whether it is the saved path (当前), currently open in Obsidian (打开中), the current vault (not selectable) or missing from disk. A footer **Browse…** button falls back to the system folder dialog. If the registry cannot be read, the modal degrades to the saved path plus **Browse…** instead of failing.
- **Browse…** opens the system folder dialog directly (Electron `showOpenDialog`). This is the only way to pick a folder Obsidian has never opened, e.g. a brand-new vault folder.

Picking a vault saves the path and shows a notice. Typing a new path into the field saves it as you type. In both cases any previous link and settings result is cleared, because it belonged to the old target.

## Target Vault Check

Symlinked plugins, themes and snippets break silently when the source vault moves, is renamed, or an item is deleted: Obsidian just behaves as if the item were missing. **Target vault check** (between the target tools row and the Obsidian settings section) scans for exactly that, and in the same run compares the eight Obsidian settings files. It is the single manual check for the target vault.

- **Detection is manual.** Press **Check** to touch the target vault; nothing is scanned when the settings page opens, so an unreachable network drive cannot stall the page. Rebuilding, deleting or sharing does not re-run the check either: results are cleared only for the part that changed.
- **One run, two parts, one summary.** The section stays short: a badge that counts only broken / unreachable links, a status line, and one summary line for links plus one for settings files. The per-item state and the actions live where the item lives: each row of the Plugins / Themes / CSS snippets sections shows its target state, and the Obsidian settings rows show each file's state.
- **Failures keep the previous result.** If one part fails or times out, the section says which part failed and shows that part's previous result with its timestamp; the other part still updates. Both parts have their own 45-second timeout.
- Link results have three states. **Broken**: the link's target is gone and its parent folder is reachable (the item was deleted or moved). **Source unreachable**: the link's drive or network share itself cannot be accessed (external disk unplugged, network share offline) — these rows get no repair/delete buttons, because the right fix is usually to plug the source back in.
- **Rebuild link** re-points a broken link at the same-named item in the current vault (matching by folder/file name against the validated current-vault lists). If creating the new link fails, the old link is restored. **Delete link** is offered on every broken row, with or without a same-named item: it removes the link (never the physical resource) and cleans the matching entry from the target vault's enable records: `community-plugins.json`, `enabledCssSnippets` and — when the deleted theme is the target's current theme — `cssTheme`.
- **Rebuild all** / **Delete all** sit under each section's own toolbar and act only on that section's links; they ask for confirmation with the full list of affected links.

Every target config write is backed up to `<file>.bak` and replaced atomically.

## Obsidian Settings

The **Obsidian settings** section shares Obsidian's own per-vault settings files instead of resources. It lists eight files and lets you tick the ones to share:

```text
app.json            Editor and file behaviour
appearance.json     Appearance (not the enabled snippet list or current theme)
hotkeys.json        Hotkeys
core-plugins.json   Core plugin toggles
graph.json          Graph view settings
templates.json      Templates plugin settings
daily-notes.json    Daily notes plugin settings
zk-prefixer.json    ZK prefixer plugin settings
```

`workspace*.json`, `bookmarks.json` and `community-plugins.json` are never shared.

- **Merging, not replacing.** The source file's top-level keys override the target's same-named keys; keys that only exist in the target stay; keys removed from the source are not deleted from the target. Arrays and nested objects are replaced as a whole. Sharing is repeatable — every share only writes the keys that differ.
- **Only copy.** Settings files are written as real files (backup to `.bak`, temp file, atomic rename). Symlinks are not offered: Obsidian rewrites these files while it runs, so a link would make two vaults fight over one file.
- **Preview first.** After **Share settings**, a confirmation modal lists the changed / added keys per file, summarizes core plugins that will be enabled or disabled (`core-plugins.json`), reports hotkey combinations that collide with another command in the target vault, and calls out the vault-bound keys (`attachmentFolderPath`, `newFileLocation`, `userIgnoreFilters`) that change where the target vault stores files and which notes stay hidden.
- **Appearance excludes managed keys.** `cssTheme` and `enabledCssSnippets` are never shared; they keep being written by the theme radio and snippet **Enable** checkboxes.
- **Detection follows the manual check.** The target vault's settings files are compared when you press **Check** in Target vault check, not when the section renders. Each row shows Same / Different (N keys) / Missing, or "Not in this vault" when the source vault has no such file. Hover a row to see the differing keys, the target → source values, and target-only keys that will be kept. **Share this file** on a row opens the same confirmation dialog for just that file.
- **Per-file results.** Each file is written independently: a failing file (locked, read-only) is reported while the others still land, and the result card lists what was written, unchanged, or failed.

Restart Obsidian in the target vault (or press `Ctrl/Cmd + R`) after sharing for the new settings to take effect.

## Source ↔ Target Diff

The Plugins, Themes and CSS snippets sections are paired two-column lists. The left column is the current vault (checkbox, version, description); the right column shows what the target vault has under the same name: Linked, Physical copy, Conflict (a link pointing somewhere else), Broken link, Source unreachable, Not shared, or Not checked before the first scan. Items that exist only in the target vault appear at their alphabetical position with an empty left cell, showing their type (link / physical copy) and path. The right column is filled by the same **Check** scan; broken-link rows carry **Rebuild link** / **Delete link**, plugin pagination applies to the merged list, and the enable/select-all actions only apply to current-vault rows.

## Enabling items in the target vault

- **Plugins**: each shared plugin you enable is appended to the target vault's `.obsidian/community-plugins.json`. Entries are appended, never removed; unchecking **Enable** does not disable a plugin that the target vault already has enabled.
- **Snippets**: each shared snippet you enable is appended to the target vault's `.obsidian/appearance.json` under `enabledCssSnippets`.
- **Theme**: picking a theme in the radio group writes it to the target vault's `appearance.json` (`cssTheme`), overriding an existing theme. When nothing is picked, the plugin only sets the theme automatically if the target vault has no custom theme and exactly one theme is shared.

Config files are backed up to `<file>.bak` and replaced atomically (write to a temporary file, then rename). Only items that actually landed in the target vault are enabled.

Restart Obsidian in the target vault (or press `Ctrl/Cmd + R`) for plugin, theme and snippet changes to take effect.

## Copy vs Symlink

Use **Copy** when you want the target vault to have its own independent copy of the items.

Use **Symlink** when you want multiple vaults to share the same files from the source vault.

**Copy mode does not update existing copies**: re-sharing an item that already exists in the target vault is skipped and reported as "Exists (not updated)".

## Safety Behavior

Plugin Share Linker does not overwrite existing target plugins, themes or snippets.

If the target path already contains a folder, file, or conflicting symlink with the same name, the plugin skips that item and reports the result.

Config writes target only the shared and enabled items; other entries in `community-plugins.json` and `appearance.json` are preserved.

Settings files are the one place where existing target content is updated, and only by merging top-level keys: the confirmation modal lists the affected keys first, every written file is backed up to `<file>.bak`, and nothing is ever deleted from the target. Nothing is shared unless you tick it, and no settings file is ticked by default.

Target check actions are conservative: only symlinks are ever removed, never physical folders or files; links whose source drive is unreachable are excluded from both rebuild and delete, and both bulk actions ask for confirmation listing the affected links. Deleting a link also removes only its own entries from the target vault's enable records. Sharing settings clears only the settings result (the link result stays), and sharing resources clears only the link result (the settings result stays).

## Language

Use the language button at the top of the plugin settings page to switch between English and Chinese.

## Testing

The repository ships a regression suite that runs the plugin headlessly against a mocked `obsidian` module and temporary vaults (no Obsidian installation needed). Requires Node.js 18+:

```bash
node tests/run.js
```

It covers filesystem behavior (listing, copy, symlink, target-vault enable lists, backups, broken JSON, error handling), settings-file sharing (key-level merge, appearance exclusions, hotkey conflict detection, core-plugin summaries, per-file failure reporting), the manual target vault check (link scanning and settings comparison with independent timeouts, failure keeps the previous result, summary-only detection section, per-row and per-section actions), the target-vault picker list, UI wiring against a DOM stub (including settings chips and hover details after a manual check), and timeout/interruption handling. The `tests/` folder is not part of the release bundle.

## Release Notes

For a GitHub release, upload the unpacked plugin files directly:

```text
main.js
manifest.json
styles.css
README.md
```
