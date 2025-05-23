import Hyprland from "gi://AstalHyprland";
import { bind } from "astal";
import { get_icon } from "../util.js";

export default function Workspaces({ orientation }) {
  const hypr = Hyprland.get_default();

  const addStatic = (arr, id) => {
    const idx = id === 1 ? 0 : arr.findIndex(w => w.id === id - 1)
    if (idx < 0)
      return
    if (arr.find(w => w.id === id) === undefined)
      arr.splice(idx+1, 0, { "id": id, "name": id, "static": true })
  }

  return (
    <box className="workspaces" orientation={orientation}>
      {bind(hypr, "workspaces").as(workspaces => {
        const filtered = workspaces
          .filter(ws => !(ws.id >= -99 && ws.id <= -2)) // filter out special workspaces
          .sort((a, b) => a.id - b.id)


        addStatic(filtered, 1)
        addStatic(filtered, 2)
        addStatic(filtered, 3)
        addStatic(filtered, 4)
        addStatic(filtered, 5)

        return filtered.map((w) => (
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
      {bind(hypr, "focusedClient").as(client => {
        if (client)
          return <icon icon={bind(client, "initial-class").as(c => get_icon(c))} />
        else
          return "";
      })}
      {bind(hypr, "focusedClient").as(client => {
        if (client)
          return <label ellipsize={3} label={bind(client, "title").as(t => t || client.initialTitle || client.class)} css="margin-right: 40px" />;
        else
          return "";
      })}
    </box>
  );
}
