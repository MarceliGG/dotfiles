import { Astal } from "astal/gtk3"
import GLib from "gi://GLib"

export function get_icon(window_class) {
  switch (window_class) {
    case "zen":
      return "zen-browser";
    default:
      // return window_class;
      return Astal.Icon.lookup_icon(window_class) ? window_class : window_class.toLowerCase();
  }
}

export const desktop = GLib.getenv("XDG_CURRENT_DESKTOP")
