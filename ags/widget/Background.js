import { Astal } from "astal/gtk3"

export default function Applauncher() {
  return <window
    namespace="ags-background"
    name="background"
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT | Astal.WindowAnchor.BOTTOM}
    exclusivity={Astal.Exclusivity.IGNORE}
    layer={Astal.Layer.BACKGROUND}
  />
}
