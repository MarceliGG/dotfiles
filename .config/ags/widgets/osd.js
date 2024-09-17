import { root } from "../options.js";
import brightness from "../services/brightness.js";

const DELAY = 2500;
const audio = await Service.import("audio");
export default () => {
    const PopupLabel = Widget.Label("");

    const PopupIcon = Widget.Icon("");

    const PopupBox = Widget.Box({
        class_name: "popup",
        children: [PopupIcon, PopupLabel],
    });

    const Popup = Widget.Revealer({
        child: PopupBox,
    });

    let count = 0;
    function show(value, icon) {
        Popup.reveal_child = true;
        PopupLabel.set_label(`${Math.round(value * 100)}%`);
        PopupIcon.icon = icon;
        count++;
        Utils.timeout(DELAY, () => {
            count--;
            if (count === 0) Popup.reveal_child = false;
        });
    }

    return Popup.hook(
        audio.speaker,
        () => show(audio.speaker.volume, `${root}/assets/vol/${audio.speaker.is_muted}.svg`),
        "notify::volume|notify:is_muted",
    ).hook(
        brightness, 
        () =>show(brightness.screen_value, `${root}/assets/brightness.png`),
    )
};
