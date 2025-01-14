import { App } from "astal/gtk3";
import style from "./style.scss";
import Bar from "./widget/Bar";
import Notifications from "./widget/Notifications";

App.start({
  css: style,
  instanceName: "js",
  requestHandler(request, res) {
    print(request);
    res("ok");
  },
  main: () =>
    App.get_monitors().forEach((m) => {
      if (m.model == "0x08E2") {
        Bar(m);
        Notifications(m);
      }
    }),
});
