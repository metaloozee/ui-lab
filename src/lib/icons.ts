import { hugeiconsIcons } from "@/lib/icons-hugeicons";
import { untitleduiIcons } from "@/lib/icons-untitledui";

/**
 * The icon set the app renders: HugeIcons, with Untitled UI overriding individual roles. To change
 * an icon, add its role here.
 */
export const icons = {
  ...hugeiconsIcons,
  "grip-vertical": untitleduiIcons["grip-vertical"],
  "rotate-ccw": untitleduiIcons["rotate-ccw"],
  sun: untitleduiIcons.sun,
  moon: untitleduiIcons.moon,
  monitor: untitleduiIcons.monitor,
};
