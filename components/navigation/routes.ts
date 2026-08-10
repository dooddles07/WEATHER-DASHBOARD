import {
  CloudSun,
  Columns3,
  Gauge,
  History,
  Map,
  Radar,
  Settings,
  Star,
  TriangleAlert,
} from "lucide-react";
import type { Route } from "next";

/**
 * The navigation model.
 *
 * Nine destinations is a lot for one bar, so desktop shows all of them in a
 * rail with room to breathe while mobile promotes the four that answer
 * immediate questions and files the rest under More. The split is by urgency,
 * not by importance: History matters, but nobody opens it on a phone in the
 * rain.
 */

export interface NavItem {
  href: Route;
  label: string;
  Icon: typeof Gauge;
  /** Shown in the mobile bottom bar rather than under More. */
  primary?: boolean;
  description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    Icon: Gauge,
    primary: true,
    description: "Current conditions and the day ahead",
  },
  {
    href: "/forecast",
    label: "Forecast",
    Icon: CloudSun,
    primary: true,
    description: "Hourly detail and the next 14 days",
  },
  {
    href: "/map",
    label: "Map",
    Icon: Map,
    primary: true,
    description: "Temperature, wind, pressure and cloud layers",
  },
  {
    href: "/radar",
    label: "Radar",
    Icon: Radar,
    description: "Animated precipitation radar and satellite",
  },
  {
    href: "/alerts",
    label: "Alerts",
    Icon: TriangleAlert,
    primary: true,
    description: "Severe weather warnings and advisories",
  },
  {
    href: "/locations",
    label: "Locations",
    Icon: Star,
    description: "Your saved places",
  },
  {
    href: "/compare",
    label: "Compare",
    Icon: Columns3,
    description: "Several cities side by side",
  },
  {
    href: "/history",
    label: "History",
    Icon: History,
    description: "Past weather and how today compares",
  },
  {
    href: "/settings",
    label: "Settings",
    Icon: Settings,
    description: "Units, theme, layout and alert thresholds",
  },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => item.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((item) => !item.primary);
