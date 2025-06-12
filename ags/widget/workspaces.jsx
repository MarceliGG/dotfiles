import Hyprland from "gi://AstalHyprland";
import { bind, subprocess, Variable, execAsync, exec } from "astal";
import { get_icon, desktop} from "../util.js";

export default function Workspaces({ orientation }) {
  switch (desktop) {
    case "Hyprland":
      const hypr = Hyprland.get_default();

      const addStatic = (arr, id) => {
        if (arr.find(e => e.id == id) === undefined)
          arr.push({ "id": id, "name": id, "static": true })
      }

      return (
        <box className="workspaces" orientation={orientation}>
          {bind(hypr, "workspaces").as(workspaces => {
            const filtered = workspaces
              .filter(ws => !(ws.id >= -99 && ws.id <= -2)) // filter out special workspaces


            addStatic(filtered, 1)
            addStatic(filtered, 2)
            addStatic(filtered, 3)
            addStatic(filtered, 4)
            addStatic(filtered, 5)

            return filtered
              .sort((a, b) => a.id - b.id)
              .map((w) => (
                <button
                  className={bind(hypr, "focusedWorkspace").as((fw) =>
                    w.id === fw.id ? "focused" : w.static ? "" : "exist"
                  )}
                  onClicked={() => hypr.message(`dispatch workspace ${w.id}`)}
                >
                  {w.name}
                </button>
              ))
          })}
          {
            // {bind(hypr, "focusedClient").as(client => {
            //   if (client)
            //     return <icon icon={bind(client, "initial-class").as(c => get_icon(c))} />
            //   else
            //     return "";
            // })}
            // {bind(hypr, "focusedClient").as(client => {
            //   if (client)
            //     return <label ellipsize={3} label={bind(client, "title").as(t => t || client.initialTitle || client.class)} css="margin-right: 40px" />;
            //   else
            //     return "";
            // })}
          }
          {bind(hypr, "focusedClient").as(client => {
            if (client)
              return (<box>
                <icon icon={bind(client, "initial-class").as(c => get_icon(c))} />
                <label ellipsize={3} label={bind(client, "title").as(t => t || client.initialTitle || client.class)} css="margin-right: 40px" />
              </box>);
            else
              return "";
          })}
        </box>
      )
    case "niri":
      const workspaces = Variable([]);
      const active = Variable(1);
      const window = Variable(0);
      subprocess("niri msg --json event-stream", msg => {
        const jMsg = JSON.parse(msg);
        // console.log(jMsg)
        switch (Object.keys(jMsg)[0]) {
          case "WindowFocusChanged":
            window.set(jMsg["WindowFocusChanged"]["id"])
            break
          case "WorkspaceActivated":
            active.set(jMsg["WorkspaceActivated"]["id"])
            break
          case "WorkspacesChanged":
            workspaces.set(jMsg["WorkspacesChanged"]["workspaces"])
            break
        }
      }, console.error)
      return (
        <box className="workspaces" orientation={orientation}>
          {bind(workspaces).as(ws => {
            // const filtered = workspaces
            //   .filter(ws => !(ws.id >= -99 && ws.id <= -2)) // filter out special workspaces


            // addStatic(filtered, 1)
            // addStatic(filtered, 2)
            // addStatic(filtered, 3)
            // addStatic(filtered, 4)
            // addStatic(filtered, 5)

            return ws.map((w) => (
              <button
                className={bind(active).as(aw => w.id === aw ? "focused" : "")}
                onClicked={() => execAsync(["niri", "msg", "action", "focus-workspace", `${w.id}`]).catch(console.error)}
              >
                {w.idx}
              </button>
            ))
          })}
          {bind(window).as(w => {
            const jWindow = JSON.parse(exec(["niri", "msg", "--json", "windows"])).find(e => e.id == w)
            if (jWindow === undefined) return <box />
            return (<box>
              <icon icon={get_icon(`${jWindow.app_id}`)} />
              <label ellipsize={3} label={`${jWindow.title}`} css="margin-right: 40px" />
            </box>)
          })}
        </box>
      )
    default:
      return <label label="unsupported wm" />
  }
}
