import Apps from "gi://AstalApps"
import { App, Astal, Gdk, Gtk } from "astal/gtk3"
import { Variable, execAsync } from "astal"

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

function CmdButton({ cmd }) {
  return <button
    onClicked={() => { hide(); execAsync(["bash", "-c", cmd]) }}>
    <box>
      <icon icon="utilities-terminal" />
      <box valign={Gtk.Align.CENTER} vertical>
        <label
          className="name"
          truncate
          xalign={0}
          label={`run: ${cmd}`}
        />
      </box>
    </box>
  </button>
}



export default function Applauncher() {
  const { CENTER } = Gtk.Align
  const apps = new Apps.Apps()

  const text = Variable("")
  const list = text(text => {
    if(text.substring(0, 1)=="/") {
      return [{"cmd": text.substring(1, text.length), "is_not_app": true}]
    }
    return apps.fuzzy_query(text).slice(0, MAX_ITEMS)})
  const onEnter = () => {
    const t = text.get();
    if(t.substring(0, 1)=="/") {
      execAsync(["bash", "-c", t.substring(1, t.length)])
    } else {
      apps.fuzzy_query(t)?.[0].launch()
    }
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
    onShow={() => text.set("")}
    onKeyPressEvent={function (self, event) {
      if (event.get_keyval()[1] === Gdk.KEY_Escape)
        self.hide()
    }}>
    <box>
      <eventbox widthRequest={4000} expand onClick={hide} />
      <box hexpand={false} vertical>
        <eventbox heightRequest={100} onClick={hide} />
        <box widthRequest={500} className="main" vertical>
          <entry
            placeholderText="Search"
            text={text()}
            onChanged={self => text.set(self.text)}
            onActivate={onEnter}
          />
          <box spacing={6} vertical>
            {list.as(list => list.map(item => {
              if (item.is_not_app)
                return <CmdButton cmd={item.cmd} />
              else
                return <AppButton app={item} />
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
      <eventbox widthRequest={4000} expand onClick={hide} />
    </box>
  </window>
}
