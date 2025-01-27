import { Astal, Gtk, Gdk } from "astal/gtk3"
import Notifd from "gi://AstalNotifd"
import { Variable, bind, timeout } from "astal"

const { START, CENTER, END } = Gtk.Align


const getUrgency = (n) => {
    const { LOW, NORMAL, CRITICAL } = Notifd.Urgency
    switch (n.urgency) {
        case LOW: return "low"
        case CRITICAL: return "critical"
        case NORMAL:
        default: return "normal"
    }
}

function Notif(notif) {
  return <eventbox
    className={getUrgency(notif)}
    onClick={() => notif.dismiss()}
  >
    <box vertical>
      <box>
        {((notif.appIcon || notif.desktopEntry) && <icon
          className="image"
          visible={Boolean(notif.appIcon || notif.desktopEntry)}
          icon={notif.appIcon || notif.desktopEntry}
        />) || (notif.image && fileExists(notif.image) && <box
          valign={START}
          className="image"
          css={`background-image: url('${notif.image}')`}
        />) || ((notif.image && isIcon(notif.image) && <box
          expand={false}
          valign={START}
          className="image">
          <icon icon={notif.image} expand halign={CENTER} valign={CENTER} />
        </box>))}
        <box className="main" vertical>
          <box className="header">
            <label
              className="summary"
              halign={START}
              xalign={0}
              label={notif.summary}
              truncate
              hexpand
            />
            <button onClicked={() => notif.dismiss()}>
              <icon icon="window-close-symbolic" />
            </button>
          </box>
          <box className="content">
            <box vertical>
              {notif.body && <label
                className="body"
                wrap
                useMarkup
                halign={START}
                xalign={0}
                justifyFill
                label={notif.body}
              />}
            </box>
          </box>
        </box>
      </box>
      <box>
        {notif.get_actions().length > 0 && <box className="actions">
          {notif.get_actions().map(({ label, id }) => (
            <button
              hexpand
              onClicked={() => notif.invoke(id)}
            >
              <label label={label} halign={CENTER} hexpand />
            </button>
          ))}
        </box>}
      </box>
    </box>
  </eventbox>
}

// The purpose if this class is to replace Variable<Array<Widget>>
// with a Map<number, Widget> type in order to track notification widgets
// by their id, while making it conviniently bindable as an array
class NotificationMap {
    // the underlying map to keep track of id widget pairs
    map = new Map()

    // it makes sense to use a Variable under the hood and use its
    // reactivity implementation instead of keeping track of subscribers ourselves
    var = Variable([])

    // notify subscribers to rerender when state changes
    notifiy() {
        this.var.set([...this.map.values()].reverse())
    }

    constructor() {
        const notifd = Notifd.get_default()

        /**
         * uncomment this if you want to
         * ignore timeout by senders and enforce our own timeout
         * note that if the notification has any actions
         * they might not work, since the sender already treats them as resolved
         */
        // notifd.ignoreTimeout = true

        notifd.connect("notified", (n, id) => {
          // print(typeof notifd.get_notification(id))
            this.set(id, Notif(notifd.get_notification(id)))
        })

        // notifications can be closed by the outside before
        // any user input, which have to be handled too
        notifd.connect("resolved", (_, id) => {
            this.delete(id)
        })
    }

    set(key, value) {
        // in case of replacecment destroy previous widget
        this.map.get(key)?.destroy()
        this.map.set(key, value)
        this.notifiy()
    }

    delete(key) {
        this.map.get(key)?.destroy()
        this.map.delete(key)
        this.notifiy()
    }

    // needed by the Subscribable interface
    get() {
        return this.var.get()
    }

    // needed by the Subscribable interface
    subscribe(callback) {
        return this.var.subscribe(callback)
    }
}

export default function Notifications(monitor) {
  const { TOP } = Astal.WindowAnchor;

  // const notifd = Notifd.get_default();

  const notifs = new NotificationMap();

  // notifd.connect("notified", )

  return <window
    gdkmonitor={monitor}
    namespace="ags-notifd"
    layer={Astal.Layer.OVERLAY}
    anchor={TOP}
    exclusivity={Astal.Exclusivity.NORMAL}
    className="Notifications">
    <box vertical>
      {bind(notifs)}
    </box>
  </window>
}
