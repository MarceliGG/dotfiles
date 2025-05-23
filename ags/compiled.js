#!/usr/bin/gjs -m

// ../../../../usr/share/astal/gjs/gtk3/index.ts
import Astal7 from "gi://Astal?version=3.0";
import Gtk4 from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";

// ../../../../usr/share/astal/gjs/gtk3/astalify.ts
import Astal4 from "gi://Astal?version=3.0";
import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";

// ../../../../usr/share/astal/gjs/process.ts
import Astal from "gi://AstalIO";
var { Process } = Astal;
function subprocess(argsOrCmd, onOut = print, onErr = printerr) {
  const args = Array.isArray(argsOrCmd) || typeof argsOrCmd === "string";
  const { cmd, err, out } = {
    cmd: args ? argsOrCmd : argsOrCmd.cmd,
    err: args ? onErr : argsOrCmd.err || onErr,
    out: args ? onOut : argsOrCmd.out || onOut
  };
  const proc = Array.isArray(cmd) ? Astal.Process.subprocessv(cmd) : Astal.Process.subprocess(cmd);
  proc.connect("stdout", (_, stdout) => out(stdout));
  proc.connect("stderr", (_, stderr) => err(stderr));
  return proc;
}
function exec(cmd) {
  return Array.isArray(cmd) ? Astal.Process.execv(cmd) : Astal.Process.exec(cmd);
}
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    if (Array.isArray(cmd)) {
      Astal.Process.exec_asyncv(cmd, (_, res2) => {
        try {
          resolve(Astal.Process.exec_asyncv_finish(res2));
        } catch (error) {
          reject(error);
        }
      });
    } else {
      Astal.Process.exec_async(cmd, (_, res2) => {
        try {
          resolve(Astal.Process.exec_finish(res2));
        } catch (error) {
          reject(error);
        }
      });
    }
  });
}

// ../../../../usr/share/astal/gjs/variable.ts
import Astal3 from "gi://AstalIO";

// ../../../../usr/share/astal/gjs/binding.ts
var snakeify = (str) => str.replace(/([a-z])([A-Z])/g, "$1_$2").replaceAll("-", "_").toLowerCase();
var kebabify = (str) => str.replace(/([a-z])([A-Z])/g, "$1-$2").replaceAll("_", "-").toLowerCase();
var Binding = class _Binding {
  transformFn = (v) => v;
  #emitter;
  #prop;
  static bind(emitter, prop) {
    return new _Binding(emitter, prop);
  }
  constructor(emitter, prop) {
    this.#emitter = emitter;
    this.#prop = prop && kebabify(prop);
  }
  toString() {
    return `Binding<${this.#emitter}${this.#prop ? `, "${this.#prop}"` : ""}>`;
  }
  as(fn) {
    const bind2 = new _Binding(this.#emitter, this.#prop);
    bind2.transformFn = (v) => fn(this.transformFn(v));
    return bind2;
  }
  get() {
    if (typeof this.#emitter.get === "function")
      return this.transformFn(this.#emitter.get());
    if (typeof this.#prop === "string") {
      const getter = `get_${snakeify(this.#prop)}`;
      if (typeof this.#emitter[getter] === "function")
        return this.transformFn(this.#emitter[getter]());
      return this.transformFn(this.#emitter[this.#prop]);
    }
    throw Error("can not get value of binding");
  }
  subscribe(callback) {
    if (typeof this.#emitter.subscribe === "function") {
      return this.#emitter.subscribe(() => {
        callback(this.get());
      });
    } else if (typeof this.#emitter.connect === "function") {
      const signal = `notify::${this.#prop}`;
      const id = this.#emitter.connect(signal, () => {
        callback(this.get());
      });
      return () => {
        this.#emitter.disconnect(id);
      };
    }
    throw Error(`${this.#emitter} is not bindable`);
  }
};
var { bind } = Binding;

// ../../../../usr/share/astal/gjs/time.ts
import Astal2 from "gi://AstalIO";
var { Time } = Astal2;
function interval(interval2, callback) {
  return Astal2.Time.interval(interval2, () => void callback?.());
}
function timeout(timeout2, callback) {
  return Astal2.Time.timeout(timeout2, () => void callback?.());
}

// ../../../../usr/share/astal/gjs/variable.ts
var VariableWrapper = class extends Function {
  variable;
  errHandler = console.error;
  _value;
  _poll;
  _watch;
  pollInterval = 1e3;
  pollExec;
  pollTransform;
  pollFn;
  watchTransform;
  watchExec;
  constructor(init) {
    super();
    this._value = init;
    this.variable = new Astal3.VariableBase();
    this.variable.connect("dropped", () => {
      this.stopWatch();
      this.stopPoll();
    });
    this.variable.connect("error", (_, err) => this.errHandler?.(err));
    return new Proxy(this, {
      apply: (target, _, args) => target._call(args[0])
    });
  }
  _call(transform) {
    const b = Binding.bind(this);
    return transform ? b.as(transform) : b;
  }
  toString() {
    return String(`Variable<${this.get()}>`);
  }
  get() {
    return this._value;
  }
  set(value) {
    if (value !== this._value) {
      this._value = value;
      this.variable.emit("changed");
    }
  }
  startPoll() {
    if (this._poll)
      return;
    if (this.pollFn) {
      this._poll = interval(this.pollInterval, () => {
        const v = this.pollFn(this.get());
        if (v instanceof Promise) {
          v.then((v2) => this.set(v2)).catch((err) => this.variable.emit("error", err));
        } else {
          this.set(v);
        }
      });
    } else if (this.pollExec) {
      this._poll = interval(this.pollInterval, () => {
        execAsync(this.pollExec).then((v) => this.set(this.pollTransform(v, this.get()))).catch((err) => this.variable.emit("error", err));
      });
    }
  }
  startWatch() {
    if (this._watch)
      return;
    this._watch = subprocess({
      cmd: this.watchExec,
      out: (out) => this.set(this.watchTransform(out, this.get())),
      err: (err) => this.variable.emit("error", err)
    });
  }
  stopPoll() {
    this._poll?.cancel();
    delete this._poll;
  }
  stopWatch() {
    this._watch?.kill();
    delete this._watch;
  }
  isPolling() {
    return !!this._poll;
  }
  isWatching() {
    return !!this._watch;
  }
  drop() {
    this.variable.emit("dropped");
  }
  onDropped(callback) {
    this.variable.connect("dropped", callback);
    return this;
  }
  onError(callback) {
    delete this.errHandler;
    this.variable.connect("error", (_, err) => callback(err));
    return this;
  }
  subscribe(callback) {
    const id = this.variable.connect("changed", () => {
      callback(this.get());
    });
    return () => this.variable.disconnect(id);
  }
  poll(interval2, exec2, transform = (out) => out) {
    this.stopPoll();
    this.pollInterval = interval2;
    this.pollTransform = transform;
    if (typeof exec2 === "function") {
      this.pollFn = exec2;
      delete this.pollExec;
    } else {
      this.pollExec = exec2;
      delete this.pollFn;
    }
    this.startPoll();
    return this;
  }
  watch(exec2, transform = (out) => out) {
    this.stopWatch();
    this.watchExec = exec2;
    this.watchTransform = transform;
    this.startWatch();
    return this;
  }
  observe(objs, sigOrFn, callback) {
    const f = typeof sigOrFn === "function" ? sigOrFn : callback ?? (() => this.get());
    const set = (obj, ...args) => this.set(f(obj, ...args));
    if (Array.isArray(objs)) {
      for (const obj of objs) {
        const [o, s] = obj;
        const id = o.connect(s, set);
        this.onDropped(() => o.disconnect(id));
      }
    } else {
      if (typeof sigOrFn === "string") {
        const id = objs.connect(sigOrFn, set);
        this.onDropped(() => objs.disconnect(id));
      }
    }
    return this;
  }
  static derive(deps, fn = (...args) => args) {
    const update = () => fn(...deps.map((d) => d.get()));
    const derived = new Variable(update());
    const unsubs = deps.map((dep) => dep.subscribe(() => derived.set(update())));
    derived.onDropped(() => unsubs.map((unsub) => unsub()));
    return derived;
  }
};
var Variable = new Proxy(VariableWrapper, {
  apply: (_t, _a, args) => new VariableWrapper(args[0])
});
var variable_default = Variable;

// ../../../../usr/share/astal/gjs/gtk3/astalify.ts
function mergeBindings(array) {
  function getValues(...args) {
    let i = 0;
    return array.map(
      (value) => value instanceof Binding ? args[i++] : value
    );
  }
  const bindings = array.filter((i) => i instanceof Binding);
  if (bindings.length === 0)
    return array;
  if (bindings.length === 1)
    return bindings[0].as(getValues);
  return variable_default.derive(bindings, getValues)();
}
function setProp(obj, prop, value) {
  try {
    const setter = `set_${snakeify(prop)}`;
    if (typeof obj[setter] === "function")
      return obj[setter](value);
    return obj[prop] = value;
  } catch (error) {
    console.error(`could not set property "${prop}" on ${obj}:`, error);
  }
}
function astalify(cls, clsName = cls.name) {
  class Widget extends cls {
    get css() {
      return Astal4.widget_get_css(this);
    }
    set css(css) {
      Astal4.widget_set_css(this, css);
    }
    get_css() {
      return this.css;
    }
    set_css(css) {
      this.css = css;
    }
    get className() {
      return Astal4.widget_get_class_names(this).join(" ");
    }
    set className(className) {
      Astal4.widget_set_class_names(this, className.split(/\s+/));
    }
    get_class_name() {
      return this.className;
    }
    set_class_name(className) {
      this.className = className;
    }
    get cursor() {
      return Astal4.widget_get_cursor(this);
    }
    set cursor(cursor) {
      Astal4.widget_set_cursor(this, cursor);
    }
    get_cursor() {
      return this.cursor;
    }
    set_cursor(cursor) {
      this.cursor = cursor;
    }
    get clickThrough() {
      return Astal4.widget_get_click_through(this);
    }
    set clickThrough(clickThrough) {
      Astal4.widget_set_click_through(this, clickThrough);
    }
    get_click_through() {
      return this.clickThrough;
    }
    set_click_through(clickThrough) {
      this.clickThrough = clickThrough;
    }
    get noImplicitDestroy() {
      return this.__no_implicit_destroy;
    }
    set noImplicitDestroy(value) {
      this.__no_implicit_destroy = value;
    }
    _setChildren(children) {
      children = children.flat(Infinity).map((ch) => ch instanceof Gtk.Widget ? ch : new Gtk.Label({ visible: true, label: String(ch) }));
      if (this instanceof Gtk.Bin) {
        const ch = this.get_child();
        if (ch)
          this.remove(ch);
        if (ch && !children.includes(ch) && !this.noImplicitDestroy)
          ch?.destroy();
      } else if (this instanceof Gtk.Container) {
        for (const ch of this.get_children()) {
          this.remove(ch);
          if (!children.includes(ch) && !this.noImplicitDestroy)
            ch?.destroy();
        }
      }
      if (this instanceof Astal4.Box) {
        this.set_children(children);
      } else if (this instanceof Astal4.Stack) {
        this.set_children(children);
      } else if (this instanceof Astal4.CenterBox) {
        this.startWidget = children[0];
        this.centerWidget = children[1];
        this.endWidget = children[2];
      } else if (this instanceof Astal4.Overlay) {
        const [child, ...overlays] = children;
        this.set_child(child);
        this.set_overlays(overlays);
      } else if (this instanceof Gtk.Container) {
        for (const ch of children)
          this.add(ch);
      } else {
        throw Error(`can not add children to ${this.constructor.name}, it is not a container widget`);
      }
    }
    toggleClassName(cn, cond = true) {
      Astal4.widget_toggle_class_name(this, cn, cond);
    }
    hook(object, signalOrCallback, callback) {
      if (typeof object.connect === "function" && callback) {
        const id = object.connect(signalOrCallback, (_, ...args) => {
          callback(this, ...args);
        });
        this.connect("destroy", () => {
          object.disconnect(id);
        });
      } else if (typeof object.subscribe === "function" && typeof signalOrCallback === "function") {
        const unsub = object.subscribe((...args) => {
          signalOrCallback(this, ...args);
        });
        this.connect("destroy", unsub);
      }
      return this;
    }
    constructor(...params) {
      super();
      const [config] = params;
      const { setup, child, children = [], ...props } = config;
      props.visible ??= true;
      if (child)
        children.unshift(child);
      const bindings = Object.keys(props).reduce((acc, prop) => {
        if (props[prop] instanceof Binding) {
          const binding = props[prop];
          delete props[prop];
          return [...acc, [prop, binding]];
        }
        return acc;
      }, []);
      const onHandlers = Object.keys(props).reduce((acc, key) => {
        if (key.startsWith("on")) {
          const sig = kebabify(key).split("-").slice(1).join("-");
          const handler = props[key];
          delete props[key];
          return [...acc, [sig, handler]];
        }
        return acc;
      }, []);
      const mergedChildren = mergeBindings(children.flat(Infinity));
      if (mergedChildren instanceof Binding) {
        this._setChildren(mergedChildren.get());
        this.connect("destroy", mergedChildren.subscribe((v) => {
          this._setChildren(v);
        }));
      } else {
        if (mergedChildren.length > 0) {
          this._setChildren(mergedChildren);
        }
      }
      for (const [signal, callback] of onHandlers) {
        if (typeof callback === "function") {
          this.connect(signal, callback);
        } else {
          this.connect(signal, () => execAsync(callback).then(print).catch(console.error));
        }
      }
      for (const [prop, binding] of bindings) {
        if (prop === "child" || prop === "children") {
          this.connect("destroy", binding.subscribe((v) => {
            this._setChildren(v);
          }));
        }
        this.connect("destroy", binding.subscribe((v) => {
          setProp(this, prop, v);
        }));
        setProp(this, prop, binding.get());
      }
      Object.assign(this, props);
      setup?.(this);
    }
  }
  GObject.registerClass({
    GTypeName: `Astal_${clsName}`,
    Properties: {
      "class-name": GObject.ParamSpec.string(
        "class-name",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        ""
      ),
      "css": GObject.ParamSpec.string(
        "css",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        ""
      ),
      "cursor": GObject.ParamSpec.string(
        "cursor",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        "default"
      ),
      "click-through": GObject.ParamSpec.boolean(
        "click-through",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "no-implicit-destroy": GObject.ParamSpec.boolean(
        "no-implicit-destroy",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        false
      )
    }
  }, Widget);
  return Widget;
}

// ../../../../usr/share/astal/gjs/gtk3/app.ts
import Gtk2 from "gi://Gtk?version=3.0";
import Astal5 from "gi://Astal?version=3.0";

// ../../../../usr/share/astal/gjs/overrides.ts
var snakeify2 = (str) => str.replace(/([a-z])([A-Z])/g, "$1_$2").replaceAll("-", "_").toLowerCase();
async function suppress(mod, patch2) {
  return mod.then((m) => patch2(m.default)).catch(() => void 0);
}
function patch(proto, prop) {
  Object.defineProperty(proto, prop, {
    get() {
      return this[`get_${snakeify2(prop)}`]();
    }
  });
}
await suppress(import("gi://AstalApps"), ({ Apps: Apps2, Application }) => {
  patch(Apps2.prototype, "list");
  patch(Application.prototype, "keywords");
  patch(Application.prototype, "categories");
});
await suppress(import("gi://AstalBattery"), ({ UPower }) => {
  patch(UPower.prototype, "devices");
});
await suppress(import("gi://AstalBluetooth"), ({ Adapter, Bluetooth, Device }) => {
  patch(Adapter.prototype, "uuids");
  patch(Bluetooth.prototype, "adapters");
  patch(Bluetooth.prototype, "devices");
  patch(Device.prototype, "uuids");
});
await suppress(import("gi://AstalHyprland"), ({ Hyprland: Hyprland2, Monitor, Workspace }) => {
  patch(Hyprland2.prototype, "monitors");
  patch(Hyprland2.prototype, "workspaces");
  patch(Hyprland2.prototype, "clients");
  patch(Monitor.prototype, "availableModes");
  patch(Monitor.prototype, "available_modes");
  patch(Workspace.prototype, "clients");
});
await suppress(import("gi://AstalMpris"), ({ Mpris, Player }) => {
  patch(Mpris.prototype, "players");
  patch(Player.prototype, "supported_uri_schemas");
  patch(Player.prototype, "supportedUriSchemas");
  patch(Player.prototype, "supported_mime_types");
  patch(Player.prototype, "supportedMimeTypes");
  patch(Player.prototype, "comments");
});
await suppress(import("gi://AstalNetwork"), ({ Wifi }) => {
  patch(Wifi.prototype, "access_points");
  patch(Wifi.prototype, "accessPoints");
});
await suppress(import("gi://AstalNotifd"), ({ Notifd: Notifd2, Notification }) => {
  patch(Notifd2.prototype, "notifications");
  patch(Notification.prototype, "actions");
});
await suppress(import("gi://AstalPowerProfiles"), ({ PowerProfiles }) => {
  patch(PowerProfiles.prototype, "actions");
});

// ../../../../usr/share/astal/gjs/_app.ts
import { setConsoleLogDomain } from "console";
import { exit, programArgs } from "system";
import IO from "gi://AstalIO";
import GObject2 from "gi://GObject";
function mkApp(App) {
  return new class AstalJS extends App {
    static {
      GObject2.registerClass({ GTypeName: "AstalJS" }, this);
    }
    eval(body) {
      return new Promise((res2, rej) => {
        try {
          const fn = Function(`return (async function() {
                        ${body.includes(";") ? body : `return ${body};`}
                    })`);
          fn()().then(res2).catch(rej);
        } catch (error) {
          rej(error);
        }
      });
    }
    requestHandler;
    vfunc_request(msg, conn) {
      if (typeof this.requestHandler === "function") {
        this.requestHandler(msg, (response) => {
          IO.write_sock(
            conn,
            String(response),
            (_, res2) => IO.write_sock_finish(res2)
          );
        });
      } else {
        super.vfunc_request(msg, conn);
      }
    }
    apply_css(style, reset = false) {
      super.apply_css(style, reset);
    }
    quit(code) {
      super.quit();
      exit(code ?? 0);
    }
    start({ requestHandler, css, hold, main, client, icons, ...cfg } = {}) {
      const app = this;
      client ??= () => {
        print(`Astal instance "${app.instanceName}" already running`);
        exit(1);
      };
      Object.assign(this, cfg);
      setConsoleLogDomain(app.instanceName);
      this.requestHandler = requestHandler;
      app.connect("activate", () => {
        main?.(...programArgs);
      });
      try {
        app.acquire_socket();
      } catch (error) {
        return client((msg) => IO.send_message(app.instanceName, msg), ...programArgs);
      }
      if (css)
        this.apply_css(css, false);
      if (icons)
        app.add_icons(icons);
      hold ??= true;
      if (hold)
        app.hold();
      app.runAsync([]);
    }
  }();
}

// ../../../../usr/share/astal/gjs/gtk3/app.ts
Gtk2.init(null);
var app_default = mkApp(Astal5.Application);

// ../../../../usr/share/astal/gjs/gtk3/widget.ts
import Astal6 from "gi://Astal?version=3.0";
import Gtk3 from "gi://Gtk?version=3.0";
import GObject3 from "gi://GObject";
Object.defineProperty(Astal6.Box.prototype, "children", {
  get() {
    return this.get_children();
  },
  set(v) {
    this.set_children(v);
  }
});
var Box = class extends astalify(Astal6.Box) {
  static {
    GObject3.registerClass({ GTypeName: "Box" }, this);
  }
  constructor(props, ...children) {
    super({ children, ...props });
  }
};
var Button = class extends astalify(Astal6.Button) {
  static {
    GObject3.registerClass({ GTypeName: "Button" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};
var CenterBox = class extends astalify(Astal6.CenterBox) {
  static {
    GObject3.registerClass({ GTypeName: "CenterBox" }, this);
  }
  constructor(props, ...children) {
    super({ children, ...props });
  }
};
var CircularProgress = class extends astalify(Astal6.CircularProgress) {
  static {
    GObject3.registerClass({ GTypeName: "CircularProgress" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};
var DrawingArea = class extends astalify(Gtk3.DrawingArea) {
  static {
    GObject3.registerClass({ GTypeName: "DrawingArea" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var Entry = class extends astalify(Gtk3.Entry) {
  static {
    GObject3.registerClass({ GTypeName: "Entry" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var EventBox = class extends astalify(Astal6.EventBox) {
  static {
    GObject3.registerClass({ GTypeName: "EventBox" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};
var Icon = class extends astalify(Astal6.Icon) {
  static {
    GObject3.registerClass({ GTypeName: "Icon" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var Label = class extends astalify(Astal6.Label) {
  static {
    GObject3.registerClass({ GTypeName: "Label" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var LevelBar = class extends astalify(Astal6.LevelBar) {
  static {
    GObject3.registerClass({ GTypeName: "LevelBar" }, this);
  }
  constructor(props) {
    super(props);
  }
};
Object.defineProperty(Astal6.Overlay.prototype, "overlays", {
  get() {
    return this.get_overlays();
  },
  set(v) {
    this.set_overlays(v);
  }
});
var Overlay = class extends astalify(Astal6.Overlay) {
  static {
    GObject3.registerClass({ GTypeName: "Overlay" }, this);
  }
  constructor(props, ...children) {
    super({ children, ...props });
  }
};
var Revealer = class extends astalify(Gtk3.Revealer) {
  static {
    GObject3.registerClass({ GTypeName: "Revealer" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};
var Scrollable = class extends astalify(Astal6.Scrollable) {
  static {
    GObject3.registerClass({ GTypeName: "Scrollable" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};
var Slider = class extends astalify(Astal6.Slider) {
  static {
    GObject3.registerClass({ GTypeName: "Slider" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var Stack = class extends astalify(Astal6.Stack) {
  static {
    GObject3.registerClass({ GTypeName: "Stack" }, this);
  }
  constructor(props, ...children) {
    super({ children, ...props });
  }
};
var Switch = class extends astalify(Gtk3.Switch) {
  static {
    GObject3.registerClass({ GTypeName: "Switch" }, this);
  }
  constructor(props) {
    super(props);
  }
};
var Window = class extends astalify(Astal6.Window) {
  static {
    GObject3.registerClass({ GTypeName: "Window" }, this);
  }
  constructor(props, child) {
    super({ child, ...props });
  }
};

// sass:/home/marcel/dotfiles/ags/style.scss
var style_default = '* {\n  color: #f1f1f1;\n  font-size: 16px;\n}\n\n.Bar {\n  background: rgba(0, 0, 0, 0.8);\n}\n.Bar icon {\n  font-size: 20px;\n  margin-right: 5px;\n}\n.Bar .icon {\n  font-size: 22px;\n  margin-right: 5px;\n  /* margin-bottom: 2px; */\n}\n.Bar .status {\n  margin: 0 8px;\n}\n\n.battery.charging {\n  /* label {\n    color: $accent;\n  } */\n}\n.battery.charging .icon {\n  color: #2B82D3;\n  margin-right: 10px;\n}\n\nbutton {\n  background: transparent;\n  border: none;\n  padding: 0;\n  border-radius: 0;\n}\n\nicon {\n  font-size: 25px;\n}\n\n.workspaces icon {\n  margin-top: 2px;\n  margin-left: 5px;\n}\n.workspaces button {\n  padding-right: 4px;\n  padding-top: 3px;\n  border-bottom: 3px solid transparent;\n  font-weight: normal;\n}\n.workspaces button label {\n  margin-left: 8px;\n  margin-right: 4px;\n}\n.workspaces button.exist {\n  border-bottom: 3px solid rgb(50, 50, 50);\n}\n.workspaces button.focused {\n  /* background: $accent; */\n  background: rgb(50, 50, 50);\n  border-bottom: 3px solid #2B82D3;\n}\n\n.Notifications eventbox button {\n  background: rgb(50, 50, 50);\n  border-radius: 8px;\n  margin: 0 2px;\n}\n.Notifications eventbox > box {\n  margin: 4px;\n  background: rgba(0, 0, 0, 0.8);\n  padding: 4px 2px;\n  min-width: 300px;\n  border-radius: 12px;\n  /* border: 2px solid red; */\n}\n.Notifications eventbox .image {\n  min-height: 48px;\n  min-width: 48px;\n  font-size: 48px;\n  margin: 4px;\n}\n.Notifications eventbox .main {\n  padding-left: 4px;\n  margin-bottom: 2px;\n}\n.Notifications eventbox .main .header .summary {\n  font-size: 1.2em;\n  font-weight: bold;\n}\n.Notifications eventbox.critical > box {\n  border: 2px solid red;\n}\n\n.clock .icon {\n  margin-right: 5px;\n  color: #2B82D3;\n}\n\n.tray {\n  margin-right: 2px;\n}\n.tray icon {\n  font-size: 18px;\n  margin: 0 4px;\n}\n\n#launcher {\n  background: none;\n}\n#launcher .main {\n  background: rgba(0, 0, 0, 0.8);\n  border-radius: 12px;\n  border: 2px solid #2B82D3;\n  background: url("/home/marcel/Pictures/wallpappers/pexels-eberhard-grossgasteiger-443446.jpg");\n  background-size: cover;\n}\n#launcher .main .listbox {\n  background: rgba(0, 0, 0, 0.8);\n  border-bottom-right-radius: 10px;\n  border-top-right-radius: 10px;\n}\n#launcher .main icon {\n  margin: 0 4px;\n}\n#launcher .main .description {\n  color: #bbb;\n  font-size: 0.8em;\n}\n#launcher .main button:hover {\n  background: #555;\n  /* border: $padd solid #555; */\n}\n#launcher .main button:focus {\n  outline: 2px solid #2B82D3;\n}\n#launcher .main button {\n  margin: 4px;\n}\n#launcher .main button,\n#launcher .main entry {\n  outline: none;\n}\n#launcher .main entry {\n  background: rgba(0, 0, 0, 0.8);\n  border-radius: 10px;\n  margin: 4px;\n}\n\n.Osd box {\n  background: rgba(0, 0, 0, 0.8);\n  border-radius: 24px;\n  padding: 10px 12px;\n}\n.Osd box trough {\n  padding: 0;\n  margin: 8px;\n  border-radius: 5px;\n}\n.Osd box trough block {\n  border-radius: 5px;\n  border: none;\n}\n.Osd box trough block.filled {\n  background: white;\n}\n.Osd box label {\n  min-width: 40px;\n}\n\n#background {\n  background: url("/home/marcel/Pictures/wallpappers/pexels-eberhard-grossgasteiger-443446.jpg");\n  background-size: cover;\n  /* background: red; */\n}';

// ../../../../usr/share/astal/gjs/index.ts
import { default as default3 } from "gi://AstalIO?version=0.1";

// ../../../../usr/share/astal/gjs/file.ts
import Astal8 from "gi://AstalIO";
import Gio from "gi://Gio?version=2.0";
function readFile(path) {
  return Astal8.read_file(path) || "";
}
function monitorFile(path, callback) {
  return Astal8.monitor_file(path, (file, event) => {
    callback(file, event);
  });
}

// ../../../../usr/share/astal/gjs/gobject.ts
import GObject4 from "gi://GObject";
import { default as default2 } from "gi://GLib?version=2.0";
var meta = Symbol("meta");
var priv = Symbol("priv");
var { ParamSpec, ParamFlags } = GObject4;

// widget/Bar.jsx
import Battery from "gi://AstalBattery";

// widget/workspaces.jsx
import Hyprland from "gi://AstalHyprland";

// util.js
function get_icon(window_class) {
  switch (window_class) {
    case "zen":
      return "zen-browser";
    default:
      return Astal7.Icon.lookup_icon(window_class) ? window_class : window_class.toLowerCase();
  }
}

// ../../../../usr/share/astal/gjs/gtk3/jsx-runtime.ts
function isArrowFunction(func) {
  return !Object.hasOwn(func, "prototype");
}
function jsx(ctor, { children, ...props }) {
  children ??= [];
  if (!Array.isArray(children))
    children = [children];
  children = children.filter(Boolean);
  if (children.length === 1)
    props.child = children[0];
  else if (children.length > 1)
    props.children = children;
  if (typeof ctor === "string") {
    return new ctors[ctor](props);
  }
  if (isArrowFunction(ctor))
    return ctor(props);
  return new ctor(props);
}
var ctors = {
  box: Box,
  button: Button,
  centerbox: CenterBox,
  circularprogress: CircularProgress,
  drawingarea: DrawingArea,
  entry: Entry,
  eventbox: EventBox,
  // TODO: fixed
  // TODO: flowbox
  icon: Icon,
  label: Label,
  levelbar: LevelBar,
  // TODO: listbox
  overlay: Overlay,
  revealer: Revealer,
  scrollable: Scrollable,
  slider: Slider,
  stack: Stack,
  switch: Switch,
  window: Window
};
var jsxs = jsx;

// widget/workspaces.jsx
function Workspaces({ orientation }) {
  const hypr = Hyprland.get_default();
  const addStatic = (arr, id) => {
    const idx = id === 1 ? 0 : arr.findIndex((w) => w.id === id - 1);
    print(`to insert: ${id} idx: ${idx}`);
    if (idx < 0)
      return;
    if (arr.find((w) => w.id === id) === void 0)
      arr.splice(idx + 1, 0, { "id": id, "name": id, "static": true });
  };
  return /* @__PURE__ */ jsxs("box", { className: "workspaces", orientation, children: [
    bind(hypr, "workspaces").as((workspaces) => {
      const filtered = workspaces.filter((ws) => !(ws.id >= -99 && ws.id <= -2)).sort((a, b) => a.id - b.id);
      addStatic(filtered, 1);
      addStatic(filtered, 2);
      addStatic(filtered, 3);
      addStatic(filtered, 4);
      addStatic(filtered, 5);
      return filtered.map((w) => /* @__PURE__ */ jsx(
        "button",
        {
          className: bind(hypr, "focusedWorkspace").as(
            (fw) => w.id === fw.id ? "focused" : w.static ? "" : "exist"
          ),
          onClicked: () => hypr.message(`dispatch workspace ${w.id}`),
          children: w.name
        }
      ));
    }),
    bind(hypr, "focusedClient").as((client) => {
      if (client)
        return /* @__PURE__ */ jsx("icon", { icon: bind(client, "initial-class").as((c) => get_icon(c)) });
      else
        return "";
    }),
    bind(hypr, "focusedClient").as((client) => {
      if (client)
        return /* @__PURE__ */ jsx("label", { ellipsize: 3, label: bind(client, "title").as((t) => t || client.initialTitle || client.class), css: "margin-right: 20px" });
      else
        return "";
    })
  ] });
}

// widget/tray.jsx
import Tray from "gi://AstalTray";
var createMenu = (menuModel, actionGroup) => {
  const menu = Gtk4.Menu.new_from_model(menuModel);
  menu.insert_action_group("dbusmenu", actionGroup);
  return menu;
};
function SysTray({ orientation }) {
  const tray = Tray.get_default();
  return /* @__PURE__ */ jsx("box", { className: "tray", orientation, visible: bind(tray, "items").as((items) => items.length > 0), children: bind(tray, "items").as((items) => items.map((item) => {
    let menu;
    const entryBinding = Variable.derive(
      [bind(item, "menuModel"), bind(item, "actionGroup")],
      (menuModel, actionGroup) => {
        if (!menuModel) {
          return console.error(`Menu Model not found for ${item.id}`);
        }
        if (!actionGroup) {
          return console.error(`Action Group not found for ${item.id}`);
        }
        menu = createMenu(menuModel, actionGroup);
      }
    );
    return /* @__PURE__ */ jsx(
      "button",
      {
        onClick: (btn, _) => {
          menu?.popup_at_widget(btn, Gdk.Gravity.NORTH, Gdk.Gravity.SOUTH, null);
        },
        onDestroy: () => {
          menu?.destroy();
          entryBinding.drop();
        },
        children: /* @__PURE__ */ jsx("icon", { "g-icon": bind(item, "gicon") })
      }
    );
  })) });
}

// widget/Bar.jsx
import Wp from "gi://AstalWp";
import Network from "gi://AstalNetwork";
function BatteryLevel() {
  const bat = Battery.get_default();
  const icons = {
    // battery icons from nerd fonts https://www.nerdfonts.com/
    "battery-level-0-charging-symbolic": "\u{F089F}",
    "battery-level-10-charging-symbolic": "\u{F089C}",
    "battery-level-20-charging-symbolic": "\u{F0086}",
    "battery-level-30-charging-symbolic": "\u{F0087}",
    "battery-level-40-charging-symbolic": "\u{F0088}",
    "battery-level-50-charging-symbolic": "\u{F089D}",
    "battery-level-60-charging-symbolic": "\u{F0089}",
    "battery-level-70-charging-symbolic": "\u{F089E}",
    "battery-level-80-charging-symbolic": "\u{F008A}",
    "battery-level-90-charging-symbolic": "\u{F008B}",
    "battery-level-100-charged-symbolic": "\u{F0085}",
    "battery-level-0-symbolic": "\u{F008E}",
    "battery-level-10-symbolic": "\u{F007A}",
    "battery-level-20-symbolic": "\u{F007B}",
    "battery-level-30-symbolic": "\u{F007C}",
    "battery-level-40-symbolic": "\u{F007D}",
    "battery-level-50-symbolic": "\u{F007E}",
    "battery-level-60-symbolic": "\u{F007F}",
    "battery-level-70-symbolic": "\u{F0080}",
    "battery-level-80-symbolic": "\u{F0081}",
    "battery-level-90-symbolic": "\u{F0082}",
    "battery-level-100-symbolic": "\u{F0079}"
  };
  let wasNotified = false;
  return /* @__PURE__ */ jsxs(
    "box",
    {
      className: bind(bat, "charging").as((c) => c ? "charging battery status" : "battery status"),
      hexpand: true,
      children: [
        /* @__PURE__ */ jsx(
          "label",
          {
            className: "icon",
            label: bind(bat, "batteryIconName").as((b) => icons[b])
          }
        ),
        /* @__PURE__ */ jsx(
          "label",
          {
            label: bind(bat, "percentage").as((p) => {
              if (p < 0.2) {
                if (!wasNotified) {
                  execAsync(["notify-send", "-u", "critical", "-i", "battery-caution-symbolic", "Low Battery"]);
                  wasNotified = true;
                }
              } else wasNotified = false;
              return `${Math.floor(p * 100)}%`;
            })
          }
        )
      ]
    }
  );
}
function Volume() {
  const speaker = Wp.get_default()?.audio.defaultSpeaker;
  return /* @__PURE__ */ jsxs("box", { className: "volume status", children: [
    /* @__PURE__ */ jsx("icon", { icon: bind(speaker, "volumeIcon") }),
    /* @__PURE__ */ jsx("label", { label: bind(speaker, "volume").as((p) => `${Math.floor(p * 100)}%`) })
  ] });
}
function Bar(monitor) {
  const { TOP, RIGHT, LEFT } = Astal7.WindowAnchor;
  const network = Network.get_default();
  const wifi = bind(network, "wifi");
  return /* @__PURE__ */ jsx(
    "window",
    {
      className: "Bar",
      namespace: "ags-bar",
      gdkmonitor: monitor,
      exclusivity: Astal7.Exclusivity.EXCLUSIVE,
      anchor: TOP | LEFT | RIGHT,
      children: /* @__PURE__ */ jsxs("centerbox", { children: [
        /* @__PURE__ */ jsx("box", { className: "segment start", halign: Gtk4.Align.START, children: /* @__PURE__ */ jsx(Workspaces, {}) }),
        /* @__PURE__ */ jsx("box", { className: "segment center", children: /* @__PURE__ */ jsx(
          "label",
          {
            label: Variable("").poll(
              5e3,
              () => default2.DateTime.new_now_local().format("%H:%M %A %d/%m/%Y")
            )()
          }
        ) }),
        /* @__PURE__ */ jsxs("box", { className: "segment end", halign: Gtk4.Align.END, children: [
          /* @__PURE__ */ jsx(SysTray, {}),
          wifi.as(
            (wifi2) => wifi2 && /* @__PURE__ */ jsxs(
              "box",
              {
                className: "network status",
                halign: Gtk4.Align.CENTER,
                hexpand: true,
                children: [
                  /* @__PURE__ */ jsx(
                    "icon",
                    {
                      icon: bind(wifi2, "iconName")
                    }
                  ),
                  /* @__PURE__ */ jsx("label", { label: bind(wifi2, "ssid") })
                ]
              }
            )
          ),
          /* @__PURE__ */ jsx(BatteryLevel, {}),
          /* @__PURE__ */ jsx(Volume, {})
        ] })
      ] })
    }
  );
}

// widget/Notifications.jsx
import Notifd from "gi://AstalNotifd";
var { START, CENTER, END } = Gtk4.Align;
var getUrgency = (n) => {
  const { LOW, NORMAL, CRITICAL } = Notifd.Urgency;
  switch (n.urgency) {
    case LOW:
      return "low";
    case CRITICAL:
      return "critical";
    case NORMAL:
    default:
      return "normal";
  }
};
function Notif(notif) {
  return /* @__PURE__ */ jsx(
    "eventbox",
    {
      className: getUrgency(notif),
      onClick: () => notif.dismiss(),
      children: /* @__PURE__ */ jsxs("box", { vertical: true, children: [
        /* @__PURE__ */ jsxs("box", { children: [
          (notif.appIcon || notif.desktopEntry) && /* @__PURE__ */ jsx(
            "icon",
            {
              className: "image",
              visible: Boolean(notif.appIcon || notif.desktopEntry),
              icon: notif.appIcon || notif.desktopEntry
            }
          ) || notif.image && fileExists(notif.image) && /* @__PURE__ */ jsx(
            "box",
            {
              valign: START,
              className: "image",
              css: `background-image: url('${notif.image}')`
            }
          ) || notif.image && isIcon(notif.image) && /* @__PURE__ */ jsx(
            "box",
            {
              expand: false,
              valign: START,
              className: "image",
              children: /* @__PURE__ */ jsx("icon", { icon: notif.image, expand: true, halign: CENTER, valign: CENTER })
            }
          ),
          /* @__PURE__ */ jsxs("box", { className: "main", vertical: true, children: [
            /* @__PURE__ */ jsxs("box", { className: "header", children: [
              /* @__PURE__ */ jsx(
                "label",
                {
                  className: "summary",
                  halign: START,
                  xalign: 0,
                  label: notif.summary,
                  truncate: true,
                  hexpand: true
                }
              ),
              /* @__PURE__ */ jsx("button", { onClicked: () => notif.dismiss(), children: /* @__PURE__ */ jsx("icon", { icon: "window-close-symbolic" }) })
            ] }),
            /* @__PURE__ */ jsx("box", { className: "content", children: /* @__PURE__ */ jsx("box", { vertical: true, children: notif.body && /* @__PURE__ */ jsx(
              "label",
              {
                className: "body",
                wrap: true,
                useMarkup: true,
                halign: START,
                xalign: 0,
                justifyFill: true,
                label: notif.body
              }
            ) }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("box", { children: notif.get_actions().length > 0 && /* @__PURE__ */ jsx("box", { className: "actions", children: notif.get_actions().map(({ label, id }) => /* @__PURE__ */ jsx(
          "button",
          {
            hexpand: true,
            onClicked: () => notif.invoke(id),
            children: /* @__PURE__ */ jsx("label", { label, halign: CENTER, hexpand: true })
          }
        )) }) })
      ] })
    }
  );
}
var NotificationMap = class {
  // the underlying map to keep track of id widget pairs
  map = /* @__PURE__ */ new Map();
  // it makes sense to use a Variable under the hood and use its
  // reactivity implementation instead of keeping track of subscribers ourselves
  var = Variable([]);
  // notify subscribers to rerender when state changes
  notifiy() {
    this.var.set([...this.map.values()].reverse());
  }
  constructor() {
    const notifd = Notifd.get_default();
    notifd.connect("notified", (n, id) => {
      this.set(id, Notif(notifd.get_notification(id)));
    });
    notifd.connect("resolved", (_, id) => {
      this.delete(id);
    });
  }
  set(key, value) {
    this.map.get(key)?.destroy();
    this.map.set(key, value);
    this.notifiy();
  }
  delete(key) {
    this.map.get(key)?.destroy();
    this.map.delete(key);
    this.notifiy();
  }
  // needed by the Subscribable interface
  get() {
    return this.var.get();
  }
  // needed by the Subscribable interface
  subscribe(callback) {
    return this.var.subscribe(callback);
  }
};
function Notifications(monitor) {
  const { TOP } = Astal7.WindowAnchor;
  const notifs = new NotificationMap();
  return /* @__PURE__ */ jsx(
    "window",
    {
      gdkmonitor: monitor,
      namespace: "ags-notifd",
      layer: Astal7.Layer.OVERLAY,
      anchor: TOP,
      exclusivity: Astal7.Exclusivity.NORMAL,
      className: "Notifications",
      children: /* @__PURE__ */ jsx("box", { vertical: true, children: bind(notifs) })
    }
  );
}

// widget/Launcher.jsx
import Apps from "gi://AstalApps";
var MAX_ITEMS = 8;
function hide() {
  app_default.get_window("launcher").hide();
}
function AppButton({ app }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      hexpand: true,
      className: "AppButton",
      onClicked: () => {
        hide();
        app.launch();
      },
      children: /* @__PURE__ */ jsxs("box", { children: [
        /* @__PURE__ */ jsx("icon", { icon: app.iconName }),
        /* @__PURE__ */ jsxs("box", { valign: Gtk4.Align.CENTER, vertical: true, children: [
          /* @__PURE__ */ jsx(
            "label",
            {
              className: "name",
              ellipsize: 3,
              xalign: 0,
              label: app.name
            }
          ),
          app.description && /* @__PURE__ */ jsx(
            "label",
            {
              className: "description",
              ellipsize: 3,
              wrap: true,
              xalign: 0,
              label: app.description
            }
          )
        ] })
      ] })
    }
  );
}
function str_fuzzy(str, s) {
  var hay = str.toLowerCase(), i = 0, n = -1, l;
  s = s.toLowerCase();
  for (; l = s[i++]; ) if (!~(n = hay.indexOf(l, n + 1))) return false;
  return true;
}
var res = Variable("...");
var windows = Variable([]);
var plugins = {
  "\\": {
    "init": () => {
    },
    "query": (_text) => [{
      "label": "Reload",
      "sub": "Refresh desktop files on system",
      "icon": "view-refresh-symbolic",
      "activate": () => apps.reload()
    }]
  },
  "/": {
    "init": () => {
    },
    "query": (text) => [{
      "label": text,
      "sub": "run",
      "icon": "utilities-terminal",
      "activate": () => execAsync(["sh", "-c", text])
    }]
  },
  "=": {
    "init": () => {
    },
    "query": (text) => {
      res.set("...");
      if (text.length > 0)
        execAsync(["qalc", "-t", text]).then((out) => res.set(out)).catch((_) => {
          res.set("error");
        });
      return [{
        "label": bind(res),
        "sub": "Calculate using qalc",
        "icon": "accessories-calculator",
        "activate": () => execAsync(["sh", "-c", `echo ${res.get()} | wl-copy`])
      }];
    }
  },
  ";": {
    "init": () => windows.set(JSON.parse(exec(["hyprctl", "-j", "clients"]))),
    "query": (text) => windows.get().map((window) => {
      return {
        "label": window["title"],
        "sub": `${window["xwayland"] ? "[X] " : ""}${window["class"]} [${window["pid"]}] ${window["fullscreen"] ? "(fullscreen) " : window["floating"] ? "(floating) " : ""}on ${window["workspace"]["id"]}`,
        "icon": get_icon(window["initialClass"]),
        "activate": () => execAsync(["hyprctl", "dispatch", "focuswindow", `address:${window["address"]}`])
      };
    }).filter((w) => str_fuzzy(w["label"], text) || str_fuzzy(w["sub"], text))
  }
};
function PluginButton({ item }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      hexpand: true,
      onClicked: () => {
        hide();
        item.activate();
      },
      children: /* @__PURE__ */ jsxs("box", { children: [
        /* @__PURE__ */ jsx("icon", { icon: item.icon }),
        /* @__PURE__ */ jsxs("box", { valign: Gtk4.Align.CENTER, vertical: true, children: [
          /* @__PURE__ */ jsx(
            "label",
            {
              className: "name",
              ellipsize: 3,
              xalign: 0,
              label: item.label
            }
          ),
          item.sub && /* @__PURE__ */ jsx(
            "label",
            {
              className: "description",
              ellipsize: 3,
              xalign: 0,
              label: item.sub
            }
          )
        ] })
      ] })
    }
  );
}
var apps = new Apps.Apps();
function Applauncher() {
  const { CENTER: CENTER2 } = Gtk4.Align;
  const text = Variable("");
  const list = text((text2) => {
    let p = plugins[text2.substring(0, 1)];
    if (p) {
      if (text2.length == 1)
        p.init();
      return p.query(text2.substring(1, text2.length)).slice(0, MAX_ITEMS);
    }
    return apps.fuzzy_query(text2).slice(0, MAX_ITEMS);
  });
  const onEnter = () => {
    list_box.children[0].clicked();
    hide();
  };
  const entry = /* @__PURE__ */ jsx(
    "entry",
    {
      placeholderText: "Search",
      widthRequest: 400,
      text: text(),
      onChanged: (self) => text.set(self.text),
      onActivate: onEnter,
      heightRequest: 50
    }
  );
  const list_box = /* @__PURE__ */ jsx("box", { spacing: 6, vertical: true, className: "listbox", children: list.as((list2) => list2.map((item) => {
    if (item.app)
      return /* @__PURE__ */ jsx(AppButton, { app: item });
    else
      return /* @__PURE__ */ jsx(PluginButton, { item });
  })) });
  return /* @__PURE__ */ jsx(
    "window",
    {
      name: "launcher",
      namespace: "ags-launcher",
      layer: Astal7.Layer.OVERLAY,
      anchor: Astal7.WindowAnchor.TOP | Astal7.WindowAnchor.BOTTOM,
      exclusivity: Astal7.Exclusivity.IGNORE,
      keymode: Astal7.Keymode.ON_DEMAND,
      application: app_default,
      visible: false,
      onShow: () => {
        text.set("");
        entry.grab_focus_without_selecting();
      },
      onKeyPressEvent: function(self, event) {
        if (event.get_keyval()[1] === Gdk.KEY_Escape)
          self.hide();
      },
      children: /* @__PURE__ */ jsxs("box", { children: [
        /* @__PURE__ */ jsx("eventbox", { widthRequest: 2e3, expand: true, onClick: hide }),
        /* @__PURE__ */ jsxs("box", { hexpand: false, vertical: true, children: [
          /* @__PURE__ */ jsx("eventbox", { heightRequest: 200, onClick: hide }),
          /* @__PURE__ */ jsxs("box", { widthRequest: 900, heightRequest: 410, className: "main", children: [
            /* @__PURE__ */ jsxs(
              "box",
              {
                className: "entrybox",
                vertical: true,
                children: [
                  entry,
                  /* @__PURE__ */ jsx("box", {})
                ]
              }
            ),
            list_box,
            /* @__PURE__ */ jsxs(
              "box",
              {
                halign: CENTER2,
                className: "not-found",
                vertical: true,
                visible: list.as((l) => l.length === 0),
                children: [
                  /* @__PURE__ */ jsx("icon", { icon: "system-search-symbolic" }),
                  /* @__PURE__ */ jsx("label", { label: "No match found" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx("eventbox", { expand: true, onClick: hide })
        ] }),
        /* @__PURE__ */ jsx("eventbox", { widthRequest: 2e3, expand: true, onClick: hide })
      ] })
    }
  );
}

// widget/Osd.jsx
import Wp2 from "gi://AstalWp";
function Osd(monitor) {
  const SHOW_TIME = 1500;
  const audio = Wp2.get_default().audio.defaultSpeaker;
  const data = Variable(0);
  const icon = Variable("");
  const show = Variable(true);
  const brightness_max = exec("brightnessctl max");
  let timer;
  monitorFile(`/sys/class/backlight/${exec("sh -c 'ls -w1 /sys/class/backlight|head -1'")}/brightness`, (file, event) => {
    if (event == 1) {
      data.set(parseInt(readFile(file)) / brightness_max);
      icon.set("display-brightness-symbolic");
      timer?.cancel();
      show.set(true);
      timer = timeout(SHOW_TIME, () => show.set(false));
    }
  });
  const sp_ico = bind(audio, "volumeIcon");
  sp_ico.subscribe((i) => {
    icon.set(i);
    data.set(audio.volume);
    timer?.cancel();
    show.set(true);
    timer = timeout(SHOW_TIME, () => show.set(false));
  });
  return /* @__PURE__ */ jsx(
    "window",
    {
      monitor,
      layer: Astal7.Layer.OVERLAY,
      exclusivity: Astal7.Exclusivity.IGNORE,
      anchor: Astal7.WindowAnchor.BOTTOM,
      "margin-bottom": 200,
      className: "Osd",
      namespace: "ags-osd",
      children: /* @__PURE__ */ jsxs("box", { visible: bind(show), children: [
        /* @__PURE__ */ jsx("icon", { icon: bind(icon) }),
        /* @__PURE__ */ jsx("levelbar", { "max-value": "1.08", value: bind(data).as((d) => d + 0.08), widthRequest: 150 }),
        /* @__PURE__ */ jsx("label", { label: bind(data).as((v) => `${Math.round(v * 100)}%`) })
      ] })
    }
  );
}

// app.js
app_default.start({
  css: style_default,
  instanceName: "shell",
  requestHandler(request, res2) {
    if (request == "launcher") {
      app_default.get_window("launcher").show();
      res2("ok");
    } else {
      print("unknown request:", request);
      res2("unknown request");
    }
  },
  main: () => app_default.get_monitors().forEach((m) => {
    Bar(m);
    Notifications(m);
    Applauncher(m);
    Osd(m);
  })
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9ndGszL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hc3RhbGlmeS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL3Byb2Nlc3MudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy92YXJpYWJsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2JpbmRpbmcudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy90aW1lLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hcHAudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9vdmVycmlkZXMudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9fYXBwLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy93aWRnZXQudHMiLCAic2FzczovaG9tZS9tYXJjZWwvZG90ZmlsZXMvYWdzL3N0eWxlLnNjc3MiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9pbmRleC50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2ZpbGUudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9nb2JqZWN0LnRzIiwgIndpZGdldC9CYXIuanN4IiwgIndpZGdldC93b3Jrc3BhY2VzLmpzeCIsICJ1dGlsLmpzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9qc3gtcnVudGltZS50cyIsICJ3aWRnZXQvdHJheS5qc3giLCAid2lkZ2V0L05vdGlmaWNhdGlvbnMuanN4IiwgIndpZGdldC9MYXVuY2hlci5qc3giLCAid2lkZ2V0L09zZC5qc3giLCAiYXBwLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdkayBmcm9tIFwiZ2k6Ly9HZGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IGFzdGFsaWZ5LCB7IHR5cGUgQ29uc3RydWN0UHJvcHMsIHR5cGUgQmluZGFibGVQcm9wcyB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcblxuZXhwb3J0IHsgQXN0YWwsIEd0aywgR2RrIH1cbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXBwIH0gZnJvbSBcIi4vYXBwLmpzXCJcbmV4cG9ydCB7IGFzdGFsaWZ5LCBDb25zdHJ1Y3RQcm9wcywgQmluZGFibGVQcm9wcyB9XG5leHBvcnQgKiBhcyBXaWRnZXQgZnJvbSBcIi4vd2lkZ2V0LmpzXCJcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdkayBmcm9tIFwiZ2k6Ly9HZGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgeyBleGVjQXN5bmMgfSBmcm9tIFwiLi4vcHJvY2Vzcy5qc1wiXG5pbXBvcnQgVmFyaWFibGUgZnJvbSBcIi4uL3ZhcmlhYmxlLmpzXCJcbmltcG9ydCBCaW5kaW5nLCB7IGtlYmFiaWZ5LCBzbmFrZWlmeSwgdHlwZSBDb25uZWN0YWJsZSwgdHlwZSBTdWJzY3JpYmFibGUgfSBmcm9tIFwiLi4vYmluZGluZy5qc1wiXG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUJpbmRpbmdzKGFycmF5OiBhbnlbXSkge1xuICAgIGZ1bmN0aW9uIGdldFZhbHVlcyguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBsZXQgaSA9IDBcbiAgICAgICAgcmV0dXJuIGFycmF5Lm1hcCh2YWx1ZSA9PiB2YWx1ZSBpbnN0YW5jZW9mIEJpbmRpbmdcbiAgICAgICAgICAgID8gYXJnc1tpKytdXG4gICAgICAgICAgICA6IHZhbHVlLFxuICAgICAgICApXG4gICAgfVxuXG4gICAgY29uc3QgYmluZGluZ3MgPSBhcnJheS5maWx0ZXIoaSA9PiBpIGluc3RhbmNlb2YgQmluZGluZylcblxuICAgIGlmIChiaW5kaW5ncy5sZW5ndGggPT09IDApXG4gICAgICAgIHJldHVybiBhcnJheVxuXG4gICAgaWYgKGJpbmRpbmdzLmxlbmd0aCA9PT0gMSlcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdzWzBdLmFzKGdldFZhbHVlcylcblxuICAgIHJldHVybiBWYXJpYWJsZS5kZXJpdmUoYmluZGluZ3MsIGdldFZhbHVlcykoKVxufVxuXG5mdW5jdGlvbiBzZXRQcm9wKG9iajogYW55LCBwcm9wOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICB0cnkge1xuICAgICAgICAvLyB0aGUgc2V0dGVyIG1ldGhvZCBoYXMgdG8gYmUgdXNlZCBiZWNhdXNlXG4gICAgICAgIC8vIGFycmF5IGxpa2UgcHJvcGVydGllcyBhcmUgbm90IGJvdW5kIGNvcnJlY3RseSBhcyBwcm9wc1xuICAgICAgICBjb25zdCBzZXR0ZXIgPSBgc2V0XyR7c25ha2VpZnkocHJvcCl9YFxuICAgICAgICBpZiAodHlwZW9mIG9ialtzZXR0ZXJdID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICByZXR1cm4gb2JqW3NldHRlcl0odmFsdWUpXG5cbiAgICAgICAgcmV0dXJuIChvYmpbcHJvcF0gPSB2YWx1ZSlcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYGNvdWxkIG5vdCBzZXQgcHJvcGVydHkgXCIke3Byb3B9XCIgb24gJHtvYmp9OmAsIGVycm9yKVxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYXN0YWxpZnk8XG4gICAgQyBleHRlbmRzIHsgbmV3KC4uLmFyZ3M6IGFueVtdKTogR3RrLldpZGdldCB9LFxuPihjbHM6IEMsIGNsc05hbWUgPSBjbHMubmFtZSkge1xuICAgIGNsYXNzIFdpZGdldCBleHRlbmRzIGNscyB7XG4gICAgICAgIGdldCBjc3MoKTogc3RyaW5nIHsgcmV0dXJuIEFzdGFsLndpZGdldF9nZXRfY3NzKHRoaXMpIH1cbiAgICAgICAgc2V0IGNzcyhjc3M6IHN0cmluZykgeyBBc3RhbC53aWRnZXRfc2V0X2Nzcyh0aGlzLCBjc3MpIH1cbiAgICAgICAgZ2V0X2NzcygpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5jc3MgfVxuICAgICAgICBzZXRfY3NzKGNzczogc3RyaW5nKSB7IHRoaXMuY3NzID0gY3NzIH1cblxuICAgICAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2NsYXNzX25hbWVzKHRoaXMpLmpvaW4oXCIgXCIpIH1cbiAgICAgICAgc2V0IGNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZykgeyBBc3RhbC53aWRnZXRfc2V0X2NsYXNzX25hbWVzKHRoaXMsIGNsYXNzTmFtZS5zcGxpdCgvXFxzKy8pKSB9XG4gICAgICAgIGdldF9jbGFzc19uYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmNsYXNzTmFtZSB9XG4gICAgICAgIHNldF9jbGFzc19uYW1lKGNsYXNzTmFtZTogc3RyaW5nKSB7IHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lIH1cblxuICAgICAgICBnZXQgY3Vyc29yKCk6IEN1cnNvciB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2N1cnNvcih0aGlzKSBhcyBDdXJzb3IgfVxuICAgICAgICBzZXQgY3Vyc29yKGN1cnNvcjogQ3Vyc29yKSB7IEFzdGFsLndpZGdldF9zZXRfY3Vyc29yKHRoaXMsIGN1cnNvcikgfVxuICAgICAgICBnZXRfY3Vyc29yKCk6IEN1cnNvciB7IHJldHVybiB0aGlzLmN1cnNvciB9XG4gICAgICAgIHNldF9jdXJzb3IoY3Vyc29yOiBDdXJzb3IpIHsgdGhpcy5jdXJzb3IgPSBjdXJzb3IgfVxuXG4gICAgICAgIGdldCBjbGlja1Rocm91Z2goKTogYm9vbGVhbiB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2NsaWNrX3Rocm91Z2godGhpcykgfVxuICAgICAgICBzZXQgY2xpY2tUaHJvdWdoKGNsaWNrVGhyb3VnaDogYm9vbGVhbikgeyBBc3RhbC53aWRnZXRfc2V0X2NsaWNrX3Rocm91Z2godGhpcywgY2xpY2tUaHJvdWdoKSB9XG4gICAgICAgIGdldF9jbGlja190aHJvdWdoKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5jbGlja1Rocm91Z2ggfVxuICAgICAgICBzZXRfY2xpY2tfdGhyb3VnaChjbGlja1Rocm91Z2g6IGJvb2xlYW4pIHsgdGhpcy5jbGlja1Rocm91Z2ggPSBjbGlja1Rocm91Z2ggfVxuXG4gICAgICAgIGRlY2xhcmUgcHJpdmF0ZSBfX25vX2ltcGxpY2l0X2Rlc3Ryb3k6IGJvb2xlYW5cbiAgICAgICAgZ2V0IG5vSW1wbGljaXREZXN0cm95KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fX25vX2ltcGxpY2l0X2Rlc3Ryb3kgfVxuICAgICAgICBzZXQgbm9JbXBsaWNpdERlc3Ryb3kodmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5fX25vX2ltcGxpY2l0X2Rlc3Ryb3kgPSB2YWx1ZSB9XG5cbiAgICAgICAgX3NldENoaWxkcmVuKGNoaWxkcmVuOiBHdGsuV2lkZ2V0W10pIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gY2hpbGRyZW4uZmxhdChJbmZpbml0eSkubWFwKGNoID0+IGNoIGluc3RhbmNlb2YgR3RrLldpZGdldFxuICAgICAgICAgICAgICAgID8gY2hcbiAgICAgICAgICAgICAgICA6IG5ldyBHdGsuTGFiZWwoeyB2aXNpYmxlOiB0cnVlLCBsYWJlbDogU3RyaW5nKGNoKSB9KSlcblxuICAgICAgICAgICAgLy8gcmVtb3ZlXG4gICAgICAgICAgICBpZiAodGhpcyBpbnN0YW5jZW9mIEd0ay5CaW4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaCA9IHRoaXMuZ2V0X2NoaWxkKClcbiAgICAgICAgICAgICAgICBpZiAoY2gpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlKGNoKVxuICAgICAgICAgICAgICAgIGlmIChjaCAmJiAhY2hpbGRyZW4uaW5jbHVkZXMoY2gpICYmICF0aGlzLm5vSW1wbGljaXREZXN0cm95KVxuICAgICAgICAgICAgICAgICAgICBjaD8uZGVzdHJveSgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgR3RrLkNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5nZXRfY2hpbGRyZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZShjaClcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjaGlsZHJlbi5pbmNsdWRlcyhjaCkgJiYgIXRoaXMubm9JbXBsaWNpdERlc3Ryb3kpXG4gICAgICAgICAgICAgICAgICAgICAgICBjaD8uZGVzdHJveSgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUT0RPOiBhZGQgbW9yZSBjb250YWluZXIgdHlwZXNcbiAgICAgICAgICAgIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuQm94KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfY2hpbGRyZW4oY2hpbGRyZW4pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5TdGFjaykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkcmVuKGNoaWxkcmVuKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuQ2VudGVyQm94KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydFdpZGdldCA9IGNoaWxkcmVuWzBdXG4gICAgICAgICAgICAgICAgdGhpcy5jZW50ZXJXaWRnZXQgPSBjaGlsZHJlblsxXVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kV2lkZ2V0ID0gY2hpbGRyZW5bMl1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLk92ZXJsYXkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbY2hpbGQsIC4uLm92ZXJsYXlzXSA9IGNoaWxkcmVuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfY2hpbGQoY2hpbGQpXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfb3ZlcmxheXMob3ZlcmxheXMpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBHdGsuQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaCBvZiBjaGlsZHJlbilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGQoY2gpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKGBjYW4gbm90IGFkZCBjaGlsZHJlbiB0byAke3RoaXMuY29uc3RydWN0b3IubmFtZX0sIGl0IGlzIG5vdCBhIGNvbnRhaW5lciB3aWRnZXRgKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9nZ2xlQ2xhc3NOYW1lKGNuOiBzdHJpbmcsIGNvbmQgPSB0cnVlKSB7XG4gICAgICAgICAgICBBc3RhbC53aWRnZXRfdG9nZ2xlX2NsYXNzX25hbWUodGhpcywgY24sIGNvbmQpXG4gICAgICAgIH1cblxuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBDb25uZWN0YWJsZSxcbiAgICAgICAgICAgIHNpZ25hbDogc3RyaW5nLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKTogdGhpc1xuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBTdWJzY3JpYmFibGUsXG4gICAgICAgICAgICBjYWxsYmFjazogKHNlbGY6IHRoaXMsIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxuICAgICAgICApOiB0aGlzXG4gICAgICAgIGhvb2soXG4gICAgICAgICAgICBvYmplY3Q6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlLFxuICAgICAgICAgICAgc2lnbmFsT3JDYWxsYmFjazogc3RyaW5nIHwgKChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCksXG4gICAgICAgICAgICBjYWxsYmFjaz86IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdC5jb25uZWN0ID09PSBcImZ1bmN0aW9uXCIgJiYgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IG9iamVjdC5jb25uZWN0KHNpZ25hbE9yQ2FsbGJhY2ssIChfOiBhbnksIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh0aGlzLCAuLi5hcmdzKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIChvYmplY3QuZGlzY29ubmVjdCBhcyBDb25uZWN0YWJsZVtcImRpc2Nvbm5lY3RcIl0pKGlkKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiBvYmplY3Quc3Vic2NyaWJlID09PSBcImZ1bmN0aW9uXCIgJiYgdHlwZW9mIHNpZ25hbE9yQ2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVuc3ViID0gb2JqZWN0LnN1YnNjcmliZSgoLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNpZ25hbE9yQ2FsbGJhY2sodGhpcywgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgdW5zdWIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdHJ1Y3RvciguLi5wYXJhbXM6IGFueVtdKSB7XG4gICAgICAgICAgICBzdXBlcigpXG4gICAgICAgICAgICBjb25zdCBbY29uZmlnXSA9IHBhcmFtc1xuXG4gICAgICAgICAgICBjb25zdCB7IHNldHVwLCBjaGlsZCwgY2hpbGRyZW4gPSBbXSwgLi4ucHJvcHMgfSA9IGNvbmZpZ1xuICAgICAgICAgICAgcHJvcHMudmlzaWJsZSA/Pz0gdHJ1ZVxuXG4gICAgICAgICAgICBpZiAoY2hpbGQpXG4gICAgICAgICAgICAgICAgY2hpbGRyZW4udW5zaGlmdChjaGlsZClcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBiaW5kaW5nc1xuICAgICAgICAgICAgY29uc3QgYmluZGluZ3MgPSBPYmplY3Qua2V5cyhwcm9wcykucmVkdWNlKChhY2M6IGFueSwgcHJvcCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wc1twcm9wXSBpbnN0YW5jZW9mIEJpbmRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmluZGluZyA9IHByb3BzW3Byb3BdXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBwcm9wc1twcm9wXVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gWy4uLmFjYywgW3Byb3AsIGJpbmRpbmddXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjXG4gICAgICAgICAgICB9LCBbXSlcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBzaWduYWwgaGFuZGxlcnNcbiAgICAgICAgICAgIGNvbnN0IG9uSGFuZGxlcnMgPSBPYmplY3Qua2V5cyhwcm9wcykucmVkdWNlKChhY2M6IGFueSwga2V5KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKFwib25cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2lnID0ga2ViYWJpZnkoa2V5KS5zcGxpdChcIi1cIikuc2xpY2UoMSkuam9pbihcIi1cIilcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IHByb3BzW2tleV1cbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHByb3BzW2tleV1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsuLi5hY2MsIFtzaWcsIGhhbmRsZXJdXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjXG4gICAgICAgICAgICB9LCBbXSlcblxuICAgICAgICAgICAgLy8gc2V0IGNoaWxkcmVuXG4gICAgICAgICAgICBjb25zdCBtZXJnZWRDaGlsZHJlbiA9IG1lcmdlQmluZGluZ3MoY2hpbGRyZW4uZmxhdChJbmZpbml0eSkpXG4gICAgICAgICAgICBpZiAobWVyZ2VkQ2hpbGRyZW4gaW5zdGFuY2VvZiBCaW5kaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4obWVyZ2VkQ2hpbGRyZW4uZ2V0KCkpXG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBtZXJnZWRDaGlsZHJlbi5zdWJzY3JpYmUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4odilcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChtZXJnZWRDaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKG1lcmdlZENoaWxkcmVuKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgc2lnbmFsIGhhbmRsZXJzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtzaWduYWwsIGNhbGxiYWNrXSBvZiBvbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChzaWduYWwsIGNhbGxiYWNrKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KHNpZ25hbCwgKCkgPT4gZXhlY0FzeW5jKGNhbGxiYWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4ocHJpbnQpLmNhdGNoKGNvbnNvbGUuZXJyb3IpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgYmluZGluZ3MgaGFuZGxlcnNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW3Byb3AsIGJpbmRpbmddIG9mIGJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHByb3AgPT09IFwiY2hpbGRcIiB8fCBwcm9wID09PSBcImNoaWxkcmVuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBiaW5kaW5nLnN1YnNjcmliZSgodjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbih2KVxuICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBiaW5kaW5nLnN1YnNjcmliZSgodjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNldFByb3AodGhpcywgcHJvcCwgdilcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICBzZXRQcm9wKHRoaXMsIHByb3AsIGJpbmRpbmcuZ2V0KCkpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgcHJvcHMpXG4gICAgICAgICAgICBzZXR1cD8uKHRoaXMpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3Moe1xuICAgICAgICBHVHlwZU5hbWU6IGBBc3RhbF8ke2Nsc05hbWV9YCxcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgXCJjbGFzcy1uYW1lXCI6IEdPYmplY3QuUGFyYW1TcGVjLnN0cmluZyhcbiAgICAgICAgICAgICAgICBcImNsYXNzLW5hbWVcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcImNzc1wiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjc3NcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcImN1cnNvclwiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjdXJzb3JcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJkZWZhdWx0XCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjbGljay10aHJvdWdoXCI6IEdPYmplY3QuUGFyYW1TcGVjLmJvb2xlYW4oXG4gICAgICAgICAgICAgICAgXCJjbGljay10aHJvdWdoXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIGZhbHNlLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwibm8taW1wbGljaXQtZGVzdHJveVwiOiBHT2JqZWN0LlBhcmFtU3BlYy5ib29sZWFuKFxuICAgICAgICAgICAgICAgIFwibm8taW1wbGljaXQtZGVzdHJveVwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBmYWxzZSxcbiAgICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgfSwgV2lkZ2V0KVxuXG4gICAgcmV0dXJuIFdpZGdldFxufVxuXG5leHBvcnQgdHlwZSBCaW5kYWJsZVByb3BzPFQ+ID0ge1xuICAgIFtLIGluIGtleW9mIFRdOiBCaW5kaW5nPFRbS10+IHwgVFtLXTtcbn1cblxudHlwZSBTaWdIYW5kbGVyPFxuICAgIFcgZXh0ZW5kcyBJbnN0YW5jZVR5cGU8dHlwZW9mIEd0ay5XaWRnZXQ+LFxuICAgIEFyZ3MgZXh0ZW5kcyBBcnJheTx1bmtub3duPixcbj4gPSAoKHNlbGY6IFcsIC4uLmFyZ3M6IEFyZ3MpID0+IHVua25vd24pIHwgc3RyaW5nIHwgc3RyaW5nW11cblxuZXhwb3J0IHR5cGUgQ29uc3RydWN0UHJvcHM8XG4gICAgU2VsZiBleHRlbmRzIEluc3RhbmNlVHlwZTx0eXBlb2YgR3RrLldpZGdldD4sXG4gICAgUHJvcHMgZXh0ZW5kcyBHdGsuV2lkZ2V0LkNvbnN0cnVjdG9yUHJvcHMsXG4gICAgU2lnbmFscyBleHRlbmRzIFJlY29yZDxgb24ke3N0cmluZ31gLCBBcnJheTx1bmtub3duPj4gPSBSZWNvcmQ8YG9uJHtzdHJpbmd9YCwgYW55W10+LFxuPiA9IFBhcnRpYWw8e1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgY2FuJ3QgYXNzaWduIHRvIHVua25vd24sIGJ1dCBpdCB3b3JrcyBhcyBleHBlY3RlZCB0aG91Z2hcbiAgICBbUyBpbiBrZXlvZiBTaWduYWxzXTogU2lnSGFuZGxlcjxTZWxmLCBTaWduYWxzW1NdPlxufT4gJiBQYXJ0aWFsPHtcbiAgICBbS2V5IGluIGBvbiR7c3RyaW5nfWBdOiBTaWdIYW5kbGVyPFNlbGYsIGFueVtdPlxufT4gJiBCaW5kYWJsZVByb3BzPFBhcnRpYWw8UHJvcHM+ICYge1xuICAgIGNsYXNzTmFtZT86IHN0cmluZ1xuICAgIGNzcz86IHN0cmluZ1xuICAgIGN1cnNvcj86IHN0cmluZ1xuICAgIGNsaWNrVGhyb3VnaD86IGJvb2xlYW5cbn0+ICYge1xuICAgIG9uRGVzdHJveT86IChzZWxmOiBTZWxmKSA9PiB1bmtub3duXG4gICAgb25EcmF3PzogKHNlbGY6IFNlbGYpID0+IHVua25vd25cbiAgICBvbktleVByZXNzRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uS2V5UmVsZWFzZUV2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbkJ1dHRvblByZXNzRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uQnV0dG9uUmVsZWFzZUV2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvblJlYWxpemU/OiAoc2VsZjogU2VsZikgPT4gdW5rbm93blxuICAgIHNldHVwPzogKHNlbGY6IFNlbGYpID0+IHZvaWRcbn1cblxuZXhwb3J0IHR5cGUgQmluZGFibGVDaGlsZCA9IEd0ay5XaWRnZXQgfCBCaW5kaW5nPEd0ay5XaWRnZXQ+XG5cbnR5cGUgQ3Vyc29yID1cbiAgICB8IFwiZGVmYXVsdFwiXG4gICAgfCBcImhlbHBcIlxuICAgIHwgXCJwb2ludGVyXCJcbiAgICB8IFwiY29udGV4dC1tZW51XCJcbiAgICB8IFwicHJvZ3Jlc3NcIlxuICAgIHwgXCJ3YWl0XCJcbiAgICB8IFwiY2VsbFwiXG4gICAgfCBcImNyb3NzaGFpclwiXG4gICAgfCBcInRleHRcIlxuICAgIHwgXCJ2ZXJ0aWNhbC10ZXh0XCJcbiAgICB8IFwiYWxpYXNcIlxuICAgIHwgXCJjb3B5XCJcbiAgICB8IFwibm8tZHJvcFwiXG4gICAgfCBcIm1vdmVcIlxuICAgIHwgXCJub3QtYWxsb3dlZFwiXG4gICAgfCBcImdyYWJcIlxuICAgIHwgXCJncmFiYmluZ1wiXG4gICAgfCBcImFsbC1zY3JvbGxcIlxuICAgIHwgXCJjb2wtcmVzaXplXCJcbiAgICB8IFwicm93LXJlc2l6ZVwiXG4gICAgfCBcIm4tcmVzaXplXCJcbiAgICB8IFwiZS1yZXNpemVcIlxuICAgIHwgXCJzLXJlc2l6ZVwiXG4gICAgfCBcInctcmVzaXplXCJcbiAgICB8IFwibmUtcmVzaXplXCJcbiAgICB8IFwibnctcmVzaXplXCJcbiAgICB8IFwic3ctcmVzaXplXCJcbiAgICB8IFwic2UtcmVzaXplXCJcbiAgICB8IFwiZXctcmVzaXplXCJcbiAgICB8IFwibnMtcmVzaXplXCJcbiAgICB8IFwibmVzdy1yZXNpemVcIlxuICAgIHwgXCJud3NlLXJlc2l6ZVwiXG4gICAgfCBcInpvb20taW5cIlxuICAgIHwgXCJ6b29tLW91dFwiXG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuXG50eXBlIEFyZ3MgPSB7XG4gICAgY21kOiBzdHJpbmcgfCBzdHJpbmdbXVxuICAgIG91dD86IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZFxuICAgIGVycj86IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZFxufVxuXG5leHBvcnQgY29uc3QgeyBQcm9jZXNzIH0gPSBBc3RhbFxuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhhcmdzOiBBcmdzKTogQXN0YWwuUHJvY2Vzc1xuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhcbiAgICBjbWQ6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIG9uT3V0PzogKHN0ZG91dDogc3RyaW5nKSA9PiB2b2lkLFxuICAgIG9uRXJyPzogKHN0ZGVycjogc3RyaW5nKSA9PiB2b2lkLFxuKTogQXN0YWwuUHJvY2Vzc1xuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhcbiAgICBhcmdzT3JDbWQ6IEFyZ3MgfCBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICBvbk91dDogKHN0ZG91dDogc3RyaW5nKSA9PiB2b2lkID0gcHJpbnQsXG4gICAgb25FcnI6IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZCA9IHByaW50ZXJyLFxuKSB7XG4gICAgY29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkoYXJnc09yQ21kKSB8fCB0eXBlb2YgYXJnc09yQ21kID09PSBcInN0cmluZ1wiXG4gICAgY29uc3QgeyBjbWQsIGVyciwgb3V0IH0gPSB7XG4gICAgICAgIGNtZDogYXJncyA/IGFyZ3NPckNtZCA6IGFyZ3NPckNtZC5jbWQsXG4gICAgICAgIGVycjogYXJncyA/IG9uRXJyIDogYXJnc09yQ21kLmVyciB8fCBvbkVycixcbiAgICAgICAgb3V0OiBhcmdzID8gb25PdXQgOiBhcmdzT3JDbWQub3V0IHx8IG9uT3V0LFxuICAgIH1cblxuICAgIGNvbnN0IHByb2MgPSBBcnJheS5pc0FycmF5KGNtZClcbiAgICAgICAgPyBBc3RhbC5Qcm9jZXNzLnN1YnByb2Nlc3N2KGNtZClcbiAgICAgICAgOiBBc3RhbC5Qcm9jZXNzLnN1YnByb2Nlc3MoY21kKVxuXG4gICAgcHJvYy5jb25uZWN0KFwic3Rkb3V0XCIsIChfLCBzdGRvdXQ6IHN0cmluZykgPT4gb3V0KHN0ZG91dCkpXG4gICAgcHJvYy5jb25uZWN0KFwic3RkZXJyXCIsIChfLCBzdGRlcnI6IHN0cmluZykgPT4gZXJyKHN0ZGVycikpXG4gICAgcmV0dXJuIHByb2Ncbn1cblxuLyoqIEB0aHJvd3Mge0dMaWIuRXJyb3J9IFRocm93cyBzdGRlcnIgKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjKGNtZDogc3RyaW5nIHwgc3RyaW5nW10pIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShjbWQpXG4gICAgICAgID8gQXN0YWwuUHJvY2Vzcy5leGVjdihjbWQpXG4gICAgICAgIDogQXN0YWwuUHJvY2Vzcy5leGVjKGNtZClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWNBc3luYyhjbWQ6IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbWQpKSB7XG4gICAgICAgICAgICBBc3RhbC5Qcm9jZXNzLmV4ZWNfYXN5bmN2KGNtZCwgKF8sIHJlcykgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jdl9maW5pc2gocmVzKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jKGNtZCwgKF8sIHJlcykgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwuUHJvY2Vzcy5leGVjX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxufVxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBCaW5kaW5nLCB7IHR5cGUgQ29ubmVjdGFibGUsIHR5cGUgU3Vic2NyaWJhYmxlIH0gZnJvbSBcIi4vYmluZGluZy5qc1wiXG5pbXBvcnQgeyBpbnRlcnZhbCB9IGZyb20gXCIuL3RpbWUuanNcIlxuaW1wb3J0IHsgZXhlY0FzeW5jLCBzdWJwcm9jZXNzIH0gZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5cbmNsYXNzIFZhcmlhYmxlV3JhcHBlcjxUPiBleHRlbmRzIEZ1bmN0aW9uIHtcbiAgICBwcml2YXRlIHZhcmlhYmxlITogQXN0YWwuVmFyaWFibGVCYXNlXG4gICAgcHJpdmF0ZSBlcnJIYW5kbGVyPyA9IGNvbnNvbGUuZXJyb3JcblxuICAgIHByaXZhdGUgX3ZhbHVlOiBUXG4gICAgcHJpdmF0ZSBfcG9sbD86IEFzdGFsLlRpbWVcbiAgICBwcml2YXRlIF93YXRjaD86IEFzdGFsLlByb2Nlc3NcblxuICAgIHByaXZhdGUgcG9sbEludGVydmFsID0gMTAwMFxuICAgIHByaXZhdGUgcG9sbEV4ZWM/OiBzdHJpbmdbXSB8IHN0cmluZ1xuICAgIHByaXZhdGUgcG9sbFRyYW5zZm9ybT86IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVFxuICAgIHByaXZhdGUgcG9sbEZuPzogKHByZXY6IFQpID0+IFQgfCBQcm9taXNlPFQ+XG5cbiAgICBwcml2YXRlIHdhdGNoVHJhbnNmb3JtPzogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUXG4gICAgcHJpdmF0ZSB3YXRjaEV4ZWM/OiBzdHJpbmdbXSB8IHN0cmluZ1xuXG4gICAgY29uc3RydWN0b3IoaW5pdDogVCkge1xuICAgICAgICBzdXBlcigpXG4gICAgICAgIHRoaXMuX3ZhbHVlID0gaW5pdFxuICAgICAgICB0aGlzLnZhcmlhYmxlID0gbmV3IEFzdGFsLlZhcmlhYmxlQmFzZSgpXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImRyb3BwZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zdG9wV2F0Y2goKVxuICAgICAgICAgICAgdGhpcy5zdG9wUG9sbCgpXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImVycm9yXCIsIChfLCBlcnIpID0+IHRoaXMuZXJySGFuZGxlcj8uKGVycikpXG4gICAgICAgIHJldHVybiBuZXcgUHJveHkodGhpcywge1xuICAgICAgICAgICAgYXBwbHk6ICh0YXJnZXQsIF8sIGFyZ3MpID0+IHRhcmdldC5fY2FsbChhcmdzWzBdKSxcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBwcml2YXRlIF9jYWxsPFIgPSBUPih0cmFuc2Zvcm0/OiAodmFsdWU6IFQpID0+IFIpOiBCaW5kaW5nPFI+IHtcbiAgICAgICAgY29uc3QgYiA9IEJpbmRpbmcuYmluZCh0aGlzKVxuICAgICAgICByZXR1cm4gdHJhbnNmb3JtID8gYi5hcyh0cmFuc2Zvcm0pIDogYiBhcyB1bmtub3duIGFzIEJpbmRpbmc8Uj5cbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhgVmFyaWFibGU8JHt0aGlzLmdldCgpfT5gKVxuICAgIH1cblxuICAgIGdldCgpOiBUIHsgcmV0dXJuIHRoaXMuX3ZhbHVlIH1cbiAgICBzZXQodmFsdWU6IFQpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl92YWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fdmFsdWUgPSB2YWx1ZVxuICAgICAgICAgICAgdGhpcy52YXJpYWJsZS5lbWl0KFwiY2hhbmdlZFwiKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRQb2xsKCkge1xuICAgICAgICBpZiAodGhpcy5fcG9sbClcbiAgICAgICAgICAgIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLnBvbGxGbikge1xuICAgICAgICAgICAgdGhpcy5fcG9sbCA9IGludGVydmFsKHRoaXMucG9sbEludGVydmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHRoaXMucG9sbEZuISh0aGlzLmdldCgpKVxuICAgICAgICAgICAgICAgIGlmICh2IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICB2LnRoZW4odiA9PiB0aGlzLnNldCh2KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy52YXJpYWJsZS5lbWl0KFwiZXJyb3JcIiwgZXJyKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0KHYpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLnBvbGxFeGVjKSB7XG4gICAgICAgICAgICB0aGlzLl9wb2xsID0gaW50ZXJ2YWwodGhpcy5wb2xsSW50ZXJ2YWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBleGVjQXN5bmModGhpcy5wb2xsRXhlYyEpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKHYgPT4gdGhpcy5zZXQodGhpcy5wb2xsVHJhbnNmb3JtISh2LCB0aGlzLmdldCgpKSkpXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy52YXJpYWJsZS5lbWl0KFwiZXJyb3JcIiwgZXJyKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFdhdGNoKCkge1xuICAgICAgICBpZiAodGhpcy5fd2F0Y2gpXG4gICAgICAgICAgICByZXR1cm5cblxuICAgICAgICB0aGlzLl93YXRjaCA9IHN1YnByb2Nlc3Moe1xuICAgICAgICAgICAgY21kOiB0aGlzLndhdGNoRXhlYyEsXG4gICAgICAgICAgICBvdXQ6IG91dCA9PiB0aGlzLnNldCh0aGlzLndhdGNoVHJhbnNmb3JtIShvdXQsIHRoaXMuZ2V0KCkpKSxcbiAgICAgICAgICAgIGVycjogZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVyciksXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgc3RvcFBvbGwoKSB7XG4gICAgICAgIHRoaXMuX3BvbGw/LmNhbmNlbCgpXG4gICAgICAgIGRlbGV0ZSB0aGlzLl9wb2xsXG4gICAgfVxuXG4gICAgc3RvcFdhdGNoKCkge1xuICAgICAgICB0aGlzLl93YXRjaD8ua2lsbCgpXG4gICAgICAgIGRlbGV0ZSB0aGlzLl93YXRjaFxuICAgIH1cblxuICAgIGlzUG9sbGluZygpIHsgcmV0dXJuICEhdGhpcy5fcG9sbCB9XG4gICAgaXNXYXRjaGluZygpIHsgcmV0dXJuICEhdGhpcy5fd2F0Y2ggfVxuXG4gICAgZHJvcCgpIHtcbiAgICAgICAgdGhpcy52YXJpYWJsZS5lbWl0KFwiZHJvcHBlZFwiKVxuICAgIH1cblxuICAgIG9uRHJvcHBlZChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJkcm9wcGVkXCIsIGNhbGxiYWNrKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgb25FcnJvcihjYWxsYmFjazogKGVycjogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmVyckhhbmRsZXJcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZXJyb3JcIiwgKF8sIGVycikgPT4gY2FsbGJhY2soZXJyKSlcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBUKSA9PiB2b2lkKSB7XG4gICAgICAgIGNvbnN0IGlkID0gdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiY2hhbmdlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICBjYWxsYmFjayh0aGlzLmdldCgpKVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gKCkgPT4gdGhpcy52YXJpYWJsZS5kaXNjb25uZWN0KGlkKVxuICAgIH1cblxuICAgIHBvbGwoXG4gICAgICAgIGludGVydmFsOiBudW1iZXIsXG4gICAgICAgIGV4ZWM6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgICAgICB0cmFuc2Zvcm0/OiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFRcbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgcG9sbChcbiAgICAgICAgaW50ZXJ2YWw6IG51bWJlcixcbiAgICAgICAgY2FsbGJhY2s6IChwcmV2OiBUKSA9PiBUIHwgUHJvbWlzZTxUPlxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBwb2xsKFxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyLFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSB8ICgocHJldjogVCkgPT4gVCB8IFByb21pc2U8VD4pLFxuICAgICAgICB0cmFuc2Zvcm06IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVCA9IG91dCA9PiBvdXQgYXMgVCxcbiAgICApIHtcbiAgICAgICAgdGhpcy5zdG9wUG9sbCgpXG4gICAgICAgIHRoaXMucG9sbEludGVydmFsID0gaW50ZXJ2YWxcbiAgICAgICAgdGhpcy5wb2xsVHJhbnNmb3JtID0gdHJhbnNmb3JtXG4gICAgICAgIGlmICh0eXBlb2YgZXhlYyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvbGxGbiA9IGV4ZWNcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnBvbGxFeGVjXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvbGxFeGVjID0gZXhlY1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMucG9sbEZuXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdGFydFBvbGwoKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgd2F0Y2goXG4gICAgICAgIGV4ZWM6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgICAgICB0cmFuc2Zvcm06IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVCA9IG91dCA9PiBvdXQgYXMgVCxcbiAgICApIHtcbiAgICAgICAgdGhpcy5zdG9wV2F0Y2goKVxuICAgICAgICB0aGlzLndhdGNoRXhlYyA9IGV4ZWNcbiAgICAgICAgdGhpcy53YXRjaFRyYW5zZm9ybSA9IHRyYW5zZm9ybVxuICAgICAgICB0aGlzLnN0YXJ0V2F0Y2goKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgb2JzZXJ2ZShcbiAgICAgICAgb2JqczogQXJyYXk8W29iajogQ29ubmVjdGFibGUsIHNpZ25hbDogc3RyaW5nXT4sXG4gICAgICAgIGNhbGxiYWNrOiAoLi4uYXJnczogYW55W10pID0+IFQsXG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIG9ic2VydmUoXG4gICAgICAgIG9iajogQ29ubmVjdGFibGUsXG4gICAgICAgIHNpZ25hbDogc3RyaW5nLFxuICAgICAgICBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBvYnNlcnZlKFxuICAgICAgICBvYmpzOiBDb25uZWN0YWJsZSB8IEFycmF5PFtvYmo6IENvbm5lY3RhYmxlLCBzaWduYWw6IHN0cmluZ10+LFxuICAgICAgICBzaWdPckZuOiBzdHJpbmcgfCAoKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiBUKSxcbiAgICAgICAgY2FsbGJhY2s/OiAob2JqOiBDb25uZWN0YWJsZSwgLi4uYXJnczogYW55W10pID0+IFQsXG4gICAgKSB7XG4gICAgICAgIGNvbnN0IGYgPSB0eXBlb2Ygc2lnT3JGbiA9PT0gXCJmdW5jdGlvblwiID8gc2lnT3JGbiA6IGNhbGxiYWNrID8/ICgoKSA9PiB0aGlzLmdldCgpKVxuICAgICAgICBjb25zdCBzZXQgPSAob2JqOiBDb25uZWN0YWJsZSwgLi4uYXJnczogYW55W10pID0+IHRoaXMuc2V0KGYob2JqLCAuLi5hcmdzKSlcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvYmpzKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBvYmogb2Ygb2Jqcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtvLCBzXSA9IG9ialxuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gby5jb25uZWN0KHMsIHNldClcbiAgICAgICAgICAgICAgICB0aGlzLm9uRHJvcHBlZCgoKSA9PiBvLmRpc2Nvbm5lY3QoaWQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzaWdPckZuID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBvYmpzLmNvbm5lY3Qoc2lnT3JGbiwgc2V0KVxuICAgICAgICAgICAgICAgIHRoaXMub25Ecm9wcGVkKCgpID0+IG9ianMuZGlzY29ubmVjdChpZCkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgc3RhdGljIGRlcml2ZTxcbiAgICAgICAgY29uc3QgRGVwcyBleHRlbmRzIEFycmF5PFN1YnNjcmliYWJsZTxhbnk+PixcbiAgICAgICAgQXJncyBleHRlbmRzIHtcbiAgICAgICAgICAgIFtLIGluIGtleW9mIERlcHNdOiBEZXBzW0tdIGV4dGVuZHMgU3Vic2NyaWJhYmxlPGluZmVyIFQ+ID8gVCA6IG5ldmVyXG4gICAgICAgIH0sXG4gICAgICAgIFYgPSBBcmdzLFxuICAgID4oZGVwczogRGVwcywgZm46ICguLi5hcmdzOiBBcmdzKSA9PiBWID0gKC4uLmFyZ3MpID0+IGFyZ3MgYXMgdW5rbm93biBhcyBWKSB7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9ICgpID0+IGZuKC4uLmRlcHMubWFwKGQgPT4gZC5nZXQoKSkgYXMgQXJncylcbiAgICAgICAgY29uc3QgZGVyaXZlZCA9IG5ldyBWYXJpYWJsZSh1cGRhdGUoKSlcbiAgICAgICAgY29uc3QgdW5zdWJzID0gZGVwcy5tYXAoZGVwID0+IGRlcC5zdWJzY3JpYmUoKCkgPT4gZGVyaXZlZC5zZXQodXBkYXRlKCkpKSlcbiAgICAgICAgZGVyaXZlZC5vbkRyb3BwZWQoKCkgPT4gdW5zdWJzLm1hcCh1bnN1YiA9PiB1bnN1YigpKSlcbiAgICAgICAgcmV0dXJuIGRlcml2ZWRcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFyaWFibGU8VD4gZXh0ZW5kcyBPbWl0PFZhcmlhYmxlV3JhcHBlcjxUPiwgXCJiaW5kXCI+IHtcbiAgICA8Uj4odHJhbnNmb3JtOiAodmFsdWU6IFQpID0+IFIpOiBCaW5kaW5nPFI+XG4gICAgKCk6IEJpbmRpbmc8VD5cbn1cblxuZXhwb3J0IGNvbnN0IFZhcmlhYmxlID0gbmV3IFByb3h5KFZhcmlhYmxlV3JhcHBlciBhcyBhbnksIHtcbiAgICBhcHBseTogKF90LCBfYSwgYXJncykgPT4gbmV3IFZhcmlhYmxlV3JhcHBlcihhcmdzWzBdKSxcbn0pIGFzIHtcbiAgICBkZXJpdmU6IHR5cGVvZiBWYXJpYWJsZVdyYXBwZXJbXCJkZXJpdmVcIl1cbiAgICA8VD4oaW5pdDogVCk6IFZhcmlhYmxlPFQ+XG4gICAgbmV3PFQ+KGluaXQ6IFQpOiBWYXJpYWJsZTxUPlxufVxuXG5leHBvcnQgZGVmYXVsdCBWYXJpYWJsZVxuIiwgImV4cG9ydCBjb25zdCBzbmFrZWlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDFfJDJcIilcbiAgICAucmVwbGFjZUFsbChcIi1cIiwgXCJfXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxuZXhwb3J0IGNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnNjcmliYWJsZTxUID0gdW5rbm93bj4ge1xuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBUKSA9PiB2b2lkKTogKCkgPT4gdm9pZFxuICAgIGdldCgpOiBUXG4gICAgW2tleTogc3RyaW5nXTogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubmVjdGFibGUge1xuICAgIGNvbm5lY3Qoc2lnbmFsOiBzdHJpbmcsIGNhbGxiYWNrOiAoLi4uYXJnczogYW55W10pID0+IHVua25vd24pOiBudW1iZXJcbiAgICBkaXNjb25uZWN0KGlkOiBudW1iZXIpOiB2b2lkXG4gICAgW2tleTogc3RyaW5nXTogYW55XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJpbmRpbmc8VmFsdWU+IHtcbiAgICBwcml2YXRlIHRyYW5zZm9ybUZuID0gKHY6IGFueSkgPT4gdlxuXG4gICAgI2VtaXR0ZXI6IFN1YnNjcmliYWJsZTxWYWx1ZT4gfCBDb25uZWN0YWJsZVxuICAgICNwcm9wPzogc3RyaW5nXG5cbiAgICBzdGF0aWMgYmluZDxcbiAgICAgICAgVCBleHRlbmRzIENvbm5lY3RhYmxlLFxuICAgICAgICBQIGV4dGVuZHMga2V5b2YgVCxcbiAgICA+KG9iamVjdDogVCwgcHJvcGVydHk6IFApOiBCaW5kaW5nPFRbUF0+XG5cbiAgICBzdGF0aWMgYmluZDxUPihvYmplY3Q6IFN1YnNjcmliYWJsZTxUPik6IEJpbmRpbmc8VD5cblxuICAgIHN0YXRpYyBiaW5kKGVtaXR0ZXI6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlLCBwcm9wPzogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQmluZGluZyhlbWl0dGVyLCBwcm9wKVxuICAgIH1cblxuICAgIHByaXZhdGUgY29uc3RydWN0b3IoZW1pdHRlcjogQ29ubmVjdGFibGUgfCBTdWJzY3JpYmFibGU8VmFsdWU+LCBwcm9wPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuI2VtaXR0ZXIgPSBlbWl0dGVyXG4gICAgICAgIHRoaXMuI3Byb3AgPSBwcm9wICYmIGtlYmFiaWZ5KHByb3ApXG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBgQmluZGluZzwke3RoaXMuI2VtaXR0ZXJ9JHt0aGlzLiNwcm9wID8gYCwgXCIke3RoaXMuI3Byb3B9XCJgIDogXCJcIn0+YFxuICAgIH1cblxuICAgIGFzPFQ+KGZuOiAodjogVmFsdWUpID0+IFQpOiBCaW5kaW5nPFQ+IHtcbiAgICAgICAgY29uc3QgYmluZCA9IG5ldyBCaW5kaW5nKHRoaXMuI2VtaXR0ZXIsIHRoaXMuI3Byb3ApXG4gICAgICAgIGJpbmQudHJhbnNmb3JtRm4gPSAodjogVmFsdWUpID0+IGZuKHRoaXMudHJhbnNmb3JtRm4odikpXG4gICAgICAgIHJldHVybiBiaW5kIGFzIHVua25vd24gYXMgQmluZGluZzxUPlxuICAgIH1cblxuICAgIGdldCgpOiBWYWx1ZSB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlci5nZXQgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybUZuKHRoaXMuI2VtaXR0ZXIuZ2V0KCkpXG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNwcm9wID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBnZXR0ZXIgPSBgZ2V0XyR7c25ha2VpZnkodGhpcy4jcHJvcCl9YFxuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyW2dldHRlcl0gPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Gbih0aGlzLiNlbWl0dGVyW2dldHRlcl0oKSlcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtRm4odGhpcy4jZW1pdHRlclt0aGlzLiNwcm9wXSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IEVycm9yKFwiY2FuIG5vdCBnZXQgdmFsdWUgb2YgYmluZGluZ1wiKVxuICAgIH1cblxuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBWYWx1ZSkgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuc3Vic2NyaWJlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiNlbWl0dGVyLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuY29ubmVjdCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBjb25zdCBzaWduYWwgPSBgbm90aWZ5Ojoke3RoaXMuI3Byb3B9YFxuICAgICAgICAgICAgY29uc3QgaWQgPSB0aGlzLiNlbWl0dGVyLmNvbm5lY3Qoc2lnbmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICAgICAgICAgICh0aGlzLiNlbWl0dGVyLmRpc2Nvbm5lY3QgYXMgQ29ubmVjdGFibGVbXCJkaXNjb25uZWN0XCJdKShpZClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBFcnJvcihgJHt0aGlzLiNlbWl0dGVyfSBpcyBub3QgYmluZGFibGVgKVxuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IHsgYmluZCB9ID0gQmluZGluZ1xuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcblxuZXhwb3J0IGNvbnN0IHsgVGltZSB9ID0gQXN0YWxcblxuZXhwb3J0IGZ1bmN0aW9uIGludGVydmFsKGludGVydmFsOiBudW1iZXIsIGNhbGxiYWNrPzogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBBc3RhbC5UaW1lLmludGVydmFsKGludGVydmFsLCAoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRpbWVvdXQodGltZW91dDogbnVtYmVyLCBjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS50aW1lb3V0KHRpbWVvdXQsICgpID0+IHZvaWQgY2FsbGJhY2s/LigpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaWRsZShjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS5pZGxlKCgpID0+IHZvaWQgY2FsbGJhY2s/LigpKVxufVxuIiwgImltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgeyBta0FwcCB9IGZyb20gXCIuLi9fYXBwXCJcblxuR3RrLmluaXQobnVsbClcblxuZXhwb3J0IGRlZmF1bHQgbWtBcHAoQXN0YWwuQXBwbGljYXRpb24pXG4iLCAiLyoqXG4gKiBXb3JrYXJvdW5kIGZvciBcIkNhbid0IGNvbnZlcnQgbm9uLW51bGwgcG9pbnRlciB0byBKUyB2YWx1ZSBcIlxuICovXG5cbmV4cG9ydCB7IH1cblxuY29uc3Qgc25ha2VpZnkgPSAoc3RyOiBzdHJpbmcpID0+IHN0clxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCBcIiQxXyQyXCIpXG4gICAgLnJlcGxhY2VBbGwoXCItXCIsIFwiX1wiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG5cbmFzeW5jIGZ1bmN0aW9uIHN1cHByZXNzPFQ+KG1vZDogUHJvbWlzZTx7IGRlZmF1bHQ6IFQgfT4sIHBhdGNoOiAobTogVCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBtb2QudGhlbihtID0+IHBhdGNoKG0uZGVmYXVsdCkpLmNhdGNoKCgpID0+IHZvaWQgMClcbn1cblxuZnVuY3Rpb24gcGF0Y2g8UCBleHRlbmRzIG9iamVjdD4ocHJvdG86IFAsIHByb3A6IEV4dHJhY3Q8a2V5b2YgUCwgc3RyaW5nPikge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywgcHJvcCwge1xuICAgICAgICBnZXQoKSB7IHJldHVybiB0aGlzW2BnZXRfJHtzbmFrZWlmeShwcm9wKX1gXSgpIH0sXG4gICAgfSlcbn1cblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEFwcHNcIiksICh7IEFwcHMsIEFwcGxpY2F0aW9uIH0pID0+IHtcbiAgICBwYXRjaChBcHBzLnByb3RvdHlwZSwgXCJsaXN0XCIpXG4gICAgcGF0Y2goQXBwbGljYXRpb24ucHJvdG90eXBlLCBcImtleXdvcmRzXCIpXG4gICAgcGF0Y2goQXBwbGljYXRpb24ucHJvdG90eXBlLCBcImNhdGVnb3JpZXNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxCYXR0ZXJ5XCIpLCAoeyBVUG93ZXIgfSkgPT4ge1xuICAgIHBhdGNoKFVQb3dlci5wcm90b3R5cGUsIFwiZGV2aWNlc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEJsdWV0b290aFwiKSwgKHsgQWRhcHRlciwgQmx1ZXRvb3RoLCBEZXZpY2UgfSkgPT4ge1xuICAgIHBhdGNoKEFkYXB0ZXIucHJvdG90eXBlLCBcInV1aWRzXCIpXG4gICAgcGF0Y2goQmx1ZXRvb3RoLnByb3RvdHlwZSwgXCJhZGFwdGVyc1wiKVxuICAgIHBhdGNoKEJsdWV0b290aC5wcm90b3R5cGUsIFwiZGV2aWNlc1wiKVxuICAgIHBhdGNoKERldmljZS5wcm90b3R5cGUsIFwidXVpZHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxIeXBybGFuZFwiKSwgKHsgSHlwcmxhbmQsIE1vbml0b3IsIFdvcmtzcGFjZSB9KSA9PiB7XG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcIm1vbml0b3JzXCIpXG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcIndvcmtzcGFjZXNcIilcbiAgICBwYXRjaChIeXBybGFuZC5wcm90b3R5cGUsIFwiY2xpZW50c1wiKVxuICAgIHBhdGNoKE1vbml0b3IucHJvdG90eXBlLCBcImF2YWlsYWJsZU1vZGVzXCIpXG4gICAgcGF0Y2goTW9uaXRvci5wcm90b3R5cGUsIFwiYXZhaWxhYmxlX21vZGVzXCIpXG4gICAgcGF0Y2goV29ya3NwYWNlLnByb3RvdHlwZSwgXCJjbGllbnRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsTXByaXNcIiksICh7IE1wcmlzLCBQbGF5ZXIgfSkgPT4ge1xuICAgIHBhdGNoKE1wcmlzLnByb3RvdHlwZSwgXCJwbGF5ZXJzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRfdXJpX3NjaGVtYXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZFVyaVNjaGVtYXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZF9taW1lX3R5cGVzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRNaW1lVHlwZXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcImNvbW1lbnRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsTmV0d29ya1wiKSwgKHsgV2lmaSB9KSA9PiB7XG4gICAgcGF0Y2goV2lmaS5wcm90b3R5cGUsIFwiYWNjZXNzX3BvaW50c1wiKVxuICAgIHBhdGNoKFdpZmkucHJvdG90eXBlLCBcImFjY2Vzc1BvaW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE5vdGlmZFwiKSwgKHsgTm90aWZkLCBOb3RpZmljYXRpb24gfSkgPT4ge1xuICAgIHBhdGNoKE5vdGlmZC5wcm90b3R5cGUsIFwibm90aWZpY2F0aW9uc1wiKVxuICAgIHBhdGNoKE5vdGlmaWNhdGlvbi5wcm90b3R5cGUsIFwiYWN0aW9uc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbFBvd2VyUHJvZmlsZXNcIiksICh7IFBvd2VyUHJvZmlsZXMgfSkgPT4ge1xuICAgIHBhdGNoKFBvd2VyUHJvZmlsZXMucHJvdG90eXBlLCBcImFjdGlvbnNcIilcbn0pXG4iLCAiaW1wb3J0IFwiLi9vdmVycmlkZXMuanNcIlxuaW1wb3J0IHsgc2V0Q29uc29sZUxvZ0RvbWFpbiB9IGZyb20gXCJjb25zb2xlXCJcbmltcG9ydCB7IGV4aXQsIHByb2dyYW1BcmdzIH0gZnJvbSBcInN5c3RlbVwiXG5pbXBvcnQgSU8gZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5pbXBvcnQgR09iamVjdCBmcm9tIFwiZ2k6Ly9HT2JqZWN0XCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcbmltcG9ydCB0eXBlIEFzdGFsMyBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgdHlwZSBBc3RhbDQgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj00LjBcIlxuXG50eXBlIENvbmZpZyA9IFBhcnRpYWw8e1xuICAgIGluc3RhbmNlTmFtZTogc3RyaW5nXG4gICAgY3NzOiBzdHJpbmdcbiAgICBpY29uczogc3RyaW5nXG4gICAgZ3RrVGhlbWU6IHN0cmluZ1xuICAgIGljb25UaGVtZTogc3RyaW5nXG4gICAgY3Vyc29yVGhlbWU6IHN0cmluZ1xuICAgIGhvbGQ6IGJvb2xlYW5cbiAgICByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0OiBzdHJpbmcsIHJlczogKHJlc3BvbnNlOiBhbnkpID0+IHZvaWQpOiB2b2lkXG4gICAgbWFpbiguLi5hcmdzOiBzdHJpbmdbXSk6IHZvaWRcbiAgICBjbGllbnQobWVzc2FnZTogKG1zZzogc3RyaW5nKSA9PiBzdHJpbmcsIC4uLmFyZ3M6IHN0cmluZ1tdKTogdm9pZFxufT5cblxuaW50ZXJmYWNlIEFzdGFsM0pTIGV4dGVuZHMgQXN0YWwzLkFwcGxpY2F0aW9uIHtcbiAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PlxuICAgIHJlcXVlc3RIYW5kbGVyOiBDb25maWdbXCJyZXF1ZXN0SGFuZGxlclwiXVxuICAgIGFwcGx5X2NzcyhzdHlsZTogc3RyaW5nLCByZXNldD86IGJvb2xlYW4pOiB2b2lkXG4gICAgcXVpdChjb2RlPzogbnVtYmVyKTogdm9pZFxuICAgIHN0YXJ0KGNvbmZpZz86IENvbmZpZyk6IHZvaWRcbn1cblxuaW50ZXJmYWNlIEFzdGFsNEpTIGV4dGVuZHMgQXN0YWw0LkFwcGxpY2F0aW9uIHtcbiAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PlxuICAgIHJlcXVlc3RIYW5kbGVyPzogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cbiAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQ/OiBib29sZWFuKTogdm9pZFxuICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWRcbiAgICBzdGFydChjb25maWc/OiBDb25maWcpOiB2b2lkXG59XG5cbnR5cGUgQXBwMyA9IHR5cGVvZiBBc3RhbDMuQXBwbGljYXRpb25cbnR5cGUgQXBwNCA9IHR5cGVvZiBBc3RhbDQuQXBwbGljYXRpb25cblxuZXhwb3J0IGZ1bmN0aW9uIG1rQXBwPEFwcCBleHRlbmRzIEFwcDM+KEFwcDogQXBwKTogQXN0YWwzSlNcbmV4cG9ydCBmdW5jdGlvbiBta0FwcDxBcHAgZXh0ZW5kcyBBcHA0PihBcHA6IEFwcCk6IEFzdGFsNEpTXG5cbmV4cG9ydCBmdW5jdGlvbiBta0FwcChBcHA6IEFwcDMgfCBBcHA0KSB7XG4gICAgcmV0dXJuIG5ldyAoY2xhc3MgQXN0YWxKUyBleHRlbmRzIEFwcCB7XG4gICAgICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJBc3RhbEpTXCIgfSwgdGhpcyBhcyBhbnkpIH1cblxuICAgICAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm4gPSBGdW5jdGlvbihgcmV0dXJuIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICR7Ym9keS5pbmNsdWRlcyhcIjtcIikgPyBib2R5IDogYHJldHVybiAke2JvZHl9O2B9XG4gICAgICAgICAgICAgICAgICAgIH0pYClcbiAgICAgICAgICAgICAgICAgICAgZm4oKSgpLnRoZW4ocmVzKS5jYXRjaChyZWopXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZWooZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIHJlcXVlc3RIYW5kbGVyPzogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cblxuICAgICAgICB2ZnVuY19yZXF1ZXN0KG1zZzogc3RyaW5nLCBjb25uOiBHaW8uU29ja2V0Q29ubmVjdGlvbik6IHZvaWQge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnJlcXVlc3RIYW5kbGVyID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlcXVlc3RIYW5kbGVyKG1zZywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIElPLndyaXRlX3NvY2soY29ubiwgU3RyaW5nKHJlc3BvbnNlKSwgKF8sIHJlcykgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIElPLndyaXRlX3NvY2tfZmluaXNoKHJlcyksXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc3VwZXIudmZ1bmNfcmVxdWVzdChtc2csIGNvbm4pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQgPSBmYWxzZSkge1xuICAgICAgICAgICAgc3VwZXIuYXBwbHlfY3NzKHN0eWxlLCByZXNldClcbiAgICAgICAgfVxuXG4gICAgICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWQge1xuICAgICAgICAgICAgc3VwZXIucXVpdCgpXG4gICAgICAgICAgICBleGl0KGNvZGUgPz8gMClcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXJ0KHsgcmVxdWVzdEhhbmRsZXIsIGNzcywgaG9sZCwgbWFpbiwgY2xpZW50LCBpY29ucywgLi4uY2ZnIH06IENvbmZpZyA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBhcHAgPSB0aGlzIGFzIHVua25vd24gYXMgSW5zdGFuY2VUeXBlPEFwcDMgfCBBcHA0PlxuXG4gICAgICAgICAgICBjbGllbnQgPz89ICgpID0+IHtcbiAgICAgICAgICAgICAgICBwcmludChgQXN0YWwgaW5zdGFuY2UgXCIke2FwcC5pbnN0YW5jZU5hbWV9XCIgYWxyZWFkeSBydW5uaW5nYClcbiAgICAgICAgICAgICAgICBleGl0KDEpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgY2ZnKVxuICAgICAgICAgICAgc2V0Q29uc29sZUxvZ0RvbWFpbihhcHAuaW5zdGFuY2VOYW1lKVxuXG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RIYW5kbGVyID0gcmVxdWVzdEhhbmRsZXJcbiAgICAgICAgICAgIGFwcC5jb25uZWN0KFwiYWN0aXZhdGVcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIG1haW4/LiguLi5wcm9ncmFtQXJncylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXBwLmFjcXVpcmVfc29ja2V0KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjbGllbnQobXNnID0+IElPLnNlbmRfbWVzc2FnZShhcHAuaW5zdGFuY2VOYW1lLCBtc2cpISwgLi4ucHJvZ3JhbUFyZ3MpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjc3MpXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseV9jc3MoY3NzLCBmYWxzZSlcblxuICAgICAgICAgICAgaWYgKGljb25zKVxuICAgICAgICAgICAgICAgIGFwcC5hZGRfaWNvbnMoaWNvbnMpXG5cbiAgICAgICAgICAgIGhvbGQgPz89IHRydWVcbiAgICAgICAgICAgIGlmIChob2xkKVxuICAgICAgICAgICAgICAgIGFwcC5ob2xkKClcblxuICAgICAgICAgICAgYXBwLnJ1bkFzeW5jKFtdKVxuICAgICAgICB9XG4gICAgfSlcbn1cbiIsICIvKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGVuICovXG5pbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgYXN0YWxpZnksIHsgdHlwZSBDb25zdHJ1Y3RQcm9wcywgdHlwZSBCaW5kYWJsZUNoaWxkIH0gZnJvbSBcIi4vYXN0YWxpZnkuanNcIlxuXG4vLyBCb3hcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShBc3RhbC5Cb3gucHJvdG90eXBlLCBcImNoaWxkcmVuXCIsIHtcbiAgICBnZXQoKSB7IHJldHVybiB0aGlzLmdldF9jaGlsZHJlbigpIH0sXG4gICAgc2V0KHYpIHsgdGhpcy5zZXRfY2hpbGRyZW4odikgfSxcbn0pXG5cbmV4cG9ydCB0eXBlIEJveFByb3BzID0gQ29uc3RydWN0UHJvcHM8Qm94LCBBc3RhbC5Cb3guQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBCb3ggZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5Cb3gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQm94XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQm94UHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBCdXR0b25cbmV4cG9ydCB0eXBlIEJ1dHRvblByb3BzID0gQ29uc3RydWN0UHJvcHM8QnV0dG9uLCBBc3RhbC5CdXR0b24uQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uQ2xpY2tlZDogW11cbiAgICBvbkNsaWNrOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25DbGlja1JlbGVhc2U6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkhvdmVyOiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25Ib3Zlckxvc3Q6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvblNjcm9sbDogW2V2ZW50OiBBc3RhbC5TY3JvbGxFdmVudF1cbn0+XG5leHBvcnQgY2xhc3MgQnV0dG9uIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQnV0dG9uKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkJ1dHRvblwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEJ1dHRvblByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQ2VudGVyQm94XG5leHBvcnQgdHlwZSBDZW50ZXJCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPENlbnRlckJveCwgQXN0YWwuQ2VudGVyQm94LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgQ2VudGVyQm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQ2VudGVyQm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkNlbnRlckJveFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IENlbnRlckJveFByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQ2lyY3VsYXJQcm9ncmVzc1xuZXhwb3J0IHR5cGUgQ2lyY3VsYXJQcm9ncmVzc1Byb3BzID0gQ29uc3RydWN0UHJvcHM8Q2lyY3VsYXJQcm9ncmVzcywgQXN0YWwuQ2lyY3VsYXJQcm9ncmVzcy5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIENpcmN1bGFyUHJvZ3Jlc3MgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5DaXJjdWxhclByb2dyZXNzKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkNpcmN1bGFyUHJvZ3Jlc3NcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBDaXJjdWxhclByb2dyZXNzUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBEcmF3aW5nQXJlYVxuZXhwb3J0IHR5cGUgRHJhd2luZ0FyZWFQcm9wcyA9IENvbnN0cnVjdFByb3BzPERyYXdpbmdBcmVhLCBHdGsuRHJhd2luZ0FyZWEuQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uRHJhdzogW2NyOiBhbnldIC8vIFRPRE86IGNhaXJvIHR5cGVzXG59PlxuZXhwb3J0IGNsYXNzIERyYXdpbmdBcmVhIGV4dGVuZHMgYXN0YWxpZnkoR3RrLkRyYXdpbmdBcmVhKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkRyYXdpbmdBcmVhXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRHJhd2luZ0FyZWFQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gRW50cnlcbmV4cG9ydCB0eXBlIEVudHJ5UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxFbnRyeSwgR3RrLkVudHJ5LkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkNoYW5nZWQ6IFtdXG4gICAgb25BY3RpdmF0ZTogW11cbn0+XG5leHBvcnQgY2xhc3MgRW50cnkgZXh0ZW5kcyBhc3RhbGlmeShHdGsuRW50cnkpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiRW50cnlcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBFbnRyeVByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBFdmVudEJveFxuZXhwb3J0IHR5cGUgRXZlbnRCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPEV2ZW50Qm94LCBBc3RhbC5FdmVudEJveC5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25DbGljazogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uQ2xpY2tSZWxlYXNlOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25Ib3ZlcjogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uSG92ZXJMb3N0OiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25TY3JvbGw6IFtldmVudDogQXN0YWwuU2Nyb2xsRXZlbnRdXG59PlxuZXhwb3J0IGNsYXNzIEV2ZW50Qm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuRXZlbnRCb3gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiRXZlbnRCb3hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBFdmVudEJveFByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gLy8gVE9ETzogRml4ZWRcbi8vIC8vIFRPRE86IEZsb3dCb3hcbi8vXG4vLyBJY29uXG5leHBvcnQgdHlwZSBJY29uUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxJY29uLCBBc3RhbC5JY29uLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgSWNvbiBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkljb24pIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiSWNvblwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEljb25Qcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gTGFiZWxcbmV4cG9ydCB0eXBlIExhYmVsUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxMYWJlbCwgQXN0YWwuTGFiZWwuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBMYWJlbCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkxhYmVsKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkxhYmVsXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogTGFiZWxQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gTGV2ZWxCYXJcbmV4cG9ydCB0eXBlIExldmVsQmFyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxMZXZlbEJhciwgQXN0YWwuTGV2ZWxCYXIuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBMZXZlbEJhciBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkxldmVsQmFyKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkxldmVsQmFyXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogTGV2ZWxCYXJQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gVE9ETzogTGlzdEJveFxuXG4vLyBPdmVybGF5XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQXN0YWwuT3ZlcmxheS5wcm90b3R5cGUsIFwib3ZlcmxheXNcIiwge1xuICAgIGdldCgpIHsgcmV0dXJuIHRoaXMuZ2V0X292ZXJsYXlzKCkgfSxcbiAgICBzZXQodikgeyB0aGlzLnNldF9vdmVybGF5cyh2KSB9LFxufSlcblxuZXhwb3J0IHR5cGUgT3ZlcmxheVByb3BzID0gQ29uc3RydWN0UHJvcHM8T3ZlcmxheSwgQXN0YWwuT3ZlcmxheS5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIE92ZXJsYXkgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5PdmVybGF5KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIk92ZXJsYXlcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBPdmVybGF5UHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBSZXZlYWxlclxuZXhwb3J0IHR5cGUgUmV2ZWFsZXJQcm9wcyA9IENvbnN0cnVjdFByb3BzPFJldmVhbGVyLCBHdGsuUmV2ZWFsZXIuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBSZXZlYWxlciBleHRlbmRzIGFzdGFsaWZ5KEd0ay5SZXZlYWxlcikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJSZXZlYWxlclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFJldmVhbGVyUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTY3JvbGxhYmxlXG5leHBvcnQgdHlwZSBTY3JvbGxhYmxlUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTY3JvbGxhYmxlLCBBc3RhbC5TY3JvbGxhYmxlLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU2Nyb2xsYWJsZSBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLlNjcm9sbGFibGUpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU2Nyb2xsYWJsZVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFNjcm9sbGFibGVQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIFNsaWRlclxuZXhwb3J0IHR5cGUgU2xpZGVyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTbGlkZXIsIEFzdGFsLlNsaWRlci5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25EcmFnZ2VkOiBbXVxufT5cbmV4cG9ydCBjbGFzcyBTbGlkZXIgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TbGlkZXIpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU2xpZGVyXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU2xpZGVyUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFN0YWNrXG5leHBvcnQgdHlwZSBTdGFja1Byb3BzID0gQ29uc3RydWN0UHJvcHM8U3RhY2ssIEFzdGFsLlN0YWNrLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU3RhY2sgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TdGFjaykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTdGFja1wiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFN0YWNrUHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTd2l0Y2hcbmV4cG9ydCB0eXBlIFN3aXRjaFByb3BzID0gQ29uc3RydWN0UHJvcHM8U3dpdGNoLCBHdGsuU3dpdGNoLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU3dpdGNoIGV4dGVuZHMgYXN0YWxpZnkoR3RrLlN3aXRjaCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTd2l0Y2hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTd2l0Y2hQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gV2luZG93XG5leHBvcnQgdHlwZSBXaW5kb3dQcm9wcyA9IENvbnN0cnVjdFByb3BzPFdpbmRvdywgQXN0YWwuV2luZG93LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgV2luZG93IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuV2luZG93KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIldpbmRvd1wiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFdpbmRvd1Byb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cbiIsICIqIHtcbiAgY29sb3I6ICNmMWYxZjE7XG4gIGZvbnQtc2l6ZTogMTZweDtcbn1cblxuLkJhciB7XG4gIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC44KTtcbn1cbi5CYXIgaWNvbiB7XG4gIGZvbnQtc2l6ZTogMjBweDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG59XG4uQmFyIC5pY29uIHtcbiAgZm9udC1zaXplOiAyMnB4O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgLyogbWFyZ2luLWJvdHRvbTogMnB4OyAqL1xufVxuLkJhciAuc3RhdHVzIHtcbiAgbWFyZ2luOiAwIDhweDtcbn1cblxuLmJhdHRlcnkuY2hhcmdpbmcge1xuICAvKiBsYWJlbCB7XG4gICAgY29sb3I6ICRhY2NlbnQ7XG4gIH0gKi9cbn1cbi5iYXR0ZXJ5LmNoYXJnaW5nIC5pY29uIHtcbiAgY29sb3I6ICMyQjgyRDM7XG4gIG1hcmdpbi1yaWdodDogMTBweDtcbn1cblxuYnV0dG9uIHtcbiAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gIGJvcmRlcjogbm9uZTtcbiAgcGFkZGluZzogMDtcbiAgYm9yZGVyLXJhZGl1czogMDtcbn1cblxuaWNvbiB7XG4gIGZvbnQtc2l6ZTogMjVweDtcbn1cblxuLndvcmtzcGFjZXMgaWNvbiB7XG4gIG1hcmdpbi10b3A6IDJweDtcbiAgbWFyZ2luLWxlZnQ6IDVweDtcbn1cbi53b3Jrc3BhY2VzIGJ1dHRvbiB7XG4gIHBhZGRpbmctcmlnaHQ6IDRweDtcbiAgcGFkZGluZy10b3A6IDNweDtcbiAgYm9yZGVyLWJvdHRvbTogM3B4IHNvbGlkIHRyYW5zcGFyZW50O1xuICBmb250LXdlaWdodDogbm9ybWFsO1xufVxuLndvcmtzcGFjZXMgYnV0dG9uIGxhYmVsIHtcbiAgbWFyZ2luLWxlZnQ6IDhweDtcbiAgbWFyZ2luLXJpZ2h0OiA0cHg7XG59XG4ud29ya3NwYWNlcyBidXR0b24uZXhpc3Qge1xuICBib3JkZXItYm90dG9tOiAzcHggc29saWQgcmdiKDUwLCA1MCwgNTApO1xufVxuLndvcmtzcGFjZXMgYnV0dG9uLmZvY3VzZWQge1xuICAvKiBiYWNrZ3JvdW5kOiAkYWNjZW50OyAqL1xuICBiYWNrZ3JvdW5kOiByZ2IoNTAsIDUwLCA1MCk7XG4gIGJvcmRlci1ib3R0b206IDNweCBzb2xpZCAjMkI4MkQzO1xufVxuXG4uTm90aWZpY2F0aW9ucyBldmVudGJveCBidXR0b24ge1xuICBiYWNrZ3JvdW5kOiByZ2IoNTAsIDUwLCA1MCk7XG4gIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgbWFyZ2luOiAwIDJweDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94ID4gYm94IHtcbiAgbWFyZ2luOiA0cHg7XG4gIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC44KTtcbiAgcGFkZGluZzogNHB4IDJweDtcbiAgbWluLXdpZHRoOiAzMDBweDtcbiAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgLyogYm9yZGVyOiAycHggc29saWQgcmVkOyAqL1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLmltYWdlIHtcbiAgbWluLWhlaWdodDogNDhweDtcbiAgbWluLXdpZHRoOiA0OHB4O1xuICBmb250LXNpemU6IDQ4cHg7XG4gIG1hcmdpbjogNHB4O1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLm1haW4ge1xuICBwYWRkaW5nLWxlZnQ6IDRweDtcbiAgbWFyZ2luLWJvdHRvbTogMnB4O1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLm1haW4gLmhlYWRlciAuc3VtbWFyeSB7XG4gIGZvbnQtc2l6ZTogMS4yZW07XG4gIGZvbnQtd2VpZ2h0OiBib2xkO1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3guY3JpdGljYWwgPiBib3gge1xuICBib3JkZXI6IDJweCBzb2xpZCByZWQ7XG59XG5cbi5jbG9jayAuaWNvbiB7XG4gIG1hcmdpbi1yaWdodDogNXB4O1xuICBjb2xvcjogIzJCODJEMztcbn1cblxuLnRyYXkge1xuICBtYXJnaW4tcmlnaHQ6IDJweDtcbn1cbi50cmF5IGljb24ge1xuICBmb250LXNpemU6IDE4cHg7XG4gIG1hcmdpbjogMCA0cHg7XG59XG5cbiNsYXVuY2hlciB7XG4gIGJhY2tncm91bmQ6IG5vbmU7XG59XG4jbGF1bmNoZXIgLm1haW4ge1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuOCk7XG4gIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gIGJvcmRlcjogMnB4IHNvbGlkICMyQjgyRDM7XG4gIGJhY2tncm91bmQ6IHVybChcIi9ob21lL21hcmNlbC9QaWN0dXJlcy93YWxscGFwcGVycy9wZXhlbHMtZWJlcmhhcmQtZ3Jvc3NnYXN0ZWlnZXItNDQzNDQ2LmpwZ1wiKTtcbiAgYmFja2dyb3VuZC1zaXplOiBjb3Zlcjtcbn1cbiNsYXVuY2hlciAubWFpbiAubGlzdGJveCB7XG4gIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC44KTtcbiAgYm9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXM6IDEwcHg7XG4gIGJvcmRlci10b3AtcmlnaHQtcmFkaXVzOiAxMHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIGljb24ge1xuICBtYXJnaW46IDAgNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIC5kZXNjcmlwdGlvbiB7XG4gIGNvbG9yOiAjYmJiO1xuICBmb250LXNpemU6IDAuOGVtO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbjpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM1NTU7XG4gIC8qIGJvcmRlcjogJHBhZGQgc29saWQgIzU1NTsgKi9cbn1cbiNsYXVuY2hlciAubWFpbiBidXR0b246Zm9jdXMge1xuICBvdXRsaW5lOiAycHggc29saWQgIzJCODJEMztcbn1cbiNsYXVuY2hlciAubWFpbiBidXR0b24ge1xuICBtYXJnaW46IDRweDtcbn1cbiNsYXVuY2hlciAubWFpbiBidXR0b24sXG4jbGF1bmNoZXIgLm1haW4gZW50cnkge1xuICBvdXRsaW5lOiBub25lO1xufVxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjgpO1xuICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICBtYXJnaW46IDRweDtcbn1cblxuLk9zZCBib3gge1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuOCk7XG4gIGJvcmRlci1yYWRpdXM6IDI0cHg7XG4gIHBhZGRpbmc6IDEwcHggMTJweDtcbn1cbi5Pc2QgYm94IHRyb3VnaCB7XG4gIHBhZGRpbmc6IDA7XG4gIG1hcmdpbjogOHB4O1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG59XG4uT3NkIGJveCB0cm91Z2ggYmxvY2sge1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG4gIGJvcmRlcjogbm9uZTtcbn1cbi5Pc2QgYm94IHRyb3VnaCBibG9jay5maWxsZWQge1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbn1cbi5Pc2QgYm94IGxhYmVsIHtcbiAgbWluLXdpZHRoOiA0MHB4O1xufVxuXG4jYmFja2dyb3VuZCB7XG4gIGJhY2tncm91bmQ6IHVybChcIi9ob21lL21hcmNlbC9QaWN0dXJlcy93YWxscGFwcGVycy9wZXhlbHMtZWJlcmhhcmQtZ3Jvc3NnYXN0ZWlnZXItNDQzNDQ2LmpwZ1wiKTtcbiAgYmFja2dyb3VuZC1zaXplOiBjb3ZlcjtcbiAgLyogYmFja2dyb3VuZDogcmVkOyAqL1xufSIsICJpbXBvcnQgXCIuL292ZXJyaWRlcy5qc1wiXG5leHBvcnQgeyBkZWZhdWx0IGFzIEFzdGFsSU8gfSBmcm9tIFwiZ2k6Ly9Bc3RhbElPP3ZlcnNpb249MC4xXCJcbmV4cG9ydCAqIGZyb20gXCIuL3Byb2Nlc3MuanNcIlxuZXhwb3J0ICogZnJvbSBcIi4vdGltZS5qc1wiXG5leHBvcnQgKiBmcm9tIFwiLi9maWxlLmpzXCJcbmV4cG9ydCAqIGZyb20gXCIuL2dvYmplY3QuanNcIlxuZXhwb3J0IHsgYmluZCwgZGVmYXVsdCBhcyBCaW5kaW5nIH0gZnJvbSBcIi4vYmluZGluZy5qc1wiXG5leHBvcnQgeyBWYXJpYWJsZSB9IGZyb20gXCIuL3ZhcmlhYmxlLmpzXCJcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5pbXBvcnQgR2lvIGZyb20gXCJnaTovL0dpbz92ZXJzaW9uPTIuMFwiXG5cbmV4cG9ydCB7IEdpbyB9XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlsZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBBc3RhbC5yZWFkX2ZpbGUocGF0aCkgfHwgXCJcIlxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZEZpbGVBc3luYyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIEFzdGFsLnJlYWRfZmlsZV9hc3luYyhwYXRoLCAoXywgcmVzKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwucmVhZF9maWxlX2ZpbmlzaChyZXMpIHx8IFwiXCIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlRmlsZShwYXRoOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuICAgIEFzdGFsLndyaXRlX2ZpbGUocGF0aCwgY29udGVudClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlRmlsZUFzeW5jKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgQXN0YWwud3JpdGVfZmlsZV9hc3luYyhwYXRoLCBjb250ZW50LCAoXywgcmVzKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwud3JpdGVfZmlsZV9maW5pc2gocmVzKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9uaXRvckZpbGUoXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIGNhbGxiYWNrOiAoZmlsZTogc3RyaW5nLCBldmVudDogR2lvLkZpbGVNb25pdG9yRXZlbnQpID0+IHZvaWQsXG4pOiBHaW8uRmlsZU1vbml0b3Ige1xuICAgIHJldHVybiBBc3RhbC5tb25pdG9yX2ZpbGUocGF0aCwgKGZpbGU6IHN0cmluZywgZXZlbnQ6IEdpby5GaWxlTW9uaXRvckV2ZW50KSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKGZpbGUsIGV2ZW50KVxuICAgIH0pIVxufVxuIiwgImltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuXG5leHBvcnQgeyBkZWZhdWx0IGFzIEdMaWIgfSBmcm9tIFwiZ2k6Ly9HTGliP3ZlcnNpb249Mi4wXCJcbmV4cG9ydCB7IEdPYmplY3QsIEdPYmplY3QgYXMgZGVmYXVsdCB9XG5cbmNvbnN0IG1ldGEgPSBTeW1ib2woXCJtZXRhXCIpXG5jb25zdCBwcml2ID0gU3ltYm9sKFwicHJpdlwiKVxuXG5jb25zdCB7IFBhcmFtU3BlYywgUGFyYW1GbGFncyB9ID0gR09iamVjdFxuXG5jb25zdCBrZWJhYmlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDEtJDJcIilcbiAgICAucmVwbGFjZUFsbChcIl9cIiwgXCItXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxudHlwZSBTaWduYWxEZWNsYXJhdGlvbiA9IHtcbiAgICBmbGFncz86IEdPYmplY3QuU2lnbmFsRmxhZ3NcbiAgICBhY2N1bXVsYXRvcj86IEdPYmplY3QuQWNjdW11bGF0b3JUeXBlXG4gICAgcmV0dXJuX3R5cGU/OiBHT2JqZWN0LkdUeXBlXG4gICAgcGFyYW1fdHlwZXM/OiBBcnJheTxHT2JqZWN0LkdUeXBlPlxufVxuXG50eXBlIFByb3BlcnR5RGVjbGFyYXRpb24gPVxuICAgIHwgSW5zdGFuY2VUeXBlPHR5cGVvZiBHT2JqZWN0LlBhcmFtU3BlYz5cbiAgICB8IHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH1cbiAgICB8IHR5cGVvZiBTdHJpbmdcbiAgICB8IHR5cGVvZiBOdW1iZXJcbiAgICB8IHR5cGVvZiBCb29sZWFuXG4gICAgfCB0eXBlb2YgT2JqZWN0XG5cbnR5cGUgR09iamVjdENvbnN0cnVjdG9yID0ge1xuICAgIFttZXRhXT86IHtcbiAgICAgICAgUHJvcGVydGllcz86IHsgW2tleTogc3RyaW5nXTogR09iamVjdC5QYXJhbVNwZWMgfVxuICAgICAgICBTaWduYWxzPzogeyBba2V5OiBzdHJpbmddOiBHT2JqZWN0LlNpZ25hbERlZmluaXRpb24gfVxuICAgIH1cbiAgICBuZXcoLi4uYXJnczogYW55W10pOiBhbnlcbn1cblxudHlwZSBNZXRhSW5mbyA9IEdPYmplY3QuTWV0YUluZm88bmV2ZXIsIEFycmF5PHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH0+LCBuZXZlcj5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyKG9wdGlvbnM6IE1ldGFJbmZvID0ge30pIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGNsczogR09iamVjdENvbnN0cnVjdG9yKSB7XG4gICAgICAgIGNvbnN0IHQgPSBvcHRpb25zLlRlbXBsYXRlXG4gICAgICAgIGlmICh0eXBlb2YgdCA9PT0gXCJzdHJpbmdcIiAmJiAhdC5zdGFydHNXaXRoKFwicmVzb3VyY2U6Ly9cIikgJiYgIXQuc3RhcnRzV2l0aChcImZpbGU6Ly9cIikpIHtcbiAgICAgICAgICAgIC8vIGFzc3VtZSB4bWwgdGVtcGxhdGVcbiAgICAgICAgICAgIG9wdGlvbnMuVGVtcGxhdGUgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodClcbiAgICAgICAgfVxuXG4gICAgICAgIEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7XG4gICAgICAgICAgICBTaWduYWxzOiB7IC4uLmNsc1ttZXRhXT8uU2lnbmFscyB9LFxuICAgICAgICAgICAgUHJvcGVydGllczogeyAuLi5jbHNbbWV0YV0/LlByb3BlcnRpZXMgfSxcbiAgICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIH0sIGNscylcblxuICAgICAgICBkZWxldGUgY2xzW21ldGFdXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvcGVydHkoZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24gPSBPYmplY3QpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHRhcmdldDogYW55LCBwcm9wOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdID8/PSB7fVxuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uUHJvcGVydGllcyA/Pz0ge31cblxuICAgICAgICBjb25zdCBuYW1lID0ga2ViYWJpZnkocHJvcClcblxuICAgICAgICBpZiAoIWRlc2MpIHtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIHByb3AsIHtcbiAgICAgICAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW3ByaXZdPy5bcHJvcF0gPz8gZGVmYXVsdFZhbHVlKGRlY2xhcmF0aW9uKVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0KHY6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiAhPT0gdGhpc1twcm9wXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcml2XSA/Pz0ge31cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNbcHJpdl1bcHJvcF0gPSB2XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5vdGlmeShuYW1lKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGBzZXRfJHtuYW1lLnJlcGxhY2UoXCItXCIsIFwiX1wiKX1gLCB7XG4gICAgICAgICAgICAgICAgdmFsdWUodjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbcHJvcF0gPSB2XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGBnZXRfJHtuYW1lLnJlcGxhY2UoXCItXCIsIFwiX1wiKX1gLCB7XG4gICAgICAgICAgICAgICAgdmFsdWUoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW3Byb3BdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5Qcm9wZXJ0aWVzW2tlYmFiaWZ5KHByb3ApXSA9IHBzcGVjKG5hbWUsIFBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBkZWNsYXJhdGlvbilcbiAgICAgICAgfVxuXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGV0IGZsYWdzID0gMFxuICAgICAgICAgICAgaWYgKGRlc2MuZ2V0KSBmbGFncyB8PSBQYXJhbUZsYWdzLlJFQURBQkxFXG4gICAgICAgICAgICBpZiAoZGVzYy5zZXQpIGZsYWdzIHw9IFBhcmFtRmxhZ3MuV1JJVEFCTEVcblxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlByb3BlcnRpZXNba2ViYWJpZnkocHJvcCldID0gcHNwZWMobmFtZSwgZmxhZ3MsIGRlY2xhcmF0aW9uKVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKC4uLnBhcmFtczogQXJyYXk8eyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfSB8IHR5cGVvZiBPYmplY3Q+KTpcbih0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpID0+IHZvaWRcblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25hbChkZWNsYXJhdGlvbj86IFNpZ25hbERlY2xhcmF0aW9uKTpcbih0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpID0+IHZvaWRcblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25hbChcbiAgICBkZWNsYXJhdGlvbj86IFNpZ25hbERlY2xhcmF0aW9uIHwgeyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfSB8IHR5cGVvZiBPYmplY3QsXG4gICAgLi4ucGFyYW1zOiBBcnJheTx7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdD5cbikge1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHNpZ25hbDogYW55LCBkZXNjPzogUHJvcGVydHlEZXNjcmlwdG9yKSB7XG4gICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXSA/Pz0ge31cbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlNpZ25hbHMgPz89IHt9XG5cbiAgICAgICAgY29uc3QgbmFtZSA9IGtlYmFiaWZ5KHNpZ25hbClcblxuICAgICAgICBpZiAoZGVjbGFyYXRpb24gfHwgcGFyYW1zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgVE9ETzogdHlwZSBhc3NlcnRcbiAgICAgICAgICAgIGNvbnN0IGFyciA9IFtkZWNsYXJhdGlvbiwgLi4ucGFyYW1zXS5tYXAodiA9PiB2LiRndHlwZSlcbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5TaWduYWxzW25hbWVdID0ge1xuICAgICAgICAgICAgICAgIHBhcmFtX3R5cGVzOiBhcnIsXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uU2lnbmFsc1tuYW1lXSA9IGRlY2xhcmF0aW9uIHx8IHtcbiAgICAgICAgICAgICAgICBwYXJhbV90eXBlczogW10sXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWRlc2MpIHtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIHNpZ25hbCwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KG5hbWUsIC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBvZzogKCguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCkgPSBkZXNjLnZhbHVlXG4gICAgICAgICAgICBkZXNjLnZhbHVlID0gZnVuY3Rpb24gKC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBub3QgdHlwZWRcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQobmFtZSwgLi4uYXJncylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGBvbl8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogZnVuY3Rpb24gKC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvZyguLi5hcmdzKVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwc3BlYyhuYW1lOiBzdHJpbmcsIGZsYWdzOiBudW1iZXIsIGRlY2xhcmF0aW9uOiBQcm9wZXJ0eURlY2xhcmF0aW9uKSB7XG4gICAgaWYgKGRlY2xhcmF0aW9uIGluc3RhbmNlb2YgUGFyYW1TcGVjKVxuICAgICAgICByZXR1cm4gZGVjbGFyYXRpb25cblxuICAgIHN3aXRjaCAoZGVjbGFyYXRpb24pIHtcbiAgICAgICAgY2FzZSBTdHJpbmc6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLnN0cmluZyhuYW1lLCBcIlwiLCBcIlwiLCBmbGFncywgXCJcIilcbiAgICAgICAgY2FzZSBOdW1iZXI6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLmRvdWJsZShuYW1lLCBcIlwiLCBcIlwiLCBmbGFncywgLU51bWJlci5NQVhfVkFMVUUsIE51bWJlci5NQVhfVkFMVUUsIDApXG4gICAgICAgIGNhc2UgQm9vbGVhbjpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuYm9vbGVhbihuYW1lLCBcIlwiLCBcIlwiLCBmbGFncywgZmFsc2UpXG4gICAgICAgIGNhc2UgT2JqZWN0OlxuICAgICAgICAgICAgcmV0dXJuIFBhcmFtU3BlYy5qc29iamVjdChuYW1lLCBcIlwiLCBcIlwiLCBmbGFncylcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgbWlzc3R5cGVkXG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLm9iamVjdChuYW1lLCBcIlwiLCBcIlwiLCBmbGFncywgZGVjbGFyYXRpb24uJGd0eXBlKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZGVmYXVsdFZhbHVlKGRlY2xhcmF0aW9uOiBQcm9wZXJ0eURlY2xhcmF0aW9uKSB7XG4gICAgaWYgKGRlY2xhcmF0aW9uIGluc3RhbmNlb2YgUGFyYW1TcGVjKVxuICAgICAgICByZXR1cm4gZGVjbGFyYXRpb24uZ2V0X2RlZmF1bHRfdmFsdWUoKVxuXG4gICAgc3dpdGNoIChkZWNsYXJhdGlvbikge1xuICAgICAgICBjYXNlIFN0cmluZzpcbiAgICAgICAgICAgIHJldHVybiBcImRlZmF1bHQtc3RyaW5nXCJcbiAgICAgICAgY2FzZSBOdW1iZXI6XG4gICAgICAgICAgICByZXR1cm4gMFxuICAgICAgICBjYXNlIEJvb2xlYW46XG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgY2FzZSBPYmplY3Q6XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gbnVsbFxuICAgIH1cbn1cbiIsICJpbXBvcnQgeyBWYXJpYWJsZSwgR0xpYiwgYmluZCwgZXhlY0FzeW5jIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBBc3RhbCwgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBCYXR0ZXJ5IGZyb20gXCJnaTovL0FzdGFsQmF0dGVyeVwiO1xuaW1wb3J0IFdvcmtzcGFjZXMgZnJvbSBcIi4vd29ya3NwYWNlc1wiO1xuaW1wb3J0IFRyYXkgZnJvbSBcIi4vdHJheVwiO1xuaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCBOZXR3b3JrIGZyb20gXCJnaTovL0FzdGFsTmV0d29ya1wiO1xuXG5mdW5jdGlvbiBCYXR0ZXJ5TGV2ZWwoKSB7XG4gIGNvbnN0IGJhdCA9IEJhdHRlcnkuZ2V0X2RlZmF1bHQoKTtcbiAgY29uc3QgaWNvbnMgPSB7XG4gICAgLy8gYmF0dGVyeSBpY29ucyBmcm9tIG5lcmQgZm9udHMgaHR0cHM6Ly93d3cubmVyZGZvbnRzLmNvbS9cbiAgICBcImJhdHRlcnktbGV2ZWwtMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5Q1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0yMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0zMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4N1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC00MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC01MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC02MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC03MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC04MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC05MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMDAtY2hhcmdlZC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0wLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzhFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdBXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTIwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdCXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTMwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdDXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTQwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdEXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTUwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTYwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdGXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTcwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgwXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTgwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgxXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTkwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgyXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3OVwiLFxuICB9O1xuXG4gIGxldCB3YXNOb3RpZmllZCA9IGZhbHNlO1xuXG5cbiAgcmV0dXJuIChcbiAgICA8Ym94XG4gICAgICBjbGFzc05hbWU9e2JpbmQoYmF0LCBcImNoYXJnaW5nXCIpLmFzKGMgPT4gYyA/IFwiY2hhcmdpbmcgYmF0dGVyeSBzdGF0dXNcIiA6IFwiYmF0dGVyeSBzdGF0dXNcIil9XG4gICAgICBoZXhwYW5kXG4gICAgPlxuICAgICAgPGxhYmVsXG4gICAgICAgIGNsYXNzTmFtZT1cImljb25cIlxuICAgICAgICBsYWJlbD17YmluZChiYXQsIFwiYmF0dGVyeUljb25OYW1lXCIpLmFzKChiKSA9PiBpY29uc1tiXSl9XG4gICAgICAvPlxuICAgICAgPGxhYmVsXG4gICAgICAgIGxhYmVsPXtiaW5kKGJhdCwgXCJwZXJjZW50YWdlXCIpLmFzKChwKSA9PiB7XG4gICAgICAgICAgaWYgKHAgPCAwLjIpIHtcbiAgICAgICAgICAgIGlmICghd2FzTm90aWZpZWQpIHtcbiAgICAgICAgICAgICAgZXhlY0FzeW5jKFtcIm5vdGlmeS1zZW5kXCIsIFwiLXVcIiwgXCJjcml0aWNhbFwiLCBcIi1pXCIsIFwiYmF0dGVyeS1jYXV0aW9uLXN5bWJvbGljXCIsIFwiTG93IEJhdHRlcnlcIl0pXG4gICAgICAgICAgICAgIHdhc05vdGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Ugd2FzTm90aWZpZWQgPSBmYWxzZTtcbiAgICAgICAgICByZXR1cm4gYCR7TWF0aC5mbG9vcihwICogMTAwKX0lYDtcbiAgICAgICAgfSl9XG4gICAgICAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5mdW5jdGlvbiBWb2x1bWUoKSB7XG4gIGNvbnN0IHNwZWFrZXIgPSBXcC5nZXRfZGVmYXVsdCgpPy5hdWRpby5kZWZhdWx0U3BlYWtlcjtcblxuICByZXR1cm4gKFxuICAgIDxib3ggY2xhc3NOYW1lPVwidm9sdW1lIHN0YXR1c1wiPlxuICAgICAgPGljb24gaWNvbj17YmluZChzcGVha2VyLCBcInZvbHVtZUljb25cIil9IC8+XG4gICAgICA8bGFiZWwgbGFiZWw9e2JpbmQoc3BlYWtlciwgXCJ2b2x1bWVcIikuYXMoKHApID0+IGAke01hdGguZmxvb3IocCAqIDEwMCl9JWApfSAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCYXIobW9uaXRvcikge1xuICBjb25zdCB7IFRPUCwgUklHSFQsIExFRlQgfSA9IEFzdGFsLldpbmRvd0FuY2hvcjtcblxuICBjb25zdCBuZXR3b3JrID0gTmV0d29yay5nZXRfZGVmYXVsdCgpO1xuICBjb25zdCB3aWZpID0gYmluZChuZXR3b3JrLCBcIndpZmlcIik7XG5cbiAgcmV0dXJuIChcbiAgICA8d2luZG93XG4gICAgICBjbGFzc05hbWU9XCJCYXJcIlxuICAgICAgbmFtZXNwYWNlPVwiYWdzLWJhclwiXG4gICAgICBnZGttb25pdG9yPXttb25pdG9yfVxuICAgICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5LkVYQ0xVU0lWRX1cbiAgICAgIGFuY2hvcj17VE9QIHwgTEVGVCB8IFJJR0hUfVxuICAgID5cbiAgICAgIDxjZW50ZXJib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBzdGFydFwiIGhhbGlnbj17R3RrLkFsaWduLlNUQVJUfT5cbiAgICAgICAgICA8V29ya3NwYWNlcyAvPlxuICAgICAgICA8L2JveD5cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJzZWdtZW50IGNlbnRlclwiPlxuICAgICAgICAgIDxsYWJlbFxuICAgICAgICAgICAgbGFiZWw9e1ZhcmlhYmxlKFwiXCIpLnBvbGwoNTAwMCwgKCkgPT5cbiAgICAgICAgICAgICAgR0xpYi5EYXRlVGltZS5uZXdfbm93X2xvY2FsKCkuZm9ybWF0KFwiJUg6JU0gJUEgJWQvJW0vJVlcIiksXG4gICAgICAgICAgICApKCl9XG4gICAgICAgICAgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBlbmRcIiBoYWxpZ249e0d0ay5BbGlnbi5FTkR9ID5cbiAgICAgICAgICA8VHJheSAvPlxuICAgICAgICAgIHt3aWZpLmFzKFxuICAgICAgICAgICAgKHdpZmkpID0+XG4gICAgICAgICAgICAgIHdpZmkgJiYgKFxuICAgICAgICAgICAgICAgIDxib3hcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5ldHdvcmsgc3RhdHVzXCJcbiAgICAgICAgICAgICAgICAgIGhhbGlnbj17R3RrLkFsaWduLkNFTlRFUn1cbiAgICAgICAgICAgICAgICAgIGhleHBhbmRcbiAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICA8aWNvblxuICAgICAgICAgICAgICAgICAgICBpY29uPXtiaW5kKHdpZmksIFwiaWNvbk5hbWVcIil9XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPGxhYmVsIGxhYmVsPXtiaW5kKHdpZmksIFwic3NpZFwiKX0gLz5cbiAgICAgICAgICAgICAgICA8L2JveD5cbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApfVxuICAgICAgICAgIDxCYXR0ZXJ5TGV2ZWwgLz5cbiAgICAgICAgICA8Vm9sdW1lIC8+XG4gICAgICAgIDwvYm94PlxuICAgICAgPC9jZW50ZXJib3g+XG4gICAgPC93aW5kb3cgPlxuICApO1xufVxuIiwgImltcG9ydCBIeXBybGFuZCBmcm9tIFwiZ2k6Ly9Bc3RhbEh5cHJsYW5kXCI7XG5pbXBvcnQgeyBiaW5kIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBnZXRfaWNvbiB9IGZyb20gXCIuLi91dGlsLmpzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFdvcmtzcGFjZXMoeyBvcmllbnRhdGlvbiB9KSB7XG4gIGNvbnN0IGh5cHIgPSBIeXBybGFuZC5nZXRfZGVmYXVsdCgpO1xuXG4gIGNvbnN0IGFkZFN0YXRpYyA9IChhcnIsIGlkKSA9PiB7XG4gICAgY29uc3QgaWR4ID0gaWQgPT09IDEgPyAwIDogYXJyLmZpbmRJbmRleCh3ID0+IHcuaWQgPT09IGlkIC0gMSlcbiAgICBwcmludChgdG8gaW5zZXJ0OiAke2lkfSBpZHg6ICR7aWR4fWApXG4gICAgaWYgKGlkeCA8IDApXG4gICAgICByZXR1cm5cbiAgICBpZiAoYXJyLmZpbmQodyA9PiB3LmlkID09PSBpZCkgPT09IHVuZGVmaW5lZClcbiAgICAgIGFyci5zcGxpY2UoaWR4KzEsIDAsIHsgXCJpZFwiOiBpZCwgXCJuYW1lXCI6IGlkLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gIH1cblxuICByZXR1cm4gKFxuICAgIDxib3ggY2xhc3NOYW1lPVwid29ya3NwYWNlc1wiIG9yaWVudGF0aW9uPXtvcmllbnRhdGlvbn0+XG4gICAgICB7YmluZChoeXByLCBcIndvcmtzcGFjZXNcIikuYXMod29ya3NwYWNlcyA9PiB7XG4gICAgICAgIGNvbnN0IGZpbHRlcmVkID0gd29ya3NwYWNlc1xuICAgICAgICAgIC5maWx0ZXIod3MgPT4gISh3cy5pZCA+PSAtOTkgJiYgd3MuaWQgPD0gLTIpKSAvLyBmaWx0ZXIgb3V0IHNwZWNpYWwgd29ya3NwYWNlc1xuICAgICAgICAgIC8vIC5maWx0ZXIod3MgPT4gISh3cy5pZCA+PSAtMikpXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKVxuXG4gICAgICAgIC8vIHByaW50KFwiYWFhYVwiKVxuICAgICAgICAvLyBmaWx0ZXJlZC5mb3JFYWNoKHc9PnByaW50KHcuaWQpKVxuXG5cbiAgICAgICAgYWRkU3RhdGljKGZpbHRlcmVkLCAxKVxuICAgICAgICBhZGRTdGF0aWMoZmlsdGVyZWQsIDIpXG4gICAgICAgIGFkZFN0YXRpYyhmaWx0ZXJlZCwgMylcbiAgICAgICAgYWRkU3RhdGljKGZpbHRlcmVkLCA0KVxuICAgICAgICBhZGRTdGF0aWMoZmlsdGVyZWQsIDUpXG5cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkLm1hcCgodykgPT4gKFxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIGNsYXNzTmFtZT17YmluZChoeXByLCBcImZvY3VzZWRXb3Jrc3BhY2VcIikuYXMoKGZ3KSA9PlxuICAgICAgICAgICAgICB3LmlkID09PSBmdy5pZCA/IFwiZm9jdXNlZFwiIDogdy5zdGF0aWMgPyBcIlwiIDogXCJleGlzdFwiXG4gICAgICAgICAgICApfVxuICAgICAgICAgICAgb25DbGlja2VkPXsoKSA9PiBoeXByLm1lc3NhZ2UoYGRpc3BhdGNoIHdvcmtzcGFjZSAke3cuaWR9YCl9XG4gICAgICAgICAgPlxuICAgICAgICAgICAge3cubmFtZX1cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKSlcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxpY29uIGljb249e2JpbmQoY2xpZW50LCBcImluaXRpYWwtY2xhc3NcIikuYXMoYyA9PiBnZXRfaWNvbihjKSl9IC8+XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxsYWJlbCBlbGxpcHNpemU9ezN9IGxhYmVsPXtiaW5kKGNsaWVudCwgXCJ0aXRsZVwiKS5hcyh0ID0+IHQgfHwgY2xpZW50LmluaXRpYWxUaXRsZSB8fCBjbGllbnQuY2xhc3MpfSBjc3M9XCJtYXJnaW4tcmlnaHQ6IDIwcHhcIiAvPjtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgfSl9XG4gICAgPC9ib3g+XG4gICk7XG59XG4iLCAiaW1wb3J0IHsgQXN0YWwgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRfaWNvbih3aW5kb3dfY2xhc3MpIHtcbiAgc3dpdGNoICh3aW5kb3dfY2xhc3MpIHtcbiAgICBjYXNlIFwiemVuXCI6XG4gICAgICByZXR1cm4gXCJ6ZW4tYnJvd3NlclwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyByZXR1cm4gd2luZG93X2NsYXNzO1xuICAgICAgcmV0dXJuIEFzdGFsLkljb24ubG9va3VwX2ljb24od2luZG93X2NsYXNzKSA/IHdpbmRvd19jbGFzcyA6IHdpbmRvd19jbGFzcy50b0xvd2VyQ2FzZSgpO1xuICB9XG59XG5cbiIsICJpbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgeyBtZXJnZUJpbmRpbmdzLCB0eXBlIEJpbmRhYmxlQ2hpbGQgfSBmcm9tIFwiLi9hc3RhbGlmeS5qc1wiXG5pbXBvcnQgKiBhcyBXaWRnZXQgZnJvbSBcIi4vd2lkZ2V0LmpzXCJcblxuZnVuY3Rpb24gaXNBcnJvd0Z1bmN0aW9uKGZ1bmM6IGFueSk6IGZ1bmMgaXMgKGFyZ3M6IGFueSkgPT4gYW55IHtcbiAgICByZXR1cm4gIU9iamVjdC5oYXNPd24oZnVuYywgXCJwcm90b3R5cGVcIilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZyYWdtZW50KHsgY2hpbGRyZW4gPSBbXSwgY2hpbGQgfToge1xuICAgIGNoaWxkPzogQmluZGFibGVDaGlsZFxuICAgIGNoaWxkcmVuPzogQXJyYXk8QmluZGFibGVDaGlsZD5cbn0pIHtcbiAgICBpZiAoY2hpbGQpIGNoaWxkcmVuLnB1c2goY2hpbGQpXG4gICAgcmV0dXJuIG1lcmdlQmluZGluZ3MoY2hpbGRyZW4pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc3goXG4gICAgY3Rvcjoga2V5b2YgdHlwZW9mIGN0b3JzIHwgdHlwZW9mIEd0ay5XaWRnZXQsXG4gICAgeyBjaGlsZHJlbiwgLi4ucHJvcHMgfTogYW55LFxuKSB7XG4gICAgY2hpbGRyZW4gPz89IFtdXG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoY2hpbGRyZW4pKVxuICAgICAgICBjaGlsZHJlbiA9IFtjaGlsZHJlbl1cblxuICAgIGNoaWxkcmVuID0gY2hpbGRyZW4uZmlsdGVyKEJvb2xlYW4pXG5cbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAxKVxuICAgICAgICBwcm9wcy5jaGlsZCA9IGNoaWxkcmVuWzBdXG4gICAgZWxzZSBpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMSlcbiAgICAgICAgcHJvcHMuY2hpbGRyZW4gPSBjaGlsZHJlblxuXG4gICAgaWYgKHR5cGVvZiBjdG9yID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHJldHVybiBuZXcgY3RvcnNbY3Rvcl0ocHJvcHMpXG4gICAgfVxuXG4gICAgaWYgKGlzQXJyb3dGdW5jdGlvbihjdG9yKSlcbiAgICAgICAgcmV0dXJuIGN0b3IocHJvcHMpXG5cbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGNhbiBiZSBjbGFzcyBvciBmdW5jdGlvblxuICAgIHJldHVybiBuZXcgY3Rvcihwcm9wcylcbn1cblxuY29uc3QgY3RvcnMgPSB7XG4gICAgYm94OiBXaWRnZXQuQm94LFxuICAgIGJ1dHRvbjogV2lkZ2V0LkJ1dHRvbixcbiAgICBjZW50ZXJib3g6IFdpZGdldC5DZW50ZXJCb3gsXG4gICAgY2lyY3VsYXJwcm9ncmVzczogV2lkZ2V0LkNpcmN1bGFyUHJvZ3Jlc3MsXG4gICAgZHJhd2luZ2FyZWE6IFdpZGdldC5EcmF3aW5nQXJlYSxcbiAgICBlbnRyeTogV2lkZ2V0LkVudHJ5LFxuICAgIGV2ZW50Ym94OiBXaWRnZXQuRXZlbnRCb3gsXG4gICAgLy8gVE9ETzogZml4ZWRcbiAgICAvLyBUT0RPOiBmbG93Ym94XG4gICAgaWNvbjogV2lkZ2V0Lkljb24sXG4gICAgbGFiZWw6IFdpZGdldC5MYWJlbCxcbiAgICBsZXZlbGJhcjogV2lkZ2V0LkxldmVsQmFyLFxuICAgIC8vIFRPRE86IGxpc3Rib3hcbiAgICBvdmVybGF5OiBXaWRnZXQuT3ZlcmxheSxcbiAgICByZXZlYWxlcjogV2lkZ2V0LlJldmVhbGVyLFxuICAgIHNjcm9sbGFibGU6IFdpZGdldC5TY3JvbGxhYmxlLFxuICAgIHNsaWRlcjogV2lkZ2V0LlNsaWRlcixcbiAgICBzdGFjazogV2lkZ2V0LlN0YWNrLFxuICAgIHN3aXRjaDogV2lkZ2V0LlN3aXRjaCxcbiAgICB3aW5kb3c6IFdpZGdldC5XaW5kb3csXG59XG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW5hbWVzcGFjZVxuICAgIG5hbWVzcGFjZSBKU1gge1xuICAgICAgICB0eXBlIEVsZW1lbnQgPSBHdGsuV2lkZ2V0XG4gICAgICAgIHR5cGUgRWxlbWVudENsYXNzID0gR3RrLldpZGdldFxuICAgICAgICBpbnRlcmZhY2UgSW50cmluc2ljRWxlbWVudHMge1xuICAgICAgICAgICAgYm94OiBXaWRnZXQuQm94UHJvcHNcbiAgICAgICAgICAgIGJ1dHRvbjogV2lkZ2V0LkJ1dHRvblByb3BzXG4gICAgICAgICAgICBjZW50ZXJib3g6IFdpZGdldC5DZW50ZXJCb3hQcm9wc1xuICAgICAgICAgICAgY2lyY3VsYXJwcm9ncmVzczogV2lkZ2V0LkNpcmN1bGFyUHJvZ3Jlc3NQcm9wc1xuICAgICAgICAgICAgZHJhd2luZ2FyZWE6IFdpZGdldC5EcmF3aW5nQXJlYVByb3BzXG4gICAgICAgICAgICBlbnRyeTogV2lkZ2V0LkVudHJ5UHJvcHNcbiAgICAgICAgICAgIGV2ZW50Ym94OiBXaWRnZXQuRXZlbnRCb3hQcm9wc1xuICAgICAgICAgICAgLy8gVE9ETzogZml4ZWRcbiAgICAgICAgICAgIC8vIFRPRE86IGZsb3dib3hcbiAgICAgICAgICAgIGljb246IFdpZGdldC5JY29uUHJvcHNcbiAgICAgICAgICAgIGxhYmVsOiBXaWRnZXQuTGFiZWxQcm9wc1xuICAgICAgICAgICAgbGV2ZWxiYXI6IFdpZGdldC5MZXZlbEJhclByb3BzXG4gICAgICAgICAgICAvLyBUT0RPOiBsaXN0Ym94XG4gICAgICAgICAgICBvdmVybGF5OiBXaWRnZXQuT3ZlcmxheVByb3BzXG4gICAgICAgICAgICByZXZlYWxlcjogV2lkZ2V0LlJldmVhbGVyUHJvcHNcbiAgICAgICAgICAgIHNjcm9sbGFibGU6IFdpZGdldC5TY3JvbGxhYmxlUHJvcHNcbiAgICAgICAgICAgIHNsaWRlcjogV2lkZ2V0LlNsaWRlclByb3BzXG4gICAgICAgICAgICBzdGFjazogV2lkZ2V0LlN0YWNrUHJvcHNcbiAgICAgICAgICAgIHN3aXRjaDogV2lkZ2V0LlN3aXRjaFByb3BzXG4gICAgICAgICAgICB3aW5kb3c6IFdpZGdldC5XaW5kb3dQcm9wc1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QganN4cyA9IGpzeFxuIiwgImltcG9ydCBUcmF5IGZyb20gXCJnaTovL0FzdGFsVHJheVwiO1xuaW1wb3J0IHsgVmFyaWFibGUsIGJpbmQgfSBmcm9tIFwiYXN0YWxcIjtcbmltcG9ydCB7IEFzdGFsLCBHdGssIEdkayB9IGZyb20gXCJhc3RhbC9ndGszXCJcblxuY29uc3QgY3JlYXRlTWVudSA9IChtZW51TW9kZWwsIGFjdGlvbkdyb3VwKSA9PiB7XG4gIGNvbnN0IG1lbnUgPSBHdGsuTWVudS5uZXdfZnJvbV9tb2RlbChtZW51TW9kZWwpO1xuICBtZW51Lmluc2VydF9hY3Rpb25fZ3JvdXAoJ2RidXNtZW51JywgYWN0aW9uR3JvdXApO1xuXG4gIHJldHVybiBtZW51O1xufTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU3lzVHJheSh7b3JpZW50YXRpb259KSB7XG4gIGNvbnN0IHRyYXkgPSBUcmF5LmdldF9kZWZhdWx0KClcbiAgXG4gIHJldHVybiA8Ym94IGNsYXNzTmFtZT1cInRyYXlcIiBvcmllbnRhdGlvbj17b3JpZW50YXRpb259IHZpc2libGU9e2JpbmQodHJheSwgXCJpdGVtc1wiKS5hcyhpdGVtcz0+aXRlbXMubGVuZ3RoPjApfT5cbiAgICB7YmluZCh0cmF5LCBcIml0ZW1zXCIpLmFzKGl0ZW1zID0+IGl0ZW1zLm1hcChpdGVtID0+IHtcblxuICAgICAgLy8gTWFrZSBzdXJlIHlvdSdyZSBib3VuZCB0byB0aGUgbWVudU1vZGVsIGFuZCBhY3Rpb25Hcm91cCB3aGljaCBjYW4gY2hhbmdlXG5cbiAgICAgIGxldCBtZW51O1xuXG4gICAgICBjb25zdCBlbnRyeUJpbmRpbmcgPSBWYXJpYWJsZS5kZXJpdmUoXG4gICAgICAgIFtiaW5kKGl0ZW0sICdtZW51TW9kZWwnKSwgYmluZChpdGVtLCAnYWN0aW9uR3JvdXAnKV0sXG4gICAgICAgIChtZW51TW9kZWwsIGFjdGlvbkdyb3VwKSA9PiB7XG4gICAgICAgICAgaWYgKCFtZW51TW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKGBNZW51IE1vZGVsIG5vdCBmb3VuZCBmb3IgJHtpdGVtLmlkfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWFjdGlvbkdyb3VwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcihgQWN0aW9uIEdyb3VwIG5vdCBmb3VuZCBmb3IgJHtpdGVtLmlkfWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG1lbnUgPSBjcmVhdGVNZW51KG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApO1xuICAgICAgICB9LFxuICAgICAgKTtcblxuXG4gICAgICByZXR1cm4gPGJ1dHRvblxuICAgICAgICBvbkNsaWNrPXsoYnRuLCBfKT0+e1xuICAgICAgICAgIG1lbnU/LnBvcHVwX2F0X3dpZGdldChidG4sIEdkay5HcmF2aXR5Lk5PUlRILCBHZGsuR3Jhdml0eS5TT1VUSCwgbnVsbCk7XG4gICAgICAgIH19XG4gICAgICAgIG9uRGVzdHJveT17KCkgPT4ge1xuICAgICAgICAgIG1lbnU/LmRlc3Ryb3koKTtcbiAgICAgICAgICBlbnRyeUJpbmRpbmcuZHJvcCgpO1xuICAgICAgICB9fT5cbiAgICAgICAgPGljb24gZy1pY29uPXtiaW5kKGl0ZW0sIFwiZ2ljb25cIil9Lz5cbiAgICAgIDwvYnV0dG9uPlxuICAgIH0pKX1cbiAgPC9ib3g+XG59XG4iLCAiaW1wb3J0IHsgQXN0YWwsIEd0aywgR2RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IE5vdGlmZCBmcm9tIFwiZ2k6Ly9Bc3RhbE5vdGlmZFwiXG5pbXBvcnQgeyBWYXJpYWJsZSwgYmluZCwgdGltZW91dCB9IGZyb20gXCJhc3RhbFwiXG5cbmNvbnN0IHsgU1RBUlQsIENFTlRFUiwgRU5EIH0gPSBHdGsuQWxpZ25cblxuXG5jb25zdCBnZXRVcmdlbmN5ID0gKG4pID0+IHtcbiAgICBjb25zdCB7IExPVywgTk9STUFMLCBDUklUSUNBTCB9ID0gTm90aWZkLlVyZ2VuY3lcbiAgICBzd2l0Y2ggKG4udXJnZW5jeSkge1xuICAgICAgICBjYXNlIExPVzogcmV0dXJuIFwibG93XCJcbiAgICAgICAgY2FzZSBDUklUSUNBTDogcmV0dXJuIFwiY3JpdGljYWxcIlxuICAgICAgICBjYXNlIE5PUk1BTDpcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIFwibm9ybWFsXCJcbiAgICB9XG59XG5cbmZ1bmN0aW9uIE5vdGlmKG5vdGlmKSB7XG4gIHJldHVybiA8ZXZlbnRib3hcbiAgICBjbGFzc05hbWU9e2dldFVyZ2VuY3kobm90aWYpfVxuICAgIG9uQ2xpY2s9eygpID0+IG5vdGlmLmRpc21pc3MoKX1cbiAgPlxuICAgIDxib3ggdmVydGljYWw+XG4gICAgICA8Ym94PlxuICAgICAgICB7KChub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSkgJiYgPGljb25cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiXG4gICAgICAgICAgdmlzaWJsZT17Qm9vbGVhbihub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSl9XG4gICAgICAgICAgaWNvbj17bm90aWYuYXBwSWNvbiB8fCBub3RpZi5kZXNrdG9wRW50cnl9XG4gICAgICAgIC8+KSB8fCAobm90aWYuaW1hZ2UgJiYgZmlsZUV4aXN0cyhub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIHZhbGlnbj17U1RBUlR9XG4gICAgICAgICAgY2xhc3NOYW1lPVwiaW1hZ2VcIlxuICAgICAgICAgIGNzcz17YGJhY2tncm91bmQtaW1hZ2U6IHVybCgnJHtub3RpZi5pbWFnZX0nKWB9XG4gICAgICAgIC8+KSB8fCAoKG5vdGlmLmltYWdlICYmIGlzSWNvbihub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIGV4cGFuZD17ZmFsc2V9XG4gICAgICAgICAgdmFsaWduPXtTVEFSVH1cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiPlxuICAgICAgICAgIDxpY29uIGljb249e25vdGlmLmltYWdlfSBleHBhbmQgaGFsaWduPXtDRU5URVJ9IHZhbGlnbj17Q0VOVEVSfSAvPlxuICAgICAgICA8L2JveD4pKX1cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJtYWluXCIgdmVydGljYWw+XG4gICAgICAgICAgPGJveCBjbGFzc05hbWU9XCJoZWFkZXJcIj5cbiAgICAgICAgICAgIDxsYWJlbFxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJzdW1tYXJ5XCJcbiAgICAgICAgICAgICAgaGFsaWduPXtTVEFSVH1cbiAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICBsYWJlbD17bm90aWYuc3VtbWFyeX1cbiAgICAgICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICAgICAgaGV4cGFuZFxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxidXR0b24gb25DbGlja2VkPXsoKSA9PiBub3RpZi5kaXNtaXNzKCl9PlxuICAgICAgICAgICAgICA8aWNvbiBpY29uPVwid2luZG93LWNsb3NlLXN5bWJvbGljXCIgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDxib3ggY2xhc3NOYW1lPVwiY29udGVudFwiPlxuICAgICAgICAgICAgPGJveCB2ZXJ0aWNhbD5cbiAgICAgICAgICAgICAge25vdGlmLmJvZHkgJiYgPGxhYmVsXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYm9keVwiXG4gICAgICAgICAgICAgICAgd3JhcFxuICAgICAgICAgICAgICAgIHVzZU1hcmt1cFxuICAgICAgICAgICAgICAgIGhhbGlnbj17U1RBUlR9XG4gICAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICAgIGp1c3RpZnlGaWxsXG4gICAgICAgICAgICAgICAgbGFiZWw9e25vdGlmLmJvZHl9XG4gICAgICAgICAgICAgIC8+fVxuICAgICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgIDwvYm94PlxuICAgICAgPC9ib3g+XG4gICAgICA8Ym94PlxuICAgICAgICB7bm90aWYuZ2V0X2FjdGlvbnMoKS5sZW5ndGggPiAwICYmIDxib3ggY2xhc3NOYW1lPVwiYWN0aW9uc1wiPlxuICAgICAgICAgIHtub3RpZi5nZXRfYWN0aW9ucygpLm1hcCgoeyBsYWJlbCwgaWQgfSkgPT4gKFxuICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICBoZXhwYW5kXG4gICAgICAgICAgICAgIG9uQ2xpY2tlZD17KCkgPT4gbm90aWYuaW52b2tlKGlkKX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgPGxhYmVsIGxhYmVsPXtsYWJlbH0gaGFsaWduPXtDRU5URVJ9IGhleHBhbmQgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICkpfVxuICAgICAgICA8L2JveD59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9ldmVudGJveD5cbn1cblxuLy8gVGhlIHB1cnBvc2UgaWYgdGhpcyBjbGFzcyBpcyB0byByZXBsYWNlIFZhcmlhYmxlPEFycmF5PFdpZGdldD4+XG4vLyB3aXRoIGEgTWFwPG51bWJlciwgV2lkZ2V0PiB0eXBlIGluIG9yZGVyIHRvIHRyYWNrIG5vdGlmaWNhdGlvbiB3aWRnZXRzXG4vLyBieSB0aGVpciBpZCwgd2hpbGUgbWFraW5nIGl0IGNvbnZpbmllbnRseSBiaW5kYWJsZSBhcyBhbiBhcnJheVxuY2xhc3MgTm90aWZpY2F0aW9uTWFwIHtcbiAgICAvLyB0aGUgdW5kZXJseWluZyBtYXAgdG8ga2VlcCB0cmFjayBvZiBpZCB3aWRnZXQgcGFpcnNcbiAgICBtYXAgPSBuZXcgTWFwKClcblxuICAgIC8vIGl0IG1ha2VzIHNlbnNlIHRvIHVzZSBhIFZhcmlhYmxlIHVuZGVyIHRoZSBob29kIGFuZCB1c2UgaXRzXG4gICAgLy8gcmVhY3Rpdml0eSBpbXBsZW1lbnRhdGlvbiBpbnN0ZWFkIG9mIGtlZXBpbmcgdHJhY2sgb2Ygc3Vic2NyaWJlcnMgb3Vyc2VsdmVzXG4gICAgdmFyID0gVmFyaWFibGUoW10pXG5cbiAgICAvLyBub3RpZnkgc3Vic2NyaWJlcnMgdG8gcmVyZW5kZXIgd2hlbiBzdGF0ZSBjaGFuZ2VzXG4gICAgbm90aWZpeSgpIHtcbiAgICAgICAgdGhpcy52YXIuc2V0KFsuLi50aGlzLm1hcC52YWx1ZXMoKV0ucmV2ZXJzZSgpKVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBub3RpZmQgPSBOb3RpZmQuZ2V0X2RlZmF1bHQoKVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiB1bmNvbW1lbnQgdGhpcyBpZiB5b3Ugd2FudCB0b1xuICAgICAgICAgKiBpZ25vcmUgdGltZW91dCBieSBzZW5kZXJzIGFuZCBlbmZvcmNlIG91ciBvd24gdGltZW91dFxuICAgICAgICAgKiBub3RlIHRoYXQgaWYgdGhlIG5vdGlmaWNhdGlvbiBoYXMgYW55IGFjdGlvbnNcbiAgICAgICAgICogdGhleSBtaWdodCBub3Qgd29yaywgc2luY2UgdGhlIHNlbmRlciBhbHJlYWR5IHRyZWF0cyB0aGVtIGFzIHJlc29sdmVkXG4gICAgICAgICAqL1xuICAgICAgICAvLyBub3RpZmQuaWdub3JlVGltZW91dCA9IHRydWVcblxuICAgICAgICBub3RpZmQuY29ubmVjdChcIm5vdGlmaWVkXCIsIChuLCBpZCkgPT4ge1xuICAgICAgICAgIC8vIHByaW50KHR5cGVvZiBub3RpZmQuZ2V0X25vdGlmaWNhdGlvbihpZCkpXG4gICAgICAgICAgICB0aGlzLnNldChpZCwgTm90aWYobm90aWZkLmdldF9ub3RpZmljYXRpb24oaWQpKSlcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBub3RpZmljYXRpb25zIGNhbiBiZSBjbG9zZWQgYnkgdGhlIG91dHNpZGUgYmVmb3JlXG4gICAgICAgIC8vIGFueSB1c2VyIGlucHV0LCB3aGljaCBoYXZlIHRvIGJlIGhhbmRsZWQgdG9vXG4gICAgICAgIG5vdGlmZC5jb25uZWN0KFwicmVzb2x2ZWRcIiwgKF8sIGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmRlbGV0ZShpZClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICAvLyBpbiBjYXNlIG9mIHJlcGxhY2VjbWVudCBkZXN0cm95IHByZXZpb3VzIHdpZGdldFxuICAgICAgICB0aGlzLm1hcC5nZXQoa2V5KT8uZGVzdHJveSgpXG4gICAgICAgIHRoaXMubWFwLnNldChrZXksIHZhbHVlKVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIGRlbGV0ZShrZXkpIHtcbiAgICAgICAgdGhpcy5tYXAuZ2V0KGtleSk/LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLm1hcC5kZWxldGUoa2V5KVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIC8vIG5lZWRlZCBieSB0aGUgU3Vic2NyaWJhYmxlIGludGVyZmFjZVxuICAgIGdldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFyLmdldCgpXG4gICAgfVxuXG4gICAgLy8gbmVlZGVkIGJ5IHRoZSBTdWJzY3JpYmFibGUgaW50ZXJmYWNlXG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhci5zdWJzY3JpYmUoY2FsbGJhY2spXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBOb3RpZmljYXRpb25zKG1vbml0b3IpIHtcbiAgY29uc3QgeyBUT1AgfSA9IEFzdGFsLldpbmRvd0FuY2hvcjtcblxuICAvLyBjb25zdCBub3RpZmQgPSBOb3RpZmQuZ2V0X2RlZmF1bHQoKTtcblxuICBjb25zdCBub3RpZnMgPSBuZXcgTm90aWZpY2F0aW9uTWFwKCk7XG5cbiAgLy8gbm90aWZkLmNvbm5lY3QoXCJub3RpZmllZFwiLCApXG5cbiAgcmV0dXJuIDx3aW5kb3dcbiAgICBnZGttb25pdG9yPXttb25pdG9yfVxuICAgIG5hbWVzcGFjZT1cImFncy1ub3RpZmRcIlxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGFuY2hvcj17VE9QfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5OT1JNQUx9XG4gICAgY2xhc3NOYW1lPVwiTm90aWZpY2F0aW9uc1wiPlxuICAgIDxib3ggdmVydGljYWw+XG4gICAgICB7YmluZChub3RpZnMpfVxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICJpbXBvcnQgQXBwcyBmcm9tIFwiZ2k6Ly9Bc3RhbEFwcHNcIlxuaW1wb3J0IHsgQXBwLCBBc3RhbCwgR2RrLCBHdGsgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5pbXBvcnQgeyBiaW5kLCBWYXJpYWJsZSwgZXhlY0FzeW5jLCBleGVjIH0gZnJvbSBcImFzdGFsXCJcbmltcG9ydCB7IGdldF9pY29uIH0gZnJvbSBcIi4uL3V0aWwuanNcIjtcblxuY29uc3QgTUFYX0lURU1TID0gOFxuXG5mdW5jdGlvbiBoaWRlKCkge1xuICBBcHAuZ2V0X3dpbmRvdyhcImxhdW5jaGVyXCIpLmhpZGUoKVxufVxuXG5mdW5jdGlvbiBBcHBCdXR0b24oeyBhcHAgfSkge1xuICByZXR1cm4gPGJ1dHRvblxuICAgIGhleHBhbmRcbiAgICBjbGFzc05hbWU9XCJBcHBCdXR0b25cIlxuICAgIG9uQ2xpY2tlZD17KCkgPT4geyBoaWRlKCk7IGFwcC5sYXVuY2goKSB9fT5cbiAgICA8Ym94PlxuICAgICAgPGljb24gaWNvbj17YXBwLmljb25OYW1lfSAvPlxuICAgICAgPGJveCB2YWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9IHZlcnRpY2FsPlxuICAgICAgICA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJuYW1lXCJcbiAgICAgICAgICBlbGxpcHNpemU9ezN9XG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXthcHAubmFtZX1cbiAgICAgICAgLz5cbiAgICAgICAge2FwcC5kZXNjcmlwdGlvbiAmJiA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZXNjcmlwdGlvblwiXG4gICAgICAgICAgZWxsaXBzaXplPXszfVxuICAgICAgICAgIHdyYXBcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2FwcC5kZXNjcmlwdGlvbn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cbmZ1bmN0aW9uIHN0cl9mdXp6eShzdHIsIHMpIHtcbiAgdmFyIGhheSA9IHN0ci50b0xvd2VyQ2FzZSgpLCBpID0gMCwgbiA9IC0xLCBsO1xuICBzID0gcy50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKDsgbCA9IHNbaSsrXTspIGlmICghfihuID0gaGF5LmluZGV4T2YobCwgbiArIDEpKSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IHJlcyA9IFZhcmlhYmxlKFwiLi4uXCIpXG5jb25zdCB3aW5kb3dzID0gVmFyaWFibGUoW10pXG5cbmNvbnN0IHBsdWdpbnMgPSB7XG4gIFwiXFxcXFwiOiB7XG4gICAgXCJpbml0XCI6ICgpID0+IHsgfSxcbiAgICBcInF1ZXJ5XCI6IChfdGV4dCkgPT4gW3tcbiAgICAgIFwibGFiZWxcIjogXCJSZWxvYWRcIixcbiAgICAgIFwic3ViXCI6IFwiUmVmcmVzaCBkZXNrdG9wIGZpbGVzIG9uIHN5c3RlbVwiLFxuICAgICAgXCJpY29uXCI6IFwidmlldy1yZWZyZXNoLXN5bWJvbGljXCIsXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGFwcHMucmVsb2FkKCksXG4gICAgfV1cbiAgfSxcbiAgXCIvXCI6IHtcbiAgICBcImluaXRcIjogKCkgPT4geyB9LFxuICAgIFwicXVlcnlcIjogKHRleHQpID0+IFt7XG4gICAgICBcImxhYmVsXCI6IHRleHQsXG4gICAgICBcInN1YlwiOiBcInJ1blwiLFxuICAgICAgXCJpY29uXCI6IFwidXRpbGl0aWVzLXRlcm1pbmFsXCIsXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJzaFwiLCBcIi1jXCIsIHRleHRdKVxuICAgIH1dXG4gIH0sXG4gIFwiPVwiOiB7XG4gICAgXCJpbml0XCI6ICgpID0+IHsgfSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiB7XG4gICAgICByZXMuc2V0KFwiLi4uXCIpO1xuICAgICAgaWYgKHRleHQubGVuZ3RoID4gMClcbiAgICAgICAgZXhlY0FzeW5jKFtcInFhbGNcIiwgXCItdFwiLCB0ZXh0XSkudGhlbihvdXQgPT4gcmVzLnNldChvdXQpKS5jYXRjaChfID0+IHsgcmVzLnNldChcImVycm9yXCIpIH0pO1xuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIFwibGFiZWxcIjogYmluZChyZXMpLFxuICAgICAgICBcInN1YlwiOiBcIkNhbGN1bGF0ZSB1c2luZyBxYWxjXCIsXG4gICAgICAgIFwiaWNvblwiOiBcImFjY2Vzc29yaWVzLWNhbGN1bGF0b3JcIixcbiAgICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wic2hcIiwgXCItY1wiLCBgZWNobyAke3Jlcy5nZXQoKX0gfCB3bC1jb3B5YF0pXG4gICAgICB9XVxuICAgIH1cbiAgfSxcbiAgXCI7XCI6IHtcbiAgICBcImluaXRcIjogKCkgPT4gd2luZG93cy5zZXQoSlNPTi5wYXJzZShleGVjKFtcImh5cHJjdGxcIiwgXCItalwiLCBcImNsaWVudHNcIl0pKSksXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4gd2luZG93cy5nZXQoKS5tYXAod2luZG93ID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIFwibGFiZWxcIjogd2luZG93W1widGl0bGVcIl0sXG4gICAgICAgIFwic3ViXCI6IGAke3dpbmRvd1tcInh3YXlsYW5kXCJdID8gXCJbWF0gXCIgOiBcIlwifSR7d2luZG93W1wiY2xhc3NcIl19IFske3dpbmRvd1tcInBpZFwiXX1dICR7d2luZG93W1wiZnVsbHNjcmVlblwiXSA/IFwiKGZ1bGxzY3JlZW4pIFwiIDogd2luZG93W1wiZmxvYXRpbmdcIl0gPyBcIihmbG9hdGluZykgXCIgOiBcIlwifW9uICR7d2luZG93W1wid29ya3NwYWNlXCJdW1wiaWRcIl19YCxcbiAgICAgICAgXCJpY29uXCI6IGdldF9pY29uKHdpbmRvd1tcImluaXRpYWxDbGFzc1wiXSksXG4gICAgICAgIFwiYWN0aXZhdGVcIjogKCkgPT4gZXhlY0FzeW5jKFtcImh5cHJjdGxcIiwgXCJkaXNwYXRjaFwiLCBcImZvY3Vzd2luZG93XCIsIGBhZGRyZXNzOiR7d2luZG93W1wiYWRkcmVzc1wiXX1gXSksXG4gICAgICB9XG4gICAgfSkuZmlsdGVyKHcgPT4gc3RyX2Z1enp5KHdbXCJsYWJlbFwiXSwgdGV4dCkgfHwgc3RyX2Z1enp5KHdbXCJzdWJcIl0sIHRleHQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIFBsdWdpbkJ1dHRvbih7IGl0ZW0gfSkge1xuICByZXR1cm4gPGJ1dHRvblxuICAgIGhleHBhbmRcbiAgICBvbkNsaWNrZWQ9eygpID0+IHsgaGlkZSgpOyBpdGVtLmFjdGl2YXRlKCkgfX0+XG4gICAgPGJveD5cbiAgICAgIDxpY29uIGljb249e2l0ZW0uaWNvbn0gLz5cbiAgICAgIDxib3ggdmFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfSB2ZXJ0aWNhbD5cbiAgICAgICAgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwibmFtZVwiXG4gICAgICAgICAgZWxsaXBzaXplPXszfVxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17aXRlbS5sYWJlbH1cbiAgICAgICAgLz5cbiAgICAgICAge2l0ZW0uc3ViICYmIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cImRlc2NyaXB0aW9uXCJcbiAgICAgICAgICBlbGxpcHNpemU9ezN9XG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXtpdGVtLnN1Yn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cblxuY29uc3QgYXBwcyA9IG5ldyBBcHBzLkFwcHMoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBcHBsYXVuY2hlcigpIHtcbiAgY29uc3QgeyBDRU5URVIgfSA9IEd0ay5BbGlnblxuXG4gIGNvbnN0IHRleHQgPSBWYXJpYWJsZShcIlwiKVxuICBjb25zdCBsaXN0ID0gdGV4dCh0ZXh0ID0+IHtcbiAgICBsZXQgcCA9IHBsdWdpbnNbdGV4dC5zdWJzdHJpbmcoMCwgMSldXG4gICAgaWYgKHApIHtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKVxuICAgICAgICBwLmluaXQoKVxuICAgICAgcmV0dXJuIHAucXVlcnkodGV4dC5zdWJzdHJpbmcoMSwgdGV4dC5sZW5ndGgpKS5zbGljZSgwLCBNQVhfSVRFTVMpXG4gICAgfVxuXG4gICAgcmV0dXJuIGFwcHMuZnV6enlfcXVlcnkodGV4dCkuc2xpY2UoMCwgTUFYX0lURU1TKVxuICB9KVxuXG4gIGNvbnN0IG9uRW50ZXIgPSAoKSA9PiB7XG4gICAgbGlzdF9ib3guY2hpbGRyZW5bMF0uY2xpY2tlZCgpXG4gICAgaGlkZSgpXG4gIH1cblxuICBjb25zdCBlbnRyeSA9ICg8ZW50cnlcbiAgICBwbGFjZWhvbGRlclRleHQ9XCJTZWFyY2hcIlxuICAgIHdpZHRoUmVxdWVzdD17NDAwfVxuICAgIHRleHQ9e3RleHQoKX1cbiAgICBvbkNoYW5nZWQ9e3NlbGYgPT4gdGV4dC5zZXQoc2VsZi50ZXh0KX1cbiAgICBvbkFjdGl2YXRlPXtvbkVudGVyfVxuICAgIGhlaWdodFJlcXVlc3Q9ezUwfVxuICAvPilcblxuICBjb25zdCBsaXN0X2JveCA9IChcbiAgICA8Ym94IHNwYWNpbmc9ezZ9IHZlcnRpY2FsIGNsYXNzTmFtZT1cImxpc3Rib3hcIj5cbiAgICAgIHtsaXN0LmFzKGxpc3QgPT4gbGlzdC5tYXAoaXRlbSA9PiB7XG4gICAgICAgIGlmIChpdGVtLmFwcClcbiAgICAgICAgICByZXR1cm4gPEFwcEJ1dHRvbiBhcHA9e2l0ZW19IC8+XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gPFBsdWdpbkJ1dHRvbiBpdGVtPXtpdGVtfSAvPlxuICAgICAgfSkpfVxuICAgIDwvYm94PilcblxuICByZXR1cm4gPHdpbmRvd1xuICAgIG5hbWU9XCJsYXVuY2hlclwiXG4gICAgbmFtZXNwYWNlPVwiYWdzLWxhdW5jaGVyXCJcbiAgICBsYXllcj17QXN0YWwuTGF5ZXIuT1ZFUkxBWX1cbiAgICBhbmNob3I9e0FzdGFsLldpbmRvd0FuY2hvci5UT1AgfCBBc3RhbC5XaW5kb3dBbmNob3IuQk9UVE9NfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5JR05PUkV9XG4gICAga2V5bW9kZT17QXN0YWwuS2V5bW9kZS5PTl9ERU1BTkR9XG4gICAgYXBwbGljYXRpb249e0FwcH1cbiAgICB2aXNpYmxlPXtmYWxzZX1cbiAgICBvblNob3c9eygpID0+IHsgdGV4dC5zZXQoXCJcIik7IGVudHJ5LmdyYWJfZm9jdXNfd2l0aG91dF9zZWxlY3RpbmcoKSB9fVxuICAgIG9uS2V5UHJlc3NFdmVudD17ZnVuY3Rpb24oc2VsZiwgZXZlbnQpIHtcbiAgICAgIGlmIChldmVudC5nZXRfa2V5dmFsKClbMV0gPT09IEdkay5LRVlfRXNjYXBlKVxuICAgICAgICBzZWxmLmhpZGUoKVxuICAgICAgLy8gZWxzZSBpZiAoZXZlbnQuZ2V0X3N0YXRlKClbMV0gPT09IEdkay5Nb2RpZmllclR5cGUuTU9EMV9NQVNLKSB7XG4gICAgICAvLyAgIGxldCBpZHggPSAtMTtcbiAgICAgIC8vICAgc3dpdGNoIChldmVudC5nZXRfa2V5dmFsKClbMV0pIHtcbiAgICAgIC8vICAgICBjYXNlIEdkay5LRVlfYTpcbiAgICAgIC8vICAgICAgIGNvbnNvbGUubG9nKFwiYXNkc2FrZlwiKVxuICAgICAgLy8gICAgICAgaWR4ID0gMDtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9zOlxuICAgICAgLy8gICAgICAgaWR4ID0gMTtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9kOlxuICAgICAgLy8gICAgICAgaWR4ID0gMjtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9mOlxuICAgICAgLy8gICAgICAgaWR4ID0gMztcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9oOlxuICAgICAgLy8gICAgICAgaWR4ID0gNDtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9qOlxuICAgICAgLy8gICAgICAgaWR4ID0gNTtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9rOlxuICAgICAgLy8gICAgICAgaWR4ID0gNjtcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9sOlxuICAgICAgLy8gICAgICAgaWR4ID0gNztcbiAgICAgIC8vICAgICAgIGJyZWFrO1xuICAgICAgLy8gICB9XG4gICAgICAvLyAgIGlmIChpZHggPj0gMCkge1xuICAgICAgLy8gICAgIHNlbGYuZ2V0X2NoaWxkKCkuY2hpbGRyZW5bMV0uY2hpbGRyZW5bMV0uY2hpbGRyZW5bMV0uY2hpbGRyZW5baWR4XS5jbGlja2VkKClcbiAgICAgIC8vICAgICBzZWxmLmhpZGUoKVxuICAgICAgLy8gICB9XG4gICAgICAvLyB9XG4gICAgfX0+XG4gICAgPGJveD5cbiAgICAgIDxldmVudGJveCB3aWR0aFJlcXVlc3Q9ezIwMDB9IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgICAgPGJveCBoZXhwYW5kPXtmYWxzZX0gdmVydGljYWw+XG4gICAgICAgIDxldmVudGJveCBoZWlnaHRSZXF1ZXN0PXsyMDB9IG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICAgIDxib3ggd2lkdGhSZXF1ZXN0PXs5MDB9IGhlaWdodFJlcXVlc3Q9ezQxMH0gY2xhc3NOYW1lPVwibWFpblwiID5cbiAgICAgICAgICA8Ym94XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJlbnRyeWJveFwiXG4gICAgICAgICAgICB2ZXJ0aWNhbD5cbiAgICAgICAgICAgIHtlbnRyeX1cbiAgICAgICAgICAgIDxib3ggLz5cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgICB7bGlzdF9ib3h9XG4gICAgICAgICAgPGJveFxuICAgICAgICAgICAgaGFsaWduPXtDRU5URVJ9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJub3QtZm91bmRcIlxuICAgICAgICAgICAgdmVydGljYWxcbiAgICAgICAgICAgIHZpc2libGU9e2xpc3QuYXMobCA9PiBsLmxlbmd0aCA9PT0gMCl9PlxuICAgICAgICAgICAgPGljb24gaWNvbj1cInN5c3RlbS1zZWFyY2gtc3ltYm9saWNcIiAvPlxuICAgICAgICAgICAgPGxhYmVsIGxhYmVsPVwiTm8gbWF0Y2ggZm91bmRcIiAvPlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICA8L2JveD5cbiAgICAgICAgPGV2ZW50Ym94IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgICAgPC9ib3g+XG4gICAgICA8ZXZlbnRib3ggd2lkdGhSZXF1ZXN0PXsyMDAwfSBleHBhbmQgb25DbGljaz17aGlkZX0gLz5cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCB7IEFzdGFsIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IHsgYmluZCwgVmFyaWFibGUsIGV4ZWMsIG1vbml0b3JGaWxlLCByZWFkRmlsZSwgdGltZW91dCB9IGZyb20gXCJhc3RhbFwiXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE9zZChtb25pdG9yKSB7XG4gIGNvbnN0IFNIT1dfVElNRSA9IDE1MDA7XG4gIGNvbnN0IGF1ZGlvID0gV3AuZ2V0X2RlZmF1bHQoKS5hdWRpby5kZWZhdWx0U3BlYWtlcjtcbiAgY29uc3QgZGF0YSA9IFZhcmlhYmxlKDApO1xuICBjb25zdCBpY29uID0gVmFyaWFibGUoXCJcIik7XG4gIGNvbnN0IHNob3cgPSBWYXJpYWJsZSh0cnVlKTtcbiAgY29uc3QgYnJpZ2h0bmVzc19tYXggPSBleGVjKFwiYnJpZ2h0bmVzc2N0bCBtYXhcIik7XG4gIGxldCB0aW1lcjtcbiAgbW9uaXRvckZpbGUoYC9zeXMvY2xhc3MvYmFja2xpZ2h0LyR7ZXhlYyhcInNoIC1jICdscyAtdzEgL3N5cy9jbGFzcy9iYWNrbGlnaHR8aGVhZCAtMSdcIil9L2JyaWdodG5lc3NgLCAoZmlsZSwgZXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQgPT0gMSkge1xuICAgICAgZGF0YS5zZXQocGFyc2VJbnQocmVhZEZpbGUoZmlsZSkpIC8gYnJpZ2h0bmVzc19tYXgpO1xuICAgICAgaWNvbi5zZXQoXCJkaXNwbGF5LWJyaWdodG5lc3Mtc3ltYm9saWNcIilcbiAgICAgIHRpbWVyPy5jYW5jZWwoKVxuICAgICAgc2hvdy5zZXQodHJ1ZSk7XG4gICAgICB0aW1lciA9IHRpbWVvdXQoU0hPV19USU1FLCAoKSA9PiBzaG93LnNldChmYWxzZSkpO1xuICAgIH1cbiAgfSlcblxuICBjb25zdCBzcF9pY28gPSBiaW5kKGF1ZGlvLCBcInZvbHVtZUljb25cIilcbiAgc3BfaWNvLnN1YnNjcmliZShpID0+IHtcbiAgICBpY29uLnNldChpKTtcbiAgICBkYXRhLnNldChhdWRpby52b2x1bWUpO1xuICAgIHRpbWVyPy5jYW5jZWwoKVxuICAgIHNob3cuc2V0KHRydWUpO1xuICAgIHRpbWVyID0gdGltZW91dChTSE9XX1RJTUUsICgpID0+IHNob3cuc2V0KGZhbHNlKSk7XG4gIH0pXG4gIHJldHVybiA8d2luZG93XG4gICAgbW9uaXRvcj17bW9uaXRvcn1cbiAgICBsYXllcj17QXN0YWwuTGF5ZXIuT1ZFUkxBWX1cbiAgICBleGNsdXNpdml0eT17QXN0YWwuRXhjbHVzaXZpdHkuSUdOT1JFfVxuICAgIGFuY2hvcj17QXN0YWwuV2luZG93QW5jaG9yLkJPVFRPTX1cbiAgICBtYXJnaW4tYm90dG9tPXsyMDB9XG4gICAgY2xhc3NOYW1lPVwiT3NkXCJcbiAgICBuYW1lc3BhY2U9XCJhZ3Mtb3NkXCJcbiAgPlxuICAgIDxib3ggdmlzaWJsZT17YmluZChzaG93KX0+XG4gICAgICA8aWNvbiBpY29uPXtiaW5kKGljb24pfSAvPlxuICAgICAgPGxldmVsYmFyIG1heC12YWx1ZT1cIjEuMDhcIiB2YWx1ZT17YmluZChkYXRhKS5hcyhkPT5kKzAuMDgpfSB3aWR0aFJlcXVlc3Q9ezE1MH0gLz5cbiAgICAgIDxsYWJlbCBsYWJlbD17YmluZChkYXRhKS5hcyh2ID0+IGAke01hdGgucm91bmQodiAqIDEwMCl9JWApfSAvPlxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICIjIS91c3IvYmluL2dqcyAtbVxuaW1wb3J0IHsgQXBwIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBzdHlsZSBmcm9tIFwiLi9zdHlsZS5zY3NzXCI7XG5pbXBvcnQgQmFyIGZyb20gXCIuL3dpZGdldC9CYXJcIjtcbmltcG9ydCBOb3RpZmljYXRpb25zIGZyb20gXCIuL3dpZGdldC9Ob3RpZmljYXRpb25zXCI7XG5pbXBvcnQgTGF1bmNoZXIgZnJvbSBcIi4vd2lkZ2V0L0xhdW5jaGVyXCI7XG5pbXBvcnQgT3NkIGZyb20gXCIuL3dpZGdldC9Pc2RcIjtcbmltcG9ydCBCYWNrZ3JvdW5kIGZyb20gXCIuL3dpZGdldC9CYWNrZ3JvdW5kXCI7XG5cbkFwcC5zdGFydCh7XG4gIGNzczogc3R5bGUsXG4gIGluc3RhbmNlTmFtZTogXCJzaGVsbFwiLFxuICByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0LCByZXMpIHtcbiAgICBpZiAocmVxdWVzdCA9PSBcImxhdW5jaGVyXCIpIHtcbiAgICAgIEFwcC5nZXRfd2luZG93KFwibGF1bmNoZXJcIikuc2hvdygpXG4gICAgICByZXMoXCJva1wiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJpbnQoXCJ1bmtub3duIHJlcXVlc3Q6XCIsIHJlcXVlc3QpO1xuICAgICAgcmVzKFwidW5rbm93biByZXF1ZXN0XCIpO1xuICAgIH1cbiAgfSxcbiAgbWFpbjogKCkgPT4gQXBwLmdldF9tb25pdG9ycygpLmZvckVhY2goKG0pID0+IHtcbiAgICBCYXIobSk7XG4gICAgTm90aWZpY2F0aW9ucyhtKTtcbiAgICBMYXVuY2hlcihtKTtcbiAgICBPc2QobSk7XG4gICAgLy8gQmFja2dyb3VuZChtKTtcbiAgfSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQUFBLE9BQU9BLFlBQVc7QUFDbEIsT0FBT0MsVUFBUztBQUNoQixPQUFPLFNBQVM7OztBQ0ZoQixPQUFPQyxZQUFXO0FBQ2xCLE9BQU8sU0FBUztBQUVoQixPQUFPLGFBQWE7OztBQ0hwQixPQUFPLFdBQVc7QUFRWCxJQUFNLEVBQUUsUUFBUSxJQUFJO0FBVXBCLFNBQVMsV0FDWixXQUNBLFFBQWtDLE9BQ2xDLFFBQWtDLFVBQ3BDO0FBQ0UsUUFBTSxPQUFPLE1BQU0sUUFBUSxTQUFTLEtBQUssT0FBTyxjQUFjO0FBQzlELFFBQU0sRUFBRSxLQUFLLEtBQUssSUFBSSxJQUFJO0FBQUEsSUFDdEIsS0FBSyxPQUFPLFlBQVksVUFBVTtBQUFBLElBQ2xDLEtBQUssT0FBTyxRQUFRLFVBQVUsT0FBTztBQUFBLElBQ3JDLEtBQUssT0FBTyxRQUFRLFVBQVUsT0FBTztBQUFBLEVBQ3pDO0FBRUEsUUFBTSxPQUFPLE1BQU0sUUFBUSxHQUFHLElBQ3hCLE1BQU0sUUFBUSxZQUFZLEdBQUcsSUFDN0IsTUFBTSxRQUFRLFdBQVcsR0FBRztBQUVsQyxPQUFLLFFBQVEsVUFBVSxDQUFDLEdBQUcsV0FBbUIsSUFBSSxNQUFNLENBQUM7QUFDekQsT0FBSyxRQUFRLFVBQVUsQ0FBQyxHQUFHLFdBQW1CLElBQUksTUFBTSxDQUFDO0FBQ3pELFNBQU87QUFDWDtBQUdPLFNBQVMsS0FBSyxLQUF3QjtBQUN6QyxTQUFPLE1BQU0sUUFBUSxHQUFHLElBQ2xCLE1BQU0sUUFBUSxNQUFNLEdBQUcsSUFDdkIsTUFBTSxRQUFRLEtBQUss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QUksV0FBVyxZQUFZO0FBQ3pCLGtCQUFJLFdBQVcsVUFBVSxFQUFFLEtBQUs7QUFDaEMsTUFBQUEsS0FBSSxJQUFJO0FBQUEsSUFDVixPQUFPO0FBQ0wsWUFBTSxvQkFBb0IsT0FBTztBQUNqQyxNQUFBQSxLQUFJLGlCQUFpQjtBQUFBLElBQ3ZCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTSxNQUFNLFlBQUksYUFBYSxFQUFFLFFBQVEsQ0FBQyxNQUFNO0FBQzVDLFFBQUksQ0FBQztBQUNMLGtCQUFjLENBQUM7QUFDZixnQkFBUyxDQUFDO0FBQ1YsUUFBSSxDQUFDO0FBQUEsRUFFUCxDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgInJlcyIsICJBc3RhbCIsICJiaW5kIiwgIkFzdGFsIiwgImludGVydmFsIiwgInRpbWVvdXQiLCAiQXN0YWwiLCAidiIsICJpbnRlcnZhbCIsICJleGVjIiwgIkFzdGFsIiwgIkd0ayIsICJBc3RhbCIsICJzbmFrZWlmeSIsICJwYXRjaCIsICJBcHBzIiwgIkh5cHJsYW5kIiwgIk5vdGlmZCIsICJHT2JqZWN0IiwgInJlcyIsICJHdGsiLCAiQXN0YWwiLCAiQXN0YWwiLCAiR3RrIiwgIkdPYmplY3QiLCAiQXN0YWwiLCAiR09iamVjdCIsICJHdGsiLCAiZGVmYXVsdCIsICJBc3RhbCIsICJBc3RhbCIsICJBc3RhbCIsICJHT2JqZWN0IiwgImRlZmF1bHQiLCAiR09iamVjdCIsICJBc3RhbCIsICJHdGsiLCAiQXN0YWwiLCAiR3RrIiwgImRlZmF1bHQiLCAid2lmaSIsICJHdGsiLCAiQXN0YWwiLCAiR3RrIiwgIkd0ayIsICJDRU5URVIiLCAidGV4dCIsICJsaXN0IiwgIkFzdGFsIiwgIldwIiwgIldwIiwgIkFzdGFsIiwgInJlcyJdCn0K
