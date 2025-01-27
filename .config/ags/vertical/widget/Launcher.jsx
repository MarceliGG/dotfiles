import Apps from "gi://AstalApps"
import { App, Astal, Gdk, Gtk } from "astal/gtk3"
import { bind, Variable, execAsync, exec } from "astal"

const MAX_ITEMS = 8

function hide() {
  App.get_window("launcher").hide()
}

function AppButton({ app }) {
  return <button
    className="AppButton"
    onClicked={() => { hide(); app.launch() }}>
    <box>
      <icon icon={app.iconName} />
      <box valign={Gtk.Align.CENTER} vertical>
        <label
          className="name"
          truncate
          xalign={0}
          label={app.name}
        />
        {app.description && <label
          className="description"
          wrap
          xalign={0}
          label={app.description}
        />}
      </box>
    </box>
  </button>
}

function str_fuzzy (str, s) {
    var hay = str.toLowerCase(), i = 0, n = -1, l;
    s = s.toLowerCase();
    for (; l = s[i++] ;) if (!~(n = hay.indexOf(l, n + 1))) return false;
    return true;
};

const res = Variable("...")
const windows = Variable([])

const plugins = [
  {
    "init": ()=>{},
    "query": (text) => [{
      "label": text,
      "sub": "run",
      "icon": "utilities-terminal",
      "activate": () => execAsync(["sh", "-c", text])
    }],
    "prefix": "/",
  },
  {
    "init": ()=>{},
    "query": (text) => {
      res.set("...");
      if (text.length > 0)
        execAsync(["qalc", "-t", text]).then(out=>res.set(out)).catch(console.log);
      return [{
        "label": bind(res),
        "sub": "calculate using qalc",
        "icon": "accessories-calculator",
        "activate": () => execAsync(["sh", "-c", `echo ${res.get()} | wl-copy`])
      }]
    },
    "prefix": "=",
  },
  {
    "init": ()=>windows.set(JSON.parse(exec(["hyprctl", "-j", "clients"]))),
    "query": (text) => windows.get().map(window => {return {
      "label": window["title"],
      "sub": `${window["class"]} ${window["pid"]}`,
      "icon": window["class"],
      "activate": () => execAsync(["hyprctl", "dispatch", "focuswindow", `pid:${window["pid"]}`]),
    }}).filter(w=>str_fuzzy(w["label"], text) || str_fuzzy(w["sub"], text)),
    "prefix": ";",
  },
]

function PluginButton({ item }) {
  return <button
    onClicked={() => { hide(); item.activate() }}>
    <box>
      <icon icon={item.icon} />
      <box valign={Gtk.Align.CENTER} vertical>
        <label
          className="name"
          truncate
          xalign={0}
          label={item.label}
        />
        {item.sub && <label
          className="description"
          truncate
          xalign={0}
          label={item.sub}
        />}
      </box>
    </box>
  </button>
}



export default function Applauncher() {
  const { CENTER } = Gtk.Align
  const apps = new Apps.Apps()

  const text = Variable("")
  const list = text(text => {
    for (let idx in plugins) {
      if(text.substring(0, 1) == plugins[idx].prefix) {
        if (text.length == 1)
          plugins[idx].init()
        return plugins[idx].query(text.substring(1, text.length))
      }
    }
    return apps.fuzzy_query(text).slice(0, MAX_ITEMS)
  })
  const onEnter = (inputbox) => {
    inputbox.parent.children[1].children[0].clicked()
    // const t = text.get();
    // for (let idx in plugins) {
    //   if(t.substring(0, 1) == plugins[idx].prefix) {
    //     plugins[idx].query(t.substring(1, t.length))[0].activate()
    //     hide()
    //     return
    //   }
    // }
    // apps.fuzzy_query(t)?.[0].launch()
    hide()
  }

  return <window
    name="launcher"
    namespace="ags-launcher"
    layer={Astal.Layer.OVERLAY}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM}
    exclusivity={Astal.Exclusivity.IGNORE}
    keymode={Astal.Keymode.ON_DEMAND}
    application={App}
    visible={false}
    onShow={(self) => {text.set(""); self.get_child().children[1].children[1].children[0].grab_focus_without_selecting()}}
    onKeyPressEvent={function (self, event) {
      if (event.get_keyval()[1] === Gdk.KEY_Escape)
        self.hide()
    }}>
    <box>
      <eventbox widthRequest={2000} expand onClick={hide} />
      <box hexpand={false} vertical>
        <eventbox heightRequest={200} onClick={hide} />
        <box widthRequest={500} className="main" vertical>
          <entry
            placeholderText="Search"
            text={text()}
            onChanged={self => text.set(self.text)}
            onActivate={onEnter}
          />
          <box spacing={6} vertical>
            {list.as(list => list.map(item => {
              if (item.app)
                return <AppButton app={item} />
              else
                return <PluginButton item={item} />
            }))}
          </box>
          <box
            halign={CENTER}
            className="not-found"
            vertical
            visible={list.as(l => l.length === 0)}>
            <icon icon="system-search-symbolic" />
            <label label="No match found" />
          </box>
        </box>
        <eventbox expand onClick={hide} />
      </box>
      <eventbox widthRequest={2000} expand onClick={hide} />
    </box>
  </window>
}
