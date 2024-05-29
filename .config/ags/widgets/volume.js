import { root } from "../options.js"
const audio = await Service.import("audio")

const VolLabel = Widget.Label({label: audio["speaker"].bind("volume").as((p) => `${Math.round(p*100)}%`)})
const VolIcon = Widget.Icon({icon: audio["speaker"].bind("is-muted").as((p) => `${root}/assets/vol/${p}.svg`)})

export default Widget.Box({
    name: "volume",
    children: [VolLabel, VolIcon]
})
