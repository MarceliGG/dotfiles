import Hyprland from "gi://AstalHyprland";
import { bind } from "astal";

export default function Workspaces({ orientation }) {
  const hypr = Hyprland.get_default();
  let w = [1, 2, 3, 4, 5];

  // bind(hypr, "workspaces").as(wss => wss
  //         .filter(ws => !(ws.id >= -99 && ws.id <= -2)) // filter out special workspaces
  //         .sort((a, b) => a.id - b.id)
  //     )
  return (
    <box className="workspaces" orientation={orientation}>
      {w.map((ws) => (
        <button
          className={bind(hypr, "focusedWorkspace").as((fw) =>
            ws === fw.id ? "focused" : "",
          )}
          onClicked={() => ws.focus()}
        >
          {ws}
        </button>
      ))}
    </box>
  );
}
