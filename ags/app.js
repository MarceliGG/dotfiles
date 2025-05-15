#!/usr/bin/gjs -m
import { App } from "astal/gtk3";
import style from "./style.scss";
import Bar from "./widget/Bar";
import Notifications from "./widget/Notifications";
import Launcher from "./widget/Launcher";
import Osd from "./widget/Osd";
import Background from "./widget/Background";

App.start({
  css: style,
  instanceName: "shell",
  requestHandler(request, res) {
    if (request == "launcher") {
      App.get_window("launcher").show()
      res("ok");
    } else {
      print("unknown request:", request);
      res("unknown request");
    }
  },
  main: () => App.get_monitors().forEach((m) => {
    Bar(m);
    Notifications(m);
    Launcher(m);
    Osd(m);
    // Background(m);
  }),
});
