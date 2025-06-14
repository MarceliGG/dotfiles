import Tray from "gi://AstalTray";
import { Variable, bind } from "astal";
import { Gtk, Gdk } from "astal/gtk3"

const createMenu = (menuModel, actionGroup) => {
  const menu = Gtk.Menu.new_from_model(menuModel);
  menu.insert_action_group('dbusmenu', actionGroup);

  return menu;
};

export default function SysTray({orientation}) {
  const tray = Tray.get_default()
  
  return <box className="tray" orientation={orientation} visible={bind(tray, "items").as(items=>items.length>0)}>
    {bind(tray, "items").as(items => items.map(item => {
      console.log(item)

      // Make sure you're bound to the menuModel and actionGroup which can change

      let menu;

      const entryBinding = Variable.derive(
        [bind(item, 'menuModel'), bind(item, 'actionGroup')],
        (menuModel, actionGroup) => {
          if (!menuModel) {
            return console.error(`Menu Model not found for ${item.id}`);
          }
          if (!actionGroup) {
            return console.error(`Action Group not found for ${item.id}`);
          }

          menu = createMenu(menuModel, actionGroup);
        },
      );


      return <button
        onClick={(btn, _)=>{
          menu?.popup_at_widget(btn, Gdk.Gravity.NORTH, Gdk.Gravity.SOUTH, null);
        }}
        onDestroy={() => {
          menu?.destroy();
          entryBinding.drop();
        }}>
        <icon g-icon={bind(item, "gicon")}/>
      </button>
    }))}
  </box>
}
