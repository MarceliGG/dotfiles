import Wp from "gi://AstalWp";
import { Astal } from "astal/gtk3"
import { bind, Variable, exec, monitorFile, readFile, timeout } from "astal"

export default function Osd(monitor) {
  const SHOW_TIME = 1500;
  const audio = Wp.get_default().audio.defaultSpeaker;
  const data = Variable(0);
  const icon = Variable("");
  const show = Variable(true);
  const brightness_max = exec("brightnessctl max");
  let timer;
  monitorFile(`/sys/class/backlight/${exec("sh -c 'ls -w1 /sys/class/backlight|head -1'")}/brightness`, (file, event) => {
    if (event == 1) {
      data.set(parseInt(readFile(file)) / brightness_max);
      icon.set("display-brightness-symbolic")
      timer?.cancel()
      show.set(true);
      timer = timeout(SHOW_TIME, () => show.set(false));
    }
  })

  const sp_ico = bind(audio, "volumeIcon")
  sp_ico.subscribe(i => {
    icon.set(i);
    data.set(audio.volume);
    timer?.cancel()
    show.set(true);
    timer = timeout(SHOW_TIME, () => show.set(false));
  })
  return <window
    monitor={monitor}
    layer={Astal.Layer.OVERLAY}
    exclusivity={Astal.Exclusivity.IGNORE}
    anchor={Astal.WindowAnchor.BOTTOM}
    margin-bottom={200}
    className="Osd"
    namespace="ags-osd"
  >
    <box visible={bind(show)}>
      <icon icon={bind(icon)} />
      <levelbar max-value="1.08" value={bind(data).as(d=>d+0.08)} widthRequest={150} />
      <label label={bind(data).as(v => `${Math.round(v * 100)}%`)} />
    </box>
  </window>
}
