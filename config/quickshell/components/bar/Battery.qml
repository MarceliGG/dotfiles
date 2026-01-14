import Quickshell.Services.UPower

import QtQuick

Text {
  id: text
  function batIcon(p) {
    if (p > 0.89) return " ";
    if (p > 0.74) return " ";
    if (p > 0.39) return " ";
    if (p > 0.19) return " ";
    return " ";
  }

  function formatBattery(pct, state) {
    if (state === UPowerDeviceState.Charging ) return batIcon(pct) + Math.round(pct*100) + "";
    return batIcon(pct) + Math.round(pct*100) + "%";
  }

  visible: UPower.displayDevice.isLaptopBattery
  color: UPower.displayDevice.state === UPowerDeviceState.Charging ? "lime" : "#ddd"
  font.pixelSize: 14
  font.family: fontF
  text: formatBattery(UPower.displayDevice.percentage, UPower.displayDevice.state)
}
