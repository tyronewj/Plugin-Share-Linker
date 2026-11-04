class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this.settings = {};
    this.__saved = null;
  }
  async loadData() {
    return this.__data || null;
  }
  async saveData(data) {
    this.__saved = data;
  }
  addSettingTab() {}
  addCommand() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}

class Setting {
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
}

class ButtonComponent {
  constructor() {
    this.buttonEl = { addClass() {}, createSpan() {} };
  }
  setIcon() {
    return this;
  }
  setCta() {
    return this;
  }
  onClick() {
    return this;
  }
  setDisabled() {
    return this;
  }
}

class Notice {
  constructor(message) {
    this.message = message;
  }
}

function createStubEl() {
  const el = {
    tagName: "DIV",
    children: [],
    classes: new Set(),
    textContent: "",
    title: "",
    attributes: {},
    listeners: {},
  };
  el.addClass = (cls) => {
    if (cls) String(cls).split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
  };
  el.removeClass = (cls) => el.classes.delete(cls);
  el.empty = () => {
    el.children = [];
    el.textContent = "";
  };
  el.setText = (text) => {
    el.textContent = text;
  };
  el.setAttribute = (name, value) => {
    el.attributes[name] = value;
  };
  el.getAttribute = (name) => el.attributes[name];
  el.appendChild = (child) => {
    el.children.push(child);
    return child;
  };
  el.createEl = (tag, opts) => {
    const child = createStubEl();
    child.tagName = String(tag || "div").toUpperCase();
    if (opts) {
      if (opts.cls) child.addClass(opts.cls);
      if (opts.text !== undefined) child.setText(opts.text);
    }
    return el.appendChild(child);
  };
  el.createDiv = (cls) => el.createEl("div", { cls });
  el.createSpan = (opts) => el.createEl("span", typeof opts === "string" ? { cls: opts } : opts);
  el.addEventListener = (type, handler) => {
    el.listeners[type] = el.listeners[type] || [];
    el.listeners[type].push(handler);
  };
  return el;
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = createStubEl();
    this.titleEl = createStubEl();
  }
  open() {
    if (typeof this.onOpen === "function") this.onOpen();
  }
  close() {
    if (typeof this.onClose === "function") this.onClose();
  }
}

module.exports = { Plugin, PluginSettingTab, Setting, ButtonComponent, Modal, Notice };
