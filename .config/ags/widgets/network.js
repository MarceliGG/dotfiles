import { root } from "../options.js"
const network = await Service.import("network")

const WifiLabel = Widget.Label({label: network["wifi"].bind("ssid").as(ssid => ssid || 'Unknown')})
const WifiIcon = Widget.Icon({icon: network["wifi"].bind("icon-name")})
const EthIcon = Widget.Icon({icon: network["wired"].bind("icon-name")})

const Wifi = Widget.Box({
    children: [WifiLabel, WifiIcon]
})

const Wired = Widget.Box({
    children: [Widget.Label("[Wired]"), EthIcon]
})

export default Widget.Stack({
    name: "network",
    children: {
        wifi: Wifi,
        wired: Wired,
    },
    shown: network.bind('primary').as(p => p || 'wifi'),
})
