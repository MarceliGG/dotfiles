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

// sass:/home/marcel/.config/ags/style.scss
var style_default = "* {\n  color: #f1f1f1;\n  font-size: 15px;\n}\n\n.island-layout > box {\n  margin: 4px 0;\n}\n\n.island-layout > .status {\n  padding-top: 4px;\n  padding-bottom: 4px;\n}\n\n.island-layout > .network icon {\n  /* icon seams un centered otherwise (?) */\n  margin-left: 1px;\n}\n\n.island-layout > box,\n.segment {\n  min-width: 31px;\n  background: #212223;\n  border-radius: 18px;\n  padding: 2px;\n}\n\nbutton {\n  background: transparent;\n  border: none;\n  padding: 0;\n}\n\n.workspaces button {\n  margin: 2px;\n  border-radius: 14px;\n  padding: 2px;\n  min-height: 15px;\n  min-width: 15px;\n  background: #414243;\n  border: #414243 2px solid;\n}\n.workspaces button.focused {\n  border: #378DF7 2px solid;\n  /* background: $accent; */\n  /* min-height: calc($size * 1.7); */\n}\n\n.island-layout icon {\n  margin-top: 4px;\n  margin-bottom: 2px;\n}\n\nicon {\n  font-size: 25px;\n}\n\n.icon {\n  font-size: 28px;\n}\n\n.battery {\n  /* .icon.charging {\n    color: $accent;\n  } */\n}\n\n.status {\n  margin-top: 4px;\n  /* border-top: 1px white solid; */\n}\n\n.Notifications eventbox button {\n  background: #414243;\n  border-radius: 14px;\n  margin: 0 2px;\n}\n.Notifications eventbox > box {\n  margin: 4px;\n  background: #212223;\n  padding: 4px 2px;\n  min-width: 300px;\n  border-radius: 18px;\n  border: 2px solid #414243;\n}\n.Notifications eventbox .image {\n  min-height: 80px;\n  min-width: 80px;\n  font-size: 80px;\n  margin: 8px;\n}\n.Notifications eventbox .main {\n  padding-left: 4px;\n  margin-bottom: 2px;\n}\n.Notifications eventbox .main .header .summary {\n  font-size: 1.2em;\n  font-weight: bold;\n}\n.Notifications eventbox.critical > box {\n  border-color: #378DF7;\n}\n\n.clock .icon {\n  margin-right: 5px;\n  color: #378DF7;\n}\n\nbox > .tray {\n  padding: 4px 2px;\n  /* background: red; */\n}\nbox > .tray icon {\n  font-size: 22px;\n  margin: 2px 0;\n}\n\n#launcher {\n  background: none;\n}\n#launcher .main {\n  padding: 4px;\n  padding-bottom: 12px;\n  background: #212223;\n  border-radius: 18px;\n}\n#launcher .main icon {\n  margin: 0 4px;\n}\n#launcher .main .description {\n  color: #bbb;\n  font-size: 0.8em;\n}\n#launcher .main button:hover,\n#launcher .main button:focus {\n  border: 2px solid #378DF7;\n}\n#launcher .main button {\n  border: 2px solid #414243;\n}\n#launcher .main button,\n#launcher .main entry {\n  border-radius: 14px;\n  background: #414243;\n  outline: none;\n}\n#launcher .main entry {\n  margin-bottom: 8px;\n  border: none;\n  min-height: 28px;\n  font-size: 1.3rem;\n}\n\n.Osd box {\n  background: #212223;\n  border-radius: 24px;\n  padding: 10px 12px;\n}\n.Osd box trough {\n  padding: 0;\n  margin: 8px;\n  border-radius: 5px;\n}\n.Osd box trough block {\n  border-radius: 5px;\n  border: none;\n}\n.Osd box trough block.filled {\n  background: white;\n}\n.Osd box label {\n  min-width: 40px;\n}";

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
  let w = [1, 2, 3, 4, 5];
  return /* @__PURE__ */ jsx("box", { className: "workspaces", orientation, children: w.map((ws) => /* @__PURE__ */ jsx(
    "button",
    {
      className: bind(hypr, "focusedWorkspace").as(
        (fw) => ws === fw.id ? "focused" : ""
      ),
      onClicked: () => ws.focus(),
      children: ws
    }
  )) });
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
        onClick: (btn, event) => {
          menu?.popup_at_widget(btn, Gdk.Gravity.WEST, Gdk.Gravity.EAST, null);
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
function Clock() {
  return /* @__PURE__ */ jsxs(
    "box",
    {
      className: "clock status",
      orientation: 1,
      halign: Gtk4.Align.CENTER,
      hexpand: true,
      children: [
        /* @__PURE__ */ jsx("label", { className: "icon", label: "\uE385" }),
        /* @__PURE__ */ jsx(
          "label",
          {
            label: Variable("").poll(
              1e3,
              () => default2.DateTime.new_now_local().format("%H")
            )()
          }
        ),
        /* @__PURE__ */ jsx(
          "label",
          {
            label: Variable("").poll(
              1e3,
              () => default2.DateTime.new_now_local().format("%M")
            )()
          }
        )
      ]
    }
  );
}
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
  return /* @__PURE__ */ jsxs(
    "box",
    {
      className: "battery status",
      orientation: 1,
      halign: Gtk4.Align.CENTER,
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
            label: bind(bat, "percentage").as((p) => `${Math.floor(p * 100)}`)
          }
        )
      ]
    }
  );
}
function Volume() {
  const speaker = Wp.get_default()?.audio.defaultSpeaker;
  return /* @__PURE__ */ jsxs("box", { className: "volume status", orientation: 1, children: [
    /* @__PURE__ */ jsx("icon", { icon: bind(speaker, "volumeIcon") }),
    /* @__PURE__ */ jsx("label", { label: bind(speaker, "volume").as((p) => `${Math.floor(p * 100)}`) })
  ] });
}
function Bar(monitor) {
  const { TOP, RIGHT, BOTTOM } = Astal7.WindowAnchor;
  const margin = 7;
  const network = Network.get_default();
  const wifi = bind(network, "wifi");
  const net = Variable("network-wireless-disabled-symbolic");
  return /* @__PURE__ */ jsx(
    "window",
    {
      className: "Bar",
      namespace: "ags-bar",
      gdkmonitor: monitor,
      exclusivity: Astal7.Exclusivity.EXCLUSIVE,
      "margin-top": margin,
      "margin-left": 0,
      "margin-right": margin,
      "margin-bottom": margin,
      anchor: TOP | BOTTOM | RIGHT,
      children: /* @__PURE__ */ jsxs("box", { orientation: 1, className: "island-layout", valign: Gtk4.Align.CENTER, children: [
        /* @__PURE__ */ jsx(Workspaces, { orientation: 1 }),
        /* @__PURE__ */ jsx(SysTray, { orientation: 1 }),
        /* @__PURE__ */ jsxs(
          "box",
          {
            className: "network status",
            orientation: 1,
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
                (wifi2) => wifi2 && /* @__PURE__ */ jsx("label", { label: bind(wifi2, "ssid").as((s) => s.substring(0, 2)) })
              )
            ]
          }
        ),
        /* @__PURE__ */ jsx(BatteryLevel, {}),
        /* @__PURE__ */ jsx(Volume, {}),
        /* @__PURE__ */ jsx(Clock, {})
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
  const { RIGHT } = Astal7.WindowAnchor;
  const notifs = new NotificationMap();
  return /* @__PURE__ */ jsx(
    "window",
    {
      gdkmonitor: monitor,
      namespace: "ags-notifd",
      layer: Astal7.Layer.OVERLAY,
      anchor: RIGHT,
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
var plugins = [
  {
    "init": () => {
    },
    "query": (text) => [{
      "label": text,
      "sub": "run",
      "icon": "utilities-terminal",
      "activate": () => execAsync(["sh", "-c", text])
    }],
    "prefix": "/"
  },
  {
    "init": () => {
    },
    "query": (text) => {
      res.set("...");
      if (text.length > 0)
        execAsync(["qalc", "-t", text]).then((out) => res.set(out)).catch(console.log);
      return [{
        "label": bind(res),
        "sub": "calculate using qalc",
        "icon": "accessories-calculator",
        "activate": () => execAsync(["sh", "-c", `echo ${res.get()} | wl-copy`])
      }];
    },
    "prefix": "="
  },
  {
    "init": () => windows.set(JSON.parse(exec(["hyprctl", "-j", "clients"]))),
    "query": (text) => windows.get().map((window) => {
      return {
        "label": window["title"],
        "sub": `${window["class"]} ${window["pid"]}`,
        "icon": window["class"],
        "activate": () => execAsync(["hyprctl", "dispatch", "focuswindow", `pid:${window["pid"]}`])
      };
    }).filter((w) => str_fuzzy(w["label"], text) || str_fuzzy(w["sub"], text)),
    "prefix": ";"
  }
];
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
function Applauncher() {
  const { CENTER: CENTER2 } = Gtk4.Align;
  const apps = new Apps.Apps();
  const text = Variable("");
  const list = text((text2) => {
    for (let idx in plugins) {
      if (text2.substring(0, 1) == plugins[idx].prefix) {
        if (text2.length == 1)
          plugins[idx].init();
        return plugins[idx].query(text2.substring(1, text2.length));
      }
    }
    return apps.fuzzy_query(text2).slice(0, MAX_ITEMS);
  });
  const onEnter = (inputbox) => {
    inputbox.parent.children[1].children[0].clicked();
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
        /* @__PURE__ */ jsx("levelbar", { value: bind(data), widthRequest: 150 }),
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
    if (m.model == "0x08E2") {
      Bar(m);
      Notifications(m);
      Applauncher(m);
      Osd(m);
    }
  })
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9ndGszL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hc3RhbGlmeS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL3Byb2Nlc3MudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy92YXJpYWJsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2JpbmRpbmcudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy90aW1lLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hcHAudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9vdmVycmlkZXMudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9fYXBwLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy93aWRnZXQudHMiLCAic2FzczovaG9tZS9tYXJjZWwvLmNvbmZpZy9hZ3Mvc3R5bGUuc2NzcyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZmlsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2dvYmplY3QudHMiLCAid2lkZ2V0L0Jhci5qc3giLCAid2lkZ2V0L3dvcmtzcGFjZXMuanN4IiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9qc3gtcnVudGltZS50cyIsICJ3aWRnZXQvdHJheS5qc3giLCAid2lkZ2V0L05vdGlmaWNhdGlvbnMuanN4IiwgIndpZGdldC9MYXVuY2hlci5qc3giLCAid2lkZ2V0L09zZC5qc3giLCAiYXBwLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdkayBmcm9tIFwiZ2k6Ly9HZGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IGFzdGFsaWZ5LCB7IHR5cGUgQ29uc3RydWN0UHJvcHMsIHR5cGUgQmluZGFibGVQcm9wcyB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcblxuZXhwb3J0IHsgQXN0YWwsIEd0aywgR2RrIH1cbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXBwIH0gZnJvbSBcIi4vYXBwLmpzXCJcbmV4cG9ydCB7IGFzdGFsaWZ5LCBDb25zdHJ1Y3RQcm9wcywgQmluZGFibGVQcm9wcyB9XG5leHBvcnQgKiBhcyBXaWRnZXQgZnJvbSBcIi4vd2lkZ2V0LmpzXCJcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdkayBmcm9tIFwiZ2k6Ly9HZGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgeyBleGVjQXN5bmMgfSBmcm9tIFwiLi4vcHJvY2Vzcy5qc1wiXG5pbXBvcnQgVmFyaWFibGUgZnJvbSBcIi4uL3ZhcmlhYmxlLmpzXCJcbmltcG9ydCBCaW5kaW5nLCB7IGtlYmFiaWZ5LCBzbmFrZWlmeSwgdHlwZSBDb25uZWN0YWJsZSwgdHlwZSBTdWJzY3JpYmFibGUgfSBmcm9tIFwiLi4vYmluZGluZy5qc1wiXG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUJpbmRpbmdzKGFycmF5OiBhbnlbXSkge1xuICAgIGZ1bmN0aW9uIGdldFZhbHVlcyguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBsZXQgaSA9IDBcbiAgICAgICAgcmV0dXJuIGFycmF5Lm1hcCh2YWx1ZSA9PiB2YWx1ZSBpbnN0YW5jZW9mIEJpbmRpbmdcbiAgICAgICAgICAgID8gYXJnc1tpKytdXG4gICAgICAgICAgICA6IHZhbHVlLFxuICAgICAgICApXG4gICAgfVxuXG4gICAgY29uc3QgYmluZGluZ3MgPSBhcnJheS5maWx0ZXIoaSA9PiBpIGluc3RhbmNlb2YgQmluZGluZylcblxuICAgIGlmIChiaW5kaW5ncy5sZW5ndGggPT09IDApXG4gICAgICAgIHJldHVybiBhcnJheVxuXG4gICAgaWYgKGJpbmRpbmdzLmxlbmd0aCA9PT0gMSlcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdzWzBdLmFzKGdldFZhbHVlcylcblxuICAgIHJldHVybiBWYXJpYWJsZS5kZXJpdmUoYmluZGluZ3MsIGdldFZhbHVlcykoKVxufVxuXG5mdW5jdGlvbiBzZXRQcm9wKG9iajogYW55LCBwcm9wOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICB0cnkge1xuICAgICAgICAvLyB0aGUgc2V0dGVyIG1ldGhvZCBoYXMgdG8gYmUgdXNlZCBiZWNhdXNlXG4gICAgICAgIC8vIGFycmF5IGxpa2UgcHJvcGVydGllcyBhcmUgbm90IGJvdW5kIGNvcnJlY3RseSBhcyBwcm9wc1xuICAgICAgICBjb25zdCBzZXR0ZXIgPSBgc2V0XyR7c25ha2VpZnkocHJvcCl9YFxuICAgICAgICBpZiAodHlwZW9mIG9ialtzZXR0ZXJdID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICByZXR1cm4gb2JqW3NldHRlcl0odmFsdWUpXG5cbiAgICAgICAgcmV0dXJuIChvYmpbcHJvcF0gPSB2YWx1ZSlcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYGNvdWxkIG5vdCBzZXQgcHJvcGVydHkgXCIke3Byb3B9XCIgb24gJHtvYmp9OmAsIGVycm9yKVxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYXN0YWxpZnk8XG4gICAgQyBleHRlbmRzIHsgbmV3KC4uLmFyZ3M6IGFueVtdKTogR3RrLldpZGdldCB9LFxuPihjbHM6IEMsIGNsc05hbWUgPSBjbHMubmFtZSkge1xuICAgIGNsYXNzIFdpZGdldCBleHRlbmRzIGNscyB7XG4gICAgICAgIGdldCBjc3MoKTogc3RyaW5nIHsgcmV0dXJuIEFzdGFsLndpZGdldF9nZXRfY3NzKHRoaXMpIH1cbiAgICAgICAgc2V0IGNzcyhjc3M6IHN0cmluZykgeyBBc3RhbC53aWRnZXRfc2V0X2Nzcyh0aGlzLCBjc3MpIH1cbiAgICAgICAgZ2V0X2NzcygpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5jc3MgfVxuICAgICAgICBzZXRfY3NzKGNzczogc3RyaW5nKSB7IHRoaXMuY3NzID0gY3NzIH1cblxuICAgICAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2NsYXNzX25hbWVzKHRoaXMpLmpvaW4oXCIgXCIpIH1cbiAgICAgICAgc2V0IGNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZykgeyBBc3RhbC53aWRnZXRfc2V0X2NsYXNzX25hbWVzKHRoaXMsIGNsYXNzTmFtZS5zcGxpdCgvXFxzKy8pKSB9XG4gICAgICAgIGdldF9jbGFzc19uYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmNsYXNzTmFtZSB9XG4gICAgICAgIHNldF9jbGFzc19uYW1lKGNsYXNzTmFtZTogc3RyaW5nKSB7IHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lIH1cblxuICAgICAgICBnZXQgY3Vyc29yKCk6IEN1cnNvciB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2N1cnNvcih0aGlzKSBhcyBDdXJzb3IgfVxuICAgICAgICBzZXQgY3Vyc29yKGN1cnNvcjogQ3Vyc29yKSB7IEFzdGFsLndpZGdldF9zZXRfY3Vyc29yKHRoaXMsIGN1cnNvcikgfVxuICAgICAgICBnZXRfY3Vyc29yKCk6IEN1cnNvciB7IHJldHVybiB0aGlzLmN1cnNvciB9XG4gICAgICAgIHNldF9jdXJzb3IoY3Vyc29yOiBDdXJzb3IpIHsgdGhpcy5jdXJzb3IgPSBjdXJzb3IgfVxuXG4gICAgICAgIGdldCBjbGlja1Rocm91Z2goKTogYm9vbGVhbiB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2NsaWNrX3Rocm91Z2godGhpcykgfVxuICAgICAgICBzZXQgY2xpY2tUaHJvdWdoKGNsaWNrVGhyb3VnaDogYm9vbGVhbikgeyBBc3RhbC53aWRnZXRfc2V0X2NsaWNrX3Rocm91Z2godGhpcywgY2xpY2tUaHJvdWdoKSB9XG4gICAgICAgIGdldF9jbGlja190aHJvdWdoKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5jbGlja1Rocm91Z2ggfVxuICAgICAgICBzZXRfY2xpY2tfdGhyb3VnaChjbGlja1Rocm91Z2g6IGJvb2xlYW4pIHsgdGhpcy5jbGlja1Rocm91Z2ggPSBjbGlja1Rocm91Z2ggfVxuXG4gICAgICAgIGRlY2xhcmUgcHJpdmF0ZSBfX25vX2ltcGxpY2l0X2Rlc3Ryb3k6IGJvb2xlYW5cbiAgICAgICAgZ2V0IG5vSW1wbGljaXREZXN0cm95KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fX25vX2ltcGxpY2l0X2Rlc3Ryb3kgfVxuICAgICAgICBzZXQgbm9JbXBsaWNpdERlc3Ryb3kodmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5fX25vX2ltcGxpY2l0X2Rlc3Ryb3kgPSB2YWx1ZSB9XG5cbiAgICAgICAgX3NldENoaWxkcmVuKGNoaWxkcmVuOiBHdGsuV2lkZ2V0W10pIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gY2hpbGRyZW4uZmxhdChJbmZpbml0eSkubWFwKGNoID0+IGNoIGluc3RhbmNlb2YgR3RrLldpZGdldFxuICAgICAgICAgICAgICAgID8gY2hcbiAgICAgICAgICAgICAgICA6IG5ldyBHdGsuTGFiZWwoeyB2aXNpYmxlOiB0cnVlLCBsYWJlbDogU3RyaW5nKGNoKSB9KSlcblxuICAgICAgICAgICAgLy8gcmVtb3ZlXG4gICAgICAgICAgICBpZiAodGhpcyBpbnN0YW5jZW9mIEd0ay5CaW4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaCA9IHRoaXMuZ2V0X2NoaWxkKClcbiAgICAgICAgICAgICAgICBpZiAoY2gpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlKGNoKVxuICAgICAgICAgICAgICAgIGlmIChjaCAmJiAhY2hpbGRyZW4uaW5jbHVkZXMoY2gpICYmICF0aGlzLm5vSW1wbGljaXREZXN0cm95KVxuICAgICAgICAgICAgICAgICAgICBjaD8uZGVzdHJveSgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgR3RrLkNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5nZXRfY2hpbGRyZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZShjaClcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjaGlsZHJlbi5pbmNsdWRlcyhjaCkgJiYgIXRoaXMubm9JbXBsaWNpdERlc3Ryb3kpXG4gICAgICAgICAgICAgICAgICAgICAgICBjaD8uZGVzdHJveSgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUT0RPOiBhZGQgbW9yZSBjb250YWluZXIgdHlwZXNcbiAgICAgICAgICAgIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuQm94KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfY2hpbGRyZW4oY2hpbGRyZW4pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5TdGFjaykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkcmVuKGNoaWxkcmVuKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuQ2VudGVyQm94KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydFdpZGdldCA9IGNoaWxkcmVuWzBdXG4gICAgICAgICAgICAgICAgdGhpcy5jZW50ZXJXaWRnZXQgPSBjaGlsZHJlblsxXVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kV2lkZ2V0ID0gY2hpbGRyZW5bMl1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLk92ZXJsYXkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbY2hpbGQsIC4uLm92ZXJsYXlzXSA9IGNoaWxkcmVuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfY2hpbGQoY2hpbGQpXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRfb3ZlcmxheXMob3ZlcmxheXMpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBHdGsuQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaCBvZiBjaGlsZHJlbilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGQoY2gpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKGBjYW4gbm90IGFkZCBjaGlsZHJlbiB0byAke3RoaXMuY29uc3RydWN0b3IubmFtZX0sIGl0IGlzIG5vdCBhIGNvbnRhaW5lciB3aWRnZXRgKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9nZ2xlQ2xhc3NOYW1lKGNuOiBzdHJpbmcsIGNvbmQgPSB0cnVlKSB7XG4gICAgICAgICAgICBBc3RhbC53aWRnZXRfdG9nZ2xlX2NsYXNzX25hbWUodGhpcywgY24sIGNvbmQpXG4gICAgICAgIH1cblxuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBDb25uZWN0YWJsZSxcbiAgICAgICAgICAgIHNpZ25hbDogc3RyaW5nLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKTogdGhpc1xuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBTdWJzY3JpYmFibGUsXG4gICAgICAgICAgICBjYWxsYmFjazogKHNlbGY6IHRoaXMsIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxuICAgICAgICApOiB0aGlzXG4gICAgICAgIGhvb2soXG4gICAgICAgICAgICBvYmplY3Q6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlLFxuICAgICAgICAgICAgc2lnbmFsT3JDYWxsYmFjazogc3RyaW5nIHwgKChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCksXG4gICAgICAgICAgICBjYWxsYmFjaz86IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdC5jb25uZWN0ID09PSBcImZ1bmN0aW9uXCIgJiYgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IG9iamVjdC5jb25uZWN0KHNpZ25hbE9yQ2FsbGJhY2ssIChfOiBhbnksIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh0aGlzLCAuLi5hcmdzKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIChvYmplY3QuZGlzY29ubmVjdCBhcyBDb25uZWN0YWJsZVtcImRpc2Nvbm5lY3RcIl0pKGlkKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiBvYmplY3Quc3Vic2NyaWJlID09PSBcImZ1bmN0aW9uXCIgJiYgdHlwZW9mIHNpZ25hbE9yQ2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVuc3ViID0gb2JqZWN0LnN1YnNjcmliZSgoLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNpZ25hbE9yQ2FsbGJhY2sodGhpcywgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgdW5zdWIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdHJ1Y3RvciguLi5wYXJhbXM6IGFueVtdKSB7XG4gICAgICAgICAgICBzdXBlcigpXG4gICAgICAgICAgICBjb25zdCBbY29uZmlnXSA9IHBhcmFtc1xuXG4gICAgICAgICAgICBjb25zdCB7IHNldHVwLCBjaGlsZCwgY2hpbGRyZW4gPSBbXSwgLi4ucHJvcHMgfSA9IGNvbmZpZ1xuICAgICAgICAgICAgcHJvcHMudmlzaWJsZSA/Pz0gdHJ1ZVxuXG4gICAgICAgICAgICBpZiAoY2hpbGQpXG4gICAgICAgICAgICAgICAgY2hpbGRyZW4udW5zaGlmdChjaGlsZClcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBiaW5kaW5nc1xuICAgICAgICAgICAgY29uc3QgYmluZGluZ3MgPSBPYmplY3Qua2V5cyhwcm9wcykucmVkdWNlKChhY2M6IGFueSwgcHJvcCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wc1twcm9wXSBpbnN0YW5jZW9mIEJpbmRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmluZGluZyA9IHByb3BzW3Byb3BdXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBwcm9wc1twcm9wXVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gWy4uLmFjYywgW3Byb3AsIGJpbmRpbmddXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjXG4gICAgICAgICAgICB9LCBbXSlcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBzaWduYWwgaGFuZGxlcnNcbiAgICAgICAgICAgIGNvbnN0IG9uSGFuZGxlcnMgPSBPYmplY3Qua2V5cyhwcm9wcykucmVkdWNlKChhY2M6IGFueSwga2V5KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKFwib25cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2lnID0ga2ViYWJpZnkoa2V5KS5zcGxpdChcIi1cIikuc2xpY2UoMSkuam9pbihcIi1cIilcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IHByb3BzW2tleV1cbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHByb3BzW2tleV1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsuLi5hY2MsIFtzaWcsIGhhbmRsZXJdXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjXG4gICAgICAgICAgICB9LCBbXSlcblxuICAgICAgICAgICAgLy8gc2V0IGNoaWxkcmVuXG4gICAgICAgICAgICBjb25zdCBtZXJnZWRDaGlsZHJlbiA9IG1lcmdlQmluZGluZ3MoY2hpbGRyZW4uZmxhdChJbmZpbml0eSkpXG4gICAgICAgICAgICBpZiAobWVyZ2VkQ2hpbGRyZW4gaW5zdGFuY2VvZiBCaW5kaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4obWVyZ2VkQ2hpbGRyZW4uZ2V0KCkpXG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBtZXJnZWRDaGlsZHJlbi5zdWJzY3JpYmUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4odilcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChtZXJnZWRDaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKG1lcmdlZENoaWxkcmVuKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgc2lnbmFsIGhhbmRsZXJzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtzaWduYWwsIGNhbGxiYWNrXSBvZiBvbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChzaWduYWwsIGNhbGxiYWNrKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KHNpZ25hbCwgKCkgPT4gZXhlY0FzeW5jKGNhbGxiYWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4ocHJpbnQpLmNhdGNoKGNvbnNvbGUuZXJyb3IpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgYmluZGluZ3MgaGFuZGxlcnNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW3Byb3AsIGJpbmRpbmddIG9mIGJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHByb3AgPT09IFwiY2hpbGRcIiB8fCBwcm9wID09PSBcImNoaWxkcmVuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBiaW5kaW5nLnN1YnNjcmliZSgodjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbih2KVxuICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0KFwiZGVzdHJveVwiLCBiaW5kaW5nLnN1YnNjcmliZSgodjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNldFByb3AodGhpcywgcHJvcCwgdilcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICBzZXRQcm9wKHRoaXMsIHByb3AsIGJpbmRpbmcuZ2V0KCkpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgcHJvcHMpXG4gICAgICAgICAgICBzZXR1cD8uKHRoaXMpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3Moe1xuICAgICAgICBHVHlwZU5hbWU6IGBBc3RhbF8ke2Nsc05hbWV9YCxcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgXCJjbGFzcy1uYW1lXCI6IEdPYmplY3QuUGFyYW1TcGVjLnN0cmluZyhcbiAgICAgICAgICAgICAgICBcImNsYXNzLW5hbWVcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcImNzc1wiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjc3NcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcImN1cnNvclwiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjdXJzb3JcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgXCJkZWZhdWx0XCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjbGljay10aHJvdWdoXCI6IEdPYmplY3QuUGFyYW1TcGVjLmJvb2xlYW4oXG4gICAgICAgICAgICAgICAgXCJjbGljay10aHJvdWdoXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIGZhbHNlLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwibm8taW1wbGljaXQtZGVzdHJveVwiOiBHT2JqZWN0LlBhcmFtU3BlYy5ib29sZWFuKFxuICAgICAgICAgICAgICAgIFwibm8taW1wbGljaXQtZGVzdHJveVwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBmYWxzZSxcbiAgICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgfSwgV2lkZ2V0KVxuXG4gICAgcmV0dXJuIFdpZGdldFxufVxuXG5leHBvcnQgdHlwZSBCaW5kYWJsZVByb3BzPFQ+ID0ge1xuICAgIFtLIGluIGtleW9mIFRdOiBCaW5kaW5nPFRbS10+IHwgVFtLXTtcbn1cblxudHlwZSBTaWdIYW5kbGVyPFxuICAgIFcgZXh0ZW5kcyBJbnN0YW5jZVR5cGU8dHlwZW9mIEd0ay5XaWRnZXQ+LFxuICAgIEFyZ3MgZXh0ZW5kcyBBcnJheTx1bmtub3duPixcbj4gPSAoKHNlbGY6IFcsIC4uLmFyZ3M6IEFyZ3MpID0+IHVua25vd24pIHwgc3RyaW5nIHwgc3RyaW5nW11cblxuZXhwb3J0IHR5cGUgQ29uc3RydWN0UHJvcHM8XG4gICAgU2VsZiBleHRlbmRzIEluc3RhbmNlVHlwZTx0eXBlb2YgR3RrLldpZGdldD4sXG4gICAgUHJvcHMgZXh0ZW5kcyBHdGsuV2lkZ2V0LkNvbnN0cnVjdG9yUHJvcHMsXG4gICAgU2lnbmFscyBleHRlbmRzIFJlY29yZDxgb24ke3N0cmluZ31gLCBBcnJheTx1bmtub3duPj4gPSBSZWNvcmQ8YG9uJHtzdHJpbmd9YCwgYW55W10+LFxuPiA9IFBhcnRpYWw8e1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgY2FuJ3QgYXNzaWduIHRvIHVua25vd24sIGJ1dCBpdCB3b3JrcyBhcyBleHBlY3RlZCB0aG91Z2hcbiAgICBbUyBpbiBrZXlvZiBTaWduYWxzXTogU2lnSGFuZGxlcjxTZWxmLCBTaWduYWxzW1NdPlxufT4gJiBQYXJ0aWFsPHtcbiAgICBbS2V5IGluIGBvbiR7c3RyaW5nfWBdOiBTaWdIYW5kbGVyPFNlbGYsIGFueVtdPlxufT4gJiBCaW5kYWJsZVByb3BzPFBhcnRpYWw8UHJvcHM+ICYge1xuICAgIGNsYXNzTmFtZT86IHN0cmluZ1xuICAgIGNzcz86IHN0cmluZ1xuICAgIGN1cnNvcj86IHN0cmluZ1xuICAgIGNsaWNrVGhyb3VnaD86IGJvb2xlYW5cbn0+ICYge1xuICAgIG9uRGVzdHJveT86IChzZWxmOiBTZWxmKSA9PiB1bmtub3duXG4gICAgb25EcmF3PzogKHNlbGY6IFNlbGYpID0+IHVua25vd25cbiAgICBvbktleVByZXNzRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uS2V5UmVsZWFzZUV2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbkJ1dHRvblByZXNzRXZlbnQ/OiAoc2VsZjogU2VsZiwgZXZlbnQ6IEdkay5FdmVudCkgPT4gdW5rbm93blxuICAgIG9uQnV0dG9uUmVsZWFzZUV2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvblJlYWxpemU/OiAoc2VsZjogU2VsZikgPT4gdW5rbm93blxuICAgIHNldHVwPzogKHNlbGY6IFNlbGYpID0+IHZvaWRcbn1cblxuZXhwb3J0IHR5cGUgQmluZGFibGVDaGlsZCA9IEd0ay5XaWRnZXQgfCBCaW5kaW5nPEd0ay5XaWRnZXQ+XG5cbnR5cGUgQ3Vyc29yID1cbiAgICB8IFwiZGVmYXVsdFwiXG4gICAgfCBcImhlbHBcIlxuICAgIHwgXCJwb2ludGVyXCJcbiAgICB8IFwiY29udGV4dC1tZW51XCJcbiAgICB8IFwicHJvZ3Jlc3NcIlxuICAgIHwgXCJ3YWl0XCJcbiAgICB8IFwiY2VsbFwiXG4gICAgfCBcImNyb3NzaGFpclwiXG4gICAgfCBcInRleHRcIlxuICAgIHwgXCJ2ZXJ0aWNhbC10ZXh0XCJcbiAgICB8IFwiYWxpYXNcIlxuICAgIHwgXCJjb3B5XCJcbiAgICB8IFwibm8tZHJvcFwiXG4gICAgfCBcIm1vdmVcIlxuICAgIHwgXCJub3QtYWxsb3dlZFwiXG4gICAgfCBcImdyYWJcIlxuICAgIHwgXCJncmFiYmluZ1wiXG4gICAgfCBcImFsbC1zY3JvbGxcIlxuICAgIHwgXCJjb2wtcmVzaXplXCJcbiAgICB8IFwicm93LXJlc2l6ZVwiXG4gICAgfCBcIm4tcmVzaXplXCJcbiAgICB8IFwiZS1yZXNpemVcIlxuICAgIHwgXCJzLXJlc2l6ZVwiXG4gICAgfCBcInctcmVzaXplXCJcbiAgICB8IFwibmUtcmVzaXplXCJcbiAgICB8IFwibnctcmVzaXplXCJcbiAgICB8IFwic3ctcmVzaXplXCJcbiAgICB8IFwic2UtcmVzaXplXCJcbiAgICB8IFwiZXctcmVzaXplXCJcbiAgICB8IFwibnMtcmVzaXplXCJcbiAgICB8IFwibmVzdy1yZXNpemVcIlxuICAgIHwgXCJud3NlLXJlc2l6ZVwiXG4gICAgfCBcInpvb20taW5cIlxuICAgIHwgXCJ6b29tLW91dFwiXG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuXG50eXBlIEFyZ3MgPSB7XG4gICAgY21kOiBzdHJpbmcgfCBzdHJpbmdbXVxuICAgIG91dD86IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZFxuICAgIGVycj86IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZFxufVxuXG5leHBvcnQgY29uc3QgeyBQcm9jZXNzIH0gPSBBc3RhbFxuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhhcmdzOiBBcmdzKTogQXN0YWwuUHJvY2Vzc1xuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhcbiAgICBjbWQ6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIG9uT3V0PzogKHN0ZG91dDogc3RyaW5nKSA9PiB2b2lkLFxuICAgIG9uRXJyPzogKHN0ZGVycjogc3RyaW5nKSA9PiB2b2lkLFxuKTogQXN0YWwuUHJvY2Vzc1xuXG5leHBvcnQgZnVuY3Rpb24gc3VicHJvY2VzcyhcbiAgICBhcmdzT3JDbWQ6IEFyZ3MgfCBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICBvbk91dDogKHN0ZG91dDogc3RyaW5nKSA9PiB2b2lkID0gcHJpbnQsXG4gICAgb25FcnI6IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZCA9IHByaW50ZXJyLFxuKSB7XG4gICAgY29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkoYXJnc09yQ21kKSB8fCB0eXBlb2YgYXJnc09yQ21kID09PSBcInN0cmluZ1wiXG4gICAgY29uc3QgeyBjbWQsIGVyciwgb3V0IH0gPSB7XG4gICAgICAgIGNtZDogYXJncyA/IGFyZ3NPckNtZCA6IGFyZ3NPckNtZC5jbWQsXG4gICAgICAgIGVycjogYXJncyA/IG9uRXJyIDogYXJnc09yQ21kLmVyciB8fCBvbkVycixcbiAgICAgICAgb3V0OiBhcmdzID8gb25PdXQgOiBhcmdzT3JDbWQub3V0IHx8IG9uT3V0LFxuICAgIH1cblxuICAgIGNvbnN0IHByb2MgPSBBcnJheS5pc0FycmF5KGNtZClcbiAgICAgICAgPyBBc3RhbC5Qcm9jZXNzLnN1YnByb2Nlc3N2KGNtZClcbiAgICAgICAgOiBBc3RhbC5Qcm9jZXNzLnN1YnByb2Nlc3MoY21kKVxuXG4gICAgcHJvYy5jb25uZWN0KFwic3Rkb3V0XCIsIChfLCBzdGRvdXQ6IHN0cmluZykgPT4gb3V0KHN0ZG91dCkpXG4gICAgcHJvYy5jb25uZWN0KFwic3RkZXJyXCIsIChfLCBzdGRlcnI6IHN0cmluZykgPT4gZXJyKHN0ZGVycikpXG4gICAgcmV0dXJuIHByb2Ncbn1cblxuLyoqIEB0aHJvd3Mge0dMaWIuRXJyb3J9IFRocm93cyBzdGRlcnIgKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjKGNtZDogc3RyaW5nIHwgc3RyaW5nW10pIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShjbWQpXG4gICAgICAgID8gQXN0YWwuUHJvY2Vzcy5leGVjdihjbWQpXG4gICAgICAgIDogQXN0YWwuUHJvY2Vzcy5leGVjKGNtZClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWNBc3luYyhjbWQ6IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbWQpKSB7XG4gICAgICAgICAgICBBc3RhbC5Qcm9jZXNzLmV4ZWNfYXN5bmN2KGNtZCwgKF8sIHJlcykgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jdl9maW5pc2gocmVzKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jKGNtZCwgKF8sIHJlcykgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoQXN0YWwuUHJvY2Vzcy5leGVjX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxufVxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBCaW5kaW5nLCB7IHR5cGUgQ29ubmVjdGFibGUsIHR5cGUgU3Vic2NyaWJhYmxlIH0gZnJvbSBcIi4vYmluZGluZy5qc1wiXG5pbXBvcnQgeyBpbnRlcnZhbCB9IGZyb20gXCIuL3RpbWUuanNcIlxuaW1wb3J0IHsgZXhlY0FzeW5jLCBzdWJwcm9jZXNzIH0gZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5cbmNsYXNzIFZhcmlhYmxlV3JhcHBlcjxUPiBleHRlbmRzIEZ1bmN0aW9uIHtcbiAgICBwcml2YXRlIHZhcmlhYmxlITogQXN0YWwuVmFyaWFibGVCYXNlXG4gICAgcHJpdmF0ZSBlcnJIYW5kbGVyPyA9IGNvbnNvbGUuZXJyb3JcblxuICAgIHByaXZhdGUgX3ZhbHVlOiBUXG4gICAgcHJpdmF0ZSBfcG9sbD86IEFzdGFsLlRpbWVcbiAgICBwcml2YXRlIF93YXRjaD86IEFzdGFsLlByb2Nlc3NcblxuICAgIHByaXZhdGUgcG9sbEludGVydmFsID0gMTAwMFxuICAgIHByaXZhdGUgcG9sbEV4ZWM/OiBzdHJpbmdbXSB8IHN0cmluZ1xuICAgIHByaXZhdGUgcG9sbFRyYW5zZm9ybT86IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVFxuICAgIHByaXZhdGUgcG9sbEZuPzogKHByZXY6IFQpID0+IFQgfCBQcm9taXNlPFQ+XG5cbiAgICBwcml2YXRlIHdhdGNoVHJhbnNmb3JtPzogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUXG4gICAgcHJpdmF0ZSB3YXRjaEV4ZWM/OiBzdHJpbmdbXSB8IHN0cmluZ1xuXG4gICAgY29uc3RydWN0b3IoaW5pdDogVCkge1xuICAgICAgICBzdXBlcigpXG4gICAgICAgIHRoaXMuX3ZhbHVlID0gaW5pdFxuICAgICAgICB0aGlzLnZhcmlhYmxlID0gbmV3IEFzdGFsLlZhcmlhYmxlQmFzZSgpXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImRyb3BwZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zdG9wV2F0Y2goKVxuICAgICAgICAgICAgdGhpcy5zdG9wUG9sbCgpXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImVycm9yXCIsIChfLCBlcnIpID0+IHRoaXMuZXJySGFuZGxlcj8uKGVycikpXG4gICAgICAgIHJldHVybiBuZXcgUHJveHkodGhpcywge1xuICAgICAgICAgICAgYXBwbHk6ICh0YXJnZXQsIF8sIGFyZ3MpID0+IHRhcmdldC5fY2FsbChhcmdzWzBdKSxcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBwcml2YXRlIF9jYWxsPFIgPSBUPih0cmFuc2Zvcm0/OiAodmFsdWU6IFQpID0+IFIpOiBCaW5kaW5nPFI+IHtcbiAgICAgICAgY29uc3QgYiA9IEJpbmRpbmcuYmluZCh0aGlzKVxuICAgICAgICByZXR1cm4gdHJhbnNmb3JtID8gYi5hcyh0cmFuc2Zvcm0pIDogYiBhcyB1bmtub3duIGFzIEJpbmRpbmc8Uj5cbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhgVmFyaWFibGU8JHt0aGlzLmdldCgpfT5gKVxuICAgIH1cblxuICAgIGdldCgpOiBUIHsgcmV0dXJuIHRoaXMuX3ZhbHVlIH1cbiAgICBzZXQodmFsdWU6IFQpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl92YWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fdmFsdWUgPSB2YWx1ZVxuICAgICAgICAgICAgdGhpcy52YXJpYWJsZS5lbWl0KFwiY2hhbmdlZFwiKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRQb2xsKCkge1xuICAgICAgICBpZiAodGhpcy5fcG9sbClcbiAgICAgICAgICAgIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLnBvbGxGbikge1xuICAgICAgICAgICAgdGhpcy5fcG9sbCA9IGludGVydmFsKHRoaXMucG9sbEludGVydmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHRoaXMucG9sbEZuISh0aGlzLmdldCgpKVxuICAgICAgICAgICAgICAgIGlmICh2IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICB2LnRoZW4odiA9PiB0aGlzLnNldCh2KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy52YXJpYWJsZS5lbWl0KFwiZXJyb3JcIiwgZXJyKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0KHYpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLnBvbGxFeGVjKSB7XG4gICAgICAgICAgICB0aGlzLl9wb2xsID0gaW50ZXJ2YWwodGhpcy5wb2xsSW50ZXJ2YWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBleGVjQXN5bmModGhpcy5wb2xsRXhlYyEpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKHYgPT4gdGhpcy5zZXQodGhpcy5wb2xsVHJhbnNmb3JtISh2LCB0aGlzLmdldCgpKSkpXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy52YXJpYWJsZS5lbWl0KFwiZXJyb3JcIiwgZXJyKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFdhdGNoKCkge1xuICAgICAgICBpZiAodGhpcy5fd2F0Y2gpXG4gICAgICAgICAgICByZXR1cm5cblxuICAgICAgICB0aGlzLl93YXRjaCA9IHN1YnByb2Nlc3Moe1xuICAgICAgICAgICAgY21kOiB0aGlzLndhdGNoRXhlYyEsXG4gICAgICAgICAgICBvdXQ6IG91dCA9PiB0aGlzLnNldCh0aGlzLndhdGNoVHJhbnNmb3JtIShvdXQsIHRoaXMuZ2V0KCkpKSxcbiAgICAgICAgICAgIGVycjogZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVyciksXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgc3RvcFBvbGwoKSB7XG4gICAgICAgIHRoaXMuX3BvbGw/LmNhbmNlbCgpXG4gICAgICAgIGRlbGV0ZSB0aGlzLl9wb2xsXG4gICAgfVxuXG4gICAgc3RvcFdhdGNoKCkge1xuICAgICAgICB0aGlzLl93YXRjaD8ua2lsbCgpXG4gICAgICAgIGRlbGV0ZSB0aGlzLl93YXRjaFxuICAgIH1cblxuICAgIGlzUG9sbGluZygpIHsgcmV0dXJuICEhdGhpcy5fcG9sbCB9XG4gICAgaXNXYXRjaGluZygpIHsgcmV0dXJuICEhdGhpcy5fd2F0Y2ggfVxuXG4gICAgZHJvcCgpIHtcbiAgICAgICAgdGhpcy52YXJpYWJsZS5lbWl0KFwiZHJvcHBlZFwiKVxuICAgIH1cblxuICAgIG9uRHJvcHBlZChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJkcm9wcGVkXCIsIGNhbGxiYWNrKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgb25FcnJvcihjYWxsYmFjazogKGVycjogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmVyckhhbmRsZXJcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZXJyb3JcIiwgKF8sIGVycikgPT4gY2FsbGJhY2soZXJyKSlcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBUKSA9PiB2b2lkKSB7XG4gICAgICAgIGNvbnN0IGlkID0gdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiY2hhbmdlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICBjYWxsYmFjayh0aGlzLmdldCgpKVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gKCkgPT4gdGhpcy52YXJpYWJsZS5kaXNjb25uZWN0KGlkKVxuICAgIH1cblxuICAgIHBvbGwoXG4gICAgICAgIGludGVydmFsOiBudW1iZXIsXG4gICAgICAgIGV4ZWM6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgICAgICB0cmFuc2Zvcm0/OiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFRcbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgcG9sbChcbiAgICAgICAgaW50ZXJ2YWw6IG51bWJlcixcbiAgICAgICAgY2FsbGJhY2s6IChwcmV2OiBUKSA9PiBUIHwgUHJvbWlzZTxUPlxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBwb2xsKFxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyLFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSB8ICgocHJldjogVCkgPT4gVCB8IFByb21pc2U8VD4pLFxuICAgICAgICB0cmFuc2Zvcm06IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVCA9IG91dCA9PiBvdXQgYXMgVCxcbiAgICApIHtcbiAgICAgICAgdGhpcy5zdG9wUG9sbCgpXG4gICAgICAgIHRoaXMucG9sbEludGVydmFsID0gaW50ZXJ2YWxcbiAgICAgICAgdGhpcy5wb2xsVHJhbnNmb3JtID0gdHJhbnNmb3JtXG4gICAgICAgIGlmICh0eXBlb2YgZXhlYyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvbGxGbiA9IGV4ZWNcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnBvbGxFeGVjXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvbGxFeGVjID0gZXhlY1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMucG9sbEZuXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdGFydFBvbGwoKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgd2F0Y2goXG4gICAgICAgIGV4ZWM6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgICAgICB0cmFuc2Zvcm06IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVCA9IG91dCA9PiBvdXQgYXMgVCxcbiAgICApIHtcbiAgICAgICAgdGhpcy5zdG9wV2F0Y2goKVxuICAgICAgICB0aGlzLndhdGNoRXhlYyA9IGV4ZWNcbiAgICAgICAgdGhpcy53YXRjaFRyYW5zZm9ybSA9IHRyYW5zZm9ybVxuICAgICAgICB0aGlzLnN0YXJ0V2F0Y2goKVxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgb2JzZXJ2ZShcbiAgICAgICAgb2JqczogQXJyYXk8W29iajogQ29ubmVjdGFibGUsIHNpZ25hbDogc3RyaW5nXT4sXG4gICAgICAgIGNhbGxiYWNrOiAoLi4uYXJnczogYW55W10pID0+IFQsXG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIG9ic2VydmUoXG4gICAgICAgIG9iajogQ29ubmVjdGFibGUsXG4gICAgICAgIHNpZ25hbDogc3RyaW5nLFxuICAgICAgICBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBvYnNlcnZlKFxuICAgICAgICBvYmpzOiBDb25uZWN0YWJsZSB8IEFycmF5PFtvYmo6IENvbm5lY3RhYmxlLCBzaWduYWw6IHN0cmluZ10+LFxuICAgICAgICBzaWdPckZuOiBzdHJpbmcgfCAoKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiBUKSxcbiAgICAgICAgY2FsbGJhY2s/OiAob2JqOiBDb25uZWN0YWJsZSwgLi4uYXJnczogYW55W10pID0+IFQsXG4gICAgKSB7XG4gICAgICAgIGNvbnN0IGYgPSB0eXBlb2Ygc2lnT3JGbiA9PT0gXCJmdW5jdGlvblwiID8gc2lnT3JGbiA6IGNhbGxiYWNrID8/ICgoKSA9PiB0aGlzLmdldCgpKVxuICAgICAgICBjb25zdCBzZXQgPSAob2JqOiBDb25uZWN0YWJsZSwgLi4uYXJnczogYW55W10pID0+IHRoaXMuc2V0KGYob2JqLCAuLi5hcmdzKSlcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvYmpzKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBvYmogb2Ygb2Jqcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtvLCBzXSA9IG9ialxuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gby5jb25uZWN0KHMsIHNldClcbiAgICAgICAgICAgICAgICB0aGlzLm9uRHJvcHBlZCgoKSA9PiBvLmRpc2Nvbm5lY3QoaWQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzaWdPckZuID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBvYmpzLmNvbm5lY3Qoc2lnT3JGbiwgc2V0KVxuICAgICAgICAgICAgICAgIHRoaXMub25Ecm9wcGVkKCgpID0+IG9ianMuZGlzY29ubmVjdChpZCkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFZhcmlhYmxlPFQ+XG4gICAgfVxuXG4gICAgc3RhdGljIGRlcml2ZTxcbiAgICAgICAgY29uc3QgRGVwcyBleHRlbmRzIEFycmF5PFN1YnNjcmliYWJsZTxhbnk+PixcbiAgICAgICAgQXJncyBleHRlbmRzIHtcbiAgICAgICAgICAgIFtLIGluIGtleW9mIERlcHNdOiBEZXBzW0tdIGV4dGVuZHMgU3Vic2NyaWJhYmxlPGluZmVyIFQ+ID8gVCA6IG5ldmVyXG4gICAgICAgIH0sXG4gICAgICAgIFYgPSBBcmdzLFxuICAgID4oZGVwczogRGVwcywgZm46ICguLi5hcmdzOiBBcmdzKSA9PiBWID0gKC4uLmFyZ3MpID0+IGFyZ3MgYXMgdW5rbm93biBhcyBWKSB7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9ICgpID0+IGZuKC4uLmRlcHMubWFwKGQgPT4gZC5nZXQoKSkgYXMgQXJncylcbiAgICAgICAgY29uc3QgZGVyaXZlZCA9IG5ldyBWYXJpYWJsZSh1cGRhdGUoKSlcbiAgICAgICAgY29uc3QgdW5zdWJzID0gZGVwcy5tYXAoZGVwID0+IGRlcC5zdWJzY3JpYmUoKCkgPT4gZGVyaXZlZC5zZXQodXBkYXRlKCkpKSlcbiAgICAgICAgZGVyaXZlZC5vbkRyb3BwZWQoKCkgPT4gdW5zdWJzLm1hcCh1bnN1YiA9PiB1bnN1YigpKSlcbiAgICAgICAgcmV0dXJuIGRlcml2ZWRcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFyaWFibGU8VD4gZXh0ZW5kcyBPbWl0PFZhcmlhYmxlV3JhcHBlcjxUPiwgXCJiaW5kXCI+IHtcbiAgICA8Uj4odHJhbnNmb3JtOiAodmFsdWU6IFQpID0+IFIpOiBCaW5kaW5nPFI+XG4gICAgKCk6IEJpbmRpbmc8VD5cbn1cblxuZXhwb3J0IGNvbnN0IFZhcmlhYmxlID0gbmV3IFByb3h5KFZhcmlhYmxlV3JhcHBlciBhcyBhbnksIHtcbiAgICBhcHBseTogKF90LCBfYSwgYXJncykgPT4gbmV3IFZhcmlhYmxlV3JhcHBlcihhcmdzWzBdKSxcbn0pIGFzIHtcbiAgICBkZXJpdmU6IHR5cGVvZiBWYXJpYWJsZVdyYXBwZXJbXCJkZXJpdmVcIl1cbiAgICA8VD4oaW5pdDogVCk6IFZhcmlhYmxlPFQ+XG4gICAgbmV3PFQ+KGluaXQ6IFQpOiBWYXJpYWJsZTxUPlxufVxuXG5leHBvcnQgZGVmYXVsdCBWYXJpYWJsZVxuIiwgImV4cG9ydCBjb25zdCBzbmFrZWlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDFfJDJcIilcbiAgICAucmVwbGFjZUFsbChcIi1cIiwgXCJfXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxuZXhwb3J0IGNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnNjcmliYWJsZTxUID0gdW5rbm93bj4ge1xuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBUKSA9PiB2b2lkKTogKCkgPT4gdm9pZFxuICAgIGdldCgpOiBUXG4gICAgW2tleTogc3RyaW5nXTogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubmVjdGFibGUge1xuICAgIGNvbm5lY3Qoc2lnbmFsOiBzdHJpbmcsIGNhbGxiYWNrOiAoLi4uYXJnczogYW55W10pID0+IHVua25vd24pOiBudW1iZXJcbiAgICBkaXNjb25uZWN0KGlkOiBudW1iZXIpOiB2b2lkXG4gICAgW2tleTogc3RyaW5nXTogYW55XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJpbmRpbmc8VmFsdWU+IHtcbiAgICBwcml2YXRlIHRyYW5zZm9ybUZuID0gKHY6IGFueSkgPT4gdlxuXG4gICAgI2VtaXR0ZXI6IFN1YnNjcmliYWJsZTxWYWx1ZT4gfCBDb25uZWN0YWJsZVxuICAgICNwcm9wPzogc3RyaW5nXG5cbiAgICBzdGF0aWMgYmluZDxcbiAgICAgICAgVCBleHRlbmRzIENvbm5lY3RhYmxlLFxuICAgICAgICBQIGV4dGVuZHMga2V5b2YgVCxcbiAgICA+KG9iamVjdDogVCwgcHJvcGVydHk6IFApOiBCaW5kaW5nPFRbUF0+XG5cbiAgICBzdGF0aWMgYmluZDxUPihvYmplY3Q6IFN1YnNjcmliYWJsZTxUPik6IEJpbmRpbmc8VD5cblxuICAgIHN0YXRpYyBiaW5kKGVtaXR0ZXI6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlLCBwcm9wPzogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQmluZGluZyhlbWl0dGVyLCBwcm9wKVxuICAgIH1cblxuICAgIHByaXZhdGUgY29uc3RydWN0b3IoZW1pdHRlcjogQ29ubmVjdGFibGUgfCBTdWJzY3JpYmFibGU8VmFsdWU+LCBwcm9wPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuI2VtaXR0ZXIgPSBlbWl0dGVyXG4gICAgICAgIHRoaXMuI3Byb3AgPSBwcm9wICYmIGtlYmFiaWZ5KHByb3ApXG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBgQmluZGluZzwke3RoaXMuI2VtaXR0ZXJ9JHt0aGlzLiNwcm9wID8gYCwgXCIke3RoaXMuI3Byb3B9XCJgIDogXCJcIn0+YFxuICAgIH1cblxuICAgIGFzPFQ+KGZuOiAodjogVmFsdWUpID0+IFQpOiBCaW5kaW5nPFQ+IHtcbiAgICAgICAgY29uc3QgYmluZCA9IG5ldyBCaW5kaW5nKHRoaXMuI2VtaXR0ZXIsIHRoaXMuI3Byb3ApXG4gICAgICAgIGJpbmQudHJhbnNmb3JtRm4gPSAodjogVmFsdWUpID0+IGZuKHRoaXMudHJhbnNmb3JtRm4odikpXG4gICAgICAgIHJldHVybiBiaW5kIGFzIHVua25vd24gYXMgQmluZGluZzxUPlxuICAgIH1cblxuICAgIGdldCgpOiBWYWx1ZSB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlci5nZXQgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybUZuKHRoaXMuI2VtaXR0ZXIuZ2V0KCkpXG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNwcm9wID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBnZXR0ZXIgPSBgZ2V0XyR7c25ha2VpZnkodGhpcy4jcHJvcCl9YFxuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyW2dldHRlcl0gPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Gbih0aGlzLiNlbWl0dGVyW2dldHRlcl0oKSlcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtRm4odGhpcy4jZW1pdHRlclt0aGlzLiNwcm9wXSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IEVycm9yKFwiY2FuIG5vdCBnZXQgdmFsdWUgb2YgYmluZGluZ1wiKVxuICAgIH1cblxuICAgIHN1YnNjcmliZShjYWxsYmFjazogKHZhbHVlOiBWYWx1ZSkgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuc3Vic2NyaWJlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiNlbWl0dGVyLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuY29ubmVjdCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBjb25zdCBzaWduYWwgPSBgbm90aWZ5Ojoke3RoaXMuI3Byb3B9YFxuICAgICAgICAgICAgY29uc3QgaWQgPSB0aGlzLiNlbWl0dGVyLmNvbm5lY3Qoc2lnbmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICAgICAgICAgICh0aGlzLiNlbWl0dGVyLmRpc2Nvbm5lY3QgYXMgQ29ubmVjdGFibGVbXCJkaXNjb25uZWN0XCJdKShpZClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBFcnJvcihgJHt0aGlzLiNlbWl0dGVyfSBpcyBub3QgYmluZGFibGVgKVxuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IHsgYmluZCB9ID0gQmluZGluZ1xuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcblxuZXhwb3J0IGNvbnN0IHsgVGltZSB9ID0gQXN0YWxcblxuZXhwb3J0IGZ1bmN0aW9uIGludGVydmFsKGludGVydmFsOiBudW1iZXIsIGNhbGxiYWNrPzogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBBc3RhbC5UaW1lLmludGVydmFsKGludGVydmFsLCAoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRpbWVvdXQodGltZW91dDogbnVtYmVyLCBjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS50aW1lb3V0KHRpbWVvdXQsICgpID0+IHZvaWQgY2FsbGJhY2s/LigpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaWRsZShjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS5pZGxlKCgpID0+IHZvaWQgY2FsbGJhY2s/LigpKVxufVxuIiwgImltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgeyBta0FwcCB9IGZyb20gXCIuLi9fYXBwXCJcblxuR3RrLmluaXQobnVsbClcblxuZXhwb3J0IGRlZmF1bHQgbWtBcHAoQXN0YWwuQXBwbGljYXRpb24pXG4iLCAiLyoqXG4gKiBXb3JrYXJvdW5kIGZvciBcIkNhbid0IGNvbnZlcnQgbm9uLW51bGwgcG9pbnRlciB0byBKUyB2YWx1ZSBcIlxuICovXG5cbmV4cG9ydCB7IH1cblxuY29uc3Qgc25ha2VpZnkgPSAoc3RyOiBzdHJpbmcpID0+IHN0clxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCBcIiQxXyQyXCIpXG4gICAgLnJlcGxhY2VBbGwoXCItXCIsIFwiX1wiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG5cbmFzeW5jIGZ1bmN0aW9uIHN1cHByZXNzPFQ+KG1vZDogUHJvbWlzZTx7IGRlZmF1bHQ6IFQgfT4sIHBhdGNoOiAobTogVCkgPT4gdm9pZCkge1xuICAgIHJldHVybiBtb2QudGhlbihtID0+IHBhdGNoKG0uZGVmYXVsdCkpLmNhdGNoKCgpID0+IHZvaWQgMClcbn1cblxuZnVuY3Rpb24gcGF0Y2g8UCBleHRlbmRzIG9iamVjdD4ocHJvdG86IFAsIHByb3A6IEV4dHJhY3Q8a2V5b2YgUCwgc3RyaW5nPikge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywgcHJvcCwge1xuICAgICAgICBnZXQoKSB7IHJldHVybiB0aGlzW2BnZXRfJHtzbmFrZWlmeShwcm9wKX1gXSgpIH0sXG4gICAgfSlcbn1cblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEFwcHNcIiksICh7IEFwcHMsIEFwcGxpY2F0aW9uIH0pID0+IHtcbiAgICBwYXRjaChBcHBzLnByb3RvdHlwZSwgXCJsaXN0XCIpXG4gICAgcGF0Y2goQXBwbGljYXRpb24ucHJvdG90eXBlLCBcImtleXdvcmRzXCIpXG4gICAgcGF0Y2goQXBwbGljYXRpb24ucHJvdG90eXBlLCBcImNhdGVnb3JpZXNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxCYXR0ZXJ5XCIpLCAoeyBVUG93ZXIgfSkgPT4ge1xuICAgIHBhdGNoKFVQb3dlci5wcm90b3R5cGUsIFwiZGV2aWNlc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbEJsdWV0b290aFwiKSwgKHsgQWRhcHRlciwgQmx1ZXRvb3RoLCBEZXZpY2UgfSkgPT4ge1xuICAgIHBhdGNoKEFkYXB0ZXIucHJvdG90eXBlLCBcInV1aWRzXCIpXG4gICAgcGF0Y2goQmx1ZXRvb3RoLnByb3RvdHlwZSwgXCJhZGFwdGVyc1wiKVxuICAgIHBhdGNoKEJsdWV0b290aC5wcm90b3R5cGUsIFwiZGV2aWNlc1wiKVxuICAgIHBhdGNoKERldmljZS5wcm90b3R5cGUsIFwidXVpZHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxIeXBybGFuZFwiKSwgKHsgSHlwcmxhbmQsIE1vbml0b3IsIFdvcmtzcGFjZSB9KSA9PiB7XG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcIm1vbml0b3JzXCIpXG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcIndvcmtzcGFjZXNcIilcbiAgICBwYXRjaChIeXBybGFuZC5wcm90b3R5cGUsIFwiY2xpZW50c1wiKVxuICAgIHBhdGNoKE1vbml0b3IucHJvdG90eXBlLCBcImF2YWlsYWJsZU1vZGVzXCIpXG4gICAgcGF0Y2goTW9uaXRvci5wcm90b3R5cGUsIFwiYXZhaWxhYmxlX21vZGVzXCIpXG4gICAgcGF0Y2goV29ya3NwYWNlLnByb3RvdHlwZSwgXCJjbGllbnRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsTXByaXNcIiksICh7IE1wcmlzLCBQbGF5ZXIgfSkgPT4ge1xuICAgIHBhdGNoKE1wcmlzLnByb3RvdHlwZSwgXCJwbGF5ZXJzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRfdXJpX3NjaGVtYXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZFVyaVNjaGVtYXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcInN1cHBvcnRlZF9taW1lX3R5cGVzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRNaW1lVHlwZXNcIilcbiAgICBwYXRjaChQbGF5ZXIucHJvdG90eXBlLCBcImNvbW1lbnRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsTmV0d29ya1wiKSwgKHsgV2lmaSB9KSA9PiB7XG4gICAgcGF0Y2goV2lmaS5wcm90b3R5cGUsIFwiYWNjZXNzX3BvaW50c1wiKVxuICAgIHBhdGNoKFdpZmkucHJvdG90eXBlLCBcImFjY2Vzc1BvaW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE5vdGlmZFwiKSwgKHsgTm90aWZkLCBOb3RpZmljYXRpb24gfSkgPT4ge1xuICAgIHBhdGNoKE5vdGlmZC5wcm90b3R5cGUsIFwibm90aWZpY2F0aW9uc1wiKVxuICAgIHBhdGNoKE5vdGlmaWNhdGlvbi5wcm90b3R5cGUsIFwiYWN0aW9uc1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbFBvd2VyUHJvZmlsZXNcIiksICh7IFBvd2VyUHJvZmlsZXMgfSkgPT4ge1xuICAgIHBhdGNoKFBvd2VyUHJvZmlsZXMucHJvdG90eXBlLCBcImFjdGlvbnNcIilcbn0pXG4iLCAiaW1wb3J0IFwiLi9vdmVycmlkZXMuanNcIlxuaW1wb3J0IHsgc2V0Q29uc29sZUxvZ0RvbWFpbiB9IGZyb20gXCJjb25zb2xlXCJcbmltcG9ydCB7IGV4aXQsIHByb2dyYW1BcmdzIH0gZnJvbSBcInN5c3RlbVwiXG5pbXBvcnQgSU8gZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5pbXBvcnQgR09iamVjdCBmcm9tIFwiZ2k6Ly9HT2JqZWN0XCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcbmltcG9ydCB0eXBlIEFzdGFsMyBmcm9tIFwiZ2k6Ly9Bc3RhbD92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgdHlwZSBBc3RhbDQgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj00LjBcIlxuXG50eXBlIENvbmZpZyA9IFBhcnRpYWw8e1xuICAgIGluc3RhbmNlTmFtZTogc3RyaW5nXG4gICAgY3NzOiBzdHJpbmdcbiAgICBpY29uczogc3RyaW5nXG4gICAgZ3RrVGhlbWU6IHN0cmluZ1xuICAgIGljb25UaGVtZTogc3RyaW5nXG4gICAgY3Vyc29yVGhlbWU6IHN0cmluZ1xuICAgIGhvbGQ6IGJvb2xlYW5cbiAgICByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0OiBzdHJpbmcsIHJlczogKHJlc3BvbnNlOiBhbnkpID0+IHZvaWQpOiB2b2lkXG4gICAgbWFpbiguLi5hcmdzOiBzdHJpbmdbXSk6IHZvaWRcbiAgICBjbGllbnQobWVzc2FnZTogKG1zZzogc3RyaW5nKSA9PiBzdHJpbmcsIC4uLmFyZ3M6IHN0cmluZ1tdKTogdm9pZFxufT5cblxuaW50ZXJmYWNlIEFzdGFsM0pTIGV4dGVuZHMgQXN0YWwzLkFwcGxpY2F0aW9uIHtcbiAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PlxuICAgIHJlcXVlc3RIYW5kbGVyOiBDb25maWdbXCJyZXF1ZXN0SGFuZGxlclwiXVxuICAgIGFwcGx5X2NzcyhzdHlsZTogc3RyaW5nLCByZXNldD86IGJvb2xlYW4pOiB2b2lkXG4gICAgcXVpdChjb2RlPzogbnVtYmVyKTogdm9pZFxuICAgIHN0YXJ0KGNvbmZpZz86IENvbmZpZyk6IHZvaWRcbn1cblxuaW50ZXJmYWNlIEFzdGFsNEpTIGV4dGVuZHMgQXN0YWw0LkFwcGxpY2F0aW9uIHtcbiAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PlxuICAgIHJlcXVlc3RIYW5kbGVyPzogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cbiAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQ/OiBib29sZWFuKTogdm9pZFxuICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWRcbiAgICBzdGFydChjb25maWc/OiBDb25maWcpOiB2b2lkXG59XG5cbnR5cGUgQXBwMyA9IHR5cGVvZiBBc3RhbDMuQXBwbGljYXRpb25cbnR5cGUgQXBwNCA9IHR5cGVvZiBBc3RhbDQuQXBwbGljYXRpb25cblxuZXhwb3J0IGZ1bmN0aW9uIG1rQXBwPEFwcCBleHRlbmRzIEFwcDM+KEFwcDogQXBwKTogQXN0YWwzSlNcbmV4cG9ydCBmdW5jdGlvbiBta0FwcDxBcHAgZXh0ZW5kcyBBcHA0PihBcHA6IEFwcCk6IEFzdGFsNEpTXG5cbmV4cG9ydCBmdW5jdGlvbiBta0FwcChBcHA6IEFwcDMgfCBBcHA0KSB7XG4gICAgcmV0dXJuIG5ldyAoY2xhc3MgQXN0YWxKUyBleHRlbmRzIEFwcCB7XG4gICAgICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJBc3RhbEpTXCIgfSwgdGhpcyBhcyBhbnkpIH1cblxuICAgICAgICBldmFsKGJvZHk6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm4gPSBGdW5jdGlvbihgcmV0dXJuIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICR7Ym9keS5pbmNsdWRlcyhcIjtcIikgPyBib2R5IDogYHJldHVybiAke2JvZHl9O2B9XG4gICAgICAgICAgICAgICAgICAgIH0pYClcbiAgICAgICAgICAgICAgICAgICAgZm4oKSgpLnRoZW4ocmVzKS5jYXRjaChyZWopXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZWooZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIHJlcXVlc3RIYW5kbGVyPzogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cblxuICAgICAgICB2ZnVuY19yZXF1ZXN0KG1zZzogc3RyaW5nLCBjb25uOiBHaW8uU29ja2V0Q29ubmVjdGlvbik6IHZvaWQge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnJlcXVlc3RIYW5kbGVyID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlcXVlc3RIYW5kbGVyKG1zZywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIElPLndyaXRlX3NvY2soY29ubiwgU3RyaW5nKHJlc3BvbnNlKSwgKF8sIHJlcykgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIElPLndyaXRlX3NvY2tfZmluaXNoKHJlcyksXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc3VwZXIudmZ1bmNfcmVxdWVzdChtc2csIGNvbm4pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQgPSBmYWxzZSkge1xuICAgICAgICAgICAgc3VwZXIuYXBwbHlfY3NzKHN0eWxlLCByZXNldClcbiAgICAgICAgfVxuXG4gICAgICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWQge1xuICAgICAgICAgICAgc3VwZXIucXVpdCgpXG4gICAgICAgICAgICBleGl0KGNvZGUgPz8gMClcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXJ0KHsgcmVxdWVzdEhhbmRsZXIsIGNzcywgaG9sZCwgbWFpbiwgY2xpZW50LCBpY29ucywgLi4uY2ZnIH06IENvbmZpZyA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBhcHAgPSB0aGlzIGFzIHVua25vd24gYXMgSW5zdGFuY2VUeXBlPEFwcDMgfCBBcHA0PlxuXG4gICAgICAgICAgICBjbGllbnQgPz89ICgpID0+IHtcbiAgICAgICAgICAgICAgICBwcmludChgQXN0YWwgaW5zdGFuY2UgXCIke2FwcC5pbnN0YW5jZU5hbWV9XCIgYWxyZWFkeSBydW5uaW5nYClcbiAgICAgICAgICAgICAgICBleGl0KDEpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgY2ZnKVxuICAgICAgICAgICAgc2V0Q29uc29sZUxvZ0RvbWFpbihhcHAuaW5zdGFuY2VOYW1lKVxuXG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RIYW5kbGVyID0gcmVxdWVzdEhhbmRsZXJcbiAgICAgICAgICAgIGFwcC5jb25uZWN0KFwiYWN0aXZhdGVcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIG1haW4/LiguLi5wcm9ncmFtQXJncylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXBwLmFjcXVpcmVfc29ja2V0KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjbGllbnQobXNnID0+IElPLnNlbmRfbWVzc2FnZShhcHAuaW5zdGFuY2VOYW1lLCBtc2cpISwgLi4ucHJvZ3JhbUFyZ3MpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjc3MpXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseV9jc3MoY3NzLCBmYWxzZSlcblxuICAgICAgICAgICAgaWYgKGljb25zKVxuICAgICAgICAgICAgICAgIGFwcC5hZGRfaWNvbnMoaWNvbnMpXG5cbiAgICAgICAgICAgIGhvbGQgPz89IHRydWVcbiAgICAgICAgICAgIGlmIChob2xkKVxuICAgICAgICAgICAgICAgIGFwcC5ob2xkKClcblxuICAgICAgICAgICAgYXBwLnJ1bkFzeW5jKFtdKVxuICAgICAgICB9XG4gICAgfSlcbn1cbiIsICIvKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGVuICovXG5pbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgYXN0YWxpZnksIHsgdHlwZSBDb25zdHJ1Y3RQcm9wcywgdHlwZSBCaW5kYWJsZUNoaWxkIH0gZnJvbSBcIi4vYXN0YWxpZnkuanNcIlxuXG4vLyBCb3hcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShBc3RhbC5Cb3gucHJvdG90eXBlLCBcImNoaWxkcmVuXCIsIHtcbiAgICBnZXQoKSB7IHJldHVybiB0aGlzLmdldF9jaGlsZHJlbigpIH0sXG4gICAgc2V0KHYpIHsgdGhpcy5zZXRfY2hpbGRyZW4odikgfSxcbn0pXG5cbmV4cG9ydCB0eXBlIEJveFByb3BzID0gQ29uc3RydWN0UHJvcHM8Qm94LCBBc3RhbC5Cb3guQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBCb3ggZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5Cb3gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQm94XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQm94UHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBCdXR0b25cbmV4cG9ydCB0eXBlIEJ1dHRvblByb3BzID0gQ29uc3RydWN0UHJvcHM8QnV0dG9uLCBBc3RhbC5CdXR0b24uQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uQ2xpY2tlZDogW11cbiAgICBvbkNsaWNrOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25DbGlja1JlbGVhc2U6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkhvdmVyOiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25Ib3Zlckxvc3Q6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvblNjcm9sbDogW2V2ZW50OiBBc3RhbC5TY3JvbGxFdmVudF1cbn0+XG5leHBvcnQgY2xhc3MgQnV0dG9uIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQnV0dG9uKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkJ1dHRvblwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEJ1dHRvblByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQ2VudGVyQm94XG5leHBvcnQgdHlwZSBDZW50ZXJCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPENlbnRlckJveCwgQXN0YWwuQ2VudGVyQm94LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgQ2VudGVyQm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQ2VudGVyQm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkNlbnRlckJveFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IENlbnRlckJveFByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQ2lyY3VsYXJQcm9ncmVzc1xuZXhwb3J0IHR5cGUgQ2lyY3VsYXJQcm9ncmVzc1Byb3BzID0gQ29uc3RydWN0UHJvcHM8Q2lyY3VsYXJQcm9ncmVzcywgQXN0YWwuQ2lyY3VsYXJQcm9ncmVzcy5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIENpcmN1bGFyUHJvZ3Jlc3MgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5DaXJjdWxhclByb2dyZXNzKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkNpcmN1bGFyUHJvZ3Jlc3NcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBDaXJjdWxhclByb2dyZXNzUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBEcmF3aW5nQXJlYVxuZXhwb3J0IHR5cGUgRHJhd2luZ0FyZWFQcm9wcyA9IENvbnN0cnVjdFByb3BzPERyYXdpbmdBcmVhLCBHdGsuRHJhd2luZ0FyZWEuQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uRHJhdzogW2NyOiBhbnldIC8vIFRPRE86IGNhaXJvIHR5cGVzXG59PlxuZXhwb3J0IGNsYXNzIERyYXdpbmdBcmVhIGV4dGVuZHMgYXN0YWxpZnkoR3RrLkRyYXdpbmdBcmVhKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkRyYXdpbmdBcmVhXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRHJhd2luZ0FyZWFQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gRW50cnlcbmV4cG9ydCB0eXBlIEVudHJ5UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxFbnRyeSwgR3RrLkVudHJ5LkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkNoYW5nZWQ6IFtdXG4gICAgb25BY3RpdmF0ZTogW11cbn0+XG5leHBvcnQgY2xhc3MgRW50cnkgZXh0ZW5kcyBhc3RhbGlmeShHdGsuRW50cnkpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiRW50cnlcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBFbnRyeVByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBFdmVudEJveFxuZXhwb3J0IHR5cGUgRXZlbnRCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPEV2ZW50Qm94LCBBc3RhbC5FdmVudEJveC5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25DbGljazogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uQ2xpY2tSZWxlYXNlOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25Ib3ZlcjogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uSG92ZXJMb3N0OiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25TY3JvbGw6IFtldmVudDogQXN0YWwuU2Nyb2xsRXZlbnRdXG59PlxuZXhwb3J0IGNsYXNzIEV2ZW50Qm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuRXZlbnRCb3gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiRXZlbnRCb3hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBFdmVudEJveFByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gLy8gVE9ETzogRml4ZWRcbi8vIC8vIFRPRE86IEZsb3dCb3hcbi8vXG4vLyBJY29uXG5leHBvcnQgdHlwZSBJY29uUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxJY29uLCBBc3RhbC5JY29uLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgSWNvbiBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkljb24pIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiSWNvblwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEljb25Qcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gTGFiZWxcbmV4cG9ydCB0eXBlIExhYmVsUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxMYWJlbCwgQXN0YWwuTGFiZWwuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBMYWJlbCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkxhYmVsKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkxhYmVsXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogTGFiZWxQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gTGV2ZWxCYXJcbmV4cG9ydCB0eXBlIExldmVsQmFyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxMZXZlbEJhciwgQXN0YWwuTGV2ZWxCYXIuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBMZXZlbEJhciBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkxldmVsQmFyKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkxldmVsQmFyXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogTGV2ZWxCYXJQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gVE9ETzogTGlzdEJveFxuXG4vLyBPdmVybGF5XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQXN0YWwuT3ZlcmxheS5wcm90b3R5cGUsIFwib3ZlcmxheXNcIiwge1xuICAgIGdldCgpIHsgcmV0dXJuIHRoaXMuZ2V0X292ZXJsYXlzKCkgfSxcbiAgICBzZXQodikgeyB0aGlzLnNldF9vdmVybGF5cyh2KSB9LFxufSlcblxuZXhwb3J0IHR5cGUgT3ZlcmxheVByb3BzID0gQ29uc3RydWN0UHJvcHM8T3ZlcmxheSwgQXN0YWwuT3ZlcmxheS5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIE92ZXJsYXkgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5PdmVybGF5KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIk92ZXJsYXlcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBPdmVybGF5UHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBSZXZlYWxlclxuZXhwb3J0IHR5cGUgUmV2ZWFsZXJQcm9wcyA9IENvbnN0cnVjdFByb3BzPFJldmVhbGVyLCBHdGsuUmV2ZWFsZXIuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBSZXZlYWxlciBleHRlbmRzIGFzdGFsaWZ5KEd0ay5SZXZlYWxlcikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJSZXZlYWxlclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFJldmVhbGVyUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTY3JvbGxhYmxlXG5leHBvcnQgdHlwZSBTY3JvbGxhYmxlUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTY3JvbGxhYmxlLCBBc3RhbC5TY3JvbGxhYmxlLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU2Nyb2xsYWJsZSBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLlNjcm9sbGFibGUpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU2Nyb2xsYWJsZVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFNjcm9sbGFibGVQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIFNsaWRlclxuZXhwb3J0IHR5cGUgU2xpZGVyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxTbGlkZXIsIEFzdGFsLlNsaWRlci5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25EcmFnZ2VkOiBbXVxufT5cbmV4cG9ydCBjbGFzcyBTbGlkZXIgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TbGlkZXIpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU2xpZGVyXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU2xpZGVyUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFN0YWNrXG5leHBvcnQgdHlwZSBTdGFja1Byb3BzID0gQ29uc3RydWN0UHJvcHM8U3RhY2ssIEFzdGFsLlN0YWNrLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU3RhY2sgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TdGFjaykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTdGFja1wiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFN0YWNrUHJvcHMsIC4uLmNoaWxkcmVuOiBBcnJheTxCaW5kYWJsZUNoaWxkPikgeyBzdXBlcih7IGNoaWxkcmVuLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTd2l0Y2hcbmV4cG9ydCB0eXBlIFN3aXRjaFByb3BzID0gQ29uc3RydWN0UHJvcHM8U3dpdGNoLCBHdGsuU3dpdGNoLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgU3dpdGNoIGV4dGVuZHMgYXN0YWxpZnkoR3RrLlN3aXRjaCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJTd2l0Y2hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTd2l0Y2hQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gV2luZG93XG5leHBvcnQgdHlwZSBXaW5kb3dQcm9wcyA9IENvbnN0cnVjdFByb3BzPFdpbmRvdywgQXN0YWwuV2luZG93LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgV2luZG93IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuV2luZG93KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIldpbmRvd1wiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFdpbmRvd1Byb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cbiIsICIqIHtcbiAgY29sb3I6ICNmMWYxZjE7XG4gIGZvbnQtc2l6ZTogMTVweDtcbn1cblxuLmlzbGFuZC1sYXlvdXQgPiBib3gge1xuICBtYXJnaW46IDRweCAwO1xufVxuXG4uaXNsYW5kLWxheW91dCA+IC5zdGF0dXMge1xuICBwYWRkaW5nLXRvcDogNHB4O1xuICBwYWRkaW5nLWJvdHRvbTogNHB4O1xufVxuXG4uaXNsYW5kLWxheW91dCA+IC5uZXR3b3JrIGljb24ge1xuICAvKiBpY29uIHNlYW1zIHVuIGNlbnRlcmVkIG90aGVyd2lzZSAoPykgKi9cbiAgbWFyZ2luLWxlZnQ6IDFweDtcbn1cblxuLmlzbGFuZC1sYXlvdXQgPiBib3gsXG4uc2VnbWVudCB7XG4gIG1pbi13aWR0aDogMzFweDtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMThweDtcbiAgcGFkZGluZzogMnB4O1xufVxuXG5idXR0b24ge1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgYm9yZGVyOiBub25lO1xuICBwYWRkaW5nOiAwO1xufVxuXG4ud29ya3NwYWNlcyBidXR0b24ge1xuICBtYXJnaW46IDJweDtcbiAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgcGFkZGluZzogMnB4O1xuICBtaW4taGVpZ2h0OiAxNXB4O1xuICBtaW4td2lkdGg6IDE1cHg7XG4gIGJhY2tncm91bmQ6ICM0MTQyNDM7XG4gIGJvcmRlcjogIzQxNDI0MyAycHggc29saWQ7XG59XG4ud29ya3NwYWNlcyBidXR0b24uZm9jdXNlZCB7XG4gIGJvcmRlcjogIzM3OERGNyAycHggc29saWQ7XG4gIC8qIGJhY2tncm91bmQ6ICRhY2NlbnQ7ICovXG4gIC8qIG1pbi1oZWlnaHQ6IGNhbGMoJHNpemUgKiAxLjcpOyAqL1xufVxuXG4uaXNsYW5kLWxheW91dCBpY29uIHtcbiAgbWFyZ2luLXRvcDogNHB4O1xuICBtYXJnaW4tYm90dG9tOiAycHg7XG59XG5cbmljb24ge1xuICBmb250LXNpemU6IDI1cHg7XG59XG5cbi5pY29uIHtcbiAgZm9udC1zaXplOiAyOHB4O1xufVxuXG4uYmF0dGVyeSB7XG4gIC8qIC5pY29uLmNoYXJnaW5nIHtcbiAgICBjb2xvcjogJGFjY2VudDtcbiAgfSAqL1xufVxuXG4uc3RhdHVzIHtcbiAgbWFyZ2luLXRvcDogNHB4O1xuICAvKiBib3JkZXItdG9wOiAxcHggd2hpdGUgc29saWQ7ICovXG59XG5cbi5Ob3RpZmljYXRpb25zIGV2ZW50Ym94IGJ1dHRvbiB7XG4gIGJhY2tncm91bmQ6ICM0MTQyNDM7XG4gIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gIG1hcmdpbjogMCAycHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCA+IGJveCB7XG4gIG1hcmdpbjogNHB4O1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xuICBwYWRkaW5nOiA0cHggMnB4O1xuICBtaW4td2lkdGg6IDMwMHB4O1xuICBib3JkZXItcmFkaXVzOiAxOHB4O1xuICBib3JkZXI6IDJweCBzb2xpZCAjNDE0MjQzO1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLmltYWdlIHtcbiAgbWluLWhlaWdodDogODBweDtcbiAgbWluLXdpZHRoOiA4MHB4O1xuICBmb250LXNpemU6IDgwcHg7XG4gIG1hcmdpbjogOHB4O1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLm1haW4ge1xuICBwYWRkaW5nLWxlZnQ6IDRweDtcbiAgbWFyZ2luLWJvdHRvbTogMnB4O1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3ggLm1haW4gLmhlYWRlciAuc3VtbWFyeSB7XG4gIGZvbnQtc2l6ZTogMS4yZW07XG4gIGZvbnQtd2VpZ2h0OiBib2xkO1xufVxuLk5vdGlmaWNhdGlvbnMgZXZlbnRib3guY3JpdGljYWwgPiBib3gge1xuICBib3JkZXItY29sb3I6ICMzNzhERjc7XG59XG5cbi5jbG9jayAuaWNvbiB7XG4gIG1hcmdpbi1yaWdodDogNXB4O1xuICBjb2xvcjogIzM3OERGNztcbn1cblxuYm94ID4gLnRyYXkge1xuICBwYWRkaW5nOiA0cHggMnB4O1xuICAvKiBiYWNrZ3JvdW5kOiByZWQ7ICovXG59XG5ib3ggPiAudHJheSBpY29uIHtcbiAgZm9udC1zaXplOiAyMnB4O1xuICBtYXJnaW46IDJweCAwO1xufVxuXG4jbGF1bmNoZXIge1xuICBiYWNrZ3JvdW5kOiBub25lO1xufVxuI2xhdW5jaGVyIC5tYWluIHtcbiAgcGFkZGluZzogNHB4O1xuICBwYWRkaW5nLWJvdHRvbTogMTJweDtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMThweDtcbn1cbiNsYXVuY2hlciAubWFpbiBpY29uIHtcbiAgbWFyZ2luOiAwIDRweDtcbn1cbiNsYXVuY2hlciAubWFpbiAuZGVzY3JpcHRpb24ge1xuICBjb2xvcjogI2JiYjtcbiAgZm9udC1zaXplOiAwLjhlbTtcbn1cbiNsYXVuY2hlciAubWFpbiBidXR0b246aG92ZXIsXG4jbGF1bmNoZXIgLm1haW4gYnV0dG9uOmZvY3VzIHtcbiAgYm9yZGVyOiAycHggc29saWQgIzM3OERGNztcbn1cbiNsYXVuY2hlciAubWFpbiBidXR0b24ge1xuICBib3JkZXI6IDJweCBzb2xpZCAjNDE0MjQzO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbixcbiNsYXVuY2hlciAubWFpbiBlbnRyeSB7XG4gIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gIGJhY2tncm91bmQ6ICM0MTQyNDM7XG4gIG91dGxpbmU6IG5vbmU7XG59XG4jbGF1bmNoZXIgLm1haW4gZW50cnkge1xuICBtYXJnaW4tYm90dG9tOiA4cHg7XG4gIGJvcmRlcjogbm9uZTtcbiAgbWluLWhlaWdodDogMjhweDtcbiAgZm9udC1zaXplOiAxLjNyZW07XG59XG5cbi5Pc2QgYm94IHtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMjRweDtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xufVxuLk9zZCBib3ggdHJvdWdoIHtcbiAgcGFkZGluZzogMDtcbiAgbWFyZ2luOiA4cHg7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbn1cbi5Pc2QgYm94IHRyb3VnaCBibG9jayB7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyOiBub25lO1xufVxuLk9zZCBib3ggdHJvdWdoIGJsb2NrLmZpbGxlZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xufVxuLk9zZCBib3ggbGFiZWwge1xuICBtaW4td2lkdGg6IDQwcHg7XG59IiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXN0YWxJTyB9IGZyb20gXCJnaTovL0FzdGFsSU8/dmVyc2lvbj0wLjFcIlxuZXhwb3J0ICogZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5leHBvcnQgKiBmcm9tIFwiLi90aW1lLmpzXCJcbmV4cG9ydCAqIGZyb20gXCIuL2ZpbGUuanNcIlxuZXhwb3J0ICogZnJvbSBcIi4vZ29iamVjdC5qc1wiXG5leHBvcnQgeyBiaW5kLCBkZWZhdWx0IGFzIEJpbmRpbmcgfSBmcm9tIFwiLi9iaW5kaW5nLmpzXCJcbmV4cG9ydCB7IFZhcmlhYmxlIH0gZnJvbSBcIi4vdmFyaWFibGUuanNcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcblxuZXhwb3J0IHsgR2lvIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRGaWxlKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEFzdGFsLnJlYWRfZmlsZShwYXRoKSB8fCBcIlwiXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlsZUFzeW5jKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgQXN0YWwucmVhZF9maWxlX2FzeW5jKHBhdGgsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5yZWFkX2ZpbGVfZmluaXNoKHJlcykgfHwgXCJcIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgQXN0YWwud3JpdGVfZmlsZShwYXRoLCBjb250ZW50KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlQXN5bmMocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBBc3RhbC53cml0ZV9maWxlX2FzeW5jKHBhdGgsIGNvbnRlbnQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC53cml0ZV9maWxlX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25pdG9yRmlsZShcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgY2FsbGJhY2s6IChmaWxlOiBzdHJpbmcsIGV2ZW50OiBHaW8uRmlsZU1vbml0b3JFdmVudCkgPT4gdm9pZCxcbik6IEdpby5GaWxlTW9uaXRvciB7XG4gICAgcmV0dXJuIEFzdGFsLm1vbml0b3JfZmlsZShwYXRoLCAoZmlsZTogc3RyaW5nLCBldmVudDogR2lvLkZpbGVNb25pdG9yRXZlbnQpID0+IHtcbiAgICAgICAgY2FsbGJhY2soZmlsZSwgZXZlbnQpXG4gICAgfSkhXG59XG4iLCAiaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5cbmV4cG9ydCB7IGRlZmF1bHQgYXMgR0xpYiB9IGZyb20gXCJnaTovL0dMaWI/dmVyc2lvbj0yLjBcIlxuZXhwb3J0IHsgR09iamVjdCwgR09iamVjdCBhcyBkZWZhdWx0IH1cblxuY29uc3QgbWV0YSA9IFN5bWJvbChcIm1ldGFcIilcbmNvbnN0IHByaXYgPSBTeW1ib2woXCJwcml2XCIpXG5cbmNvbnN0IHsgUGFyYW1TcGVjLCBQYXJhbUZsYWdzIH0gPSBHT2JqZWN0XG5cbmNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG50eXBlIFNpZ25hbERlY2xhcmF0aW9uID0ge1xuICAgIGZsYWdzPzogR09iamVjdC5TaWduYWxGbGFnc1xuICAgIGFjY3VtdWxhdG9yPzogR09iamVjdC5BY2N1bXVsYXRvclR5cGVcbiAgICByZXR1cm5fdHlwZT86IEdPYmplY3QuR1R5cGVcbiAgICBwYXJhbV90eXBlcz86IEFycmF5PEdPYmplY3QuR1R5cGU+XG59XG5cbnR5cGUgUHJvcGVydHlEZWNsYXJhdGlvbiA9XG4gICAgfCBJbnN0YW5jZVR5cGU8dHlwZW9mIEdPYmplY3QuUGFyYW1TcGVjPlxuICAgIHwgeyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfVxuICAgIHwgdHlwZW9mIFN0cmluZ1xuICAgIHwgdHlwZW9mIE51bWJlclxuICAgIHwgdHlwZW9mIEJvb2xlYW5cbiAgICB8IHR5cGVvZiBPYmplY3RcblxudHlwZSBHT2JqZWN0Q29uc3RydWN0b3IgPSB7XG4gICAgW21ldGFdPzoge1xuICAgICAgICBQcm9wZXJ0aWVzPzogeyBba2V5OiBzdHJpbmddOiBHT2JqZWN0LlBhcmFtU3BlYyB9XG4gICAgICAgIFNpZ25hbHM/OiB7IFtrZXk6IHN0cmluZ106IEdPYmplY3QuU2lnbmFsRGVmaW5pdGlvbiB9XG4gICAgfVxuICAgIG5ldyguLi5hcmdzOiBhbnlbXSk6IGFueVxufVxuXG50eXBlIE1ldGFJbmZvID0gR09iamVjdC5NZXRhSW5mbzxuZXZlciwgQXJyYXk8eyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfT4sIG5ldmVyPlxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXIob3B0aW9uczogTWV0YUluZm8gPSB7fSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoY2xzOiBHT2JqZWN0Q29uc3RydWN0b3IpIHtcbiAgICAgICAgY29uc3QgdCA9IG9wdGlvbnMuVGVtcGxhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiICYmICF0LnN0YXJ0c1dpdGgoXCJyZXNvdXJjZTovL1wiKSAmJiAhdC5zdGFydHNXaXRoKFwiZmlsZTovL1wiKSkge1xuICAgICAgICAgICAgLy8gYXNzdW1lIHhtbCB0ZW1wbGF0ZVxuICAgICAgICAgICAgb3B0aW9ucy5UZW1wbGF0ZSA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0KVxuICAgICAgICB9XG5cbiAgICAgICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgICAgIFNpZ25hbHM6IHsgLi4uY2xzW21ldGFdPy5TaWduYWxzIH0sXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7IC4uLmNsc1ttZXRhXT8uUHJvcGVydGllcyB9LFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgfSwgY2xzKVxuXG4gICAgICAgIGRlbGV0ZSBjbHNbbWV0YV1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9wZXJ0eShkZWNsYXJhdGlvbjogUHJvcGVydHlEZWNsYXJhdGlvbiA9IE9iamVjdCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHByb3A6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikge1xuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0gPz89IHt9XG4gICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5Qcm9wZXJ0aWVzID8/PSB7fVxuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBrZWJhYmlmeShwcm9wKVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJpdl0/Lltwcm9wXSA/PyBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb24pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzW3Byb3BdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzW3ByaXZdID8/PSB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcml2XVtwcm9wXSA9IHZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZ5KG5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYHNldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSh2OiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHZcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYGdldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJvcF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlByb3BlcnRpZXNba2ViYWJpZnkocHJvcCldID0gcHNwZWMobmFtZSwgUGFyYW1GbGFncy5SRUFEV1JJVEUsIGRlY2xhcmF0aW9uKVxuICAgICAgICB9XG5cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZmxhZ3MgPSAwXG4gICAgICAgICAgICBpZiAoZGVzYy5nZXQpIGZsYWdzIHw9IFBhcmFtRmxhZ3MuUkVBREFCTEVcbiAgICAgICAgICAgIGlmIChkZXNjLnNldCkgZmxhZ3MgfD0gUGFyYW1GbGFncy5XUklUQUJMRVxuXG4gICAgICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uUHJvcGVydGllc1trZWJhYmlmeShwcm9wKV0gPSBwc3BlYyhuYW1lLCBmbGFncywgZGVjbGFyYXRpb24pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduYWwoLi4ucGFyYW1zOiBBcnJheTx7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdD4pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKFxuICAgIGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24gfCB7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdCxcbiAgICAuLi5wYXJhbXM6IEFycmF5PHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH0gfCB0eXBlb2YgT2JqZWN0PlxuKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdID8/PSB7fVxuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uU2lnbmFscyA/Pz0ge31cblxuICAgICAgICBjb25zdCBuYW1lID0ga2ViYWJpZnkoc2lnbmFsKVxuXG4gICAgICAgIGlmIChkZWNsYXJhdGlvbiB8fCBwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBUT0RPOiB0eXBlIGFzc2VydFxuICAgICAgICAgICAgY29uc3QgYXJyID0gW2RlY2xhcmF0aW9uLCAuLi5wYXJhbXNdLm1hcCh2ID0+IHYuJGd0eXBlKVxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlNpZ25hbHNbbmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgcGFyYW1fdHlwZXM6IGFycixcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5TaWduYWxzW25hbWVdID0gZGVjbGFyYXRpb24gfHwge1xuICAgICAgICAgICAgICAgIHBhcmFtX3R5cGVzOiBbXSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgc2lnbmFsLCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQobmFtZSwgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IG9nOiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSA9IGRlc2MudmFsdWVcbiAgICAgICAgICAgIGRlc2MudmFsdWUgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIG5vdCB0eXBlZFxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChuYW1lLCAuLi5hcmdzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYG9uXyR7bmFtZS5yZXBsYWNlKFwiLVwiLCBcIl9cIil9YCwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9nKC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBzcGVjKG5hbWU6IHN0cmluZywgZmxhZ3M6IG51bWJlciwgZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvblxuXG4gICAgc3dpdGNoIChkZWNsYXJhdGlvbikge1xuICAgICAgICBjYXNlIFN0cmluZzpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuc3RyaW5nKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBcIlwiKVxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuZG91YmxlKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCAtTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSwgMClcbiAgICAgICAgY2FzZSBCb29sZWFuOlxuICAgICAgICAgICAgcmV0dXJuIFBhcmFtU3BlYy5ib29sZWFuKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBmYWxzZSlcbiAgICAgICAgY2FzZSBPYmplY3Q6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLmpzb2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzKVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBtaXNzdHlwZWRcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMub2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBkZWNsYXJhdGlvbi4kZ3R5cGUpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvbi5nZXRfZGVmYXVsdF92YWx1ZSgpXG5cbiAgICBzd2l0Y2ggKGRlY2xhcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgU3RyaW5nOlxuICAgICAgICAgICAgcmV0dXJuIFwiZGVmYXVsdC1zdHJpbmdcIlxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIGNhc2UgQm9vbGVhbjpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBjYXNlIE9iamVjdDpcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgfVxufVxuIiwgImltcG9ydCB7IFZhcmlhYmxlLCBHTGliLCBiaW5kIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBBc3RhbCwgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBCYXR0ZXJ5IGZyb20gXCJnaTovL0FzdGFsQmF0dGVyeVwiO1xuaW1wb3J0IFdvcmtzcGFjZXMgZnJvbSBcIi4vd29ya3NwYWNlc1wiO1xuaW1wb3J0IFRyYXkgZnJvbSBcIi4vdHJheVwiO1xuaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCBOZXR3b3JrIGZyb20gXCJnaTovL0FzdGFsTmV0d29ya1wiO1xuXG5mdW5jdGlvbiBDbG9jaygpIHtcbiAgcmV0dXJuIChcbiAgICA8Ym94XG4gICAgICBjbGFzc05hbWU9XCJjbG9jayBzdGF0dXNcIlxuICAgICAgb3JpZW50YXRpb249ezF9XG4gICAgICBoYWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9XG4gICAgICBoZXhwYW5kXG4gICAgPlxuICAgICAgey8qIHRoaXMgdXNlcyBhIGxvdCBvZiBjcHUgZm9yIHNvbWUgcmVhc29uICovfVxuICAgICAgey8qIDxpY29uIGljb249e2Ake1NSQ30vYXNzZXRzL2Nsb2NrMi5wbmdgfSAvPiAqL31cbiAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJpY29uXCIgbGFiZWw9XCJcdUUzODVcIiAvPlxuICAgICAgPGxhYmVsXG4gICAgICAgIGxhYmVsPXtWYXJpYWJsZShcIlwiKS5wb2xsKDEwMDAsICgpID0+XG4gICAgICAgICAgR0xpYi5EYXRlVGltZS5uZXdfbm93X2xvY2FsKCkuZm9ybWF0KFwiJUhcIiksXG4gICAgICAgICkoKX1cbiAgICAgIC8+XG4gICAgICA8bGFiZWxcbiAgICAgICAgbGFiZWw9e1ZhcmlhYmxlKFwiXCIpLnBvbGwoMTAwMCwgKCkgPT5cbiAgICAgICAgICBHTGliLkRhdGVUaW1lLm5ld19ub3dfbG9jYWwoKS5mb3JtYXQoXCIlTVwiKSxcbiAgICAgICAgKSgpfVxuICAgICAgLz5cbiAgICA8L2JveD5cbiAgKTtcbn1cblxuZnVuY3Rpb24gQmF0dGVyeUxldmVsKCkge1xuICBjb25zdCBiYXQgPSBCYXR0ZXJ5LmdldF9kZWZhdWx0KCk7XG4gIGNvbnN0IGljb25zID0ge1xuICAgIC8vIGJhdHRlcnkgaWNvbnMgZnJvbSBuZXJkIGZvbnRzIGh0dHBzOi8vd3d3Lm5lcmRmb250cy5jb20vXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODJcdURDOUZcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMTAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODJcdURDOUNcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMjAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDODZcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMzAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDODdcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNDAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDODhcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNTAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODJcdURDOURcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNjAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDODlcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtNzAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODJcdURDOUVcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtODAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDOEFcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtOTAtY2hhcmdpbmctc3ltYm9saWNcIjogXCJcdURCODBcdURDOEJcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMTAwLWNoYXJnZWQtc3ltYm9saWNcIjogXCJcdURCODBcdURDODVcIixcbiAgICBcImJhdHRlcnktbGV2ZWwtMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4RVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3QVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0yMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3QlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0zMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3Q1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC00MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3RFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC01MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3RVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC02MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3RlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC03MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4MFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC04MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4MVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC05MC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4MlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMDAtc3ltYm9saWNcIjogXCJcdURCODBcdURDNzlcIixcbiAgfTtcbiAgcmV0dXJuIChcbiAgICA8Ym94XG4gICAgICBjbGFzc05hbWU9XCJiYXR0ZXJ5IHN0YXR1c1wiXG4gICAgICBvcmllbnRhdGlvbj17MX1cbiAgICAgIGhhbGlnbj17R3RrLkFsaWduLkNFTlRFUn1cbiAgICAgIGhleHBhbmRcbiAgICA+XG4gICAgICA8bGFiZWxcbiAgICAgICAgY2xhc3NOYW1lPVwiaWNvblwiXG4gICAgICAgIGxhYmVsPXtiaW5kKGJhdCwgXCJiYXR0ZXJ5SWNvbk5hbWVcIikuYXMoKGIpID0+IGljb25zW2JdKX1cbiAgICAgIC8+XG4gICAgICA8bGFiZWxcbiAgICAgICAgbGFiZWw9e2JpbmQoYmF0LCBcInBlcmNlbnRhZ2VcIikuYXMoKHApID0+IGAke01hdGguZmxvb3IocCAqIDEwMCl9YCl9XG4gICAgICAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5mdW5jdGlvbiBWb2x1bWUoKSB7XG4gIGNvbnN0IHNwZWFrZXIgPSBXcC5nZXRfZGVmYXVsdCgpPy5hdWRpby5kZWZhdWx0U3BlYWtlcjtcblxuICByZXR1cm4gKFxuICAgIDxib3ggY2xhc3NOYW1lPVwidm9sdW1lIHN0YXR1c1wiIG9yaWVudGF0aW9uPXsxfT5cbiAgICAgIDxpY29uIGljb249e2JpbmQoc3BlYWtlciwgXCJ2b2x1bWVJY29uXCIpfSAvPlxuICAgICAgPGxhYmVsIGxhYmVsPXtiaW5kKHNwZWFrZXIsIFwidm9sdW1lXCIpLmFzKChwKSA9PiBgJHtNYXRoLmZsb29yKHAgKiAxMDApfWApfSAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCYXIobW9uaXRvcikge1xuICBjb25zdCB7IFRPUCwgUklHSFQsIEJPVFRPTSB9ID0gQXN0YWwuV2luZG93QW5jaG9yO1xuXG4gIGNvbnN0IG1hcmdpbiA9IDc7XG4gIGNvbnN0IG5ldHdvcmsgPSBOZXR3b3JrLmdldF9kZWZhdWx0KCk7XG4gIGNvbnN0IHdpZmkgPSBiaW5kKG5ldHdvcmssIFwid2lmaVwiKTtcblxuICBjb25zdCBuZXQgPSBWYXJpYWJsZShcIm5ldHdvcmstd2lyZWxlc3MtZGlzYWJsZWQtc3ltYm9saWNcIik7XG5cbiAgcmV0dXJuIChcbiAgICA8d2luZG93XG4gICAgICBjbGFzc05hbWU9XCJCYXJcIlxuICAgICAgbmFtZXNwYWNlPVwiYWdzLWJhclwiXG4gICAgICBnZGttb25pdG9yPXttb25pdG9yfVxuICAgICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5LkVYQ0xVU0lWRX1cbiAgICAgIG1hcmdpbi10b3A9e21hcmdpbn1cbiAgICAgIG1hcmdpbi1sZWZ0PXswfVxuICAgICAgbWFyZ2luLXJpZ2h0PXttYXJnaW59XG4gICAgICBtYXJnaW4tYm90dG9tPXttYXJnaW59XG4gICAgICBhbmNob3I9e1RPUCB8IEJPVFRPTSB8IFJJR0hUfVxuICAgID5cbiAgICAgIHtcbiAgICAgICAgLy8gPGNlbnRlcmJveCBvcmllbnRhdGlvbj17MX0+XG4gICAgICAgIC8vICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgc3RhcnRcIiBvcmllbnRhdGlvbj17MX0gdmFsaWduPXtHdGsuQWxpZ24uU1RBUlR9PlxuICAgICAgICAvLyAgICAgICA8V29ya3NwYWNlcyBvcmllbnRhdGlvbj17MX0vPlxuICAgICAgICAvLyAgICAgPC9ib3g+XG4gICAgICAgIC8vICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgY2VudGVyXCIgb3JpZW50YXRpb249ezF9PlxuICAgICAgICAvLyAgICAgPC9ib3g+XG4gICAgICAgIC8vICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgZW5kXCIgb3JpZW50YXRpb249ezF9IHZhbGlnbj17R3RrLkFsaWduLkVORH0gPlxuICAgICAgICAvLyAgICAgICA8Q2xvY2sgLz5cbiAgICAgICAgLy8gICAgICAgPEJhdHRlcnlMZXZlbCAvPlxuICAgICAgICAvLyAgICAgICA8Vm9sdW1lIC8+XG4gICAgICAgIC8vICAgICA8L2JveD5cbiAgICAgICAgLy8gPC9jZW50ZXJib3g+XG4gICAgICB9XG4gICAgICA8Ym94IG9yaWVudGF0aW9uPXsxfSBjbGFzc05hbWU9XCJpc2xhbmQtbGF5b3V0XCIgdmFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfT5cbiAgICAgICAgPFdvcmtzcGFjZXMgb3JpZW50YXRpb249ezF9IC8+XG4gICAgICAgIDxUcmF5IG9yaWVudGF0aW9uPXsxfSAvPlxuICAgICAgICA8Ym94XG4gICAgICAgICAgY2xhc3NOYW1lPVwibmV0d29yayBzdGF0dXNcIlxuICAgICAgICAgIG9yaWVudGF0aW9uPXsxfVxuICAgICAgICAgIGhhbGlnbj17R3RrLkFsaWduLkNFTlRFUn1cbiAgICAgICAgICBoZXhwYW5kXG4gICAgICAgID5cbiAgICAgICAgICB7d2lmaS5hcyhcbiAgICAgICAgICAgICh3aWZpKSA9PlxuICAgICAgICAgICAgICB3aWZpICYmIChcbiAgICAgICAgICAgICAgICA8aWNvblxuICAgICAgICAgICAgICAgICAgdG9vbHRpcFRleHQ9e2JpbmQod2lmaSwgXCJzc2lkXCIpLmFzKFN0cmluZyl9XG4gICAgICAgICAgICAgICAgICBpY29uPXtiaW5kKHdpZmksIFwiaWNvbk5hbWVcIil9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApfVxuICAgICAgICAgIHt3aWZpLmFzKFxuICAgICAgICAgICAgKHdpZmkpID0+XG4gICAgICAgICAgICAgIHdpZmkgJiYgKFxuICAgICAgICAgICAgICAgIDxsYWJlbCBsYWJlbD17YmluZCh3aWZpLCBcInNzaWRcIikuYXMoKHMpID0+IHMuc3Vic3RyaW5nKDAsIDIpKX0gLz5cbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApfVxuICAgICAgICA8L2JveD5cbiAgICAgICAgPEJhdHRlcnlMZXZlbCAvPlxuICAgICAgICA8Vm9sdW1lIC8+XG4gICAgICAgIDxDbG9jayAvPlxuICAgICAgPC9ib3g+XG4gICAgPC93aW5kb3c+XG4gICk7XG59XG4iLCAiaW1wb3J0IEh5cHJsYW5kIGZyb20gXCJnaTovL0FzdGFsSHlwcmxhbmRcIjtcbmltcG9ydCB7IGJpbmQgfSBmcm9tIFwiYXN0YWxcIjtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gV29ya3NwYWNlcyh7IG9yaWVudGF0aW9uIH0pIHtcbiAgY29uc3QgaHlwciA9IEh5cHJsYW5kLmdldF9kZWZhdWx0KCk7XG4gIGxldCB3ID0gWzEsIDIsIDMsIDQsIDVdO1xuXG4gIC8vIGJpbmQoaHlwciwgXCJ3b3Jrc3BhY2VzXCIpLmFzKHdzcyA9PiB3c3NcbiAgLy8gICAgICAgICAuZmlsdGVyKHdzID0+ICEod3MuaWQgPj0gLTk5ICYmIHdzLmlkIDw9IC0yKSkgLy8gZmlsdGVyIG91dCBzcGVjaWFsIHdvcmtzcGFjZXNcbiAgLy8gICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpXG4gIC8vICAgICApXG4gIHJldHVybiAoXG4gICAgPGJveCBjbGFzc05hbWU9XCJ3b3Jrc3BhY2VzXCIgb3JpZW50YXRpb249e29yaWVudGF0aW9ufT5cbiAgICAgIHt3Lm1hcCgod3MpID0+IChcbiAgICAgICAgPGJ1dHRvblxuICAgICAgICAgIGNsYXNzTmFtZT17YmluZChoeXByLCBcImZvY3VzZWRXb3Jrc3BhY2VcIikuYXMoKGZ3KSA9PlxuICAgICAgICAgICAgd3MgPT09IGZ3LmlkID8gXCJmb2N1c2VkXCIgOiBcIlwiLFxuICAgICAgICAgICl9XG4gICAgICAgICAgb25DbGlja2VkPXsoKSA9PiB3cy5mb2N1cygpfVxuICAgICAgICA+XG4gICAgICAgICAge3dzfVxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgICkpfVxuICAgIDwvYm94PlxuICApO1xufVxuIiwgImltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCB7IG1lcmdlQmluZGluZ3MsIHR5cGUgQmluZGFibGVDaGlsZCB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcbmltcG9ydCAqIGFzIFdpZGdldCBmcm9tIFwiLi93aWRnZXQuanNcIlxuXG5mdW5jdGlvbiBpc0Fycm93RnVuY3Rpb24oZnVuYzogYW55KTogZnVuYyBpcyAoYXJnczogYW55KSA9PiBhbnkge1xuICAgIHJldHVybiAhT2JqZWN0Lmhhc093bihmdW5jLCBcInByb3RvdHlwZVwiKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRnJhZ21lbnQoeyBjaGlsZHJlbiA9IFtdLCBjaGlsZCB9OiB7XG4gICAgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkXG4gICAgY2hpbGRyZW4/OiBBcnJheTxCaW5kYWJsZUNoaWxkPlxufSkge1xuICAgIGlmIChjaGlsZCkgY2hpbGRyZW4ucHVzaChjaGlsZClcbiAgICByZXR1cm4gbWVyZ2VCaW5kaW5ncyhjaGlsZHJlbilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGpzeChcbiAgICBjdG9yOiBrZXlvZiB0eXBlb2YgY3RvcnMgfCB0eXBlb2YgR3RrLldpZGdldCxcbiAgICB7IGNoaWxkcmVuLCAuLi5wcm9wcyB9OiBhbnksXG4pIHtcbiAgICBjaGlsZHJlbiA/Pz0gW11cblxuICAgIGlmICghQXJyYXkuaXNBcnJheShjaGlsZHJlbikpXG4gICAgICAgIGNoaWxkcmVuID0gW2NoaWxkcmVuXVxuXG4gICAgY2hpbGRyZW4gPSBjaGlsZHJlbi5maWx0ZXIoQm9vbGVhbilcblxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDEpXG4gICAgICAgIHByb3BzLmNoaWxkID0gY2hpbGRyZW5bMF1cbiAgICBlbHNlIGlmIChjaGlsZHJlbi5sZW5ndGggPiAxKVxuICAgICAgICBwcm9wcy5jaGlsZHJlbiA9IGNoaWxkcmVuXG5cbiAgICBpZiAodHlwZW9mIGN0b3IgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBjdG9yc1tjdG9yXShwcm9wcylcbiAgICB9XG5cbiAgICBpZiAoaXNBcnJvd0Z1bmN0aW9uKGN0b3IpKVxuICAgICAgICByZXR1cm4gY3Rvcihwcm9wcylcblxuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgY2FuIGJlIGNsYXNzIG9yIGZ1bmN0aW9uXG4gICAgcmV0dXJuIG5ldyBjdG9yKHByb3BzKVxufVxuXG5jb25zdCBjdG9ycyA9IHtcbiAgICBib3g6IFdpZGdldC5Cb3gsXG4gICAgYnV0dG9uOiBXaWRnZXQuQnV0dG9uLFxuICAgIGNlbnRlcmJveDogV2lkZ2V0LkNlbnRlckJveCxcbiAgICBjaXJjdWxhcnByb2dyZXNzOiBXaWRnZXQuQ2lyY3VsYXJQcm9ncmVzcyxcbiAgICBkcmF3aW5nYXJlYTogV2lkZ2V0LkRyYXdpbmdBcmVhLFxuICAgIGVudHJ5OiBXaWRnZXQuRW50cnksXG4gICAgZXZlbnRib3g6IFdpZGdldC5FdmVudEJveCxcbiAgICAvLyBUT0RPOiBmaXhlZFxuICAgIC8vIFRPRE86IGZsb3dib3hcbiAgICBpY29uOiBXaWRnZXQuSWNvbixcbiAgICBsYWJlbDogV2lkZ2V0LkxhYmVsLFxuICAgIGxldmVsYmFyOiBXaWRnZXQuTGV2ZWxCYXIsXG4gICAgLy8gVE9ETzogbGlzdGJveFxuICAgIG92ZXJsYXk6IFdpZGdldC5PdmVybGF5LFxuICAgIHJldmVhbGVyOiBXaWRnZXQuUmV2ZWFsZXIsXG4gICAgc2Nyb2xsYWJsZTogV2lkZ2V0LlNjcm9sbGFibGUsXG4gICAgc2xpZGVyOiBXaWRnZXQuU2xpZGVyLFxuICAgIHN0YWNrOiBXaWRnZXQuU3RhY2ssXG4gICAgc3dpdGNoOiBXaWRnZXQuU3dpdGNoLFxuICAgIHdpbmRvdzogV2lkZ2V0LldpbmRvdyxcbn1cblxuZGVjbGFyZSBnbG9iYWwge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbmFtZXNwYWNlXG4gICAgbmFtZXNwYWNlIEpTWCB7XG4gICAgICAgIHR5cGUgRWxlbWVudCA9IEd0ay5XaWRnZXRcbiAgICAgICAgdHlwZSBFbGVtZW50Q2xhc3MgPSBHdGsuV2lkZ2V0XG4gICAgICAgIGludGVyZmFjZSBJbnRyaW5zaWNFbGVtZW50cyB7XG4gICAgICAgICAgICBib3g6IFdpZGdldC5Cb3hQcm9wc1xuICAgICAgICAgICAgYnV0dG9uOiBXaWRnZXQuQnV0dG9uUHJvcHNcbiAgICAgICAgICAgIGNlbnRlcmJveDogV2lkZ2V0LkNlbnRlckJveFByb3BzXG4gICAgICAgICAgICBjaXJjdWxhcnByb2dyZXNzOiBXaWRnZXQuQ2lyY3VsYXJQcm9ncmVzc1Byb3BzXG4gICAgICAgICAgICBkcmF3aW5nYXJlYTogV2lkZ2V0LkRyYXdpbmdBcmVhUHJvcHNcbiAgICAgICAgICAgIGVudHJ5OiBXaWRnZXQuRW50cnlQcm9wc1xuICAgICAgICAgICAgZXZlbnRib3g6IFdpZGdldC5FdmVudEJveFByb3BzXG4gICAgICAgICAgICAvLyBUT0RPOiBmaXhlZFxuICAgICAgICAgICAgLy8gVE9ETzogZmxvd2JveFxuICAgICAgICAgICAgaWNvbjogV2lkZ2V0Lkljb25Qcm9wc1xuICAgICAgICAgICAgbGFiZWw6IFdpZGdldC5MYWJlbFByb3BzXG4gICAgICAgICAgICBsZXZlbGJhcjogV2lkZ2V0LkxldmVsQmFyUHJvcHNcbiAgICAgICAgICAgIC8vIFRPRE86IGxpc3Rib3hcbiAgICAgICAgICAgIG92ZXJsYXk6IFdpZGdldC5PdmVybGF5UHJvcHNcbiAgICAgICAgICAgIHJldmVhbGVyOiBXaWRnZXQuUmV2ZWFsZXJQcm9wc1xuICAgICAgICAgICAgc2Nyb2xsYWJsZTogV2lkZ2V0LlNjcm9sbGFibGVQcm9wc1xuICAgICAgICAgICAgc2xpZGVyOiBXaWRnZXQuU2xpZGVyUHJvcHNcbiAgICAgICAgICAgIHN0YWNrOiBXaWRnZXQuU3RhY2tQcm9wc1xuICAgICAgICAgICAgc3dpdGNoOiBXaWRnZXQuU3dpdGNoUHJvcHNcbiAgICAgICAgICAgIHdpbmRvdzogV2lkZ2V0LldpbmRvd1Byb3BzXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBqc3hzID0ganN4XG4iLCAiaW1wb3J0IFRyYXkgZnJvbSBcImdpOi8vQXN0YWxUcmF5XCI7XG5pbXBvcnQgeyBWYXJpYWJsZSwgYmluZCB9IGZyb20gXCJhc3RhbFwiO1xuaW1wb3J0IHsgQXN0YWwsIEd0aywgR2RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuXG5jb25zdCBjcmVhdGVNZW51ID0gKG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApID0+IHtcbiAgY29uc3QgbWVudSA9IEd0ay5NZW51Lm5ld19mcm9tX21vZGVsKG1lbnVNb2RlbCk7XG4gIG1lbnUuaW5zZXJ0X2FjdGlvbl9ncm91cCgnZGJ1c21lbnUnLCBhY3Rpb25Hcm91cCk7XG5cbiAgcmV0dXJuIG1lbnU7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTeXNUcmF5KHtvcmllbnRhdGlvbn0pIHtcbiAgY29uc3QgdHJheSA9IFRyYXkuZ2V0X2RlZmF1bHQoKVxuICBcbiAgcmV0dXJuIDxib3ggY2xhc3NOYW1lPVwidHJheVwiIG9yaWVudGF0aW9uPXtvcmllbnRhdGlvbn0gdmlzaWJsZT17YmluZCh0cmF5LCBcIml0ZW1zXCIpLmFzKGl0ZW1zPT5pdGVtcy5sZW5ndGg+MCl9PlxuICAgIHtiaW5kKHRyYXksIFwiaXRlbXNcIikuYXMoaXRlbXMgPT4gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXG4gICAgICAvLyBNYWtlIHN1cmUgeW91J3JlIGJvdW5kIHRvIHRoZSBtZW51TW9kZWwgYW5kIGFjdGlvbkdyb3VwIHdoaWNoIGNhbiBjaGFuZ2VcblxuICAgICAgbGV0IG1lbnU7XG5cbiAgICAgIGNvbnN0IGVudHJ5QmluZGluZyA9IFZhcmlhYmxlLmRlcml2ZShcbiAgICAgICAgW2JpbmQoaXRlbSwgJ21lbnVNb2RlbCcpLCBiaW5kKGl0ZW0sICdhY3Rpb25Hcm91cCcpXSxcbiAgICAgICAgKG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApID0+IHtcbiAgICAgICAgICBpZiAoIW1lbnVNb2RlbCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoYE1lbnUgTW9kZWwgbm90IGZvdW5kIGZvciAke2l0ZW0uaWR9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghYWN0aW9uR3JvdXApIHtcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKGBBY3Rpb24gR3JvdXAgbm90IGZvdW5kIGZvciAke2l0ZW0uaWR9YCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbWVudSA9IGNyZWF0ZU1lbnUobWVudU1vZGVsLCBhY3Rpb25Hcm91cCk7XG4gICAgICAgIH0sXG4gICAgICApO1xuXG5cbiAgICAgIHJldHVybiA8YnV0dG9uXG4gICAgICAgIG9uQ2xpY2s9eyhidG4sIGV2ZW50KT0+e1xuICAgICAgICAgIC8vIGlmIChpc1ByaW1hcnlDbGljayhldmVudCkpIHtcbiAgICAgICAgICAvLyAgIGl0ZW0uYWN0aXZhdGUoMCwgMCk7XG4gICAgICAgICAgLy8gfVxuICAgICAgICAgIC8vIGVsc2UgaWYgKGlzU2Vjb25kYXJ5Q2xpY2soZXZlbnQpKXtcbiAgICAgICAgICAgIFxuICAgICAgICAgIC8vIH1cblxuICAgICAgICAgIC8vIHNwYXduIG1lbnUuLi4gKHVzZSBvbmUgbG9jYXRpb24pXG4gICAgICAgICAgLy8gb24gYnV0dG9uXG4gICAgICAgICAgbWVudT8ucG9wdXBfYXRfd2lkZ2V0KGJ0biwgR2RrLkdyYXZpdHkuV0VTVCwgR2RrLkdyYXZpdHkuRUFTVCwgbnVsbCk7XG4gICAgICAgICAgLy8gb24gbW91c2UgcG9pbnRlclxuICAgICAgICAgIC8vIG1lbnU/LnBvcHVwX2F0X3BvaW50ZXIobnVsbCk7XG4gICAgICAgIH19XG4gICAgICAgIG9uRGVzdHJveT17KCkgPT4ge1xuICAgICAgICAgIG1lbnU/LmRlc3Ryb3koKTtcbiAgICAgICAgICBlbnRyeUJpbmRpbmcuZHJvcCgpO1xuICAgICAgICB9fT5cbiAgICAgICAgPGljb24gZy1pY29uPXtiaW5kKGl0ZW0sIFwiZ2ljb25cIil9IC8qIGljb249e2JpbmQoaXRlbSwgXCJpY29uTmFtZVwiKX0gKi8gLz5cbiAgICAgIDwvYnV0dG9uPlxuICAgIH0pKX1cbiAgPC9ib3g+XG59XG4iLCAiaW1wb3J0IHsgQXN0YWwsIEd0aywgR2RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IE5vdGlmZCBmcm9tIFwiZ2k6Ly9Bc3RhbE5vdGlmZFwiXG5pbXBvcnQgeyBWYXJpYWJsZSwgYmluZCwgdGltZW91dCB9IGZyb20gXCJhc3RhbFwiXG5cbmNvbnN0IHsgU1RBUlQsIENFTlRFUiwgRU5EIH0gPSBHdGsuQWxpZ25cblxuXG5jb25zdCBnZXRVcmdlbmN5ID0gKG4pID0+IHtcbiAgICBjb25zdCB7IExPVywgTk9STUFMLCBDUklUSUNBTCB9ID0gTm90aWZkLlVyZ2VuY3lcbiAgICBzd2l0Y2ggKG4udXJnZW5jeSkge1xuICAgICAgICBjYXNlIExPVzogcmV0dXJuIFwibG93XCJcbiAgICAgICAgY2FzZSBDUklUSUNBTDogcmV0dXJuIFwiY3JpdGljYWxcIlxuICAgICAgICBjYXNlIE5PUk1BTDpcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIFwibm9ybWFsXCJcbiAgICB9XG59XG5cbmZ1bmN0aW9uIE5vdGlmKG5vdGlmKSB7XG4gIHJldHVybiA8ZXZlbnRib3hcbiAgICBjbGFzc05hbWU9e2dldFVyZ2VuY3kobm90aWYpfVxuICAgIG9uQ2xpY2s9eygpID0+IG5vdGlmLmRpc21pc3MoKX1cbiAgPlxuICAgIDxib3ggdmVydGljYWw+XG4gICAgICA8Ym94PlxuICAgICAgICB7KChub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSkgJiYgPGljb25cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiXG4gICAgICAgICAgdmlzaWJsZT17Qm9vbGVhbihub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSl9XG4gICAgICAgICAgaWNvbj17bm90aWYuYXBwSWNvbiB8fCBub3RpZi5kZXNrdG9wRW50cnl9XG4gICAgICAgIC8+KSB8fCAobm90aWYuaW1hZ2UgJiYgZmlsZUV4aXN0cyhub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIHZhbGlnbj17U1RBUlR9XG4gICAgICAgICAgY2xhc3NOYW1lPVwiaW1hZ2VcIlxuICAgICAgICAgIGNzcz17YGJhY2tncm91bmQtaW1hZ2U6IHVybCgnJHtub3RpZi5pbWFnZX0nKWB9XG4gICAgICAgIC8+KSB8fCAoKG5vdGlmLmltYWdlICYmIGlzSWNvbihub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIGV4cGFuZD17ZmFsc2V9XG4gICAgICAgICAgdmFsaWduPXtTVEFSVH1cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiPlxuICAgICAgICAgIDxpY29uIGljb249e25vdGlmLmltYWdlfSBleHBhbmQgaGFsaWduPXtDRU5URVJ9IHZhbGlnbj17Q0VOVEVSfSAvPlxuICAgICAgICA8L2JveD4pKX1cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJtYWluXCIgdmVydGljYWw+XG4gICAgICAgICAgPGJveCBjbGFzc05hbWU9XCJoZWFkZXJcIj5cbiAgICAgICAgICAgIDxsYWJlbFxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJzdW1tYXJ5XCJcbiAgICAgICAgICAgICAgaGFsaWduPXtTVEFSVH1cbiAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICBsYWJlbD17bm90aWYuc3VtbWFyeX1cbiAgICAgICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICAgICAgaGV4cGFuZFxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxidXR0b24gb25DbGlja2VkPXsoKSA9PiBub3RpZi5kaXNtaXNzKCl9PlxuICAgICAgICAgICAgICA8aWNvbiBpY29uPVwid2luZG93LWNsb3NlLXN5bWJvbGljXCIgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDxib3ggY2xhc3NOYW1lPVwiY29udGVudFwiPlxuICAgICAgICAgICAgPGJveCB2ZXJ0aWNhbD5cbiAgICAgICAgICAgICAge25vdGlmLmJvZHkgJiYgPGxhYmVsXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYm9keVwiXG4gICAgICAgICAgICAgICAgd3JhcFxuICAgICAgICAgICAgICAgIHVzZU1hcmt1cFxuICAgICAgICAgICAgICAgIGhhbGlnbj17U1RBUlR9XG4gICAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICAgIGp1c3RpZnlGaWxsXG4gICAgICAgICAgICAgICAgbGFiZWw9e25vdGlmLmJvZHl9XG4gICAgICAgICAgICAgIC8+fVxuICAgICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgIDwvYm94PlxuICAgICAgPC9ib3g+XG4gICAgICA8Ym94PlxuICAgICAgICB7bm90aWYuZ2V0X2FjdGlvbnMoKS5sZW5ndGggPiAwICYmIDxib3ggY2xhc3NOYW1lPVwiYWN0aW9uc1wiPlxuICAgICAgICAgIHtub3RpZi5nZXRfYWN0aW9ucygpLm1hcCgoeyBsYWJlbCwgaWQgfSkgPT4gKFxuICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICBoZXhwYW5kXG4gICAgICAgICAgICAgIG9uQ2xpY2tlZD17KCkgPT4gbm90aWYuaW52b2tlKGlkKX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgPGxhYmVsIGxhYmVsPXtsYWJlbH0gaGFsaWduPXtDRU5URVJ9IGhleHBhbmQgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICkpfVxuICAgICAgICA8L2JveD59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9ldmVudGJveD5cbn1cblxuLy8gVGhlIHB1cnBvc2UgaWYgdGhpcyBjbGFzcyBpcyB0byByZXBsYWNlIFZhcmlhYmxlPEFycmF5PFdpZGdldD4+XG4vLyB3aXRoIGEgTWFwPG51bWJlciwgV2lkZ2V0PiB0eXBlIGluIG9yZGVyIHRvIHRyYWNrIG5vdGlmaWNhdGlvbiB3aWRnZXRzXG4vLyBieSB0aGVpciBpZCwgd2hpbGUgbWFraW5nIGl0IGNvbnZpbmllbnRseSBiaW5kYWJsZSBhcyBhbiBhcnJheVxuY2xhc3MgTm90aWZpY2F0aW9uTWFwIHtcbiAgICAvLyB0aGUgdW5kZXJseWluZyBtYXAgdG8ga2VlcCB0cmFjayBvZiBpZCB3aWRnZXQgcGFpcnNcbiAgICBtYXAgPSBuZXcgTWFwKClcblxuICAgIC8vIGl0IG1ha2VzIHNlbnNlIHRvIHVzZSBhIFZhcmlhYmxlIHVuZGVyIHRoZSBob29kIGFuZCB1c2UgaXRzXG4gICAgLy8gcmVhY3Rpdml0eSBpbXBsZW1lbnRhdGlvbiBpbnN0ZWFkIG9mIGtlZXBpbmcgdHJhY2sgb2Ygc3Vic2NyaWJlcnMgb3Vyc2VsdmVzXG4gICAgdmFyID0gVmFyaWFibGUoW10pXG5cbiAgICAvLyBub3RpZnkgc3Vic2NyaWJlcnMgdG8gcmVyZW5kZXIgd2hlbiBzdGF0ZSBjaGFuZ2VzXG4gICAgbm90aWZpeSgpIHtcbiAgICAgICAgdGhpcy52YXIuc2V0KFsuLi50aGlzLm1hcC52YWx1ZXMoKV0ucmV2ZXJzZSgpKVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBub3RpZmQgPSBOb3RpZmQuZ2V0X2RlZmF1bHQoKVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiB1bmNvbW1lbnQgdGhpcyBpZiB5b3Ugd2FudCB0b1xuICAgICAgICAgKiBpZ25vcmUgdGltZW91dCBieSBzZW5kZXJzIGFuZCBlbmZvcmNlIG91ciBvd24gdGltZW91dFxuICAgICAgICAgKiBub3RlIHRoYXQgaWYgdGhlIG5vdGlmaWNhdGlvbiBoYXMgYW55IGFjdGlvbnNcbiAgICAgICAgICogdGhleSBtaWdodCBub3Qgd29yaywgc2luY2UgdGhlIHNlbmRlciBhbHJlYWR5IHRyZWF0cyB0aGVtIGFzIHJlc29sdmVkXG4gICAgICAgICAqL1xuICAgICAgICAvLyBub3RpZmQuaWdub3JlVGltZW91dCA9IHRydWVcblxuICAgICAgICBub3RpZmQuY29ubmVjdChcIm5vdGlmaWVkXCIsIChuLCBpZCkgPT4ge1xuICAgICAgICAgIC8vIHByaW50KHR5cGVvZiBub3RpZmQuZ2V0X25vdGlmaWNhdGlvbihpZCkpXG4gICAgICAgICAgICB0aGlzLnNldChpZCwgTm90aWYobm90aWZkLmdldF9ub3RpZmljYXRpb24oaWQpKSlcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBub3RpZmljYXRpb25zIGNhbiBiZSBjbG9zZWQgYnkgdGhlIG91dHNpZGUgYmVmb3JlXG4gICAgICAgIC8vIGFueSB1c2VyIGlucHV0LCB3aGljaCBoYXZlIHRvIGJlIGhhbmRsZWQgdG9vXG4gICAgICAgIG5vdGlmZC5jb25uZWN0KFwicmVzb2x2ZWRcIiwgKF8sIGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmRlbGV0ZShpZClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICAvLyBpbiBjYXNlIG9mIHJlcGxhY2VjbWVudCBkZXN0cm95IHByZXZpb3VzIHdpZGdldFxuICAgICAgICB0aGlzLm1hcC5nZXQoa2V5KT8uZGVzdHJveSgpXG4gICAgICAgIHRoaXMubWFwLnNldChrZXksIHZhbHVlKVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIGRlbGV0ZShrZXkpIHtcbiAgICAgICAgdGhpcy5tYXAuZ2V0KGtleSk/LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLm1hcC5kZWxldGUoa2V5KVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIC8vIG5lZWRlZCBieSB0aGUgU3Vic2NyaWJhYmxlIGludGVyZmFjZVxuICAgIGdldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFyLmdldCgpXG4gICAgfVxuXG4gICAgLy8gbmVlZGVkIGJ5IHRoZSBTdWJzY3JpYmFibGUgaW50ZXJmYWNlXG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhci5zdWJzY3JpYmUoY2FsbGJhY2spXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBOb3RpZmljYXRpb25zKG1vbml0b3IpIHtcbiAgY29uc3QgeyBSSUdIVCB9ID0gQXN0YWwuV2luZG93QW5jaG9yO1xuXG4gIC8vIGNvbnN0IG5vdGlmZCA9IE5vdGlmZC5nZXRfZGVmYXVsdCgpO1xuXG4gIGNvbnN0IG5vdGlmcyA9IG5ldyBOb3RpZmljYXRpb25NYXAoKTtcblxuICAvLyBub3RpZmQuY29ubmVjdChcIm5vdGlmaWVkXCIsIClcblxuICByZXR1cm4gPHdpbmRvd1xuICAgIGdka21vbml0b3I9e21vbml0b3J9XG4gICAgbmFtZXNwYWNlPVwiYWdzLW5vdGlmZFwiXG4gICAgbGF5ZXI9e0FzdGFsLkxheWVyLk9WRVJMQVl9XG4gICAgYW5jaG9yPXtSSUdIVH1cbiAgICBleGNsdXNpdml0eT17QXN0YWwuRXhjbHVzaXZpdHkuTk9STUFMfVxuICAgIGNsYXNzTmFtZT1cIk5vdGlmaWNhdGlvbnNcIj5cbiAgICA8Ym94IHZlcnRpY2FsPlxuICAgICAge2JpbmQobm90aWZzKX1cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiaW1wb3J0IEFwcHMgZnJvbSBcImdpOi8vQXN0YWxBcHBzXCJcbmltcG9ydCB7IEFwcCwgQXN0YWwsIEdkaywgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IHsgYmluZCwgVmFyaWFibGUsIGV4ZWNBc3luYywgZXhlYyB9IGZyb20gXCJhc3RhbFwiXG5cbmNvbnN0IE1BWF9JVEVNUyA9IDhcblxuZnVuY3Rpb24gaGlkZSgpIHtcbiAgQXBwLmdldF93aW5kb3coXCJsYXVuY2hlclwiKS5oaWRlKClcbn1cblxuZnVuY3Rpb24gQXBwQnV0dG9uKHsgYXBwIH0pIHtcbiAgcmV0dXJuIDxidXR0b25cbiAgICBjbGFzc05hbWU9XCJBcHBCdXR0b25cIlxuICAgIG9uQ2xpY2tlZD17KCkgPT4geyBoaWRlKCk7IGFwcC5sYXVuY2goKSB9fT5cbiAgICA8Ym94PlxuICAgICAgPGljb24gaWNvbj17YXBwLmljb25OYW1lfSAvPlxuICAgICAgPGJveCB2YWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9IHZlcnRpY2FsPlxuICAgICAgICA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJuYW1lXCJcbiAgICAgICAgICB0cnVuY2F0ZVxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17YXBwLm5hbWV9XG4gICAgICAgIC8+XG4gICAgICAgIHthcHAuZGVzY3JpcHRpb24gJiYgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVzY3JpcHRpb25cIlxuICAgICAgICAgIHdyYXBcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2FwcC5kZXNjcmlwdGlvbn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cbmZ1bmN0aW9uIHN0cl9mdXp6eSAoc3RyLCBzKSB7XG4gICAgdmFyIGhheSA9IHN0ci50b0xvd2VyQ2FzZSgpLCBpID0gMCwgbiA9IC0xLCBsO1xuICAgIHMgPSBzLnRvTG93ZXJDYXNlKCk7XG4gICAgZm9yICg7IGwgPSBzW2krK10gOykgaWYgKCF+KG4gPSBoYXkuaW5kZXhPZihsLCBuICsgMSkpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCByZXMgPSBWYXJpYWJsZShcIi4uLlwiKVxuY29uc3Qgd2luZG93cyA9IFZhcmlhYmxlKFtdKVxuXG5jb25zdCBwbHVnaW5zID0gW1xuICB7XG4gICAgXCJpbml0XCI6ICgpPT57fSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiBbe1xuICAgICAgXCJsYWJlbFwiOiB0ZXh0LFxuICAgICAgXCJzdWJcIjogXCJydW5cIixcbiAgICAgIFwiaWNvblwiOiBcInV0aWxpdGllcy10ZXJtaW5hbFwiLFxuICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wic2hcIiwgXCItY1wiLCB0ZXh0XSlcbiAgICB9XSxcbiAgICBcInByZWZpeFwiOiBcIi9cIixcbiAgfSxcbiAge1xuICAgIFwiaW5pdFwiOiAoKT0+e30sXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4ge1xuICAgICAgcmVzLnNldChcIi4uLlwiKTtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDApXG4gICAgICAgIGV4ZWNBc3luYyhbXCJxYWxjXCIsIFwiLXRcIiwgdGV4dF0pLnRoZW4ob3V0PT5yZXMuc2V0KG91dCkpLmNhdGNoKGNvbnNvbGUubG9nKTtcbiAgICAgIHJldHVybiBbe1xuICAgICAgICBcImxhYmVsXCI6IGJpbmQocmVzKSxcbiAgICAgICAgXCJzdWJcIjogXCJjYWxjdWxhdGUgdXNpbmcgcWFsY1wiLFxuICAgICAgICBcImljb25cIjogXCJhY2Nlc3Nvcmllcy1jYWxjdWxhdG9yXCIsXG4gICAgICAgIFwiYWN0aXZhdGVcIjogKCkgPT4gZXhlY0FzeW5jKFtcInNoXCIsIFwiLWNcIiwgYGVjaG8gJHtyZXMuZ2V0KCl9IHwgd2wtY29weWBdKVxuICAgICAgfV1cbiAgICB9LFxuICAgIFwicHJlZml4XCI6IFwiPVwiLFxuICB9LFxuICB7XG4gICAgXCJpbml0XCI6ICgpPT53aW5kb3dzLnNldChKU09OLnBhcnNlKGV4ZWMoW1wiaHlwcmN0bFwiLCBcIi1qXCIsIFwiY2xpZW50c1wiXSkpKSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiB3aW5kb3dzLmdldCgpLm1hcCh3aW5kb3cgPT4ge3JldHVybiB7XG4gICAgICBcImxhYmVsXCI6IHdpbmRvd1tcInRpdGxlXCJdLFxuICAgICAgXCJzdWJcIjogYCR7d2luZG93W1wiY2xhc3NcIl19ICR7d2luZG93W1wicGlkXCJdfWAsXG4gICAgICBcImljb25cIjogd2luZG93W1wiY2xhc3NcIl0sXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJoeXByY3RsXCIsIFwiZGlzcGF0Y2hcIiwgXCJmb2N1c3dpbmRvd1wiLCBgcGlkOiR7d2luZG93W1wicGlkXCJdfWBdKSxcbiAgICB9fSkuZmlsdGVyKHc9PnN0cl9mdXp6eSh3W1wibGFiZWxcIl0sIHRleHQpIHx8IHN0cl9mdXp6eSh3W1wic3ViXCJdLCB0ZXh0KSksXG4gICAgXCJwcmVmaXhcIjogXCI7XCIsXG4gIH0sXG5dXG5cbmZ1bmN0aW9uIFBsdWdpbkJ1dHRvbih7IGl0ZW0gfSkge1xuICByZXR1cm4gPGJ1dHRvblxuICAgIG9uQ2xpY2tlZD17KCkgPT4geyBoaWRlKCk7IGl0ZW0uYWN0aXZhdGUoKSB9fT5cbiAgICA8Ym94PlxuICAgICAgPGljb24gaWNvbj17aXRlbS5pY29ufSAvPlxuICAgICAgPGJveCB2YWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9IHZlcnRpY2FsPlxuICAgICAgICA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJuYW1lXCJcbiAgICAgICAgICB0cnVuY2F0ZVxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17aXRlbS5sYWJlbH1cbiAgICAgICAgLz5cbiAgICAgICAge2l0ZW0uc3ViICYmIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cImRlc2NyaXB0aW9uXCJcbiAgICAgICAgICB0cnVuY2F0ZVxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17aXRlbS5zdWJ9XG4gICAgICAgIC8+fVxuICAgICAgPC9ib3g+XG4gICAgPC9ib3g+XG4gIDwvYnV0dG9uPlxufVxuXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQXBwbGF1bmNoZXIoKSB7XG4gIGNvbnN0IHsgQ0VOVEVSIH0gPSBHdGsuQWxpZ25cbiAgY29uc3QgYXBwcyA9IG5ldyBBcHBzLkFwcHMoKVxuXG4gIGNvbnN0IHRleHQgPSBWYXJpYWJsZShcIlwiKVxuICBjb25zdCBsaXN0ID0gdGV4dCh0ZXh0ID0+IHtcbiAgICBmb3IgKGxldCBpZHggaW4gcGx1Z2lucykge1xuICAgICAgaWYodGV4dC5zdWJzdHJpbmcoMCwgMSkgPT0gcGx1Z2luc1tpZHhdLnByZWZpeCkge1xuICAgICAgICBpZiAodGV4dC5sZW5ndGggPT0gMSlcbiAgICAgICAgICBwbHVnaW5zW2lkeF0uaW5pdCgpXG4gICAgICAgIHJldHVybiBwbHVnaW5zW2lkeF0ucXVlcnkodGV4dC5zdWJzdHJpbmcoMSwgdGV4dC5sZW5ndGgpKVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXBwcy5mdXp6eV9xdWVyeSh0ZXh0KS5zbGljZSgwLCBNQVhfSVRFTVMpXG4gIH0pXG4gIGNvbnN0IG9uRW50ZXIgPSAoaW5wdXRib3gpID0+IHtcbiAgICBpbnB1dGJveC5wYXJlbnQuY2hpbGRyZW5bMV0uY2hpbGRyZW5bMF0uY2xpY2tlZCgpXG4gICAgLy8gY29uc3QgdCA9IHRleHQuZ2V0KCk7XG4gICAgLy8gZm9yIChsZXQgaWR4IGluIHBsdWdpbnMpIHtcbiAgICAvLyAgIGlmKHQuc3Vic3RyaW5nKDAsIDEpID09IHBsdWdpbnNbaWR4XS5wcmVmaXgpIHtcbiAgICAvLyAgICAgcGx1Z2luc1tpZHhdLnF1ZXJ5KHQuc3Vic3RyaW5nKDEsIHQubGVuZ3RoKSlbMF0uYWN0aXZhdGUoKVxuICAgIC8vICAgICBoaWRlKClcbiAgICAvLyAgICAgcmV0dXJuXG4gICAgLy8gICB9XG4gICAgLy8gfVxuICAgIC8vIGFwcHMuZnV6enlfcXVlcnkodCk/LlswXS5sYXVuY2goKVxuICAgIGhpZGUoKVxuICB9XG5cbiAgcmV0dXJuIDx3aW5kb3dcbiAgICBuYW1lPVwibGF1bmNoZXJcIlxuICAgIG5hbWVzcGFjZT1cImFncy1sYXVuY2hlclwiXG4gICAgbGF5ZXI9e0FzdGFsLkxheWVyLk9WRVJMQVl9XG4gICAgYW5jaG9yPXtBc3RhbC5XaW5kb3dBbmNob3IuVE9QIHwgQXN0YWwuV2luZG93QW5jaG9yLkJPVFRPTX1cbiAgICBleGNsdXNpdml0eT17QXN0YWwuRXhjbHVzaXZpdHkuSUdOT1JFfVxuICAgIGtleW1vZGU9e0FzdGFsLktleW1vZGUuT05fREVNQU5EfVxuICAgIGFwcGxpY2F0aW9uPXtBcHB9XG4gICAgdmlzaWJsZT17ZmFsc2V9XG4gICAgb25TaG93PXsoc2VsZikgPT4ge3RleHQuc2V0KFwiXCIpOyBzZWxmLmdldF9jaGlsZCgpLmNoaWxkcmVuWzFdLmNoaWxkcmVuWzFdLmNoaWxkcmVuWzBdLmdyYWJfZm9jdXNfd2l0aG91dF9zZWxlY3RpbmcoKX19XG4gICAgb25LZXlQcmVzc0V2ZW50PXtmdW5jdGlvbiAoc2VsZiwgZXZlbnQpIHtcbiAgICAgIGlmIChldmVudC5nZXRfa2V5dmFsKClbMV0gPT09IEdkay5LRVlfRXNjYXBlKVxuICAgICAgICBzZWxmLmhpZGUoKVxuICAgIH19PlxuICAgIDxib3g+XG4gICAgICA8ZXZlbnRib3ggd2lkdGhSZXF1ZXN0PXsyMDAwfSBleHBhbmQgb25DbGljaz17aGlkZX0gLz5cbiAgICAgIDxib3ggaGV4cGFuZD17ZmFsc2V9IHZlcnRpY2FsPlxuICAgICAgICA8ZXZlbnRib3ggaGVpZ2h0UmVxdWVzdD17MjAwfSBvbkNsaWNrPXtoaWRlfSAvPlxuICAgICAgICA8Ym94IHdpZHRoUmVxdWVzdD17NTAwfSBjbGFzc05hbWU9XCJtYWluXCIgdmVydGljYWw+XG4gICAgICAgICAgPGVudHJ5XG4gICAgICAgICAgICBwbGFjZWhvbGRlclRleHQ9XCJTZWFyY2hcIlxuICAgICAgICAgICAgdGV4dD17dGV4dCgpfVxuICAgICAgICAgICAgb25DaGFuZ2VkPXtzZWxmID0+IHRleHQuc2V0KHNlbGYudGV4dCl9XG4gICAgICAgICAgICBvbkFjdGl2YXRlPXtvbkVudGVyfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPGJveCBzcGFjaW5nPXs2fSB2ZXJ0aWNhbD5cbiAgICAgICAgICAgIHtsaXN0LmFzKGxpc3QgPT4gbGlzdC5tYXAoaXRlbSA9PiB7XG4gICAgICAgICAgICAgIGlmIChpdGVtLmFwcClcbiAgICAgICAgICAgICAgICByZXR1cm4gPEFwcEJ1dHRvbiBhcHA9e2l0ZW19IC8+XG4gICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm4gPFBsdWdpbkJ1dHRvbiBpdGVtPXtpdGVtfSAvPlxuICAgICAgICAgICAgfSkpfVxuICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDxib3hcbiAgICAgICAgICAgIGhhbGlnbj17Q0VOVEVSfVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwibm90LWZvdW5kXCJcbiAgICAgICAgICAgIHZlcnRpY2FsXG4gICAgICAgICAgICB2aXNpYmxlPXtsaXN0LmFzKGwgPT4gbC5sZW5ndGggPT09IDApfT5cbiAgICAgICAgICAgIDxpY29uIGljb249XCJzeXN0ZW0tc2VhcmNoLXN5bWJvbGljXCIgLz5cbiAgICAgICAgICAgIDxsYWJlbCBsYWJlbD1cIk5vIG1hdGNoIGZvdW5kXCIgLz5cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgPC9ib3g+XG4gICAgICAgIDxldmVudGJveCBleHBhbmQgb25DbGljaz17aGlkZX0gLz5cbiAgICAgIDwvYm94PlxuICAgICAgPGV2ZW50Ym94IHdpZHRoUmVxdWVzdD17MjAwMH0gZXhwYW5kIG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgPC9ib3g+XG4gIDwvd2luZG93PlxufVxuIiwgImltcG9ydCBXcCBmcm9tIFwiZ2k6Ly9Bc3RhbFdwXCI7XG5pbXBvcnQgeyBBc3RhbCB9IGZyb20gXCJhc3RhbC9ndGszXCJcbmltcG9ydCB7IGJpbmQsIFZhcmlhYmxlLCBleGVjLCBtb25pdG9yRmlsZSwgcmVhZEZpbGUsIHRpbWVvdXQgfSBmcm9tIFwiYXN0YWxcIlxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBPc2QobW9uaXRvcikge1xuICBjb25zdCBTSE9XX1RJTUUgPSAxNTAwO1xuICBjb25zdCBhdWRpbyA9IFdwLmdldF9kZWZhdWx0KCkuYXVkaW8uZGVmYXVsdFNwZWFrZXI7XG4gIGNvbnN0IGRhdGEgPSBWYXJpYWJsZSgwKTtcbiAgY29uc3QgaWNvbiA9IFZhcmlhYmxlKFwiXCIpO1xuICBjb25zdCBzaG93ID0gVmFyaWFibGUodHJ1ZSk7XG4gIGNvbnN0IGJyaWdodG5lc3NfbWF4ID0gZXhlYyhcImJyaWdodG5lc3NjdGwgbWF4XCIpO1xuICBsZXQgdGltZXI7XG4gIG1vbml0b3JGaWxlKGAvc3lzL2NsYXNzL2JhY2tsaWdodC8ke2V4ZWMoXCJzaCAtYyAnbHMgLXcxIC9zeXMvY2xhc3MvYmFja2xpZ2h0fGhlYWQgLTEnXCIpfS9icmlnaHRuZXNzYCwgKGZpbGUsIGV2ZW50KSA9PiB7XG4gICAgaWYgKGV2ZW50ID09IDEpIHtcbiAgICAgIGRhdGEuc2V0KHBhcnNlSW50KHJlYWRGaWxlKGZpbGUpKSAvIGJyaWdodG5lc3NfbWF4KTtcbiAgICAgIGljb24uc2V0KFwiZGlzcGxheS1icmlnaHRuZXNzLXN5bWJvbGljXCIpXG4gICAgICB0aW1lcj8uY2FuY2VsKClcbiAgICAgIHNob3cuc2V0KHRydWUpO1xuICAgICAgdGltZXIgPSB0aW1lb3V0KFNIT1dfVElNRSwgKCkgPT4gc2hvdy5zZXQoZmFsc2UpKTtcbiAgICB9XG4gIH0pXG5cbiAgY29uc3Qgc3BfaWNvID0gYmluZChhdWRpbywgXCJ2b2x1bWVJY29uXCIpXG4gIHNwX2ljby5zdWJzY3JpYmUoaSA9PiB7XG4gICAgaWNvbi5zZXQoaSk7XG4gICAgZGF0YS5zZXQoYXVkaW8udm9sdW1lKTtcbiAgICB0aW1lcj8uY2FuY2VsKClcbiAgICBzaG93LnNldCh0cnVlKTtcbiAgICB0aW1lciA9IHRpbWVvdXQoU0hPV19USU1FLCAoKSA9PiBzaG93LnNldChmYWxzZSkpO1xuICB9KVxuICByZXR1cm4gPHdpbmRvd1xuICAgIG1vbml0b3I9e21vbml0b3J9XG4gICAgbGF5ZXI9e0FzdGFsLkxheWVyLk9WRVJMQVl9XG4gICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5LklHTk9SRX1cbiAgICBhbmNob3I9e0FzdGFsLldpbmRvd0FuY2hvci5CT1RUT019XG4gICAgbWFyZ2luLWJvdHRvbT17MjAwfVxuICAgIGNsYXNzTmFtZT1cIk9zZFwiXG4gICAgbmFtZXNwYWNlPVwiYWdzLWxhdW5jaGVyXCJcbiAgPlxuICAgIDxib3ggdmlzaWJsZT17YmluZChzaG93KX0+XG4gICAgICA8aWNvbiBpY29uPXtiaW5kKGljb24pfSAvPlxuICAgICAgPGxldmVsYmFyIHZhbHVlPXtiaW5kKGRhdGEpfSB3aWR0aFJlcXVlc3Q9ezE1MH0gLz5cbiAgICAgIDxsYWJlbCBsYWJlbD17YmluZChkYXRhKS5hcyh2ID0+IGAke01hdGgucm91bmQodiAqIDEwMCl9JWApfSAvPlxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICIjIS91c3IvYmluL2dqcyAtbVxuaW1wb3J0IHsgQXBwIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBzdHlsZSBmcm9tIFwiLi9zdHlsZS5zY3NzXCI7XG5pbXBvcnQgQmFyIGZyb20gXCIuL3dpZGdldC9CYXJcIjtcbmltcG9ydCBOb3RpZmljYXRpb25zIGZyb20gXCIuL3dpZGdldC9Ob3RpZmljYXRpb25zXCI7XG5pbXBvcnQgTGF1bmNoZXIgZnJvbSBcIi4vd2lkZ2V0L0xhdW5jaGVyXCI7XG5pbXBvcnQgT3NkIGZyb20gXCIuL3dpZGdldC9Pc2RcIjtcblxuQXBwLnN0YXJ0KHtcbiAgY3NzOiBzdHlsZSxcbiAgaW5zdGFuY2VOYW1lOiBcInNoZWxsXCIsXG4gIHJlcXVlc3RIYW5kbGVyKHJlcXVlc3QsIHJlcykge1xuICAgIGlmIChyZXF1ZXN0ID09IFwibGF1bmNoZXJcIikge1xuICAgICAgQXBwLmdldF93aW5kb3coXCJsYXVuY2hlclwiKS5zaG93KClcbiAgICAgIHJlcyhcIm9rXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcmludChcInVua25vd24gcmVxdWVzdDpcIiwgcmVxdWVzdCk7XG4gICAgICByZXMoXCJ1bmtub3duIHJlcXVlc3RcIik7XG4gICAgfVxuICB9LFxuICBtYWluOiAoKSA9PiBBcHAuZ2V0X21vbml0b3JzKCkuZm9yRWFjaCgobSkgPT4ge1xuICAgIGlmIChtLm1vZGVsID09IFwiMHgwOEUyXCIpIHtcbiAgICAgIEJhcihtKTtcbiAgICAgIE5vdGlmaWNhdGlvbnMobSk7XG4gICAgICBMYXVuY2hlcihtKTtcbiAgICAgIE9zZChtKTtcbiAgICB9XG4gIH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFBQSxPQUFPQSxZQUFXO0FB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QU0sWUFBWTtBQUFBLE1BQy9CLFFBQVFBLE9BQU0sYUFBYTtBQUFBLE1BQzNCLGlCQUFlO0FBQUEsTUFDZixXQUFVO0FBQUEsTUFDVixXQUFVO0FBQUEsTUFFViwrQkFBQyxTQUFJLFNBQVMsS0FBSyxJQUFJLEdBQ3JCO0FBQUEsNEJBQUMsVUFBSyxNQUFNLEtBQUssSUFBSSxHQUFHO0FBQUEsUUFDeEIsb0JBQUMsY0FBUyxPQUFPLEtBQUssSUFBSSxHQUFHLGNBQWMsS0FBSztBQUFBLFFBQ2hELG9CQUFDLFdBQU0sT0FBTyxLQUFLLElBQUksRUFBRSxHQUFHLE9BQUssR0FBRyxLQUFLLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxHQUFHO0FBQUEsU0FDL0Q7QUFBQTtBQUFBLEVBQ0Y7QUFDRjs7O0FDckNBLFlBQUksTUFBTTtBQUFBLEVBQ1IsS0FBSztBQUFBLEVBQ0wsY0FBYztBQUFBLEVBQ2QsZUFBZSxTQUFTQyxNQUFLO0FBQzNCLFFBQUksV0FBVyxZQUFZO0FBQ3pCLGtCQUFJLFdBQVcsVUFBVSxFQUFFLEtBQUs7QUFDaEMsTUFBQUEsS0FBSSxJQUFJO0FBQUEsSUFDVixPQUFPO0FBQ0wsWUFBTSxvQkFBb0IsT0FBTztBQUNqQyxNQUFBQSxLQUFJLGlCQUFpQjtBQUFBLElBQ3ZCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTSxNQUFNLFlBQUksYUFBYSxFQUFFLFFBQVEsQ0FBQyxNQUFNO0FBQzVDLFFBQUksRUFBRSxTQUFTLFVBQVU7QUFDdkIsVUFBSSxDQUFDO0FBQ0wsb0JBQWMsQ0FBQztBQUNmLGtCQUFTLENBQUM7QUFDVixVQUFJLENBQUM7QUFBQSxJQUNQO0FBQUEsRUFDRixDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgInJlcyIsICJBc3RhbCIsICJiaW5kIiwgIkFzdGFsIiwgImludGVydmFsIiwgInRpbWVvdXQiLCAiQXN0YWwiLCAidiIsICJpbnRlcnZhbCIsICJleGVjIiwgIkFzdGFsIiwgIkd0ayIsICJBc3RhbCIsICJzbmFrZWlmeSIsICJwYXRjaCIsICJBcHBzIiwgIkh5cHJsYW5kIiwgIk5vdGlmZCIsICJHT2JqZWN0IiwgInJlcyIsICJHdGsiLCAiQXN0YWwiLCAiQXN0YWwiLCAiR3RrIiwgIkdPYmplY3QiLCAiQXN0YWwiLCAiR09iamVjdCIsICJHdGsiLCAiZGVmYXVsdCIsICJBc3RhbCIsICJBc3RhbCIsICJBc3RhbCIsICJHT2JqZWN0IiwgImRlZmF1bHQiLCAiR09iamVjdCIsICJHdGsiLCAiR3RrIiwgImRlZmF1bHQiLCAiQXN0YWwiLCAid2lmaSIsICJHdGsiLCAiQXN0YWwiLCAiR3RrIiwgIkd0ayIsICJDRU5URVIiLCAidGV4dCIsICJBc3RhbCIsICJsaXN0IiwgIldwIiwgIldwIiwgIkFzdGFsIiwgInJlcyJdCn0K
