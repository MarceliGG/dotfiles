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
        return /* @__PURE__ */ jsx("label", { label: bind(client, "title") });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9ndGszL2luZGV4LnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hc3RhbGlmeS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL3Byb2Nlc3MudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy92YXJpYWJsZS50cyIsICIuLi8uLi8uLi8uLi91c3Ivc2hhcmUvYXN0YWwvZ2pzL2JpbmRpbmcudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy90aW1lLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9hcHAudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9vdmVycmlkZXMudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9fYXBwLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy93aWRnZXQudHMiLCAic2FzczovaG9tZS9tYXJjZWwvLmNvbmZpZy9hZ3MvaG9yaXpvbnRhbC9zdHlsZS5zY3NzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvaW5kZXgudHMiLCAiLi4vLi4vLi4vLi4vdXNyL3NoYXJlL2FzdGFsL2dqcy9maWxlLnRzIiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ29iamVjdC50cyIsICJob3Jpem9udGFsL3dpZGdldC9CYXIuanN4IiwgImhvcml6b250YWwvd2lkZ2V0L3dvcmtzcGFjZXMuanN4IiwgIi4uLy4uLy4uLy4uL3Vzci9zaGFyZS9hc3RhbC9nanMvZ3RrMy9qc3gtcnVudGltZS50cyIsICJob3Jpem9udGFsL3dpZGdldC90cmF5LmpzeCIsICJob3Jpem9udGFsL3dpZGdldC9Ob3RpZmljYXRpb25zLmpzeCIsICJob3Jpem9udGFsL3dpZGdldC9MYXVuY2hlci5qc3giLCAiaG9yaXpvbnRhbC93aWRnZXQvT3NkLmpzeCIsICJob3Jpem9udGFsL2FwcC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHZGsgZnJvbSBcImdpOi8vR2RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBhc3RhbGlmeSwgeyB0eXBlIENvbnN0cnVjdFByb3BzLCB0eXBlIEJpbmRhYmxlUHJvcHMgfSBmcm9tIFwiLi9hc3RhbGlmeS5qc1wiXG5cbmV4cG9ydCB7IEFzdGFsLCBHdGssIEdkayB9XG5leHBvcnQgeyBkZWZhdWx0IGFzIEFwcCB9IGZyb20gXCIuL2FwcC5qc1wiXG5leHBvcnQgeyBhc3RhbGlmeSwgQ29uc3RydWN0UHJvcHMsIEJpbmRhYmxlUHJvcHMgfVxuZXhwb3J0ICogYXMgV2lkZ2V0IGZyb20gXCIuL3dpZGdldC5qc1wiXG4iLCAiaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHZGsgZnJvbSBcImdpOi8vR2RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuaW1wb3J0IHsgZXhlY0FzeW5jIH0gZnJvbSBcIi4uL3Byb2Nlc3MuanNcIlxuaW1wb3J0IFZhcmlhYmxlIGZyb20gXCIuLi92YXJpYWJsZS5qc1wiXG5pbXBvcnQgQmluZGluZywgeyBrZWJhYmlmeSwgc25ha2VpZnksIHR5cGUgQ29ubmVjdGFibGUsIHR5cGUgU3Vic2NyaWJhYmxlIH0gZnJvbSBcIi4uL2JpbmRpbmcuanNcIlxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VCaW5kaW5ncyhhcnJheTogYW55W10pIHtcbiAgICBmdW5jdGlvbiBnZXRWYWx1ZXMoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgbGV0IGkgPSAwXG4gICAgICAgIHJldHVybiBhcnJheS5tYXAodmFsdWUgPT4gdmFsdWUgaW5zdGFuY2VvZiBCaW5kaW5nXG4gICAgICAgICAgICA/IGFyZ3NbaSsrXVxuICAgICAgICAgICAgOiB2YWx1ZSxcbiAgICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGJpbmRpbmdzID0gYXJyYXkuZmlsdGVyKGkgPT4gaSBpbnN0YW5jZW9mIEJpbmRpbmcpXG5cbiAgICBpZiAoYmluZGluZ3MubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gYXJyYXlcblxuICAgIGlmIChiaW5kaW5ncy5sZW5ndGggPT09IDEpXG4gICAgICAgIHJldHVybiBiaW5kaW5nc1swXS5hcyhnZXRWYWx1ZXMpXG5cbiAgICByZXR1cm4gVmFyaWFibGUuZGVyaXZlKGJpbmRpbmdzLCBnZXRWYWx1ZXMpKClcbn1cblxuZnVuY3Rpb24gc2V0UHJvcChvYmo6IGFueSwgcHJvcDogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gdGhlIHNldHRlciBtZXRob2QgaGFzIHRvIGJlIHVzZWQgYmVjYXVzZVxuICAgICAgICAvLyBhcnJheSBsaWtlIHByb3BlcnRpZXMgYXJlIG5vdCBib3VuZCBjb3JyZWN0bHkgYXMgcHJvcHNcbiAgICAgICAgY29uc3Qgc2V0dGVyID0gYHNldF8ke3NuYWtlaWZ5KHByb3ApfWBcbiAgICAgICAgaWYgKHR5cGVvZiBvYmpbc2V0dGVyXSA9PT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgcmV0dXJuIG9ialtzZXR0ZXJdKHZhbHVlKVxuXG4gICAgICAgIHJldHVybiAob2JqW3Byb3BdID0gdmFsdWUpXG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBjb3VsZCBub3Qgc2V0IHByb3BlcnR5IFwiJHtwcm9wfVwiIG9uICR7b2JqfTpgLCBlcnJvcilcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGFzdGFsaWZ5PFxuICAgIEMgZXh0ZW5kcyB7IG5ldyguLi5hcmdzOiBhbnlbXSk6IEd0ay5XaWRnZXQgfSxcbj4oY2xzOiBDLCBjbHNOYW1lID0gY2xzLm5hbWUpIHtcbiAgICBjbGFzcyBXaWRnZXQgZXh0ZW5kcyBjbHMge1xuICAgICAgICBnZXQgY3NzKCk6IHN0cmluZyB7IHJldHVybiBBc3RhbC53aWRnZXRfZ2V0X2Nzcyh0aGlzKSB9XG4gICAgICAgIHNldCBjc3MoY3NzOiBzdHJpbmcpIHsgQXN0YWwud2lkZ2V0X3NldF9jc3ModGhpcywgY3NzKSB9XG4gICAgICAgIGdldF9jc3MoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuY3NzIH1cbiAgICAgICAgc2V0X2Nzcyhjc3M6IHN0cmluZykgeyB0aGlzLmNzcyA9IGNzcyB9XG5cbiAgICAgICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jbGFzc19uYW1lcyh0aGlzKS5qb2luKFwiIFwiKSB9XG4gICAgICAgIHNldCBjbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpIHsgQXN0YWwud2lkZ2V0X3NldF9jbGFzc19uYW1lcyh0aGlzLCBjbGFzc05hbWUuc3BsaXQoL1xccysvKSkgfVxuICAgICAgICBnZXRfY2xhc3NfbmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5jbGFzc05hbWUgfVxuICAgICAgICBzZXRfY2xhc3NfbmFtZShjbGFzc05hbWU6IHN0cmluZykgeyB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZSB9XG5cbiAgICAgICAgZ2V0IGN1cnNvcigpOiBDdXJzb3IgeyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jdXJzb3IodGhpcykgYXMgQ3Vyc29yIH1cbiAgICAgICAgc2V0IGN1cnNvcihjdXJzb3I6IEN1cnNvcikgeyBBc3RhbC53aWRnZXRfc2V0X2N1cnNvcih0aGlzLCBjdXJzb3IpIH1cbiAgICAgICAgZ2V0X2N1cnNvcigpOiBDdXJzb3IgeyByZXR1cm4gdGhpcy5jdXJzb3IgfVxuICAgICAgICBzZXRfY3Vyc29yKGN1cnNvcjogQ3Vyc29yKSB7IHRoaXMuY3Vyc29yID0gY3Vyc29yIH1cblxuICAgICAgICBnZXQgY2xpY2tUaHJvdWdoKCk6IGJvb2xlYW4geyByZXR1cm4gQXN0YWwud2lkZ2V0X2dldF9jbGlja190aHJvdWdoKHRoaXMpIH1cbiAgICAgICAgc2V0IGNsaWNrVGhyb3VnaChjbGlja1Rocm91Z2g6IGJvb2xlYW4pIHsgQXN0YWwud2lkZ2V0X3NldF9jbGlja190aHJvdWdoKHRoaXMsIGNsaWNrVGhyb3VnaCkgfVxuICAgICAgICBnZXRfY2xpY2tfdGhyb3VnaCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuY2xpY2tUaHJvdWdoIH1cbiAgICAgICAgc2V0X2NsaWNrX3Rocm91Z2goY2xpY2tUaHJvdWdoOiBib29sZWFuKSB7IHRoaXMuY2xpY2tUaHJvdWdoID0gY2xpY2tUaHJvdWdoIH1cblxuICAgICAgICBkZWNsYXJlIHByaXZhdGUgX19ub19pbXBsaWNpdF9kZXN0cm95OiBib29sZWFuXG4gICAgICAgIGdldCBub0ltcGxpY2l0RGVzdHJveSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX19ub19pbXBsaWNpdF9kZXN0cm95IH1cbiAgICAgICAgc2V0IG5vSW1wbGljaXREZXN0cm95KHZhbHVlOiBib29sZWFuKSB7IHRoaXMuX19ub19pbXBsaWNpdF9kZXN0cm95ID0gdmFsdWUgfVxuXG4gICAgICAgIF9zZXRDaGlsZHJlbihjaGlsZHJlbjogR3RrLldpZGdldFtdKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGNoaWxkcmVuLmZsYXQoSW5maW5pdHkpLm1hcChjaCA9PiBjaCBpbnN0YW5jZW9mIEd0ay5XaWRnZXRcbiAgICAgICAgICAgICAgICA/IGNoXG4gICAgICAgICAgICAgICAgOiBuZXcgR3RrLkxhYmVsKHsgdmlzaWJsZTogdHJ1ZSwgbGFiZWw6IFN0cmluZyhjaCkgfSkpXG5cbiAgICAgICAgICAgIC8vIHJlbW92ZVxuICAgICAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBHdGsuQmluKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2ggPSB0aGlzLmdldF9jaGlsZCgpXG4gICAgICAgICAgICAgICAgaWYgKGNoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZShjaClcbiAgICAgICAgICAgICAgICBpZiAoY2ggJiYgIWNoaWxkcmVuLmluY2x1ZGVzKGNoKSAmJiAhdGhpcy5ub0ltcGxpY2l0RGVzdHJveSlcbiAgICAgICAgICAgICAgICAgICAgY2g/LmRlc3Ryb3koKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEd0ay5Db250YWluZXIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuZ2V0X2NoaWxkcmVuKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1vdmUoY2gpXG4gICAgICAgICAgICAgICAgICAgIGlmICghY2hpbGRyZW4uaW5jbHVkZXMoY2gpICYmICF0aGlzLm5vSW1wbGljaXREZXN0cm95KVxuICAgICAgICAgICAgICAgICAgICAgICAgY2g/LmRlc3Ryb3koKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVE9ETzogYWRkIG1vcmUgY29udGFpbmVyIHR5cGVzXG4gICAgICAgICAgICBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLkJveCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkcmVuKGNoaWxkcmVuKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQXN0YWwuU3RhY2spIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldF9jaGlsZHJlbihjaGlsZHJlbilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEFzdGFsLkNlbnRlckJveCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRXaWRnZXQgPSBjaGlsZHJlblswXVxuICAgICAgICAgICAgICAgIHRoaXMuY2VudGVyV2lkZ2V0ID0gY2hpbGRyZW5bMV1cbiAgICAgICAgICAgICAgICB0aGlzLmVuZFdpZGdldCA9IGNoaWxkcmVuWzJdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBBc3RhbC5PdmVybGF5KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgW2NoaWxkLCAuLi5vdmVybGF5c10gPSBjaGlsZHJlblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0X2NoaWxkKGNoaWxkKVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0X292ZXJsYXlzKG92ZXJsYXlzKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgR3RrLkNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2ggb2YgY2hpbGRyZW4pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkKGNoKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihgY2FuIG5vdCBhZGQgY2hpbGRyZW4gdG8gJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9LCBpdCBpcyBub3QgYSBjb250YWluZXIgd2lkZ2V0YClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRvZ2dsZUNsYXNzTmFtZShjbjogc3RyaW5nLCBjb25kID0gdHJ1ZSkge1xuICAgICAgICAgICAgQXN0YWwud2lkZ2V0X3RvZ2dsZV9jbGFzc19uYW1lKHRoaXMsIGNuLCBjb25kKVxuICAgICAgICB9XG5cbiAgICAgICAgaG9vayhcbiAgICAgICAgICAgIG9iamVjdDogQ29ubmVjdGFibGUsXG4gICAgICAgICAgICBzaWduYWw6IHN0cmluZyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiAoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICAgICAgICk6IHRoaXNcbiAgICAgICAgaG9vayhcbiAgICAgICAgICAgIG9iamVjdDogU3Vic2NyaWJhYmxlLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzZWxmOiB0aGlzLCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgICAgICAgKTogdGhpc1xuICAgICAgICBob29rKFxuICAgICAgICAgICAgb2JqZWN0OiBDb25uZWN0YWJsZSB8IFN1YnNjcmliYWJsZSxcbiAgICAgICAgICAgIHNpZ25hbE9yQ2FsbGJhY2s6IHN0cmluZyB8ICgoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQpLFxuICAgICAgICAgICAgY2FsbGJhY2s/OiAoc2VsZjogdGhpcywgLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICAgICAgICkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3QuY29ubmVjdCA9PT0gXCJmdW5jdGlvblwiICYmIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBvYmplY3QuY29ubmVjdChzaWduYWxPckNhbGxiYWNrLCAoXzogYW55LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodGhpcywgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAob2JqZWN0LmRpc2Nvbm5lY3QgYXMgQ29ubmVjdGFibGVbXCJkaXNjb25uZWN0XCJdKShpZClcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2Ygb2JqZWN0LnN1YnNjcmliZSA9PT0gXCJmdW5jdGlvblwiICYmIHR5cGVvZiBzaWduYWxPckNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnN1YiA9IG9iamVjdC5zdWJzY3JpYmUoKC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzaWduYWxPckNhbGxiYWNrKHRoaXMsIC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3QoXCJkZXN0cm95XCIsIHVuc3ViKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3RydWN0b3IoLi4ucGFyYW1zOiBhbnlbXSkge1xuICAgICAgICAgICAgc3VwZXIoKVxuICAgICAgICAgICAgY29uc3QgW2NvbmZpZ10gPSBwYXJhbXNcblxuICAgICAgICAgICAgY29uc3QgeyBzZXR1cCwgY2hpbGQsIGNoaWxkcmVuID0gW10sIC4uLnByb3BzIH0gPSBjb25maWdcbiAgICAgICAgICAgIHByb3BzLnZpc2libGUgPz89IHRydWVcblxuICAgICAgICAgICAgaWYgKGNoaWxkKVxuICAgICAgICAgICAgICAgIGNoaWxkcmVuLnVuc2hpZnQoY2hpbGQpXG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYmluZGluZ3NcbiAgICAgICAgICAgIGNvbnN0IGJpbmRpbmdzID0gT2JqZWN0LmtleXMocHJvcHMpLnJlZHVjZSgoYWNjOiBhbnksIHByb3ApID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocHJvcHNbcHJvcF0gaW5zdGFuY2VvZiBCaW5kaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJpbmRpbmcgPSBwcm9wc1twcm9wXVxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcHJvcHNbcHJvcF1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsuLi5hY2MsIFtwcm9wLCBiaW5kaW5nXV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgICAgfSwgW10pXG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3Qgc2lnbmFsIGhhbmRsZXJzXG4gICAgICAgICAgICBjb25zdCBvbkhhbmRsZXJzID0gT2JqZWN0LmtleXMocHJvcHMpLnJlZHVjZSgoYWNjOiBhbnksIGtleSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aChcIm9uXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpZyA9IGtlYmFiaWZ5KGtleSkuc3BsaXQoXCItXCIpLnNsaWNlKDEpLmpvaW4oXCItXCIpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBwcm9wc1trZXldXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBwcm9wc1trZXldXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbLi4uYWNjLCBbc2lnLCBoYW5kbGVyXV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgICAgfSwgW10pXG5cbiAgICAgICAgICAgIC8vIHNldCBjaGlsZHJlblxuICAgICAgICAgICAgY29uc3QgbWVyZ2VkQ2hpbGRyZW4gPSBtZXJnZUJpbmRpbmdzKGNoaWxkcmVuLmZsYXQoSW5maW5pdHkpKVxuICAgICAgICAgICAgaWYgKG1lcmdlZENoaWxkcmVuIGluc3RhbmNlb2YgQmluZGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKG1lcmdlZENoaWxkcmVuLmdldCgpKVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgbWVyZ2VkQ2hpbGRyZW4uc3Vic2NyaWJlKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldENoaWxkcmVuKHYpXG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAobWVyZ2VkQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRDaGlsZHJlbihtZXJnZWRDaGlsZHJlbilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldHVwIHNpZ25hbCBoYW5kbGVyc1xuICAgICAgICAgICAgZm9yIChjb25zdCBbc2lnbmFsLCBjYWxsYmFja10gb2Ygb25IYW5kbGVycykge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3Qoc2lnbmFsLCBjYWxsYmFjaylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChzaWduYWwsICgpID0+IGV4ZWNBc3luYyhjYWxsYmFjaylcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKHByaW50KS5jYXRjaChjb25zb2xlLmVycm9yKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldHVwIGJpbmRpbmdzIGhhbmRsZXJzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwcm9wLCBiaW5kaW5nXSBvZiBiaW5kaW5ncykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wID09PSBcImNoaWxkXCIgfHwgcHJvcCA9PT0gXCJjaGlsZHJlblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgYmluZGluZy5zdWJzY3JpYmUoKHY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0Q2hpbGRyZW4odilcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdChcImRlc3Ryb3lcIiwgYmluZGluZy5zdWJzY3JpYmUoKHY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzZXRQcm9wKHRoaXMsIHByb3AsIHYpXG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgc2V0UHJvcCh0aGlzLCBwcm9wLCBiaW5kaW5nLmdldCgpKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIHByb3BzKVxuICAgICAgICAgICAgc2V0dXA/Lih0aGlzKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgR1R5cGVOYW1lOiBgQXN0YWxfJHtjbHNOYW1lfWAsXG4gICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIFwiY2xhc3MtbmFtZVwiOiBHT2JqZWN0LlBhcmFtU3BlYy5zdHJpbmcoXG4gICAgICAgICAgICAgICAgXCJjbGFzcy1uYW1lXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiXCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjc3NcIjogR09iamVjdC5QYXJhbVNwZWMuc3RyaW5nKFxuICAgICAgICAgICAgICAgIFwiY3NzXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiXCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgXCJjdXJzb3JcIjogR09iamVjdC5QYXJhbVNwZWMuc3RyaW5nKFxuICAgICAgICAgICAgICAgIFwiY3Vyc29yXCIsIFwiXCIsIFwiXCIsIEdPYmplY3QuUGFyYW1GbGFncy5SRUFEV1JJVEUsIFwiZGVmYXVsdFwiLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIFwiY2xpY2stdGhyb3VnaFwiOiBHT2JqZWN0LlBhcmFtU3BlYy5ib29sZWFuKFxuICAgICAgICAgICAgICAgIFwiY2xpY2stdGhyb3VnaFwiLCBcIlwiLCBcIlwiLCBHT2JqZWN0LlBhcmFtRmxhZ3MuUkVBRFdSSVRFLCBmYWxzZSxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBcIm5vLWltcGxpY2l0LWRlc3Ryb3lcIjogR09iamVjdC5QYXJhbVNwZWMuYm9vbGVhbihcbiAgICAgICAgICAgICAgICBcIm5vLWltcGxpY2l0LWRlc3Ryb3lcIiwgXCJcIiwgXCJcIiwgR09iamVjdC5QYXJhbUZsYWdzLlJFQURXUklURSwgZmFsc2UsXG4gICAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgIH0sIFdpZGdldClcblxuICAgIHJldHVybiBXaWRnZXRcbn1cblxuZXhwb3J0IHR5cGUgQmluZGFibGVQcm9wczxUPiA9IHtcbiAgICBbSyBpbiBrZXlvZiBUXTogQmluZGluZzxUW0tdPiB8IFRbS107XG59XG5cbnR5cGUgU2lnSGFuZGxlcjxcbiAgICBXIGV4dGVuZHMgSW5zdGFuY2VUeXBlPHR5cGVvZiBHdGsuV2lkZ2V0PixcbiAgICBBcmdzIGV4dGVuZHMgQXJyYXk8dW5rbm93bj4sXG4+ID0gKChzZWxmOiBXLCAuLi5hcmdzOiBBcmdzKSA9PiB1bmtub3duKSB8IHN0cmluZyB8IHN0cmluZ1tdXG5cbmV4cG9ydCB0eXBlIENvbnN0cnVjdFByb3BzPFxuICAgIFNlbGYgZXh0ZW5kcyBJbnN0YW5jZVR5cGU8dHlwZW9mIEd0ay5XaWRnZXQ+LFxuICAgIFByb3BzIGV4dGVuZHMgR3RrLldpZGdldC5Db25zdHJ1Y3RvclByb3BzLFxuICAgIFNpZ25hbHMgZXh0ZW5kcyBSZWNvcmQ8YG9uJHtzdHJpbmd9YCwgQXJyYXk8dW5rbm93bj4+ID0gUmVjb3JkPGBvbiR7c3RyaW5nfWAsIGFueVtdPixcbj4gPSBQYXJ0aWFsPHtcbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGNhbid0IGFzc2lnbiB0byB1bmtub3duLCBidXQgaXQgd29ya3MgYXMgZXhwZWN0ZWQgdGhvdWdoXG4gICAgW1MgaW4ga2V5b2YgU2lnbmFsc106IFNpZ0hhbmRsZXI8U2VsZiwgU2lnbmFsc1tTXT5cbn0+ICYgUGFydGlhbDx7XG4gICAgW0tleSBpbiBgb24ke3N0cmluZ31gXTogU2lnSGFuZGxlcjxTZWxmLCBhbnlbXT5cbn0+ICYgQmluZGFibGVQcm9wczxQYXJ0aWFsPFByb3BzPiAmIHtcbiAgICBjbGFzc05hbWU/OiBzdHJpbmdcbiAgICBjc3M/OiBzdHJpbmdcbiAgICBjdXJzb3I/OiBzdHJpbmdcbiAgICBjbGlja1Rocm91Z2g/OiBib29sZWFuXG59PiAmIHtcbiAgICBvbkRlc3Ryb3k/OiAoc2VsZjogU2VsZikgPT4gdW5rbm93blxuICAgIG9uRHJhdz86IChzZWxmOiBTZWxmKSA9PiB1bmtub3duXG4gICAgb25LZXlQcmVzc0V2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbktleVJlbGVhc2VFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25CdXR0b25QcmVzc0V2ZW50PzogKHNlbGY6IFNlbGYsIGV2ZW50OiBHZGsuRXZlbnQpID0+IHVua25vd25cbiAgICBvbkJ1dHRvblJlbGVhc2VFdmVudD86IChzZWxmOiBTZWxmLCBldmVudDogR2RrLkV2ZW50KSA9PiB1bmtub3duXG4gICAgb25SZWFsaXplPzogKHNlbGY6IFNlbGYpID0+IHVua25vd25cbiAgICBzZXR1cD86IChzZWxmOiBTZWxmKSA9PiB2b2lkXG59XG5cbmV4cG9ydCB0eXBlIEJpbmRhYmxlQ2hpbGQgPSBHdGsuV2lkZ2V0IHwgQmluZGluZzxHdGsuV2lkZ2V0PlxuXG50eXBlIEN1cnNvciA9XG4gICAgfCBcImRlZmF1bHRcIlxuICAgIHwgXCJoZWxwXCJcbiAgICB8IFwicG9pbnRlclwiXG4gICAgfCBcImNvbnRleHQtbWVudVwiXG4gICAgfCBcInByb2dyZXNzXCJcbiAgICB8IFwid2FpdFwiXG4gICAgfCBcImNlbGxcIlxuICAgIHwgXCJjcm9zc2hhaXJcIlxuICAgIHwgXCJ0ZXh0XCJcbiAgICB8IFwidmVydGljYWwtdGV4dFwiXG4gICAgfCBcImFsaWFzXCJcbiAgICB8IFwiY29weVwiXG4gICAgfCBcIm5vLWRyb3BcIlxuICAgIHwgXCJtb3ZlXCJcbiAgICB8IFwibm90LWFsbG93ZWRcIlxuICAgIHwgXCJncmFiXCJcbiAgICB8IFwiZ3JhYmJpbmdcIlxuICAgIHwgXCJhbGwtc2Nyb2xsXCJcbiAgICB8IFwiY29sLXJlc2l6ZVwiXG4gICAgfCBcInJvdy1yZXNpemVcIlxuICAgIHwgXCJuLXJlc2l6ZVwiXG4gICAgfCBcImUtcmVzaXplXCJcbiAgICB8IFwicy1yZXNpemVcIlxuICAgIHwgXCJ3LXJlc2l6ZVwiXG4gICAgfCBcIm5lLXJlc2l6ZVwiXG4gICAgfCBcIm53LXJlc2l6ZVwiXG4gICAgfCBcInN3LXJlc2l6ZVwiXG4gICAgfCBcInNlLXJlc2l6ZVwiXG4gICAgfCBcImV3LXJlc2l6ZVwiXG4gICAgfCBcIm5zLXJlc2l6ZVwiXG4gICAgfCBcIm5lc3ctcmVzaXplXCJcbiAgICB8IFwibndzZS1yZXNpemVcIlxuICAgIHwgXCJ6b29tLWluXCJcbiAgICB8IFwiem9vbS1vdXRcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcblxudHlwZSBBcmdzID0ge1xuICAgIGNtZDogc3RyaW5nIHwgc3RyaW5nW11cbiAgICBvdXQ/OiAoc3Rkb3V0OiBzdHJpbmcpID0+IHZvaWRcbiAgICBlcnI/OiAoc3RkZXJyOiBzdHJpbmcpID0+IHZvaWRcbn1cblxuZXhwb3J0IGNvbnN0IHsgUHJvY2VzcyB9ID0gQXN0YWxcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoYXJnczogQXJncyk6IEFzdGFsLlByb2Nlc3NcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoXG4gICAgY21kOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICBvbk91dD86IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZCxcbiAgICBvbkVycj86IChzdGRlcnI6IHN0cmluZykgPT4gdm9pZCxcbik6IEFzdGFsLlByb2Nlc3NcblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnByb2Nlc3MoXG4gICAgYXJnc09yQ21kOiBBcmdzIHwgc3RyaW5nIHwgc3RyaW5nW10sXG4gICAgb25PdXQ6IChzdGRvdXQ6IHN0cmluZykgPT4gdm9pZCA9IHByaW50LFxuICAgIG9uRXJyOiAoc3RkZXJyOiBzdHJpbmcpID0+IHZvaWQgPSBwcmludGVycixcbikge1xuICAgIGNvbnN0IGFyZ3MgPSBBcnJheS5pc0FycmF5KGFyZ3NPckNtZCkgfHwgdHlwZW9mIGFyZ3NPckNtZCA9PT0gXCJzdHJpbmdcIlxuICAgIGNvbnN0IHsgY21kLCBlcnIsIG91dCB9ID0ge1xuICAgICAgICBjbWQ6IGFyZ3MgPyBhcmdzT3JDbWQgOiBhcmdzT3JDbWQuY21kLFxuICAgICAgICBlcnI6IGFyZ3MgPyBvbkVyciA6IGFyZ3NPckNtZC5lcnIgfHwgb25FcnIsXG4gICAgICAgIG91dDogYXJncyA/IG9uT3V0IDogYXJnc09yQ21kLm91dCB8fCBvbk91dCxcbiAgICB9XG5cbiAgICBjb25zdCBwcm9jID0gQXJyYXkuaXNBcnJheShjbWQpXG4gICAgICAgID8gQXN0YWwuUHJvY2Vzcy5zdWJwcm9jZXNzdihjbWQpXG4gICAgICAgIDogQXN0YWwuUHJvY2Vzcy5zdWJwcm9jZXNzKGNtZClcblxuICAgIHByb2MuY29ubmVjdChcInN0ZG91dFwiLCAoXywgc3Rkb3V0OiBzdHJpbmcpID0+IG91dChzdGRvdXQpKVxuICAgIHByb2MuY29ubmVjdChcInN0ZGVyclwiLCAoXywgc3RkZXJyOiBzdHJpbmcpID0+IGVycihzdGRlcnIpKVxuICAgIHJldHVybiBwcm9jXG59XG5cbi8qKiBAdGhyb3dzIHtHTGliLkVycm9yfSBUaHJvd3Mgc3RkZXJyICovXG5leHBvcnQgZnVuY3Rpb24gZXhlYyhjbWQ6IHN0cmluZyB8IHN0cmluZ1tdKSB7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoY21kKVxuICAgICAgICA/IEFzdGFsLlByb2Nlc3MuZXhlY3YoY21kKVxuICAgICAgICA6IEFzdGFsLlByb2Nlc3MuZXhlYyhjbWQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjQXN5bmMoY21kOiBzdHJpbmcgfCBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY21kKSkge1xuICAgICAgICAgICAgQXN0YWwuUHJvY2Vzcy5leGVjX2FzeW5jdihjbWQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEFzdGFsLlByb2Nlc3MuZXhlY19hc3luY3ZfZmluaXNoKHJlcykpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIEFzdGFsLlByb2Nlc3MuZXhlY19hc3luYyhjbWQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEFzdGFsLlByb2Nlc3MuZXhlY19maW5pc2gocmVzKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfSlcbn1cbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5pbXBvcnQgQmluZGluZywgeyB0eXBlIENvbm5lY3RhYmxlLCB0eXBlIFN1YnNjcmliYWJsZSB9IGZyb20gXCIuL2JpbmRpbmcuanNcIlxuaW1wb3J0IHsgaW50ZXJ2YWwgfSBmcm9tIFwiLi90aW1lLmpzXCJcbmltcG9ydCB7IGV4ZWNBc3luYywgc3VicHJvY2VzcyB9IGZyb20gXCIuL3Byb2Nlc3MuanNcIlxuXG5jbGFzcyBWYXJpYWJsZVdyYXBwZXI8VD4gZXh0ZW5kcyBGdW5jdGlvbiB7XG4gICAgcHJpdmF0ZSB2YXJpYWJsZSE6IEFzdGFsLlZhcmlhYmxlQmFzZVxuICAgIHByaXZhdGUgZXJySGFuZGxlcj8gPSBjb25zb2xlLmVycm9yXG5cbiAgICBwcml2YXRlIF92YWx1ZTogVFxuICAgIHByaXZhdGUgX3BvbGw/OiBBc3RhbC5UaW1lXG4gICAgcHJpdmF0ZSBfd2F0Y2g/OiBBc3RhbC5Qcm9jZXNzXG5cbiAgICBwcml2YXRlIHBvbGxJbnRlcnZhbCA9IDEwMDBcbiAgICBwcml2YXRlIHBvbGxFeGVjPzogc3RyaW5nW10gfCBzdHJpbmdcbiAgICBwcml2YXRlIHBvbGxUcmFuc2Zvcm0/OiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFRcbiAgICBwcml2YXRlIHBvbGxGbj86IChwcmV2OiBUKSA9PiBUIHwgUHJvbWlzZTxUPlxuXG4gICAgcHJpdmF0ZSB3YXRjaFRyYW5zZm9ybT86IChzdGRvdXQ6IHN0cmluZywgcHJldjogVCkgPT4gVFxuICAgIHByaXZhdGUgd2F0Y2hFeGVjPzogc3RyaW5nW10gfCBzdHJpbmdcblxuICAgIGNvbnN0cnVjdG9yKGluaXQ6IFQpIHtcbiAgICAgICAgc3VwZXIoKVxuICAgICAgICB0aGlzLl92YWx1ZSA9IGluaXRcbiAgICAgICAgdGhpcy52YXJpYWJsZSA9IG5ldyBBc3RhbC5WYXJpYWJsZUJhc2UoKVxuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJkcm9wcGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuc3RvcFdhdGNoKClcbiAgICAgICAgICAgIHRoaXMuc3RvcFBvbGwoKVxuICAgICAgICB9KVxuICAgICAgICB0aGlzLnZhcmlhYmxlLmNvbm5lY3QoXCJlcnJvclwiLCAoXywgZXJyKSA9PiB0aGlzLmVyckhhbmRsZXI/LihlcnIpKVxuICAgICAgICByZXR1cm4gbmV3IFByb3h5KHRoaXMsIHtcbiAgICAgICAgICAgIGFwcGx5OiAodGFyZ2V0LCBfLCBhcmdzKSA9PiB0YXJnZXQuX2NhbGwoYXJnc1swXSksXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY2FsbDxSID0gVD4odHJhbnNmb3JtPzogKHZhbHVlOiBUKSA9PiBSKTogQmluZGluZzxSPiB7XG4gICAgICAgIGNvbnN0IGIgPSBCaW5kaW5nLmJpbmQodGhpcylcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybSA/IGIuYXModHJhbnNmb3JtKSA6IGIgYXMgdW5rbm93biBhcyBCaW5kaW5nPFI+XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoYFZhcmlhYmxlPCR7dGhpcy5nZXQoKX0+YClcbiAgICB9XG5cbiAgICBnZXQoKTogVCB7IHJldHVybiB0aGlzLl92YWx1ZSB9XG4gICAgc2V0KHZhbHVlOiBUKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fdmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZhbHVlID0gdmFsdWVcbiAgICAgICAgICAgIHRoaXMudmFyaWFibGUuZW1pdChcImNoYW5nZWRcIilcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UG9sbCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BvbGwpXG4gICAgICAgICAgICByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5wb2xsRm4pIHtcbiAgICAgICAgICAgIHRoaXMuX3BvbGwgPSBpbnRlcnZhbCh0aGlzLnBvbGxJbnRlcnZhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSB0aGlzLnBvbGxGbiEodGhpcy5nZXQoKSlcbiAgICAgICAgICAgICAgICBpZiAodiBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdi50aGVuKHYgPT4gdGhpcy5zZXQodikpXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVycikpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldCh2KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5wb2xsRXhlYykge1xuICAgICAgICAgICAgdGhpcy5fcG9sbCA9IGludGVydmFsKHRoaXMucG9sbEludGVydmFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgZXhlY0FzeW5jKHRoaXMucG9sbEV4ZWMhKVxuICAgICAgICAgICAgICAgICAgICAudGhlbih2ID0+IHRoaXMuc2V0KHRoaXMucG9sbFRyYW5zZm9ybSEodiwgdGhpcy5nZXQoKSkpKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMudmFyaWFibGUuZW1pdChcImVycm9yXCIsIGVycikpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRXYXRjaCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3dhdGNoKVxuICAgICAgICAgICAgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5fd2F0Y2ggPSBzdWJwcm9jZXNzKHtcbiAgICAgICAgICAgIGNtZDogdGhpcy53YXRjaEV4ZWMhLFxuICAgICAgICAgICAgb3V0OiBvdXQgPT4gdGhpcy5zZXQodGhpcy53YXRjaFRyYW5zZm9ybSEob3V0LCB0aGlzLmdldCgpKSksXG4gICAgICAgICAgICBlcnI6IGVyciA9PiB0aGlzLnZhcmlhYmxlLmVtaXQoXCJlcnJvclwiLCBlcnIpLFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHN0b3BQb2xsKCkge1xuICAgICAgICB0aGlzLl9wb2xsPy5jYW5jZWwoKVxuICAgICAgICBkZWxldGUgdGhpcy5fcG9sbFxuICAgIH1cblxuICAgIHN0b3BXYXRjaCgpIHtcbiAgICAgICAgdGhpcy5fd2F0Y2g/LmtpbGwoKVxuICAgICAgICBkZWxldGUgdGhpcy5fd2F0Y2hcbiAgICB9XG5cbiAgICBpc1BvbGxpbmcoKSB7IHJldHVybiAhIXRoaXMuX3BvbGwgfVxuICAgIGlzV2F0Y2hpbmcoKSB7IHJldHVybiAhIXRoaXMuX3dhdGNoIH1cblxuICAgIGRyb3AoKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGUuZW1pdChcImRyb3BwZWRcIilcbiAgICB9XG5cbiAgICBvbkRyb3BwZWQoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy52YXJpYWJsZS5jb25uZWN0KFwiZHJvcHBlZFwiLCBjYWxsYmFjaylcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIG9uRXJyb3IoY2FsbGJhY2s6IChlcnI6IHN0cmluZykgPT4gdm9pZCkge1xuICAgICAgICBkZWxldGUgdGhpcy5lcnJIYW5kbGVyXG4gICAgICAgIHRoaXMudmFyaWFibGUuY29ubmVjdChcImVycm9yXCIsIChfLCBlcnIpID0+IGNhbGxiYWNrKGVycikpXG4gICAgICAgIHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVmFyaWFibGU8VD5cbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVCkgPT4gdm9pZCkge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMudmFyaWFibGUuY29ubmVjdChcImNoYW5nZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgY2FsbGJhY2sodGhpcy5nZXQoKSlcbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuICgpID0+IHRoaXMudmFyaWFibGUuZGlzY29ubmVjdChpZClcbiAgICB9XG5cbiAgICBwb2xsKFxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyLFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICAgICAgdHJhbnNmb3JtPzogKHN0ZG91dDogc3RyaW5nLCBwcmV2OiBUKSA9PiBUXG4gICAgKTogVmFyaWFibGU8VD5cblxuICAgIHBvbGwoXG4gICAgICAgIGludGVydmFsOiBudW1iZXIsXG4gICAgICAgIGNhbGxiYWNrOiAocHJldjogVCkgPT4gVCB8IFByb21pc2U8VD5cbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgcG9sbChcbiAgICAgICAgaW50ZXJ2YWw6IG51bWJlcixcbiAgICAgICAgZXhlYzogc3RyaW5nIHwgc3RyaW5nW10gfCAoKHByZXY6IFQpID0+IFQgfCBQcm9taXNlPFQ+KSxcbiAgICAgICAgdHJhbnNmb3JtOiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFQgPSBvdXQgPT4gb3V0IGFzIFQsXG4gICAgKSB7XG4gICAgICAgIHRoaXMuc3RvcFBvbGwoKVxuICAgICAgICB0aGlzLnBvbGxJbnRlcnZhbCA9IGludGVydmFsXG4gICAgICAgIHRoaXMucG9sbFRyYW5zZm9ybSA9IHRyYW5zZm9ybVxuICAgICAgICBpZiAodHlwZW9mIGV4ZWMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgdGhpcy5wb2xsRm4gPSBleGVjXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5wb2xsRXhlY1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb2xsRXhlYyA9IGV4ZWNcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnBvbGxGblxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RhcnRQb2xsKClcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHdhdGNoKFxuICAgICAgICBleGVjOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICAgICAgdHJhbnNmb3JtOiAoc3Rkb3V0OiBzdHJpbmcsIHByZXY6IFQpID0+IFQgPSBvdXQgPT4gb3V0IGFzIFQsXG4gICAgKSB7XG4gICAgICAgIHRoaXMuc3RvcFdhdGNoKClcbiAgICAgICAgdGhpcy53YXRjaEV4ZWMgPSBleGVjXG4gICAgICAgIHRoaXMud2F0Y2hUcmFuc2Zvcm0gPSB0cmFuc2Zvcm1cbiAgICAgICAgdGhpcy5zdGFydFdhdGNoKClcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIG9ic2VydmUoXG4gICAgICAgIG9ianM6IEFycmF5PFtvYmo6IENvbm5lY3RhYmxlLCBzaWduYWw6IHN0cmluZ10+LFxuICAgICAgICBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICk6IFZhcmlhYmxlPFQ+XG5cbiAgICBvYnNlcnZlKFxuICAgICAgICBvYmo6IENvbm5lY3RhYmxlLFxuICAgICAgICBzaWduYWw6IHN0cmluZyxcbiAgICAgICAgY2FsbGJhY2s6ICguLi5hcmdzOiBhbnlbXSkgPT4gVCxcbiAgICApOiBWYXJpYWJsZTxUPlxuXG4gICAgb2JzZXJ2ZShcbiAgICAgICAgb2JqczogQ29ubmVjdGFibGUgfCBBcnJheTxbb2JqOiBDb25uZWN0YWJsZSwgc2lnbmFsOiBzdHJpbmddPixcbiAgICAgICAgc2lnT3JGbjogc3RyaW5nIHwgKChvYmo6IENvbm5lY3RhYmxlLCAuLi5hcmdzOiBhbnlbXSkgPT4gVCksXG4gICAgICAgIGNhbGxiYWNrPzogKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiBULFxuICAgICkge1xuICAgICAgICBjb25zdCBmID0gdHlwZW9mIHNpZ09yRm4gPT09IFwiZnVuY3Rpb25cIiA/IHNpZ09yRm4gOiBjYWxsYmFjayA/PyAoKCkgPT4gdGhpcy5nZXQoKSlcbiAgICAgICAgY29uc3Qgc2V0ID0gKG9iajogQ29ubmVjdGFibGUsIC4uLmFyZ3M6IGFueVtdKSA9PiB0aGlzLnNldChmKG9iaiwgLi4uYXJncykpXG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob2JqcykpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgb2JqIG9mIG9ianMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbbywgc10gPSBvYmpcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IG8uY29ubmVjdChzLCBzZXQpXG4gICAgICAgICAgICAgICAgdGhpcy5vbkRyb3BwZWQoKCkgPT4gby5kaXNjb25uZWN0KGlkKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2lnT3JGbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gb2Jqcy5jb25uZWN0KHNpZ09yRm4sIHNldClcbiAgICAgICAgICAgICAgICB0aGlzLm9uRHJvcHBlZCgoKSA9PiBvYmpzLmRpc2Nvbm5lY3QoaWQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBWYXJpYWJsZTxUPlxuICAgIH1cblxuICAgIHN0YXRpYyBkZXJpdmU8XG4gICAgICAgIGNvbnN0IERlcHMgZXh0ZW5kcyBBcnJheTxTdWJzY3JpYmFibGU8YW55Pj4sXG4gICAgICAgIEFyZ3MgZXh0ZW5kcyB7XG4gICAgICAgICAgICBbSyBpbiBrZXlvZiBEZXBzXTogRGVwc1tLXSBleHRlbmRzIFN1YnNjcmliYWJsZTxpbmZlciBUPiA/IFQgOiBuZXZlclxuICAgICAgICB9LFxuICAgICAgICBWID0gQXJncyxcbiAgICA+KGRlcHM6IERlcHMsIGZuOiAoLi4uYXJnczogQXJncykgPT4gViA9ICguLi5hcmdzKSA9PiBhcmdzIGFzIHVua25vd24gYXMgVikge1xuICAgICAgICBjb25zdCB1cGRhdGUgPSAoKSA9PiBmbiguLi5kZXBzLm1hcChkID0+IGQuZ2V0KCkpIGFzIEFyZ3MpXG4gICAgICAgIGNvbnN0IGRlcml2ZWQgPSBuZXcgVmFyaWFibGUodXBkYXRlKCkpXG4gICAgICAgIGNvbnN0IHVuc3VicyA9IGRlcHMubWFwKGRlcCA9PiBkZXAuc3Vic2NyaWJlKCgpID0+IGRlcml2ZWQuc2V0KHVwZGF0ZSgpKSkpXG4gICAgICAgIGRlcml2ZWQub25Ecm9wcGVkKCgpID0+IHVuc3Vicy5tYXAodW5zdWIgPT4gdW5zdWIoKSkpXG4gICAgICAgIHJldHVybiBkZXJpdmVkXG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhcmlhYmxlPFQ+IGV4dGVuZHMgT21pdDxWYXJpYWJsZVdyYXBwZXI8VD4sIFwiYmluZFwiPiB7XG4gICAgPFI+KHRyYW5zZm9ybTogKHZhbHVlOiBUKSA9PiBSKTogQmluZGluZzxSPlxuICAgICgpOiBCaW5kaW5nPFQ+XG59XG5cbmV4cG9ydCBjb25zdCBWYXJpYWJsZSA9IG5ldyBQcm94eShWYXJpYWJsZVdyYXBwZXIgYXMgYW55LCB7XG4gICAgYXBwbHk6IChfdCwgX2EsIGFyZ3MpID0+IG5ldyBWYXJpYWJsZVdyYXBwZXIoYXJnc1swXSksXG59KSBhcyB7XG4gICAgZGVyaXZlOiB0eXBlb2YgVmFyaWFibGVXcmFwcGVyW1wiZGVyaXZlXCJdXG4gICAgPFQ+KGluaXQ6IFQpOiBWYXJpYWJsZTxUPlxuICAgIG5ldzxUPihpbml0OiBUKTogVmFyaWFibGU8VD5cbn1cblxuZXhwb3J0IGRlZmF1bHQgVmFyaWFibGVcbiIsICJleHBvcnQgY29uc3Qgc25ha2VpZnkgPSAoc3RyOiBzdHJpbmcpID0+IHN0clxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCBcIiQxXyQyXCIpXG4gICAgLnJlcGxhY2VBbGwoXCItXCIsIFwiX1wiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG5cbmV4cG9ydCBjb25zdCBrZWJhYmlmeSA9IChzdHI6IHN0cmluZykgPT4gc3RyXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csIFwiJDEtJDJcIilcbiAgICAucmVwbGFjZUFsbChcIl9cIiwgXCItXCIpXG4gICAgLnRvTG93ZXJDYXNlKClcblxuZXhwb3J0IGludGVyZmFjZSBTdWJzY3JpYmFibGU8VCA9IHVua25vd24+IHtcbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVCkgPT4gdm9pZCk6ICgpID0+IHZvaWRcbiAgICBnZXQoKTogVFxuICAgIFtrZXk6IHN0cmluZ106IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbm5lY3RhYmxlIHtcbiAgICBjb25uZWN0KHNpZ25hbDogc3RyaW5nLCBjYWxsYmFjazogKC4uLmFyZ3M6IGFueVtdKSA9PiB1bmtub3duKTogbnVtYmVyXG4gICAgZGlzY29ubmVjdChpZDogbnVtYmVyKTogdm9pZFxuICAgIFtrZXk6IHN0cmluZ106IGFueVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCaW5kaW5nPFZhbHVlPiB7XG4gICAgcHJpdmF0ZSB0cmFuc2Zvcm1GbiA9ICh2OiBhbnkpID0+IHZcblxuICAgICNlbWl0dGVyOiBTdWJzY3JpYmFibGU8VmFsdWU+IHwgQ29ubmVjdGFibGVcbiAgICAjcHJvcD86IHN0cmluZ1xuXG4gICAgc3RhdGljIGJpbmQ8XG4gICAgICAgIFQgZXh0ZW5kcyBDb25uZWN0YWJsZSxcbiAgICAgICAgUCBleHRlbmRzIGtleW9mIFQsXG4gICAgPihvYmplY3Q6IFQsIHByb3BlcnR5OiBQKTogQmluZGluZzxUW1BdPlxuXG4gICAgc3RhdGljIGJpbmQ8VD4ob2JqZWN0OiBTdWJzY3JpYmFibGU8VD4pOiBCaW5kaW5nPFQ+XG5cbiAgICBzdGF0aWMgYmluZChlbWl0dGVyOiBDb25uZWN0YWJsZSB8IFN1YnNjcmliYWJsZSwgcHJvcD86IHN0cmluZykge1xuICAgICAgICByZXR1cm4gbmV3IEJpbmRpbmcoZW1pdHRlciwgcHJvcClcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnN0cnVjdG9yKGVtaXR0ZXI6IENvbm5lY3RhYmxlIHwgU3Vic2NyaWJhYmxlPFZhbHVlPiwgcHJvcD86IHN0cmluZykge1xuICAgICAgICB0aGlzLiNlbWl0dGVyID0gZW1pdHRlclxuICAgICAgICB0aGlzLiNwcm9wID0gcHJvcCAmJiBrZWJhYmlmeShwcm9wKVxuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gYEJpbmRpbmc8JHt0aGlzLiNlbWl0dGVyfSR7dGhpcy4jcHJvcCA/IGAsIFwiJHt0aGlzLiNwcm9wfVwiYCA6IFwiXCJ9PmBcbiAgICB9XG5cbiAgICBhczxUPihmbjogKHY6IFZhbHVlKSA9PiBUKTogQmluZGluZzxUPiB7XG4gICAgICAgIGNvbnN0IGJpbmQgPSBuZXcgQmluZGluZyh0aGlzLiNlbWl0dGVyLCB0aGlzLiNwcm9wKVxuICAgICAgICBiaW5kLnRyYW5zZm9ybUZuID0gKHY6IFZhbHVlKSA9PiBmbih0aGlzLnRyYW5zZm9ybUZuKHYpKVxuICAgICAgICByZXR1cm4gYmluZCBhcyB1bmtub3duIGFzIEJpbmRpbmc8VD5cbiAgICB9XG5cbiAgICBnZXQoKTogVmFsdWUge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuI2VtaXR0ZXIuZ2V0ID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Gbih0aGlzLiNlbWl0dGVyLmdldCgpKVxuXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy4jcHJvcCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29uc3QgZ2V0dGVyID0gYGdldF8ke3NuYWtlaWZ5KHRoaXMuI3Byb3ApfWBcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy4jZW1pdHRlcltnZXR0ZXJdID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtRm4odGhpcy4jZW1pdHRlcltnZXR0ZXJdKCkpXG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybUZuKHRoaXMuI2VtaXR0ZXJbdGhpcy4jcHJvcF0pXG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBFcnJvcihcImNhbiBub3QgZ2V0IHZhbHVlIG9mIGJpbmRpbmdcIilcbiAgICB9XG5cbiAgICBzdWJzY3JpYmUoY2FsbGJhY2s6ICh2YWx1ZTogVmFsdWUpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyLnN1YnNjcmliZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4jZW1pdHRlci5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMuZ2V0KCkpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiB0aGlzLiNlbWl0dGVyLmNvbm5lY3QgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc3Qgc2lnbmFsID0gYG5vdGlmeTo6JHt0aGlzLiNwcm9wfWBcbiAgICAgICAgICAgIGNvbnN0IGlkID0gdGhpcy4jZW1pdHRlci5jb25uZWN0KHNpZ25hbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHRoaXMuZ2V0KCkpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgICAgICAgICAodGhpcy4jZW1pdHRlci5kaXNjb25uZWN0IGFzIENvbm5lY3RhYmxlW1wiZGlzY29ubmVjdFwiXSkoaWQpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgRXJyb3IoYCR7dGhpcy4jZW1pdHRlcn0gaXMgbm90IGJpbmRhYmxlYClcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCB7IGJpbmQgfSA9IEJpbmRpbmdcbiIsICJpbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWxJT1wiXG5cbmV4cG9ydCBjb25zdCB7IFRpbWUgfSA9IEFzdGFsXG5cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcnZhbChpbnRlcnZhbDogbnVtYmVyLCBjYWxsYmFjaz86ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gQXN0YWwuVGltZS5pbnRlcnZhbChpbnRlcnZhbCwgKCkgPT4gdm9pZCBjYWxsYmFjaz8uKCkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0aW1lb3V0KHRpbWVvdXQ6IG51bWJlciwgY2FsbGJhY2s/OiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIEFzdGFsLlRpbWUudGltZW91dCh0aW1lb3V0LCAoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlkbGUoY2FsbGJhY2s/OiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIEFzdGFsLlRpbWUuaWRsZSgoKSA9PiB2b2lkIGNhbGxiYWNrPy4oKSlcbn1cbiIsICJpbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgQXN0YWwgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IHsgbWtBcHAgfSBmcm9tIFwiLi4vX2FwcFwiXG5cbkd0ay5pbml0KG51bGwpXG5cbmV4cG9ydCBkZWZhdWx0IG1rQXBwKEFzdGFsLkFwcGxpY2F0aW9uKVxuIiwgIi8qKlxuICogV29ya2Fyb3VuZCBmb3IgXCJDYW4ndCBjb252ZXJ0IG5vbi1udWxsIHBvaW50ZXIgdG8gSlMgdmFsdWUgXCJcbiAqL1xuXG5leHBvcnQgeyB9XG5cbmNvbnN0IHNuYWtlaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMV8kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiLVwiLCBcIl9cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG5hc3luYyBmdW5jdGlvbiBzdXBwcmVzczxUPihtb2Q6IFByb21pc2U8eyBkZWZhdWx0OiBUIH0+LCBwYXRjaDogKG06IFQpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gbW9kLnRoZW4obSA9PiBwYXRjaChtLmRlZmF1bHQpKS5jYXRjaCgoKSA9PiB2b2lkIDApXG59XG5cbmZ1bmN0aW9uIHBhdGNoPFAgZXh0ZW5kcyBvYmplY3Q+KHByb3RvOiBQLCBwcm9wOiBFeHRyYWN0PGtleW9mIFAsIHN0cmluZz4pIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocHJvdG8sIHByb3AsIHtcbiAgICAgICAgZ2V0KCkgeyByZXR1cm4gdGhpc1tgZ2V0XyR7c25ha2VpZnkocHJvcCl9YF0oKSB9LFxuICAgIH0pXG59XG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxBcHBzXCIpLCAoeyBBcHBzLCBBcHBsaWNhdGlvbiB9KSA9PiB7XG4gICAgcGF0Y2goQXBwcy5wcm90b3R5cGUsIFwibGlzdFwiKVxuICAgIHBhdGNoKEFwcGxpY2F0aW9uLnByb3RvdHlwZSwgXCJrZXl3b3Jkc1wiKVxuICAgIHBhdGNoKEFwcGxpY2F0aW9uLnByb3RvdHlwZSwgXCJjYXRlZ29yaWVzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsQmF0dGVyeVwiKSwgKHsgVVBvd2VyIH0pID0+IHtcbiAgICBwYXRjaChVUG93ZXIucHJvdG90eXBlLCBcImRldmljZXNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxCbHVldG9vdGhcIiksICh7IEFkYXB0ZXIsIEJsdWV0b290aCwgRGV2aWNlIH0pID0+IHtcbiAgICBwYXRjaChBZGFwdGVyLnByb3RvdHlwZSwgXCJ1dWlkc1wiKVxuICAgIHBhdGNoKEJsdWV0b290aC5wcm90b3R5cGUsIFwiYWRhcHRlcnNcIilcbiAgICBwYXRjaChCbHVldG9vdGgucHJvdG90eXBlLCBcImRldmljZXNcIilcbiAgICBwYXRjaChEZXZpY2UucHJvdG90eXBlLCBcInV1aWRzXCIpXG59KVxuXG5hd2FpdCBzdXBwcmVzcyhpbXBvcnQoXCJnaTovL0FzdGFsSHlwcmxhbmRcIiksICh7IEh5cHJsYW5kLCBNb25pdG9yLCBXb3Jrc3BhY2UgfSkgPT4ge1xuICAgIHBhdGNoKEh5cHJsYW5kLnByb3RvdHlwZSwgXCJtb25pdG9yc1wiKVxuICAgIHBhdGNoKEh5cHJsYW5kLnByb3RvdHlwZSwgXCJ3b3Jrc3BhY2VzXCIpXG4gICAgcGF0Y2goSHlwcmxhbmQucHJvdG90eXBlLCBcImNsaWVudHNcIilcbiAgICBwYXRjaChNb25pdG9yLnByb3RvdHlwZSwgXCJhdmFpbGFibGVNb2Rlc1wiKVxuICAgIHBhdGNoKE1vbml0b3IucHJvdG90eXBlLCBcImF2YWlsYWJsZV9tb2Rlc1wiKVxuICAgIHBhdGNoKFdvcmtzcGFjZS5wcm90b3R5cGUsIFwiY2xpZW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE1wcmlzXCIpLCAoeyBNcHJpcywgUGxheWVyIH0pID0+IHtcbiAgICBwYXRjaChNcHJpcy5wcm90b3R5cGUsIFwicGxheWVyc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkX3VyaV9zY2hlbWFzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRVcmlTY2hlbWFzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJzdXBwb3J0ZWRfbWltZV90eXBlc1wiKVxuICAgIHBhdGNoKFBsYXllci5wcm90b3R5cGUsIFwic3VwcG9ydGVkTWltZVR5cGVzXCIpXG4gICAgcGF0Y2goUGxheWVyLnByb3RvdHlwZSwgXCJjb21tZW50c1wiKVxufSlcblxuYXdhaXQgc3VwcHJlc3MoaW1wb3J0KFwiZ2k6Ly9Bc3RhbE5ldHdvcmtcIiksICh7IFdpZmkgfSkgPT4ge1xuICAgIHBhdGNoKFdpZmkucHJvdG90eXBlLCBcImFjY2Vzc19wb2ludHNcIilcbiAgICBwYXRjaChXaWZpLnByb3RvdHlwZSwgXCJhY2Nlc3NQb2ludHNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxOb3RpZmRcIiksICh7IE5vdGlmZCwgTm90aWZpY2F0aW9uIH0pID0+IHtcbiAgICBwYXRjaChOb3RpZmQucHJvdG90eXBlLCBcIm5vdGlmaWNhdGlvbnNcIilcbiAgICBwYXRjaChOb3RpZmljYXRpb24ucHJvdG90eXBlLCBcImFjdGlvbnNcIilcbn0pXG5cbmF3YWl0IHN1cHByZXNzKGltcG9ydChcImdpOi8vQXN0YWxQb3dlclByb2ZpbGVzXCIpLCAoeyBQb3dlclByb2ZpbGVzIH0pID0+IHtcbiAgICBwYXRjaChQb3dlclByb2ZpbGVzLnByb3RvdHlwZSwgXCJhY3Rpb25zXCIpXG59KVxuIiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmltcG9ydCB7IHNldENvbnNvbGVMb2dEb21haW4gfSBmcm9tIFwiY29uc29sZVwiXG5pbXBvcnQgeyBleGl0LCBwcm9ncmFtQXJncyB9IGZyb20gXCJzeXN0ZW1cIlxuaW1wb3J0IElPIGZyb20gXCJnaTovL0FzdGFsSU9cIlxuaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5pbXBvcnQgR2lvIGZyb20gXCJnaTovL0dpbz92ZXJzaW9uPTIuMFwiXG5pbXBvcnQgdHlwZSBBc3RhbDMgZnJvbSBcImdpOi8vQXN0YWw/dmVyc2lvbj0zLjBcIlxuaW1wb3J0IHR5cGUgQXN0YWw0IGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249NC4wXCJcblxudHlwZSBDb25maWcgPSBQYXJ0aWFsPHtcbiAgICBpbnN0YW5jZU5hbWU6IHN0cmluZ1xuICAgIGNzczogc3RyaW5nXG4gICAgaWNvbnM6IHN0cmluZ1xuICAgIGd0a1RoZW1lOiBzdHJpbmdcbiAgICBpY29uVGhlbWU6IHN0cmluZ1xuICAgIGN1cnNvclRoZW1lOiBzdHJpbmdcbiAgICBob2xkOiBib29sZWFuXG4gICAgcmVxdWVzdEhhbmRsZXIocmVxdWVzdDogc3RyaW5nLCByZXM6IChyZXNwb25zZTogYW55KSA9PiB2b2lkKTogdm9pZFxuICAgIG1haW4oLi4uYXJnczogc3RyaW5nW10pOiB2b2lkXG4gICAgY2xpZW50KG1lc3NhZ2U6IChtc2c6IHN0cmluZykgPT4gc3RyaW5nLCAuLi5hcmdzOiBzdHJpbmdbXSk6IHZvaWRcbn0+XG5cbmludGVyZmFjZSBBc3RhbDNKUyBleHRlbmRzIEFzdGFsMy5BcHBsaWNhdGlvbiB7XG4gICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT5cbiAgICByZXF1ZXN0SGFuZGxlcjogQ29uZmlnW1wicmVxdWVzdEhhbmRsZXJcIl1cbiAgICBhcHBseV9jc3Moc3R5bGU6IHN0cmluZywgcmVzZXQ/OiBib29sZWFuKTogdm9pZFxuICAgIHF1aXQoY29kZT86IG51bWJlcik6IHZvaWRcbiAgICBzdGFydChjb25maWc/OiBDb25maWcpOiB2b2lkXG59XG5cbmludGVyZmFjZSBBc3RhbDRKUyBleHRlbmRzIEFzdGFsNC5BcHBsaWNhdGlvbiB7XG4gICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT5cbiAgICByZXF1ZXN0SGFuZGxlcj86IENvbmZpZ1tcInJlcXVlc3RIYW5kbGVyXCJdXG4gICAgYXBwbHlfY3NzKHN0eWxlOiBzdHJpbmcsIHJlc2V0PzogYm9vbGVhbik6IHZvaWRcbiAgICBxdWl0KGNvZGU/OiBudW1iZXIpOiB2b2lkXG4gICAgc3RhcnQoY29uZmlnPzogQ29uZmlnKTogdm9pZFxufVxuXG50eXBlIEFwcDMgPSB0eXBlb2YgQXN0YWwzLkFwcGxpY2F0aW9uXG50eXBlIEFwcDQgPSB0eXBlb2YgQXN0YWw0LkFwcGxpY2F0aW9uXG5cbmV4cG9ydCBmdW5jdGlvbiBta0FwcDxBcHAgZXh0ZW5kcyBBcHAzPihBcHA6IEFwcCk6IEFzdGFsM0pTXG5leHBvcnQgZnVuY3Rpb24gbWtBcHA8QXBwIGV4dGVuZHMgQXBwND4oQXBwOiBBcHApOiBBc3RhbDRKU1xuXG5leHBvcnQgZnVuY3Rpb24gbWtBcHAoQXBwOiBBcHAzIHwgQXBwNCkge1xuICAgIHJldHVybiBuZXcgKGNsYXNzIEFzdGFsSlMgZXh0ZW5kcyBBcHAge1xuICAgICAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiQXN0YWxKU1wiIH0sIHRoaXMgYXMgYW55KSB9XG5cbiAgICAgICAgZXZhbChib2R5OiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZuID0gRnVuY3Rpb24oYHJldHVybiAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAke2JvZHkuaW5jbHVkZXMoXCI7XCIpID8gYm9keSA6IGByZXR1cm4gJHtib2R5fTtgfVxuICAgICAgICAgICAgICAgICAgICB9KWApXG4gICAgICAgICAgICAgICAgICAgIGZuKCkoKS50aGVuKHJlcykuY2F0Y2gocmVqKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqKGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICByZXF1ZXN0SGFuZGxlcj86IENvbmZpZ1tcInJlcXVlc3RIYW5kbGVyXCJdXG5cbiAgICAgICAgdmZ1bmNfcmVxdWVzdChtc2c6IHN0cmluZywgY29ubjogR2lvLlNvY2tldENvbm5lY3Rpb24pOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXF1ZXN0SGFuZGxlciA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXF1ZXN0SGFuZGxlcihtc2csIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBJTy53cml0ZV9zb2NrKGNvbm4sIFN0cmluZyhyZXNwb25zZSksIChfLCByZXMpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBJTy53cml0ZV9zb2NrX2ZpbmlzaChyZXMpLFxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHN1cGVyLnZmdW5jX3JlcXVlc3QobXNnLCBjb25uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYXBwbHlfY3NzKHN0eWxlOiBzdHJpbmcsIHJlc2V0ID0gZmFsc2UpIHtcbiAgICAgICAgICAgIHN1cGVyLmFwcGx5X2NzcyhzdHlsZSwgcmVzZXQpXG4gICAgICAgIH1cblxuICAgICAgICBxdWl0KGNvZGU/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLnF1aXQoKVxuICAgICAgICAgICAgZXhpdChjb2RlID8/IDApXG4gICAgICAgIH1cblxuICAgICAgICBzdGFydCh7IHJlcXVlc3RIYW5kbGVyLCBjc3MsIGhvbGQsIG1haW4sIGNsaWVudCwgaWNvbnMsIC4uLmNmZyB9OiBDb25maWcgPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgYXBwID0gdGhpcyBhcyB1bmtub3duIGFzIEluc3RhbmNlVHlwZTxBcHAzIHwgQXBwND5cblxuICAgICAgICAgICAgY2xpZW50ID8/PSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJpbnQoYEFzdGFsIGluc3RhbmNlIFwiJHthcHAuaW5zdGFuY2VOYW1lfVwiIGFscmVhZHkgcnVubmluZ2ApXG4gICAgICAgICAgICAgICAgZXhpdCgxKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNmZylcbiAgICAgICAgICAgIHNldENvbnNvbGVMb2dEb21haW4oYXBwLmluc3RhbmNlTmFtZSlcblxuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0SGFuZGxlciA9IHJlcXVlc3RIYW5kbGVyXG4gICAgICAgICAgICBhcHAuY29ubmVjdChcImFjdGl2YXRlXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBtYWluPy4oLi4ucHJvZ3JhbUFyZ3MpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGFwcC5hY3F1aXJlX3NvY2tldCgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2xpZW50KG1zZyA9PiBJTy5zZW5kX21lc3NhZ2UoYXBwLmluc3RhbmNlTmFtZSwgbXNnKSEsIC4uLnByb2dyYW1BcmdzKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3NzKVxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlfY3NzKGNzcywgZmFsc2UpXG5cbiAgICAgICAgICAgIGlmIChpY29ucylcbiAgICAgICAgICAgICAgICBhcHAuYWRkX2ljb25zKGljb25zKVxuXG4gICAgICAgICAgICBob2xkID8/PSB0cnVlXG4gICAgICAgICAgICBpZiAoaG9sZClcbiAgICAgICAgICAgICAgICBhcHAuaG9sZCgpXG5cbiAgICAgICAgICAgIGFwcC5ydW5Bc3luYyhbXSlcbiAgICAgICAgfVxuICAgIH0pXG59XG4iLCAiLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xuaW1wb3J0IEFzdGFsIGZyb20gXCJnaTovL0FzdGFsP3ZlcnNpb249My4wXCJcbmltcG9ydCBHdGsgZnJvbSBcImdpOi8vR3RrP3ZlcnNpb249My4wXCJcbmltcG9ydCBHT2JqZWN0IGZyb20gXCJnaTovL0dPYmplY3RcIlxuaW1wb3J0IGFzdGFsaWZ5LCB7IHR5cGUgQ29uc3RydWN0UHJvcHMsIHR5cGUgQmluZGFibGVDaGlsZCB9IGZyb20gXCIuL2FzdGFsaWZ5LmpzXCJcblxuLy8gQm94XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQXN0YWwuQm94LnByb3RvdHlwZSwgXCJjaGlsZHJlblwiLCB7XG4gICAgZ2V0KCkgeyByZXR1cm4gdGhpcy5nZXRfY2hpbGRyZW4oKSB9LFxuICAgIHNldCh2KSB7IHRoaXMuc2V0X2NoaWxkcmVuKHYpIH0sXG59KVxuXG5leHBvcnQgdHlwZSBCb3hQcm9wcyA9IENvbnN0cnVjdFByb3BzPEJveCwgQXN0YWwuQm94LkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgQm94IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkJveFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IEJveFByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gQnV0dG9uXG5leHBvcnQgdHlwZSBCdXR0b25Qcm9wcyA9IENvbnN0cnVjdFByb3BzPEJ1dHRvbiwgQXN0YWwuQnV0dG9uLkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkNsaWNrZWQ6IFtdXG4gICAgb25DbGljazogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uQ2xpY2tSZWxlYXNlOiBbZXZlbnQ6IEFzdGFsLkNsaWNrRXZlbnRdXG4gICAgb25Ib3ZlcjogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uSG92ZXJMb3N0OiBbZXZlbnQ6IEFzdGFsLkhvdmVyRXZlbnRdXG4gICAgb25TY3JvbGw6IFtldmVudDogQXN0YWwuU2Nyb2xsRXZlbnRdXG59PlxuZXhwb3J0IGNsYXNzIEJ1dHRvbiBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkJ1dHRvbikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJCdXR0b25cIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBCdXR0b25Qcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIENlbnRlckJveFxuZXhwb3J0IHR5cGUgQ2VudGVyQm94UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxDZW50ZXJCb3gsIEFzdGFsLkNlbnRlckJveC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIENlbnRlckJveCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkNlbnRlckJveCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJDZW50ZXJCb3hcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBDZW50ZXJCb3hQcm9wcywgLi4uY2hpbGRyZW46IEFycmF5PEJpbmRhYmxlQ2hpbGQ+KSB7IHN1cGVyKHsgY2hpbGRyZW4sIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIENpcmN1bGFyUHJvZ3Jlc3NcbmV4cG9ydCB0eXBlIENpcmN1bGFyUHJvZ3Jlc3NQcm9wcyA9IENvbnN0cnVjdFByb3BzPENpcmN1bGFyUHJvZ3Jlc3MsIEFzdGFsLkNpcmN1bGFyUHJvZ3Jlc3MuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBDaXJjdWxhclByb2dyZXNzIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuQ2lyY3VsYXJQcm9ncmVzcykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJDaXJjdWxhclByb2dyZXNzXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogQ2lyY3VsYXJQcm9ncmVzc1Byb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gRHJhd2luZ0FyZWFcbmV4cG9ydCB0eXBlIERyYXdpbmdBcmVhUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxEcmF3aW5nQXJlYSwgR3RrLkRyYXdpbmdBcmVhLkNvbnN0cnVjdG9yUHJvcHMsIHtcbiAgICBvbkRyYXc6IFtjcjogYW55XSAvLyBUT0RPOiBjYWlybyB0eXBlc1xufT5cbmV4cG9ydCBjbGFzcyBEcmF3aW5nQXJlYSBleHRlbmRzIGFzdGFsaWZ5KEd0ay5EcmF3aW5nQXJlYSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJEcmF3aW5nQXJlYVwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IERyYXdpbmdBcmVhUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIEVudHJ5XG5leHBvcnQgdHlwZSBFbnRyeVByb3BzID0gQ29uc3RydWN0UHJvcHM8RW50cnksIEd0ay5FbnRyeS5Db25zdHJ1Y3RvclByb3BzLCB7XG4gICAgb25DaGFuZ2VkOiBbXVxuICAgIG9uQWN0aXZhdGU6IFtdXG59PlxuZXhwb3J0IGNsYXNzIEVudHJ5IGV4dGVuZHMgYXN0YWxpZnkoR3RrLkVudHJ5KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkVudHJ5XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRW50cnlQcm9wcykgeyBzdXBlcihwcm9wcyBhcyBhbnkpIH1cbn1cblxuLy8gRXZlbnRCb3hcbmV4cG9ydCB0eXBlIEV2ZW50Qm94UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxFdmVudEJveCwgQXN0YWwuRXZlbnRCb3guQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uQ2xpY2s6IFtldmVudDogQXN0YWwuQ2xpY2tFdmVudF1cbiAgICBvbkNsaWNrUmVsZWFzZTogW2V2ZW50OiBBc3RhbC5DbGlja0V2ZW50XVxuICAgIG9uSG92ZXI6IFtldmVudDogQXN0YWwuSG92ZXJFdmVudF1cbiAgICBvbkhvdmVyTG9zdDogW2V2ZW50OiBBc3RhbC5Ib3ZlckV2ZW50XVxuICAgIG9uU2Nyb2xsOiBbZXZlbnQ6IEFzdGFsLlNjcm9sbEV2ZW50XVxufT5cbmV4cG9ydCBjbGFzcyBFdmVudEJveCBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLkV2ZW50Qm94KSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkV2ZW50Qm94XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogRXZlbnRCb3hQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG5cbi8vIC8vIFRPRE86IEZpeGVkXG4vLyAvLyBUT0RPOiBGbG93Qm94XG4vL1xuLy8gSWNvblxuZXhwb3J0IHR5cGUgSWNvblByb3BzID0gQ29uc3RydWN0UHJvcHM8SWNvbiwgQXN0YWwuSWNvbi5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIEljb24gZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5JY29uKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIkljb25cIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBJY29uUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIExhYmVsXG5leHBvcnQgdHlwZSBMYWJlbFByb3BzID0gQ29uc3RydWN0UHJvcHM8TGFiZWwsIEFzdGFsLkxhYmVsLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgTGFiZWwgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5MYWJlbCkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJMYWJlbFwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IExhYmVsUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIExldmVsQmFyXG5leHBvcnQgdHlwZSBMZXZlbEJhclByb3BzID0gQ29uc3RydWN0UHJvcHM8TGV2ZWxCYXIsIEFzdGFsLkxldmVsQmFyLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgTGV2ZWxCYXIgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5MZXZlbEJhcikge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJMZXZlbEJhclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IExldmVsQmFyUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFRPRE86IExpc3RCb3hcblxuLy8gT3ZlcmxheVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEFzdGFsLk92ZXJsYXkucHJvdG90eXBlLCBcIm92ZXJsYXlzXCIsIHtcbiAgICBnZXQoKSB7IHJldHVybiB0aGlzLmdldF9vdmVybGF5cygpIH0sXG4gICAgc2V0KHYpIHsgdGhpcy5zZXRfb3ZlcmxheXModikgfSxcbn0pXG5cbmV4cG9ydCB0eXBlIE92ZXJsYXlQcm9wcyA9IENvbnN0cnVjdFByb3BzPE92ZXJsYXksIEFzdGFsLk92ZXJsYXkuQ29uc3RydWN0b3JQcm9wcz5cbmV4cG9ydCBjbGFzcyBPdmVybGF5IGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuT3ZlcmxheSkge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJPdmVybGF5XCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogT3ZlcmxheVByb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gUmV2ZWFsZXJcbmV4cG9ydCB0eXBlIFJldmVhbGVyUHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxSZXZlYWxlciwgR3RrLlJldmVhbGVyLkNvbnN0cnVjdG9yUHJvcHM+XG5leHBvcnQgY2xhc3MgUmV2ZWFsZXIgZXh0ZW5kcyBhc3RhbGlmeShHdGsuUmV2ZWFsZXIpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiUmV2ZWFsZXJcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBSZXZlYWxlclByb3BzLCBjaGlsZD86IEJpbmRhYmxlQ2hpbGQpIHsgc3VwZXIoeyBjaGlsZCwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gU2Nyb2xsYWJsZVxuZXhwb3J0IHR5cGUgU2Nyb2xsYWJsZVByb3BzID0gQ29uc3RydWN0UHJvcHM8U2Nyb2xsYWJsZSwgQXN0YWwuU2Nyb2xsYWJsZS5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFNjcm9sbGFibGUgZXh0ZW5kcyBhc3RhbGlmeShBc3RhbC5TY3JvbGxhYmxlKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlNjcm9sbGFibGVcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTY3JvbGxhYmxlUHJvcHMsIGNoaWxkPzogQmluZGFibGVDaGlsZCkgeyBzdXBlcih7IGNoaWxkLCAuLi5wcm9wcyB9IGFzIGFueSkgfVxufVxuXG4vLyBTbGlkZXJcbmV4cG9ydCB0eXBlIFNsaWRlclByb3BzID0gQ29uc3RydWN0UHJvcHM8U2xpZGVyLCBBc3RhbC5TbGlkZXIuQ29uc3RydWN0b3JQcm9wcywge1xuICAgIG9uRHJhZ2dlZDogW11cbn0+XG5leHBvcnQgY2xhc3MgU2xpZGVyIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuU2xpZGVyKSB7XG4gICAgc3RhdGljIHsgR09iamVjdC5yZWdpc3RlckNsYXNzKHsgR1R5cGVOYW1lOiBcIlNsaWRlclwiIH0sIHRoaXMpIH1cbiAgICBjb25zdHJ1Y3Rvcihwcm9wcz86IFNsaWRlclByb3BzKSB7IHN1cGVyKHByb3BzIGFzIGFueSkgfVxufVxuXG4vLyBTdGFja1xuZXhwb3J0IHR5cGUgU3RhY2tQcm9wcyA9IENvbnN0cnVjdFByb3BzPFN0YWNrLCBBc3RhbC5TdGFjay5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFN0YWNrIGV4dGVuZHMgYXN0YWxpZnkoQXN0YWwuU3RhY2spIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU3RhY2tcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBTdGFja1Byb3BzLCAuLi5jaGlsZHJlbjogQXJyYXk8QmluZGFibGVDaGlsZD4pIHsgc3VwZXIoeyBjaGlsZHJlbiwgLi4ucHJvcHMgfSBhcyBhbnkpIH1cbn1cblxuLy8gU3dpdGNoXG5leHBvcnQgdHlwZSBTd2l0Y2hQcm9wcyA9IENvbnN0cnVjdFByb3BzPFN3aXRjaCwgR3RrLlN3aXRjaC5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFN3aXRjaCBleHRlbmRzIGFzdGFsaWZ5KEd0ay5Td2l0Y2gpIHtcbiAgICBzdGF0aWMgeyBHT2JqZWN0LnJlZ2lzdGVyQ2xhc3MoeyBHVHlwZU5hbWU6IFwiU3dpdGNoXCIgfSwgdGhpcykgfVxuICAgIGNvbnN0cnVjdG9yKHByb3BzPzogU3dpdGNoUHJvcHMpIHsgc3VwZXIocHJvcHMgYXMgYW55KSB9XG59XG5cbi8vIFdpbmRvd1xuZXhwb3J0IHR5cGUgV2luZG93UHJvcHMgPSBDb25zdHJ1Y3RQcm9wczxXaW5kb3csIEFzdGFsLldpbmRvdy5Db25zdHJ1Y3RvclByb3BzPlxuZXhwb3J0IGNsYXNzIFdpbmRvdyBleHRlbmRzIGFzdGFsaWZ5KEFzdGFsLldpbmRvdykge1xuICAgIHN0YXRpYyB7IEdPYmplY3QucmVnaXN0ZXJDbGFzcyh7IEdUeXBlTmFtZTogXCJXaW5kb3dcIiB9LCB0aGlzKSB9XG4gICAgY29uc3RydWN0b3IocHJvcHM/OiBXaW5kb3dQcm9wcywgY2hpbGQ/OiBCaW5kYWJsZUNoaWxkKSB7IHN1cGVyKHsgY2hpbGQsIC4uLnByb3BzIH0gYXMgYW55KSB9XG59XG4iLCAiKiB7XG4gIGNvbG9yOiAjZjFmMWYxO1xuICBmb250LXNpemU6IDE2cHg7XG59XG5cbi5CYXIge1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xufVxuLkJhciBpY29uIHtcbiAgZm9udC1zaXplOiAyMHB4O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbn1cbi5CYXIgLmljb24ge1xuICBmb250LXNpemU6IDI0cHg7XG4gIG1hcmdpbi1yaWdodDogNXB4O1xuICAvKiBtYXJnaW4tYm90dG9tOiAycHg7ICovXG59XG4uQmFyIC5zdGF0dXMge1xuICBtYXJnaW46IDAgOHB4O1xufVxuXG4uYmF0dGVyeS5jaGFyZ2luZyB7XG4gIC8qIGxhYmVsIHtcbiAgICBjb2xvcjogJGFjY2VudDtcbiAgfSAqL1xufVxuLmJhdHRlcnkuY2hhcmdpbmcgLmljb24ge1xuICBjb2xvcjogIzM3OERGNztcbiAgbWFyZ2luLXJpZ2h0OiAxMHB4O1xufVxuXG5idXR0b24ge1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgYm9yZGVyOiBub25lO1xuICBwYWRkaW5nOiAwO1xuICBib3JkZXItcmFkaXVzOiAwO1xufVxuXG5pY29uIHtcbiAgZm9udC1zaXplOiAyNXB4O1xufVxuXG4ud29ya3NwYWNlcyBpY29uIHtcbiAgbWFyZ2luLXRvcDogMnB4O1xuICBtYXJnaW4tbGVmdDogNXB4O1xufVxuLndvcmtzcGFjZXMgYnV0dG9uIHtcbiAgcGFkZGluZy1yaWdodDogNHB4O1xuICBwYWRkaW5nLXRvcDogM3B4O1xuICBib3JkZXItYm90dG9tOiAzcHggc29saWQgIzIxMjIyMztcbn1cbi53b3Jrc3BhY2VzIGJ1dHRvbiBsYWJlbCB7XG4gIG1hcmdpbi1sZWZ0OiA4cHg7XG4gIG1hcmdpbi1yaWdodDogNHB4O1xufVxuLndvcmtzcGFjZXMgYnV0dG9uLmV4aXN0IHtcbiAgYm9yZGVyLWJvdHRvbTogM3B4IHNvbGlkICM0MTQyNDM7XG59XG4ud29ya3NwYWNlcyBidXR0b24uZm9jdXNlZCB7XG4gIC8qIGJhY2tncm91bmQ6ICRhY2NlbnQ7ICovXG4gIGJhY2tncm91bmQ6ICM0MTQyNDM7XG4gIGJvcmRlci1ib3R0b206IDNweCBzb2xpZCAjMzc4REY3O1xufVxuXG4uTm90aWZpY2F0aW9ucyBldmVudGJveCBidXR0b24ge1xuICBiYWNrZ3JvdW5kOiAjNDE0MjQzO1xuICBib3JkZXItcmFkaXVzOiAwcHg7XG4gIG1hcmdpbjogMCAycHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCA+IGJveCB7XG4gIG1hcmdpbjogNHB4O1xuICBiYWNrZ3JvdW5kOiAjMjEyMjIzO1xuICBwYWRkaW5nOiA0cHggMnB4O1xuICBtaW4td2lkdGg6IDMwMHB4O1xuICBib3JkZXItcmFkaXVzOiA0cHg7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0MTQyNDM7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAuaW1hZ2Uge1xuICBtaW4taGVpZ2h0OiA4MHB4O1xuICBtaW4td2lkdGg6IDgwcHg7XG4gIGZvbnQtc2l6ZTogODBweDtcbiAgbWFyZ2luOiA4cHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAubWFpbiB7XG4gIHBhZGRpbmctbGVmdDogNHB4O1xuICBtYXJnaW4tYm90dG9tOiAycHg7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveCAubWFpbiAuaGVhZGVyIC5zdW1tYXJ5IHtcbiAgZm9udC1zaXplOiAxLjJlbTtcbiAgZm9udC13ZWlnaHQ6IGJvbGQ7XG59XG4uTm90aWZpY2F0aW9ucyBldmVudGJveC5jcml0aWNhbCA+IGJveCB7XG4gIGJvcmRlci1jb2xvcjogIzM3OERGNztcbn1cblxuLmNsb2NrIC5pY29uIHtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjMzc4REY3O1xufVxuXG4udHJheSB7XG4gIG1hcmdpbi1yaWdodDogMnB4O1xufVxuLnRyYXkgaWNvbiB7XG4gIGZvbnQtc2l6ZTogMTZweDtcbiAgbWFyZ2luOiAwIDRweDtcbn1cblxuI2xhdW5jaGVyIHtcbiAgYmFja2dyb3VuZDogbm9uZTtcbn1cbiNsYXVuY2hlciAubWFpbiB7XG4gIHBhZGRpbmc6IDRweDtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIGljb24ge1xuICBtYXJnaW46IDAgNHB4O1xufVxuI2xhdW5jaGVyIC5tYWluIC5kZXNjcmlwdGlvbiB7XG4gIGNvbG9yOiAjYmJiO1xuICBmb250LXNpemU6IDAuOGVtO1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbjpob3ZlcixcbiNsYXVuY2hlciAubWFpbiBidXR0b246Zm9jdXMge1xuICBib3JkZXI6IDJweCBzb2xpZCAjMzc4REY3O1xufVxuI2xhdW5jaGVyIC5tYWluIGJ1dHRvbiB7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0MTQyNDM7XG59XG4jbGF1bmNoZXIgLm1haW4gYnV0dG9uLFxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgYm9yZGVyLXJhZGl1czogMHB4O1xuICBiYWNrZ3JvdW5kOiAjNDE0MjQzO1xuICBvdXRsaW5lOiBub25lO1xufVxuI2xhdW5jaGVyIC5tYWluIGVudHJ5IHtcbiAgbWFyZ2luLWJvdHRvbTogOHB4O1xuICBib3JkZXI6IG5vbmU7XG4gIG1pbi1oZWlnaHQ6IDBweDtcbiAgZm9udC1zaXplOiAxLjNyZW07XG59XG5cbi5Pc2QgYm94IHtcbiAgYmFja2dyb3VuZDogIzIxMjIyMztcbiAgYm9yZGVyLXJhZGl1czogMjRweDtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xufVxuLk9zZCBib3ggdHJvdWdoIHtcbiAgcGFkZGluZzogMDtcbiAgbWFyZ2luOiA4cHg7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbn1cbi5Pc2QgYm94IHRyb3VnaCBibG9jayB7XG4gIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyOiBub25lO1xufVxuLk9zZCBib3ggdHJvdWdoIGJsb2NrLmZpbGxlZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xufVxuLk9zZCBib3ggbGFiZWwge1xuICBtaW4td2lkdGg6IDQwcHg7XG59IiwgImltcG9ydCBcIi4vb3ZlcnJpZGVzLmpzXCJcbmV4cG9ydCB7IGRlZmF1bHQgYXMgQXN0YWxJTyB9IGZyb20gXCJnaTovL0FzdGFsSU8/dmVyc2lvbj0wLjFcIlxuZXhwb3J0ICogZnJvbSBcIi4vcHJvY2Vzcy5qc1wiXG5leHBvcnQgKiBmcm9tIFwiLi90aW1lLmpzXCJcbmV4cG9ydCAqIGZyb20gXCIuL2ZpbGUuanNcIlxuZXhwb3J0ICogZnJvbSBcIi4vZ29iamVjdC5qc1wiXG5leHBvcnQgeyBiaW5kLCBkZWZhdWx0IGFzIEJpbmRpbmcgfSBmcm9tIFwiLi9iaW5kaW5nLmpzXCJcbmV4cG9ydCB7IFZhcmlhYmxlIH0gZnJvbSBcIi4vdmFyaWFibGUuanNcIlxuIiwgImltcG9ydCBBc3RhbCBmcm9tIFwiZ2k6Ly9Bc3RhbElPXCJcbmltcG9ydCBHaW8gZnJvbSBcImdpOi8vR2lvP3ZlcnNpb249Mi4wXCJcblxuZXhwb3J0IHsgR2lvIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRGaWxlKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEFzdGFsLnJlYWRfZmlsZShwYXRoKSB8fCBcIlwiXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlsZUFzeW5jKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgQXN0YWwucmVhZF9maWxlX2FzeW5jKHBhdGgsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC5yZWFkX2ZpbGVfZmluaXNoKHJlcykgfHwgXCJcIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgQXN0YWwud3JpdGVfZmlsZShwYXRoLCBjb250ZW50KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlQXN5bmMocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBBc3RhbC53cml0ZV9maWxlX2FzeW5jKHBhdGgsIGNvbnRlbnQsIChfLCByZXMpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShBc3RhbC53cml0ZV9maWxlX2ZpbmlzaChyZXMpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25pdG9yRmlsZShcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgY2FsbGJhY2s6IChmaWxlOiBzdHJpbmcsIGV2ZW50OiBHaW8uRmlsZU1vbml0b3JFdmVudCkgPT4gdm9pZCxcbik6IEdpby5GaWxlTW9uaXRvciB7XG4gICAgcmV0dXJuIEFzdGFsLm1vbml0b3JfZmlsZShwYXRoLCAoZmlsZTogc3RyaW5nLCBldmVudDogR2lvLkZpbGVNb25pdG9yRXZlbnQpID0+IHtcbiAgICAgICAgY2FsbGJhY2soZmlsZSwgZXZlbnQpXG4gICAgfSkhXG59XG4iLCAiaW1wb3J0IEdPYmplY3QgZnJvbSBcImdpOi8vR09iamVjdFwiXG5cbmV4cG9ydCB7IGRlZmF1bHQgYXMgR0xpYiB9IGZyb20gXCJnaTovL0dMaWI/dmVyc2lvbj0yLjBcIlxuZXhwb3J0IHsgR09iamVjdCwgR09iamVjdCBhcyBkZWZhdWx0IH1cblxuY29uc3QgbWV0YSA9IFN5bWJvbChcIm1ldGFcIilcbmNvbnN0IHByaXYgPSBTeW1ib2woXCJwcml2XCIpXG5cbmNvbnN0IHsgUGFyYW1TcGVjLCBQYXJhbUZsYWdzIH0gPSBHT2JqZWN0XG5cbmNvbnN0IGtlYmFiaWZ5ID0gKHN0cjogc3RyaW5nKSA9PiBzdHJcbiAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgXCIkMS0kMlwiKVxuICAgIC5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIilcbiAgICAudG9Mb3dlckNhc2UoKVxuXG50eXBlIFNpZ25hbERlY2xhcmF0aW9uID0ge1xuICAgIGZsYWdzPzogR09iamVjdC5TaWduYWxGbGFnc1xuICAgIGFjY3VtdWxhdG9yPzogR09iamVjdC5BY2N1bXVsYXRvclR5cGVcbiAgICByZXR1cm5fdHlwZT86IEdPYmplY3QuR1R5cGVcbiAgICBwYXJhbV90eXBlcz86IEFycmF5PEdPYmplY3QuR1R5cGU+XG59XG5cbnR5cGUgUHJvcGVydHlEZWNsYXJhdGlvbiA9XG4gICAgfCBJbnN0YW5jZVR5cGU8dHlwZW9mIEdPYmplY3QuUGFyYW1TcGVjPlxuICAgIHwgeyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfVxuICAgIHwgdHlwZW9mIFN0cmluZ1xuICAgIHwgdHlwZW9mIE51bWJlclxuICAgIHwgdHlwZW9mIEJvb2xlYW5cbiAgICB8IHR5cGVvZiBPYmplY3RcblxudHlwZSBHT2JqZWN0Q29uc3RydWN0b3IgPSB7XG4gICAgW21ldGFdPzoge1xuICAgICAgICBQcm9wZXJ0aWVzPzogeyBba2V5OiBzdHJpbmddOiBHT2JqZWN0LlBhcmFtU3BlYyB9XG4gICAgICAgIFNpZ25hbHM/OiB7IFtrZXk6IHN0cmluZ106IEdPYmplY3QuU2lnbmFsRGVmaW5pdGlvbiB9XG4gICAgfVxuICAgIG5ldyguLi5hcmdzOiBhbnlbXSk6IGFueVxufVxuXG50eXBlIE1ldGFJbmZvID0gR09iamVjdC5NZXRhSW5mbzxuZXZlciwgQXJyYXk8eyAkZ3R5cGU6IEdPYmplY3QuR1R5cGUgfT4sIG5ldmVyPlxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXIob3B0aW9uczogTWV0YUluZm8gPSB7fSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoY2xzOiBHT2JqZWN0Q29uc3RydWN0b3IpIHtcbiAgICAgICAgY29uc3QgdCA9IG9wdGlvbnMuVGVtcGxhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiICYmICF0LnN0YXJ0c1dpdGgoXCJyZXNvdXJjZTovL1wiKSAmJiAhdC5zdGFydHNXaXRoKFwiZmlsZTovL1wiKSkge1xuICAgICAgICAgICAgLy8gYXNzdW1lIHhtbCB0ZW1wbGF0ZVxuICAgICAgICAgICAgb3B0aW9ucy5UZW1wbGF0ZSA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0KVxuICAgICAgICB9XG5cbiAgICAgICAgR09iamVjdC5yZWdpc3RlckNsYXNzKHtcbiAgICAgICAgICAgIFNpZ25hbHM6IHsgLi4uY2xzW21ldGFdPy5TaWduYWxzIH0sXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7IC4uLmNsc1ttZXRhXT8uUHJvcGVydGllcyB9LFxuICAgICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgfSwgY2xzKVxuXG4gICAgICAgIGRlbGV0ZSBjbHNbbWV0YV1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9wZXJ0eShkZWNsYXJhdGlvbjogUHJvcGVydHlEZWNsYXJhdGlvbiA9IE9iamVjdCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHByb3A6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikge1xuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0gPz89IHt9XG4gICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5Qcm9wZXJ0aWVzID8/PSB7fVxuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBrZWJhYmlmeShwcm9wKVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJpdl0/Lltwcm9wXSA/PyBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb24pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzW3Byb3BdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzW3ByaXZdID8/PSB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcml2XVtwcm9wXSA9IHZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZ5KG5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYHNldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSh2OiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHZcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYGdldF8ke25hbWUucmVwbGFjZShcIi1cIiwgXCJfXCIpfWAsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNbcHJvcF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlByb3BlcnRpZXNba2ViYWJpZnkocHJvcCldID0gcHNwZWMobmFtZSwgUGFyYW1GbGFncy5SRUFEV1JJVEUsIGRlY2xhcmF0aW9uKVxuICAgICAgICB9XG5cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZmxhZ3MgPSAwXG4gICAgICAgICAgICBpZiAoZGVzYy5nZXQpIGZsYWdzIHw9IFBhcmFtRmxhZ3MuUkVBREFCTEVcbiAgICAgICAgICAgIGlmIChkZXNjLnNldCkgZmxhZ3MgfD0gUGFyYW1GbGFncy5XUklUQUJMRVxuXG4gICAgICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uUHJvcGVydGllc1trZWJhYmlmeShwcm9wKV0gPSBwc3BlYyhuYW1lLCBmbGFncywgZGVjbGFyYXRpb24pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduYWwoLi4ucGFyYW1zOiBBcnJheTx7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdD4pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24pOlxuKHRhcmdldDogYW55LCBzaWduYWw6IGFueSwgZGVzYz86IFByb3BlcnR5RGVzY3JpcHRvcikgPT4gdm9pZFxuXG5leHBvcnQgZnVuY3Rpb24gc2lnbmFsKFxuICAgIGRlY2xhcmF0aW9uPzogU2lnbmFsRGVjbGFyYXRpb24gfCB7ICRndHlwZTogR09iamVjdC5HVHlwZSB9IHwgdHlwZW9mIE9iamVjdCxcbiAgICAuLi5wYXJhbXM6IEFycmF5PHsgJGd0eXBlOiBHT2JqZWN0LkdUeXBlIH0gfCB0eXBlb2YgT2JqZWN0PlxuKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQ6IGFueSwgc2lnbmFsOiBhbnksIGRlc2M/OiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdID8/PSB7fVxuICAgICAgICB0YXJnZXQuY29uc3RydWN0b3JbbWV0YV0uU2lnbmFscyA/Pz0ge31cblxuICAgICAgICBjb25zdCBuYW1lID0ga2ViYWJpZnkoc2lnbmFsKVxuXG4gICAgICAgIGlmIChkZWNsYXJhdGlvbiB8fCBwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBUT0RPOiB0eXBlIGFzc2VydFxuICAgICAgICAgICAgY29uc3QgYXJyID0gW2RlY2xhcmF0aW9uLCAuLi5wYXJhbXNdLm1hcCh2ID0+IHYuJGd0eXBlKVxuICAgICAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yW21ldGFdLlNpZ25hbHNbbmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgcGFyYW1fdHlwZXM6IGFycixcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRhcmdldC5jb25zdHJ1Y3RvclttZXRhXS5TaWduYWxzW25hbWVdID0gZGVjbGFyYXRpb24gfHwge1xuICAgICAgICAgICAgICAgIHBhcmFtX3R5cGVzOiBbXSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVzYykge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgc2lnbmFsLCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQobmFtZSwgLi4uYXJncylcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IG9nOiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSA9IGRlc2MudmFsdWVcbiAgICAgICAgICAgIGRlc2MudmFsdWUgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIG5vdCB0eXBlZFxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChuYW1lLCAuLi5hcmdzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgYG9uXyR7bmFtZS5yZXBsYWNlKFwiLVwiLCBcIl9cIil9YCwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiBmdW5jdGlvbiAoLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9nKC4uLmFyZ3MpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBzcGVjKG5hbWU6IHN0cmluZywgZmxhZ3M6IG51bWJlciwgZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvblxuXG4gICAgc3dpdGNoIChkZWNsYXJhdGlvbikge1xuICAgICAgICBjYXNlIFN0cmluZzpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuc3RyaW5nKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBcIlwiKVxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMuZG91YmxlKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCAtTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSwgMClcbiAgICAgICAgY2FzZSBCb29sZWFuOlxuICAgICAgICAgICAgcmV0dXJuIFBhcmFtU3BlYy5ib29sZWFuKG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBmYWxzZSlcbiAgICAgICAgY2FzZSBPYmplY3Q6XG4gICAgICAgICAgICByZXR1cm4gUGFyYW1TcGVjLmpzb2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzKVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBtaXNzdHlwZWRcbiAgICAgICAgICAgIHJldHVybiBQYXJhbVNwZWMub2JqZWN0KG5hbWUsIFwiXCIsIFwiXCIsIGZsYWdzLCBkZWNsYXJhdGlvbi4kZ3R5cGUpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZWZhdWx0VmFsdWUoZGVjbGFyYXRpb246IFByb3BlcnR5RGVjbGFyYXRpb24pIHtcbiAgICBpZiAoZGVjbGFyYXRpb24gaW5zdGFuY2VvZiBQYXJhbVNwZWMpXG4gICAgICAgIHJldHVybiBkZWNsYXJhdGlvbi5nZXRfZGVmYXVsdF92YWx1ZSgpXG5cbiAgICBzd2l0Y2ggKGRlY2xhcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgU3RyaW5nOlxuICAgICAgICAgICAgcmV0dXJuIFwiZGVmYXVsdC1zdHJpbmdcIlxuICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIGNhc2UgQm9vbGVhbjpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBjYXNlIE9iamVjdDpcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgfVxufVxuIiwgImltcG9ydCB7IFZhcmlhYmxlLCBHTGliLCBiaW5kIH0gZnJvbSBcImFzdGFsXCI7XG5pbXBvcnQgeyBBc3RhbCwgR3RrIH0gZnJvbSBcImFzdGFsL2d0azNcIjtcbmltcG9ydCBCYXR0ZXJ5IGZyb20gXCJnaTovL0FzdGFsQmF0dGVyeVwiO1xuaW1wb3J0IFdvcmtzcGFjZXMgZnJvbSBcIi4vd29ya3NwYWNlc1wiO1xuaW1wb3J0IFRyYXkgZnJvbSBcIi4vdHJheVwiO1xuaW1wb3J0IFdwIGZyb20gXCJnaTovL0FzdGFsV3BcIjtcbmltcG9ydCBOZXR3b3JrIGZyb20gXCJnaTovL0FzdGFsTmV0d29ya1wiO1xuXG5mdW5jdGlvbiBDbG9jaygpIHtcbiAgcmV0dXJuIChcbiAgICA8Ym94XG4gICAgICBjbGFzc05hbWU9XCJjbG9jayBzdGF0dXNcIlxuICAgICAgaGFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfVxuICAgICAgaGV4cGFuZFxuICAgID5cbiAgICAgIDxsYWJlbFxuICAgICAgICBsYWJlbD17VmFyaWFibGUoXCJcIikucG9sbCg1MDAwLCAoKSA9PlxuICAgICAgICAgIEdMaWIuRGF0ZVRpbWUubmV3X25vd19sb2NhbCgpLmZvcm1hdChcIiVIOiVNICVBICVkLyVtLyVZXCIpLFxuICAgICAgICApKCl9XG4gICAgICAvPlxuICAgIDwvYm94PlxuICApO1xufVxuXG5mdW5jdGlvbiBCYXR0ZXJ5TGV2ZWwoKSB7XG4gIGNvbnN0IGJhdCA9IEJhdHRlcnkuZ2V0X2RlZmF1bHQoKTtcbiAgY29uc3QgaWNvbnMgPSB7XG4gICAgLy8gYmF0dGVyeSBpY29ucyBmcm9tIG5lcmQgZm9udHMgaHR0cHM6Ly93d3cubmVyZGZvbnRzLmNvbS9cbiAgICBcImJhdHRlcnktbGV2ZWwtMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5Q1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0yMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0zMC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4N1wiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC00MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC01MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RFwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC02MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4OVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC03MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4Mlx1REM5RVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC04MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC05MC1jaGFyZ2luZy1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4QlwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0xMDAtY2hhcmdlZC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM4NVwiLFxuICAgIFwiYmF0dGVyeS1sZXZlbC0wLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzhFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdBXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTIwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdCXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTMwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdDXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTQwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdEXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTUwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdFXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTYwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzdGXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTcwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgwXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTgwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgxXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTkwLXN5bWJvbGljXCI6IFwiXHVEQjgwXHVEQzgyXCIsXG4gICAgXCJiYXR0ZXJ5LWxldmVsLTEwMC1zeW1ib2xpY1wiOiBcIlx1REI4MFx1REM3OVwiLFxuICB9O1xuICByZXR1cm4gKFxuICAgIDxib3hcbiAgICAgIGNsYXNzTmFtZT17YmluZChiYXQsIFwiY2hhcmdpbmdcIikuYXMoYyA9PiBjID8gXCJjaGFyZ2luZyBiYXR0ZXJ5IHN0YXR1c1wiIDogXCJiYXR0ZXJ5IHN0YXR1c1wiKX1cbiAgICAgIGhleHBhbmRcbiAgICA+XG4gICAgICA8bGFiZWxcbiAgICAgICAgY2xhc3NOYW1lPVwiaWNvblwiXG4gICAgICAgIGxhYmVsPXtiaW5kKGJhdCwgXCJiYXR0ZXJ5SWNvbk5hbWVcIikuYXMoKGIpID0+IGljb25zW2JdKX1cbiAgICAgIC8+XG4gICAgICA8bGFiZWxcbiAgICAgICAgbGFiZWw9e2JpbmQoYmF0LCBcInBlcmNlbnRhZ2VcIikuYXMoKHApID0+IGAke01hdGguZmxvb3IocCAqIDEwMCl9JWApfVxuICAgICAgLz5cbiAgICA8L2JveD5cbiAgKTtcbn1cblxuZnVuY3Rpb24gVm9sdW1lKCkge1xuICBjb25zdCBzcGVha2VyID0gV3AuZ2V0X2RlZmF1bHQoKT8uYXVkaW8uZGVmYXVsdFNwZWFrZXI7XG5cbiAgcmV0dXJuIChcbiAgICA8Ym94IGNsYXNzTmFtZT1cInZvbHVtZSBzdGF0dXNcIj5cbiAgICAgIDxpY29uIGljb249e2JpbmQoc3BlYWtlciwgXCJ2b2x1bWVJY29uXCIpfSAvPlxuICAgICAgPGxhYmVsIGxhYmVsPXtiaW5kKHNwZWFrZXIsIFwidm9sdW1lXCIpLmFzKChwKSA9PiBgJHtNYXRoLmZsb29yKHAgKiAxMDApfSVgKX0gLz5cbiAgICA8L2JveD5cbiAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQmFyKG1vbml0b3IpIHtcbiAgY29uc3QgeyBUT1AsIFJJR0hULCBMRUZUIH0gPSBBc3RhbC5XaW5kb3dBbmNob3I7XG5cbiAgY29uc3QgbmV0d29yayA9IE5ldHdvcmsuZ2V0X2RlZmF1bHQoKTtcbiAgY29uc3Qgd2lmaSA9IGJpbmQobmV0d29yaywgXCJ3aWZpXCIpO1xuXG4gIHJldHVybiAoXG4gICAgPHdpbmRvd1xuICAgICAgY2xhc3NOYW1lPVwiQmFyXCJcbiAgICAgIG5hbWVzcGFjZT1cImFncy1iYXJcIlxuICAgICAgZ2RrbW9uaXRvcj17bW9uaXRvcn1cbiAgICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5FWENMVVNJVkV9XG4gICAgICBhbmNob3I9e1RPUCB8IExFRlQgfCBSSUdIVH1cbiAgICA+XG4gICAgICA8Y2VudGVyYm94PlxuICAgICAgICA8Ym94IGNsYXNzTmFtZT1cInNlZ21lbnQgc3RhcnRcIiBoYWxpZ249e0d0ay5BbGlnbi5TVEFSVH0+XG4gICAgICAgICAgPFdvcmtzcGFjZXMgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBjZW50ZXJcIj5cbiAgICAgICAgICA8Q2xvY2sgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICAgIDxib3ggY2xhc3NOYW1lPVwic2VnbWVudCBlbmRcIiBoYWxpZ249e0d0ay5BbGlnbi5FTkR9ID5cbiAgICAgICAgICA8VHJheSAvPlxuICAgICAgICAgIDxib3hcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5ldHdvcmsgc3RhdHVzXCJcbiAgICAgICAgICAgIGhhbGlnbj17R3RrLkFsaWduLkNFTlRFUn1cbiAgICAgICAgICAgIGhleHBhbmRcbiAgICAgICAgICA+XG4gICAgICAgICAgICB7d2lmaS5hcyhcbiAgICAgICAgICAgICAgKHdpZmkpID0+XG4gICAgICAgICAgICAgICAgd2lmaSAmJiAoXG4gICAgICAgICAgICAgICAgICA8aWNvblxuICAgICAgICAgICAgICAgICAgICB0b29sdGlwVGV4dD17YmluZCh3aWZpLCBcInNzaWRcIikuYXMoU3RyaW5nKX1cbiAgICAgICAgICAgICAgICAgICAgaWNvbj17YmluZCh3aWZpLCBcImljb25OYW1lXCIpfVxuICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIHt3aWZpLmFzKFxuICAgICAgICAgICAgICAod2lmaSkgPT5cbiAgICAgICAgICAgICAgICB3aWZpICYmIChcbiAgICAgICAgICAgICAgICAgIDxsYWJlbCBsYWJlbD17YmluZCh3aWZpLCBcInNzaWRcIil9IC8+XG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICl9XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPEJhdHRlcnlMZXZlbCAvPlxuICAgICAgICAgIDxWb2x1bWUgLz5cbiAgICAgICAgPC9ib3g+XG4gICAgICA8L2NlbnRlcmJveD5cbiAgICA8L3dpbmRvdyA+XG4gICk7XG59XG4iLCAiaW1wb3J0IEh5cHJsYW5kIGZyb20gXCJnaTovL0FzdGFsSHlwcmxhbmRcIjtcbmltcG9ydCB7IEd0aywgQXN0YWwgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiO1xuaW1wb3J0IHsgYmluZCB9IGZyb20gXCJhc3RhbFwiO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBXb3Jrc3BhY2VzKHsgb3JpZW50YXRpb24gfSkge1xuICBjb25zdCBoeXByID0gSHlwcmxhbmQuZ2V0X2RlZmF1bHQoKTtcbiAgLy8ge3cubWFwKCh3cykgPT4gKFxuICAvLyAgIDxidXR0b25cbiAgLy8gICAgIGhhbGlnbj17R3RrLkFsaWduLkNlbnRlcn1cbiAgLy8gICAgIGNsYXNzTmFtZT17YmluZChoeXByLCBcImZvY3VzZWRXb3Jrc3BhY2VcIikuYXMoKGZ3KSA9PlxuICAvLyAgICAgICB3cyA9PT0gZncuaWQgPyBcImZvY3VzZWRcIiA6IFwiXCIsXG4gIC8vICAgICApfVxuICAvLyAgICAgb25DbGlja2VkPXsoKSA9PiB3cy5mb2N1cygpfVxuICAvLyAgID5cbiAgLy8gICAgIHt3c31cbiAgLy8gICA8L2J1dHRvbj5cbiAgLy8gKSl9XG4gIC8vIGNvbnN0IGNsYXNzTmFtZXMgPSBWYXJpYWJsZSh7fSlcbiAgcmV0dXJuIChcbiAgICA8Ym94IGNsYXNzTmFtZT1cIndvcmtzcGFjZXNcIiBvcmllbnRhdGlvbj17b3JpZW50YXRpb259PlxuICAgICAge2JpbmQoaHlwciwgXCJ3b3Jrc3BhY2VzXCIpLmFzKHdvcmtzcGFjZXMgPT4ge1xuICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IHdvcmtzcGFjZXNcbiAgICAgICAgICAuZmlsdGVyKHdzID0+ICEod3MuaWQgPj0gLTk5ICYmIHdzLmlkIDw9IC0yKSkgLy8gZmlsdGVyIG91dCBzcGVjaWFsIHdvcmtzcGFjZXNcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpXG5cbiAgICAgICAgaWYgKGZpbHRlcmVkLmZpbmQodyA9PiB3LmlkID09PSAxKSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgIGZpbHRlcmVkLnNwbGljZSgwLCAwLCB7IFwiaWRcIjogMSwgXCJuYW1lXCI6IDEsIFwic3RhdGljXCI6IHRydWUgfSlcbiAgICAgICAgaWYgKGZpbHRlcmVkLmZpbmQodyA9PiB3LmlkID09PSAyKSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgIGZpbHRlcmVkLnNwbGljZSgxLCAwLCB7IFwiaWRcIjogMiwgXCJuYW1lXCI6IDIsIFwic3RhdGljXCI6IHRydWUgfSlcbiAgICAgICAgaWYgKGZpbHRlcmVkLmZpbmQodyA9PiB3LmlkID09PSAzKSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgIGZpbHRlcmVkLnNwbGljZSgyLCAwLCB7IFwiaWRcIjogMywgXCJuYW1lXCI6IDMsIFwic3RhdGljXCI6IHRydWUgfSlcbiAgICAgICAgaWYgKGZpbHRlcmVkLmZpbmQodyA9PiB3LmlkID09PSA0KSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgIGZpbHRlcmVkLnNwbGljZSgzLCAwLCB7IFwiaWRcIjogNCwgXCJuYW1lXCI6IDQsIFwic3RhdGljXCI6IHRydWUgfSlcbiAgICAgICAgaWYgKGZpbHRlcmVkLmZpbmQodyA9PiB3LmlkID09PSA1KSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgIGZpbHRlcmVkLnNwbGljZSg0LCAwLCB7IFwiaWRcIjogNSwgXCJuYW1lXCI6IDUsIFwic3RhdGljXCI6IHRydWUgfSlcblxuICAgICAgICByZXR1cm4gZmlsdGVyZWQubWFwKCh3KSA9PiAoXG4gICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgY2xhc3NOYW1lPXtiaW5kKGh5cHIsIFwiZm9jdXNlZFdvcmtzcGFjZVwiKS5hcygoZncpID0+XG4gICAgICAgICAgICAgIHcuaWQgPT09IGZ3LmlkID8gXCJmb2N1c2VkXCIgOiB3LnN0YXRpYyA/IFwiXCIgOiBcImV4aXN0XCJcbiAgICAgICAgICAgICl9XG4gICAgICAgICAgICBvbkNsaWNrZWQ9eygpID0+IGh5cHIubWVzc2FnZShgZGlzcGF0Y2ggd29ya3NwYWNlICR7dy5pZH1gKX1cbiAgICAgICAgICA+XG4gICAgICAgICAgICB7dy5uYW1lfVxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICApKVxuICAgICAgfSl9XG4gICAgICB7YmluZChoeXByLCBcImZvY3VzZWRDbGllbnRcIikuYXMoY2xpZW50ID0+IHtcbiAgICAgICAgaWYgKGNsaWVudClcbiAgICAgICAgICByZXR1cm4gPGljb24gaWNvbj17YmluZChjbGllbnQsIFwiaW5pdGlhbC1jbGFzc1wiKS5hcyhjID0+IEFzdGFsLkljb24ubG9va3VwX2ljb24oYykgPyBjIDogYy50b0xvd2VyQ2FzZSgpKX0gLz5cbiAgICAgICAgZWxzZVxuICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgfSl9XG4gICAgICB7YmluZChoeXByLCBcImZvY3VzZWRDbGllbnRcIikuYXMoY2xpZW50ID0+IHtcbiAgICAgICAgaWYgKGNsaWVudClcbiAgICAgICAgICByZXR1cm4gPGxhYmVsIGxhYmVsPXtiaW5kKGNsaWVudCwgXCJ0aXRsZVwiKX0gLz47XG4gICAgICAgICAgLy8gPGJveD5cbiAgICAgICAgICAvLyAgIDxpY29uIGljb249e2JpbmQoY2xpZW50LCBcImluaXRpYWwtY2xhc3NcIikuYXMoYyA9PiBBc3RhbC5JY29uLmxvb2t1cF9pY29uKGMpID8gYyA6IGMudG9Mb3dlckNhc2UoKSl9IC8+XG4gICAgICAgICAgLy8gPC9ib3g+O1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9KX1cbiAgICA8L2JveD5cbiAgKTtcbn1cbiIsICJpbXBvcnQgR3RrIGZyb20gXCJnaTovL0d0az92ZXJzaW9uPTMuMFwiXG5pbXBvcnQgeyBtZXJnZUJpbmRpbmdzLCB0eXBlIEJpbmRhYmxlQ2hpbGQgfSBmcm9tIFwiLi9hc3RhbGlmeS5qc1wiXG5pbXBvcnQgKiBhcyBXaWRnZXQgZnJvbSBcIi4vd2lkZ2V0LmpzXCJcblxuZnVuY3Rpb24gaXNBcnJvd0Z1bmN0aW9uKGZ1bmM6IGFueSk6IGZ1bmMgaXMgKGFyZ3M6IGFueSkgPT4gYW55IHtcbiAgICByZXR1cm4gIU9iamVjdC5oYXNPd24oZnVuYywgXCJwcm90b3R5cGVcIilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZyYWdtZW50KHsgY2hpbGRyZW4gPSBbXSwgY2hpbGQgfToge1xuICAgIGNoaWxkPzogQmluZGFibGVDaGlsZFxuICAgIGNoaWxkcmVuPzogQXJyYXk8QmluZGFibGVDaGlsZD5cbn0pIHtcbiAgICBpZiAoY2hpbGQpIGNoaWxkcmVuLnB1c2goY2hpbGQpXG4gICAgcmV0dXJuIG1lcmdlQmluZGluZ3MoY2hpbGRyZW4pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc3goXG4gICAgY3Rvcjoga2V5b2YgdHlwZW9mIGN0b3JzIHwgdHlwZW9mIEd0ay5XaWRnZXQsXG4gICAgeyBjaGlsZHJlbiwgLi4ucHJvcHMgfTogYW55LFxuKSB7XG4gICAgY2hpbGRyZW4gPz89IFtdXG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoY2hpbGRyZW4pKVxuICAgICAgICBjaGlsZHJlbiA9IFtjaGlsZHJlbl1cblxuICAgIGNoaWxkcmVuID0gY2hpbGRyZW4uZmlsdGVyKEJvb2xlYW4pXG5cbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAxKVxuICAgICAgICBwcm9wcy5jaGlsZCA9IGNoaWxkcmVuWzBdXG4gICAgZWxzZSBpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMSlcbiAgICAgICAgcHJvcHMuY2hpbGRyZW4gPSBjaGlsZHJlblxuXG4gICAgaWYgKHR5cGVvZiBjdG9yID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHJldHVybiBuZXcgY3RvcnNbY3Rvcl0ocHJvcHMpXG4gICAgfVxuXG4gICAgaWYgKGlzQXJyb3dGdW5jdGlvbihjdG9yKSlcbiAgICAgICAgcmV0dXJuIGN0b3IocHJvcHMpXG5cbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGNhbiBiZSBjbGFzcyBvciBmdW5jdGlvblxuICAgIHJldHVybiBuZXcgY3Rvcihwcm9wcylcbn1cblxuY29uc3QgY3RvcnMgPSB7XG4gICAgYm94OiBXaWRnZXQuQm94LFxuICAgIGJ1dHRvbjogV2lkZ2V0LkJ1dHRvbixcbiAgICBjZW50ZXJib3g6IFdpZGdldC5DZW50ZXJCb3gsXG4gICAgY2lyY3VsYXJwcm9ncmVzczogV2lkZ2V0LkNpcmN1bGFyUHJvZ3Jlc3MsXG4gICAgZHJhd2luZ2FyZWE6IFdpZGdldC5EcmF3aW5nQXJlYSxcbiAgICBlbnRyeTogV2lkZ2V0LkVudHJ5LFxuICAgIGV2ZW50Ym94OiBXaWRnZXQuRXZlbnRCb3gsXG4gICAgLy8gVE9ETzogZml4ZWRcbiAgICAvLyBUT0RPOiBmbG93Ym94XG4gICAgaWNvbjogV2lkZ2V0Lkljb24sXG4gICAgbGFiZWw6IFdpZGdldC5MYWJlbCxcbiAgICBsZXZlbGJhcjogV2lkZ2V0LkxldmVsQmFyLFxuICAgIC8vIFRPRE86IGxpc3Rib3hcbiAgICBvdmVybGF5OiBXaWRnZXQuT3ZlcmxheSxcbiAgICByZXZlYWxlcjogV2lkZ2V0LlJldmVhbGVyLFxuICAgIHNjcm9sbGFibGU6IFdpZGdldC5TY3JvbGxhYmxlLFxuICAgIHNsaWRlcjogV2lkZ2V0LlNsaWRlcixcbiAgICBzdGFjazogV2lkZ2V0LlN0YWNrLFxuICAgIHN3aXRjaDogV2lkZ2V0LlN3aXRjaCxcbiAgICB3aW5kb3c6IFdpZGdldC5XaW5kb3csXG59XG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW5hbWVzcGFjZVxuICAgIG5hbWVzcGFjZSBKU1gge1xuICAgICAgICB0eXBlIEVsZW1lbnQgPSBHdGsuV2lkZ2V0XG4gICAgICAgIHR5cGUgRWxlbWVudENsYXNzID0gR3RrLldpZGdldFxuICAgICAgICBpbnRlcmZhY2UgSW50cmluc2ljRWxlbWVudHMge1xuICAgICAgICAgICAgYm94OiBXaWRnZXQuQm94UHJvcHNcbiAgICAgICAgICAgIGJ1dHRvbjogV2lkZ2V0LkJ1dHRvblByb3BzXG4gICAgICAgICAgICBjZW50ZXJib3g6IFdpZGdldC5DZW50ZXJCb3hQcm9wc1xuICAgICAgICAgICAgY2lyY3VsYXJwcm9ncmVzczogV2lkZ2V0LkNpcmN1bGFyUHJvZ3Jlc3NQcm9wc1xuICAgICAgICAgICAgZHJhd2luZ2FyZWE6IFdpZGdldC5EcmF3aW5nQXJlYVByb3BzXG4gICAgICAgICAgICBlbnRyeTogV2lkZ2V0LkVudHJ5UHJvcHNcbiAgICAgICAgICAgIGV2ZW50Ym94OiBXaWRnZXQuRXZlbnRCb3hQcm9wc1xuICAgICAgICAgICAgLy8gVE9ETzogZml4ZWRcbiAgICAgICAgICAgIC8vIFRPRE86IGZsb3dib3hcbiAgICAgICAgICAgIGljb246IFdpZGdldC5JY29uUHJvcHNcbiAgICAgICAgICAgIGxhYmVsOiBXaWRnZXQuTGFiZWxQcm9wc1xuICAgICAgICAgICAgbGV2ZWxiYXI6IFdpZGdldC5MZXZlbEJhclByb3BzXG4gICAgICAgICAgICAvLyBUT0RPOiBsaXN0Ym94XG4gICAgICAgICAgICBvdmVybGF5OiBXaWRnZXQuT3ZlcmxheVByb3BzXG4gICAgICAgICAgICByZXZlYWxlcjogV2lkZ2V0LlJldmVhbGVyUHJvcHNcbiAgICAgICAgICAgIHNjcm9sbGFibGU6IFdpZGdldC5TY3JvbGxhYmxlUHJvcHNcbiAgICAgICAgICAgIHNsaWRlcjogV2lkZ2V0LlNsaWRlclByb3BzXG4gICAgICAgICAgICBzdGFjazogV2lkZ2V0LlN0YWNrUHJvcHNcbiAgICAgICAgICAgIHN3aXRjaDogV2lkZ2V0LlN3aXRjaFByb3BzXG4gICAgICAgICAgICB3aW5kb3c6IFdpZGdldC5XaW5kb3dQcm9wc1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QganN4cyA9IGpzeFxuIiwgImltcG9ydCBUcmF5IGZyb20gXCJnaTovL0FzdGFsVHJheVwiO1xuaW1wb3J0IHsgVmFyaWFibGUsIGJpbmQgfSBmcm9tIFwiYXN0YWxcIjtcbmltcG9ydCB7IEFzdGFsLCBHdGssIEdkayB9IGZyb20gXCJhc3RhbC9ndGszXCJcblxuY29uc3QgY3JlYXRlTWVudSA9IChtZW51TW9kZWwsIGFjdGlvbkdyb3VwKSA9PiB7XG4gIGNvbnN0IG1lbnUgPSBHdGsuTWVudS5uZXdfZnJvbV9tb2RlbChtZW51TW9kZWwpO1xuICBtZW51Lmluc2VydF9hY3Rpb25fZ3JvdXAoJ2RidXNtZW51JywgYWN0aW9uR3JvdXApO1xuXG4gIHJldHVybiBtZW51O1xufTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU3lzVHJheSh7b3JpZW50YXRpb259KSB7XG4gIGNvbnN0IHRyYXkgPSBUcmF5LmdldF9kZWZhdWx0KClcbiAgXG4gIHJldHVybiA8Ym94IGNsYXNzTmFtZT1cInRyYXlcIiBvcmllbnRhdGlvbj17b3JpZW50YXRpb259IHZpc2libGU9e2JpbmQodHJheSwgXCJpdGVtc1wiKS5hcyhpdGVtcz0+aXRlbXMubGVuZ3RoPjApfT5cbiAgICB7YmluZCh0cmF5LCBcIml0ZW1zXCIpLmFzKGl0ZW1zID0+IGl0ZW1zLm1hcChpdGVtID0+IHtcblxuICAgICAgLy8gTWFrZSBzdXJlIHlvdSdyZSBib3VuZCB0byB0aGUgbWVudU1vZGVsIGFuZCBhY3Rpb25Hcm91cCB3aGljaCBjYW4gY2hhbmdlXG5cbiAgICAgIGxldCBtZW51O1xuXG4gICAgICBjb25zdCBlbnRyeUJpbmRpbmcgPSBWYXJpYWJsZS5kZXJpdmUoXG4gICAgICAgIFtiaW5kKGl0ZW0sICdtZW51TW9kZWwnKSwgYmluZChpdGVtLCAnYWN0aW9uR3JvdXAnKV0sXG4gICAgICAgIChtZW51TW9kZWwsIGFjdGlvbkdyb3VwKSA9PiB7XG4gICAgICAgICAgaWYgKCFtZW51TW9kZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKGBNZW51IE1vZGVsIG5vdCBmb3VuZCBmb3IgJHtpdGVtLmlkfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWFjdGlvbkdyb3VwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcihgQWN0aW9uIEdyb3VwIG5vdCBmb3VuZCBmb3IgJHtpdGVtLmlkfWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG1lbnUgPSBjcmVhdGVNZW51KG1lbnVNb2RlbCwgYWN0aW9uR3JvdXApO1xuICAgICAgICB9LFxuICAgICAgKTtcblxuXG4gICAgICByZXR1cm4gPGJ1dHRvblxuICAgICAgICBvbkNsaWNrPXsoYnRuLCBldmVudCk9PntcbiAgICAgICAgICAvLyBpZiAoaXNQcmltYXJ5Q2xpY2soZXZlbnQpKSB7XG4gICAgICAgICAgLy8gICBpdGVtLmFjdGl2YXRlKDAsIDApO1xuICAgICAgICAgIC8vIH1cbiAgICAgICAgICAvLyBlbHNlIGlmIChpc1NlY29uZGFyeUNsaWNrKGV2ZW50KSl7XG4gICAgICAgICAgICBcbiAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAvLyBzcGF3biBtZW51Li4uICh1c2Ugb25lIGxvY2F0aW9uKVxuICAgICAgICAgIC8vIG9uIGJ1dHRvblxuICAgICAgICAgIG1lbnU/LnBvcHVwX2F0X3dpZGdldChidG4sIEdkay5HcmF2aXR5Lk5PUlRILCBHZGsuR3Jhdml0eS5TT1VUSCwgbnVsbCk7XG4gICAgICAgICAgLy8gb24gbW91c2UgcG9pbnRlclxuICAgICAgICAgIC8vIG1lbnU/LnBvcHVwX2F0X3BvaW50ZXIobnVsbCk7XG4gICAgICAgIH19XG4gICAgICAgIG9uRGVzdHJveT17KCkgPT4ge1xuICAgICAgICAgIG1lbnU/LmRlc3Ryb3koKTtcbiAgICAgICAgICBlbnRyeUJpbmRpbmcuZHJvcCgpO1xuICAgICAgICB9fT5cbiAgICAgICAgPGljb24gZy1pY29uPXtiaW5kKGl0ZW0sIFwiZ2ljb25cIil9IC8qIGljb249e2JpbmQoaXRlbSwgXCJpY29uTmFtZVwiKX0gKi8gLz5cbiAgICAgIDwvYnV0dG9uPlxuICAgIH0pKX1cbiAgPC9ib3g+XG59XG4iLCAiaW1wb3J0IHsgQXN0YWwsIEd0aywgR2RrIH0gZnJvbSBcImFzdGFsL2d0azNcIlxuaW1wb3J0IE5vdGlmZCBmcm9tIFwiZ2k6Ly9Bc3RhbE5vdGlmZFwiXG5pbXBvcnQgeyBWYXJpYWJsZSwgYmluZCwgdGltZW91dCB9IGZyb20gXCJhc3RhbFwiXG5cbmNvbnN0IHsgU1RBUlQsIENFTlRFUiwgRU5EIH0gPSBHdGsuQWxpZ25cblxuXG5jb25zdCBnZXRVcmdlbmN5ID0gKG4pID0+IHtcbiAgICBjb25zdCB7IExPVywgTk9STUFMLCBDUklUSUNBTCB9ID0gTm90aWZkLlVyZ2VuY3lcbiAgICBzd2l0Y2ggKG4udXJnZW5jeSkge1xuICAgICAgICBjYXNlIExPVzogcmV0dXJuIFwibG93XCJcbiAgICAgICAgY2FzZSBDUklUSUNBTDogcmV0dXJuIFwiY3JpdGljYWxcIlxuICAgICAgICBjYXNlIE5PUk1BTDpcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIFwibm9ybWFsXCJcbiAgICB9XG59XG5cbmZ1bmN0aW9uIE5vdGlmKG5vdGlmKSB7XG4gIHJldHVybiA8ZXZlbnRib3hcbiAgICBjbGFzc05hbWU9e2dldFVyZ2VuY3kobm90aWYpfVxuICAgIG9uQ2xpY2s9eygpID0+IG5vdGlmLmRpc21pc3MoKX1cbiAgPlxuICAgIDxib3ggdmVydGljYWw+XG4gICAgICA8Ym94PlxuICAgICAgICB7KChub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSkgJiYgPGljb25cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiXG4gICAgICAgICAgdmlzaWJsZT17Qm9vbGVhbihub3RpZi5hcHBJY29uIHx8IG5vdGlmLmRlc2t0b3BFbnRyeSl9XG4gICAgICAgICAgaWNvbj17bm90aWYuYXBwSWNvbiB8fCBub3RpZi5kZXNrdG9wRW50cnl9XG4gICAgICAgIC8+KSB8fCAobm90aWYuaW1hZ2UgJiYgZmlsZUV4aXN0cyhub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIHZhbGlnbj17U1RBUlR9XG4gICAgICAgICAgY2xhc3NOYW1lPVwiaW1hZ2VcIlxuICAgICAgICAgIGNzcz17YGJhY2tncm91bmQtaW1hZ2U6IHVybCgnJHtub3RpZi5pbWFnZX0nKWB9XG4gICAgICAgIC8+KSB8fCAoKG5vdGlmLmltYWdlICYmIGlzSWNvbihub3RpZi5pbWFnZSkgJiYgPGJveFxuICAgICAgICAgIGV4cGFuZD17ZmFsc2V9XG4gICAgICAgICAgdmFsaWduPXtTVEFSVH1cbiAgICAgICAgICBjbGFzc05hbWU9XCJpbWFnZVwiPlxuICAgICAgICAgIDxpY29uIGljb249e25vdGlmLmltYWdlfSBleHBhbmQgaGFsaWduPXtDRU5URVJ9IHZhbGlnbj17Q0VOVEVSfSAvPlxuICAgICAgICA8L2JveD4pKX1cbiAgICAgICAgPGJveCBjbGFzc05hbWU9XCJtYWluXCIgdmVydGljYWw+XG4gICAgICAgICAgPGJveCBjbGFzc05hbWU9XCJoZWFkZXJcIj5cbiAgICAgICAgICAgIDxsYWJlbFxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJzdW1tYXJ5XCJcbiAgICAgICAgICAgICAgaGFsaWduPXtTVEFSVH1cbiAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICBsYWJlbD17bm90aWYuc3VtbWFyeX1cbiAgICAgICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICAgICAgaGV4cGFuZFxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxidXR0b24gb25DbGlja2VkPXsoKSA9PiBub3RpZi5kaXNtaXNzKCl9PlxuICAgICAgICAgICAgICA8aWNvbiBpY29uPVwid2luZG93LWNsb3NlLXN5bWJvbGljXCIgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDwvYm94PlxuICAgICAgICAgIDxib3ggY2xhc3NOYW1lPVwiY29udGVudFwiPlxuICAgICAgICAgICAgPGJveCB2ZXJ0aWNhbD5cbiAgICAgICAgICAgICAge25vdGlmLmJvZHkgJiYgPGxhYmVsXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYm9keVwiXG4gICAgICAgICAgICAgICAgd3JhcFxuICAgICAgICAgICAgICAgIHVzZU1hcmt1cFxuICAgICAgICAgICAgICAgIGhhbGlnbj17U1RBUlR9XG4gICAgICAgICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgICAgICAgIGp1c3RpZnlGaWxsXG4gICAgICAgICAgICAgICAgbGFiZWw9e25vdGlmLmJvZHl9XG4gICAgICAgICAgICAgIC8+fVxuICAgICAgICAgICAgPC9ib3g+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgIDwvYm94PlxuICAgICAgPC9ib3g+XG4gICAgICA8Ym94PlxuICAgICAgICB7bm90aWYuZ2V0X2FjdGlvbnMoKS5sZW5ndGggPiAwICYmIDxib3ggY2xhc3NOYW1lPVwiYWN0aW9uc1wiPlxuICAgICAgICAgIHtub3RpZi5nZXRfYWN0aW9ucygpLm1hcCgoeyBsYWJlbCwgaWQgfSkgPT4gKFxuICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICBoZXhwYW5kXG4gICAgICAgICAgICAgIG9uQ2xpY2tlZD17KCkgPT4gbm90aWYuaW52b2tlKGlkKX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgPGxhYmVsIGxhYmVsPXtsYWJlbH0gaGFsaWduPXtDRU5URVJ9IGhleHBhbmQgLz5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICkpfVxuICAgICAgICA8L2JveD59XG4gICAgICA8L2JveD5cbiAgICA8L2JveD5cbiAgPC9ldmVudGJveD5cbn1cblxuLy8gVGhlIHB1cnBvc2UgaWYgdGhpcyBjbGFzcyBpcyB0byByZXBsYWNlIFZhcmlhYmxlPEFycmF5PFdpZGdldD4+XG4vLyB3aXRoIGEgTWFwPG51bWJlciwgV2lkZ2V0PiB0eXBlIGluIG9yZGVyIHRvIHRyYWNrIG5vdGlmaWNhdGlvbiB3aWRnZXRzXG4vLyBieSB0aGVpciBpZCwgd2hpbGUgbWFraW5nIGl0IGNvbnZpbmllbnRseSBiaW5kYWJsZSBhcyBhbiBhcnJheVxuY2xhc3MgTm90aWZpY2F0aW9uTWFwIHtcbiAgICAvLyB0aGUgdW5kZXJseWluZyBtYXAgdG8ga2VlcCB0cmFjayBvZiBpZCB3aWRnZXQgcGFpcnNcbiAgICBtYXAgPSBuZXcgTWFwKClcblxuICAgIC8vIGl0IG1ha2VzIHNlbnNlIHRvIHVzZSBhIFZhcmlhYmxlIHVuZGVyIHRoZSBob29kIGFuZCB1c2UgaXRzXG4gICAgLy8gcmVhY3Rpdml0eSBpbXBsZW1lbnRhdGlvbiBpbnN0ZWFkIG9mIGtlZXBpbmcgdHJhY2sgb2Ygc3Vic2NyaWJlcnMgb3Vyc2VsdmVzXG4gICAgdmFyID0gVmFyaWFibGUoW10pXG5cbiAgICAvLyBub3RpZnkgc3Vic2NyaWJlcnMgdG8gcmVyZW5kZXIgd2hlbiBzdGF0ZSBjaGFuZ2VzXG4gICAgbm90aWZpeSgpIHtcbiAgICAgICAgdGhpcy52YXIuc2V0KFsuLi50aGlzLm1hcC52YWx1ZXMoKV0ucmV2ZXJzZSgpKVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBub3RpZmQgPSBOb3RpZmQuZ2V0X2RlZmF1bHQoKVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiB1bmNvbW1lbnQgdGhpcyBpZiB5b3Ugd2FudCB0b1xuICAgICAgICAgKiBpZ25vcmUgdGltZW91dCBieSBzZW5kZXJzIGFuZCBlbmZvcmNlIG91ciBvd24gdGltZW91dFxuICAgICAgICAgKiBub3RlIHRoYXQgaWYgdGhlIG5vdGlmaWNhdGlvbiBoYXMgYW55IGFjdGlvbnNcbiAgICAgICAgICogdGhleSBtaWdodCBub3Qgd29yaywgc2luY2UgdGhlIHNlbmRlciBhbHJlYWR5IHRyZWF0cyB0aGVtIGFzIHJlc29sdmVkXG4gICAgICAgICAqL1xuICAgICAgICAvLyBub3RpZmQuaWdub3JlVGltZW91dCA9IHRydWVcblxuICAgICAgICBub3RpZmQuY29ubmVjdChcIm5vdGlmaWVkXCIsIChuLCBpZCkgPT4ge1xuICAgICAgICAgIC8vIHByaW50KHR5cGVvZiBub3RpZmQuZ2V0X25vdGlmaWNhdGlvbihpZCkpXG4gICAgICAgICAgICB0aGlzLnNldChpZCwgTm90aWYobm90aWZkLmdldF9ub3RpZmljYXRpb24oaWQpKSlcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBub3RpZmljYXRpb25zIGNhbiBiZSBjbG9zZWQgYnkgdGhlIG91dHNpZGUgYmVmb3JlXG4gICAgICAgIC8vIGFueSB1c2VyIGlucHV0LCB3aGljaCBoYXZlIHRvIGJlIGhhbmRsZWQgdG9vXG4gICAgICAgIG5vdGlmZC5jb25uZWN0KFwicmVzb2x2ZWRcIiwgKF8sIGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmRlbGV0ZShpZClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICAvLyBpbiBjYXNlIG9mIHJlcGxhY2VjbWVudCBkZXN0cm95IHByZXZpb3VzIHdpZGdldFxuICAgICAgICB0aGlzLm1hcC5nZXQoa2V5KT8uZGVzdHJveSgpXG4gICAgICAgIHRoaXMubWFwLnNldChrZXksIHZhbHVlKVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIGRlbGV0ZShrZXkpIHtcbiAgICAgICAgdGhpcy5tYXAuZ2V0KGtleSk/LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLm1hcC5kZWxldGUoa2V5KVxuICAgICAgICB0aGlzLm5vdGlmaXkoKVxuICAgIH1cblxuICAgIC8vIG5lZWRlZCBieSB0aGUgU3Vic2NyaWJhYmxlIGludGVyZmFjZVxuICAgIGdldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFyLmdldCgpXG4gICAgfVxuXG4gICAgLy8gbmVlZGVkIGJ5IHRoZSBTdWJzY3JpYmFibGUgaW50ZXJmYWNlXG4gICAgc3Vic2NyaWJlKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhci5zdWJzY3JpYmUoY2FsbGJhY2spXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBOb3RpZmljYXRpb25zKG1vbml0b3IpIHtcbiAgY29uc3QgeyBUT1AgfSA9IEFzdGFsLldpbmRvd0FuY2hvcjtcblxuICAvLyBjb25zdCBub3RpZmQgPSBOb3RpZmQuZ2V0X2RlZmF1bHQoKTtcblxuICBjb25zdCBub3RpZnMgPSBuZXcgTm90aWZpY2F0aW9uTWFwKCk7XG5cbiAgLy8gbm90aWZkLmNvbm5lY3QoXCJub3RpZmllZFwiLCApXG5cbiAgcmV0dXJuIDx3aW5kb3dcbiAgICBnZGttb25pdG9yPXttb25pdG9yfVxuICAgIG5hbWVzcGFjZT1cImFncy1ub3RpZmRcIlxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGFuY2hvcj17VE9QfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5OT1JNQUx9XG4gICAgY2xhc3NOYW1lPVwiTm90aWZpY2F0aW9uc1wiPlxuICAgIDxib3ggdmVydGljYWw+XG4gICAgICB7YmluZChub3RpZnMpfVxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICJpbXBvcnQgQXBwcyBmcm9tIFwiZ2k6Ly9Bc3RhbEFwcHNcIlxuaW1wb3J0IHsgQXBwLCBBc3RhbCwgR2RrLCBHdGsgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5pbXBvcnQgeyBiaW5kLCBWYXJpYWJsZSwgZXhlY0FzeW5jLCBleGVjIH0gZnJvbSBcImFzdGFsXCJcblxuY29uc3QgTUFYX0lURU1TID0gOFxuXG5mdW5jdGlvbiBoaWRlKCkge1xuICBBcHAuZ2V0X3dpbmRvdyhcImxhdW5jaGVyXCIpLmhpZGUoKVxufVxuXG5mdW5jdGlvbiBBcHBCdXR0b24oeyBhcHAgfSkge1xuICByZXR1cm4gPGJ1dHRvblxuICAgIGNsYXNzTmFtZT1cIkFwcEJ1dHRvblwiXG4gICAgb25DbGlja2VkPXsoKSA9PiB7IGhpZGUoKTsgYXBwLmxhdW5jaCgpIH19PlxuICAgIDxib3g+XG4gICAgICA8aWNvbiBpY29uPXthcHAuaWNvbk5hbWV9IC8+XG4gICAgICA8Ym94IHZhbGlnbj17R3RrLkFsaWduLkNFTlRFUn0gdmVydGljYWw+XG4gICAgICAgIDxsYWJlbFxuICAgICAgICAgIGNsYXNzTmFtZT1cIm5hbWVcIlxuICAgICAgICAgIHRydW5jYXRlXG4gICAgICAgICAgeGFsaWduPXswfVxuICAgICAgICAgIGxhYmVsPXthcHAubmFtZX1cbiAgICAgICAgLz5cbiAgICAgICAge2FwcC5kZXNjcmlwdGlvbiAmJiA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZXNjcmlwdGlvblwiXG4gICAgICAgICAgd3JhcFxuICAgICAgICAgIHhhbGlnbj17MH1cbiAgICAgICAgICBsYWJlbD17YXBwLmRlc2NyaXB0aW9ufVxuICAgICAgICAvPn1cbiAgICAgIDwvYm94PlxuICAgIDwvYm94PlxuICA8L2J1dHRvbj5cbn1cblxuZnVuY3Rpb24gc3RyX2Z1enp5IChzdHIsIHMpIHtcbiAgICB2YXIgaGF5ID0gc3RyLnRvTG93ZXJDYXNlKCksIGkgPSAwLCBuID0gLTEsIGw7XG4gICAgcyA9IHMudG9Mb3dlckNhc2UoKTtcbiAgICBmb3IgKDsgbCA9IHNbaSsrXSA7KSBpZiAoIX4obiA9IGhheS5pbmRleE9mKGwsIG4gKyAxKSkpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IHJlcyA9IFZhcmlhYmxlKFwiLi4uXCIpXG5jb25zdCB3aW5kb3dzID0gVmFyaWFibGUoW10pXG5cbmNvbnN0IHBsdWdpbnMgPSBbXG4gIHtcbiAgICBcImluaXRcIjogKCk9Pnt9LFxuICAgIFwicXVlcnlcIjogKHRleHQpID0+IFt7XG4gICAgICBcImxhYmVsXCI6IHRleHQsXG4gICAgICBcInN1YlwiOiBcInJ1blwiLFxuICAgICAgXCJpY29uXCI6IFwidXRpbGl0aWVzLXRlcm1pbmFsXCIsXG4gICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJzaFwiLCBcIi1jXCIsIHRleHRdKVxuICAgIH1dLFxuICAgIFwicHJlZml4XCI6IFwiL1wiLFxuICB9LFxuICB7XG4gICAgXCJpbml0XCI6ICgpPT57fSxcbiAgICBcInF1ZXJ5XCI6ICh0ZXh0KSA9PiB7XG4gICAgICByZXMuc2V0KFwiLi4uXCIpO1xuICAgICAgaWYgKHRleHQubGVuZ3RoID4gMClcbiAgICAgICAgZXhlY0FzeW5jKFtcInFhbGNcIiwgXCItdFwiLCB0ZXh0XSkudGhlbihvdXQ9PnJlcy5zZXQob3V0KSkuY2F0Y2goY29uc29sZS5lcnJvcik7XG4gICAgICByZXR1cm4gW3tcbiAgICAgICAgXCJsYWJlbFwiOiBiaW5kKHJlcyksXG4gICAgICAgIFwic3ViXCI6IFwiY2FsY3VsYXRlIHVzaW5nIHFhbGNcIixcbiAgICAgICAgXCJpY29uXCI6IFwiYWNjZXNzb3JpZXMtY2FsY3VsYXRvclwiLFxuICAgICAgICBcImFjdGl2YXRlXCI6ICgpID0+IGV4ZWNBc3luYyhbXCJzaFwiLCBcIi1jXCIsIGBlY2hvICR7cmVzLmdldCgpfSB8IHdsLWNvcHlgXSlcbiAgICAgIH1dXG4gICAgfSxcbiAgICBcInByZWZpeFwiOiBcIj1cIixcbiAgfSxcbiAge1xuICAgIFwiaW5pdFwiOiAoKT0+d2luZG93cy5zZXQoSlNPTi5wYXJzZShleGVjKFtcImh5cHJjdGxcIiwgXCItalwiLCBcImNsaWVudHNcIl0pKSksXG4gICAgXCJxdWVyeVwiOiAodGV4dCkgPT4gd2luZG93cy5nZXQoKS5tYXAod2luZG93ID0+IHtyZXR1cm4ge1xuICAgICAgXCJsYWJlbFwiOiB3aW5kb3dbXCJ0aXRsZVwiXSxcbiAgICAgIFwic3ViXCI6IGAke3dpbmRvd1tcInh3YXlsYW5kXCJdID8gXCJbWF0gXCIgOiBcIlwifSR7d2luZG93W1wiY2xhc3NcIl19IFske3dpbmRvd1tcInBpZFwiXX1dICR7d2luZG93W1wiZnVsbHNjcmVlblwiXSA/IFwiKGZ1bGxzY3JlZW4pIFwiIDogd2luZG93W1wiZmxvYXRpbmdcIl0gPyBcIihmbG9hdGluZykgXCIgOiBcIlwifW9uICR7d2luZG93W1wid29ya3NwYWNlXCJdW1wiaWRcIl19YCxcbiAgICAgIFwiaWNvblwiOiBBc3RhbC5JY29uLmxvb2t1cF9pY29uKHdpbmRvd1tcImluaXRpYWxDbGFzc1wiXSkgPyB3aW5kb3dbXCJpbml0aWFsQ2xhc3NcIl0gOiB3aW5kb3dbXCJpbml0aWFsQ2xhc3NcIl0udG9Mb3dlckNhc2UoKSxcbiAgICAgIFwiYWN0aXZhdGVcIjogKCkgPT4gZXhlY0FzeW5jKFtcImh5cHJjdGxcIiwgXCJkaXNwYXRjaFwiLCBcImZvY3Vzd2luZG93XCIsIGBhZGRyZXNzOiR7d2luZG93W1wiYWRkcmVzc1wiXX1gXSksXG4gICAgfX0pLmZpbHRlcih3PT5zdHJfZnV6enkod1tcImxhYmVsXCJdLCB0ZXh0KSB8fCBzdHJfZnV6enkod1tcInN1YlwiXSwgdGV4dCkpLFxuICAgIFwicHJlZml4XCI6IFwiO1wiLFxuICB9LFxuXVxuXG5mdW5jdGlvbiBQbHVnaW5CdXR0b24oeyBpdGVtIH0pIHtcbiAgcmV0dXJuIDxidXR0b25cbiAgICBvbkNsaWNrZWQ9eygpID0+IHsgaGlkZSgpOyBpdGVtLmFjdGl2YXRlKCkgfX0+XG4gICAgPGJveD5cbiAgICAgIDxpY29uIGljb249e2l0ZW0uaWNvbn0gLz5cbiAgICAgIDxib3ggdmFsaWduPXtHdGsuQWxpZ24uQ0VOVEVSfSB2ZXJ0aWNhbD5cbiAgICAgICAgPGxhYmVsXG4gICAgICAgICAgY2xhc3NOYW1lPVwibmFtZVwiXG4gICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2l0ZW0ubGFiZWx9XG4gICAgICAgIC8+XG4gICAgICAgIHtpdGVtLnN1YiAmJiA8bGFiZWxcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZXNjcmlwdGlvblwiXG4gICAgICAgICAgdHJ1bmNhdGVcbiAgICAgICAgICB4YWxpZ249ezB9XG4gICAgICAgICAgbGFiZWw9e2l0ZW0uc3VifVxuICAgICAgICAvPn1cbiAgICAgIDwvYm94PlxuICAgIDwvYm94PlxuICA8L2J1dHRvbj5cbn1cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEFwcGxhdW5jaGVyKCkge1xuICBjb25zdCB7IENFTlRFUiB9ID0gR3RrLkFsaWduXG4gIGNvbnN0IGFwcHMgPSBuZXcgQXBwcy5BcHBzKClcblxuICBjb25zdCB0ZXh0ID0gVmFyaWFibGUoXCJcIilcbiAgY29uc3QgbGlzdCA9IHRleHQodGV4dCA9PiB7XG4gICAgZm9yIChsZXQgaWR4IGluIHBsdWdpbnMpIHtcbiAgICAgIGlmKHRleHQuc3Vic3RyaW5nKDAsIDEpID09IHBsdWdpbnNbaWR4XS5wcmVmaXgpIHtcbiAgICAgICAgaWYgKHRleHQubGVuZ3RoID09IDEpXG4gICAgICAgICAgcGx1Z2luc1tpZHhdLmluaXQoKVxuICAgICAgICByZXR1cm4gcGx1Z2luc1tpZHhdLnF1ZXJ5KHRleHQuc3Vic3RyaW5nKDEsIHRleHQubGVuZ3RoKSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFwcHMuZnV6enlfcXVlcnkodGV4dCkuc2xpY2UoMCwgTUFYX0lURU1TKVxuICB9KVxuICBjb25zdCBvbkVudGVyID0gKGlucHV0Ym94KSA9PiB7XG4gICAgaW5wdXRib3gucGFyZW50LmNoaWxkcmVuWzFdLmNoaWxkcmVuWzBdLmNsaWNrZWQoKVxuICAgIC8vIGNvbnN0IHQgPSB0ZXh0LmdldCgpO1xuICAgIC8vIGZvciAobGV0IGlkeCBpbiBwbHVnaW5zKSB7XG4gICAgLy8gICBpZih0LnN1YnN0cmluZygwLCAxKSA9PSBwbHVnaW5zW2lkeF0ucHJlZml4KSB7XG4gICAgLy8gICAgIHBsdWdpbnNbaWR4XS5xdWVyeSh0LnN1YnN0cmluZygxLCB0Lmxlbmd0aCkpWzBdLmFjdGl2YXRlKClcbiAgICAvLyAgICAgaGlkZSgpXG4gICAgLy8gICAgIHJldHVyblxuICAgIC8vICAgfVxuICAgIC8vIH1cbiAgICAvLyBhcHBzLmZ1enp5X3F1ZXJ5KHQpPy5bMF0ubGF1bmNoKClcbiAgICBoaWRlKClcbiAgfVxuXG4gIHJldHVybiA8d2luZG93XG4gICAgbmFtZT1cImxhdW5jaGVyXCJcbiAgICBuYW1lc3BhY2U9XCJhZ3MtbGF1bmNoZXJcIlxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGFuY2hvcj17QXN0YWwuV2luZG93QW5jaG9yLlRPUCB8IEFzdGFsLldpbmRvd0FuY2hvci5CT1RUT019XG4gICAgZXhjbHVzaXZpdHk9e0FzdGFsLkV4Y2x1c2l2aXR5LklHTk9SRX1cbiAgICBrZXltb2RlPXtBc3RhbC5LZXltb2RlLk9OX0RFTUFORH1cbiAgICBhcHBsaWNhdGlvbj17QXBwfVxuICAgIHZpc2libGU9e2ZhbHNlfVxuICAgIG9uU2hvdz17KHNlbGYpID0+IHt0ZXh0LnNldChcIlwiKTsgc2VsZi5nZXRfY2hpbGQoKS5jaGlsZHJlblsxXS5jaGlsZHJlblsxXS5jaGlsZHJlblswXS5ncmFiX2ZvY3VzX3dpdGhvdXRfc2VsZWN0aW5nKCl9fVxuICAgIG9uS2V5UHJlc3NFdmVudD17ZnVuY3Rpb24gKHNlbGYsIGV2ZW50KSB7XG4gICAgICBpZiAoZXZlbnQuZ2V0X2tleXZhbCgpWzFdID09PSBHZGsuS0VZX0VzY2FwZSlcbiAgICAgICAgc2VsZi5oaWRlKClcbiAgICB9fT5cbiAgICA8Ym94PlxuICAgICAgPGV2ZW50Ym94IHdpZHRoUmVxdWVzdD17MjAwMH0gZXhwYW5kIG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICA8Ym94IGhleHBhbmQ9e2ZhbHNlfSB2ZXJ0aWNhbD5cbiAgICAgICAgPGV2ZW50Ym94IGhlaWdodFJlcXVlc3Q9ezIwMH0gb25DbGljaz17aGlkZX0gLz5cbiAgICAgICAgPGJveCB3aWR0aFJlcXVlc3Q9ezUwMH0gY2xhc3NOYW1lPVwibWFpblwiIHZlcnRpY2FsPlxuICAgICAgICAgIDxlbnRyeVxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUZXh0PVwiU2VhcmNoXCJcbiAgICAgICAgICAgIHRleHQ9e3RleHQoKX1cbiAgICAgICAgICAgIG9uQ2hhbmdlZD17c2VsZiA9PiB0ZXh0LnNldChzZWxmLnRleHQpfVxuICAgICAgICAgICAgb25BY3RpdmF0ZT17b25FbnRlcn1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxib3ggc3BhY2luZz17Nn0gdmVydGljYWw+XG4gICAgICAgICAgICB7bGlzdC5hcyhsaXN0ID0+IGxpc3QubWFwKGl0ZW0gPT4ge1xuICAgICAgICAgICAgICBpZiAoaXRlbS5hcHApXG4gICAgICAgICAgICAgICAgcmV0dXJuIDxBcHBCdXR0b24gYXBwPXtpdGVtfSAvPlxuICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuIDxQbHVnaW5CdXR0b24gaXRlbT17aXRlbX0gLz5cbiAgICAgICAgICAgIH0pKX1cbiAgICAgICAgICA8L2JveD5cbiAgICAgICAgICA8Ym94XG4gICAgICAgICAgICBoYWxpZ249e0NFTlRFUn1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5vdC1mb3VuZFwiXG4gICAgICAgICAgICB2ZXJ0aWNhbFxuICAgICAgICAgICAgdmlzaWJsZT17bGlzdC5hcyhsID0+IGwubGVuZ3RoID09PSAwKX0+XG4gICAgICAgICAgICA8aWNvbiBpY29uPVwic3lzdGVtLXNlYXJjaC1zeW1ib2xpY1wiIC8+XG4gICAgICAgICAgICA8bGFiZWwgbGFiZWw9XCJObyBtYXRjaCBmb3VuZFwiIC8+XG4gICAgICAgICAgPC9ib3g+XG4gICAgICAgIDwvYm94PlxuICAgICAgICA8ZXZlbnRib3ggZXhwYW5kIG9uQ2xpY2s9e2hpZGV9IC8+XG4gICAgICA8L2JveD5cbiAgICAgIDxldmVudGJveCB3aWR0aFJlcXVlc3Q9ezIwMDB9IGV4cGFuZCBvbkNsaWNrPXtoaWRlfSAvPlxuICAgIDwvYm94PlxuICA8L3dpbmRvdz5cbn1cbiIsICJpbXBvcnQgV3AgZnJvbSBcImdpOi8vQXN0YWxXcFwiO1xuaW1wb3J0IHsgQXN0YWwgfSBmcm9tIFwiYXN0YWwvZ3RrM1wiXG5pbXBvcnQgeyBiaW5kLCBWYXJpYWJsZSwgZXhlYywgbW9uaXRvckZpbGUsIHJlYWRGaWxlLCB0aW1lb3V0IH0gZnJvbSBcImFzdGFsXCJcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gT3NkKG1vbml0b3IpIHtcbiAgY29uc3QgU0hPV19USU1FID0gMTUwMDtcbiAgY29uc3QgYXVkaW8gPSBXcC5nZXRfZGVmYXVsdCgpLmF1ZGlvLmRlZmF1bHRTcGVha2VyO1xuICBjb25zdCBkYXRhID0gVmFyaWFibGUoMCk7XG4gIGNvbnN0IGljb24gPSBWYXJpYWJsZShcIlwiKTtcbiAgY29uc3Qgc2hvdyA9IFZhcmlhYmxlKHRydWUpO1xuICBjb25zdCBicmlnaHRuZXNzX21heCA9IGV4ZWMoXCJicmlnaHRuZXNzY3RsIG1heFwiKTtcbiAgbGV0IHRpbWVyO1xuICBtb25pdG9yRmlsZShgL3N5cy9jbGFzcy9iYWNrbGlnaHQvJHtleGVjKFwic2ggLWMgJ2xzIC13MSAvc3lzL2NsYXNzL2JhY2tsaWdodHxoZWFkIC0xJ1wiKX0vYnJpZ2h0bmVzc2AsIChmaWxlLCBldmVudCkgPT4ge1xuICAgIGlmIChldmVudCA9PSAxKSB7XG4gICAgICBkYXRhLnNldChwYXJzZUludChyZWFkRmlsZShmaWxlKSkgLyBicmlnaHRuZXNzX21heCk7XG4gICAgICBpY29uLnNldChcImRpc3BsYXktYnJpZ2h0bmVzcy1zeW1ib2xpY1wiKVxuICAgICAgdGltZXI/LmNhbmNlbCgpXG4gICAgICBzaG93LnNldCh0cnVlKTtcbiAgICAgIHRpbWVyID0gdGltZW91dChTSE9XX1RJTUUsICgpID0+IHNob3cuc2V0KGZhbHNlKSk7XG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IHNwX2ljbyA9IGJpbmQoYXVkaW8sIFwidm9sdW1lSWNvblwiKVxuICBzcF9pY28uc3Vic2NyaWJlKGkgPT4ge1xuICAgIGljb24uc2V0KGkpO1xuICAgIGRhdGEuc2V0KGF1ZGlvLnZvbHVtZSk7XG4gICAgdGltZXI/LmNhbmNlbCgpXG4gICAgc2hvdy5zZXQodHJ1ZSk7XG4gICAgdGltZXIgPSB0aW1lb3V0KFNIT1dfVElNRSwgKCkgPT4gc2hvdy5zZXQoZmFsc2UpKTtcbiAgfSlcbiAgcmV0dXJuIDx3aW5kb3dcbiAgICBtb25pdG9yPXttb25pdG9yfVxuICAgIGxheWVyPXtBc3RhbC5MYXllci5PVkVSTEFZfVxuICAgIGV4Y2x1c2l2aXR5PXtBc3RhbC5FeGNsdXNpdml0eS5JR05PUkV9XG4gICAgYW5jaG9yPXtBc3RhbC5XaW5kb3dBbmNob3IuQk9UVE9NfVxuICAgIG1hcmdpbi1ib3R0b209ezIwMH1cbiAgICBjbGFzc05hbWU9XCJPc2RcIlxuICAgIG5hbWVzcGFjZT1cImFncy1sYXVuY2hlclwiXG4gID5cbiAgICA8Ym94IHZpc2libGU9e2JpbmQoc2hvdyl9PlxuICAgICAgPGljb24gaWNvbj17YmluZChpY29uKX0gLz5cbiAgICAgIDxsZXZlbGJhciB2YWx1ZT17YmluZChkYXRhKX0gd2lkdGhSZXF1ZXN0PXsxNTB9IC8+XG4gICAgICA8bGFiZWwgbGFiZWw9e2JpbmQoZGF0YSkuYXModiA9PiBgJHtNYXRoLnJvdW5kKHYgKiAxMDApfSVgKX0gLz5cbiAgICA8L2JveD5cbiAgPC93aW5kb3c+XG59XG4iLCAiIyEvdXNyL2Jpbi9nanMgLW1cbmltcG9ydCB7IEFwcCB9IGZyb20gXCJhc3RhbC9ndGszXCI7XG5pbXBvcnQgc3R5bGUgZnJvbSBcIi4vc3R5bGUuc2Nzc1wiO1xuaW1wb3J0IEJhciBmcm9tIFwiLi93aWRnZXQvQmFyXCI7XG5pbXBvcnQgTm90aWZpY2F0aW9ucyBmcm9tIFwiLi93aWRnZXQvTm90aWZpY2F0aW9uc1wiO1xuaW1wb3J0IExhdW5jaGVyIGZyb20gXCIuL3dpZGdldC9MYXVuY2hlclwiO1xuaW1wb3J0IE9zZCBmcm9tIFwiLi93aWRnZXQvT3NkXCI7XG5cbkFwcC5zdGFydCh7XG4gIGNzczogc3R5bGUsXG4gIGluc3RhbmNlTmFtZTogXCJzaGVsbFwiLFxuICByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0LCByZXMpIHtcbiAgICBpZiAocmVxdWVzdCA9PSBcImxhdW5jaGVyXCIpIHtcbiAgICAgIEFwcC5nZXRfd2luZG93KFwibGF1bmNoZXJcIikuc2hvdygpXG4gICAgICByZXMoXCJva1wiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJpbnQoXCJ1bmtub3duIHJlcXVlc3Q6XCIsIHJlcXVlc3QpO1xuICAgICAgcmVzKFwidW5rbm93biByZXF1ZXN0XCIpO1xuICAgIH1cbiAgfSxcbiAgbWFpbjogKCkgPT4gQXBwLmdldF9tb25pdG9ycygpLmZvckVhY2goKG0pID0+IHtcbiAgICBpZiAobS5tb2RlbCA9PSBcIjB4MDhFMlwiKSB7XG4gICAgICBCYXIobSk7XG4gICAgICBOb3RpZmljYXRpb25zKG0pO1xuICAgICAgTGF1bmNoZXIobSk7XG4gICAgICBPc2QobSk7XG4gICAgfVxuICB9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBQUEsT0FBT0EsWUFBVztBQUNsQixPQUFPQyxVQUFTO0FBQ2hCLE9BQU8sU0FBUzs7O0FDRmhCLE9BQU9DLFlBQVc7QUFDbEIsT0FBTyxTQUFTO0FBRWhCLE9BQU8sYUFBYTs7O0FDSHBCLE9BQU8sV0FBVztBQVFYLElBQU0sRUFBRSxRQUFRLElBQUk7QUFVcEIsU0FBUyxXQUNaLFdBQ0EsUUFBa0MsT0FDbEMsUUFBa0MsVUFDcEM7QUFDRSxRQUFNLE9BQU8sTUFBTSxRQUFRLFNBQVMsS0FBSyxPQUFPLGNBQWM7QUFDOUQsUUFBTSxFQUFFLEtBQUssS0FBSyxJQUFJLElBQUk7QUFBQSxJQUN0QixLQUFLLE9BQU8sWUFBWSxVQUFVO0FBQUEsSUFDbEMsS0FBSyxPQUFPLFFBQVEsVUFBVSxPQUFPO0FBQUEsSUFDckMsS0FBSyxPQUFPLFFBQVEsVUFBVSxPQUFPO0FBQUEsRUFDekM7QUFFQSxRQUFNLE9BQU8sTUFBTSxRQUFRLEdBQUcsSUFDeEIsTUFBTSxRQUFRLFlBQVksR0FBRyxJQUM3QixNQUFNLFFBQVEsV0FBVyxHQUFHO0FBRWxDLE9BQUssUUFBUSxVQUFVLENBQUMsR0FBRyxXQUFtQixJQUFJLE1BQU0sQ0FBQztBQUN6RCxPQUFLLFFBQVEsVUFBVSxDQUFDLEdBQUcsV0FBbUIsSUFBSSxNQUFNLENBQUM7QUFDekQsU0FBTztBQUNYO0FBR08sU0FBUyxLQUFLLEtBQXdCO0FBQ3pDLFNBQU8sTUFBTSxRQUFRLEdBQUcsSUFDbEIsTUFBTSxRQUFRLE1BQU0sR0FBRyxJQUN2QixNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ2hDO0FBRU8sU0FBUyxVQUFVLEtBQXlDO0FBQy9ELFNBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3BDLFFBQUksTUFBTSxRQUFRLEdBQUcsR0FBRztB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O0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgInJlcyIsICJBc3RhbCIsICJiaW5kIiwgIkFzdGFsIiwgImludGVydmFsIiwgInRpbWVvdXQiLCAiQXN0YWwiLCAidiIsICJpbnRlcnZhbCIsICJleGVjIiwgIkFzdGFsIiwgIkd0ayIsICJBc3RhbCIsICJzbmFrZWlmeSIsICJwYXRjaCIsICJBcHBzIiwgIkh5cHJsYW5kIiwgIk5vdGlmZCIsICJHT2JqZWN0IiwgInJlcyIsICJHdGsiLCAiQXN0YWwiLCAiQXN0YWwiLCAiR3RrIiwgIkdPYmplY3QiLCAiQXN0YWwiLCAiR09iamVjdCIsICJHdGsiLCAiZGVmYXVsdCIsICJBc3RhbCIsICJBc3RhbCIsICJBc3RhbCIsICJHT2JqZWN0IiwgImRlZmF1bHQiLCAiR09iamVjdCIsICJBc3RhbCIsICJHdGsiLCAiR3RrIiwgImRlZmF1bHQiLCAiQXN0YWwiLCAid2lmaSIsICJHdGsiLCAiQXN0YWwiLCAiR3RrIiwgIkFzdGFsIiwgIkd0ayIsICJDRU5URVIiLCAidGV4dCIsICJsaXN0IiwgIldwIiwgIldwIiwgIkFzdGFsIiwgInJlcyJdCn0K
