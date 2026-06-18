# Plugin Share Linker

Plugin Share Linker is a desktop-only Obsidian plugin for sharing community plugins from the current vault to another Obsidian vault.

It supports two sharing modes:

- **Copy**: copies selected plugin folders into the target vault.
- **Symlink**: creates symbolic links in the target vault that point back to the selected plugins in the current vault.

## Features

- List plugins from the current Obsidian vault.
- Select one or more plugins across paginated plugin lists.
- Copy selected plugins to another vault.
- Create symlinks for selected plugins in another vault.
- Skip existing target folders or conflicting symlinks without overwriting.
- Switch the plugin UI between English and Chinese.

## Requirements

- Obsidian desktop app.
- A filesystem that supports symbolic links if you use Symlink mode.

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

1. Open **Settings -> Plugin Share Linker**.
2. Enter the target vault path.
3. Select the plugins you want to share.
4. Click **Copy** or **Symlink**.

The target plugin path is:

```text
<target-vault>/.obsidian/plugins/<plugin-folder-name>
```

## Copy vs Symlink

Use **Copy** when you want the target vault to have its own independent copy of the plugin files.

Use **Symlink** when you want multiple vaults to share the same plugin files from the source vault.

## Safety Behavior

Plugin Share Linker does not overwrite existing target plugins.

If the target path already contains a folder, file, or conflicting symlink with the same plugin folder name, the plugin skips that item and reports the result.

## Language

Use the language button at the top of the plugin settings page to switch between English and Chinese.

## Release Notes

For a GitHub release, upload the unpacked plugin files directly:

```text
main.js
manifest.json
styles.css
README.md
```
