import Hyprland from "gi://AstalHyprland";
import { bind } from "astal";
import { get_icon } from "../util.js";

export default function Workspaces({ orientation }) {
  const hypr = Hyprland.get_default();
  // {w.map((ws) => (
  //   <button
  //     halign={Gtk.Align.Center}
  //     className={bind(hypr, "focusedWorkspace").as((fw) =>
  //       ws === fw.id ? "focused" : "",
  //     )}
  //     onClicked={() => ws.focus()}
  //   >
  //     {ws}
  //   </button>
  // ))}
  // const classNames = Variable({})
  return (
    <box className="workspaces" orientation={orientation}>
      {bind(hypr, "workspaces").as(workspaces => {
        const filtered = workspaces
          .filter(ws => !(ws.id >= -99 && ws.id <= -2)) // filter out special workspaces
          .sort((a, b) => a.id - b.id)

        if (filtered.find(w => w.id === 1) === undefined)
          filtered.splice(0, 0, { "id": 1, "name": 1, "static": true })
        if (filtered.find(w => w.id === 2) === undefined)
          filtered.splice(1, 0, { "id": 2, "name": 2, "static": true })
        if (filtered.find(w => w.id === 3) === undefined)
          filtered.splice(2, 0, { "id": 3, "name": 3, "static": true })
        if (filtered.find(w => w.id === 4) === undefined)
          filtered.splice(3, 0, { "id": 4, "name": 4, "static": true })
        if (filtered.find(w => w.id === 5) === undefined)
          filtered.splice(4, 0, { "id": 5, "name": 5, "static": true })

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
          return <label label={bind(client, "title").as(title => title.length > 40 ? `${title.substring(0, 40)}...` : title)} />;
          // <box>
          //   <icon icon={bind(client, "initial-class").as(c => Astal.Icon.lookup_icon(c) ? c : c.toLowerCase())} />
          // </box>;
        else
          return "";
      })}
    </box>
  );
}
