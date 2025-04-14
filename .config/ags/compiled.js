#!/usr/bin/gjs -m

// ../../../../../usr/share/astal/gjs/gtk3/index.ts
import Astal7 from "gi://Astal?version=3.0";
import Gtk4 from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";

// ../../../../../usr/share/astal/gjs/gtk3/astalify.ts
import Astal4 from "gi://Astal?version=3.0";
import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";

// ../../../../../usr/share/astal/gjs/process.ts
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

// ../../../../../usr/share/astal/gjs/variable.ts
import Astal3 from "gi://AstalIO";

// ../../../../../usr/share/astal/gjs/binding.ts
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

// ../../../../../usr/share/astal/gjs/time.ts
import Astal2 from "gi://AstalIO";
var { Time } = Astal2;
function interval(interval2, callback) {
  return Astal2.Time.interval(interval2, () => void callback?.());
}
function timeout(timeout2, callback) {
  return Astal2.Time.timeout(timeout2, () => void callback?.());
}

// ../../../../../usr/share/astal/gjs/variable.ts
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

// ../../../../../usr/share/astal/gjs/gtk3/astalify.ts
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

// ../../../../../usr/share/astal/gjs/gtk3/app.ts
import Gtk2 from "gi://Gtk?version=3.0";
import Astal5 from "gi://Astal?version=3.0";

// ../../../../../usr/share/astal/gjs/overrides.ts
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

// ../../../../../usr/share/astal/gjs/_app.ts
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

// ../../../../../usr/share/astal/gjs/gtk3/app.ts
Gtk2.init(null);
var app_default = mkApp(Astal5.Application);

// ../../../../../usr/share/astal/gjs/gtk3/widget.ts
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

// sass:/home/marcel/.config/ags/horizontal/style.scss
var style_default = "* {\n  color: #f1f1f1;\n  font-size: 16px;\n}\n\n.Bar {\n  background: #212223;\n}\n.Bar icon {\n  font-size: 20px;\n  margin-right: 5px;\n}\n.Bar .icon {\n  font-size: 22px;\n  margin-right: 5px;\n  /* margin-bottom: 2px; */\n}\n.Bar .status {\n  margin: 0 8px;\n}\n\n.battery.charging {\n  /* label {\n    color: $accent;\n  } */\n}\n.battery.charging .icon {\n  color: #2B82D3;\n  margin-right: 10px;\n}\n\nbutton {\n  background: transparent;\n  border: none;\n  padding: 0;\n  border-radius: 0;\n}\n\nicon {\n  font-size: 25px;\n}\n\n.workspaces icon {\n  margin-top: 2px;\n  margin-left: 5px;\n}\n.workspaces button {\n  padding-right: 4px;\n  padding-top: 3px;\n  border-bottom: 3px solid #212223;\n  font-weight: normal;\n}\n.workspaces button label {\n  margin-left: 8px;\n  margin-right: 4px;\n}\n.workspaces button.exist {\n  border-bottom: 3px solid #414243;\n}\n.workspaces button.focused {\n  /* background: $accent; */\n  background: #414243;\n  border-bottom: 3px solid #2B82D3;\n}\n\n.Notifications eventbox button {\n  background: #414243;\n  border-radius: 12px;\n  margin: 0 2px;\n}\n.Notifications eventbox > box {\n  margin: 4px;\n  background: #212223;\n  padding: 4px 2px;\n  min-width: 300px;\n  border-radius: 16px;\n  border: 2px solid red;\n}\n.Notifications eventbox .image {\n  min-height: 48px;\n  min-width: 48px;\n  font-size: 48px;\n  margin: 8px;\n}\n.Notifications eventbox .main {\n  padding-left: 4px;\n  margin-bottom: 2px;\n}\n.Notifications eventbox .main .header .summary {\n  font-size: 1.2em;\n  font-weight: bold;\n}\n.Notifications eventbox.critical > box {\n  border-color: #2B82D3;\n}\n\n.clock .icon {\n  margin-right: 5px;\n  color: #2B82D3;\n}\n\n.tray {\n  margin-right: 2px;\n}\n.tray icon {\n  font-size: 18px;\n  margin: 0 4px;\n}\n\n#launcher {\n  background: none;\n}\n#launcher .main {\n  padding: 4px;\n  background: #212223;\n  border-radius: 16px;\n}\n#launcher .main icon {\n  margin: 0 4px;\n}\n#launcher .main .description {\n  color: #bbb;\n  font-size: 0.8em;\n}\n#launcher .main button:hover,\n#launcher .main button:focus {\n  border: 2px solid #2B82D3;\n}\n#launcher .main button {\n  border: 2px solid #414243;\n}\n#launcher .main button,\n#launcher .main entry {\n  border-radius: 12px;\n  background: #414243;\n  outline: none;\n}\n#launcher .main entry {\n  padding: 2px 10px;\n  margin-bottom: 8px;\n  border: none;\n  min-height: 24px;\n  font-size: 1.3rem;\n}\n\n.Osd box {\n  background: #212223;\n  border-radius: 24px;\n  padding: 10px 12px;\n}\n.Osd box trough {\n  padding: 0;\n  margin: 8px;\n  border-radius: 5px;\n}\n.Osd box trough block {\n  border-radius: 5px;\n  border: none;\n}\n.Osd box trough block.filled {\n  background: white;\n}\n.Osd box label {\n  min-width: 40px;\n}";

// ../../../../../usr/share/astal/gjs/index.ts
import { default as default3 } from "gi://AstalIO?version=0.1";

// ../../../../../usr/share/astal/gjs/file.ts
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

// ../../../../../usr/share/astal/gjs/gobject.ts
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

// ../../../../../usr/share/astal/gjs/gtk3/jsx-runtime.ts
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
  return /* @__PURE__ */ jsxs("box", { className: "workspaces", orientation, children: [
    bind(hypr, "workspaces").as((workspaces) => {
      const filtered = workspaces.filter((ws) => !(ws.id >= -99 && ws.id <= -2)).sort((a, b) => a.id - b.id);
      if (filtered.find((w) => w.id === 1) === void 0)
        filtered.splice(0, 0, { "id": 1, "name": 1, "static": true });
      if (filtered.find((w) => w.id === 2) === void 0)
        filtered.splice(1, 0, { "id": 2, "name": 2, "static": true });
      if (filtered.find((w) => w.id === 3) === void 0)
        filtered.splice(2, 0, { "id": 3, "name": 3, "static": true });
      if (filtered.find((w) => w.id === 4) === void 0)
        filtered.splice(3, 0, { "id": 4, "name": 4, "static": true });
      if (filtered.find((w) => w.id === 5) === void 0)
        filtered.splice(4, 0, { "id": 5, "name": 5, "static": true });
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
  print("aaa");
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
          /* @__PURE__ */ jsxs(
            "box",
            {
              className: "network status",
              halign: Gtk4.Align.CENTER,
              hexpand: true,
              children: [
                wifi.as(
                  (wifi2) => wifi2 && /* @__PURE__ */ jsx(
                    "icon",
                    {
                      tooltipText: bind(wifi2, "ssid").as(String),
                      icon: bind(wifi2, "iconName")
                    }
                  )
                ),
                wifi.as(
                  (wifi2) => wifi2 && /* @__PURE__ */ jsx("label", { label: bind(wifi2, "ssid") })
                )
              ]
            }
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
              truncate: true,
              xalign: 0,
              label: app.name
            }
          ),
          app.description && /* @__PURE__ */ jsx(
            "label",
            {
              className: "description",
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
    "query": (text) => [{
      "label": "Reload",
      "sub": "Refresh desktop files on system",
      "icon": "view-refresh-symbolic",
      "activate": () => apps.reload
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
              truncate: true,
              xalign: 0,
              label: item.label
            }
          ),
          item.sub && /* @__PURE__ */ jsx(
            "label",
            {
              className: "description",
              truncate: true,
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
      return p.query(text2.substring(1, text2.length));
    }
    return apps.fuzzy_query(text2).slice(0, MAX_ITEMS);
  });
  const onEnter = (inputbox) => {
    inputbox.get_parent().children[1].children[0].clicked();
    hide();
  };
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
      onShow: (self) => {
        text.set("");
        self.get_child().children[1].children[1].children[0].grab_focus_without_selecting();
      },
      onKeyPressEvent: function(self, event) {
        if (event.get_keyval()[1] === Gdk.KEY_Escape)
          self.hide();
      },
      children: /* @__PURE__ */ jsxs("box", { children: [
        /* @__PURE__ */ jsx("eventbox", { widthRequest: 2e3, expand: true, onClick: hide }),
        /* @__PURE__ */ jsxs("box", { hexpand: false, vertical: true, children: [
          /* @__PURE__ */ jsx("eventbox", { heightRequest: 200, onClick: hide }),
          /* @__PURE__ */ jsxs("box", { widthRequest: 500, className: "main", vertical: true, children: [
            /* @__PURE__ */ jsx(
              "entry",
              {
                placeholderText: "Search",
                text: text(),
                onChanged: (self) => text.set(self.text),
                onActivate: onEnter
              }
            ),
            /* @__PURE__ */ jsx("box", { spacing: 6, vertical: true, children: list.as((list2) => list2.map((item) => {
              if (item.app)
                return /* @__PURE__ */ jsx(AppButton, { app: item });
              else
                return /* @__PURE__ */ jsx(PluginButton, { item });
            })) }),
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
      namespace: "ags-launcher",
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9ndGszL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hc3RhbGlmeS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL3Byb2Nlc3MudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy92YXJpYWJsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2JpbmRpbmcudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy90aW1lLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hcHAudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9vdmVycmlkZXMudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9fYXBwLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy93aWRnZXQudHMiLCAic2FzczovaG9tZS9tYXJjZWwvLmNvbmZpZy9hZ3MvaG9yaXpvbnRhbC9zdHlsZS5zY3NzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvaW5kZXgudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9maWxlLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ29iamVjdC50cyIsICJob3Jpem9udGFsL3dpZGdldC9CYXIuanN4IiwgImhvcml6b250YWwvd2lkZ2V0L3dvcmtzcGFjZXMuanN4IiwgImhvcml6b250YWwvdXRpbC5qcyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2d0azMvanN4LXJ1bnRpbWUudHMiLCAiaG9yaXpvbnRhbC93aWRnZXQvdHJheS5qc3giLCAiaG9yaXpvbnRhbC93aWRnZXQvTm90aWZpY2F0aW9ucy5qc3giLCAiaG9yaXpvbnRhbC93aWRnZXQvTGF1bmNoZXIuanN4IiwgImhvcml6b250YWwvd2lkZ2V0L09zZC5qc3giLCAiaG9yaXpvbnRhbC9hcHAuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR2RrIGZyb20gXCJnaTovL0dkaz92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgYXN0YWxpZnksIHsgdHlwZSBDb25zdHJ1Y3RQcm9wcywgdHlwZSBCaW5kYWJsZVByb3BzIH0gZnJvbSBcIi4vYXN0YWxpZnkuanNcIlxuXG5leHBvcnQgeyBBc3RhbCwgR3RrLCBHZGsgfVxuZXhwb3J0IHsgZGVmYXVsdCBhcyBBcHAgfSBmcm9tIFwiLi9hcHAuanNcIlxuZXhwb3J0IHsgYXN0YWxpZnksIENvbnN0cnVjdFByb3BzLCBCaW5kYWJsZVByb3BzIH1cbmV4cG9ydCAqIGFzIFdpZGdldCBmcm9tIFwiLi93aWRnZXQuanNcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR2RrIGZyb20gXCJnaTovL0dkaz92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR09iamVjdCBmcm9tIFwiZ2k6Ly9HT2JqZWN0XCJcbmltcG9ydCB7IGV4ZWNBc3luYyB9IGZyb20gXCIuLi9wcm9jZXNzLmpzXCJcbmltcG9ydCBWYXJpYWJsZSBmcm9tIFwiLi4vdmFyaWFibGUuanNcIlxuaW1wb3J0IEJpbmRpbmcsIHsga2ViYWJpZnksIHNuYWtlaWZ5LCB0eXBlIENvbm5lY3RhYmxlLCB0eXBlIFN1YnNjcmliYWJsZSB9IGZyb20gXCIuLi9iaW5kaW5nLmpzXCJcblxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlQmluZGluZ3MoYXJyYXk6IGFueVtdKSB7XG4gICAgZnVuY3Rpb24gZ2V0VmFsdWVzKC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGxldCBpID0gMFxuICAgICAgICByZXR1cm4gYXJyYXkubWFwKHZhbHVlID0+IHZhbHVlIGluc3RhbmNlb2YgQmluZGluZ1xuICAgICAgICAgICAgPyBhcmdzW2krK11cbiAgICAgICAgICAgIDogdmFsdWUsXG4gICAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBiaW5kaW5ncyA9IGFycmF5LmZpbHRlcihpID0+IGkgaW5zdGFuY2VvZiBCaW5kaW5nKVxuXG4gICAgaWYgKGJpbmRpbmdzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgcmV0dXJuIGFycmF5XG5cbiAgICBpZiAoYmluZGluZ3MubGVuZ3RoID09PSAxKVxuICAgICAgICByZXR1cm4gYmluZGluZ3NbMF0uYXMoZ2V0VmFsdWVzKVxuXG4gICAgcmV0dXJuIFZhcmlhYmxlLmRlcml2ZShiaW5kaW5ncywgZ2V0VmFsdWVzKSgpXG59XG5cbmZ1bmN0aW9uIHNldFByb3Aob2JqOiBhbnksIHByb3A6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIHRoZSBzZXR0ZXIgbWV0aG9kIGhhcyB0byBiZSB1c2VkIGJlY2F1c2VcbiAgICAgICAgLy8gYXJyYXkgbGlrZSBwcm9wZXJ0aWVzIGFyZSBub3QgYm91bmQgY29ycmVjdGx5IGFzIHByb3BzXG4gICAgICAgIGNvbnN0IHNldHRlciA9IGBzZXRfJHtzbmFrZWlmeShwcm9wKX1gXG4gICAgICAgIGlmICh0eXBlb2Ygb2JqW3NldHRlcl0gPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHJldHVybiBvYmpbc2V0dGVyXSh2YWx1ZSlcblxuICAgICAgICByZXR1cm4gKG9ialtwcm9wXSA9IHZhbHVlKVxuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgY291bGQgbm90IHNldCBwcm9wZXJ0eSBcIiR7cHJvcH1cIiBvbiAke29ian06YCwgZXJyb3IpXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBhc3RhbGlmeTxcbiAgICBDIGV4dGVuZHMgeyBuZXcoLi4uYXJnczogYW55W10pOiBHdGsuV2lkZ2V0IH0sXG4+KGNsczogQywgY2xzTmFtZSA9IGNscy5uYW1lKSB7XG4gICAgY2xhc3MgV2lkZ2V0IGV4dGVuZHMgY2xzIHtcbiAgICAgICAgZ2V0IGNzcygpOiBzdHJpbmcgeyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jc3ModGhpcykgfVxuICAgICAgICBzZXQgY3NzKGNzczogc3RyaW5nKSB7IEFzdGFsLndpZGdldF9zZXRfY3NzKHRoaXMsIGNzcykgfVxuICAgICAgICBnZXRfY3NzKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmNzcyB9XG4gICAgICAgIHNldF9jc3MoY3NzOiBzdHJpbmcpIHsgdGhpcy5jc3MgPSBjc3MgfVxuXG4gICAgICAgIGdldCBjbGFzc05hbWUoKTogc3RyaW5nIHsgcmV0dXJuIEFzdGFsLndpZGdldF9nZXRfY2xhc3NfbmFtZXModGhpcykuam9pbihcIiBcIikgfVxuICAgICAgICBzZXQgY2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKSB7IEFzdGFsLndpZGdldF9zZXRfY2xhc3NfbmFtZXModGhpcywgY2xhc3NOYW1lLnNwbGl0KC9cXHMrLykpIH1cbiAgICAgICAgZ2V0X2NsYXNzX25hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuY2xhc3NOYW1lIH1cbiAgICAgICAgc2V0X2NsYXNzX25hbWUoY2xhc3NOYW1lOiBzdHJpbmcpIHsgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWUgfVxuXG4gICAgICAgIGdldCBjdXJzb3IoKTogQ3Vyc29yIHsgcmV0dXJuIEFzdGFsLndpZGdldF9nZXRfY3Vyc29yKHRoaXMpIGFzIEN1cnNvciB9XG4gICAgICAgIHNldCBjdXJzb3IoY3Vyc29yOiBDdXJzb3IpIHsgQXN0YWwud2lkZ2V0X3NldF9jdXJzb3IodGhpcywgY3Vyc29yKSB9XG4gICAgICAgIGdldF9jdXJzb3IoKTogQ3Vyc29yIHsgcmV0dXJuIHRoaXMuY3Vyc29yIH1cbiAgICAgICAgc2V0X2N1cnNvcihjdXJzb3I6IEN1cnNvcikgeyB0aGlzLmN1cnNvciA9IGN1cnNvciB9XG5cbiAgICAgICAgZ2V0IGNsaWNrVGhyb3VnaCgpOiBib29sZWFuIHsgcmV0dXJuIEFzdGFsLndpZGdldF9nZXRfY2xpY2tfdGhyb3VnaCh0aGlzKSB9XG4gICAgICAgIHNldCBjbGlja1Rocm91Z2goY2xpY2tUaHJvdWdoOiBib29sZWFuKSB7IEFzdGFsLndpZGdldF9zZXRfY2xpY2tfdGhyb3VnaCh0aGlzLCBjbGlja1Rocm91Z2gpIH1cbiAgICAgICAgZ2V0X2NsaWNrX3Rocm91Z2goKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmNsaWNrVGhyb3VnaCB9XG4gICAgICAgIHNldF9jbGlja190aHJvdWdoKGNsaWNrVGhyb3VnaDogYm9vbGVhbikgeyB0aGlzLmNsaWNrVGhyb3VnaCA9IGNsaWNrVGhyb3VnaCB9XG5cbiAgICAgICAgZGVjbGFyZSBwcml2YXRlIF9fbm9faW1wbGljaXRfZGVzdHJveTogYm9vbGVhblxuICAgICAgICBnZXQgbm9JbXBsaWNpdERlc3Ryb3koKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9fbm9faW1wbGljaXRfZGVzdHJveSB9XG4gICAgICAgIHNldCBub0ltcGxpY2l0RGVzdHJveSh2YWx1ZTogYm9vbGVhbikgeyB0aGlzLl9fbm9faW1wbGljaXRfZGVzdHJveSA9IHZhbHVlIH1cblxuICAgICAgICBfc2V0Q2hpbGRyZW4oY2hpbGRyZW46IEd0ay5XaWRnZXRbXSkge1xuICAgICAgICAgICAgY2hpbGRyZW4gPSBjaGlsZHJlbi5mbGF0KEluZmluaXR5KS5tYXAoY2ggPT4gY2ggaW5zdGFuY2VvZiBHdGsuV2lkZ2V0XG4gICAgICAgICAgICAgICAgPyBjaFxuICAgICAgICAgICAgICAgIDogbmV3IEd0ay5MYWJlbCh7IHZpc2libGU6IHRydWUsIGxhYmVsOiBTdHJpbmcoY2gpIH0pKVxuXG4gICAgICAgICAgICAvLyByZW1vdmVcbiAgICAgICAgICAgIGlmICh0aGlzIGluc3RhbmNlb2YgR3RrLkJpbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoID0gdGhpcy5nZXRfY2hpbGQoKVxuICAgICAgICAgICAgICAgIGlmIChjaClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1vdmUoY2gpXG4gICAgICAgICAgICAgICAgaWYgKGNoICYmICFjaGlsZHJlbi5pbmNsdWRlcyhjaCkgJiYgIXRoaXMubm9JbXBsaWNpdERlc3Ryb3kpXG4gICAgICAgICAgICAgICAgICAgIGNoPy5kZXN0cm95KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBHdGsuQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLmdldF9jaGlsZHJlbigpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlKGNoKVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNoaWxkcmVuLmluY2x1ZGVzKGNoKSAmJiAhdGhpcy5ub0ltcGxpY2l0RGVzdHJveSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoPy5kZXN0cm95KClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRPRE86IGFkZCBtb3JlIGNvbnRhaW5lciB0eXBlc1xuICAgICAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5Cb3gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldF9jaGlsZHJlbihjaGlsZHJlbilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLlN0YWNrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfY2hpbGRyZW4oY2hpbGRyZW4pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5DZW50ZXJCb3gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0V2lkZ2V0ID0gY2hpbGRyZW5bMF1cbiAgICAgICAgICAgICAgICB0aGlzLmNlbnRlcldpZGdldCA9IGNoaWxkcmVuWzFdXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRXaWRnZXQgPSBjaGlsZHJlblsyXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuT3ZlcmxheSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtjaGlsZCwgLi4ub3ZlcmxheXNdID0gY2hpbGRyZW5cbiAgICAgICAgICAgICAgICB0aGlzLnNldF9jaGlsZChjaGlsZClcbiAgICAgICAgICAgICAgICB0aGlzLnNldF9vdmVybGF5cyhvdmVybGF5cylcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEd0ay5Db250YWluZXIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIGNoaWxkcmVuKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZChjaClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoYGNhbiBub3QgYWRkIGNoaWxkcmVuIHRvICR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSwgaXQgaXMgbm90IGEgY29udGFpbmVyIHdpZGdldGApXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0b2dnbGVDbGFzc05hbWUoY246IHN0cmluZywgY29uZCA9IHRydWUpIHtcbiAgICAgICAgICAgIEFzdGFsLndpZGdldF90b2dnbGVfY2xhc3NfbmFtZSh0aGlzLCBjbiwgY29uZClcbiAgICAgICAgfVxuXG4gICAgICAgIGhvb2soXG4gICAgICAgICAgICBvYmplY3Q6IENvbm5lY3RhYmxlLFxuICAgICAgICAgICAgc2lnbmFsOiBzdHJpbmcsXG4gICAgICAgICAgICBjYWxsYmFjazogKHNlbGY6IHRoaXMsIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxuICAgICAgICApOiB0aGlzXG4gICAgICAgIGhvb2soXG4gICAgICAgICAgICBvYmplY3Q6IFN1YnNjcmliYWJsZSxcbiAgICAgICAgICAgIGNhbGxiYWNrOiAoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICAgICAgICk6IHRoaXNcbiAgICAgICAgaG9vayhcbiAgICAgICAgICAgIG9iamVjdDogQ29ubmVjdGFibGUgfCBTdWJzY3JpYmFibGUsXG4gICAgICAgICAgICBzaWduYWxPckNhbGxiYWNrOiBzdHJpbmcgfCAoKHNlbGY6IHRoaXMsIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSxcbiAgICAgICAgICAgIGNhbGxiYWNrPzogKHNlbGY6IHRoaXMsIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0LmNvbm5lY3QgPT09IFwiZnVuY3Rpb25cIiAmJiBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gb2JqZWN0LmNvbm5lY3Qoc2lnbmFsT3JDYWxsYmFjaywgKF86IGFueSwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMsIC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgKG9iamVjdC5kaXNjb25uZWN0IGFzIENvbm5lY3RhYmxlW1wiZGlzY29ubmVjdFwiXSkoaWQpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIG9iamVjdC5zdWJzY3JpYmUgPT09IFwiZnVuY3Rpb25cIiAmJiB0eXBlb2Ygc2lnbmFsT3JDYWxsYmFjayA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5zdWIgPSBvYmplY3Quc3Vic2NyaWJlKCguLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2lnbmFsT3JDYWxsYmFjayh0aGlzLCAuLi5hcmdzKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCB1bnN1YilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0cnVjdG9yKC4uLnBhcmFtczogYW55W10pIHtcbiAgICAgICAgICAgIHN1cGVyKClcbiAgICAgICAgICAgIGNvbnN0IFtjb25maWddID0gcGFyYW1zXG5cbiAgICAgICAgICAgIGNvbnN0IHsgc2V0dXAsIGNoaWxkLCBjaGlsZHJlbiA9IFtdLCAuLi5wcm9wcyB9ID0gY29uZmlnXG4gICAgICAgICAgICBwcm9wcy52aXNpYmxlID8/PSB0cnVlXG5cbiAgICAgICAgICAgIGlmIChjaGlsZClcbiAgICAgICAgICAgICAgICBjaGlsZHJlbi51bnNoaWZ0KGNoaWxkKVxuXG4gICAgICAgICAgICAvLyBjb2xsZWN0IGJpbmRpbmdzXG4gICAgICAgICAgICBjb25zdCBiaW5kaW5ncyA9IE9iamVjdC5rZXlzKHByb3BzKS5yZWR1Y2UoKGFjYzogYW55LCBwcm9wKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHByb3BzW3Byb3BdIGluc3RhbmNlb2YgQmluZGluZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiaW5kaW5nID0gcHJvcHNbcHJvcF1cbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHByb3BzW3Byb3BdXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbLi4uYWNjLCBbcHJvcCwgYmluZGluZ11dXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBhY2NcbiAgICAgICAgICAgIH0sIFtdKVxuXG4gICAgICAgICAgICAvLyBjb2xsZWN0IHNpZ25hbCBoYW5kbGVyc1xuICAgICAgICAgICAgY29uc3Qgb25IYW5kbGVycyA9IE9iamVjdC5rZXlzKHByb3BzKS5yZWR1Y2UoKGFjYzogYW55LCBrZXkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoXCJvblwiKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzaWcgPSBrZWJhYmlmeShrZXkpLnNwbGl0KFwiLVwiKS5zbGljZSgxKS5qb2luKFwiLVwiKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVyID0gcHJvcHNba2V5XVxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcHJvcHNba2V5XVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gWy4uLmFjYywgW3NpZywgaGFuZGxlcl1dXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBhY2NcbiAgICAgICAgICAgIH0sIFtdKVxuXG4gICAgICAgICAgICAvLyBzZXQgY2hpbGRyZW5cbiAgICAgICAgICAgIGNvbnN0IG1lcmdlZENoaWxkcmVuID0gbWVyZ2VCaW5kaW5ncyhjaGlsZHJlbi5mbGF0KEluZmluaXR5KSlcbiAgICAgICAgICAgIGlmIChtZXJnZWRDaGlsZHJlbiBpbnN0YW5jZW9mIEJpbmRpbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbihtZXJnZWRDaGlsZHJlbi5nZXQoKSlcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsIG1lcmdlZENoaWxkcmVuLnN1YnNjcmliZSgodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbih2KVxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG1lcmdlZENoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4obWVyZ2VkQ2hpbGRyZW4pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXR1cCBzaWduYWwgaGFuZGxlcnNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW3NpZ25hbCwgY2FsbGJhY2tdIG9mIG9uSGFuZGxlcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KHNpZ25hbCwgY2FsbGJhY2spXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3Qoc2lnbmFsLCAoKSA9PiBleGVjQXN5bmMoY2FsbGJhY2spXG4gICAgICAgICAgICAgICAgICAgICAgICAudGhlbihwcmludCkuY2F0Y2goY29uc29sZS5lcnJvcikpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXR1cCBiaW5kaW5ncyBoYW5kbGVyc1xuICAgICAgICAgICAgZm9yIChjb25zdCBbcHJvcCwgYmluZGluZ10gb2YgYmluZGluZ3MpIHtcbiAgICAgICAgICAgICAgICBpZiAocHJvcCA9PT0gXCJjaGlsZFwiIHx8IHByb3AgPT09IFwiY2hpbGRyZW5cIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsIGJpbmRpbmcuc3Vic2NyaWJlKCh2OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKHYpXG4gICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsIGJpbmRpbmcuc3Vic2NyaWJlKCh2OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2V0UHJvcCh0aGlzLCBwcm9wLCB2KVxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIHNldFByb3AodGhpcywgcHJvcCwgYmluZGluZy5nZXQoKSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBwcm9wcylcbiAgICAgICAgICAgIHNldHVwPy4odGhpcylcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7XG4gICAgICAgIEdUeXBlTmFtZTogYEFzdGFsXyR7Y2xzTmFtZX1gLFxuICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICBcImNsYXNzLW5hbWVcIjogR09iamVjdC5QYXJhbVNwZWMuc3RyaW5nKFxuICAgICAgICAgICAgICAgIFwiY2xhc3MtbmFtZVwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBcIlwiLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwiY3NzXCI6IEdPYmplY3QuUGFyYW1TcGVjLnN0cmluZyhcbiAgICAgICAgICAgICAgICBcImNzc1wiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBcIlwiLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwiY3Vyc29yXCI6IEdPYmplY3QuUGFyYW1TcGVjLnN0cmluZyhcbiAgICAgICAgICAgICAgICBcImN1cnNvclwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBcImRlZmF1bHRcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcImNsaWNrLXRocm91Z2hcIjogR09iamVjdC5QYXJhbVNwZWMuYm9vbGVhbihcbiAgICAgICAgICAgICAgICBcImNsaWNrLXRocm91Z2hcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgZmFsc2UsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJuby1pbXBsaWNpdC1kZXN0cm95XCI6IEdPYmplY3QuUGFyYW1TcGVjLmJvb2xlYW4oXG4gICAgICAgICAgICAgICAgXCJuby1pbXBsaWNpdC1kZXN0cm95XCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIGZhbHNlLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICB9LCBXaWRnZXQpXG5cbiAgICByZXR1cm4gV2lkZ2V0XG59XG5cbmV4cG9ydCB0eXBlIEJpbmRhYmxlUHJvcHM8VD4gPSB7XG4gICAgW0sgaW4ga2V5b2YgVF06IEJpbmRpbmc8VFtLXT4gfCBUW0tdO1xufVxuXG50eXBlIFNpZ0hhbmRsZXI8XG4gICAgVyBleHRlbmRzIEluc3RhbmNlVHlwZTx0eXBlb2YgR3RrLldpZGdldD4sXG4gICAgQXJncyBleHRlbmRzIEFycmF5PHVua25vd24+LFxuPiA9ICgoc2VsZjogVywgLi4uYXJnczogQXJncykgPT4gdW5rbm93bikgfCBzdHJpbmcgfCBzdHJpbmdbXVxuXG5leHBvcnQgdHlwZSBDb25zdHJ1Y3RQcm9wczxcbiAgICBTZWxmIGV4dGVuZHMgSW5zdGFuY2VUeXBlPHR5cGVvZiBHdGsuV2lkZ2V0PixcbiAgICBQcm9wcyBleHRlbmRzIEd0ay5XaWRnZXQuQ29uc3RydWN0b3JQcm9wcyxcbiAgICBTaWduYWxzIGV4dGVuZHMgUmVjb3JkPGBvbiR7c3RyaW5nfWAsIEFycmF5PHVua25vd24+PiA9IFJlY29yZDxgb24ke3N0cmluZ31gLCBhbnlbXT4sXG4+ID0gUGFydGlhbDx7XG4gICAgLy8gQHRzLWV4cGVjdC1lcnJvciBjYW4ndCBhc3NpZ24gdG8gdW5rbm93biwgYnV0IGl0IHdvcmtzIGFzIGV4cGVjdGVkIHRob3VnaFxuICAgIFtTIGluIGtleW9mIFNpZ25hbHNdOiBTaWdIYW5kbGVyPFNlbGYsIFNpZ25hbHNbU10+XG59PiAmIFBhcnRpYWw8e1xuICAgIFtLZXkgaW4gYG9uJHtzdHJpbmd9YF06IFNpZ0hhbmRsZXI8U2VsZiwgYW55W10+XG59PiAmIEJpbmRhYmxlUHJvcHM8UGFydGlhbDxQcm9wcz4gJiB7XG4gICAgY2xhc3NOYW1lPzogc3RyaW5nXG4gICAgY3NzPzogc3RyaW5nXG4gICAgY3Vyc29yPzogc3RyaW5nXG4gICAgY2xpY2tUaHJvdWdoPzogYm9vbGVhblxufT4gJiB7XG4gICAgb25EZXN0cm95PzogKHNlbGY6IFNlbGYpID0+IHVua25vd25cbiAgICBvbkRyYXc/OiAoc2VsZjogU2VsZikgPT4gdW5rbm93blxuICAgIG9uS2V5UHJlc3NFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25LZXlSZWxlYXNlRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uQnV0dG9uUHJlc3NFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25CdXR0b25SZWxlYXNlRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uUmVhbGl6ZT86IChzZWxmOiBTZWxmKSA9PiB1bmtub3duXG4gICAgc2V0dXA/OiAoc2VsZjogU2VsZikgPT4gdm9pZFxufVxuXG5leHBvcnQgdHlwZSBCaW5kYWJsZUNoaWxkID0gR3RrLldpZGdldCB8IEJpbmRpbmc8R3RrLldpZGdldD5cblxudHlwZSBDdXJzb3IgPVxuICAgIHwgXCJkZWZhdWx0XCJcbiAgICB8IFwiaGVscFwiXG4gICAgfCBcInBvaW50ZXJcIlxuICAgIHwgXCJjb250ZXh0LW1lbnVcIlxuICAgIHwgXCJwcm9ncmVzc1wiXG4gICAgfCBcIndhaXRcIlxuICAgIHwgXCJjZWxsXCJcbiAgICB8IFwiY3Jvc3NoYWlyXCJcbiAgICB8IFwidGV4dFwiXG4gICAgfCBcInZlcnRpY2FsLXRleHRcIlxuICAgIHwgXCJhbGlhc1wiXG4gICAgfCBcImNvcHlcIlxuICAgIHwgXCJuby1kcm9wXCJcbiAgICB8IFwibW92ZVwiXG4gICAgfCBcIm5vdC1hbGxvd2VkXCJcbiAgICB8IFwiZ3JhYlwiXG4gICAgfCBcImdyYWJiaW5nXCJcbiAgICB8IFwiYWxsLXNjcm9sbFwiXG4gICAgfCBcImNvbC1yZXNpemVcIlxuICAgIHwgXCJyb3ctcmVzaXplXCJcbiAgICB8IFwibi1yZXNpemVcIlxuICAgIHwgXCJlLXJlc2l6ZVwiXG4gICAgfCBcInMtcmVzaXplXCJcbiAgICB8IFwidy1yZXNpemVcIlxuICAgIHwgXCJuZS1yZXNpemVcIlxuICAgIHwgXCJudy1yZXNpemVcIlxuICAgIHwgXCJzdy1yZXNpemVcIlxuICAgIHwgXCJzZS1yZXNpemVcIlxuICAgIHwgXCJldy1yZXNpemVcIlxuICAgIHwgXCJucy1yZXNpemVcIlxuICAgIHwgXCJuZXN3LXJlc2l6ZVwiXG4gICAgfCBcIm53c2UtcmVzaXplXCJcbiAgICB8IFwiem9vbS1pblwiXG4gICAgfCBcInpvb20tb3V0XCJcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5cbnR5cGUgQXJncyA9IHtcbiAgICBjbWQ6IHN0cmluZyB8IHN0cmluZ1tdXG4gICAgb3V0PzogKHN0ZG91dDogc3RyaW5nKSA9PiB2b2lkXG4gICAgZXJyPzogKHN0ZGVycjogc3RyaW5nKSA9PiB2b2lkXG59XG5cbmV4cG9ydCBjb25zdCB7IFByb2Nlc3MgfSA9IEFzdGFsXG5cbmV4cG9ydCBmdW5jdGlvbiBzdWJwcm9jZXNzKGFyZ3M6IEFyZ3MpOiBBc3RhbC5Qcm9jZXNzXG5cbmV4cG9ydCBmdW5jdGlvbiBzdWJwcm9jZXNzKFxuICAgIGNtZDogc3RyaW5nIHwgc3RyaW5nW10sXG4gICAgb25PdXQ/OiAoc3Rkb3V0OiBzdHJpbmcpID0+IHZvaWQsXG4gICAgb25FcnI/OiAoc3RkZXJyOiBzdHJpbmcpID0+IHZvaWQsXG4pOiBBc3RhbC5Qcm9jZXNzXG5cbmV4cG9ydCBmdW5jdGlvbiBzdWJwcm9jZXNzKFxuICAgIGFyZ3NPckNtZDogQXJncyB8IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIG9uT3V0OiAoc3Rkb3V0OiBzdHJpbmcpID0+IHZvaWQgPSBwcmludCxcbiAgICBvbkVycjogKHN0ZGVycjogc3RyaW5nKSA9PiB2b2lkID0gcHJpbnRlcnIsXG4pIHtcbiAgICBjb25zdCBhcmdzID0gQXJyYXkuaXNBcnJheShhcmdzT3JDbWQpIHx8IHR5cGVvZiBhcmdzT3JDbWQgPT09IFwic3RyaW5nXCJcbiAgICBjb25zdCB7IGNtZCwgZXJyLCBvdXQgfSA9IHtcbiAgICAgICAgY21kOiBhcmdzID8gYXJnc09yQ21kIDogYXJnc09yQ21kLmNtZCxcbiAgICAgICAgZXJyOiBhcmdzID8gb25FcnIgOiBhcmdzT3JDbWQuZXJyIHx8IG9uRXJyLFxuICAgICAgICBvdXQ6IGFyZ3MgPyBvbk91dCA6IGFyZ3NPckNtZC5vdXQgfHwgb25PdXQsXG4gICAgfVxuXG4gICAgY29uc3QgcHJvYyA9IEFycmF5LmlzQXJyYXkoY21kKVxuICAgICAgICA/IEFzdGFsLlByb2Nlc3Muc3VicHJvY2Vzc3YoY21kKVxuICAgICAgICA6IEFzdGFsLlByb2Nlc3Muc3VicHJvY2VzcyhjbWQpXG5cbiAgICBwcm9jLmNvbm5lY3QoXCJzdGRvdXRcIiwgKF8sIHN0ZG91dDogc3RyaW5nKSA9PiBvdXQoc3Rkb3V0KSlcbiAgICBwcm9jLmNvbm5lY3QoXCJzdGRlcnJcIiwgKF8sIHN0ZGVycjogc3RyaW5nKSA9PiBlcnIoc3RkZXJyKSlcbiAgICByZXR1cm4gcHJvY1xufVxuXG4vKiogQHRocm93cyB7R0xpYi5FcnJvcn0gVGhyb3dzIHN0ZGVyciAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWMoY21kOiBzdHJpbmcgfCBzdHJpbmdbXSkge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGNtZClcbiAgICAgICAgPyBBc3RhbC5Qcm9jZXNzLmV4ZWN2KGNtZClcbiAgICAgICAgOiBBc3RhbC5Qcm9jZXNzLmV4ZWMoY21kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhlY0FzeW5jKGNtZDogc3RyaW5nIHwgc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNtZCkpIHtcbiAgICAgICAgICAgIEFzdGFsLlByb2Nlc3MuZXhlY19hc3luY3YoY21kLCAoXywgcmVzKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5Qcm9jZXNzLmV4ZWNfYXN5bmN2X2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBBc3RhbC5Qcm9jZXNzLmV4ZWNfYXN5bmMoY21kLCAoXywgcmVzKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5Qcm9jZXNzLmV4ZWNfZmluaXNoKHJlcykpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH0pXG59XG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuaW1wb3J0IEJpbmRpbmcsIHsgdHlwZSBDb25uZWN0YWJsZSwgdHlwZSBTdWJzY3JpYmFibGUgfSBmcm9tIFwiLi9iaW5kaW5nLmpzXCJcbmltcG9ydCB7IGludGVydmFsIH0gZnJvbSBcIi4vdGltZS5qc1wiXG5pbXBvcnQgeyBleGVjQXN5bmMsIHN1YnByb2Nlc3MgfSBmcm9tIFwiLi9wcm9jZXNzLmpzXCJcblxuY2xhc3MgVmFyaWFibGVXcmFwcGVyPFQ+IGV4dGVuZHMgRnVuY3Rpb24ge1xuICAgIHByaXZhdGUgdmFyaWFibGUhOiBBc3RhbC5WYXJpYWJsZUJhc2VcbiAgICBwcml2YXRlIGVyckhhbmRsZXI/ID0gY29uc29sZS5lcnJvclxuXG4gICAgcHJpdmF0ZSBfdmFsdWU6IFRcbiAgICBwcml2YXRlIF9wb2xsPzogQXN0YWwuVGltZVxuICAgIHByaXZhdGUgX3dhdGNoPzogQXN0YWwuUHJvY2Vzc1xuXG4gICAgcHJpdmF0ZSBwb2xsSW50ZXJ2YWwgPSAxMDAwXG4gICAgcHJpdmF0ZSBwb2xsRXhlYz86IHN0cmluZ1tdIHwgc3RyaW5nXG4gICAgcHJpdmF0ZSBwb2xsVHJhbnNmb3JtPzogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUXG4gICAgcHJpdmF0ZSBwb2xsRm4/OiAocHJldjogVCkgPT4gVCB8IFByb21pc2U8VD5cblxuICAgIHByaXZhdGUgd2F0Y2hUcmFuc2Zvcm0/OiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFRcbiAgICBwcml2YXRlIHdhdGNoRXhlYz86IHN0cmluZ1tdIHwgc3RyaW5nXG5cbiAgICBjb25zdHJ1Y3Rvcihpbml0OiBUKSB7XG4gICAgICAgIHN1cGVyKClcbiAgICAgICAgdGhpcy5fdmFsdWUgPSBpbml0XG4gICAgICAgIHRoaXMudmFyaWFibGUgPSBuZXcgQXN0YWwuVmFyaWFibGVCYXNlKClcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZHJvcHBlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnN0b3BXYXRjaCgpXG4gICAgICAgICAgICB0aGlzLnN0b3BQb2xsKClcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZXJyb3JcIiwgKF8sIGVycikgPT4gdGhpcy5lcnJIYW5kbGVyPy4oZXJyKSlcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh0aGlzLCB7XG4gICAgICAgICAgICBhcHBseTogKHRhcmdldCwgXywgYXJncykgPT4gdGFyZ2V0Ll9jYWxsKGFyZ3NbMF0pLFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHByaXZhdGUgX2NhbGw8UiA9IFQ+KHRyYW5zZm9ybT86ICh2YWx1ZTogVCkgPT4gUik6IEJpbmRpbmc8Uj4ge1xuICAgICAgICBjb25zdCBiID0gQmluZGluZy5iaW5kKHRoaXMpXG4gICAgICAgIHJldHVybiB0cmFuc2Zvcm0gPyBiLmFzKHRyYW5zZm9ybSkgOiBiIGFzIHVua25vd24gYXMgQmluZGluZzxSPlxuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGBWYXJpYWJsZTwke3RoaXMuZ2V0KCl9PmApXG4gICAgfVxuXG4gICAgZ2V0KCk6IFQgeyByZXR1cm4gdGhpcy5fdmFsdWUgfVxuICAgIHNldCh2YWx1ZTogVCkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX3ZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl92YWx1ZSA9IHZhbHVlXG4gICAgICAgICAgICB0aGlzLnZhcmlhYmxlLmVtaXQoXCJjaGFuZ2VkXCIpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFBvbGwoKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb2xsKVxuICAgICAgICAgICAgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMucG9sbEZuKSB7XG4gICAgICAgICAgICB0aGlzLl9wb2xsID0gaW50ZXJ2YWwodGhpcy5wb2xsSW50ZXJ2YWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gdGhpcy5wb2xsRm4hKHRoaXMuZ2V0KCkpXG4gICAgICAgICAgICAgICAgaWYgKHYgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHYudGhlbih2ID0+IHRoaXMuc2V0KHYpKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLnZhcmlhYmxlLmVtaXQoXCJlcnJvclwiLCBlcnIpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQodilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMucG9sbEV4ZWMpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvbGwgPSBpbnRlcnZhbCh0aGlzLnBvbGxJbnRlcnZhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGV4ZWNBc3luYyh0aGlzLnBvbGxFeGVjISlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4odiA9PiB0aGlzLnNldCh0aGlzLnBvbGxUcmFuc2Zvcm0hKHYsIHRoaXMuZ2V0KCkpKSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLnZhcmlhYmxlLmVtaXQoXCJlcnJvclwiLCBlcnIpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0V2F0Y2goKSB7XG4gICAgICAgIGlmICh0aGlzLl93YXRjaClcbiAgICAgICAgICAgIHJldHVyblxuXG4gICAgICAgIHRoaXMuX3dhdGNoID0gc3VicHJvY2Vzcyh7XG4gICAgICAgICAgICBjbWQ6IHRoaXMud2F0Y2hFeGVjISxcbiAgICAgICAgICAgIG91dDogb3V0ID0+IHRoaXMuc2V0KHRoaXMud2F0Y2hUcmFuc2Zvcm0hKG91dCwgdGhpcy5nZXQoKSkpLFxuICAgICAgICAgICAgZXJyOiBlcnIgPT4gdGhpcy52YXJpYWJsZS5lbWl0KFwiZXJyb3JcIiwgZXJyKSxcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBzdG9wUG9sbCgpIHtcbiAgICAgICAgdGhpcy5fcG9sbD8uY2FuY2VsKClcbiAgICAgICAgZGVsZXRlIHRoaXMuX3BvbGxcbiAgICB9XG5cbiAgICBzdG9wV2F0Y2goKSB7XG4gICAgICAgIHRoaXMuX3dhdGNoPy5raWxsKClcbiAgICAgICAgZGVsZXRlIHRoaXMuX3dhdGNoXG4gICAgfVxuXG4gICAgaXNQb2xsaW5nKCkgeyByZXR1cm4gISF0aGlzLl9wb2xsIH1cbiAgICBpc1dhdGNoaW5nKCkgeyByZXR1cm4gISF0aGlzLl93YXRjaCB9XG5cbiAgICBkcm9wKCkge1xuICAgICAgICB0aGlzLnZhcmlhYmxlLmVtaXQoXCJkcm9wcGVkXCIpXG4gICAgfVxuXG4gICAgb25Ecm9wcGVkKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImRyb3BwZWRcIiwgY2FsbGJhY2spXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICBvbkVycm9yKGNhbGxiYWNrOiAoZXJyOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuZXJySGFuZGxlclxuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJlcnJvclwiLCAoXywgZXJyKSA9PiBjYWxsYmFjayhlcnIpKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrOiAodmFsdWU6IFQpID0+IHZvaWQpIHtcbiAgICAgICAgY29uc3QgaWQgPSB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJjaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMuZ2V0KCkpXG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiAoKSA9PiB0aGlzLnZhcmlhYmxlLmRpc2Nvbm5lY3QoaWQpXG4gICAgfVxuXG4gICAgcG9sbChcbiAgICAgICAgaW50ZXJ2YWw6IG51bWJlcixcbiAgICAgICAgZXhlYzogc3RyaW5nIHwgc3RyaW5nW10sXG4gICAgICAgIHRyYW5zZm9ybT86IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVFxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBwb2xsKFxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyLFxuICAgICAgICBjYWxsYmFjazogKHByZXY6IFQpID0+IFQgfCBQcm9taXNlPFQ+XG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIHBvbGwoXG4gICAgICAgIGludGVydmFsOiBudW1iZXIsXG4gICAgICAgIGV4ZWM6IHN0cmluZyB8IHN0cmluZ1tdIHwgKChwcmV2OiBUKSA9PiBUIHwgUHJvbWlzZTxUPiksXG4gICAgICAgIHRyYW5zZm9ybTogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUID0gb3V0ID0+IG91dCBhcyBULFxuICAgICkge1xuICAgICAgICB0aGlzLnN0b3BQb2xsKClcbiAgICAgICAgdGhpcy5wb2xsSW50ZXJ2YWwgPSBpbnRlcnZhbFxuICAgICAgICB0aGlzLnBvbGxUcmFuc2Zvcm0gPSB0cmFuc2Zvcm1cbiAgICAgICAgaWYgKHR5cGVvZiBleGVjID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9sbEZuID0gZXhlY1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMucG9sbEV4ZWNcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucG9sbEV4ZWMgPSBleGVjXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5wb2xsRm5cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN0YXJ0UG9sbCgpXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICB3YXRjaChcbiAgICAgICAgZXhlYzogc3RyaW5nIHwgc3RyaW5nW10sXG4gICAgICAgIHRyYW5zZm9ybTogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUID0gb3V0ID0+IG91dCBhcyBULFxuICAgICkge1xuICAgICAgICB0aGlzLnN0b3BXYXRjaCgpXG4gICAgICAgIHRoaXMud2F0Y2hFeGVjID0gZXhlY1xuICAgICAgICB0aGlzLndhdGNoVHJhbnNmb3JtID0gdHJhbnNmb3JtXG4gICAgICAgIHRoaXMuc3RhcnRXYXRjaCgpXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICBvYnNlcnZlKFxuICAgICAgICBvYmpzOiBBcnJheTxbb2JqOiBDb25uZWN0YWJsZSwgc2lnbmFsOiBzdHJpbmddPixcbiAgICAgICAgY2FsbGJhY2s6ICguLi5hcmdzOiBhbnlbXSkgPT4gVCxcbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgb2JzZXJ2ZShcbiAgICAgICAgb2JqOiBDb25uZWN0YWJsZSxcbiAgICAgICAgc2lnbmFsOiBzdHJpbmcsXG4gICAgICAgIGNhbGxiYWNrOiAoLi4uYXJnczogYW55W10pID0+IFQsXG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIG9ic2VydmUoXG4gICAgICAgIG9ianM6IENvbm5lY3RhYmxlIHwgQXJyYXk8W29iajogQ29ubmVjdGFibGUsIHNpZ25hbDogc3RyaW5nXT4sXG4gICAgICAgIHNpZ09yRm46IHN0cmluZyB8ICgob2JqOiBDb25uZWN0YWJsZSwgLi4uYXJnczogYW55W10pID0+IFQpLFxuICAgICAgICBjYWxsYmFjaz86IChvYmo6IENvbm5lY3RhYmxlLCAuLi5hcmdzOiBhbnlbXSkgPT4gVCxcbiAgICApIHtcbiAgICAgICAgY29uc3QgZiA9IHR5cGVvZiBzaWdPckZuID09PSBcImZ1bmN0aW9uXCIgPyBzaWdPckZuIDogY2FsbGJhY2sgPz8gKCgpID0+IHRoaXMuZ2V0KCkpXG4gICAgICAgIGNvbnN0IHNldCA9IChvYmo6IENvbm5lY3RhYmxlLCAuLi5hcmdzOiBhbnlbXSkgPT4gdGhpcy5zZXQoZihvYmosIC4uLmFyZ3MpKVxuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9ianMpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG9iaiBvZiBvYmpzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgW28sIHNdID0gb2JqXG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBvLmNvbm5lY3Qocywgc2V0KVxuICAgICAgICAgICAgICAgIHRoaXMub25Ecm9wcGVkKCgpID0+IG8uZGlzY29ubmVjdChpZCkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNpZ09yRm4gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IG9ianMuY29ubmVjdChzaWdPckZuLCBzZXQpXG4gICAgICAgICAgICAgICAgdGhpcy5vbkRyb3BwZWQoKCkgPT4gb2Jqcy5kaXNjb25uZWN0KGlkKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICBzdGF0aWMgZGVyaXZlPFxuICAgICAgICBjb25zdCBEZXBzIGV4dGVuZHMgQXJyYXk8U3Vic2NyaWJhYmxlPGFueT4+LFxuICAgICAgICBBcmdzIGV4dGVuZHMge1xuICAgICAgICAgICAgW0sgaW4ga2V5b2YgRGVwc106IERlcHNbS10gZXh0ZW5kcyBTdWJzY3JpYmFibGU8aW5mZXIgVD4gPyBUIDogbmV2ZXJcbiAgICAgICAgfSxcbiAgICAgICAgViA9IEFyZ3MsXG4gICAgPihkZXBzOiBEZXBzLCBmbjogKC4uLmFyZ3M6IEFyZ3MpID0+IFYgPSAoLi4uYXJncykgPT4gYXJncyBhcyB1bmtub3duIGFzIFYpIHtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gKCkgPT4gZm4oLi4uZGVwcy5tYXAoZCA9PiBkLmdldCgpKSBhcyBBcmdzKVxuICAgICAgICBjb25zdCBkZXJpdmVkID0gbmV3IFZhcmlhYmxlKHVwZGF0ZSgpKVxuICAgICAgICBjb25zdCB1bnN1YnMgPSBkZXBzLm1hcChkZXAgPT4gZGVwLnN1YnNjcmliZSgoKSA9PiBkZXJpdmVkLnNldCh1cGRhdGUoKSkpKVxuICAgICAgICBkZXJpdmVkLm9uRHJvcHBlZCgoKSA9PiB1bnN1YnMubWFwKHVuc3ViID0+IHVuc3ViKCkpKVxuICAgICAgICByZXR1cm4gZGVyaXZlZFxuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBWYXJpYWJsZTxUPiBleHRlbmRzIE9taXQ8VmFyaWFibGVXcmFwcGVyPFQ+LCBcImJpbmRcIj4ge1xuICAgIDxSPih0cmFuc2Zvcm06ICh2YWx1ZTogVCkgPT4gUik6IEJpbmRpbmc8Uj5cbiAgICAoKTogQmluZGluZzxUPlxufVxuXG5leHBvcnQgY29uc3QgVmFyaWFibGUgPSBuZXcgUHJveHkoVmFyaWFibGVXcmFwcGVyIGFzIGFueSwge1xuICAgIGFwcGx5OiAoX3QsIF9hLCBhcmdzKSA9PiBuZXcgVmFyaWFibGVXcmFwcGVyKGFyZ3NbMF0pLFxufSkgYXMge1xuICAgIGRlcml2ZTogdHlwZW9mIFZhcmlhYmxlV3JhcHBlcltcImRlcml2ZVwiXVxuICAgIDxUPihpbml0OiBUKTogVmFyaWFibGU8VD5cbiAgICBuZXc8VD4oaW5pdDogVCk6IFZhcmlhYmxlPFQ+XG59XG5cbmV4cG9ydCBkZWZhdWx0IFZhcmlhYmxlXG4iLCAiZXhwb3J0IGNvbnN0IHNuYWtlaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMV8kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiLVwiLCBcIl9cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG5leHBvcnQgY29uc3Qga2ViYWJpZnkgPSAoc3RyOiBzdHJpbmcpID0+IHN0clxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCBcIiQxLSQyXCIpXG4gICAgLnJlcGxhY2VBbGwoXCJfXCIsIFwiLVwiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Vic2NyaWJhYmxlPFQgPSB1bmtub3duPiB7XG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrOiAodmFsdWU6IFQpID0+IHZvaWQpOiAoKSA9PiB2b2lkXG4gICAgZ2V0KCk6IFRcbiAgICBba2V5OiBzdHJpbmddOiBhbnlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb25uZWN0YWJsZSB7XG4gICAgY29ubmVjdChzaWduYWw6IHN0cmluZywgY2FsbGJhY2s6ICguLi5hcmdzOiBhbnlbXSkgPT4gdW5rbm93bik6IG51bWJlclxuICAgIGRpc2Nvbm5lY3QoaWQ6IG51bWJlcik6IHZvaWRcbiAgICBba2V5OiBzdHJpbmddOiBhbnlcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQmluZGluZzxWYWx1ZT4ge1xuICAgIHByaXZhdGUgdHJhbnNmb3JtRm4gPSAodjogYW55KSA9PiB2XG5cbiAgICAjZW1pdHRlcjogU3Vic2NyaWJhYmxlPFZhbHVlPiB8IENvbm5lY3RhYmxlXG4gICAgI3Byb3A/OiBzdHJpbmdcblxuICAgIHN0YXRpYyBiaW5kPFxuICAgICAgICBUIGV4dGVuZHMgQ29ubmVjdGFibGUsXG4gICAgICAgIFAgZXh0ZW5kcyBrZXlvZiBULFxuICAgID4ob2JqZWN0OiBULCBwcm9wZXJ0eTogUCk6IEJpbmRpbmc8VFtQXT5cblxuICAgIHN0YXRpYyBiaW5kPFQ+KG9iamVjdDogU3Vic2NyaWJhYmxlPFQ+KTogQmluZGluZzxUPlxuXG4gICAgc3RhdGljIGJpbmQoZW1pdHRlcjogQ29ubmVjdGFibGUgfCBTdWJzY3JpYmFibGUsIHByb3A/OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCaW5kaW5nKGVtaXR0ZXIsIHByb3ApXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihlbWl0dGVyOiBDb25uZWN0YWJsZSB8IFN1YnNjcmliYWJsZTxWYWx1ZT4sIHByb3A/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy4jZW1pdHRlciA9IGVtaXR0ZXJcbiAgICAgICAgdGhpcy4jcHJvcCA9IHByb3AgJiYga2ViYWJpZnkocHJvcClcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIGBCaW5kaW5nPCR7dGhpcy4jZW1pdHRlcn0ke3RoaXMuI3Byb3AgPyBgLCBcIiR7dGhpcy4jcHJvcH1cImAgOiBcIlwifT5gXG4gICAgfVxuXG4gICAgYXM8VD4oZm46ICh2OiBWYWx1ZSkgPT4gVCk6IEJpbmRpbmc8VD4ge1xuICAgICAgICBjb25zdCBiaW5kID0gbmV3IEJpbmRpbmcodGhpcy4jZW1pdHRlciwgdGhpcy4jcHJvcClcbiAgICAgICAgYmluZC50cmFuc2Zvcm1GbiA9ICh2OiBWYWx1ZSkgPT4gZm4odGhpcy50cmFuc2Zvcm1Gbih2KSlcbiAgICAgICAgcmV0dXJuIGJpbmQgYXMgdW5rbm93biBhcyBCaW5kaW5nPFQ+XG4gICAgfVxuXG4gICAgZ2V0KCk6IFZhbHVlIHtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyLmdldCA9PT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtRm4odGhpcy4jZW1pdHRlci5nZXQoKSlcblxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuI3Byb3AgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IGdldHRlciA9IGBnZXRfJHtzbmFrZWlmeSh0aGlzLiNwcm9wKX1gXG4gICAgICAgICAgICBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXJbZ2V0dGVyXSA9PT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybUZuKHRoaXMuI2VtaXR0ZXJbZ2V0dGVyXSgpKVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Gbih0aGlzLiNlbWl0dGVyW3RoaXMuI3Byb3BdKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgRXJyb3IoXCJjYW4gbm90IGdldCB2YWx1ZSBvZiBiaW5kaW5nXCIpXG4gICAgfVxuXG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrOiAodmFsdWU6IFZhbHVlKSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlci5zdWJzY3JpYmUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuI2VtaXR0ZXIuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayh0aGlzLmdldCgpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlci5jb25uZWN0ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHNpZ25hbCA9IGBub3RpZnk6OiR7dGhpcy4jcHJvcH1gXG4gICAgICAgICAgICBjb25zdCBpZCA9IHRoaXMuI2VtaXR0ZXIuY29ubmVjdChzaWduYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayh0aGlzLmdldCgpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgKHRoaXMuI2VtaXR0ZXIuZGlzY29ubmVjdCBhcyBDb25uZWN0YWJsZVtcImRpc2Nvbm5lY3RcIl0pKGlkKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRocm93IEVycm9yKGAke3RoaXMuI2VtaXR0ZXJ9IGlzIG5vdCBiaW5kYWJsZWApXG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QgeyBiaW5kIH0gPSBCaW5kaW5nXG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuXG5leHBvcnQgY29uc3QgeyBUaW1lIH0gPSBBc3RhbFxuXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJ2YWwoaW50ZXJ2YWw6IG51bWJlciwgY2FsbGJhY2s/OiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIEFzdGFsLlRpbWUuaW50ZXJ2YWwoaW50ZXJ2YWwsICgpID0+IHZvaWQgY2FsbGJhY2s/LigpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZW91dCh0aW1lb3V0OiBudW1iZXIsIGNhbGxiYWNrPzogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBBc3RhbC5UaW1lLnRpbWVvdXQodGltZW91dCwgKCkgPT4gdm9pZCBjYWxsYmFjaz8uKCkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpZGxlKGNhbGxiYWNrPzogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBBc3RhbC5UaW1lLmlkbGUoKCkgPT4gdm9pZCBjYWxsYmFjaz8uKCkpXG59XG4iLCAiaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCB7IG1rQXBwIH0gZnJvbSBcIi4uL19hcHBcIlxuXG5HdGsuaW5pdChudWxsKVxuXG5leHBvcnQgZGVmYXVsdCBta0FwcChBc3RhbC5BcHBsaWNhdGlvbilcbiIsICIvKipcbiAqIFdvcmthcm91bmQgZm9yIFwiQ2FuJ3QgY29udmVydCBub24tbnVsbCBwb2ludGVyIHRvIEpTIHZhbHVlIFwiXG4gKi9cblxuZXhwb3J0IHsgfVxuXG5jb25zdCBzbmFrZWlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDFfJDJcIilcbiAgICAucmVwbGFjZUFsbChcIi1cIiwgXCJfXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxuYXN5bmMgZnVuY3Rpb24gc3VwcHJlc3M8VD4obW9kOiBQcm9taXNlPHsgZGVmYXVsdDogVCB9PiwgcGF0Y2g6IChtOiBUKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIG1vZC50aGVuKG0gPT4gcGF0Y2gobS5kZWZhdWx0KSkuY2F0Y2goKCkgPT4gdm9pZCAwKVxufVxuXG5mdW5jdGlvbiBwYXRjaDxQIGV4dGVuZHMgb2JqZWN0Pihwcm90bzogUCwgcHJvcDogRXh0cmFjdDxrZXlvZiBQLCBzdHJpbmc+KSB7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCBwcm9wLCB7XG4gICAgICAgIGdldCgpIHsgcmV0dXJuIHRoaXNbYGdldF8ke3NuYWtlaWZ5KHByb3ApfWBdKCkgfSxcbiAgICB9KVxufVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsQXBwc1wiKSwgKHsgQXBwcywgQXBwbGljYXRpb24gfSkgPT4ge1xuICAgIHBhdGNoKEFwcHMucHJvdG90eXBlLCBcImxpc3RcIilcbiAgICBwYXRjaChBcHBsaWNhdGlvbi5wcm90b3R5cGUsIFwia2V5d29yZHNcIilcbiAgICBwYXRjaChBcHBsaWNhdGlvbi5wcm90b3R5cGUsIFwiY2F0ZWdvcmllc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEJhdHRlcnlcIiksICh7IFVQb3dlciB9KSA9PiB7XG4gICAgcGF0Y2goVVBvd2VyLnByb3RvdHlwZSwgXCJkZXZpY2VzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsQmx1ZXRvb3RoXCIpLCAoeyBBZGFwdGVyLCBCbHVldG9vdGgsIERldmljZSB9KSA9PiB7XG4gICAgcGF0Y2goQWRhcHRlci5wcm90b3R5cGUsIFwidXVpZHNcIilcbiAgICBwYXRjaChCbHVldG9vdGgucHJvdG90eXBlLCBcImFkYXB0ZXJzXCIpXG4gICAgcGF0Y2goQmx1ZXRvb3RoLnByb3RvdHlwZSwgXCJkZXZpY2VzXCIpXG4gICAgcGF0Y2goRGV2aWNlLnByb3RvdHlwZSwgXCJ1dWlkc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEh5cHJsYW5kXCIpLCAoeyBIeXBybGFuZCwgTW9uaXRvciwgV29ya3NwYWNlIH0pID0+IHtcbiAgICBwYXRjaChIeXBybGFuZC5wcm90b3R5cGUsIFwibW9uaXRvcnNcIilcbiAgICBwYXRjaChIeXBybGFuZC5wcm90b3R5cGUsIFwid29ya3NwYWNlc1wiKVxuICAgIHBhdGNoKEh5cHJsYW5kLnByb3RvdHlwZSwgXCJjbGllbnRzXCIpXG4gICAgcGF0Y2goTW9uaXRvci5wcm90b3R5cGUsIFwiYXZhaWxhYmxlTW9kZXNcIilcbiAgICBwYXRjaChNb25pdG9yLnByb3RvdHlwZSwgXCJhdmFpbGFibGVfbW9kZXNcIilcbiAgICBwYXRjaChXb3Jrc3BhY2UucHJvdG90eXBlLCBcImNsaWVudHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxNcHJpc1wiKSwgKHsgTXByaXMsIFBsYXllciB9KSA9PiB7XG4gICAgcGF0Y2goTXByaXMucHJvdG90eXBlLCBcInBsYXllcnNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZF91cmlfc2NoZW1hc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkVXJpU2NoZW1hc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkX21pbWVfdHlwZXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZE1pbWVUeXBlc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwiY29tbWVudHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxOZXR3b3JrXCIpLCAoeyBXaWZpIH0pID0+IHtcbiAgICBwYXRjaChXaWZpLnByb3RvdHlwZSwgXCJhY2Nlc3NfcG9pbnRzXCIpXG4gICAgcGF0Y2goV2lmaS5wcm90b3R5cGUsIFwiYWNjZXNzUG9pbnRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsTm90aWZkXCIpLCAoeyBOb3RpZmQsIE5vdGlmaWNhdGlvbiB9KSA9PiB7XG4gICAgcGF0Y2goTm90aWZkLnByb3RvdHlwZSwgXCJub3RpZmljYXRpb25zXCIpXG4gICAgcGF0Y2goTm90aWZpY2F0aW9uLnByb3RvdHlwZSwgXCJhY3Rpb25zXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsUG93ZXJQcm9maWxlc1wiKSwgKHsgUG93ZXJQcm9maWxlcyB9KSA9PiB7XG4gICAgcGF0Y2goUG93ZXJQcm9maWxlcy5wcm90b3R5cGUsIFwiYWN0aW9uc1wiKVxufSlcbiIsICJpbXBvcnQgXCIuL292ZXJyaWRlcy5qc1wiXG5pbXBvcnQgeyBzZXRDb25zb2xlTG9nRG9tYWluIH0gZnJvbSBcImNvbnNvbGVcIlxuaW1wb3J0IHsgZXhpdCwgcHJvZ3JhbUFyZ3MgfSBmcm9tIFwic3lzdGVtXCJcbmltcG9ydCBJTyBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuaW1wb3J0IEdpbyBmcm9tIFwiZ2k6Ly9HaW8/dmVyc2lvbj0yLjBcIlxuaW1wb3J0IHR5cGUgQXN0YWwzIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCB0eXBlIEFzdGFsNCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTQuMFwiXG5cbnR5cGUgQ29uZmlnID0gUGFydGlhbDx7XG4gICAgaW5zdGFuY2VOYW1lOiBzdHJpbmdcbiAgICBjc3M6IHN0cmluZ1xuICAgIGljb25zOiBzdHJpbmdcbiAgICBndGtUaGVtZTogc3RyaW5nXG4gICAgaWNvblRoZW1lOiBzdHJpbmdcbiAgICBjdXJzb3JUaGVtZTogc3RyaW5nXG4gICAgaG9sZDogYm9vbGVhblxuICAgIHJlcXVlc3RIYW5kbGVyKHJlcXVlc3Q6IHN0cmluZywgcmVzOiAocmVzcG9uc2U6IGFueSkgPT4gdm9pZCk6IHZvaWRcbiAgICBtYWluKC4uLmFyZ3M6IHN0cmluZ1tdKTogdm9pZFxuICAgIGNsaWVudChtZXNzYWdlOiAobXNnOiBzdHJpbmcpID0+IHN0cmluZywgLi4uYXJnczogc3RyaW5nW10pOiB2b2lkXG59PlxuXG5pbnRlcmZhY2UgQXN0YWwzSlMgZXh0ZW5kcyBBc3RhbDMuQXBwbGljYXRpb24ge1xuICAgIGV2YWwoYm9keTogc3RyaW5nKTogUHJvbWlzZTxhbnk+XG4gICAgcmVxdWVzdEhhbmRsZXI6IENvbmZpZ1tcInJlcXVlc3RIYW5kbGVyXCJdXG4gICAgYXBwbHlfY3NzKHN0eWxlOiBzdHJpbmcsIHJlc2V0PzogYm9vbGVhbik6IHZvaWRcbiAgICBxdWl0KGNvZGU/OiBudW1iZXIpOiB2b2lkXG4gICAgc3RhcnQoY29uZmlnPzogQ29uZmlnKTogdm9pZFxufVxuXG5pbnRlcmZhY2UgQXN0YWw0SlMgZXh0ZW5kcyBBc3RhbDQuQXBwbGljYXRpb24ge1xuICAgIGV2YWwoYm9keTogc3RyaW5nKTogUHJvbWlzZTxhbnk+XG4gICAgcmVxdWVzdEhhbmRsZXI/OiBDb25maWdbXCJyZXF1ZXN0SGFuZGxlclwiXVxuICAgIGFwcGx5X2NzcyhzdHlsZTogc3RyaW5nLCByZXNldD86IGJvb2xlYW4pOiB2b2lkXG4gICAgcXVpdChjb2RlPzogbnVtYmVyKTogdm9pZFxuICAgIHN0YXJ0KGNvbmZpZz86IENvbmZpZyk6IHZvaWRcbn1cblxudHlwZSBBcHAzID0gdHlwZW9mIEFzdGFsMy5BcHBsaWNhdGlvblxudHlwZSBBcHA0ID0gdHlwZW9mIEFzdGFsNC5BcHBsaWNhdGlvblxuXG5leHBvcnQgZnVuY3Rpb24gbWtBcHA8QXBwIGV4dGVuZHMgQXBwMz4oQXBwOiBBcHApOiBBc3RhbDNKU1xuZXhwb3J0IGZ1bmN0aW9uIG1rQXBwPEFwcCBleHRlbmRzIEFwcDQ+KEFwcDogQXBwKTogQXN0YWw0SlNcblxuZXhwb3J0IGZ1bmN0aW9uIG1rQXBwKEFwcDogQXBwMyB8IEFwcDQpIHtcbiAgICByZXR1cm4gbmV3IChjbGFzcyBBc3RhbEpTIGV4dGVuZHMgQXBwIHtcbiAgICAgICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkFzdGFsSlNcIiB9LCB0aGlzIGFzIGFueSkgfVxuXG4gICAgICAgIGV2YWwoYm9keTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmbiA9IEZ1bmN0aW9uKGByZXR1cm4gKGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJHtib2R5LmluY2x1ZGVzKFwiO1wiKSA/IGJvZHkgOiBgcmV0dXJuICR7Ym9keX07YH1cbiAgICAgICAgICAgICAgICAgICAgfSlgKVxuICAgICAgICAgICAgICAgICAgICBmbigpKCkudGhlbihyZXMpLmNhdGNoKHJlailcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlaihlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgcmVxdWVzdEhhbmRsZXI/OiBDb25maWdbXCJyZXF1ZXN0SGFuZGxlclwiXVxuXG4gICAgICAgIHZmdW5jX3JlcXVlc3QobXNnOiBzdHJpbmcsIGNvbm46IEdpby5Tb2NrZXRDb25uZWN0aW9uKTogdm9pZCB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHRoaXMucmVxdWVzdEhhbmRsZXIgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIHRoaXMucmVxdWVzdEhhbmRsZXIobXNnLCAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgSU8ud3JpdGVfc29jayhjb25uLCBTdHJpbmcocmVzcG9uc2UpLCAoXywgcmVzKSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgSU8ud3JpdGVfc29ja19maW5pc2gocmVzKSxcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdXBlci52ZnVuY19yZXF1ZXN0KG1zZywgY29ubilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGFwcGx5X2NzcyhzdHlsZTogc3RyaW5nLCByZXNldCA9IGZhbHNlKSB7XG4gICAgICAgICAgICBzdXBlci5hcHBseV9jc3Moc3R5bGUsIHJlc2V0KVxuICAgICAgICB9XG5cbiAgICAgICAgcXVpdChjb2RlPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgICAgICBzdXBlci5xdWl0KClcbiAgICAgICAgICAgIGV4aXQoY29kZSA/PyAwKVxuICAgICAgICB9XG5cbiAgICAgICAgc3RhcnQoeyByZXF1ZXN0SGFuZGxlciwgY3NzLCBob2xkLCBtYWluLCBjbGllbnQsIGljb25zLCAuLi5jZmcgfTogQ29uZmlnID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IGFwcCA9IHRoaXMgYXMgdW5rbm93biBhcyBJbnN0YW5jZVR5cGU8QXBwMyB8IEFwcDQ+XG5cbiAgICAgICAgICAgIGNsaWVudCA/Pz0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHByaW50KGBBc3RhbCBpbnN0YW5jZSBcIiR7YXBwLmluc3RhbmNlTmFtZX1cIiBhbHJlYWR5IHJ1bm5pbmdgKVxuICAgICAgICAgICAgICAgIGV4aXQoMSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjZmcpXG4gICAgICAgICAgICBzZXRDb25zb2xlTG9nRG9tYWluKGFwcC5pbnN0YW5jZU5hbWUpXG5cbiAgICAgICAgICAgIHRoaXMucmVxdWVzdEhhbmRsZXIgPSByZXF1ZXN0SGFuZGxlclxuICAgICAgICAgICAgYXBwLmNvbm5lY3QoXCJhY3RpdmF0ZVwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbWFpbj8uKC4uLnByb2dyYW1BcmdzKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhcHAuYWNxdWlyZV9zb2NrZXQoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNsaWVudChtc2cgPT4gSU8uc2VuZF9tZXNzYWdlKGFwcC5pbnN0YW5jZU5hbWUsIG1zZykhLCAuLi5wcm9ncmFtQXJncylcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNzcylcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5X2Nzcyhjc3MsIGZhbHNlKVxuXG4gICAgICAgICAgICBpZiAoaWNvbnMpXG4gICAgICAgICAgICAgICAgYXBwLmFkZF9pY29ucyhpY29ucylcblxuICAgICAgICAgICAgaG9sZCA/Pz0gdHJ1ZVxuICAgICAgICAgICAgaWYgKGhvbGQpXG4gICAgICAgICAgICAgICAgYXBwLmhvbGQoKVxuXG4gICAgICAgICAgICBhcHAucnVuQXN5bmMoW10pXG4gICAgICAgIH1cbiAgICB9KVxufVxuIiwgIi8qIGVzbGludC1kaXNhYmxlIG1heC1sZW4gKi9cbmltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgR09iamVjdCBmcm9tIFwiZ2k6Ly9HT2JqZWN0XCJcbmltcG9ydCBhc3RhbGlmeSwgeyB0eXBlIENvbnN0cnVjdFByb3BzLCB0eXBlIEJpbmRhYmxlQ2hpbGQgfSBmcm9tIFwiLi9hc3RhbGlmeS5qc1wiXG5cbi8vIEJveFxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEFzdGFsLkJveC5wcm90b3R5cGUsIFwiY2hpbGRyZW5cIiwge1xuICAgIGdldCgpIHsgcmV0dXJuIHRoaXMuZ2V0X2NoaWxkcmVuKCkgfSxcbiAgICBzZXQodikgeyB0aGlzLnNldF9jaGlsZHJlbih2KSB9LFxufSlcblxuZXhwb3J0IHR5cGUgQm94UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxCb3gsIEFzdGFsLkJveC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIEJveCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkJveCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJCb3hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBCb3hQcm9wcywgLi4uY2hpbGRyZW46IEFycmF5PEJpbmRhYmxlQ2hpbGQ+KSB7IHN1cGVyKHsgY2hpbGRyZW4sIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIEJ1dHRvblxuZXhwb3J0IHR5cGUgQnV0dG9uUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxCdXR0b24sIEFzdGFsLkJ1dHRvbi5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25DbGlja2VkOiBbXVxuICAgIG9uQ2xpY2s6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkNsaWNrUmVsZWFzZTogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uSG92ZXI6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvbkhvdmVyTG9zdDogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uU2Nyb2xsOiBbZXZlbnQ6IEFzdGFsLlNjcm9sbEV2ZW50XVxufT5cbmV4cG9ydCBjbGFzcyBCdXR0b24gZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5CdXR0b24pIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQnV0dG9uXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQnV0dG9uUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBDZW50ZXJCb3hcbmV4cG9ydCB0eXBlIENlbnRlckJveFByb3BzID0gQ29uc3RydWN0UHJvcHM8Q2VudGVyQm94LCBBc3RhbC5DZW50ZXJCb3guQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBDZW50ZXJCb3ggZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5DZW50ZXJCb3gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQ2VudGVyQm94XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQ2VudGVyQm94UHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBDaXJjdWxhclByb2dyZXNzXG5leHBvcnQgdHlwZSBDaXJjdWxhclByb2dyZXNzUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxDaXJjdWxhclByb2dyZXNzLCBBc3RhbC5DaXJjdWxhclByb2dyZXNzLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgQ2lyY3VsYXJQcm9ncmVzcyBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkNpcmN1bGFyUHJvZ3Jlc3MpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQ2lyY3VsYXJQcm9ncmVzc1wiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IENpcmN1bGFyUHJvZ3Jlc3NQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIERyYXdpbmdBcmVhXG5leHBvcnQgdHlwZSBEcmF3aW5nQXJlYVByb3BzID0gQ29uc3RydWN0UHJvcHM8RHJhd2luZ0FyZWEsIEd0ay5EcmF3aW5nQXJlYS5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25EcmF3OiBbY3I6IGFueV0gLy8gVE9ETzogY2Fpcm8gdHlwZXNcbn0+XG5leHBvcnQgY2xhc3MgRHJhd2luZ0FyZWEgZXh0ZW5kcyBhc3RhbGlmeShHdGsuRHJhd2luZ0FyZWEpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiRHJhd2luZ0FyZWFcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBEcmF3aW5nQXJlYVByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBFbnRyeVxuZXhwb3J0IHR5cGUgRW50cnlQcm9wcyA9IENvbnN0cnVjdFByb3BzPEVudHJ5LCBHdGsuRW50cnkuQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uQ2hhbmdlZDogW11cbiAgICBvbkFjdGl2YXRlOiBbXVxufT5cbmV4cG9ydCBjbGFzcyBFbnRyeSBleHRlbmRzIGFzdGFsaWZ5KEd0ay5FbnRyeSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJFbnRyeVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEVudHJ5UHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIEV2ZW50Qm94XG5leHBvcnQgdHlwZSBFdmVudEJveFByb3BzID0gQ29uc3RydWN0UHJvcHM8RXZlbnRCb3gsIEFzdGFsLkV2ZW50Qm94LkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkNsaWNrOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25DbGlja1JlbGVhc2U6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkhvdmVyOiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25Ib3Zlckxvc3Q6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvblNjcm9sbDogW2V2ZW50OiBBc3RhbC5TY3JvbGxFdmVudF1cbn0+XG5leHBvcnQgY2xhc3MgRXZlbnRCb3ggZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5FdmVudEJveCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJFdmVudEJveFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEV2ZW50Qm94UHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyAvLyBUT0RPOiBGaXhlZFxuLy8gLy8gVE9ETzogRmxvd0JveFxuLy9cbi8vIEljb25cbmV4cG9ydCB0eXBlIEljb25Qcm9wcyA9IENvbnN0cnVjdFByb3BzPEljb24sIEFzdGFsLkljb24uQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBJY29uIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuSWNvbikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJJY29uXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogSWNvblByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBMYWJlbFxuZXhwb3J0IHR5cGUgTGFiZWxQcm9wcyA9IENvbnN0cnVjdFByb3BzPExhYmVsLCBBc3RhbC5MYWJlbC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIExhYmVsIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuTGFiZWwpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiTGFiZWxcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBMYWJlbFByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBMZXZlbEJhclxuZXhwb3J0IHR5cGUgTGV2ZWxCYXJQcm9wcyA9IENvbnN0cnVjdFByb3BzPExldmVsQmFyLCBBc3RhbC5MZXZlbEJhci5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIExldmVsQmFyIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuTGV2ZWxCYXIpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiTGV2ZWxCYXJcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBMZXZlbEJhclByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBUT0RPOiBMaXN0Qm94XG5cbi8vIE92ZXJsYXlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShBc3RhbC5PdmVybGF5LnByb3RvdHlwZSwgXCJvdmVybGF5c1wiLCB7XG4gICAgZ2V0KCkgeyByZXR1cm4gdGhpcy5nZXRfb3ZlcmxheXMoKSB9LFxuICAgIHNldCh2KSB7IHRoaXMuc2V0X292ZXJsYXlzKHYpIH0sXG59KVxuXG5leHBvcnQgdHlwZSBPdmVybGF5UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxPdmVybGF5LCBBc3RhbC5PdmVybGF5LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgT3ZlcmxheSBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLk92ZXJsYXkpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiT3ZlcmxheVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IE92ZXJsYXlQcm9wcywgLi4uY2hpbGRyZW46IEFycmF5PEJpbmRhYmxlQ2hpbGQ+KSB7IHN1cGVyKHsgY2hpbGRyZW4sIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIFJldmVhbGVyXG5leHBvcnQgdHlwZSBSZXZlYWxlclByb3BzID0gQ29uc3RydWN0UHJvcHM8UmV2ZWFsZXIsIEd0ay5SZXZlYWxlci5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFJldmVhbGVyIGV4dGVuZHMgYXN0YWxpZnkoR3RrLlJldmVhbGVyKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlJldmVhbGVyXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogUmV2ZWFsZXJQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIFNjcm9sbGFibGVcbmV4cG9ydCB0eXBlIFNjcm9sbGFibGVQcm9wcyA9IENvbnN0cnVjdFByb3BzPFNjcm9sbGFibGUsIEFzdGFsLlNjcm9sbGFibGUuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBTY3JvbGxhYmxlIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuU2Nyb2xsYWJsZSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTY3JvbGxhYmxlXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU2Nyb2xsYWJsZVByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gU2xpZGVyXG5leHBvcnQgdHlwZSBTbGlkZXJQcm9wcyA9IENvbnN0cnVjdFByb3BzPFNsaWRlciwgQXN0YWwuU2xpZGVyLkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkRyYWdnZWQ6IFtdXG59PlxuZXhwb3J0IGNsYXNzIFNsaWRlciBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLlNsaWRlcikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTbGlkZXJcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTbGlkZXJQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gU3RhY2tcbmV4cG9ydCB0eXBlIFN0YWNrUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTdGFjaywgQXN0YWwuU3RhY2suQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBTdGFjayBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLlN0YWNrKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlN0YWNrXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU3RhY2tQcm9wcywgLi4uY2hpbGRyZW46IEFycmF5PEJpbmRhYmxlQ2hpbGQ+KSB7IHN1cGVyKHsgY2hpbGRyZW4sIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIFN3aXRjaFxuZXhwb3J0IHR5cGUgU3dpdGNoUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTd2l0Y2gsIEd0ay5Td2l0Y2guQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBTd2l0Y2ggZXh0ZW5kcyBhc3RhbGlmeShHdGsuU3dpdGNoKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlN3aXRjaFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFN3aXRjaFByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBXaW5kb3dcbmV4cG9ydCB0eXBlIFdpbmRvd1Byb3BzID0gQ29uc3RydWN0UHJvcHM8V2luZG93LCBBc3RhbC5XaW5kb3cuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBXaW5kb3cgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5XaW5kb3cpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiV2luZG93XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogV2luZG93UHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuIiwgIioge1xuICBjb2xvcjogI2YxZjFmMTtcbiAgZm9udC1zaXplOiAxNnB4O1xufVxuXG4uQmFyIHtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbn1cbi5CYXIgaWNvbiB7XG4gIGZvbnQtc2l6ZTogMjBweDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG59XG4uQmFyIC5pY29uIHtcbiAgZm9udC1zaXplOiAyMnB4O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgLyogbWFyZ2luLWJvdHRvbTogMnB4OyAqL1xufVxuLkJhciAuc3RhdHVzIHtcbiAgbWFyZ2luOiAwIDhweDtcbn1cblxuLmJhdHRlcnkuY2hhcmdpbmcge1xuICAvKiBsYWJlbCB7XG4gICAgY29sb3I6ICRhY2NlbnQ7XG4gIH0gKi9cbn1cbi5iYXR0ZXJ5LmNoYXJnaW5nIC5pY29uIHtcbiAgY29sb3I6ICMyQjgyRDM7XG4gIG1hcmdpbi1yaWdodDogMTBweDtcbn1cblxuYnV0dG9uIHtcbiAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gIGJvcmRlcjogbm9uZTtcbiAgcGFkZGluZzogMDtcbiAgYm9yZGVyLXJhZGl1czogMDtcbn1cblxuaWNvbiB7XG4gIGZvbnQtc2l6ZTogMjVweDtcbn1cblxuLndvcmtzcGFjZXMgaWNvbiB7XG4gIG1hcmdpbi10b3A6IDJweDtcbiAgbWFyZ2luLWxlZnQ6IDVweDtcbn1cbi53b3Jrc3BhY2VzIGJ1dHRvbiB7XG4gIHBhZGRpbmctcmlnaHQ6IDRweDtcbiAgcGFkZGluZy10b3A6IDNweDtcbiAgYm9yZGVyLWJvdHRvbTogM3B4IHNvbGlkICMyMTIyMjM7XG4gIGZvbnQtd2VpZ2h0OiBub3JtYWw7XG59XG4ud29ya3NwYWNlcyBidXR0b24gbGFiZWwge1xuICBtYXJnaW4tbGVmdDogOHB4O1xuICBtYXJnaW4tcmlnaHQ6IDRweDtcbn1cbi53b3Jrc3BhY2VzIGJ1dHRvbi5leGlzdCB7XG4gIGJvcmRlci1ib3R0b206IDNweCBzb2xpZCAjNDE0MjQzO1xufVxuLndvcmtzcGFjZXMgYnV0dG9uLmZvY3VzZWQge1xuICAvKiBiYWNrZ3JvdW5kOiAkYWNjZW50OyAqL1xuICBiYWNrZ3JvdW5kOiAjNDE0MjQzO1xuICBib3JkZXItYm90dG9tOiAzcHggc29saWQgIzJCODJEMztcbn1cblxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggYnV0dG9uIHtcbiAgYmFja2dyb3VuZDogIzQxNDI0MztcbiAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgbWFyZ2luOiAwIDJweDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94ID4gYm94IHtcbiAgbWFyZ2luOiA0cHg7XG4gIGJhY2tncm91bmQ6ICMyMTIyMjM7XG4gIHBhZGRpbmc6IDRweCAycHg7XG4gIG1pbi13aWR0aDogMzAwcHg7XG4gIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gIGJvcmRlcjogMnB4IHNvbGlkIHJlZDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94IC5pbWFnZSB7XG4gIG1pbi1oZWlnaHQ6IDQ4cHg7XG4gIG1pbi13aWR0aDogNDhweDtcbiAgZm9udC1zaXplOiA0OHB4O1xuICBtYXJnaW46IDhweDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94IC5tYWluIHtcbiAgcGFkZGluZy1sZWZ0OiA0cHg7XG4gIG1hcmdpbi1ib3R0b206IDJweDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94IC5tYWluIC5oZWFkZXIgLnN1bW1hcnkge1xuICBmb250LXNpemU6IDEuMmVtO1xuICBmb250LXdlaWdodDogYm9sZDtcbn1cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94LmNyaXRpY2FsID4gYm94IHtcbiAgYm9yZGVyLWNvbG9yOiAjMkI4MkQzO1xufVxuXG4uY2xvY2sgLmljb24ge1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgY29sb3I6ICMyQjgyRDM7XG59XG5cbi50cmF5IHtcbiAgbWFyZ2luLXJpZ2h0OiAycHg7XG59XG4udHJheSBpY29uIHtcbiAgZm9udC1zaXplOiAxOHB4O1xuICBtYXJnaW46IDAgNHB4O1xufVxuXG4jbGF1bmNoZXIge1xuICBiYWNrZ3JvdW5kOiBub25lO1xufVxuI2xhdW5jaGVyIC5tYWluIHtcbiAgcGFkZGluZzogNHB4O1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xuICBib3JkZXItcmFkaXVzOiAxNnB4O1xufVxuI2xhdW5jaGVyIC5tYWluIGljb24ge1xuICBtYXJnaW46IDAgNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIC5kZXNjcmlwdGlvbiB7XG4gIGNvbG9yOiAjYmJiO1xuICBmb250LXNpemU6IDAuOGVtO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbjpob3ZlcixcbiNsYXVuY2hlciAubWFpbiBidXR0b246Zm9jdXMge1xuICBib3JkZXI6IDJweCBzb2xpZCAjMkI4MkQzO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbiB7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0MTQyNDM7XG59XG4jbGF1bmNoZXIgLm1haW4gYnV0dG9uLFxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgYmFja2dyb3VuZDogIzQxNDI0MztcbiAgb3V0bGluZTogbm9uZTtcbn1cbiNsYXVuY2hlciAubWFpbiBlbnRyeSB7XG4gIHBhZGRpbmc6IDJweCAxMHB4O1xuICBtYXJnaW4tYm90dG9tOiA4cHg7XG4gIGJvcmRlcjogbm9uZTtcbiAgbWluLWhlaWdodDogMjRweDtcbiAgZm9udC1zaXplOiAxLjNyZW07XG59XG5cbi5Pc2QgYm94IHtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMjRweDtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xufVxuLk9zZCBib3ggdHJvdWdoIHtcbiAgcGFkZGluZzogMDtcbiAgbWFyZ2luOiA4cHg7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbn1cbi5Pc2QgYm94IHRyb3VnaCBibG9jayB7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyOiBub25lO1xufVxuLk9zZCBib3ggdHJvdWdoIGJsb2NrLmZpbGxlZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xufVxuLk9zZCBib3ggbGFiZWwge1xuICBtaW4td2lkdGg6IDQwcHg7XG59IiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXN0YWxJTyB9IGZyb20gXCJnaTovL0FzdGFsSU8/dmVyc2lvbj0wLjFcIlxuZXhwb3J0ICogZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5leHBvcnQgKiBmcm9tIFwiLi90aW1lLmpzXCJcbmV4cG9ydCAqIGZyb20gXCIuL2ZpbGUuanNcIlxuZXhwb3J0ICogZnJvbSBcIi4vZ29iamVjdC5qc1wiXG5leHBvcnQgeyBiaW5kLCBkZWZhdWx0IGFzIEJpbmRpbmcgfSBmcm9tIFwiLi9iaW5kaW5nLmpzXCJcbmV4cG9ydCB7IFZhcmlhYmxlIH0gZnJvbSBcIi4vdmFyaWFibGUuanNcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcblxuZXhwb3J0IHsgR2lvIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRGaWxlKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEFzdGFsLnJlYWRfZmlsZShwYXRoKSB8fCBcIlwiXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlsZUFzeW5jKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgQXN0YWwucmVhZF9maWxlX2FzeW5jKHBhdGgsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5yZWFkX2ZpbGVfZmluaXNoKHJlcykgfHwgXCJcIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgQXN0YWwud3JpdGVfZmlsZShwYXRoLCBjb250ZW50KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlQXN5bmMocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBBc3RhbC53cml0ZV9maWxlX2FzeW5jKHBhdGgsIGNvbnRlbnQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC53cml0ZV9maWxlX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25pdG9yRmlsZShcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgY2FsbGJhY2s6IChmaWxlOiBzdHJpbmcsIGV2ZW50OiBHaW8uRmlsZU1vbml0b3JFdmVudCkgPT4gdm9pZCxcbik6IEdpby5GaWxlTW9uaXRvciB7XG4gICAgcmV0dXJuIEFzdGFsLm1vbml0b3JfZmlsZShwYXRoLCAoZmlsZTogc3RyaW5nLCBldmVudDogR2lvLkZpbGVNb25pdG9yRXZlbnQpID0+IHtcbiAgICAgICAgY2FsbGJhY2soZmlsZSwgZXZlbnQpXG4gICAgfSkhXG59XG4iLCAiaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5cbmV4cG9ydCB7IGRlZmF1bHQgYXMgR0xpYiB9IGZyb20gXCJnaTovL0dMaWI/dmVyc2lvbj0yLjBcIlxuZXhwb3J0IHsgR09iamVjdCwgR09iamVjdCBhcyBkZWZhdWx0IH1cblxuY29uc3QgbWV0YSA9IFN5bWJvbChcIm1ldGFcIilcbmNvbnN0IHByaXYgPSBTeW1ib2woXCJwcml2XCIpXG5cbmNvbnN0IHsgUGFyYW1TcGVjLCBQYXJhbUZsYWdzIH0gPSBHT2JqZWN0XG5cbmNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG50eXBlIFNpZ25hbERlY2xhcmF0aW9uID0ge1xuICAgIGZsYWdzPzogR09iamVjdC5TaWduYWxGbGFnc1xuICAgIGFjY3VtdWxhdG9yPzogR09iamVjdC5BY2N1bXVsYXRvclR5cGVcbiAgICByZXR1cm5fdHlwZT86IEdPYmplY3QuR1R5cGVcbiAgICBwYXJhbV90eXBlcz86IEFycmF5PEdPYmplY3QuR1R5cGU+XG59XG5cbnR5cGUgUHJvcGVydHlEZWNsYXJhdGlvbiA9XG4gICAgfCBJbnN0YW5jZVR5cGU8dHlwZW9mIEdPYmplY3QuUGFyYW1TcGVjPlxuICAgIHwgeyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfVxuICAgIHwgdHlwZW9mIFN0cmluZ1xuICAgIHwgdHlwZW9mIE51bWJlclxuICAgIHwgdHlwZW9mIEJvb2xlYW5cbiAgICB8IHR5cGVvZiBPYmplY3RcblxudHlwZSBHT2JqZWN0Q29uc3RydWN0b3IgPSB7XG4gICAgW21ldGFdPzoge1xuICAgICAgICBQcm9wZXJ0aWVzPzogeyBba2V5OiBzdHJpbmddOiBHT2JqZWN0LlBhcmFtU3BlYyB9XG4gICAgICAgIFNpZ25hbHM/OiB7IFtrZXk6IHN0cmluZ106IEdPYmplY3QuU2lnbmFsRGVmaW5pdGlvbiB9XG4gICAgfVxuICAgIG5ldyguLi5hcmdzOiBhbnlbXSk6IGFueVxufVxuXG50eXBlIE1ldGFJbmZvID0gR09iamVjdC5NZXRhSW5mbzxuZXZlciwgQXJyYXk8eyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfT4sIG5ldmVyPlxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXIob3B0aW9uczogTWV0YUluZm8gPSB7fSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoY2xzOiBHT2JqZWN0Q29uc3RydWN0b3IpIHtcbiAgICAgICAgY29uc3QgdCA9IG9wdGlvbnMuVGVtcGxhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiICYmICF0LnN0YXJ0c1dpdGgoXCJyZXNvdXJjZTovL1wiKSAmJiAhdC5zdGFydHNXaXRoKFwiZmlsZTovL1wiKSkge1xuICAgICAgICAgICAgLy8gYXNzdW1lIHhtbCB0ZW1wbGF0ZVxuICAgICAgICAgICAgb3B0aW9ucy5UZW1wbGF0ZSA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0KVxuICAgICAgICB9XG5cbiAgICAgICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgICAgIFNpZ25hbHM6IHsgLi4uY2xzW21ldGFdPy5TaWduYWxzIH0sXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7IC4uLmNsc1ttZXRhXT8uUHJvcGVydGllcyB9LFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgfSwgY2xzKVxuXG4gICAgICAgIGRlbGV0ZSBjbHNbbWV0YV1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9wZXJ0eShkZWNsYXJhdGlvbjogUHJvcGVydHlEZWNsYXJhdGlvbiA9IE9iamVjdCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHByb3A6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikge1xuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0gPz89IHt9XG4gICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5Qcm9wZXJ0aWVzID8/PSB7fVxuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBrZWJhYmlmeShwcm9wKVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJpdl0/Lltwcm9wXSA/PyBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb24pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzW3Byb3BdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzW3ByaXZdID8/PSB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcml2XVtwcm9wXSA9IHZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZ5KG5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYHNldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSh2OiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHZcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYGdldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJvcF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlByb3BlcnRpZXNba2ViYWJpZnkocHJvcCldID0gcHNwZWMobmFtZSwgUGFyYW1GbGFncy5SRUFEV1JJVEUsIGRlY2xhcmF0aW9uKVxuICAgICAgICB9XG5cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZmxhZ3MgPSAwXG4gICAgICAgICAgICBpZiAoZGVzYy5nZXQpIGZsYWdzIHw9IFBhcmFtRmxhZ3MuUkVBREFCTEVcbiAgICAgICAgICAgIGlmIChkZXNjLnNldCkgZmxhZ3MgfD0gUGFyYW1GbGFncy5XUklUQUJMRVxuXG4gICAgICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uUHJvcGVydGllc1trZWJhYmlmeShwcm9wKV0gPSBwc3BlYyhuYW1lLCBmbGFncywgZGVjbGFyYXRpb24pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduYWwoLi4ucGFyYW1zOiBBcnJheTx7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdD4pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKFxuICAgIGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24gfCB7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdCxcbiAgICAuLi5wYXJhbXM6IEFycmF5PHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH0gfCB0eXBlb2YgT2JqZWN0PlxuKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdID8/PSB7fVxuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uU2lnbmFscyA/Pz0ge31cblxuICAgICAgICBjb25zdCBuYW1lID0ga2ViYWJpZnkoc2lnbmFsKVxuXG4gICAgICAgIGlmIChkZWNsYXJhdGlvbiB8fCBwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBUT0RPOiB0eXBlIGFzc2VydFxuICAgICAgICAgICAgY29uc3QgYXJyID0gW2RlY2xhcmF0aW9uLCAuLi5wYXJhbXNdLm1hcCh2ID0+IHYuJGd0eXBlKVxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlNpZ25hbHNbbmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgcGFyYW1fdHlwZXM6IGFycixcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5TaWduYWxzW25hbWVdID0gZGVjbGFyYXRpb24gfHwge1xuICAgICAgICAgICAgICAgIHBhcmFtX3R5cGVzOiBbXSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgc2lnbmFsLCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQobmFtZSwgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IG9nOiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSA9IGRlc2MudmFsdWVcbiAgICAgICAgICAgIGRlc2MudmFsdWUgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIG5vdCB0eXBlZFxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChuYW1lLCAuLi5hcmdzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYG9uXyR7bmFtZS5yZXBsYWNlKFwiLVwiLCBcIl9cIil9YCwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9nKC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBzcGVjKG5hbWU6IHN0cmluZywgZmxhZ3M6IG51bWJlciwgZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvblxuXG4gICAgc3dpdGNoIChkZWNsYXJhdGlvbikge1xuICAgICAgICBjYXNlIFN0cmluZzpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuc3RyaW5nKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBcIlwiKVxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuZG91YmxlKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCAtTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSwgMClcbiAgICAgICAgY2FzZSBCb29sZWFuOlxuICAgICAgICAgICAgcmV0dXJuIFBhcmFtU3BlYy5ib29sZWFuKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBmYWxzZSlcbiAgICAgICAgY2FzZSBPYmplY3Q6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLmpzb2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzKVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBtaXNzdHlwZWRcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMub2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBkZWNsYXJhdGlvbi4kZ3R5cGUpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvbi5nZXRfZGVmYXVsdF92YWx1ZSgpXG5cbiAgICBzd2l0Y2ggKGRlY2xhcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgU3RyaW5nOlxuICAgICAgICAgICAgcmV0dXJuIFwiZGVmYXVsdC1zdHJpbmdcIlxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIGNhc2UgQm9vbGVhbjpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBjYXNlIE9iamVjdDpcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgfVxufVxuIiwgImltcG9ydCB7IFZhcmlhYmxlLCBHTGliLCBiaW5kLCBleGVjQXN5bmMgfSBmcm9tIFwiYXN0YWxcIjtcbmltcG9ydCB7IEFzdGFsLCBHdGsgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiO1xuaW1wb3J0IEJhdHRlcnkgZnJvbSBcImdpOi8vQXN0YWxCYXR0ZXJ5XCI7XG5pbXBvcnQgV29ya3NwYWNlcyBmcm9tIFwiLi93b3Jrc3BhY2VzXCI7XG5pbXBvcnQgVHJheSBmcm9tIFwiLi90cmF5XCI7XG5pbXBvcnQgV3AgZnJvbSBcImdpOi8vQXN0YWxXcFwiO1xuaW1wb3J0IE5ldHdvcmsgZnJvbSBcImdpOi8vQXN0YWxOZXR3b3JrXCI7XG5cbmZ1bmN0aW9uIEJhdHRlcnlMZXZlbCgpIHtcbiAgY29uc3QgYmF0ID0gQmF0dGVyeS5nZXRfZGVmYXVsdCgpO1xuICBjb25zdCBpY29ucyA9IHtcbiAgICAvLyBiYXR0ZXJ5IGljb25zIGZyb20gbmVyZCBmb250cyBodHRwczovL3d3dy5uZXJkZm9udHMuY29tL1xuICAgIFwiYmF0dGVyeS1sZXZlbC0wLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgyXHVEQzlGXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgyXHVEQzlDXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTIwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzg2XCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTMwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzg3XCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTQwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzg4XCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTUwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgyXHVEQzlEXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTYwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzg5XCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTcwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgyXHVEQzlFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTgwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzhBXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTkwLWNoYXJnaW5nLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzhCXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwMC1jaGFyZ2VkLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzg1XCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTAtc3ltYm9saWNcIjogXCJcdURCODBcdURDOEVcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMTAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0FcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMjAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0JcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMzAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0NcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNDAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0RcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNTAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0VcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNjAtc3ltYm9saWNcIjogXCJcdURCODBcdURDN0ZcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNzAtc3ltYm9saWNcIjogXCJcdURCODBcdURDODBcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtODAtc3ltYm9saWNcIjogXCJcdURCODBcdURDODFcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtOTAtc3ltYm9saWNcIjogXCJcdURCODBcdURDODJcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMTAwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzc5XCIsXG4gIH07XG5cbiAgbGV0IHdhc05vdGlmaWVkID0gZmFsc2U7XG5cblxuICByZXR1cm4gKFxuICAgIDxib3hcbiAgICAgIGNsYXNzTmFtZT17YmluZChiYXQsIFwiY2hhcmdpbmdcIikuYXMoYyA9PiBjID8gXCJjaGFyZ2luZyBiYXR0ZXJ5IHN0YXR1c1wiIDogXCJiYXR0ZXJ5IHN0YXR1c1wiKX1cbiAgICAgIGhleHBhbmRcbiAgICA+XG4gICAgICA8bGFiZWxcbiAgICAgICAgY2xhc3NOYW1lPVwiaWNvblwiXG4gICAgICAgIGxhYmVsPXtiaW5kKGJhdCwgXCJiYXR0ZXJ5SWNvbk5hbWVcIikuYXMoKGIpID0+IGljb25zW2JdKX1cbiAgICAgIC8+XG4gICAgICA8bGFiZWxcbiAgICAgICAgbGFiZWw9e2JpbmQoYmF0LCBcInBlcmNlbnRhZ2VcIikuYXMoKHApID0+IHtcbiAgICAgICAgICBpZiAocCA8IDAuMikge1xuICAgICAgICAgICAgaWYgKCF3YXNOb3RpZmllZCkge1xuICAgICAgICAgICAgICBleGVjQXN5bmMoW1wibm90aWZ5LXNlbmRcIiwgXCItdVwiLCBcImNyaXRpY2FsXCIsIFwiLWlcIiwgXCJiYXR0ZXJ5LWNhdXRpb24tc3ltYm9saWNcIiwgXCJMb3cgQmF0dGVyeVwiXSlcbiAgICAgICAgICAgICAgd2FzTm90aWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB3YXNOb3RpZmllZCA9IGZhbHNlO1xuICAgICAgICAgIHJldHVybiBgJHtNYXRoLmZsb29yKHAgKiAxMDApfSVgO1xuICAgICAgICB9KX1cbiAgICAgIC8+XG4gICAgPC9ib3g+XG4gICk7XG59XG5cbmZ1bmN0aW9uIFZvbHVtZSgpIHtcbiAgY29uc3Qgc3BlYWtlciA9IFdwLmdldF9kZWZhdWx0KCk/LmF1ZGlvLmRlZmF1bHRTcGVha2VyO1xuXG4gIHJldHVybiAoXG4gICAgPGJveCBjbGFzc05hbWU9XCJ2b2x1bWUgc3RhdHVzXCI+XG4gICAgICA8aWNvbiBpY29uPXtiaW5kKHNwZWFrZXIsIFwidm9sdW1lSWNvblwiKX0gLz5cbiAgICAgIDxsYWJlbCBsYWJlbD17YmluZChzcGVha2VyLCBcInZvbHVtZVwiKS5hcygocCkgPT4gYCR7TWF0aC5mbG9vcihwICogMTAwKX0lYCl9IC8+XG4gICAgPC9ib3g+XG4gICk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEJhcihtb25pdG9yKSB7XG4gIGNvbnN0IHsgVE9QLCBSSUdIVCwgTEVGVCB9ID0gQXN0YWwuV2luZG93QW5jaG9yO1xuXG4gIGNvbnN0IG5ldHdvcmsgPSBOZXR3b3JrLmdldF9kZWZhdWx0KCk7XG4gIGNvbnN0IHdpZmkgPSBiaW5kKG5ldHdvcmssIFwid2lmaVwiKTtcblxuICBwcmludChcImFhYVwiKVxuXG4gIHJldHVybiAoXG4gICAgPHdpbmRvd1xuICAgICAgY2xhc3NOYW1lPVwiQmFyXCJcbiAgICAgIG5hbWVzcGFjZT1cImFncy1iYXJcIlxuICAgICAgZ2RrbW9uaXRvcj17bW9uaXRvcn1cbiAgICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5FWENMVVNJVkV9XG4gICAgICBhbmNob3I9e1RPUCB8IExFRlQgfCBSSUdIVH1cbiAgICAvLyBsYXllcj17QXN0YWwuTGF5ZXIuQm90dG9tfVxuICAgID5cbiAgICAgIDxjZW50ZXJib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBzdGFydFwiIGhhbGlnbj17R3RrLkFsaWduLlNUQVJUfT5cbiAgICAgICAgICA8V29ya3NwYWNlcyAvPlxuICAgICAgICA8L2JveD5cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJzZWdtZW50IGNlbnRlclwiPlxuICAgICAgICAgIDxsYWJlbFxuICAgICAgICAgICAgbGFiZWw9e1ZhcmlhYmxlKFwiXCIpLnBvbGwoNTAwMCwgKCkgPT5cbiAgICAgICAgICAgICAgR0xpYi5EYXRlVGltZS5uZXdfbm93X2xvY2FsKCkuZm9ybWF0KFwiJUg6JU0gJUEgJWQvJW0vJVlcIiksXG4gICAgICAgICAgICApKCl9XG4gICAgICAgICAgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBlbmRcIiBoYWxpZ249e0d0ay5BbGlnbi5FTkR9ID5cbiAgICAgICAgICA8VHJheSAvPlxuICAgICAgICAgIDxib3hcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5ldHdvcmsgc3RhdHVzXCJcbiAgICAgICAgICAgIGhhbGlnbj17R3RrLkFsaWduLkNFTlRFUn1cbiAgICAgICAgICAgIGhleHBhbmRcbiAgICAgICAgICA+XG4gICAgICAgICAgICB7d2lmaS5hcyhcbiAgICAgICAgICAgICAgKHdpZmkpID0+XG4gICAgICAgICAgICAgICAgd2lmaSAmJiAoXG4gICAgICAgICAgICAgICAgICA8aWNvblxuICAgICAgICAgICAgICAgICAgICB0b29sdGlwVGV4dD17YmluZCh3aWZpLCBcInNzaWRcIikuYXMoU3RyaW5nKX1cbiAgICAgICAgICAgICAgICAgICAgaWNvbj17YmluZCh3aWZpLCBcImljb25OYW1lXCIpfVxuICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIHt3aWZpLmFzKFxuICAgICAgICAgICAgICAod2lmaSkgPT5cbiAgICAgICAgICAgICAgICB3aWZpICYmIChcbiAgICAgICAgICAgICAgICAgIDxsYWJlbCBsYWJlbD17YmluZCh3aWZpLCBcInNzaWRcIil9IC8+XG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICl9XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPEJhdHRlcnlMZXZlbCAvPlxuICAgICAgICAgIDxWb2x1bWUgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICA8L2NlbnRlcmJveD5cbiAgICA8L3dpbmRvdyA+XG4gICk7XG59XG4iLCAiaW1wb3J0IEh5cHJsYW5kIGZyb20gXCJnaTovL0FzdGFsSHlwcmxhbmRcIjtcbmltcG9ydCB7IGJpbmQgfSBmcm9tIFwiYXN0YWxcIjtcbmltcG9ydCB7IGdldF9pY29uIH0gZnJvbSBcIi4uL3V0aWwuanNcIjtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gV29ya3NwYWNlcyh7IG9yaWVudGF0aW9uIH0pIHtcbiAgY29uc3QgaHlwciA9IEh5cHJsYW5kLmdldF9kZWZhdWx0KCk7XG4gIC8vIHt3Lm1hcCgod3MpID0+IChcbiAgLy8gICA8YnV0dG9uXG4gIC8vICAgICBoYWxpZ249e0d0ay5BbGlnbi5DZW50ZXJ9XG4gIC8vICAgICBjbGFzc05hbWU9e2JpbmQoaHlwciwgXCJmb2N1c2VkV29ya3NwYWNlXCIpLmFzKChmdykgPT5cbiAgLy8gICAgICAgd3MgPT09IGZ3LmlkID8gXCJmb2N1c2VkXCIgOiBcIlwiLFxuICAvLyAgICAgKX1cbiAgLy8gICAgIG9uQ2xpY2tlZD17KCkgPT4gd3MuZm9jdXMoKX1cbiAgLy8gICA+XG4gIC8vICAgICB7d3N9XG4gIC8vICAgPC9idXR0b24+XG4gIC8vICkpfVxuICAvLyBjb25zdCBjbGFzc05hbWVzID0gVmFyaWFibGUoe30pXG4gIHJldHVybiAoXG4gICAgPGJveCBjbGFzc05hbWU9XCJ3b3Jrc3BhY2VzXCIgb3JpZW50YXRpb249e29yaWVudGF0aW9ufT5cbiAgICAgIHtiaW5kKGh5cHIsIFwid29ya3NwYWNlc1wiKS5hcyh3b3Jrc3BhY2VzID0+IHtcbiAgICAgICAgY29uc3QgZmlsdGVyZWQgPSB3b3Jrc3BhY2VzXG4gICAgICAgICAgLmZpbHRlcih3cyA9PiAhKHdzLmlkID49IC05OSAmJiB3cy5pZCA8PSAtMikpIC8vIGZpbHRlciBvdXQgc3BlY2lhbCB3b3Jrc3BhY2VzXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKVxuXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMSkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMCwgMCwgeyBcImlkXCI6IDEsIFwibmFtZVwiOiAxLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMikgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMSwgMCwgeyBcImlkXCI6IDIsIFwibmFtZVwiOiAyLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMykgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMiwgMCwgeyBcImlkXCI6IDMsIFwibmFtZVwiOiAzLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gNCkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMywgMCwgeyBcImlkXCI6IDQsIFwibmFtZVwiOiA0LCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gNSkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoNCwgMCwgeyBcImlkXCI6IDUsIFwibmFtZVwiOiA1LCBcInN0YXRpY1wiOiB0cnVlIH0pXG5cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkLm1hcCgodykgPT4gKFxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIGNsYXNzTmFtZT17YmluZChoeXByLCBcImZvY3VzZWRXb3Jrc3BhY2VcIikuYXMoKGZ3KSA9PlxuICAgICAgICAgICAgICB3LmlkID09PSBmdy5pZCA/IFwiZm9jdXNlZFwiIDogdy5zdGF0aWMgPyBcIlwiIDogXCJleGlzdFwiXG4gICAgICAgICAgICApfVxuICAgICAgICAgICAgb25DbGlja2VkPXsoKSA9PiBoeXByLm1lc3NhZ2UoYGRpc3BhdGNoIHdvcmtzcGFjZSAke3cuaWR9YCl9XG4gICAgICAgICAgPlxuICAgICAgICAgICAge3cubmFtZX1cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKSlcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxpY29uIGljb249e2JpbmQoY2xpZW50LCBcImluaXRpYWwtY2xhc3NcIikuYXMoYyA9PiBnZXRfaWNvbihjKSl9IC8+XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxsYWJlbCBlbGxpcHNpemU9ezN9IGxhYmVsPXtiaW5kKGNsaWVudCwgXCJ0aXRsZVwiKS5hcyh0ID0+IHQgfHwgY2xpZW50LmluaXRpYWxUaXRsZSB8fCBjbGllbnQuY2xhc3MpfSBjc3M9XCJtYXJnaW4tcmlnaHQ6IDIwcHhcIi8+O1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9KX1cbiAgICA8L2JveD5cbiAgKTtcbn1cbiIsICJpbXBvcnQgeyBBc3RhbCB9IGZyb20gXCJhc3RhbC9ndGszXCJcblxuZXhwb3J0IGZ1bmN0aW9uIGdldF9pY29uKHdpbmRvd19jbGFzcykge1xuICBzd2l0Y2ggKHdpbmRvd19jbGFzcykge1xuICAgIGNhc2UgXCJ6ZW5cIjpcbiAgICAgIHJldHVybiBcInplbi1icm93c2VyXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIHJldHVybiB3aW5kb3dfY2xhc3M7XG4gICAgICByZXR1cm4gQXN0YWwuSWNvbi5sb29rdXBfaWNvbih3aW5kb3dfY2xhc3MpID8gd2luZG93X2NsYXNzIDogd2luZG93X2NsYXNzLnRvTG93ZXJDYXNlKCk7XG4gIH1cbn1cblxuIiwgImltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCB7IG1lcmdlQmluZGluZ3MsIHR5cGUgQmluZGFibGVDaGlsZCB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcbmltcG9ydCAqIGFzIFdpZGdldCBmcm9tIFwiLi93aWRnZXQuanNcIlxuXG5mdW5jdGlvbiBpc0Fycm93RnVuY3Rpb24oZnVuYzogYW55KTogZnVuYyBpcyAoYXJnczogYW55KSA9PiBhbnkge1xuICAgIHJldHVybiAhT2JqZWN0Lmhhc093bihmdW5jLCBcInByb3RvdHlwZVwiKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRnJhZ21lbnQoeyBjaGlsZHJlbiA9IFtdLCBjaGlsZCB9OiB7XG4gICAgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkXG4gICAgY2hpbGRyZW4/OiBBcnJheTxCaW5kYWJsZUNoaWxkPlxufSkge1xuICAgIGlmIChjaGlsZCkgY2hpbGRyZW4ucHVzaChjaGlsZClcbiAgICByZXR1cm4gbWVyZ2VCaW5kaW5ncyhjaGlsZHJlbilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGpzeChcbiAgICBjdG9yOiBrZXlvZiB0eXBlb2YgY3RvcnMgfCB0eXBlb2YgR3RrLldpZGdldCxcbiAgICB7IGNoaWxkcmVuLCAuLi5wcm9wcyB9OiBhbnksXG4pIHtcbiAgICBjaGlsZHJlbiA/Pz0gW11cblxuICAgIGlmICghQXJyYXkuaXNBcnJheShjaGlsZHJlbikpXG4gICAgICAgIGNoaWxkcmVuID0gW2NoaWxkcmVuXVxuXG4gICAgY2hpbGRyZW4gPSBjaGlsZHJlbi5maWx0ZXIoQm9vbGVhbilcblxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDEpXG4gICAgICAgIHByb3BzLmNoaWxkID0gY2hpbGRyZW5bMF1cbiAgICBlbHNlIGlmIChjaGlsZHJlbi5sZW5ndGggPiAxKVxuICAgICAgICBwcm9wcy5jaGlsZHJlbiA9IGNoaWxkcmVuXG5cbiAgICBpZiAodHlwZW9mIGN0b3IgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBjdG9yc1tjdG9yXShwcm9wcylcbiAgICB9XG5cbiAgICBpZiAoaXNBcnJvd0Z1bmN0aW9uKGN0b3IpKVxuICAgICAgICByZXR1cm4gY3Rvcihwcm9wcylcblxuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgY2FuIGJlIGNsYXNzIG9yIGZ1bmN0aW9uXG4gICAgcmV0dXJuIG5ldyBjdG9yKHByb3BzKVxufVxuXG5jb25zdCBjdG9ycyA9IHtcbiAgICBib3g6IFdpZGdldC5Cb3gsXG4gICAgYnV0dG9uOiBXaWRnZXQuQnV0dG9uLFxuICAgIGNlbnRlcmJveDogV2lkZ2V0LkNlbnRlckJveCxcbiAgICBjaXJjdWxhcnByb2dyZXNzOiBXaWRnZXQuQ2lyY3VsYXJQcm9ncmVzcyxcbiAgICBkcmF3aW5nYXJlYTogV2lkZ2V0LkRyYXdpbmdBcmVhLFxuICAgIGVudHJ5OiBXaWRnZXQuRW50cnksXG4gICAgZXZlbnRib3g6IFdpZGdldC5FdmVudEJveCxcbiAgICAvLyBUT0RPOiBmaXhlZFxuICAgIC8vIFRPRE86IGZsb3dib3hcbiAgICBpY29uOiBXaWRnZXQuSWNvbixcbiAgICBsYWJlbDogV2lkZ2V0LkxhYmVsLFxuICAgIGxldmVsYmFyOiBXaWRnZXQuTGV2ZWxCYXIsXG4gICAgLy8gVE9ETzogbGlzdGJveFxuICAgIG92ZXJsYXk6IFdpZGdldC5PdmVybGF5LFxuICAgIHJldmVhbGVyOiBXaWRnZXQuUmV2ZWFsZXIsXG4gICAgc2Nyb2xsYWJsZTogV2lkZ2V0LlNjcm9sbGFibGUsXG4gICAgc2xpZGVyOiBXaWRnZXQuU2xpZGVyLFxuICAgIHN0YWNrOiBXaWRnZXQuU3RhY2ssXG4gICAgc3dpdGNoOiBXaWRnZXQuU3dpdGNoLFxuICAgIHdpbmRvdzogV2lkZ2V0LldpbmRvdyxcbn1cblxuZGVjbGFyZSBnbG9iYWwge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbmFtZXNwYWNlXG4gICAgbmFtZXNwYWNlIEpTWCB7XG4gICAgICAgIHR5cGUgRWxlbWVudCA9IEd0ay5XaWRnZXRcbiAgICAgICAgdHlwZSBFbGVtZW50Q2xhc3MgPSBHdGsuV2lkZ2V0XG4gICAgICAgIGludGVyZmFjZSBJbnRyaW5zaWNFbGVtZW50cyB7XG4gICAgICAgICAgICBib3g6IFdpZGdldC5Cb3hQcm9wc1xuICAgICAgICAgICAgYnV0dG9uOiBXaWRnZXQuQnV0dG9uUHJvcHNcbiAgICAgICAgICAgIGNlbnRlcmJveDogV2lkZ2V0LkNlbnRlckJveFByb3BzXG4gICAgICAgICAgICBjaXJjdWxhcnByb2dyZXNzOiBXaWRnZXQuQ2lyY3VsYXJQcm9ncmVzc1Byb3BzXG4gICAgICAgICAgICBkcmF3aW5nYXJlYTogV2lkZ2V0LkRyYXdpbmdBcmVhUHJvcHNcbiAgICAgICAgICAgIGVudHJ5OiBXaWRnZXQuRW50cnlQcm9wc1xuICAgICAgICAgICAgZXZlbnRib3g6IFdpZGdldC5FdmVudEJveFByb3BzXG4gICAgICAgICAgICAvLyBUT0RPOiBmaXhlZFxuICAgICAgICAgICAgLy8gVE9ETzogZmxvd2JveFxuICAgICAgICAgICAgaWNvbjogV2lkZ2V0Lkljb25Qcm9wc1xuICAgICAgICAgICAgbGFiZWw6IFdpZGdldC5MYWJlbFByb3BzXG4gICAgICAgICAgICBsZXZlbGJhcjogV2lkZ2V0LkxldmVsQmFyUHJvcHNcbiAgICAgICAgICAgIC8vIFRPRE86IGxpc3Rib3hcbiAgICAgICAgICAgIG92ZXJsYXk6IFdpZGdldC5PdmVybGF5UHJvcHNcbiAgICAgICAgICAgIHJldmVhbGVyOiBXaWRnZXQuUmV2ZWFsZXJQcm9wc1xuICAgICAgICAgICAgc2Nyb2xsYWJsZTogV2lkZ2V0LlNjcm9sbGFibGVQcm9wc1xuICAgICAgICAgICAgc2xpZGVyOiBXaWRnZXQuU2xpZGVyUHJvcHNcbiAgICAgICAgICAgIHN0YWNrOiBXaWRnZXQuU3RhY2tQcm9wc1xuICAgICAgICAgICAgc3dpdGNoOiBXaWRnZXQuU3dpdGNoUHJvcHNcbiAgICAgICAgICAgIHdpbmRvdzogV2lkZ2V0LldpbmRvd1Byb3BzXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBqc3hzID0ganN4XG4iLCAiaW1wb3J0IFRyYXkgZnJvbSBcImdpOi8vQXN0YWxUcmF5XCI7XG5pbXBvcnQgeyBWYXJpYWJsZSwgYmluZCB9IGZyb20gXCJhc3RhbFwiO1xuaW1wb3J0IHsgQXN0YWwsIEd0aywgR2RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuXG5jb25zdCBjcmVhdGVNZW51ID0gKG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApID0+IHtcbiAgY29uc3QgbWVudSA9IEd0ay5NZW51Lm5ld19mcm9tX21vZGVsKG1lbnVNb2RlbCk7XG4gIG1lbnUuaW5zZXJ0X2FjdGlvbl9ncm91cCgnZGJ1c21lbnUnLCBhY3Rpb25Hcm91cCk7XG5cbiAgcmV0dXJuIG1lbnU7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTeXNUcmF5KHtvcmllbnRhdGlvbn0pIHtcbiAgY29uc3QgdHJheSA9IFRyYXkuZ2V0X2RlZmF1bHQoKVxuICBcbiAgcmV0dXJuIDxib3ggY2xhc3NOYW1lPVwidHJheVwiIG9yaWVudGF0aW9uPXtvcmllbnRhdGlvbn0gdmlzaWJsZT17YmluZCh0cmF5LCBcIml0ZW1zXCIpLmFzKGl0ZW1zPT5pdGVtcy5sZW5ndGg+MCl9PlxuICAgIHtiaW5kKHRyYXksIFwiaXRlbXNcIikuYXMoaXRlbXMgPT4gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXG4gICAgICAvLyBNYWtlIHN1cmUgeW91J3JlIGJvdW5kIHRvIHRoZSBtZW51TW9kZWwgYW5kIGFjdGlvbkdyb3VwIHdoaWNoIGNhbiBjaGFuZ2VcblxuICAgICAgbGV0IG1lbnU7XG5cbiAgICAgIGNvbnN0IGVudHJ5QmluZGluZyA9IFZhcmlhYmxlLmRlcml2ZShcbiAgICAgICAgW2JpbmQoaXRlbSwgJ21lbnVNb2RlbCcpLCBiaW5kKGl0ZW0sICdhY3Rpb25Hcm91cCcpXSxcbiAgICAgICAgKG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApID0+IHtcbiAgICAgICAgICBpZiAoIW1lbnVNb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoYE1lbnUgTW9kZWwgbm90IGZvdW5kIGZvciAke2l0ZW0uaWR9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghYWN0aW9uR3JvdXApIHtcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKGBBY3Rpb24gR3JvdXAgbm90IGZvdW5kIGZvciAke2l0ZW0uaWR9YCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbWVudSA9IGNyZWF0ZU1lbnUobWVudU1vZGVsLCBhY3Rpb25Hcm91cCk7XG4gICAgICAgIH0sXG4gICAgICApO1xuXG5cbiAgICAgIHJldHVybiA8YnV0dG9uXG4gICAgICAgIG9uQ2xpY2s9eyhidG4sIF8pPT57XG4gICAgICAgICAgbWVudT8ucG9wdXBfYXRfd2lkZ2V0KGJ0biwgR2RrLkdyYXZpdHkuTk9SVEgsIEdkay5HcmF2aXR5LlNPVVRILCBudWxsKTtcbiAgICAgICAgfX1cbiAgICAgICAgb25EZXN0cm95PXsoKSA9PiB7XG4gICAgICAgICAgbWVudT8uZGVzdHJveSgpO1xuICAgICAgICAgIGVudHJ5QmluZGluZy5kcm9wKCk7XG4gICAgICAgIH19PlxuICAgICAgICA8aWNvbiBnLWljb249e2JpbmQoaXRlbSwgXCJnaWNvblwiKX0vPlxuICAgICAgPC9idXR0b24+XG4gICAgfSkpfVxuICA8L2JveD5cbn1cbiIsICJpbXBvcnQgeyBBc3RhbCwgR3RrLCBHZGsgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5pbXBvcnQgTm90aWZkIGZyb20gXCJnaTovL0FzdGFsTm90aWZkXCJcbmltcG9ydCB7IFZhcmlhYmxlLCBiaW5kLCB0aW1lb3V0IH0gZnJvbSBcImFzdGFsXCJcblxuY29uc3QgeyBTVEFSVCwgQ0VOVEVSLCBFTkQgfSA9IEd0ay5BbGlnblxuXG5cbmNvbnN0IGdldFVyZ2VuY3kgPSAobikgPT4ge1xuICAgIGNvbnN0IHsgTE9XLCBOT1JNQUwsIENSSVRJQ0FMIH0gPSBOb3RpZmQuVXJnZW5jeVxuICAgIHN3aXRjaCAobi51cmdlbmN5KSB7XG4gICAgICAgIGNhc2UgTE9XOiByZXR1cm4gXCJsb3dcIlxuICAgICAgICBjYXNlIENSSVRJQ0FMOiByZXR1cm4gXCJjcml0aWNhbFwiXG4gICAgICAgIGNhc2UgTk9STUFMOlxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gXCJub3JtYWxcIlxuICAgIH1cbn1cblxuZnVuY3Rpb24gTm90aWYobm90aWYpIHtcbiAgcmV0dXJuIDxldmVudGJveFxuICAgIGNsYXNzTmFtZT17Z2V0VXJnZW5jeShub3RpZil9XG4gICAgb25DbGljaz17KCkgPT4gbm90aWYuZGlzbWlzcygpfVxuICA+XG4gICAgPGJveCB2ZXJ0aWNhbD5cbiAgICAgIDxib3g+XG4gICAgICAgIHsoKG5vdGlmLmFwcEljb24gfHwgbm90aWYuZGVza3RvcEVudHJ5KSAmJiA8aWNvblxuICAgICAgICAgIGNsYXNzTmFtZT1cImltYWdlXCJcbiAgICAgICAgICB2aXNpYmxlPXtCb29sZWFuKG5vdGlmLmFwcEljb24gfHwgbm90aWYuZGVza3RvcEVudHJ5KX1cbiAgICAgICAgICBpY29uPXtub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeX1cbiAgICAgICAgLz4pIHx8IChub3RpZi5pbWFnZSAmJiBmaWxlRXhpc3RzKG5vdGlmLmltYWdlKSAmJiA8Ym94XG4gICAgICAgICAgdmFsaWduPXtTVEFSVH1cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiXG4gICAgICAgICAgY3NzPXtgYmFja2dyb3VuZC1pbWFnZTogdXJsKCcke25vdGlmLmltYWdlfScpYH1cbiAgICAgICAgLz4pIHx8ICgobm90aWYuaW1hZ2UgJiYgaXNJY29uKG5vdGlmLmltYWdlKSAmJiA8Ym94XG4gICAgICAgICAgZXhwYW5kPXtmYWxzZX1cbiAgICAgICAgICB2YWxpZ249e1NUQVJUfVxuICAgICAgICAgIGNsYXNzTmFtZT1cImltYWdlXCI+XG4gICAgICAgICAgPGljb24gaWNvbj17bm90aWYuaW1hZ2V9IGV4cGFuZCBoYWxpZ249e0NFTlRFUn0gdmFsaWduPXtDRU5URVJ9IC8+XG4gICAgICAgIDwvYm94PikpfVxuICAgICAgICA8Ym94IGNsYXNzTmFtZT1cIm1haW5cIiB2ZXJ0aWNhbD5cbiAgICAgICAgICA8Ym94IGNsYXNzTmFtZT1cImhlYWRlclwiPlxuICAgICAgICAgICAgPGxhYmVsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZT1cInN1bW1hcnlcIlxuICAgICAgICAgICAgICBoYWxpZ249e1NUQVJUfVxuICAgICAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgICAgIGxhYmVsPXtub3RpZi5zdW1tYXJ5fVxuICAgICAgICAgICAgICB0cnVuY2F0ZVxuICAgICAgICAgICAgICBoZXhwYW5kXG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrZWQ9eygpID0+IG5vdGlmLmRpc21pc3MoKX0+XG4gICAgICAgICAgICAgIDxpY29uIGljb249XCJ3aW5kb3ctY2xvc2Utc3ltYm9saWNcIiAvPlxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPGJveCBjbGFzc05hbWU9XCJjb250ZW50XCI+XG4gICAgICAgICAgICA8Ym94IHZlcnRpY2FsPlxuICAgICAgICAgICAgICB7bm90aWYuYm9keSAmJiA8bGFiZWxcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJib2R5XCJcbiAgICAgICAgICAgICAgICB3cmFwXG4gICAgICAgICAgICAgICAgdXNlTWFya3VwXG4gICAgICAgICAgICAgICAgaGFsaWduPXtTVEFSVH1cbiAgICAgICAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgICAgICAganVzdGlmeUZpbGxcbiAgICAgICAgICAgICAgICBsYWJlbD17bm90aWYuYm9keX1cbiAgICAgICAgICAgICAgLz59XG4gICAgICAgICAgICA8L2JveD5cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgPC9ib3g+XG4gICAgICA8L2JveD5cbiAgICAgIDxib3g+XG4gICAgICAgIHtub3RpZi5nZXRfYWN0aW9ucygpLmxlbmd0aCA+IDAgJiYgPGJveCBjbGFzc05hbWU9XCJhY3Rpb25zXCI+XG4gICAgICAgICAge25vdGlmLmdldF9hY3Rpb25zKCkubWFwKCh7IGxhYmVsLCBpZCB9KSA9PiAoXG4gICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgIGhleHBhbmRcbiAgICAgICAgICAgICAgb25DbGlja2VkPXsoKSA9PiBub3RpZi5pbnZva2UoaWQpfVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICA8bGFiZWwgbGFiZWw9e2xhYmVsfSBoYWxpZ249e0NFTlRFUn0gaGV4cGFuZCAvPlxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgKSl9XG4gICAgICAgIDwvYm94Pn1cbiAgICAgIDwvYm94PlxuICAgIDwvYm94PlxuICA8L2V2ZW50Ym94PlxufVxuXG4vLyBUaGUgcHVycG9zZSBpZiB0aGlzIGNsYXNzIGlzIHRvIHJlcGxhY2UgVmFyaWFibGU8QXJyYXk8V2lkZ2V0Pj5cbi8vIHdpdGggYSBNYXA8bnVtYmVyLCBXaWRnZXQ+IHR5cGUgaW4gb3JkZXIgdG8gdHJhY2sgbm90aWZpY2F0aW9uIHdpZGdldHNcbi8vIGJ5IHRoZWlyIGlkLCB3aGlsZSBtYWtpbmcgaXQgY29udmluaWVudGx5IGJpbmRhYmxlIGFzIGFuIGFycmF5XG5jbGFzcyBOb3RpZmljYXRpb25NYXAge1xuICAgIC8vIHRoZSB1bmRlcmx5aW5nIG1hcCB0byBrZWVwIHRyYWNrIG9mIGlkIHdpZGdldCBwYWlyc1xuICAgIG1hcCA9IG5ldyBNYXAoKVxuXG4gICAgLy8gaXQgbWFrZXMgc2Vuc2UgdG8gdXNlIGEgVmFyaWFibGUgdW5kZXIgdGhlIGhvb2QgYW5kIHVzZSBpdHNcbiAgICAvLyByZWFjdGl2aXR5IGltcGxlbWVudGF0aW9uIGluc3RlYWQgb2Yga2VlcGluZyB0cmFjayBvZiBzdWJzY3JpYmVycyBvdXJzZWx2ZXNcbiAgICB2YXIgPSBWYXJpYWJsZShbXSlcblxuICAgIC8vIG5vdGlmeSBzdWJzY3JpYmVycyB0byByZXJlbmRlciB3aGVuIHN0YXRlIGNoYW5nZXNcbiAgICBub3RpZml5KCkge1xuICAgICAgICB0aGlzLnZhci5zZXQoWy4uLnRoaXMubWFwLnZhbHVlcygpXS5yZXZlcnNlKCkpXG4gICAgfVxuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IG5vdGlmZCA9IE5vdGlmZC5nZXRfZGVmYXVsdCgpXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIHVuY29tbWVudCB0aGlzIGlmIHlvdSB3YW50IHRvXG4gICAgICAgICAqIGlnbm9yZSB0aW1lb3V0IGJ5IHNlbmRlcnMgYW5kIGVuZm9yY2Ugb3VyIG93biB0aW1lb3V0XG4gICAgICAgICAqIG5vdGUgdGhhdCBpZiB0aGUgbm90aWZpY2F0aW9uIGhhcyBhbnkgYWN0aW9uc1xuICAgICAgICAgKiB0aGV5IG1pZ2h0IG5vdCB3b3JrLCBzaW5jZSB0aGUgc2VuZGVyIGFscmVhZHkgdHJlYXRzIHRoZW0gYXMgcmVzb2x2ZWRcbiAgICAgICAgICovXG4gICAgICAgIC8vIG5vdGlmZC5pZ25vcmVUaW1lb3V0ID0gdHJ1ZVxuXG4gICAgICAgIG5vdGlmZC5jb25uZWN0KFwibm90aWZpZWRcIiwgKG4sIGlkKSA9PiB7XG4gICAgICAgICAgLy8gcHJpbnQodHlwZW9mIG5vdGlmZC5nZXRfbm90aWZpY2F0aW9uKGlkKSlcbiAgICAgICAgICAgIHRoaXMuc2V0KGlkLCBOb3RpZihub3RpZmQuZ2V0X25vdGlmaWNhdGlvbihpZCkpKVxuICAgICAgICB9KVxuXG4gICAgICAgIC8vIG5vdGlmaWNhdGlvbnMgY2FuIGJlIGNsb3NlZCBieSB0aGUgb3V0c2lkZSBiZWZvcmVcbiAgICAgICAgLy8gYW55IHVzZXIgaW5wdXQsIHdoaWNoIGhhdmUgdG8gYmUgaGFuZGxlZCB0b29cbiAgICAgICAgbm90aWZkLmNvbm5lY3QoXCJyZXNvbHZlZFwiLCAoXywgaWQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZGVsZXRlKGlkKVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHNldChrZXksIHZhbHVlKSB7XG4gICAgICAgIC8vIGluIGNhc2Ugb2YgcmVwbGFjZWNtZW50IGRlc3Ryb3kgcHJldmlvdXMgd2lkZ2V0XG4gICAgICAgIHRoaXMubWFwLmdldChrZXkpPy5kZXN0cm95KClcbiAgICAgICAgdGhpcy5tYXAuc2V0KGtleSwgdmFsdWUpXG4gICAgICAgIHRoaXMubm90aWZpeSgpXG4gICAgfVxuXG4gICAgZGVsZXRlKGtleSkge1xuICAgICAgICB0aGlzLm1hcC5nZXQoa2V5KT8uZGVzdHJveSgpXG4gICAgICAgIHRoaXMubWFwLmRlbGV0ZShrZXkpXG4gICAgICAgIHRoaXMubm90aWZpeSgpXG4gICAgfVxuXG4gICAgLy8gbmVlZGVkIGJ5IHRoZSBTdWJzY3JpYmFibGUgaW50ZXJmYWNlXG4gICAgZ2V0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy52YXIuZ2V0KClcbiAgICB9XG5cbiAgICAvLyBuZWVkZWQgYnkgdGhlIFN1YnNjcmliYWJsZSBpbnRlcmZhY2VcbiAgICBzdWJzY3JpYmUoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFyLnN1YnNjcmliZShjYWxsYmFjaylcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE5vdGlmaWNhdGlvbnMobW9uaXRvcikge1xuICBjb25zdCB7IFRPUCB9ID0gQXN0YWwuV2luZG93QW5jaG9yO1xuXG4gIC8vIGNvbnN0IG5vdGlmZCA9IE5vdGlmZC5nZXRfZGVmYXVsdCgpO1xuXG4gIGNvbnN0IG5vdGlmcyA9IG5ldyBOb3RpZmljYXRpb25NYXAoKTtcblxuICAvLyBub3RpZmQuY29ubmVjdChcIm5vdGlmaWVkXCIsIClcblxuICByZXR1cm4gPHdpbmRvd1xuICAgIGdka21vbml0b3I9e21vbml0b3J9XG4gICAgbmFtZXNwYWNlPVwiYWdzLW5vdGlmZFwiXG4gICAgbGF5ZXI9e0FzdGFsLkxheWVyLk9WRVJMQVl9XG4gICAgYW5jaG9yPXtUT1B9XG4gICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5Lk5PUk1BTH1cbiAgICBjbGFzc05hbWU9XCJOb3RpZmljYXRpb25zXCI+XG4gICAgPGJveCB2ZXJ0aWNhbD5cbiAgICAgIHtiaW5kKG5vdGlmcyl9XG4gICAgPC9ib3g+XG4gIDwvd2luZG93PlxufVxuIiwgImltcG9ydCBBcHBzIGZyb20gXCJnaTovL0FzdGFsQXBwc1wiXG5pbXBvcnQgeyBBcHAsIEFzdGFsLCBHZGssIEd0ayB9IGZyb20gXCJhc3RhbC9ndGszXCJcbmltcG9ydCB7IGJpbmQsIFZhcmlhYmxlLCBleGVjQXN5bmMsIGV4ZWMgfSBmcm9tIFwiYXN0YWxcIlxuaW1wb3J0IHsgZ2V0X2ljb24gfSBmcm9tIFwiLi4vdXRpbC5qc1wiO1xuXG5jb25zdCBNQVhfSVRFTVMgPSA4XG5cbmZ1bmN0aW9uIGhpZGUoKSB7XG4gIEFwcC5nZXRfd2luZG93KFwibGF1bmNoZXJcIikuaGlkZSgpXG59XG5cbmZ1bmN0aW9uIEFwcEJ1dHRvbih7IGFwcCB9KSB7XG4gIHJldHVybiA8YnV0dG9uXG4gICAgY2xhc3NOYW1lPVwiQXBwQnV0dG9uXCJcbiAgICBvbkNsaWNrZWQ9eygpID0+IHsgaGlkZSgpOyBhcHAubGF1bmNoKCkgfX0+XG4gICAgPGJveD5cbiAgICAgIDxpY29uIGljb249e2FwcC5pY29uTmFtZX0gLz5cbiAgICAgIDxib3ggdmFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfSB2ZXJ0aWNhbD5cbiAgICAgICAgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwibmFtZVwiXG4gICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2FwcC5uYW1lfVxuICAgICAgICAvPlxuICAgICAgICB7YXBwLmRlc2NyaXB0aW9uICYmIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cImRlc2NyaXB0aW9uXCJcbiAgICAgICAgICB3cmFwXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXthcHAuZGVzY3JpcHRpb259XG4gICAgICAgIC8+fVxuICAgICAgPC9ib3g+XG4gICAgPC9ib3g+XG4gIDwvYnV0dG9uPlxufVxuXG5mdW5jdGlvbiBzdHJfZnV6enkoc3RyLCBzKSB7XG4gIHZhciBoYXkgPSBzdHIudG9Mb3dlckNhc2UoKSwgaSA9IDAsIG4gPSAtMSwgbDtcbiAgcyA9IHMudG9Mb3dlckNhc2UoKTtcbiAgZm9yICg7IGwgPSBzW2krK107KSBpZiAoIX4obiA9IGhheS5pbmRleE9mKGwsIG4gKyAxKSkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCByZXMgPSBWYXJpYWJsZShcIi4uLlwiKVxuY29uc3Qgd2luZG93cyA9IFZhcmlhYmxlKFtdKVxuXG5jb25zdCBwbHVnaW5zID0ge1xuICBcIlxcXFxcIjoge1xuICAgIFwiaW5pdFwiOiAoKSA9PiB7IH0sXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4gW3tcbiAgICAgIFwibGFiZWxcIjogXCJSZWxvYWRcIixcbiAgICAgIFwic3ViXCI6IFwiUmVmcmVzaCBkZXNrdG9wIGZpbGVzIG9uIHN5c3RlbVwiLFxuICAgICAgXCJpY29uXCI6IFwidmlldy1yZWZyZXNoLXN5bWJvbGljXCIsXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGFwcHMucmVsb2FkLFxuICAgIH1dXG4gIH0sXG4gIFwiL1wiOiB7XG4gICAgXCJpbml0XCI6ICgpID0+IHsgfSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiBbe1xuICAgICAgXCJsYWJlbFwiOiB0ZXh0LFxuICAgICAgXCJzdWJcIjogXCJydW5cIixcbiAgICAgIFwiaWNvblwiOiBcInV0aWxpdGllcy10ZXJtaW5hbFwiLFxuICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wic2hcIiwgXCItY1wiLCB0ZXh0XSlcbiAgICB9XVxuICB9LFxuICBcIj1cIjoge1xuICAgIFwiaW5pdFwiOiAoKSA9PiB7IH0sXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4ge1xuICAgICAgcmVzLnNldChcIi4uLlwiKTtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDApXG4gICAgICAgIGV4ZWNBc3luYyhbXCJxYWxjXCIsIFwiLXRcIiwgdGV4dF0pLnRoZW4ob3V0ID0+IHJlcy5zZXQob3V0KSkuY2F0Y2goXyA9PiB7cmVzLnNldChcImVycm9yXCIpfSk7XG4gICAgICByZXR1cm4gW3tcbiAgICAgICAgXCJsYWJlbFwiOiBiaW5kKHJlcyksXG4gICAgICAgIFwic3ViXCI6IFwiQ2FsY3VsYXRlIHVzaW5nIHFhbGNcIixcbiAgICAgICAgXCJpY29uXCI6IFwiYWNjZXNzb3JpZXMtY2FsY3VsYXRvclwiLFxuICAgICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJzaFwiLCBcIi1jXCIsIGBlY2hvICR7cmVzLmdldCgpfSB8IHdsLWNvcHlgXSlcbiAgICAgIH1dXG4gICAgfVxuICB9LFxuICBcIjtcIjoge1xuICAgIFwiaW5pdFwiOiAoKSA9PiB3aW5kb3dzLnNldChKU09OLnBhcnNlKGV4ZWMoW1wiaHlwcmN0bFwiLCBcIi1qXCIsIFwiY2xpZW50c1wiXSkpKSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiB3aW5kb3dzLmdldCgpLm1hcCh3aW5kb3cgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgXCJsYWJlbFwiOiB3aW5kb3dbXCJ0aXRsZVwiXSxcbiAgICAgICAgXCJzdWJcIjogYCR7d2luZG93W1wieHdheWxhbmRcIl0gPyBcIltYXSBcIiA6IFwiXCJ9JHt3aW5kb3dbXCJjbGFzc1wiXX0gWyR7d2luZG93W1wicGlkXCJdfV0gJHt3aW5kb3dbXCJmdWxsc2NyZWVuXCJdID8gXCIoZnVsbHNjcmVlbikgXCIgOiB3aW5kb3dbXCJmbG9hdGluZ1wiXSA/IFwiKGZsb2F0aW5nKSBcIiA6IFwiXCJ9b24gJHt3aW5kb3dbXCJ3b3Jrc3BhY2VcIl1bXCJpZFwiXX1gLFxuICAgICAgICBcImljb25cIjogZ2V0X2ljb24od2luZG93W1wiaW5pdGlhbENsYXNzXCJdKSxcbiAgICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wiaHlwcmN0bFwiLCBcImRpc3BhdGNoXCIsIFwiZm9jdXN3aW5kb3dcIiwgYGFkZHJlc3M6JHt3aW5kb3dbXCJhZGRyZXNzXCJdfWBdKSxcbiAgICAgIH1cbiAgICB9KS5maWx0ZXIodyA9PiBzdHJfZnV6enkod1tcImxhYmVsXCJdLCB0ZXh0KSB8fCBzdHJfZnV6enkod1tcInN1YlwiXSwgdGV4dCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gUGx1Z2luQnV0dG9uKHsgaXRlbSB9KSB7XG4gIHJldHVybiA8YnV0dG9uXG4gICAgb25DbGlja2VkPXsoKSA9PiB7IGhpZGUoKTsgaXRlbS5hY3RpdmF0ZSgpIH19PlxuICAgIDxib3g+XG4gICAgICA8aWNvbiBpY29uPXtpdGVtLmljb259IC8+XG4gICAgICA8Ym94IHZhbGlnbj17R3RrLkFsaWduLkNFTlRFUn0gdmVydGljYWw+XG4gICAgICAgIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cIm5hbWVcIlxuICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXtpdGVtLmxhYmVsfVxuICAgICAgICAvPlxuICAgICAgICB7aXRlbS5zdWIgJiYgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVzY3JpcHRpb25cIlxuICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXtpdGVtLnN1Yn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cblxuY29uc3QgYXBwcyA9IG5ldyBBcHBzLkFwcHMoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBcHBsYXVuY2hlcigpIHtcbiAgY29uc3QgeyBDRU5URVIgfSA9IEd0ay5BbGlnblxuXG4gIGNvbnN0IHRleHQgPSBWYXJpYWJsZShcIlwiKVxuICBjb25zdCBsaXN0ID0gdGV4dCh0ZXh0ID0+IHtcbiAgICBsZXQgcCA9IHBsdWdpbnNbdGV4dC5zdWJzdHJpbmcoMCwgMSldXG4gICAgaWYgKHApIHtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKVxuICAgICAgICBwLmluaXQoKVxuICAgICAgcmV0dXJuIHAucXVlcnkodGV4dC5zdWJzdHJpbmcoMSwgdGV4dC5sZW5ndGgpKVxuICAgIH1cblxuICAgIHJldHVybiBhcHBzLmZ1enp5X3F1ZXJ5KHRleHQpLnNsaWNlKDAsIE1BWF9JVEVNUylcbiAgfSlcbiAgY29uc3Qgb25FbnRlciA9IChpbnB1dGJveCkgPT4ge1xuICAgIGlucHV0Ym94LmdldF9wYXJlbnQoKS5jaGlsZHJlblsxXS5jaGlsZHJlblswXS5jbGlja2VkKClcbiAgICBoaWRlKClcbiAgfVxuXG4gIHJldHVybiA8d2luZG93XG4gICAgbmFtZT1cImxhdW5jaGVyXCJcbiAgICBuYW1lc3BhY2U9XCJhZ3MtbGF1bmNoZXJcIlxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGFuY2hvcj17QXN0YWwuV2luZG93QW5jaG9yLlRPUCB8IEFzdGFsLldpbmRvd0FuY2hvci5CT1RUT019XG4gICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5LklHTk9SRX1cbiAgICBrZXltb2RlPXtBc3RhbC5LZXltb2RlLk9OX0RFTUFORH1cbiAgICBhcHBsaWNhdGlvbj17QXBwfVxuICAgIHZpc2libGU9e2ZhbHNlfVxuICAgIG9uU2hvdz17KHNlbGYpID0+IHsgdGV4dC5zZXQoXCJcIik7IHNlbGYuZ2V0X2NoaWxkKCkuY2hpbGRyZW5bMV0uY2hpbGRyZW5bMV0uY2hpbGRyZW5bMF0uZ3JhYl9mb2N1c193aXRob3V0X3NlbGVjdGluZygpIH19XG4gICAgb25LZXlQcmVzc0V2ZW50PXtmdW5jdGlvbihzZWxmLCBldmVudCkge1xuICAgICAgaWYgKGV2ZW50LmdldF9rZXl2YWwoKVsxXSA9PT0gR2RrLktFWV9Fc2NhcGUpXG4gICAgICAgIHNlbGYuaGlkZSgpXG4gICAgICAvLyBlbHNlIGlmIChldmVudC5nZXRfc3RhdGUoKVsxXSA9PT0gR2RrLk1vZGlmaWVyVHlwZS5NT0QxX01BU0spIHtcbiAgICAgIC8vICAgbGV0IGlkeCA9IC0xO1xuICAgICAgLy8gICBzd2l0Y2ggKGV2ZW50LmdldF9rZXl2YWwoKVsxXSkge1xuICAgICAgLy8gICAgIGNhc2UgR2RrLktFWV9hOlxuICAgICAgLy8gICAgICAgY29uc29sZS5sb2coXCJhc2RzYWtmXCIpXG4gICAgICAvLyAgICAgICBpZHggPSAwO1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX3M6XG4gICAgICAvLyAgICAgICBpZHggPSAxO1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2Q6XG4gICAgICAvLyAgICAgICBpZHggPSAyO1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2Y6XG4gICAgICAvLyAgICAgICBpZHggPSAzO1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2g6XG4gICAgICAvLyAgICAgICBpZHggPSA0O1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2o6XG4gICAgICAvLyAgICAgICBpZHggPSA1O1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2s6XG4gICAgICAvLyAgICAgICBpZHggPSA2O1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgICAgY2FzZSBHZGsuS0VZX2w6XG4gICAgICAvLyAgICAgICBpZHggPSA3O1xuICAgICAgLy8gICAgICAgYnJlYWs7XG4gICAgICAvLyAgIH1cbiAgICAgIC8vICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICAvLyAgICAgc2VsZi5nZXRfY2hpbGQoKS5jaGlsZHJlblsxXS5jaGlsZHJlblsxXS5jaGlsZHJlblsxXS5jaGlsZHJlbltpZHhdLmNsaWNrZWQoKVxuICAgICAgLy8gICAgIHNlbGYuaGlkZSgpXG4gICAgICAvLyAgIH1cbiAgICAgIC8vIH1cbiAgICB9fT5cbiAgICA8Ym94PlxuICAgICAgPGV2ZW50Ym94IHdpZHRoUmVxdWVzdD17MjAwMH0gZXhwYW5kIG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICA8Ym94IGhleHBhbmQ9e2ZhbHNlfSB2ZXJ0aWNhbD5cbiAgICAgICAgPGV2ZW50Ym94IGhlaWdodFJlcXVlc3Q9ezIwMH0gb25DbGljaz17aGlkZX0gLz5cbiAgICAgICAgPGJveCB3aWR0aFJlcXVlc3Q9ezUwMH0gY2xhc3NOYW1lPVwibWFpblwiIHZlcnRpY2FsPlxuICAgICAgICAgIDxlbnRyeVxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUZXh0PVwiU2VhcmNoXCJcbiAgICAgICAgICAgIHRleHQ9e3RleHQoKX1cbiAgICAgICAgICAgIG9uQ2hhbmdlZD17c2VsZiA9PiB0ZXh0LnNldChzZWxmLnRleHQpfVxuICAgICAgICAgICAgb25BY3RpdmF0ZT17b25FbnRlcn1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxib3ggc3BhY2luZz17Nn0gdmVydGljYWw+XG4gICAgICAgICAgICB7bGlzdC5hcyhsaXN0ID0+IGxpc3QubWFwKGl0ZW0gPT4ge1xuICAgICAgICAgICAgICBpZiAoaXRlbS5hcHApXG4gICAgICAgICAgICAgICAgcmV0dXJuIDxBcHBCdXR0b24gYXBwPXtpdGVtfSAvPlxuICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuIDxQbHVnaW5CdXR0b24gaXRlbT17aXRlbX0gLz5cbiAgICAgICAgICAgIH0pKX1cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgICA8Ym94XG4gICAgICAgICAgICBoYWxpZ249e0NFTlRFUn1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5vdC1mb3VuZFwiXG4gICAgICAgICAgICB2ZXJ0aWNhbFxuICAgICAgICAgICAgdmlzaWJsZT17bGlzdC5hcyhsID0+IGwubGVuZ3RoID09PSAwKX0+XG4gICAgICAgICAgICA8aWNvbiBpY29uPVwic3lzdGVtLXNlYXJjaC1zeW1ib2xpY1wiIC8+XG4gICAgICAgICAgICA8bGFiZWwgbGFiZWw9XCJObyBtYXRjaCBmb3VuZFwiIC8+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgIDwvYm94PlxuICAgICAgICA8ZXZlbnRib3ggZXhwYW5kIG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICA8L2JveD5cbiAgICAgIDxldmVudGJveCB3aWR0aFJlcXVlc3Q9ezIwMDB9IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICJpbXBvcnQgV3AgZnJvbSBcImdpOi8vQXN0YWxXcFwiO1xuaW1wb3J0IHsgQXN0YWwgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5pbXBvcnQgeyBiaW5kLCBWYXJpYWJsZSwgZXhlYywgbW9uaXRvckZpbGUsIHJlYWRGaWxlLCB0aW1lb3V0IH0gZnJvbSBcImFzdGFsXCJcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gT3NkKG1vbml0b3IpIHtcbiAgY29uc3QgU0hPV19USU1FID0gMTUwMDtcbiAgY29uc3QgYXVkaW8gPSBXcC5nZXRfZGVmYXVsdCgpLmF1ZGlvLmRlZmF1bHRTcGVha2VyO1xuICBjb25zdCBkYXRhID0gVmFyaWFibGUoMCk7XG4gIGNvbnN0IGljb24gPSBWYXJpYWJsZShcIlwiKTtcbiAgY29uc3Qgc2hvdyA9IFZhcmlhYmxlKHRydWUpO1xuICBjb25zdCBicmlnaHRuZXNzX21heCA9IGV4ZWMoXCJicmlnaHRuZXNzY3RsIG1heFwiKTtcbiAgbGV0IHRpbWVyO1xuICBtb25pdG9yRmlsZShgL3N5cy9jbGFzcy9iYWNrbGlnaHQvJHtleGVjKFwic2ggLWMgJ2xzIC13MSAvc3lzL2NsYXNzL2JhY2tsaWdodHxoZWFkIC0xJ1wiKX0vYnJpZ2h0bmVzc2AsIChmaWxlLCBldmVudCkgPT4ge1xuICAgIGlmIChldmVudCA9PSAxKSB7XG4gICAgICBkYXRhLnNldChwYXJzZUludChyZWFkRmlsZShmaWxlKSkgLyBicmlnaHRuZXNzX21heCk7XG4gICAgICBpY29uLnNldChcImRpc3BsYXktYnJpZ2h0bmVzcy1zeW1ib2xpY1wiKVxuICAgICAgdGltZXI/LmNhbmNlbCgpXG4gICAgICBzaG93LnNldCh0cnVlKTtcbiAgICAgIHRpbWVyID0gdGltZW91dChTSE9XX1RJTUUsICgpID0+IHNob3cuc2V0KGZhbHNlKSk7XG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IHNwX2ljbyA9IGJpbmQoYXVkaW8sIFwidm9sdW1lSWNvblwiKVxuICBzcF9pY28uc3Vic2NyaWJlKGkgPT4ge1xuICAgIGljb24uc2V0KGkpO1xuICAgIGRhdGEuc2V0KGF1ZGlvLnZvbHVtZSk7XG4gICAgdGltZXI/LmNhbmNlbCgpXG4gICAgc2hvdy5zZXQodHJ1ZSk7XG4gICAgdGltZXIgPSB0aW1lb3V0KFNIT1dfVElNRSwgKCkgPT4gc2hvdy5zZXQoZmFsc2UpKTtcbiAgfSlcbiAgcmV0dXJuIDx3aW5kb3dcbiAgICBtb25pdG9yPXttb25pdG9yfVxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5JR05PUkV9XG4gICAgYW5jaG9yPXtBc3RhbC5XaW5kb3dBbmNob3IuQk9UVE9NfVxuICAgIG1hcmdpbi1ib3R0b209ezIwMH1cbiAgICBjbGFzc05hbWU9XCJPc2RcIlxuICAgIG5hbWVzcGFjZT1cImFncy1sYXVuY2hlclwiXG4gID5cbiAgICA8Ym94IHZpc2libGU9e2JpbmQoc2hvdyl9PlxuICAgICAgPGljb24gaWNvbj17YmluZChpY29uKX0gLz5cbiAgICAgIDxsZXZlbGJhciBtYXgtdmFsdWU9XCIxLjA4XCIgdmFsdWU9e2JpbmQoZGF0YSkuYXMoZD0+ZCswLjA4KX0gd2lkdGhSZXF1ZXN0PXsxNTB9IC8+XG4gICAgICA8bGFiZWwgbGFiZWw9e2JpbmQoZGF0YSkuYXModiA9PiBgJHtNYXRoLnJvdW5kKHYgKiAxMDApfSVgKX0gLz5cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiIyEvdXNyL2Jpbi9nanMgLW1cbmltcG9ydCB7IEFwcCB9IGZyb20gXCJhc3RhbC9ndGszXCI7XG5pbXBvcnQgc3R5bGUgZnJvbSBcIi4vc3R5bGUuc2Nzc1wiO1xuaW1wb3J0IEJhciBmcm9tIFwiLi93aWRnZXQvQmFyXCI7XG5pbXBvcnQgTm90aWZpY2F0aW9ucyBmcm9tIFwiLi93aWRnZXQvTm90aWZpY2F0aW9uc1wiO1xuaW1wb3J0IExhdW5jaGVyIGZyb20gXCIuL3dpZGdldC9MYXVuY2hlclwiO1xuaW1wb3J0IE9zZCBmcm9tIFwiLi93aWRnZXQvT3NkXCI7XG5cbkFwcC5zdGFydCh7XG4gIGNzczogc3R5bGUsXG4gIGluc3RhbmNlTmFtZTogXCJzaGVsbFwiLFxuICByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0LCByZXMpIHtcbiAgICBpZiAocmVxdWVzdCA9PSBcImxhdW5jaGVyXCIpIHtcbiAgICAgIEFwcC5nZXRfd2luZG93KFwibGF1bmNoZXJcIikuc2hvdygpXG4gICAgICByZXMoXCJva1wiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJpbnQoXCJ1bmtub3duIHJlcXVlc3Q6XCIsIHJlcXVlc3QpO1xuICAgICAgcmVzKFwidW5rbm93biByZXF1ZXN0XCIpO1xuICAgIH1cbiAgfSxcbiAgbWFpbjogKCkgPT4gQXBwLmdldF9tb25pdG9ycygpLmZvckVhY2goKG0pID0+IHtcbiAgICBCYXIobSk7XG4gICAgTm90aWZpY2F0aW9ucyhtKTtcbiAgICBMYXVuY2hlcihtKTtcbiAgICBPc2QobSk7XG4gIH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFBQSxPQUFPQSxZQUFXO0FBQ2xCLE9BQU9DLFVBQVM7QUFDaEIsT0FBTyxTQUFTOzs7QUNGaEIsT0FBT0MsWUFBVztBQUNsQixPQUFPLFNBQVM7QUFFaEIsT0FBTyxhQUFhOzs7QUNIcEIsT0FBTyxXQUFXO0FBUVgsSUFBTSxFQUFFLFFBQVEsSUFBSTtBQVVwQixTQUFTLFdBQ1osV0FDQSxRQUFrQyxPQUNsQyxRQUFrQyxVQUNwQztBQUNFLFFBQU0sT0FBTyxNQUFNLFFBQVEsU0FBUyxLQUFLLE9BQU8sY0FBYztBQUM5RCxRQUFNLEVBQUUsS0FBSyxLQUFLLElBQUksSUFBSTtBQUFBLElBQ3RCLEtBQUssT0FBTyxZQUFZLFVBQVU7QUFBQSxJQUNsQyxLQUFLLE9BQU8sUUFBUSxVQUFVLE9BQU87QUFBQSxJQUNyQyxLQUFLLE9BQU8sUUFBUSxVQUFVLE9BQU87QUFBQSxFQUN6QztBQUVBLFFBQU0sT0FBTyxNQUFNLFFBQVEsR0FBRyxJQUN4QixNQUFNLFFBQVEsWUFBWSxHQUFHLElBQzdCLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFFbEMsT0FBSyxRQUFRLFVBQVUsQ0FBQyxHQUFHLFdBQW1CLElBQUksTUFBTSxDQUFDO0FBQ3pELE9BQUssUUFBUSxVQUFVLENBQUMsR0FBRyxXQUFtQixJQUFJLE1BQU0sQ0FBQztBQUN6RCxTQUFPO0FBQ1g7QUFHTyxTQUFTLEtBQUssS0FBd0I7QUFDekMsU0FBTyxNQUFNLFFBQVEsR0FBRyxJQUNsQixNQUFNLFFBQVEsTUFBTSxHQUFHLElBQ3ZCLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDaEM7QUFFTyxTQUFTLFVBQVUsS0FBeUM7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QUE7QUFBQSxFQUNGO0FBQ0Y7OztBQ3JDQSxZQUFJLE1BQU07QUFBQSxFQUNSLEtBQUs7QUFBQSxFQUNMLGNBQWM7QUFBQSxFQUNkLGVBQWUsU0FBU0MsTUFBSztBQUMzQixRQUFJLFdBQVcsWUFBWTtBQUN6QixrQkFBSSxXQUFXLFVBQVUsRUFBRSxLQUFLO0FBQ2hDLE1BQUFBLEtBQUksSUFBSTtBQUFBLElBQ1YsT0FBTztBQUNMLFlBQU0sb0JBQW9CLE9BQU87QUFDakMsTUFBQUEsS0FBSSxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU0sTUFBTSxZQUFJLGFBQWEsRUFBRSxRQUFRLENBQUMsTUFBTTtBQUM1QyxRQUFJLENBQUM7QUFDTCxrQkFBYyxDQUFDO0FBQ2YsZ0JBQVMsQ0FBQztBQUNWLFFBQUksQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUNILENBQUM7IiwKICAibmFtZXMiOiBbIkFzdGFsIiwgIkd0ayIsICJBc3RhbCIsICJyZXMiLCAiQXN0YWwiLCAiYmluZCIsICJBc3RhbCIsICJpbnRlcnZhbCIsICJ0aW1lb3V0IiwgIkFzdGFsIiwgInYiLCAiaW50ZXJ2YWwiLCAiZXhlYyIsICJBc3RhbCIsICJHdGsiLCAiQXN0YWwiLCAic25ha2VpZnkiLCAicGF0Y2giLCAiQXBwcyIsICJIeXBybGFuZCIsICJOb3RpZmQiLCAiR09iamVjdCIsICJyZXMiLCAiR3RrIiwgIkFzdGFsIiwgIkFzdGFsIiwgIkd0ayIsICJHT2JqZWN0IiwgIkFzdGFsIiwgIkdPYmplY3QiLCAiR3RrIiwgImRlZmF1bHQiLCAiQXN0YWwiLCAiQXN0YWwiLCAiQXN0YWwiLCAiR09iamVjdCIsICJkZWZhdWx0IiwgIkdPYmplY3QiLCAiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgIkd0ayIsICJkZWZhdWx0IiwgIndpZmkiLCAiR3RrIiwgIkFzdGFsIiwgIkd0ayIsICJHdGsiLCAiQ0VOVEVSIiwgInRleHQiLCAiQXN0YWwiLCAibGlzdCIsICJXcCIsICJXcCIsICJBc3RhbCIsICJyZXMiXQp9Cg==
