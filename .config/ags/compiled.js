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
var style_default = "* {\n  color: #f1f1f1;\n  font-size: 16px;\n}\n\n.Bar {\n  background: #212223;\n}\n.Bar icon {\n  font-size: 20px;\n  margin-right: 5px;\n}\n.Bar .icon {\n  font-size: 24px;\n  margin-right: 5px;\n  /* margin-bottom: 2px; */\n}\n.Bar .status {\n  margin: 0 8px;\n}\n\n.battery.charging {\n  /* label {\n    color: $accent;\n  } */\n}\n.battery.charging .icon {\n  color: #378DF7;\n  margin-right: 10px;\n}\n\nbutton {\n  background: transparent;\n  border: none;\n  padding: 0;\n  border-radius: 0;\n}\n\nicon {\n  font-size: 25px;\n}\n\n.workspaces icon {\n  margin-top: 2px;\n  margin-left: 5px;\n}\n.workspaces button {\n  padding-right: 4px;\n  padding-top: 3px;\n  border-bottom: 3px solid #212223;\n}\n.workspaces button label {\n  margin-left: 8px;\n  margin-right: 4px;\n}\n.workspaces button.exist {\n  border-bottom: 3px solid #414243;\n}\n.workspaces button.focused {\n  /* background: $accent; */\n  background: #414243;\n  border-bottom: 3px solid #378DF7;\n}\n\n.Notifications eventbox button {\n  background: #414243;\n  border-radius: 0px;\n  margin: 0 2px;\n}\n.Notifications eventbox > box {\n  margin: 4px;\n  background: #212223;\n  padding: 4px 2px;\n  min-width: 300px;\n  border-radius: 4px;\n  border: 2px solid #414243;\n}\n.Notifications eventbox .image {\n  min-height: 80px;\n  min-width: 80px;\n  font-size: 80px;\n  margin: 8px;\n}\n.Notifications eventbox .main {\n  padding-left: 4px;\n  margin-bottom: 2px;\n}\n.Notifications eventbox .main .header .summary {\n  font-size: 1.2em;\n  font-weight: bold;\n}\n.Notifications eventbox.critical > box {\n  border-color: #378DF7;\n}\n\n.clock .icon {\n  margin-right: 5px;\n  color: #378DF7;\n}\n\n.tray {\n  margin-right: 2px;\n}\n.tray icon {\n  font-size: 16px;\n  margin: 0 4px;\n}\n\n#launcher {\n  background: none;\n}\n#launcher .main {\n  padding: 4px;\n  background: #212223;\n  border-radius: 4px;\n}\n#launcher .main icon {\n  margin: 0 4px;\n}\n#launcher .main .description {\n  color: #bbb;\n  font-size: 0.8em;\n}\n#launcher .main button:hover,\n#launcher .main button:focus {\n  border: 2px solid #378DF7;\n}\n#launcher .main button {\n  border: 2px solid #414243;\n}\n#launcher .main button,\n#launcher .main entry {\n  border-radius: 0px;\n  background: #414243;\n  outline: none;\n}\n#launcher .main entry {\n  margin-bottom: 8px;\n  border: none;\n  min-height: 0px;\n  font-size: 1.3rem;\n}\n\n.Osd box {\n  background: #212223;\n  border-radius: 24px;\n  padding: 10px 12px;\n}\n.Osd box trough {\n  padding: 0;\n  margin: 8px;\n  border-radius: 5px;\n}\n.Osd box trough block {\n  border-radius: 5px;\n  border: none;\n}\n.Osd box trough block.filled {\n  background: white;\n}\n.Osd box label {\n  min-width: 40px;\n}";

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
        return /* @__PURE__ */ jsx("icon", { icon: bind(client, "initial-class").as((c) => Astal7.Icon.lookup_icon(c) ? c : c.toLowerCase()) });
      else
        return "";
    }),
    bind(hypr, "focusedClient").as((client) => {
      if (client)
        return /* @__PURE__ */ jsx("label", { label: bind(client, "title").as((title) => title.length > 40 ? `${title.substring(0, 40)}...` : title) });
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
        onClick: (btn, event) => {
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
function Clock() {
  return /* @__PURE__ */ jsx(
    "box",
    {
      className: "clock status",
      halign: Gtk4.Align.CENTER,
      hexpand: true,
      children: /* @__PURE__ */ jsx(
        "label",
        {
          label: Variable("").poll(
            5e3,
            () => default2.DateTime.new_now_local().format("%H:%M %A %d/%m/%Y")
          )()
        }
      )
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
            label: bind(bat, "percentage").as((p) => `${Math.floor(p * 100)}%`)
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
      layer: Astal7.Layer.Bottom,
      children: /* @__PURE__ */ jsxs("centerbox", { children: [
        /* @__PURE__ */ jsx("box", { className: "segment start", halign: Gtk4.Align.START, children: /* @__PURE__ */ jsx(Workspaces, {}) }),
        /* @__PURE__ */ jsx("box", { className: "segment center", children: /* @__PURE__ */ jsx(Clock, {}) }),
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
        execAsync(["qalc", "-t", text]).then((out) => res.set(out)).catch(console.error);
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
        "sub": `${window["xwayland"] ? "[X] " : ""}${window["class"]} [${window["pid"]}] ${window["fullscreen"] ? "(fullscreen) " : window["floating"] ? "(floating) " : ""}on ${window["workspace"]["id"]}`,
        "icon": Astal7.Icon.lookup_icon(window["initialClass"]) ? window["initialClass"] : window["initialClass"].toLowerCase(),
        "activate": () => execAsync(["hyprctl", "dispatch", "focuswindow", `address:${window["address"]}`])
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9ndGszL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hc3RhbGlmeS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL3Byb2Nlc3MudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy92YXJpYWJsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2JpbmRpbmcudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy90aW1lLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hcHAudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9vdmVycmlkZXMudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9fYXBwLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy93aWRnZXQudHMiLCAic2FzczovaG9tZS9tYXJjZWwvLmNvbmZpZy9hZ3MvaG9yaXpvbnRhbC9zdHlsZS5zY3NzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvaW5kZXgudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9maWxlLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ29iamVjdC50cyIsICJob3Jpem9udGFsL3dpZGdldC9CYXIuanN4IiwgImhvcml6b250YWwvd2lkZ2V0L3dvcmtzcGFjZXMuanN4IiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9qc3gtcnVudGltZS50cyIsICJob3Jpem9udGFsL3dpZGdldC90cmF5LmpzeCIsICJob3Jpem9udGFsL3dpZGdldC9Ob3RpZmljYXRpb25zLmpzeCIsICJob3Jpem9udGFsL3dpZGdldC9MYXVuY2hlci5qc3giLCAiaG9yaXpvbnRhbC93aWRnZXQvT3NkLmpzeCIsICJob3Jpem9udGFsL2FwcC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHZGsgZnJvbSBcImdpOi8vR2RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBhc3RhbGlmeSwgeyB0eXBlIENvbnN0cnVjdFByb3BzLCB0eXBlIEJpbmRhYmxlUHJvcHMgfSBmcm9tIFwiLi9hc3RhbGlmeS5qc1wiXG5cbmV4cG9ydCB7IEFzdGFsLCBHdGssIEdkayB9XG5leHBvcnQgeyBkZWZhdWx0IGFzIEFwcCB9IGZyb20gXCIuL2FwcC5qc1wiXG5leHBvcnQgeyBhc3RhbGlmeSwgQ29uc3RydWN0UHJvcHMsIEJpbmRhYmxlUHJvcHMgfVxuZXhwb3J0ICogYXMgV2lkZ2V0IGZyb20gXCIuL3dpZGdldC5qc1wiXG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHZGsgZnJvbSBcImdpOi8vR2RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuaW1wb3J0IHsgZXhlY0FzeW5jIH0gZnJvbSBcIi4uL3Byb2Nlc3MuanNcIlxuaW1wb3J0IFZhcmlhYmxlIGZyb20gXCIuLi92YXJpYWJsZS5qc1wiXG5pbXBvcnQgQmluZGluZywgeyBrZWJhYmlmeSwgc25ha2VpZnksIHR5cGUgQ29ubmVjdGFibGUsIHR5cGUgU3Vic2NyaWJhYmxlIH0gZnJvbSBcIi4uL2JpbmRpbmcuanNcIlxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VCaW5kaW5ncyhhcnJheTogYW55W10pIHtcbiAgICBmdW5jdGlvbiBnZXRWYWx1ZXMoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgbGV0IGkgPSAwXG4gICAgICAgIHJldHVybiBhcnJheS5tYXAodmFsdWUgPT4gdmFsdWUgaW5zdGFuY2VvZiBCaW5kaW5nXG4gICAgICAgICAgICA/IGFyZ3NbaSsrXVxuICAgICAgICAgICAgOiB2YWx1ZSxcbiAgICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGJpbmRpbmdzID0gYXJyYXkuZmlsdGVyKGkgPT4gaSBpbnN0YW5jZW9mIEJpbmRpbmcpXG5cbiAgICBpZiAoYmluZGluZ3MubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gYXJyYXlcblxuICAgIGlmIChiaW5kaW5ncy5sZW5ndGggPT09IDEpXG4gICAgICAgIHJldHVybiBiaW5kaW5nc1swXS5hcyhnZXRWYWx1ZXMpXG5cbiAgICByZXR1cm4gVmFyaWFibGUuZGVyaXZlKGJpbmRpbmdzLCBnZXRWYWx1ZXMpKClcbn1cblxuZnVuY3Rpb24gc2V0UHJvcChvYmo6IGFueSwgcHJvcDogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gdGhlIHNldHRlciBtZXRob2QgaGFzIHRvIGJlIHVzZWQgYmVjYXVzZVxuICAgICAgICAvLyBhcnJheSBsaWtlIHByb3BlcnRpZXMgYXJlIG5vdCBib3VuZCBjb3JyZWN0bHkgYXMgcHJvcHNcbiAgICAgICAgY29uc3Qgc2V0dGVyID0gYHNldF8ke3NuYWtlaWZ5KHByb3ApfWBcbiAgICAgICAgaWYgKHR5cGVvZiBvYmpbc2V0dGVyXSA9PT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgcmV0dXJuIG9ialtzZXR0ZXJdKHZhbHVlKVxuXG4gICAgICAgIHJldHVybiAob2JqW3Byb3BdID0gdmFsdWUpXG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBjb3VsZCBub3Qgc2V0IHByb3BlcnR5IFwiJHtwcm9wfVwiIG9uICR7b2JqfTpgLCBlcnJvcilcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGFzdGFsaWZ5PFxuICAgIEMgZXh0ZW5kcyB7IG5ldyguLi5hcmdzOiBhbnlbXSk6IEd0ay5XaWRnZXQgfSxcbj4oY2xzOiBDLCBjbHNOYW1lID0gY2xzLm5hbWUpIHtcbiAgICBjbGFzcyBXaWRnZXQgZXh0ZW5kcyBjbHMge1xuICAgICAgICBnZXQgY3NzKCk6IHN0cmluZyB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2Nzcyh0aGlzKSB9XG4gICAgICAgIHNldCBjc3MoY3NzOiBzdHJpbmcpIHsgQXN0YWwud2lkZ2V0X3NldF9jc3ModGhpcywgY3NzKSB9XG4gICAgICAgIGdldF9jc3MoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuY3NzIH1cbiAgICAgICAgc2V0X2Nzcyhjc3M6IHN0cmluZykgeyB0aGlzLmNzcyA9IGNzcyB9XG5cbiAgICAgICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jbGFzc19uYW1lcyh0aGlzKS5qb2luKFwiIFwiKSB9XG4gICAgICAgIHNldCBjbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpIHsgQXN0YWwud2lkZ2V0X3NldF9jbGFzc19uYW1lcyh0aGlzLCBjbGFzc05hbWUuc3BsaXQoL1xccysvKSkgfVxuICAgICAgICBnZXRfY2xhc3NfbmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5jbGFzc05hbWUgfVxuICAgICAgICBzZXRfY2xhc3NfbmFtZShjbGFzc05hbWU6IHN0cmluZykgeyB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZSB9XG5cbiAgICAgICAgZ2V0IGN1cnNvcigpOiBDdXJzb3IgeyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jdXJzb3IodGhpcykgYXMgQ3Vyc29yIH1cbiAgICAgICAgc2V0IGN1cnNvcihjdXJzb3I6IEN1cnNvcikgeyBBc3RhbC53aWRnZXRfc2V0X2N1cnNvcih0aGlzLCBjdXJzb3IpIH1cbiAgICAgICAgZ2V0X2N1cnNvcigpOiBDdXJzb3IgeyByZXR1cm4gdGhpcy5jdXJzb3IgfVxuICAgICAgICBzZXRfY3Vyc29yKGN1cnNvcjogQ3Vyc29yKSB7IHRoaXMuY3Vyc29yID0gY3Vyc29yIH1cblxuICAgICAgICBnZXQgY2xpY2tUaHJvdWdoKCk6IGJvb2xlYW4geyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jbGlja190aHJvdWdoKHRoaXMpIH1cbiAgICAgICAgc2V0IGNsaWNrVGhyb3VnaChjbGlja1Rocm91Z2g6IGJvb2xlYW4pIHsgQXN0YWwud2lkZ2V0X3NldF9jbGlja190aHJvdWdoKHRoaXMsIGNsaWNrVGhyb3VnaCkgfVxuICAgICAgICBnZXRfY2xpY2tfdGhyb3VnaCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuY2xpY2tUaHJvdWdoIH1cbiAgICAgICAgc2V0X2NsaWNrX3Rocm91Z2goY2xpY2tUaHJvdWdoOiBib29sZWFuKSB7IHRoaXMuY2xpY2tUaHJvdWdoID0gY2xpY2tUaHJvdWdoIH1cblxuICAgICAgICBkZWNsYXJlIHByaXZhdGUgX19ub19pbXBsaWNpdF9kZXN0cm95OiBib29sZWFuXG4gICAgICAgIGdldCBub0ltcGxpY2l0RGVzdHJveSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX19ub19pbXBsaWNpdF9kZXN0cm95IH1cbiAgICAgICAgc2V0IG5vSW1wbGljaXREZXN0cm95KHZhbHVlOiBib29sZWFuKSB7IHRoaXMuX19ub19pbXBsaWNpdF9kZXN0cm95ID0gdmFsdWUgfVxuXG4gICAgICAgIF9zZXRDaGlsZHJlbihjaGlsZHJlbjogR3RrLldpZGdldFtdKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGNoaWxkcmVuLmZsYXQoSW5maW5pdHkpLm1hcChjaCA9PiBjaCBpbnN0YW5jZW9mIEd0ay5XaWRnZXRcbiAgICAgICAgICAgICAgICA/IGNoXG4gICAgICAgICAgICAgICAgOiBuZXcgR3RrLkxhYmVsKHsgdmlzaWJsZTogdHJ1ZSwgbGFiZWw6IFN0cmluZyhjaCkgfSkpXG5cbiAgICAgICAgICAgIC8vIHJlbW92ZVxuICAgICAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBHdGsuQmluKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2ggPSB0aGlzLmdldF9jaGlsZCgpXG4gICAgICAgICAgICAgICAgaWYgKGNoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZShjaClcbiAgICAgICAgICAgICAgICBpZiAoY2ggJiYgIWNoaWxkcmVuLmluY2x1ZGVzKGNoKSAmJiAhdGhpcy5ub0ltcGxpY2l0RGVzdHJveSlcbiAgICAgICAgICAgICAgICAgICAgY2g/LmRlc3Ryb3koKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEd0ay5Db250YWluZXIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuZ2V0X2NoaWxkcmVuKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1vdmUoY2gpXG4gICAgICAgICAgICAgICAgICAgIGlmICghY2hpbGRyZW4uaW5jbHVkZXMoY2gpICYmICF0aGlzLm5vSW1wbGljaXREZXN0cm95KVxuICAgICAgICAgICAgICAgICAgICAgICAgY2g/LmRlc3Ryb3koKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVE9ETzogYWRkIG1vcmUgY29udGFpbmVyIHR5cGVzXG4gICAgICAgICAgICBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLkJveCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkcmVuKGNoaWxkcmVuKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuU3RhY2spIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldF9jaGlsZHJlbihjaGlsZHJlbilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLkNlbnRlckJveCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRXaWRnZXQgPSBjaGlsZHJlblswXVxuICAgICAgICAgICAgICAgIHRoaXMuY2VudGVyV2lkZ2V0ID0gY2hpbGRyZW5bMV1cbiAgICAgICAgICAgICAgICB0aGlzLmVuZFdpZGdldCA9IGNoaWxkcmVuWzJdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5PdmVybGF5KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgW2NoaWxkLCAuLi5vdmVybGF5c10gPSBjaGlsZHJlblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkKGNoaWxkKVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0X292ZXJsYXlzKG92ZXJsYXlzKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgR3RrLkNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2ggb2YgY2hpbGRyZW4pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkKGNoKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihgY2FuIG5vdCBhZGQgY2hpbGRyZW4gdG8gJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9LCBpdCBpcyBub3QgYSBjb250YWluZXIgd2lkZ2V0YClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRvZ2dsZUNsYXNzTmFtZShjbjogc3RyaW5nLCBjb25kID0gdHJ1ZSkge1xuICAgICAgICAgICAgQXN0YWwud2lkZ2V0X3RvZ2dsZV9jbGFzc19uYW1lKHRoaXMsIGNuLCBjb25kKVxuICAgICAgICB9XG5cbiAgICAgICAgaG9vayhcbiAgICAgICAgICAgIG9iamVjdDogQ29ubmVjdGFibGUsXG4gICAgICAgICAgICBzaWduYWw6IHN0cmluZyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiAoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICAgICAgICk6IHRoaXNcbiAgICAgICAgaG9vayhcbiAgICAgICAgICAgIG9iamVjdDogU3Vic2NyaWJhYmxlLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKTogdGhpc1xuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBDb25uZWN0YWJsZSB8IFN1YnNjcmliYWJsZSxcbiAgICAgICAgICAgIHNpZ25hbE9yQ2FsbGJhY2s6IHN0cmluZyB8ICgoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQpLFxuICAgICAgICAgICAgY2FsbGJhY2s/OiAoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICAgICAgICkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3QuY29ubmVjdCA9PT0gXCJmdW5jdGlvblwiICYmIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBvYmplY3QuY29ubmVjdChzaWduYWxPckNhbGxiYWNrLCAoXzogYW55LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcywgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAob2JqZWN0LmRpc2Nvbm5lY3QgYXMgQ29ubmVjdGFibGVbXCJkaXNjb25uZWN0XCJdKShpZClcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2Ygb2JqZWN0LnN1YnNjcmliZSA9PT0gXCJmdW5jdGlvblwiICYmIHR5cGVvZiBzaWduYWxPckNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnN1YiA9IG9iamVjdC5zdWJzY3JpYmUoKC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzaWduYWxPckNhbGxiYWNrKHRoaXMsIC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsIHVuc3ViKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3RydWN0b3IoLi4ucGFyYW1zOiBhbnlbXSkge1xuICAgICAgICAgICAgc3VwZXIoKVxuICAgICAgICAgICAgY29uc3QgW2NvbmZpZ10gPSBwYXJhbXNcblxuICAgICAgICAgICAgY29uc3QgeyBzZXR1cCwgY2hpbGQsIGNoaWxkcmVuID0gW10sIC4uLnByb3BzIH0gPSBjb25maWdcbiAgICAgICAgICAgIHByb3BzLnZpc2libGUgPz89IHRydWVcblxuICAgICAgICAgICAgaWYgKGNoaWxkKVxuICAgICAgICAgICAgICAgIGNoaWxkcmVuLnVuc2hpZnQoY2hpbGQpXG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYmluZGluZ3NcbiAgICAgICAgICAgIGNvbnN0IGJpbmRpbmdzID0gT2JqZWN0LmtleXMocHJvcHMpLnJlZHVjZSgoYWNjOiBhbnksIHByb3ApID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocHJvcHNbcHJvcF0gaW5zdGFuY2VvZiBCaW5kaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJpbmRpbmcgPSBwcm9wc1twcm9wXVxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcHJvcHNbcHJvcF1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsuLi5hY2MsIFtwcm9wLCBiaW5kaW5nXV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgICAgfSwgW10pXG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3Qgc2lnbmFsIGhhbmRsZXJzXG4gICAgICAgICAgICBjb25zdCBvbkhhbmRsZXJzID0gT2JqZWN0LmtleXMocHJvcHMpLnJlZHVjZSgoYWNjOiBhbnksIGtleSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aChcIm9uXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpZyA9IGtlYmFiaWZ5KGtleSkuc3BsaXQoXCItXCIpLnNsaWNlKDEpLmpvaW4oXCItXCIpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBwcm9wc1trZXldXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBwcm9wc1trZXldXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbLi4uYWNjLCBbc2lnLCBoYW5kbGVyXV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgICAgfSwgW10pXG5cbiAgICAgICAgICAgIC8vIHNldCBjaGlsZHJlblxuICAgICAgICAgICAgY29uc3QgbWVyZ2VkQ2hpbGRyZW4gPSBtZXJnZUJpbmRpbmdzKGNoaWxkcmVuLmZsYXQoSW5maW5pdHkpKVxuICAgICAgICAgICAgaWYgKG1lcmdlZENoaWxkcmVuIGluc3RhbmNlb2YgQmluZGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKG1lcmdlZENoaWxkcmVuLmdldCgpKVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgbWVyZ2VkQ2hpbGRyZW4uc3Vic2NyaWJlKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKHYpXG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAobWVyZ2VkQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbihtZXJnZWRDaGlsZHJlbilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldHVwIHNpZ25hbCBoYW5kbGVyc1xuICAgICAgICAgICAgZm9yIChjb25zdCBbc2lnbmFsLCBjYWxsYmFja10gb2Ygb25IYW5kbGVycykge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3Qoc2lnbmFsLCBjYWxsYmFjaylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChzaWduYWwsICgpID0+IGV4ZWNBc3luYyhjYWxsYmFjaylcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKHByaW50KS5jYXRjaChjb25zb2xlLmVycm9yKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldHVwIGJpbmRpbmdzIGhhbmRsZXJzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwcm9wLCBiaW5kaW5nXSBvZiBiaW5kaW5ncykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wID09PSBcImNoaWxkXCIgfHwgcHJvcCA9PT0gXCJjaGlsZHJlblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgYmluZGluZy5zdWJzY3JpYmUoKHY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4odilcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgYmluZGluZy5zdWJzY3JpYmUoKHY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzZXRQcm9wKHRoaXMsIHByb3AsIHYpXG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgc2V0UHJvcCh0aGlzLCBwcm9wLCBiaW5kaW5nLmdldCgpKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIHByb3BzKVxuICAgICAgICAgICAgc2V0dXA/Lih0aGlzKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgR1R5cGVOYW1lOiBgQXN0YWxfJHtjbHNOYW1lfWAsXG4gICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIFwiY2xhc3MtbmFtZVwiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjbGFzcy1uYW1lXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiXCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjc3NcIjogR09iamVjdC5QYXJhbVNwZWMuc3RyaW5nKFxuICAgICAgICAgICAgICAgIFwiY3NzXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiXCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjdXJzb3JcIjogR09iamVjdC5QYXJhbVNwZWMuc3RyaW5nKFxuICAgICAgICAgICAgICAgIFwiY3Vyc29yXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiZGVmYXVsdFwiLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwiY2xpY2stdGhyb3VnaFwiOiBHT2JqZWN0LlBhcmFtU3BlYy5ib29sZWFuKFxuICAgICAgICAgICAgICAgIFwiY2xpY2stdGhyb3VnaFwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBmYWxzZSxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcIm5vLWltcGxpY2l0LWRlc3Ryb3lcIjogR09iamVjdC5QYXJhbVNwZWMuYm9vbGVhbihcbiAgICAgICAgICAgICAgICBcIm5vLWltcGxpY2l0LWRlc3Ryb3lcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgZmFsc2UsXG4gICAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgIH0sIFdpZGdldClcblxuICAgIHJldHVybiBXaWRnZXRcbn1cblxuZXhwb3J0IHR5cGUgQmluZGFibGVQcm9wczxUPiA9IHtcbiAgICBbSyBpbiBrZXlvZiBUXTogQmluZGluZzxUW0tdPiB8IFRbS107XG59XG5cbnR5cGUgU2lnSGFuZGxlcjxcbiAgICBXIGV4dGVuZHMgSW5zdGFuY2VUeXBlPHR5cGVvZiBHdGsuV2lkZ2V0PixcbiAgICBBcmdzIGV4dGVuZHMgQXJyYXk8dW5rbm93bj4sXG4+ID0gKChzZWxmOiBXLCAuLi5hcmdzOiBBcmdzKSA9PiB1bmtub3duKSB8IHN0cmluZyB8IHN0cmluZ1tdXG5cbmV4cG9ydCB0eXBlIENvbnN0cnVjdFByb3BzPFxuICAgIFNlbGYgZXh0ZW5kcyBJbnN0YW5jZVR5cGU8dHlwZW9mIEd0ay5XaWRnZXQ+LFxuICAgIFByb3BzIGV4dGVuZHMgR3RrLldpZGdldC5Db25zdHJ1Y3RvclByb3BzLFxuICAgIFNpZ25hbHMgZXh0ZW5kcyBSZWNvcmQ8YG9uJHtzdHJpbmd9YCwgQXJyYXk8dW5rbm93bj4+ID0gUmVjb3JkPGBvbiR7c3RyaW5nfWAsIGFueVtdPixcbj4gPSBQYXJ0aWFsPHtcbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGNhbid0IGFzc2lnbiB0byB1bmtub3duLCBidXQgaXQgd29ya3MgYXMgZXhwZWN0ZWQgdGhvdWdoXG4gICAgW1MgaW4ga2V5b2YgU2lnbmFsc106IFNpZ0hhbmRsZXI8U2VsZiwgU2lnbmFsc1tTXT5cbn0+ICYgUGFydGlhbDx7XG4gICAgW0tleSBpbiBgb24ke3N0cmluZ31gXTogU2lnSGFuZGxlcjxTZWxmLCBhbnlbXT5cbn0+ICYgQmluZGFibGVQcm9wczxQYXJ0aWFsPFByb3BzPiAmIHtcbiAgICBjbGFzc05hbWU/OiBzdHJpbmdcbiAgICBjc3M/OiBzdHJpbmdcbiAgICBjdXJzb3I/OiBzdHJpbmdcbiAgICBjbGlja1Rocm91Z2g/OiBib29sZWFuXG59PiAmIHtcbiAgICBvbkRlc3Ryb3k/OiAoc2VsZjogU2VsZikgPT4gdW5rbm93blxuICAgIG9uRHJhdz86IChzZWxmOiBTZWxmKSA9PiB1bmtub3duXG4gICAgb25LZXlQcmVzc0V2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbktleVJlbGVhc2VFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25CdXR0b25QcmVzc0V2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbkJ1dHRvblJlbGVhc2VFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25SZWFsaXplPzogKHNlbGY6IFNlbGYpID0+IHVua25vd25cbiAgICBzZXR1cD86IChzZWxmOiBTZWxmKSA9PiB2b2lkXG59XG5cbmV4cG9ydCB0eXBlIEJpbmRhYmxlQ2hpbGQgPSBHdGsuV2lkZ2V0IHwgQmluZGluZzxHdGsuV2lkZ2V0PlxuXG50eXBlIEN1cnNvciA9XG4gICAgfCBcImRlZmF1bHRcIlxuICAgIHwgXCJoZWxwXCJcbiAgICB8IFwicG9pbnRlclwiXG4gICAgfCBcImNvbnRleHQtbWVudVwiXG4gICAgfCBcInByb2dyZXNzXCJcbiAgICB8IFwid2FpdFwiXG4gICAgfCBcImNlbGxcIlxuICAgIHwgXCJjcm9zc2hhaXJcIlxuICAgIHwgXCJ0ZXh0XCJcbiAgICB8IFwidmVydGljYWwtdGV4dFwiXG4gICAgfCBcImFsaWFzXCJcbiAgICB8IFwiY29weVwiXG4gICAgfCBcIm5vLWRyb3BcIlxuICAgIHwgXCJtb3ZlXCJcbiAgICB8IFwibm90LWFsbG93ZWRcIlxuICAgIHwgXCJncmFiXCJcbiAgICB8IFwiZ3JhYmJpbmdcIlxuICAgIHwgXCJhbGwtc2Nyb2xsXCJcbiAgICB8IFwiY29sLXJlc2l6ZVwiXG4gICAgfCBcInJvdy1yZXNpemVcIlxuICAgIHwgXCJuLXJlc2l6ZVwiXG4gICAgfCBcImUtcmVzaXplXCJcbiAgICB8IFwicy1yZXNpemVcIlxuICAgIHwgXCJ3LXJlc2l6ZVwiXG4gICAgfCBcIm5lLXJlc2l6ZVwiXG4gICAgfCBcIm53LXJlc2l6ZVwiXG4gICAgfCBcInN3LXJlc2l6ZVwiXG4gICAgfCBcInNlLXJlc2l6ZVwiXG4gICAgfCBcImV3LXJlc2l6ZVwiXG4gICAgfCBcIm5zLXJlc2l6ZVwiXG4gICAgfCBcIm5lc3ctcmVzaXplXCJcbiAgICB8IFwibndzZS1yZXNpemVcIlxuICAgIHwgXCJ6b29tLWluXCJcbiAgICB8IFwiem9vbS1vdXRcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcblxudHlwZSBBcmdzID0ge1xuICAgIGNtZDogc3RyaW5nIHwgc3RyaW5nW11cbiAgICBvdXQ/OiAoc3Rkb3V0OiBzdHJpbmcpID0+IHZvaWRcbiAgICBlcnI/OiAoc3RkZXJyOiBzdHJpbmcpID0+IHZvaWRcbn1cblxuZXhwb3J0IGNvbnN0IHsgUHJvY2VzcyB9ID0gQXN0YWxcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoYXJnczogQXJncyk6IEFzdGFsLlByb2Nlc3NcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoXG4gICAgY21kOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICBvbk91dD86IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZCxcbiAgICBvbkVycj86IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZCxcbik6IEFzdGFsLlByb2Nlc3NcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoXG4gICAgYXJnc09yQ21kOiBBcmdzIHwgc3RyaW5nIHwgc3RyaW5nW10sXG4gICAgb25PdXQ6IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZCA9IHByaW50LFxuICAgIG9uRXJyOiAoc3RkZXJyOiBzdHJpbmcpID0+IHZvaWQgPSBwcmludGVycixcbikge1xuICAgIGNvbnN0IGFyZ3MgPSBBcnJheS5pc0FycmF5KGFyZ3NPckNtZCkgfHwgdHlwZW9mIGFyZ3NPckNtZCA9PT0gXCJzdHJpbmdcIlxuICAgIGNvbnN0IHsgY21kLCBlcnIsIG91dCB9ID0ge1xuICAgICAgICBjbWQ6IGFyZ3MgPyBhcmdzT3JDbWQgOiBhcmdzT3JDbWQuY21kLFxuICAgICAgICBlcnI6IGFyZ3MgPyBvbkVyciA6IGFyZ3NPckNtZC5lcnIgfHwgb25FcnIsXG4gICAgICAgIG91dDogYXJncyA/IG9uT3V0IDogYXJnc09yQ21kLm91dCB8fCBvbk91dCxcbiAgICB9XG5cbiAgICBjb25zdCBwcm9jID0gQXJyYXkuaXNBcnJheShjbWQpXG4gICAgICAgID8gQXN0YWwuUHJvY2Vzcy5zdWJwcm9jZXNzdihjbWQpXG4gICAgICAgIDogQXN0YWwuUHJvY2Vzcy5zdWJwcm9jZXNzKGNtZClcblxuICAgIHByb2MuY29ubmVjdChcInN0ZG91dFwiLCAoXywgc3Rkb3V0OiBzdHJpbmcpID0+IG91dChzdGRvdXQpKVxuICAgIHByb2MuY29ubmVjdChcInN0ZGVyclwiLCAoXywgc3RkZXJyOiBzdHJpbmcpID0+IGVycihzdGRlcnIpKVxuICAgIHJldHVybiBwcm9jXG59XG5cbi8qKiBAdGhyb3dzIHtHTGliLkVycm9yfSBUaHJvd3Mgc3RkZXJyICovXG5leHBvcnQgZnVuY3Rpb24gZXhlYyhjbWQ6IHN0cmluZyB8IHN0cmluZ1tdKSB7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoY21kKVxuICAgICAgICA/IEFzdGFsLlByb2Nlc3MuZXhlY3YoY21kKVxuICAgICAgICA6IEFzdGFsLlByb2Nlc3MuZXhlYyhjbWQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjQXN5bmMoY21kOiBzdHJpbmcgfCBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY21kKSkge1xuICAgICAgICAgICAgQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jdihjbWQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEFzdGFsLlByb2Nlc3MuZXhlY19hc3luY3ZfZmluaXNoKHJlcykpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIEFzdGFsLlByb2Nlc3MuZXhlY19hc3luYyhjbWQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEFzdGFsLlByb2Nlc3MuZXhlY19maW5pc2gocmVzKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfSlcbn1cbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5pbXBvcnQgQmluZGluZywgeyB0eXBlIENvbm5lY3RhYmxlLCB0eXBlIFN1YnNjcmliYWJsZSB9IGZyb20gXCIuL2JpbmRpbmcuanNcIlxuaW1wb3J0IHsgaW50ZXJ2YWwgfSBmcm9tIFwiLi90aW1lLmpzXCJcbmltcG9ydCB7IGV4ZWNBc3luYywgc3VicHJvY2VzcyB9IGZyb20gXCIuL3Byb2Nlc3MuanNcIlxuXG5jbGFzcyBWYXJpYWJsZVdyYXBwZXI8VD4gZXh0ZW5kcyBGdW5jdGlvbiB7XG4gICAgcHJpdmF0ZSB2YXJpYWJsZSE6IEFzdGFsLlZhcmlhYmxlQmFzZVxuICAgIHByaXZhdGUgZXJySGFuZGxlcj8gPSBjb25zb2xlLmVycm9yXG5cbiAgICBwcml2YXRlIF92YWx1ZTogVFxuICAgIHByaXZhdGUgX3BvbGw/OiBBc3RhbC5UaW1lXG4gICAgcHJpdmF0ZSBfd2F0Y2g/OiBBc3RhbC5Qcm9jZXNzXG5cbiAgICBwcml2YXRlIHBvbGxJbnRlcnZhbCA9IDEwMDBcbiAgICBwcml2YXRlIHBvbGxFeGVjPzogc3RyaW5nW10gfCBzdHJpbmdcbiAgICBwcml2YXRlIHBvbGxUcmFuc2Zvcm0/OiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFRcbiAgICBwcml2YXRlIHBvbGxGbj86IChwcmV2OiBUKSA9PiBUIHwgUHJvbWlzZTxUPlxuXG4gICAgcHJpdmF0ZSB3YXRjaFRyYW5zZm9ybT86IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVFxuICAgIHByaXZhdGUgd2F0Y2hFeGVjPzogc3RyaW5nW10gfCBzdHJpbmdcblxuICAgIGNvbnN0cnVjdG9yKGluaXQ6IFQpIHtcbiAgICAgICAgc3VwZXIoKVxuICAgICAgICB0aGlzLl92YWx1ZSA9IGluaXRcbiAgICAgICAgdGhpcy52YXJpYWJsZSA9IG5ldyBBc3RhbC5WYXJpYWJsZUJhc2UoKVxuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJkcm9wcGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuc3RvcFdhdGNoKClcbiAgICAgICAgICAgIHRoaXMuc3RvcFBvbGwoKVxuICAgICAgICB9KVxuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJlcnJvclwiLCAoXywgZXJyKSA9PiB0aGlzLmVyckhhbmRsZXI/LihlcnIpKVxuICAgICAgICByZXR1cm4gbmV3IFByb3h5KHRoaXMsIHtcbiAgICAgICAgICAgIGFwcGx5OiAodGFyZ2V0LCBfLCBhcmdzKSA9PiB0YXJnZXQuX2NhbGwoYXJnc1swXSksXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY2FsbDxSID0gVD4odHJhbnNmb3JtPzogKHZhbHVlOiBUKSA9PiBSKTogQmluZGluZzxSPiB7XG4gICAgICAgIGNvbnN0IGIgPSBCaW5kaW5nLmJpbmQodGhpcylcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybSA/IGIuYXModHJhbnNmb3JtKSA6IGIgYXMgdW5rbm93biBhcyBCaW5kaW5nPFI+XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoYFZhcmlhYmxlPCR7dGhpcy5nZXQoKX0+YClcbiAgICB9XG5cbiAgICBnZXQoKTogVCB7IHJldHVybiB0aGlzLl92YWx1ZSB9XG4gICAgc2V0KHZhbHVlOiBUKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fdmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZhbHVlID0gdmFsdWVcbiAgICAgICAgICAgIHRoaXMudmFyaWFibGUuZW1pdChcImNoYW5nZWRcIilcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UG9sbCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BvbGwpXG4gICAgICAgICAgICByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5wb2xsRm4pIHtcbiAgICAgICAgICAgIHRoaXMuX3BvbGwgPSBpbnRlcnZhbCh0aGlzLnBvbGxJbnRlcnZhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSB0aGlzLnBvbGxGbiEodGhpcy5nZXQoKSlcbiAgICAgICAgICAgICAgICBpZiAodiBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdi50aGVuKHYgPT4gdGhpcy5zZXQodikpXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVycikpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldCh2KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5wb2xsRXhlYykge1xuICAgICAgICAgICAgdGhpcy5fcG9sbCA9IGludGVydmFsKHRoaXMucG9sbEludGVydmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgZXhlY0FzeW5jKHRoaXMucG9sbEV4ZWMhKVxuICAgICAgICAgICAgICAgICAgICAudGhlbih2ID0+IHRoaXMuc2V0KHRoaXMucG9sbFRyYW5zZm9ybSEodiwgdGhpcy5nZXQoKSkpKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVycikpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRXYXRjaCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3dhdGNoKVxuICAgICAgICAgICAgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5fd2F0Y2ggPSBzdWJwcm9jZXNzKHtcbiAgICAgICAgICAgIGNtZDogdGhpcy53YXRjaEV4ZWMhLFxuICAgICAgICAgICAgb3V0OiBvdXQgPT4gdGhpcy5zZXQodGhpcy53YXRjaFRyYW5zZm9ybSEob3V0LCB0aGlzLmdldCgpKSksXG4gICAgICAgICAgICBlcnI6IGVyciA9PiB0aGlzLnZhcmlhYmxlLmVtaXQoXCJlcnJvclwiLCBlcnIpLFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHN0b3BQb2xsKCkge1xuICAgICAgICB0aGlzLl9wb2xsPy5jYW5jZWwoKVxuICAgICAgICBkZWxldGUgdGhpcy5fcG9sbFxuICAgIH1cblxuICAgIHN0b3BXYXRjaCgpIHtcbiAgICAgICAgdGhpcy5fd2F0Y2g/LmtpbGwoKVxuICAgICAgICBkZWxldGUgdGhpcy5fd2F0Y2hcbiAgICB9XG5cbiAgICBpc1BvbGxpbmcoKSB7IHJldHVybiAhIXRoaXMuX3BvbGwgfVxuICAgIGlzV2F0Y2hpbmcoKSB7IHJldHVybiAhIXRoaXMuX3dhdGNoIH1cblxuICAgIGRyb3AoKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGUuZW1pdChcImRyb3BwZWRcIilcbiAgICB9XG5cbiAgICBvbkRyb3BwZWQoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZHJvcHBlZFwiLCBjYWxsYmFjaylcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIG9uRXJyb3IoY2FsbGJhY2s6IChlcnI6IHN0cmluZykgPT4gdm9pZCkge1xuICAgICAgICBkZWxldGUgdGhpcy5lcnJIYW5kbGVyXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImVycm9yXCIsIChfLCBlcnIpID0+IGNhbGxiYWNrKGVycikpXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVCkgPT4gdm9pZCkge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMudmFyaWFibGUuY29ubmVjdChcImNoYW5nZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuICgpID0+IHRoaXMudmFyaWFibGUuZGlzY29ubmVjdChpZClcbiAgICB9XG5cbiAgICBwb2xsKFxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyLFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICAgICAgdHJhbnNmb3JtPzogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUXG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIHBvbGwoXG4gICAgICAgIGludGVydmFsOiBudW1iZXIsXG4gICAgICAgIGNhbGxiYWNrOiAocHJldjogVCkgPT4gVCB8IFByb21pc2U8VD5cbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgcG9sbChcbiAgICAgICAgaW50ZXJ2YWw6IG51bWJlcixcbiAgICAgICAgZXhlYzogc3RyaW5nIHwgc3RyaW5nW10gfCAoKHByZXY6IFQpID0+IFQgfCBQcm9taXNlPFQ+KSxcbiAgICAgICAgdHJhbnNmb3JtOiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFQgPSBvdXQgPT4gb3V0IGFzIFQsXG4gICAgKSB7XG4gICAgICAgIHRoaXMuc3RvcFBvbGwoKVxuICAgICAgICB0aGlzLnBvbGxJbnRlcnZhbCA9IGludGVydmFsXG4gICAgICAgIHRoaXMucG9sbFRyYW5zZm9ybSA9IHRyYW5zZm9ybVxuICAgICAgICBpZiAodHlwZW9mIGV4ZWMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgdGhpcy5wb2xsRm4gPSBleGVjXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5wb2xsRXhlY1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb2xsRXhlYyA9IGV4ZWNcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnBvbGxGblxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RhcnRQb2xsKClcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHdhdGNoKFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICAgICAgdHJhbnNmb3JtOiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFQgPSBvdXQgPT4gb3V0IGFzIFQsXG4gICAgKSB7XG4gICAgICAgIHRoaXMuc3RvcFdhdGNoKClcbiAgICAgICAgdGhpcy53YXRjaEV4ZWMgPSBleGVjXG4gICAgICAgIHRoaXMud2F0Y2hUcmFuc2Zvcm0gPSB0cmFuc2Zvcm1cbiAgICAgICAgdGhpcy5zdGFydFdhdGNoKClcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIG9ic2VydmUoXG4gICAgICAgIG9ianM6IEFycmF5PFtvYmo6IENvbm5lY3RhYmxlLCBzaWduYWw6IHN0cmluZ10+LFxuICAgICAgICBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBvYnNlcnZlKFxuICAgICAgICBvYmo6IENvbm5lY3RhYmxlLFxuICAgICAgICBzaWduYWw6IHN0cmluZyxcbiAgICAgICAgY2FsbGJhY2s6ICguLi5hcmdzOiBhbnlbXSkgPT4gVCxcbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgb2JzZXJ2ZShcbiAgICAgICAgb2JqczogQ29ubmVjdGFibGUgfCBBcnJheTxbb2JqOiBDb25uZWN0YWJsZSwgc2lnbmFsOiBzdHJpbmddPixcbiAgICAgICAgc2lnT3JGbjogc3RyaW5nIHwgKChvYmo6IENvbm5lY3RhYmxlLCAuLi5hcmdzOiBhbnlbXSkgPT4gVCksXG4gICAgICAgIGNhbGxiYWNrPzogKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICkge1xuICAgICAgICBjb25zdCBmID0gdHlwZW9mIHNpZ09yRm4gPT09IFwiZnVuY3Rpb25cIiA/IHNpZ09yRm4gOiBjYWxsYmFjayA/PyAoKCkgPT4gdGhpcy5nZXQoKSlcbiAgICAgICAgY29uc3Qgc2V0ID0gKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiB0aGlzLnNldChmKG9iaiwgLi4uYXJncykpXG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob2JqcykpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgb2JqIG9mIG9ianMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbbywgc10gPSBvYmpcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IG8uY29ubmVjdChzLCBzZXQpXG4gICAgICAgICAgICAgICAgdGhpcy5vbkRyb3BwZWQoKCkgPT4gby5kaXNjb25uZWN0KGlkKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2lnT3JGbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gb2Jqcy5jb25uZWN0KHNpZ09yRm4sIHNldClcbiAgICAgICAgICAgICAgICB0aGlzLm9uRHJvcHBlZCgoKSA9PiBvYmpzLmRpc2Nvbm5lY3QoaWQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHN0YXRpYyBkZXJpdmU8XG4gICAgICAgIGNvbnN0IERlcHMgZXh0ZW5kcyBBcnJheTxTdWJzY3JpYmFibGU8YW55Pj4sXG4gICAgICAgIEFyZ3MgZXh0ZW5kcyB7XG4gICAgICAgICAgICBbSyBpbiBrZXlvZiBEZXBzXTogRGVwc1tLXSBleHRlbmRzIFN1YnNjcmliYWJsZTxpbmZlciBUPiA/IFQgOiBuZXZlclxuICAgICAgICB9LFxuICAgICAgICBWID0gQXJncyxcbiAgICA+KGRlcHM6IERlcHMsIGZuOiAoLi4uYXJnczogQXJncykgPT4gViA9ICguLi5hcmdzKSA9PiBhcmdzIGFzIHVua25vd24gYXMgVikge1xuICAgICAgICBjb25zdCB1cGRhdGUgPSAoKSA9PiBmbiguLi5kZXBzLm1hcChkID0+IGQuZ2V0KCkpIGFzIEFyZ3MpXG4gICAgICAgIGNvbnN0IGRlcml2ZWQgPSBuZXcgVmFyaWFibGUodXBkYXRlKCkpXG4gICAgICAgIGNvbnN0IHVuc3VicyA9IGRlcHMubWFwKGRlcCA9PiBkZXAuc3Vic2NyaWJlKCgpID0+IGRlcml2ZWQuc2V0KHVwZGF0ZSgpKSkpXG4gICAgICAgIGRlcml2ZWQub25Ecm9wcGVkKCgpID0+IHVuc3Vicy5tYXAodW5zdWIgPT4gdW5zdWIoKSkpXG4gICAgICAgIHJldHVybiBkZXJpdmVkXG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhcmlhYmxlPFQ+IGV4dGVuZHMgT21pdDxWYXJpYWJsZVdyYXBwZXI8VD4sIFwiYmluZFwiPiB7XG4gICAgPFI+KHRyYW5zZm9ybTogKHZhbHVlOiBUKSA9PiBSKTogQmluZGluZzxSPlxuICAgICgpOiBCaW5kaW5nPFQ+XG59XG5cbmV4cG9ydCBjb25zdCBWYXJpYWJsZSA9IG5ldyBQcm94eShWYXJpYWJsZVdyYXBwZXIgYXMgYW55LCB7XG4gICAgYXBwbHk6IChfdCwgX2EsIGFyZ3MpID0+IG5ldyBWYXJpYWJsZVdyYXBwZXIoYXJnc1swXSksXG59KSBhcyB7XG4gICAgZGVyaXZlOiB0eXBlb2YgVmFyaWFibGVXcmFwcGVyW1wiZGVyaXZlXCJdXG4gICAgPFQ+KGluaXQ6IFQpOiBWYXJpYWJsZTxUPlxuICAgIG5ldzxUPihpbml0OiBUKTogVmFyaWFibGU8VD5cbn1cblxuZXhwb3J0IGRlZmF1bHQgVmFyaWFibGVcbiIsICJleHBvcnQgY29uc3Qgc25ha2VpZnkgPSAoc3RyOiBzdHJpbmcpID0+IHN0clxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCBcIiQxXyQyXCIpXG4gICAgLnJlcGxhY2VBbGwoXCItXCIsIFwiX1wiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG5cbmV4cG9ydCBjb25zdCBrZWJhYmlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDEtJDJcIilcbiAgICAucmVwbGFjZUFsbChcIl9cIiwgXCItXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpYmFibGU8VCA9IHVua25vd24+IHtcbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVCkgPT4gdm9pZCk6ICgpID0+IHZvaWRcbiAgICBnZXQoKTogVFxuICAgIFtrZXk6IHN0cmluZ106IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbm5lY3RhYmxlIHtcbiAgICBjb25uZWN0KHNpZ25hbDogc3RyaW5nLCBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiB1bmtub3duKTogbnVtYmVyXG4gICAgZGlzY29ubmVjdChpZDogbnVtYmVyKTogdm9pZFxuICAgIFtrZXk6IHN0cmluZ106IGFueVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCaW5kaW5nPFZhbHVlPiB7XG4gICAgcHJpdmF0ZSB0cmFuc2Zvcm1GbiA9ICh2OiBhbnkpID0+IHZcblxuICAgICNlbWl0dGVyOiBTdWJzY3JpYmFibGU8VmFsdWU+IHwgQ29ubmVjdGFibGVcbiAgICAjcHJvcD86IHN0cmluZ1xuXG4gICAgc3RhdGljIGJpbmQ8XG4gICAgICAgIFQgZXh0ZW5kcyBDb25uZWN0YWJsZSxcbiAgICAgICAgUCBleHRlbmRzIGtleW9mIFQsXG4gICAgPihvYmplY3Q6IFQsIHByb3BlcnR5OiBQKTogQmluZGluZzxUW1BdPlxuXG4gICAgc3RhdGljIGJpbmQ8VD4ob2JqZWN0OiBTdWJzY3JpYmFibGU8VD4pOiBCaW5kaW5nPFQ+XG5cbiAgICBzdGF0aWMgYmluZChlbWl0dGVyOiBDb25uZWN0YWJsZSB8IFN1YnNjcmliYWJsZSwgcHJvcD86IHN0cmluZykge1xuICAgICAgICByZXR1cm4gbmV3IEJpbmRpbmcoZW1pdHRlciwgcHJvcClcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnN0cnVjdG9yKGVtaXR0ZXI6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlPFZhbHVlPiwgcHJvcD86IHN0cmluZykge1xuICAgICAgICB0aGlzLiNlbWl0dGVyID0gZW1pdHRlclxuICAgICAgICB0aGlzLiNwcm9wID0gcHJvcCAmJiBrZWJhYmlmeShwcm9wKVxuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gYEJpbmRpbmc8JHt0aGlzLiNlbWl0dGVyfSR7dGhpcy4jcHJvcCA/IGAsIFwiJHt0aGlzLiNwcm9wfVwiYCA6IFwiXCJ9PmBcbiAgICB9XG5cbiAgICBhczxUPihmbjogKHY6IFZhbHVlKSA9PiBUKTogQmluZGluZzxUPiB7XG4gICAgICAgIGNvbnN0IGJpbmQgPSBuZXcgQmluZGluZyh0aGlzLiNlbWl0dGVyLCB0aGlzLiNwcm9wKVxuICAgICAgICBiaW5kLnRyYW5zZm9ybUZuID0gKHY6IFZhbHVlKSA9PiBmbih0aGlzLnRyYW5zZm9ybUZuKHYpKVxuICAgICAgICByZXR1cm4gYmluZCBhcyB1bmtub3duIGFzIEJpbmRpbmc8VD5cbiAgICB9XG5cbiAgICBnZXQoKTogVmFsdWUge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuZ2V0ID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Gbih0aGlzLiNlbWl0dGVyLmdldCgpKVxuXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy4jcHJvcCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29uc3QgZ2V0dGVyID0gYGdldF8ke3NuYWtlaWZ5KHRoaXMuI3Byb3ApfWBcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlcltnZXR0ZXJdID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtRm4odGhpcy4jZW1pdHRlcltnZXR0ZXJdKCkpXG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybUZuKHRoaXMuI2VtaXR0ZXJbdGhpcy4jcHJvcF0pXG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBFcnJvcihcImNhbiBub3QgZ2V0IHZhbHVlIG9mIGJpbmRpbmdcIilcbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVmFsdWUpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyLnN1YnNjcmliZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4jZW1pdHRlci5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMuZ2V0KCkpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyLmNvbm5lY3QgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc3Qgc2lnbmFsID0gYG5vdGlmeTo6JHt0aGlzLiNwcm9wfWBcbiAgICAgICAgICAgIGNvbnN0IGlkID0gdGhpcy4jZW1pdHRlci5jb25uZWN0KHNpZ25hbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMuZ2V0KCkpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgICAgICAgICAodGhpcy4jZW1pdHRlci5kaXNjb25uZWN0IGFzIENvbm5lY3RhYmxlW1wiZGlzY29ubmVjdFwiXSkoaWQpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgRXJyb3IoYCR7dGhpcy4jZW1pdHRlcn0gaXMgbm90IGJpbmRhYmxlYClcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCB7IGJpbmQgfSA9IEJpbmRpbmdcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5cbmV4cG9ydCBjb25zdCB7IFRpbWUgfSA9IEFzdGFsXG5cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcnZhbChpbnRlcnZhbDogbnVtYmVyLCBjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS5pbnRlcnZhbChpbnRlcnZhbCwgKCkgPT4gdm9pZCBjYWxsYmFjaz8uKCkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0aW1lb3V0KHRpbWVvdXQ6IG51bWJlciwgY2FsbGJhY2s/OiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIEFzdGFsLlRpbWUudGltZW91dCh0aW1lb3V0LCAoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlkbGUoY2FsbGJhY2s/OiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIEFzdGFsLlRpbWUuaWRsZSgoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cbiIsICJpbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IHsgbWtBcHAgfSBmcm9tIFwiLi4vX2FwcFwiXG5cbkd0ay5pbml0KG51bGwpXG5cbmV4cG9ydCBkZWZhdWx0IG1rQXBwKEFzdGFsLkFwcGxpY2F0aW9uKVxuIiwgIi8qKlxuICogV29ya2Fyb3VuZCBmb3IgXCJDYW4ndCBjb252ZXJ0IG5vbi1udWxsIHBvaW50ZXIgdG8gSlMgdmFsdWUgXCJcbiAqL1xuXG5leHBvcnQgeyB9XG5cbmNvbnN0IHNuYWtlaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMV8kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiLVwiLCBcIl9cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG5hc3luYyBmdW5jdGlvbiBzdXBwcmVzczxUPihtb2Q6IFByb21pc2U8eyBkZWZhdWx0OiBUIH0+LCBwYXRjaDogKG06IFQpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gbW9kLnRoZW4obSA9PiBwYXRjaChtLmRlZmF1bHQpKS5jYXRjaCgoKSA9PiB2b2lkIDApXG59XG5cbmZ1bmN0aW9uIHBhdGNoPFAgZXh0ZW5kcyBvYmplY3Q+KHByb3RvOiBQLCBwcm9wOiBFeHRyYWN0PGtleW9mIFAsIHN0cmluZz4pIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocHJvdG8sIHByb3AsIHtcbiAgICAgICAgZ2V0KCkgeyByZXR1cm4gdGhpc1tgZ2V0XyR7c25ha2VpZnkocHJvcCl9YF0oKSB9LFxuICAgIH0pXG59XG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxBcHBzXCIpLCAoeyBBcHBzLCBBcHBsaWNhdGlvbiB9KSA9PiB7XG4gICAgcGF0Y2goQXBwcy5wcm90b3R5cGUsIFwibGlzdFwiKVxuICAgIHBhdGNoKEFwcGxpY2F0aW9uLnByb3RvdHlwZSwgXCJrZXl3b3Jkc1wiKVxuICAgIHBhdGNoKEFwcGxpY2F0aW9uLnByb3RvdHlwZSwgXCJjYXRlZ29yaWVzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsQmF0dGVyeVwiKSwgKHsgVVBvd2VyIH0pID0+IHtcbiAgICBwYXRjaChVUG93ZXIucHJvdG90eXBlLCBcImRldmljZXNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxCbHVldG9vdGhcIiksICh7IEFkYXB0ZXIsIEJsdWV0b290aCwgRGV2aWNlIH0pID0+IHtcbiAgICBwYXRjaChBZGFwdGVyLnByb3RvdHlwZSwgXCJ1dWlkc1wiKVxuICAgIHBhdGNoKEJsdWV0b290aC5wcm90b3R5cGUsIFwiYWRhcHRlcnNcIilcbiAgICBwYXRjaChCbHVldG9vdGgucHJvdG90eXBlLCBcImRldmljZXNcIilcbiAgICBwYXRjaChEZXZpY2UucHJvdG90eXBlLCBcInV1aWRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsSHlwcmxhbmRcIiksICh7IEh5cHJsYW5kLCBNb25pdG9yLCBXb3Jrc3BhY2UgfSkgPT4ge1xuICAgIHBhdGNoKEh5cHJsYW5kLnByb3RvdHlwZSwgXCJtb25pdG9yc1wiKVxuICAgIHBhdGNoKEh5cHJsYW5kLnByb3RvdHlwZSwgXCJ3b3Jrc3BhY2VzXCIpXG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcImNsaWVudHNcIilcbiAgICBwYXRjaChNb25pdG9yLnByb3RvdHlwZSwgXCJhdmFpbGFibGVNb2Rlc1wiKVxuICAgIHBhdGNoKE1vbml0b3IucHJvdG90eXBlLCBcImF2YWlsYWJsZV9tb2Rlc1wiKVxuICAgIHBhdGNoKFdvcmtzcGFjZS5wcm90b3R5cGUsIFwiY2xpZW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE1wcmlzXCIpLCAoeyBNcHJpcywgUGxheWVyIH0pID0+IHtcbiAgICBwYXRjaChNcHJpcy5wcm90b3R5cGUsIFwicGxheWVyc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkX3VyaV9zY2hlbWFzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRVcmlTY2hlbWFzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRfbWltZV90eXBlc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkTWltZVR5cGVzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJjb21tZW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE5ldHdvcmtcIiksICh7IFdpZmkgfSkgPT4ge1xuICAgIHBhdGNoKFdpZmkucHJvdG90eXBlLCBcImFjY2Vzc19wb2ludHNcIilcbiAgICBwYXRjaChXaWZpLnByb3RvdHlwZSwgXCJhY2Nlc3NQb2ludHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxOb3RpZmRcIiksICh7IE5vdGlmZCwgTm90aWZpY2F0aW9uIH0pID0+IHtcbiAgICBwYXRjaChOb3RpZmQucHJvdG90eXBlLCBcIm5vdGlmaWNhdGlvbnNcIilcbiAgICBwYXRjaChOb3RpZmljYXRpb24ucHJvdG90eXBlLCBcImFjdGlvbnNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxQb3dlclByb2ZpbGVzXCIpLCAoeyBQb3dlclByb2ZpbGVzIH0pID0+IHtcbiAgICBwYXRjaChQb3dlclByb2ZpbGVzLnByb3RvdHlwZSwgXCJhY3Rpb25zXCIpXG59KVxuIiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmltcG9ydCB7IHNldENvbnNvbGVMb2dEb21haW4gfSBmcm9tIFwiY29uc29sZVwiXG5pbXBvcnQgeyBleGl0LCBwcm9ncmFtQXJncyB9IGZyb20gXCJzeXN0ZW1cIlxuaW1wb3J0IElPIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgR2lvIGZyb20gXCJnaTovL0dpbz92ZXJzaW9uPTIuMFwiXG5pbXBvcnQgdHlwZSBBc3RhbDMgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IHR5cGUgQXN0YWw0IGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249NC4wXCJcblxudHlwZSBDb25maWcgPSBQYXJ0aWFsPHtcbiAgICBpbnN0YW5jZU5hbWU6IHN0cmluZ1xuICAgIGNzczogc3RyaW5nXG4gICAgaWNvbnM6IHN0cmluZ1xuICAgIGd0a1RoZW1lOiBzdHJpbmdcbiAgICBpY29uVGhlbWU6IHN0cmluZ1xuICAgIGN1cnNvclRoZW1lOiBzdHJpbmdcbiAgICBob2xkOiBib29sZWFuXG4gICAgcmVxdWVzdEhhbmRsZXIocmVxdWVzdDogc3RyaW5nLCByZXM6IChyZXNwb25zZTogYW55KSA9PiB2b2lkKTogdm9pZFxuICAgIG1haW4oLi4uYXJnczogc3RyaW5nW10pOiB2b2lkXG4gICAgY2xpZW50KG1lc3NhZ2U6IChtc2c6IHN0cmluZykgPT4gc3RyaW5nLCAuLi5hcmdzOiBzdHJpbmdbXSk6IHZvaWRcbn0+XG5cbmludGVyZmFjZSBBc3RhbDNKUyBleHRlbmRzIEFzdGFsMy5BcHBsaWNhdGlvbiB7XG4gICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT5cbiAgICByZXF1ZXN0SGFuZGxlcjogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cbiAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQ/OiBib29sZWFuKTogdm9pZFxuICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWRcbiAgICBzdGFydChjb25maWc/OiBDb25maWcpOiB2b2lkXG59XG5cbmludGVyZmFjZSBBc3RhbDRKUyBleHRlbmRzIEFzdGFsNC5BcHBsaWNhdGlvbiB7XG4gICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT5cbiAgICByZXF1ZXN0SGFuZGxlcj86IENvbmZpZ1tcInJlcXVlc3RIYW5kbGVyXCJdXG4gICAgYXBwbHlfY3NzKHN0eWxlOiBzdHJpbmcsIHJlc2V0PzogYm9vbGVhbik6IHZvaWRcbiAgICBxdWl0KGNvZGU/OiBudW1iZXIpOiB2b2lkXG4gICAgc3RhcnQoY29uZmlnPzogQ29uZmlnKTogdm9pZFxufVxuXG50eXBlIEFwcDMgPSB0eXBlb2YgQXN0YWwzLkFwcGxpY2F0aW9uXG50eXBlIEFwcDQgPSB0eXBlb2YgQXN0YWw0LkFwcGxpY2F0aW9uXG5cbmV4cG9ydCBmdW5jdGlvbiBta0FwcDxBcHAgZXh0ZW5kcyBBcHAzPihBcHA6IEFwcCk6IEFzdGFsM0pTXG5leHBvcnQgZnVuY3Rpb24gbWtBcHA8QXBwIGV4dGVuZHMgQXBwND4oQXBwOiBBcHApOiBBc3RhbDRKU1xuXG5leHBvcnQgZnVuY3Rpb24gbWtBcHAoQXBwOiBBcHAzIHwgQXBwNCkge1xuICAgIHJldHVybiBuZXcgKGNsYXNzIEFzdGFsSlMgZXh0ZW5kcyBBcHAge1xuICAgICAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQXN0YWxKU1wiIH0sIHRoaXMgYXMgYW55KSB9XG5cbiAgICAgICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZuID0gRnVuY3Rpb24oYHJldHVybiAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAke2JvZHkuaW5jbHVkZXMoXCI7XCIpID8gYm9keSA6IGByZXR1cm4gJHtib2R5fTtgfVxuICAgICAgICAgICAgICAgICAgICB9KWApXG4gICAgICAgICAgICAgICAgICAgIGZuKCkoKS50aGVuKHJlcykuY2F0Y2gocmVqKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqKGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICByZXF1ZXN0SGFuZGxlcj86IENvbmZpZ1tcInJlcXVlc3RIYW5kbGVyXCJdXG5cbiAgICAgICAgdmZ1bmNfcmVxdWVzdChtc2c6IHN0cmluZywgY29ubjogR2lvLlNvY2tldENvbm5lY3Rpb24pOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXF1ZXN0SGFuZGxlciA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXF1ZXN0SGFuZGxlcihtc2csIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBJTy53cml0ZV9zb2NrKGNvbm4sIFN0cmluZyhyZXNwb25zZSksIChfLCByZXMpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBJTy53cml0ZV9zb2NrX2ZpbmlzaChyZXMpLFxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHN1cGVyLnZmdW5jX3JlcXVlc3QobXNnLCBjb25uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYXBwbHlfY3NzKHN0eWxlOiBzdHJpbmcsIHJlc2V0ID0gZmFsc2UpIHtcbiAgICAgICAgICAgIHN1cGVyLmFwcGx5X2NzcyhzdHlsZSwgcmVzZXQpXG4gICAgICAgIH1cblxuICAgICAgICBxdWl0KGNvZGU/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLnF1aXQoKVxuICAgICAgICAgICAgZXhpdChjb2RlID8/IDApXG4gICAgICAgIH1cblxuICAgICAgICBzdGFydCh7IHJlcXVlc3RIYW5kbGVyLCBjc3MsIGhvbGQsIG1haW4sIGNsaWVudCwgaWNvbnMsIC4uLmNmZyB9OiBDb25maWcgPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgYXBwID0gdGhpcyBhcyB1bmtub3duIGFzIEluc3RhbmNlVHlwZTxBcHAzIHwgQXBwND5cblxuICAgICAgICAgICAgY2xpZW50ID8/PSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJpbnQoYEFzdGFsIGluc3RhbmNlIFwiJHthcHAuaW5zdGFuY2VOYW1lfVwiIGFscmVhZHkgcnVubmluZ2ApXG4gICAgICAgICAgICAgICAgZXhpdCgxKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNmZylcbiAgICAgICAgICAgIHNldENvbnNvbGVMb2dEb21haW4oYXBwLmluc3RhbmNlTmFtZSlcblxuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0SGFuZGxlciA9IHJlcXVlc3RIYW5kbGVyXG4gICAgICAgICAgICBhcHAuY29ubmVjdChcImFjdGl2YXRlXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBtYWluPy4oLi4ucHJvZ3JhbUFyZ3MpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGFwcC5hY3F1aXJlX3NvY2tldCgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2xpZW50KG1zZyA9PiBJTy5zZW5kX21lc3NhZ2UoYXBwLmluc3RhbmNlTmFtZSwgbXNnKSEsIC4uLnByb2dyYW1BcmdzKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3NzKVxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlfY3NzKGNzcywgZmFsc2UpXG5cbiAgICAgICAgICAgIGlmIChpY29ucylcbiAgICAgICAgICAgICAgICBhcHAuYWRkX2ljb25zKGljb25zKVxuXG4gICAgICAgICAgICBob2xkID8/PSB0cnVlXG4gICAgICAgICAgICBpZiAoaG9sZClcbiAgICAgICAgICAgICAgICBhcHAuaG9sZCgpXG5cbiAgICAgICAgICAgIGFwcC5ydW5Bc3luYyhbXSlcbiAgICAgICAgfVxuICAgIH0pXG59XG4iLCAiLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xuaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuaW1wb3J0IGFzdGFsaWZ5LCB7IHR5cGUgQ29uc3RydWN0UHJvcHMsIHR5cGUgQmluZGFibGVDaGlsZCB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcblxuLy8gQm94XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQXN0YWwuQm94LnByb3RvdHlwZSwgXCJjaGlsZHJlblwiLCB7XG4gICAgZ2V0KCkgeyByZXR1cm4gdGhpcy5nZXRfY2hpbGRyZW4oKSB9LFxuICAgIHNldCh2KSB7IHRoaXMuc2V0X2NoaWxkcmVuKHYpIH0sXG59KVxuXG5leHBvcnQgdHlwZSBCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPEJveCwgQXN0YWwuQm94LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgQm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkJveFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEJveFByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQnV0dG9uXG5leHBvcnQgdHlwZSBCdXR0b25Qcm9wcyA9IENvbnN0cnVjdFByb3BzPEJ1dHRvbiwgQXN0YWwuQnV0dG9uLkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkNsaWNrZWQ6IFtdXG4gICAgb25DbGljazogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uQ2xpY2tSZWxlYXNlOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25Ib3ZlcjogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uSG92ZXJMb3N0OiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25TY3JvbGw6IFtldmVudDogQXN0YWwuU2Nyb2xsRXZlbnRdXG59PlxuZXhwb3J0IGNsYXNzIEJ1dHRvbiBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkJ1dHRvbikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJCdXR0b25cIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBCdXR0b25Qcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIENlbnRlckJveFxuZXhwb3J0IHR5cGUgQ2VudGVyQm94UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxDZW50ZXJCb3gsIEFzdGFsLkNlbnRlckJveC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIENlbnRlckJveCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkNlbnRlckJveCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJDZW50ZXJCb3hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBDZW50ZXJCb3hQcm9wcywgLi4uY2hpbGRyZW46IEFycmF5PEJpbmRhYmxlQ2hpbGQ+KSB7IHN1cGVyKHsgY2hpbGRyZW4sIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIENpcmN1bGFyUHJvZ3Jlc3NcbmV4cG9ydCB0eXBlIENpcmN1bGFyUHJvZ3Jlc3NQcm9wcyA9IENvbnN0cnVjdFByb3BzPENpcmN1bGFyUHJvZ3Jlc3MsIEFzdGFsLkNpcmN1bGFyUHJvZ3Jlc3MuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBDaXJjdWxhclByb2dyZXNzIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQ2lyY3VsYXJQcm9ncmVzcykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJDaXJjdWxhclByb2dyZXNzXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQ2lyY3VsYXJQcm9ncmVzc1Byb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gRHJhd2luZ0FyZWFcbmV4cG9ydCB0eXBlIERyYXdpbmdBcmVhUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxEcmF3aW5nQXJlYSwgR3RrLkRyYXdpbmdBcmVhLkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkRyYXc6IFtjcjogYW55XSAvLyBUT0RPOiBjYWlybyB0eXBlc1xufT5cbmV4cG9ydCBjbGFzcyBEcmF3aW5nQXJlYSBleHRlbmRzIGFzdGFsaWZ5KEd0ay5EcmF3aW5nQXJlYSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJEcmF3aW5nQXJlYVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IERyYXdpbmdBcmVhUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIEVudHJ5XG5leHBvcnQgdHlwZSBFbnRyeVByb3BzID0gQ29uc3RydWN0UHJvcHM8RW50cnksIEd0ay5FbnRyeS5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25DaGFuZ2VkOiBbXVxuICAgIG9uQWN0aXZhdGU6IFtdXG59PlxuZXhwb3J0IGNsYXNzIEVudHJ5IGV4dGVuZHMgYXN0YWxpZnkoR3RrLkVudHJ5KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkVudHJ5XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRW50cnlQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gRXZlbnRCb3hcbmV4cG9ydCB0eXBlIEV2ZW50Qm94UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxFdmVudEJveCwgQXN0YWwuRXZlbnRCb3guQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uQ2xpY2s6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkNsaWNrUmVsZWFzZTogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uSG92ZXI6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvbkhvdmVyTG9zdDogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uU2Nyb2xsOiBbZXZlbnQ6IEFzdGFsLlNjcm9sbEV2ZW50XVxufT5cbmV4cG9ydCBjbGFzcyBFdmVudEJveCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkV2ZW50Qm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkV2ZW50Qm94XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRXZlbnRCb3hQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIC8vIFRPRE86IEZpeGVkXG4vLyAvLyBUT0RPOiBGbG93Qm94XG4vL1xuLy8gSWNvblxuZXhwb3J0IHR5cGUgSWNvblByb3BzID0gQ29uc3RydWN0UHJvcHM8SWNvbiwgQXN0YWwuSWNvbi5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIEljb24gZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5JY29uKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkljb25cIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBJY29uUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIExhYmVsXG5leHBvcnQgdHlwZSBMYWJlbFByb3BzID0gQ29uc3RydWN0UHJvcHM8TGFiZWwsIEFzdGFsLkxhYmVsLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgTGFiZWwgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5MYWJlbCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJMYWJlbFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IExhYmVsUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIExldmVsQmFyXG5leHBvcnQgdHlwZSBMZXZlbEJhclByb3BzID0gQ29uc3RydWN0UHJvcHM8TGV2ZWxCYXIsIEFzdGFsLkxldmVsQmFyLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgTGV2ZWxCYXIgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5MZXZlbEJhcikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJMZXZlbEJhclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IExldmVsQmFyUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFRPRE86IExpc3RCb3hcblxuLy8gT3ZlcmxheVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEFzdGFsLk92ZXJsYXkucHJvdG90eXBlLCBcIm92ZXJsYXlzXCIsIHtcbiAgICBnZXQoKSB7IHJldHVybiB0aGlzLmdldF9vdmVybGF5cygpIH0sXG4gICAgc2V0KHYpIHsgdGhpcy5zZXRfb3ZlcmxheXModikgfSxcbn0pXG5cbmV4cG9ydCB0eXBlIE92ZXJsYXlQcm9wcyA9IENvbnN0cnVjdFByb3BzPE92ZXJsYXksIEFzdGFsLk92ZXJsYXkuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBPdmVybGF5IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuT3ZlcmxheSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJPdmVybGF5XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogT3ZlcmxheVByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gUmV2ZWFsZXJcbmV4cG9ydCB0eXBlIFJldmVhbGVyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxSZXZlYWxlciwgR3RrLlJldmVhbGVyLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgUmV2ZWFsZXIgZXh0ZW5kcyBhc3RhbGlmeShHdGsuUmV2ZWFsZXIpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiUmV2ZWFsZXJcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBSZXZlYWxlclByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gU2Nyb2xsYWJsZVxuZXhwb3J0IHR5cGUgU2Nyb2xsYWJsZVByb3BzID0gQ29uc3RydWN0UHJvcHM8U2Nyb2xsYWJsZSwgQXN0YWwuU2Nyb2xsYWJsZS5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFNjcm9sbGFibGUgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TY3JvbGxhYmxlKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlNjcm9sbGFibGVcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTY3JvbGxhYmxlUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTbGlkZXJcbmV4cG9ydCB0eXBlIFNsaWRlclByb3BzID0gQ29uc3RydWN0UHJvcHM8U2xpZGVyLCBBc3RhbC5TbGlkZXIuQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uRHJhZ2dlZDogW11cbn0+XG5leHBvcnQgY2xhc3MgU2xpZGVyIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuU2xpZGVyKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlNsaWRlclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFNsaWRlclByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBTdGFja1xuZXhwb3J0IHR5cGUgU3RhY2tQcm9wcyA9IENvbnN0cnVjdFByb3BzPFN0YWNrLCBBc3RhbC5TdGFjay5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFN0YWNrIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuU3RhY2spIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU3RhY2tcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTdGFja1Byb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gU3dpdGNoXG5leHBvcnQgdHlwZSBTd2l0Y2hQcm9wcyA9IENvbnN0cnVjdFByb3BzPFN3aXRjaCwgR3RrLlN3aXRjaC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFN3aXRjaCBleHRlbmRzIGFzdGFsaWZ5KEd0ay5Td2l0Y2gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU3dpdGNoXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU3dpdGNoUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFdpbmRvd1xuZXhwb3J0IHR5cGUgV2luZG93UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxXaW5kb3csIEFzdGFsLldpbmRvdy5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFdpbmRvdyBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLldpbmRvdykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJXaW5kb3dcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBXaW5kb3dQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG4iLCAiKiB7XG4gIGNvbG9yOiAjZjFmMWYxO1xuICBmb250LXNpemU6IDE2cHg7XG59XG5cbi5CYXIge1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xufVxuLkJhciBpY29uIHtcbiAgZm9udC1zaXplOiAyMHB4O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbn1cbi5CYXIgLmljb24ge1xuICBmb250LXNpemU6IDI0cHg7XG4gIG1hcmdpbi1yaWdodDogNXB4O1xuICAvKiBtYXJnaW4tYm90dG9tOiAycHg7ICovXG59XG4uQmFyIC5zdGF0dXMge1xuICBtYXJnaW46IDAgOHB4O1xufVxuXG4uYmF0dGVyeS5jaGFyZ2luZyB7XG4gIC8qIGxhYmVsIHtcbiAgICBjb2xvcjogJGFjY2VudDtcbiAgfSAqL1xufVxuLmJhdHRlcnkuY2hhcmdpbmcgLmljb24ge1xuICBjb2xvcjogIzM3OERGNztcbiAgbWFyZ2luLXJpZ2h0OiAxMHB4O1xufVxuXG5idXR0b24ge1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgYm9yZGVyOiBub25lO1xuICBwYWRkaW5nOiAwO1xuICBib3JkZXItcmFkaXVzOiAwO1xufVxuXG5pY29uIHtcbiAgZm9udC1zaXplOiAyNXB4O1xufVxuXG4ud29ya3NwYWNlcyBpY29uIHtcbiAgbWFyZ2luLXRvcDogMnB4O1xuICBtYXJnaW4tbGVmdDogNXB4O1xufVxuLndvcmtzcGFjZXMgYnV0dG9uIHtcbiAgcGFkZGluZy1yaWdodDogNHB4O1xuICBwYWRkaW5nLXRvcDogM3B4O1xuICBib3JkZXItYm90dG9tOiAzcHggc29saWQgIzIxMjIyMztcbn1cbi53b3Jrc3BhY2VzIGJ1dHRvbiBsYWJlbCB7XG4gIG1hcmdpbi1sZWZ0OiA4cHg7XG4gIG1hcmdpbi1yaWdodDogNHB4O1xufVxuLndvcmtzcGFjZXMgYnV0dG9uLmV4aXN0IHtcbiAgYm9yZGVyLWJvdHRvbTogM3B4IHNvbGlkICM0MTQyNDM7XG59XG4ud29ya3NwYWNlcyBidXR0b24uZm9jdXNlZCB7XG4gIC8qIGJhY2tncm91bmQ6ICRhY2NlbnQ7ICovXG4gIGJhY2tncm91bmQ6ICM0MTQyNDM7XG4gIGJvcmRlci1ib3R0b206IDNweCBzb2xpZCAjMzc4REY3O1xufVxuXG4uTm90aWZpY2F0aW9ucyBldmVudGJveCBidXR0b24ge1xuICBiYWNrZ3JvdW5kOiAjNDE0MjQzO1xuICBib3JkZXItcmFkaXVzOiAwcHg7XG4gIG1hcmdpbjogMCAycHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCA+IGJveCB7XG4gIG1hcmdpbjogNHB4O1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xuICBwYWRkaW5nOiA0cHggMnB4O1xuICBtaW4td2lkdGg6IDMwMHB4O1xuICBib3JkZXItcmFkaXVzOiA0cHg7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0MTQyNDM7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAuaW1hZ2Uge1xuICBtaW4taGVpZ2h0OiA4MHB4O1xuICBtaW4td2lkdGg6IDgwcHg7XG4gIGZvbnQtc2l6ZTogODBweDtcbiAgbWFyZ2luOiA4cHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAubWFpbiB7XG4gIHBhZGRpbmctbGVmdDogNHB4O1xuICBtYXJnaW4tYm90dG9tOiAycHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAubWFpbiAuaGVhZGVyIC5zdW1tYXJ5IHtcbiAgZm9udC1zaXplOiAxLjJlbTtcbiAgZm9udC13ZWlnaHQ6IGJvbGQ7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveC5jcml0aWNhbCA+IGJveCB7XG4gIGJvcmRlci1jb2xvcjogIzM3OERGNztcbn1cblxuLmNsb2NrIC5pY29uIHtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjMzc4REY3O1xufVxuXG4udHJheSB7XG4gIG1hcmdpbi1yaWdodDogMnB4O1xufVxuLnRyYXkgaWNvbiB7XG4gIGZvbnQtc2l6ZTogMTZweDtcbiAgbWFyZ2luOiAwIDRweDtcbn1cblxuI2xhdW5jaGVyIHtcbiAgYmFja2dyb3VuZDogbm9uZTtcbn1cbiNsYXVuY2hlciAubWFpbiB7XG4gIHBhZGRpbmc6IDRweDtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIGljb24ge1xuICBtYXJnaW46IDAgNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIC5kZXNjcmlwdGlvbiB7XG4gIGNvbG9yOiAjYmJiO1xuICBmb250LXNpemU6IDAuOGVtO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbjpob3ZlcixcbiNsYXVuY2hlciAubWFpbiBidXR0b246Zm9jdXMge1xuICBib3JkZXI6IDJweCBzb2xpZCAjMzc4REY3O1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbiB7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0MTQyNDM7XG59XG4jbGF1bmNoZXIgLm1haW4gYnV0dG9uLFxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgYm9yZGVyLXJhZGl1czogMHB4O1xuICBiYWNrZ3JvdW5kOiAjNDE0MjQzO1xuICBvdXRsaW5lOiBub25lO1xufVxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgbWFyZ2luLWJvdHRvbTogOHB4O1xuICBib3JkZXI6IG5vbmU7XG4gIG1pbi1oZWlnaHQ6IDBweDtcbiAgZm9udC1zaXplOiAxLjNyZW07XG59XG5cbi5Pc2QgYm94IHtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMjRweDtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xufVxuLk9zZCBib3ggdHJvdWdoIHtcbiAgcGFkZGluZzogMDtcbiAgbWFyZ2luOiA4cHg7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbn1cbi5Pc2QgYm94IHRyb3VnaCBibG9jayB7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyOiBub25lO1xufVxuLk9zZCBib3ggdHJvdWdoIGJsb2NrLmZpbGxlZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xufVxuLk9zZCBib3ggbGFiZWwge1xuICBtaW4td2lkdGg6IDQwcHg7XG59IiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXN0YWxJTyB9IGZyb20gXCJnaTovL0FzdGFsSU8/dmVyc2lvbj0wLjFcIlxuZXhwb3J0ICogZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5leHBvcnQgKiBmcm9tIFwiLi90aW1lLmpzXCJcbmV4cG9ydCAqIGZyb20gXCIuL2ZpbGUuanNcIlxuZXhwb3J0ICogZnJvbSBcIi4vZ29iamVjdC5qc1wiXG5leHBvcnQgeyBiaW5kLCBkZWZhdWx0IGFzIEJpbmRpbmcgfSBmcm9tIFwiLi9iaW5kaW5nLmpzXCJcbmV4cG9ydCB7IFZhcmlhYmxlIH0gZnJvbSBcIi4vdmFyaWFibGUuanNcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcblxuZXhwb3J0IHsgR2lvIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRGaWxlKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEFzdGFsLnJlYWRfZmlsZShwYXRoKSB8fCBcIlwiXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlsZUFzeW5jKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgQXN0YWwucmVhZF9maWxlX2FzeW5jKHBhdGgsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5yZWFkX2ZpbGVfZmluaXNoKHJlcykgfHwgXCJcIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgQXN0YWwud3JpdGVfZmlsZShwYXRoLCBjb250ZW50KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlQXN5bmMocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBBc3RhbC53cml0ZV9maWxlX2FzeW5jKHBhdGgsIGNvbnRlbnQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC53cml0ZV9maWxlX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25pdG9yRmlsZShcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgY2FsbGJhY2s6IChmaWxlOiBzdHJpbmcsIGV2ZW50OiBHaW8uRmlsZU1vbml0b3JFdmVudCkgPT4gdm9pZCxcbik6IEdpby5GaWxlTW9uaXRvciB7XG4gICAgcmV0dXJuIEFzdGFsLm1vbml0b3JfZmlsZShwYXRoLCAoZmlsZTogc3RyaW5nLCBldmVudDogR2lvLkZpbGVNb25pdG9yRXZlbnQpID0+IHtcbiAgICAgICAgY2FsbGJhY2soZmlsZSwgZXZlbnQpXG4gICAgfSkhXG59XG4iLCAiaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5cbmV4cG9ydCB7IGRlZmF1bHQgYXMgR0xpYiB9IGZyb20gXCJnaTovL0dMaWI/dmVyc2lvbj0yLjBcIlxuZXhwb3J0IHsgR09iamVjdCwgR09iamVjdCBhcyBkZWZhdWx0IH1cblxuY29uc3QgbWV0YSA9IFN5bWJvbChcIm1ldGFcIilcbmNvbnN0IHByaXYgPSBTeW1ib2woXCJwcml2XCIpXG5cbmNvbnN0IHsgUGFyYW1TcGVjLCBQYXJhbUZsYWdzIH0gPSBHT2JqZWN0XG5cbmNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG50eXBlIFNpZ25hbERlY2xhcmF0aW9uID0ge1xuICAgIGZsYWdzPzogR09iamVjdC5TaWduYWxGbGFnc1xuICAgIGFjY3VtdWxhdG9yPzogR09iamVjdC5BY2N1bXVsYXRvclR5cGVcbiAgICByZXR1cm5fdHlwZT86IEdPYmplY3QuR1R5cGVcbiAgICBwYXJhbV90eXBlcz86IEFycmF5PEdPYmplY3QuR1R5cGU+XG59XG5cbnR5cGUgUHJvcGVydHlEZWNsYXJhdGlvbiA9XG4gICAgfCBJbnN0YW5jZVR5cGU8dHlwZW9mIEdPYmplY3QuUGFyYW1TcGVjPlxuICAgIHwgeyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfVxuICAgIHwgdHlwZW9mIFN0cmluZ1xuICAgIHwgdHlwZW9mIE51bWJlclxuICAgIHwgdHlwZW9mIEJvb2xlYW5cbiAgICB8IHR5cGVvZiBPYmplY3RcblxudHlwZSBHT2JqZWN0Q29uc3RydWN0b3IgPSB7XG4gICAgW21ldGFdPzoge1xuICAgICAgICBQcm9wZXJ0aWVzPzogeyBba2V5OiBzdHJpbmddOiBHT2JqZWN0LlBhcmFtU3BlYyB9XG4gICAgICAgIFNpZ25hbHM/OiB7IFtrZXk6IHN0cmluZ106IEdPYmplY3QuU2lnbmFsRGVmaW5pdGlvbiB9XG4gICAgfVxuICAgIG5ldyguLi5hcmdzOiBhbnlbXSk6IGFueVxufVxuXG50eXBlIE1ldGFJbmZvID0gR09iamVjdC5NZXRhSW5mbzxuZXZlciwgQXJyYXk8eyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfT4sIG5ldmVyPlxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXIob3B0aW9uczogTWV0YUluZm8gPSB7fSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoY2xzOiBHT2JqZWN0Q29uc3RydWN0b3IpIHtcbiAgICAgICAgY29uc3QgdCA9IG9wdGlvbnMuVGVtcGxhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiICYmICF0LnN0YXJ0c1dpdGgoXCJyZXNvdXJjZTovL1wiKSAmJiAhdC5zdGFydHNXaXRoKFwiZmlsZTovL1wiKSkge1xuICAgICAgICAgICAgLy8gYXNzdW1lIHhtbCB0ZW1wbGF0ZVxuICAgICAgICAgICAgb3B0aW9ucy5UZW1wbGF0ZSA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0KVxuICAgICAgICB9XG5cbiAgICAgICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgICAgIFNpZ25hbHM6IHsgLi4uY2xzW21ldGFdPy5TaWduYWxzIH0sXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7IC4uLmNsc1ttZXRhXT8uUHJvcGVydGllcyB9LFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgfSwgY2xzKVxuXG4gICAgICAgIGRlbGV0ZSBjbHNbbWV0YV1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9wZXJ0eShkZWNsYXJhdGlvbjogUHJvcGVydHlEZWNsYXJhdGlvbiA9IE9iamVjdCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHByb3A6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikge1xuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0gPz89IHt9XG4gICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5Qcm9wZXJ0aWVzID8/PSB7fVxuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBrZWJhYmlmeShwcm9wKVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJpdl0/Lltwcm9wXSA/PyBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb24pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzW3Byb3BdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzW3ByaXZdID8/PSB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcml2XVtwcm9wXSA9IHZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZ5KG5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYHNldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSh2OiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHZcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYGdldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJvcF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlByb3BlcnRpZXNba2ViYWJpZnkocHJvcCldID0gcHNwZWMobmFtZSwgUGFyYW1GbGFncy5SRUFEV1JJVEUsIGRlY2xhcmF0aW9uKVxuICAgICAgICB9XG5cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZmxhZ3MgPSAwXG4gICAgICAgICAgICBpZiAoZGVzYy5nZXQpIGZsYWdzIHw9IFBhcmFtRmxhZ3MuUkVBREFCTEVcbiAgICAgICAgICAgIGlmIChkZXNjLnNldCkgZmxhZ3MgfD0gUGFyYW1GbGFncy5XUklUQUJMRVxuXG4gICAgICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uUHJvcGVydGllc1trZWJhYmlmeShwcm9wKV0gPSBwc3BlYyhuYW1lLCBmbGFncywgZGVjbGFyYXRpb24pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduYWwoLi4ucGFyYW1zOiBBcnJheTx7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdD4pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKFxuICAgIGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24gfCB7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdCxcbiAgICAuLi5wYXJhbXM6IEFycmF5PHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH0gfCB0eXBlb2YgT2JqZWN0PlxuKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdID8/PSB7fVxuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uU2lnbmFscyA/Pz0ge31cblxuICAgICAgICBjb25zdCBuYW1lID0ga2ViYWJpZnkoc2lnbmFsKVxuXG4gICAgICAgIGlmIChkZWNsYXJhdGlvbiB8fCBwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBUT0RPOiB0eXBlIGFzc2VydFxuICAgICAgICAgICAgY29uc3QgYXJyID0gW2RlY2xhcmF0aW9uLCAuLi5wYXJhbXNdLm1hcCh2ID0+IHYuJGd0eXBlKVxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlNpZ25hbHNbbmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgcGFyYW1fdHlwZXM6IGFycixcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5TaWduYWxzW25hbWVdID0gZGVjbGFyYXRpb24gfHwge1xuICAgICAgICAgICAgICAgIHBhcmFtX3R5cGVzOiBbXSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgc2lnbmFsLCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQobmFtZSwgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IG9nOiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSA9IGRlc2MudmFsdWVcbiAgICAgICAgICAgIGRlc2MudmFsdWUgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIG5vdCB0eXBlZFxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChuYW1lLCAuLi5hcmdzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYG9uXyR7bmFtZS5yZXBsYWNlKFwiLVwiLCBcIl9cIil9YCwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9nKC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBzcGVjKG5hbWU6IHN0cmluZywgZmxhZ3M6IG51bWJlciwgZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvblxuXG4gICAgc3dpdGNoIChkZWNsYXJhdGlvbikge1xuICAgICAgICBjYXNlIFN0cmluZzpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuc3RyaW5nKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBcIlwiKVxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuZG91YmxlKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCAtTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSwgMClcbiAgICAgICAgY2FzZSBCb29sZWFuOlxuICAgICAgICAgICAgcmV0dXJuIFBhcmFtU3BlYy5ib29sZWFuKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBmYWxzZSlcbiAgICAgICAgY2FzZSBPYmplY3Q6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLmpzb2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzKVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBtaXNzdHlwZWRcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMub2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBkZWNsYXJhdGlvbi4kZ3R5cGUpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvbi5nZXRfZGVmYXVsdF92YWx1ZSgpXG5cbiAgICBzd2l0Y2ggKGRlY2xhcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgU3RyaW5nOlxuICAgICAgICAgICAgcmV0dXJuIFwiZGVmYXVsdC1zdHJpbmdcIlxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIGNhc2UgQm9vbGVhbjpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBjYXNlIE9iamVjdDpcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgfVxufVxuIiwgImltcG9ydCB7IFZhcmlhYmxlLCBHTGliLCBiaW5kIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBBc3RhbCwgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBCYXR0ZXJ5IGZyb20gXCJnaTovL0FzdGFsQmF0dGVyeVwiO1xuaW1wb3J0IFdvcmtzcGFjZXMgZnJvbSBcIi4vd29ya3NwYWNlc1wiO1xuaW1wb3J0IFRyYXkgZnJvbSBcIi4vdHJheVwiO1xuaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCBOZXR3b3JrIGZyb20gXCJnaTovL0FzdGFsTmV0d29ya1wiO1xuXG5mdW5jdGlvbiBDbG9jaygpIHtcbiAgcmV0dXJuIChcbiAgICA8Ym94XG4gICAgICBjbGFzc05hbWU9XCJjbG9jayBzdGF0dXNcIlxuICAgICAgaGFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfVxuICAgICAgaGV4cGFuZFxuICAgID5cbiAgICAgIDxsYWJlbFxuICAgICAgICBsYWJlbD17VmFyaWFibGUoXCJcIikucG9sbCg1MDAwLCAoKSA9PlxuICAgICAgICAgIEdMaWIuRGF0ZVRpbWUubmV3X25vd19sb2NhbCgpLmZvcm1hdChcIiVIOiVNICVBICVkLyVtLyVZXCIpLFxuICAgICAgICApKCl9XG4gICAgICAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5mdW5jdGlvbiBCYXR0ZXJ5TGV2ZWwoKSB7XG4gIGNvbnN0IGJhdCA9IEJhdHRlcnkuZ2V0X2RlZmF1bHQoKTtcbiAgY29uc3QgaWNvbnMgPSB7XG4gICAgLy8gYmF0dGVyeSBpY29ucyBmcm9tIG5lcmQgZm9udHMgaHR0cHM6Ly93d3cubmVyZGZvbnRzLmNvbS9cbiAgICBcImJhdHRlcnktbGV2ZWwtMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5Q1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0yMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0zMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4N1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC00MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC01MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC02MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC03MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC04MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC05MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMDAtY2hhcmdlZC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0wLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzhFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdBXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTIwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdCXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTMwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdDXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTQwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdEXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTUwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTYwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdGXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTcwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgwXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTgwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgxXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTkwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgyXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3OVwiLFxuICB9O1xuICByZXR1cm4gKFxuICAgIDxib3hcbiAgICAgIGNsYXNzTmFtZT17YmluZChiYXQsIFwiY2hhcmdpbmdcIikuYXMoYyA9PiBjID8gXCJjaGFyZ2luZyBiYXR0ZXJ5IHN0YXR1c1wiIDogXCJiYXR0ZXJ5IHN0YXR1c1wiKX1cbiAgICAgIGhleHBhbmRcbiAgICA+XG4gICAgICA8bGFiZWxcbiAgICAgICAgY2xhc3NOYW1lPVwiaWNvblwiXG4gICAgICAgIGxhYmVsPXtiaW5kKGJhdCwgXCJiYXR0ZXJ5SWNvbk5hbWVcIikuYXMoKGIpID0+IGljb25zW2JdKX1cbiAgICAgIC8+XG4gICAgICA8bGFiZWxcbiAgICAgICAgbGFiZWw9e2JpbmQoYmF0LCBcInBlcmNlbnRhZ2VcIikuYXMoKHApID0+IGAke01hdGguZmxvb3IocCAqIDEwMCl9JWApfVxuICAgICAgLz5cbiAgICA8L2JveD5cbiAgKTtcbn1cblxuZnVuY3Rpb24gVm9sdW1lKCkge1xuICBjb25zdCBzcGVha2VyID0gV3AuZ2V0X2RlZmF1bHQoKT8uYXVkaW8uZGVmYXVsdFNwZWFrZXI7XG5cbiAgcmV0dXJuIChcbiAgICA8Ym94IGNsYXNzTmFtZT1cInZvbHVtZSBzdGF0dXNcIj5cbiAgICAgIDxpY29uIGljb249e2JpbmQoc3BlYWtlciwgXCJ2b2x1bWVJY29uXCIpfSAvPlxuICAgICAgPGxhYmVsIGxhYmVsPXtiaW5kKHNwZWFrZXIsIFwidm9sdW1lXCIpLmFzKChwKSA9PiBgJHtNYXRoLmZsb29yKHAgKiAxMDApfSVgKX0gLz5cbiAgICA8L2JveD5cbiAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQmFyKG1vbml0b3IpIHtcbiAgY29uc3QgeyBUT1AsIFJJR0hULCBMRUZUIH0gPSBBc3RhbC5XaW5kb3dBbmNob3I7XG5cbiAgY29uc3QgbmV0d29yayA9IE5ldHdvcmsuZ2V0X2RlZmF1bHQoKTtcbiAgY29uc3Qgd2lmaSA9IGJpbmQobmV0d29yaywgXCJ3aWZpXCIpO1xuXG4gIHJldHVybiAoXG4gICAgPHdpbmRvd1xuICAgICAgY2xhc3NOYW1lPVwiQmFyXCJcbiAgICAgIG5hbWVzcGFjZT1cImFncy1iYXJcIlxuICAgICAgZ2RrbW9uaXRvcj17bW9uaXRvcn1cbiAgICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5FWENMVVNJVkV9XG4gICAgICBhbmNob3I9e1RPUCB8IExFRlQgfCBSSUdIVH1cbiAgICAgIGxheWVyPXtBc3RhbC5MYXllci5Cb3R0b219XG4gICAgPlxuICAgICAgPGNlbnRlcmJveD5cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJzZWdtZW50IHN0YXJ0XCIgaGFsaWduPXtHdGsuQWxpZ24uU1RBUlR9PlxuICAgICAgICAgIDxXb3Jrc3BhY2VzIC8+XG4gICAgICAgIDwvYm94PlxuICAgICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgY2VudGVyXCI+XG4gICAgICAgICAgPENsb2NrIC8+XG4gICAgICAgIDwvYm94PlxuICAgICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgZW5kXCIgaGFsaWduPXtHdGsuQWxpZ24uRU5EfSA+XG4gICAgICAgICAgPFRyYXkgLz5cbiAgICAgICAgICA8Ym94XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJuZXR3b3JrIHN0YXR1c1wiXG4gICAgICAgICAgICBoYWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9XG4gICAgICAgICAgICBoZXhwYW5kXG4gICAgICAgICAgPlxuICAgICAgICAgICAge3dpZmkuYXMoXG4gICAgICAgICAgICAgICh3aWZpKSA9PlxuICAgICAgICAgICAgICAgIHdpZmkgJiYgKFxuICAgICAgICAgICAgICAgICAgPGljb25cbiAgICAgICAgICAgICAgICAgICAgdG9vbHRpcFRleHQ9e2JpbmQod2lmaSwgXCJzc2lkXCIpLmFzKFN0cmluZyl9XG4gICAgICAgICAgICAgICAgICAgIGljb249e2JpbmQod2lmaSwgXCJpY29uTmFtZVwiKX1cbiAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICl9XG4gICAgICAgICAgICB7d2lmaS5hcyhcbiAgICAgICAgICAgICAgKHdpZmkpID0+XG4gICAgICAgICAgICAgICAgd2lmaSAmJiAoXG4gICAgICAgICAgICAgICAgICA8bGFiZWwgbGFiZWw9e2JpbmQod2lmaSwgXCJzc2lkXCIpfSAvPlxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDxCYXR0ZXJ5TGV2ZWwgLz5cbiAgICAgICAgICA8Vm9sdW1lIC8+XG4gICAgICAgIDwvYm94PlxuICAgICAgPC9jZW50ZXJib3g+XG4gICAgPC93aW5kb3cgPlxuICApO1xufVxuIiwgImltcG9ydCBIeXBybGFuZCBmcm9tIFwiZ2k6Ly9Bc3RhbEh5cHJsYW5kXCI7XG5pbXBvcnQgeyBHdGssIEFzdGFsIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCB7IGJpbmQgfSBmcm9tIFwiYXN0YWxcIjtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gV29ya3NwYWNlcyh7IG9yaWVudGF0aW9uIH0pIHtcbiAgY29uc3QgaHlwciA9IEh5cHJsYW5kLmdldF9kZWZhdWx0KCk7XG4gIC8vIHt3Lm1hcCgod3MpID0+IChcbiAgLy8gICA8YnV0dG9uXG4gIC8vICAgICBoYWxpZ249e0d0ay5BbGlnbi5DZW50ZXJ9XG4gIC8vICAgICBjbGFzc05hbWU9e2JpbmQoaHlwciwgXCJmb2N1c2VkV29ya3NwYWNlXCIpLmFzKChmdykgPT5cbiAgLy8gICAgICAgd3MgPT09IGZ3LmlkID8gXCJmb2N1c2VkXCIgOiBcIlwiLFxuICAvLyAgICAgKX1cbiAgLy8gICAgIG9uQ2xpY2tlZD17KCkgPT4gd3MuZm9jdXMoKX1cbiAgLy8gICA+XG4gIC8vICAgICB7d3N9XG4gIC8vICAgPC9idXR0b24+XG4gIC8vICkpfVxuICAvLyBjb25zdCBjbGFzc05hbWVzID0gVmFyaWFibGUoe30pXG4gIHJldHVybiAoXG4gICAgPGJveCBjbGFzc05hbWU9XCJ3b3Jrc3BhY2VzXCIgb3JpZW50YXRpb249e29yaWVudGF0aW9ufT5cbiAgICAgIHtiaW5kKGh5cHIsIFwid29ya3NwYWNlc1wiKS5hcyh3b3Jrc3BhY2VzID0+IHtcbiAgICAgICAgY29uc3QgZmlsdGVyZWQgPSB3b3Jrc3BhY2VzXG4gICAgICAgICAgLmZpbHRlcih3cyA9PiAhKHdzLmlkID49IC05OSAmJiB3cy5pZCA8PSAtMikpIC8vIGZpbHRlciBvdXQgc3BlY2lhbCB3b3Jrc3BhY2VzXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKVxuXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMSkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMCwgMCwgeyBcImlkXCI6IDEsIFwibmFtZVwiOiAxLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMikgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMSwgMCwgeyBcImlkXCI6IDIsIFwibmFtZVwiOiAyLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gMykgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMiwgMCwgeyBcImlkXCI6IDMsIFwibmFtZVwiOiAzLCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gNCkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoMywgMCwgeyBcImlkXCI6IDQsIFwibmFtZVwiOiA0LCBcInN0YXRpY1wiOiB0cnVlIH0pXG4gICAgICAgIGlmIChmaWx0ZXJlZC5maW5kKHcgPT4gdy5pZCA9PT0gNSkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoNCwgMCwgeyBcImlkXCI6IDUsIFwibmFtZVwiOiA1LCBcInN0YXRpY1wiOiB0cnVlIH0pXG5cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkLm1hcCgodykgPT4gKFxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIGNsYXNzTmFtZT17YmluZChoeXByLCBcImZvY3VzZWRXb3Jrc3BhY2VcIikuYXMoKGZ3KSA9PlxuICAgICAgICAgICAgICB3LmlkID09PSBmdy5pZCA/IFwiZm9jdXNlZFwiIDogdy5zdGF0aWMgPyBcIlwiIDogXCJleGlzdFwiXG4gICAgICAgICAgICApfVxuICAgICAgICAgICAgb25DbGlja2VkPXsoKSA9PiBoeXByLm1lc3NhZ2UoYGRpc3BhdGNoIHdvcmtzcGFjZSAke3cuaWR9YCl9XG4gICAgICAgICAgPlxuICAgICAgICAgICAge3cubmFtZX1cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKSlcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxpY29uIGljb249e2JpbmQoY2xpZW50LCBcImluaXRpYWwtY2xhc3NcIikuYXMoYyA9PiBBc3RhbC5JY29uLmxvb2t1cF9pY29uKGMpID8gYyA6IGMudG9Mb3dlckNhc2UoKSl9IC8+XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH0pfVxuICAgICAge2JpbmQoaHlwciwgXCJmb2N1c2VkQ2xpZW50XCIpLmFzKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQpXG4gICAgICAgICAgcmV0dXJuIDxsYWJlbCBsYWJlbD17YmluZChjbGllbnQsIFwidGl0bGVcIikuYXModGl0bGUgPT4gdGl0bGUubGVuZ3RoID4gNDAgPyBgJHt0aXRsZS5zdWJzdHJpbmcoMCwgNDApfS4uLmAgOiB0aXRsZSl9IC8+O1xuICAgICAgICAgIC8vIDxib3g+XG4gICAgICAgICAgLy8gICA8aWNvbiBpY29uPXtiaW5kKGNsaWVudCwgXCJpbml0aWFsLWNsYXNzXCIpLmFzKGMgPT4gQXN0YWwuSWNvbi5sb29rdXBfaWNvbihjKSA/IGMgOiBjLnRvTG93ZXJDYXNlKCkpfSAvPlxuICAgICAgICAgIC8vIDwvYm94PjtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgfSl9XG4gICAgPC9ib3g+XG4gICk7XG59XG4iLCAiaW1wb3J0IEd0ayBmcm9tIFwiZ2k6Ly9HdGs/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IHsgbWVyZ2VCaW5kaW5ncywgdHlwZSBCaW5kYWJsZUNoaWxkIH0gZnJvbSBcIi4vYXN0YWxpZnkuanNcIlxuaW1wb3J0ICogYXMgV2lkZ2V0IGZyb20gXCIuL3dpZGdldC5qc1wiXG5cbmZ1bmN0aW9uIGlzQXJyb3dGdW5jdGlvbihmdW5jOiBhbnkpOiBmdW5jIGlzIChhcmdzOiBhbnkpID0+IGFueSB7XG4gICAgcmV0dXJuICFPYmplY3QuaGFzT3duKGZ1bmMsIFwicHJvdG90eXBlXCIpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBGcmFnbWVudCh7IGNoaWxkcmVuID0gW10sIGNoaWxkIH06IHtcbiAgICBjaGlsZD86IEJpbmRhYmxlQ2hpbGRcbiAgICBjaGlsZHJlbj86IEFycmF5PEJpbmRhYmxlQ2hpbGQ+XG59KSB7XG4gICAgaWYgKGNoaWxkKSBjaGlsZHJlbi5wdXNoKGNoaWxkKVxuICAgIHJldHVybiBtZXJnZUJpbmRpbmdzKGNoaWxkcmVuKVxufVxuXG5leHBvcnQgZnVuY3Rpb24ganN4KFxuICAgIGN0b3I6IGtleW9mIHR5cGVvZiBjdG9ycyB8IHR5cGVvZiBHdGsuV2lkZ2V0LFxuICAgIHsgY2hpbGRyZW4sIC4uLnByb3BzIH06IGFueSxcbikge1xuICAgIGNoaWxkcmVuID8/PSBbXVxuXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNoaWxkcmVuKSlcbiAgICAgICAgY2hpbGRyZW4gPSBbY2hpbGRyZW5dXG5cbiAgICBjaGlsZHJlbiA9IGNoaWxkcmVuLmZpbHRlcihCb29sZWFuKVxuXG4gICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMSlcbiAgICAgICAgcHJvcHMuY2hpbGQgPSBjaGlsZHJlblswXVxuICAgIGVsc2UgaWYgKGNoaWxkcmVuLmxlbmd0aCA+IDEpXG4gICAgICAgIHByb3BzLmNoaWxkcmVuID0gY2hpbGRyZW5cblxuICAgIGlmICh0eXBlb2YgY3RvciA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gbmV3IGN0b3JzW2N0b3JdKHByb3BzKVxuICAgIH1cblxuICAgIGlmIChpc0Fycm93RnVuY3Rpb24oY3RvcikpXG4gICAgICAgIHJldHVybiBjdG9yKHByb3BzKVxuXG4gICAgLy8gQHRzLWV4cGVjdC1lcnJvciBjYW4gYmUgY2xhc3Mgb3IgZnVuY3Rpb25cbiAgICByZXR1cm4gbmV3IGN0b3IocHJvcHMpXG59XG5cbmNvbnN0IGN0b3JzID0ge1xuICAgIGJveDogV2lkZ2V0LkJveCxcbiAgICBidXR0b246IFdpZGdldC5CdXR0b24sXG4gICAgY2VudGVyYm94OiBXaWRnZXQuQ2VudGVyQm94LFxuICAgIGNpcmN1bGFycHJvZ3Jlc3M6IFdpZGdldC5DaXJjdWxhclByb2dyZXNzLFxuICAgIGRyYXdpbmdhcmVhOiBXaWRnZXQuRHJhd2luZ0FyZWEsXG4gICAgZW50cnk6IFdpZGdldC5FbnRyeSxcbiAgICBldmVudGJveDogV2lkZ2V0LkV2ZW50Qm94LFxuICAgIC8vIFRPRE86IGZpeGVkXG4gICAgLy8gVE9ETzogZmxvd2JveFxuICAgIGljb246IFdpZGdldC5JY29uLFxuICAgIGxhYmVsOiBXaWRnZXQuTGFiZWwsXG4gICAgbGV2ZWxiYXI6IFdpZGdldC5MZXZlbEJhcixcbiAgICAvLyBUT0RPOiBsaXN0Ym94XG4gICAgb3ZlcmxheTogV2lkZ2V0Lk92ZXJsYXksXG4gICAgcmV2ZWFsZXI6IFdpZGdldC5SZXZlYWxlcixcbiAgICBzY3JvbGxhYmxlOiBXaWRnZXQuU2Nyb2xsYWJsZSxcbiAgICBzbGlkZXI6IFdpZGdldC5TbGlkZXIsXG4gICAgc3RhY2s6IFdpZGdldC5TdGFjayxcbiAgICBzd2l0Y2g6IFdpZGdldC5Td2l0Y2gsXG4gICAgd2luZG93OiBXaWRnZXQuV2luZG93LFxufVxuXG5kZWNsYXJlIGdsb2JhbCB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1uYW1lc3BhY2VcbiAgICBuYW1lc3BhY2UgSlNYIHtcbiAgICAgICAgdHlwZSBFbGVtZW50ID0gR3RrLldpZGdldFxuICAgICAgICB0eXBlIEVsZW1lbnRDbGFzcyA9IEd0ay5XaWRnZXRcbiAgICAgICAgaW50ZXJmYWNlIEludHJpbnNpY0VsZW1lbnRzIHtcbiAgICAgICAgICAgIGJveDogV2lkZ2V0LkJveFByb3BzXG4gICAgICAgICAgICBidXR0b246IFdpZGdldC5CdXR0b25Qcm9wc1xuICAgICAgICAgICAgY2VudGVyYm94OiBXaWRnZXQuQ2VudGVyQm94UHJvcHNcbiAgICAgICAgICAgIGNpcmN1bGFycHJvZ3Jlc3M6IFdpZGdldC5DaXJjdWxhclByb2dyZXNzUHJvcHNcbiAgICAgICAgICAgIGRyYXdpbmdhcmVhOiBXaWRnZXQuRHJhd2luZ0FyZWFQcm9wc1xuICAgICAgICAgICAgZW50cnk6IFdpZGdldC5FbnRyeVByb3BzXG4gICAgICAgICAgICBldmVudGJveDogV2lkZ2V0LkV2ZW50Qm94UHJvcHNcbiAgICAgICAgICAgIC8vIFRPRE86IGZpeGVkXG4gICAgICAgICAgICAvLyBUT0RPOiBmbG93Ym94XG4gICAgICAgICAgICBpY29uOiBXaWRnZXQuSWNvblByb3BzXG4gICAgICAgICAgICBsYWJlbDogV2lkZ2V0LkxhYmVsUHJvcHNcbiAgICAgICAgICAgIGxldmVsYmFyOiBXaWRnZXQuTGV2ZWxCYXJQcm9wc1xuICAgICAgICAgICAgLy8gVE9ETzogbGlzdGJveFxuICAgICAgICAgICAgb3ZlcmxheTogV2lkZ2V0Lk92ZXJsYXlQcm9wc1xuICAgICAgICAgICAgcmV2ZWFsZXI6IFdpZGdldC5SZXZlYWxlclByb3BzXG4gICAgICAgICAgICBzY3JvbGxhYmxlOiBXaWRnZXQuU2Nyb2xsYWJsZVByb3BzXG4gICAgICAgICAgICBzbGlkZXI6IFdpZGdldC5TbGlkZXJQcm9wc1xuICAgICAgICAgICAgc3RhY2s6IFdpZGdldC5TdGFja1Byb3BzXG4gICAgICAgICAgICBzd2l0Y2g6IFdpZGdldC5Td2l0Y2hQcm9wc1xuICAgICAgICAgICAgd2luZG93OiBXaWRnZXQuV2luZG93UHJvcHNcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IGpzeHMgPSBqc3hcbiIsICJpbXBvcnQgVHJheSBmcm9tIFwiZ2k6Ly9Bc3RhbFRyYXlcIjtcbmltcG9ydCB7IFZhcmlhYmxlLCBiaW5kIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBBc3RhbCwgR3RrLCBHZGsgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5cbmNvbnN0IGNyZWF0ZU1lbnUgPSAobWVudU1vZGVsLCBhY3Rpb25Hcm91cCkgPT4ge1xuICBjb25zdCBtZW51ID0gR3RrLk1lbnUubmV3X2Zyb21fbW9kZWwobWVudU1vZGVsKTtcbiAgbWVudS5pbnNlcnRfYWN0aW9uX2dyb3VwKCdkYnVzbWVudScsIGFjdGlvbkdyb3VwKTtcblxuICByZXR1cm4gbWVudTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFN5c1RyYXkoe29yaWVudGF0aW9ufSkge1xuICBjb25zdCB0cmF5ID0gVHJheS5nZXRfZGVmYXVsdCgpXG4gIFxuICByZXR1cm4gPGJveCBjbGFzc05hbWU9XCJ0cmF5XCIgb3JpZW50YXRpb249e29yaWVudGF0aW9ufSB2aXNpYmxlPXtiaW5kKHRyYXksIFwiaXRlbXNcIikuYXMoaXRlbXM9Pml0ZW1zLmxlbmd0aD4wKX0+XG4gICAge2JpbmQodHJheSwgXCJpdGVtc1wiKS5hcyhpdGVtcyA9PiBpdGVtcy5tYXAoaXRlbSA9PiB7XG5cbiAgICAgIC8vIE1ha2Ugc3VyZSB5b3UncmUgYm91bmQgdG8gdGhlIG1lbnVNb2RlbCBhbmQgYWN0aW9uR3JvdXAgd2hpY2ggY2FuIGNoYW5nZVxuXG4gICAgICBsZXQgbWVudTtcblxuICAgICAgY29uc3QgZW50cnlCaW5kaW5nID0gVmFyaWFibGUuZGVyaXZlKFxuICAgICAgICBbYmluZChpdGVtLCAnbWVudU1vZGVsJyksIGJpbmQoaXRlbSwgJ2FjdGlvbkdyb3VwJyldLFxuICAgICAgICAobWVudU1vZGVsLCBhY3Rpb25Hcm91cCkgPT4ge1xuICAgICAgICAgIGlmICghbWVudU1vZGVsKSB7XG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcihgTWVudSBNb2RlbCBub3QgZm91bmQgZm9yICR7aXRlbS5pZH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFhY3Rpb25Hcm91cCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoYEFjdGlvbiBHcm91cCBub3QgZm91bmQgZm9yICR7aXRlbS5pZH1gKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBtZW51ID0gY3JlYXRlTWVudShtZW51TW9kZWwsIGFjdGlvbkdyb3VwKTtcbiAgICAgICAgfSxcbiAgICAgICk7XG5cblxuICAgICAgcmV0dXJuIDxidXR0b25cbiAgICAgICAgb25DbGljaz17KGJ0biwgZXZlbnQpPT57XG4gICAgICAgICAgLy8gaWYgKGlzUHJpbWFyeUNsaWNrKGV2ZW50KSkge1xuICAgICAgICAgIC8vICAgaXRlbS5hY3RpdmF0ZSgwLCAwKTtcbiAgICAgICAgICAvLyB9XG4gICAgICAgICAgLy8gZWxzZSBpZiAoaXNTZWNvbmRhcnlDbGljayhldmVudCkpe1xuICAgICAgICAgICAgXG4gICAgICAgICAgLy8gfVxuXG4gICAgICAgICAgLy8gc3Bhd24gbWVudS4uLiAodXNlIG9uZSBsb2NhdGlvbilcbiAgICAgICAgICAvLyBvbiBidXR0b25cbiAgICAgICAgICBtZW51Py5wb3B1cF9hdF93aWRnZXQoYnRuLCBHZGsuR3Jhdml0eS5OT1JUSCwgR2RrLkdyYXZpdHkuU09VVEgsIG51bGwpO1xuICAgICAgICAgIC8vIG9uIG1vdXNlIHBvaW50ZXJcbiAgICAgICAgICAvLyBtZW51Py5wb3B1cF9hdF9wb2ludGVyKG51bGwpO1xuICAgICAgICB9fVxuICAgICAgICBvbkRlc3Ryb3k9eygpID0+IHtcbiAgICAgICAgICBtZW51Py5kZXN0cm95KCk7XG4gICAgICAgICAgZW50cnlCaW5kaW5nLmRyb3AoKTtcbiAgICAgICAgfX0+XG4gICAgICAgIDxpY29uIGctaWNvbj17YmluZChpdGVtLCBcImdpY29uXCIpfSAvKiBpY29uPXtiaW5kKGl0ZW0sIFwiaWNvbk5hbWVcIil9ICovIC8+XG4gICAgICA8L2J1dHRvbj5cbiAgICB9KSl9XG4gIDwvYm94PlxufVxuIiwgImltcG9ydCB7IEFzdGFsLCBHdGssIEdkayB9IGZyb20gXCJhc3RhbC9ndGszXCJcbmltcG9ydCBOb3RpZmQgZnJvbSBcImdpOi8vQXN0YWxOb3RpZmRcIlxuaW1wb3J0IHsgVmFyaWFibGUsIGJpbmQsIHRpbWVvdXQgfSBmcm9tIFwiYXN0YWxcIlxuXG5jb25zdCB7IFNUQVJULCBDRU5URVIsIEVORCB9ID0gR3RrLkFsaWduXG5cblxuY29uc3QgZ2V0VXJnZW5jeSA9IChuKSA9PiB7XG4gICAgY29uc3QgeyBMT1csIE5PUk1BTCwgQ1JJVElDQUwgfSA9IE5vdGlmZC5VcmdlbmN5XG4gICAgc3dpdGNoIChuLnVyZ2VuY3kpIHtcbiAgICAgICAgY2FzZSBMT1c6IHJldHVybiBcImxvd1wiXG4gICAgICAgIGNhc2UgQ1JJVElDQUw6IHJldHVybiBcImNyaXRpY2FsXCJcbiAgICAgICAgY2FzZSBOT1JNQUw6XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBcIm5vcm1hbFwiXG4gICAgfVxufVxuXG5mdW5jdGlvbiBOb3RpZihub3RpZikge1xuICByZXR1cm4gPGV2ZW50Ym94XG4gICAgY2xhc3NOYW1lPXtnZXRVcmdlbmN5KG5vdGlmKX1cbiAgICBvbkNsaWNrPXsoKSA9PiBub3RpZi5kaXNtaXNzKCl9XG4gID5cbiAgICA8Ym94IHZlcnRpY2FsPlxuICAgICAgPGJveD5cbiAgICAgICAgeygobm90aWYuYXBwSWNvbiB8fCBub3RpZi5kZXNrdG9wRW50cnkpICYmIDxpY29uXG4gICAgICAgICAgY2xhc3NOYW1lPVwiaW1hZ2VcIlxuICAgICAgICAgIHZpc2libGU9e0Jvb2xlYW4obm90aWYuYXBwSWNvbiB8fCBub3RpZi5kZXNrdG9wRW50cnkpfVxuICAgICAgICAgIGljb249e25vdGlmLmFwcEljb24gfHwgbm90aWYuZGVza3RvcEVudHJ5fVxuICAgICAgICAvPikgfHwgKG5vdGlmLmltYWdlICYmIGZpbGVFeGlzdHMobm90aWYuaW1hZ2UpICYmIDxib3hcbiAgICAgICAgICB2YWxpZ249e1NUQVJUfVxuICAgICAgICAgIGNsYXNzTmFtZT1cImltYWdlXCJcbiAgICAgICAgICBjc3M9e2BiYWNrZ3JvdW5kLWltYWdlOiB1cmwoJyR7bm90aWYuaW1hZ2V9JylgfVxuICAgICAgICAvPikgfHwgKChub3RpZi5pbWFnZSAmJiBpc0ljb24obm90aWYuaW1hZ2UpICYmIDxib3hcbiAgICAgICAgICBleHBhbmQ9e2ZhbHNlfVxuICAgICAgICAgIHZhbGlnbj17U1RBUlR9XG4gICAgICAgICAgY2xhc3NOYW1lPVwiaW1hZ2VcIj5cbiAgICAgICAgICA8aWNvbiBpY29uPXtub3RpZi5pbWFnZX0gZXhwYW5kIGhhbGlnbj17Q0VOVEVSfSB2YWxpZ249e0NFTlRFUn0gLz5cbiAgICAgICAgPC9ib3g+KSl9XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwibWFpblwiIHZlcnRpY2FsPlxuICAgICAgICAgIDxib3ggY2xhc3NOYW1lPVwiaGVhZGVyXCI+XG4gICAgICAgICAgICA8bGFiZWxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwic3VtbWFyeVwiXG4gICAgICAgICAgICAgIGhhbGlnbj17U1RBUlR9XG4gICAgICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICAgICAgbGFiZWw9e25vdGlmLnN1bW1hcnl9XG4gICAgICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgICAgIGhleHBhbmRcbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2tlZD17KCkgPT4gbm90aWYuZGlzbWlzcygpfT5cbiAgICAgICAgICAgICAgPGljb24gaWNvbj1cIndpbmRvdy1jbG9zZS1zeW1ib2xpY1wiIC8+XG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgICA8Ym94IGNsYXNzTmFtZT1cImNvbnRlbnRcIj5cbiAgICAgICAgICAgIDxib3ggdmVydGljYWw+XG4gICAgICAgICAgICAgIHtub3RpZi5ib2R5ICYmIDxsYWJlbFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImJvZHlcIlxuICAgICAgICAgICAgICAgIHdyYXBcbiAgICAgICAgICAgICAgICB1c2VNYXJrdXBcbiAgICAgICAgICAgICAgICBoYWxpZ249e1NUQVJUfVxuICAgICAgICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICAgICAgICBqdXN0aWZ5RmlsbFxuICAgICAgICAgICAgICAgIGxhYmVsPXtub3RpZi5ib2R5fVxuICAgICAgICAgICAgICAvPn1cbiAgICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICA8L2JveD5cbiAgICAgIDwvYm94PlxuICAgICAgPGJveD5cbiAgICAgICAge25vdGlmLmdldF9hY3Rpb25zKCkubGVuZ3RoID4gMCAmJiA8Ym94IGNsYXNzTmFtZT1cImFjdGlvbnNcIj5cbiAgICAgICAgICB7bm90aWYuZ2V0X2FjdGlvbnMoKS5tYXAoKHsgbGFiZWwsIGlkIH0pID0+IChcbiAgICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgICAgaGV4cGFuZFxuICAgICAgICAgICAgICBvbkNsaWNrZWQ9eygpID0+IG5vdGlmLmludm9rZShpZCl9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIDxsYWJlbCBsYWJlbD17bGFiZWx9IGhhbGlnbj17Q0VOVEVSfSBoZXhwYW5kIC8+XG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICApKX1cbiAgICAgICAgPC9ib3g+fVxuICAgICAgPC9ib3g+XG4gICAgPC9ib3g+XG4gIDwvZXZlbnRib3g+XG59XG5cbi8vIFRoZSBwdXJwb3NlIGlmIHRoaXMgY2xhc3MgaXMgdG8gcmVwbGFjZSBWYXJpYWJsZTxBcnJheTxXaWRnZXQ+PlxuLy8gd2l0aCBhIE1hcDxudW1iZXIsIFdpZGdldD4gdHlwZSBpbiBvcmRlciB0byB0cmFjayBub3RpZmljYXRpb24gd2lkZ2V0c1xuLy8gYnkgdGhlaXIgaWQsIHdoaWxlIG1ha2luZyBpdCBjb252aW5pZW50bHkgYmluZGFibGUgYXMgYW4gYXJyYXlcbmNsYXNzIE5vdGlmaWNhdGlvbk1hcCB7XG4gICAgLy8gdGhlIHVuZGVybHlpbmcgbWFwIHRvIGtlZXAgdHJhY2sgb2YgaWQgd2lkZ2V0IHBhaXJzXG4gICAgbWFwID0gbmV3IE1hcCgpXG5cbiAgICAvLyBpdCBtYWtlcyBzZW5zZSB0byB1c2UgYSBWYXJpYWJsZSB1bmRlciB0aGUgaG9vZCBhbmQgdXNlIGl0c1xuICAgIC8vIHJlYWN0aXZpdHkgaW1wbGVtZW50YXRpb24gaW5zdGVhZCBvZiBrZWVwaW5nIHRyYWNrIG9mIHN1YnNjcmliZXJzIG91cnNlbHZlc1xuICAgIHZhciA9IFZhcmlhYmxlKFtdKVxuXG4gICAgLy8gbm90aWZ5IHN1YnNjcmliZXJzIHRvIHJlcmVuZGVyIHdoZW4gc3RhdGUgY2hhbmdlc1xuICAgIG5vdGlmaXkoKSB7XG4gICAgICAgIHRoaXMudmFyLnNldChbLi4udGhpcy5tYXAudmFsdWVzKCldLnJldmVyc2UoKSlcbiAgICB9XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3Qgbm90aWZkID0gTm90aWZkLmdldF9kZWZhdWx0KClcblxuICAgICAgICAvKipcbiAgICAgICAgICogdW5jb21tZW50IHRoaXMgaWYgeW91IHdhbnQgdG9cbiAgICAgICAgICogaWdub3JlIHRpbWVvdXQgYnkgc2VuZGVycyBhbmQgZW5mb3JjZSBvdXIgb3duIHRpbWVvdXRcbiAgICAgICAgICogbm90ZSB0aGF0IGlmIHRoZSBub3RpZmljYXRpb24gaGFzIGFueSBhY3Rpb25zXG4gICAgICAgICAqIHRoZXkgbWlnaHQgbm90IHdvcmssIHNpbmNlIHRoZSBzZW5kZXIgYWxyZWFkeSB0cmVhdHMgdGhlbSBhcyByZXNvbHZlZFxuICAgICAgICAgKi9cbiAgICAgICAgLy8gbm90aWZkLmlnbm9yZVRpbWVvdXQgPSB0cnVlXG5cbiAgICAgICAgbm90aWZkLmNvbm5lY3QoXCJub3RpZmllZFwiLCAobiwgaWQpID0+IHtcbiAgICAgICAgICAvLyBwcmludCh0eXBlb2Ygbm90aWZkLmdldF9ub3RpZmljYXRpb24oaWQpKVxuICAgICAgICAgICAgdGhpcy5zZXQoaWQsIE5vdGlmKG5vdGlmZC5nZXRfbm90aWZpY2F0aW9uKGlkKSkpXG4gICAgICAgIH0pXG5cbiAgICAgICAgLy8gbm90aWZpY2F0aW9ucyBjYW4gYmUgY2xvc2VkIGJ5IHRoZSBvdXRzaWRlIGJlZm9yZVxuICAgICAgICAvLyBhbnkgdXNlciBpbnB1dCwgd2hpY2ggaGF2ZSB0byBiZSBoYW5kbGVkIHRvb1xuICAgICAgICBub3RpZmQuY29ubmVjdChcInJlc29sdmVkXCIsIChfLCBpZCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5kZWxldGUoaWQpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgLy8gaW4gY2FzZSBvZiByZXBsYWNlY21lbnQgZGVzdHJveSBwcmV2aW91cyB3aWRnZXRcbiAgICAgICAgdGhpcy5tYXAuZ2V0KGtleSk/LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLm1hcC5zZXQoa2V5LCB2YWx1ZSlcbiAgICAgICAgdGhpcy5ub3RpZml5KClcbiAgICB9XG5cbiAgICBkZWxldGUoa2V5KSB7XG4gICAgICAgIHRoaXMubWFwLmdldChrZXkpPy5kZXN0cm95KClcbiAgICAgICAgdGhpcy5tYXAuZGVsZXRlKGtleSlcbiAgICAgICAgdGhpcy5ub3RpZml5KClcbiAgICB9XG5cbiAgICAvLyBuZWVkZWQgYnkgdGhlIFN1YnNjcmliYWJsZSBpbnRlcmZhY2VcbiAgICBnZXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhci5nZXQoKVxuICAgIH1cblxuICAgIC8vIG5lZWRlZCBieSB0aGUgU3Vic2NyaWJhYmxlIGludGVyZmFjZVxuICAgIHN1YnNjcmliZShjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gdGhpcy52YXIuc3Vic2NyaWJlKGNhbGxiYWNrKVxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTm90aWZpY2F0aW9ucyhtb25pdG9yKSB7XG4gIGNvbnN0IHsgVE9QIH0gPSBBc3RhbC5XaW5kb3dBbmNob3I7XG5cbiAgLy8gY29uc3Qgbm90aWZkID0gTm90aWZkLmdldF9kZWZhdWx0KCk7XG5cbiAgY29uc3Qgbm90aWZzID0gbmV3IE5vdGlmaWNhdGlvbk1hcCgpO1xuXG4gIC8vIG5vdGlmZC5jb25uZWN0KFwibm90aWZpZWRcIiwgKVxuXG4gIHJldHVybiA8d2luZG93XG4gICAgZ2RrbW9uaXRvcj17bW9uaXRvcn1cbiAgICBuYW1lc3BhY2U9XCJhZ3Mtbm90aWZkXCJcbiAgICBsYXllcj17QXN0YWwuTGF5ZXIuT1ZFUkxBWX1cbiAgICBhbmNob3I9e1RPUH1cbiAgICBleGNsdXNpdml0eT17QXN0YWwuRXhjbHVzaXZpdHkuTk9STUFMfVxuICAgIGNsYXNzTmFtZT1cIk5vdGlmaWNhdGlvbnNcIj5cbiAgICA8Ym94IHZlcnRpY2FsPlxuICAgICAge2JpbmQobm90aWZzKX1cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiaW1wb3J0IEFwcHMgZnJvbSBcImdpOi8vQXN0YWxBcHBzXCJcbmltcG9ydCB7IEFwcCwgQXN0YWwsIEdkaywgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IHsgYmluZCwgVmFyaWFibGUsIGV4ZWNBc3luYywgZXhlYyB9IGZyb20gXCJhc3RhbFwiXG5cbmNvbnN0IE1BWF9JVEVNUyA9IDhcblxuZnVuY3Rpb24gaGlkZSgpIHtcbiAgQXBwLmdldF93aW5kb3coXCJsYXVuY2hlclwiKS5oaWRlKClcbn1cblxuZnVuY3Rpb24gQXBwQnV0dG9uKHsgYXBwIH0pIHtcbiAgcmV0dXJuIDxidXR0b25cbiAgICBjbGFzc05hbWU9XCJBcHBCdXR0b25cIlxuICAgIG9uQ2xpY2tlZD17KCkgPT4geyBoaWRlKCk7IGFwcC5sYXVuY2goKSB9fT5cbiAgICA8Ym94PlxuICAgICAgPGljb24gaWNvbj17YXBwLmljb25OYW1lfSAvPlxuICAgICAgPGJveCB2YWxpZ249e0d0ay5BbGlnbi5DRU5URVJ9IHZlcnRpY2FsPlxuICAgICAgICA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJuYW1lXCJcbiAgICAgICAgICB0cnVuY2F0ZVxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17YXBwLm5hbWV9XG4gICAgICAgIC8+XG4gICAgICAgIHthcHAuZGVzY3JpcHRpb24gJiYgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVzY3JpcHRpb25cIlxuICAgICAgICAgIHdyYXBcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2FwcC5kZXNjcmlwdGlvbn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cbmZ1bmN0aW9uIHN0cl9mdXp6eSAoc3RyLCBzKSB7XG4gICAgdmFyIGhheSA9IHN0ci50b0xvd2VyQ2FzZSgpLCBpID0gMCwgbiA9IC0xLCBsO1xuICAgIHMgPSBzLnRvTG93ZXJDYXNlKCk7XG4gICAgZm9yICg7IGwgPSBzW2krK10gOykgaWYgKCF+KG4gPSBoYXkuaW5kZXhPZihsLCBuICsgMSkpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCByZXMgPSBWYXJpYWJsZShcIi4uLlwiKVxuY29uc3Qgd2luZG93cyA9IFZhcmlhYmxlKFtdKVxuXG5jb25zdCBwbHVnaW5zID0gW1xuICB7XG4gICAgXCJpbml0XCI6ICgpPT57fSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiBbe1xuICAgICAgXCJsYWJlbFwiOiB0ZXh0LFxuICAgICAgXCJzdWJcIjogXCJydW5cIixcbiAgICAgIFwiaWNvblwiOiBcInV0aWxpdGllcy10ZXJtaW5hbFwiLFxuICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wic2hcIiwgXCItY1wiLCB0ZXh0XSlcbiAgICB9XSxcbiAgICBcInByZWZpeFwiOiBcIi9cIixcbiAgfSxcbiAge1xuICAgIFwiaW5pdFwiOiAoKT0+e30sXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4ge1xuICAgICAgcmVzLnNldChcIi4uLlwiKTtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDApXG4gICAgICAgIGV4ZWNBc3luYyhbXCJxYWxjXCIsIFwiLXRcIiwgdGV4dF0pLnRoZW4ob3V0PT5yZXMuc2V0KG91dCkpLmNhdGNoKGNvbnNvbGUuZXJyb3IpO1xuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIFwibGFiZWxcIjogYmluZChyZXMpLFxuICAgICAgICBcInN1YlwiOiBcImNhbGN1bGF0ZSB1c2luZyBxYWxjXCIsXG4gICAgICAgIFwiaWNvblwiOiBcImFjY2Vzc29yaWVzLWNhbGN1bGF0b3JcIixcbiAgICAgICAgXCJhY3RpdmF0ZVwiOiAoKSA9PiBleGVjQXN5bmMoW1wic2hcIiwgXCItY1wiLCBgZWNobyAke3Jlcy5nZXQoKX0gfCB3bC1jb3B5YF0pXG4gICAgICB9XVxuICAgIH0sXG4gICAgXCJwcmVmaXhcIjogXCI9XCIsXG4gIH0sXG4gIHtcbiAgICBcImluaXRcIjogKCk9PndpbmRvd3Muc2V0KEpTT04ucGFyc2UoZXhlYyhbXCJoeXByY3RsXCIsIFwiLWpcIiwgXCJjbGllbnRzXCJdKSkpLFxuICAgIFwicXVlcnlcIjogKHRleHQpID0+IHdpbmRvd3MuZ2V0KCkubWFwKHdpbmRvdyA9PiB7cmV0dXJuIHtcbiAgICAgIFwibGFiZWxcIjogd2luZG93W1widGl0bGVcIl0sXG4gICAgICBcInN1YlwiOiBgJHt3aW5kb3dbXCJ4d2F5bGFuZFwiXSA/IFwiW1hdIFwiIDogXCJcIn0ke3dpbmRvd1tcImNsYXNzXCJdfSBbJHt3aW5kb3dbXCJwaWRcIl19XSAke3dpbmRvd1tcImZ1bGxzY3JlZW5cIl0gPyBcIihmdWxsc2NyZWVuKSBcIiA6IHdpbmRvd1tcImZsb2F0aW5nXCJdID8gXCIoZmxvYXRpbmcpIFwiIDogXCJcIn1vbiAke3dpbmRvd1tcIndvcmtzcGFjZVwiXVtcImlkXCJdfWAsXG4gICAgICBcImljb25cIjogQXN0YWwuSWNvbi5sb29rdXBfaWNvbih3aW5kb3dbXCJpbml0aWFsQ2xhc3NcIl0pID8gd2luZG93W1wiaW5pdGlhbENsYXNzXCJdIDogd2luZG93W1wiaW5pdGlhbENsYXNzXCJdLnRvTG93ZXJDYXNlKCksXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJoeXByY3RsXCIsIFwiZGlzcGF0Y2hcIiwgXCJmb2N1c3dpbmRvd1wiLCBgYWRkcmVzczoke3dpbmRvd1tcImFkZHJlc3NcIl19YF0pLFxuICAgIH19KS5maWx0ZXIodz0+c3RyX2Z1enp5KHdbXCJsYWJlbFwiXSwgdGV4dCkgfHwgc3RyX2Z1enp5KHdbXCJzdWJcIl0sIHRleHQpKSxcbiAgICBcInByZWZpeFwiOiBcIjtcIixcbiAgfSxcbl1cblxuZnVuY3Rpb24gUGx1Z2luQnV0dG9uKHsgaXRlbSB9KSB7XG4gIHJldHVybiA8YnV0dG9uXG4gICAgb25DbGlja2VkPXsoKSA9PiB7IGhpZGUoKTsgaXRlbS5hY3RpdmF0ZSgpIH19PlxuICAgIDxib3g+XG4gICAgICA8aWNvbiBpY29uPXtpdGVtLmljb259IC8+XG4gICAgICA8Ym94IHZhbGlnbj17R3RrLkFsaWduLkNFTlRFUn0gdmVydGljYWw+XG4gICAgICAgIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cIm5hbWVcIlxuICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXtpdGVtLmxhYmVsfVxuICAgICAgICAvPlxuICAgICAgICB7aXRlbS5zdWIgJiYgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVzY3JpcHRpb25cIlxuICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXtpdGVtLnN1Yn1cbiAgICAgICAgLz59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9idXR0b24+XG59XG5cblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBcHBsYXVuY2hlcigpIHtcbiAgY29uc3QgeyBDRU5URVIgfSA9IEd0ay5BbGlnblxuICBjb25zdCBhcHBzID0gbmV3IEFwcHMuQXBwcygpXG5cbiAgY29uc3QgdGV4dCA9IFZhcmlhYmxlKFwiXCIpXG4gIGNvbnN0IGxpc3QgPSB0ZXh0KHRleHQgPT4ge1xuICAgIGZvciAobGV0IGlkeCBpbiBwbHVnaW5zKSB7XG4gICAgICBpZih0ZXh0LnN1YnN0cmluZygwLCAxKSA9PSBwbHVnaW5zW2lkeF0ucHJlZml4KSB7XG4gICAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKVxuICAgICAgICAgIHBsdWdpbnNbaWR4XS5pbml0KClcbiAgICAgICAgcmV0dXJuIHBsdWdpbnNbaWR4XS5xdWVyeSh0ZXh0LnN1YnN0cmluZygxLCB0ZXh0Lmxlbmd0aCkpXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcHBzLmZ1enp5X3F1ZXJ5KHRleHQpLnNsaWNlKDAsIE1BWF9JVEVNUylcbiAgfSlcbiAgY29uc3Qgb25FbnRlciA9IChpbnB1dGJveCkgPT4ge1xuICAgIGlucHV0Ym94LnBhcmVudC5jaGlsZHJlblsxXS5jaGlsZHJlblswXS5jbGlja2VkKClcbiAgICAvLyBjb25zdCB0ID0gdGV4dC5nZXQoKTtcbiAgICAvLyBmb3IgKGxldCBpZHggaW4gcGx1Z2lucykge1xuICAgIC8vICAgaWYodC5zdWJzdHJpbmcoMCwgMSkgPT0gcGx1Z2luc1tpZHhdLnByZWZpeCkge1xuICAgIC8vICAgICBwbHVnaW5zW2lkeF0ucXVlcnkodC5zdWJzdHJpbmcoMSwgdC5sZW5ndGgpKVswXS5hY3RpdmF0ZSgpXG4gICAgLy8gICAgIGhpZGUoKVxuICAgIC8vICAgICByZXR1cm5cbiAgICAvLyAgIH1cbiAgICAvLyB9XG4gICAgLy8gYXBwcy5mdXp6eV9xdWVyeSh0KT8uWzBdLmxhdW5jaCgpXG4gICAgaGlkZSgpXG4gIH1cblxuICByZXR1cm4gPHdpbmRvd1xuICAgIG5hbWU9XCJsYXVuY2hlclwiXG4gICAgbmFtZXNwYWNlPVwiYWdzLWxhdW5jaGVyXCJcbiAgICBsYXllcj17QXN0YWwuTGF5ZXIuT1ZFUkxBWX1cbiAgICBhbmNob3I9e0FzdGFsLldpbmRvd0FuY2hvci5UT1AgfCBBc3RhbC5XaW5kb3dBbmNob3IuQk9UVE9NfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5JR05PUkV9XG4gICAga2V5bW9kZT17QXN0YWwuS2V5bW9kZS5PTl9ERU1BTkR9XG4gICAgYXBwbGljYXRpb249e0FwcH1cbiAgICB2aXNpYmxlPXtmYWxzZX1cbiAgICBvblNob3c9eyhzZWxmKSA9PiB7dGV4dC5zZXQoXCJcIik7IHNlbGYuZ2V0X2NoaWxkKCkuY2hpbGRyZW5bMV0uY2hpbGRyZW5bMV0uY2hpbGRyZW5bMF0uZ3JhYl9mb2N1c193aXRob3V0X3NlbGVjdGluZygpfX1cbiAgICBvbktleVByZXNzRXZlbnQ9e2Z1bmN0aW9uIChzZWxmLCBldmVudCkge1xuICAgICAgaWYgKGV2ZW50LmdldF9rZXl2YWwoKVsxXSA9PT0gR2RrLktFWV9Fc2NhcGUpXG4gICAgICAgIHNlbGYuaGlkZSgpXG4gICAgfX0+XG4gICAgPGJveD5cbiAgICAgIDxldmVudGJveCB3aWR0aFJlcXVlc3Q9ezIwMDB9IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgICAgPGJveCBoZXhwYW5kPXtmYWxzZX0gdmVydGljYWw+XG4gICAgICAgIDxldmVudGJveCBoZWlnaHRSZXF1ZXN0PXsyMDB9IG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICAgIDxib3ggd2lkdGhSZXF1ZXN0PXs1MDB9IGNsYXNzTmFtZT1cIm1haW5cIiB2ZXJ0aWNhbD5cbiAgICAgICAgICA8ZW50cnlcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyVGV4dD1cIlNlYXJjaFwiXG4gICAgICAgICAgICB0ZXh0PXt0ZXh0KCl9XG4gICAgICAgICAgICBvbkNoYW5nZWQ9e3NlbGYgPT4gdGV4dC5zZXQoc2VsZi50ZXh0KX1cbiAgICAgICAgICAgIG9uQWN0aXZhdGU9e29uRW50ZXJ9XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8Ym94IHNwYWNpbmc9ezZ9IHZlcnRpY2FsPlxuICAgICAgICAgICAge2xpc3QuYXMobGlzdCA9PiBsaXN0Lm1hcChpdGVtID0+IHtcbiAgICAgICAgICAgICAgaWYgKGl0ZW0uYXBwKVxuICAgICAgICAgICAgICAgIHJldHVybiA8QXBwQnV0dG9uIGFwcD17aXRlbX0gLz5cbiAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiA8UGx1Z2luQnV0dG9uIGl0ZW09e2l0ZW19IC8+XG4gICAgICAgICAgICB9KSl9XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPGJveFxuICAgICAgICAgICAgaGFsaWduPXtDRU5URVJ9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJub3QtZm91bmRcIlxuICAgICAgICAgICAgdmVydGljYWxcbiAgICAgICAgICAgIHZpc2libGU9e2xpc3QuYXMobCA9PiBsLmxlbmd0aCA9PT0gMCl9PlxuICAgICAgICAgICAgPGljb24gaWNvbj1cInN5c3RlbS1zZWFyY2gtc3ltYm9saWNcIiAvPlxuICAgICAgICAgICAgPGxhYmVsIGxhYmVsPVwiTm8gbWF0Y2ggZm91bmRcIiAvPlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICA8L2JveD5cbiAgICAgICAgPGV2ZW50Ym94IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgICAgPC9ib3g+XG4gICAgICA8ZXZlbnRib3ggd2lkdGhSZXF1ZXN0PXsyMDAwfSBleHBhbmQgb25DbGljaz17aGlkZX0gLz5cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCB7IEFzdGFsIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IHsgYmluZCwgVmFyaWFibGUsIGV4ZWMsIG1vbml0b3JGaWxlLCByZWFkRmlsZSwgdGltZW91dCB9IGZyb20gXCJhc3RhbFwiXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE9zZChtb25pdG9yKSB7XG4gIGNvbnN0IFNIT1dfVElNRSA9IDE1MDA7XG4gIGNvbnN0IGF1ZGlvID0gV3AuZ2V0X2RlZmF1bHQoKS5hdWRpby5kZWZhdWx0U3BlYWtlcjtcbiAgY29uc3QgZGF0YSA9IFZhcmlhYmxlKDApO1xuICBjb25zdCBpY29uID0gVmFyaWFibGUoXCJcIik7XG4gIGNvbnN0IHNob3cgPSBWYXJpYWJsZSh0cnVlKTtcbiAgY29uc3QgYnJpZ2h0bmVzc19tYXggPSBleGVjKFwiYnJpZ2h0bmVzc2N0bCBtYXhcIik7XG4gIGxldCB0aW1lcjtcbiAgbW9uaXRvckZpbGUoYC9zeXMvY2xhc3MvYmFja2xpZ2h0LyR7ZXhlYyhcInNoIC1jICdscyAtdzEgL3N5cy9jbGFzcy9iYWNrbGlnaHR8aGVhZCAtMSdcIil9L2JyaWdodG5lc3NgLCAoZmlsZSwgZXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQgPT0gMSkge1xuICAgICAgZGF0YS5zZXQocGFyc2VJbnQocmVhZEZpbGUoZmlsZSkpIC8gYnJpZ2h0bmVzc19tYXgpO1xuICAgICAgaWNvbi5zZXQoXCJkaXNwbGF5LWJyaWdodG5lc3Mtc3ltYm9saWNcIilcbiAgICAgIHRpbWVyPy5jYW5jZWwoKVxuICAgICAgc2hvdy5zZXQodHJ1ZSk7XG4gICAgICB0aW1lciA9IHRpbWVvdXQoU0hPV19USU1FLCAoKSA9PiBzaG93LnNldChmYWxzZSkpO1xuICAgIH1cbiAgfSlcblxuICBjb25zdCBzcF9pY28gPSBiaW5kKGF1ZGlvLCBcInZvbHVtZUljb25cIilcbiAgc3BfaWNvLnN1YnNjcmliZShpID0+IHtcbiAgICBpY29uLnNldChpKTtcbiAgICBkYXRhLnNldChhdWRpby52b2x1bWUpO1xuICAgIHRpbWVyPy5jYW5jZWwoKVxuICAgIHNob3cuc2V0KHRydWUpO1xuICAgIHRpbWVyID0gdGltZW91dChTSE9XX1RJTUUsICgpID0+IHNob3cuc2V0KGZhbHNlKSk7XG4gIH0pXG4gIHJldHVybiA8d2luZG93XG4gICAgbW9uaXRvcj17bW9uaXRvcn1cbiAgICBsYXllcj17QXN0YWwuTGF5ZXIuT1ZFUkxBWX1cbiAgICBleGNsdXNpdml0eT17QXN0YWwuRXhjbHVzaXZpdHkuSUdOT1JFfVxuICAgIGFuY2hvcj17QXN0YWwuV2luZG93QW5jaG9yLkJPVFRPTX1cbiAgICBtYXJnaW4tYm90dG9tPXsyMDB9XG4gICAgY2xhc3NOYW1lPVwiT3NkXCJcbiAgICBuYW1lc3BhY2U9XCJhZ3MtbGF1bmNoZXJcIlxuICA+XG4gICAgPGJveCB2aXNpYmxlPXtiaW5kKHNob3cpfT5cbiAgICAgIDxpY29uIGljb249e2JpbmQoaWNvbil9IC8+XG4gICAgICA8bGV2ZWxiYXIgdmFsdWU9e2JpbmQoZGF0YSl9IHdpZHRoUmVxdWVzdD17MTUwfSAvPlxuICAgICAgPGxhYmVsIGxhYmVsPXtiaW5kKGRhdGEpLmFzKHYgPT4gYCR7TWF0aC5yb3VuZCh2ICogMTAwKX0lYCl9IC8+XG4gICAgPC9ib3g+XG4gIDwvd2luZG93PlxufVxuIiwgIiMhL3Vzci9iaW4vZ2pzIC1tXG5pbXBvcnQgeyBBcHAgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiO1xuaW1wb3J0IHN0eWxlIGZyb20gXCIuL3N0eWxlLnNjc3NcIjtcbmltcG9ydCBCYXIgZnJvbSBcIi4vd2lkZ2V0L0JhclwiO1xuaW1wb3J0IE5vdGlmaWNhdGlvbnMgZnJvbSBcIi4vd2lkZ2V0L05vdGlmaWNhdGlvbnNcIjtcbmltcG9ydCBMYXVuY2hlciBmcm9tIFwiLi93aWRnZXQvTGF1bmNoZXJcIjtcbmltcG9ydCBPc2QgZnJvbSBcIi4vd2lkZ2V0L09zZFwiO1xuXG5BcHAuc3RhcnQoe1xuICBjc3M6IHN0eWxlLFxuICBpbnN0YW5jZU5hbWU6IFwic2hlbGxcIixcbiAgcmVxdWVzdEhhbmRsZXIocmVxdWVzdCwgcmVzKSB7XG4gICAgaWYgKHJlcXVlc3QgPT0gXCJsYXVuY2hlclwiKSB7XG4gICAgICBBcHAuZ2V0X3dpbmRvdyhcImxhdW5jaGVyXCIpLnNob3coKVxuICAgICAgcmVzKFwib2tcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByaW50KFwidW5rbm93biByZXF1ZXN0OlwiLCByZXF1ZXN0KTtcbiAgICAgIHJlcyhcInVua25vd24gcmVxdWVzdFwiKTtcbiAgICB9XG4gIH0sXG4gIG1haW46ICgpID0+IEFwcC5nZXRfbW9uaXRvcnMoKS5mb3JFYWNoKChtKSA9PiB7XG4gICAgaWYgKG0ubW9kZWwgPT0gXCIweDA4RTJcIikge1xuICAgICAgQmFyKG0pO1xuICAgICAgTm90aWZpY2F0aW9ucyhtKTtcbiAgICAgIExhdW5jaGVyKG0pO1xuICAgICAgT3NkKG0pO1xuICAgIH1cbiAgfSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQUFBLE9BQU9BLFlBQVc7QUFDbEIsT0FBT0MsVUFBUztBQUNoQixPQUFPLFNBQVM7OztBQ0ZoQixPQUFPQyxZQUFXO0FBQ2xCLE9BQU8sU0FBUztBQUVoQixPQUFPLGFBQWE7OztBQ0hwQixPQUFPLFdBQVc7QUFRWCxJQUFNLEVBQUUsUUFBUSxJQUFJO0FBVXBCLFNBQVMsV0FDWixXQUNBLFFBQWtDLE9BQ2xDLFFBQWtDLFVBQ3BDO0FBQ0UsUUFBTSxPQUFPLE1BQU0sUUFBUSxTQUFTLEtBQUssT0FBTyxjQUFjO0FBQzlELFFBQU0sRUFBRSxLQUFLLEtBQUssSUFBSSxJQUFJO0FBQUEsSUFDdEIsS0FBSyxPQUFPLFlBQVksVUFBVTtBQUFBLElBQ2xDLEtBQUssT0FBTyxRQUFRLFVBQVUsT0FBTztBQUFBLElBQ3JDLEtBQUssT0FBTyxRQUFRLFVBQVUsT0FBTztBQUFBLEVBQ3pDO0FBRUEsUUFBTSxPQUFPLE1BQU0sUUFBUSxHQUFHLElBQ3hCLE1BQU0sUUFBUSxZQUFZLEdBQUcsSUFDN0IsTUFBTSxRQUFRLFdBQVcsR0FBRztBQUVsQyxPQUFLLFFBQVEsVUFBVSxDQUFDLEdBQUcsV0FBbUIsSUFBSSxNQUFNLENBQUM7QUFDekQsT0FBSyxRQUFRLFVBQVUsQ0FBQyxHQUFHLFdBQW1CLElBQUksTUFBTSxDQUFDO0FBQ3pELFNBQU87QUFDWDtBQUdPLFNBQVMsS0FBSyxLQUF3QjtBQUN6QyxTQUFPLE1BQU0sUUFBUSxHQUFHLElBQ2xCLE1BQU0sUUFBUSxNQUFNLEdBQUcsSUFDdkIsTUFBTSxRQUFR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LE1BQUFBLEtBQUksaUJBQWlCO0FBQUEsSUFDdkI7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNLE1BQU0sWUFBSSxhQUFhLEVBQUUsUUFBUSxDQUFDLE1BQU07QUFDNUMsUUFBSSxFQUFFLFNBQVMsVUFBVTtBQUN2QixVQUFJLENBQUM7QUFDTCxvQkFBYyxDQUFDO0FBQ2Ysa0JBQVMsQ0FBQztBQUNWLFVBQUksQ0FBQztBQUFBLElBQ1A7QUFBQSxFQUNGLENBQUM7QUFDSCxDQUFDOyIsCiAgIm5hbWVzIjogWyJBc3RhbCIsICJHdGsiLCAiQXN0YWwiLCAicmVzIiwgIkFzdGFsIiwgImJpbmQiLCAiQXN0YWwiLCAiaW50ZXJ2YWwiLCAidGltZW91dCIsICJBc3RhbCIsICJ2IiwgImludGVydmFsIiwgImV4ZWMiLCAiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgInNuYWtlaWZ5IiwgInBhdGNoIiwgIkFwcHMiLCAiSHlwcmxhbmQiLCAiTm90aWZkIiwgIkdPYmplY3QiLCAicmVzIiwgIkd0ayIsICJBc3RhbCIsICJBc3RhbCIsICJHdGsiLCAiR09iamVjdCIsICJBc3RhbCIsICJHT2JqZWN0IiwgIkd0ayIsICJkZWZhdWx0IiwgIkFzdGFsIiwgIkFzdGFsIiwgIkFzdGFsIiwgIkdPYmplY3QiLCAiZGVmYXVsdCIsICJHT2JqZWN0IiwgIkFzdGFsIiwgIkd0ayIsICJHdGsiLCAiZGVmYXVsdCIsICJBc3RhbCIsICJ3aWZpIiwgIkd0ayIsICJBc3RhbCIsICJHdGsiLCAiQXN0YWwiLCAiR3RrIiwgIkNFTlRFUiIsICJ0ZXh0IiwgImxpc3QiLCAiV3AiLCAiV3AiLCAiQXN0YWwiLCAicmVzIl0KfQo=
