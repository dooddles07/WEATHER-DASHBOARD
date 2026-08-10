import type { Metadata } from "next";

import { SettingsView } from "@/components/dashboard/SettingsView";

export const metadata: Metadata = {
  title: "Settings",
  description: "Units, theme, dashboard layout and alert thresholds.",
};

/**
 * Preferences.
 *
 * Everything here is stored on this device, which is stated plainly on the
 * page — people should know where their settings live, particularly when
 * there is no account to sync them.
 */
export default function SettingsPage() {
  return <SettingsView />;
}
