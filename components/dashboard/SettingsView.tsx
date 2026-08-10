"use client";

import * as Switch from "@radix-ui/react-switch";
import { RotateCcw } from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button, Panel, SectionHeading } from "@/components/ui/primitives";
import {
  DASHBOARD_CARDS,
  usePreferences,
  type DashboardCardId,
} from "@/lib/stores/preferences";
import { cn } from "@/lib/utils/cn";
import type {
  DistanceUnit,
  PrecipitationUnit,
  PressureUnit,
  TemperatureUnit,
  WindUnit,
} from "@/lib/weather/units";

/**
 * Settings.
 *
 * Grouped by what someone is trying to change rather than by which store the
 * value lives in. Units come first because they are the setting people look
 * for; the dashboard layout is last because it is the one they will fiddle
 * with once and leave alone.
 */

export function SettingsView() {
  const store = usePreferences();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-tertiary">
          Stored on this device. No account, and nothing sent to a server.
        </p>
      </header>

      <Panel className="p-5">
        <SectionHeading
          title="Units"
          action={
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => store.useUnitSystem("metric")}>
                Metric
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => store.useUnitSystem("imperial")}
              >
                Imperial
              </Button>
            </div>
          }
          className="mb-5"
        />

        <div className="flex flex-col gap-5">
          <Choice<TemperatureUnit>
            label="Temperature"
            value={store.units.temperature}
            options={[
              { value: "celsius", label: "°C" },
              { value: "fahrenheit", label: "°F" },
            ]}
            onChange={(temperature) => store.setUnits({ temperature })}
          />
          <Choice<WindUnit>
            label="Wind speed"
            value={store.units.wind}
            options={[
              { value: "kmh", label: "km/h" },
              { value: "mph", label: "mph" },
              { value: "ms", label: "m/s" },
              { value: "knots", label: "knots" },
            ]}
            onChange={(wind) => store.setUnits({ wind })}
          />
          <Choice<PressureUnit>
            label="Pressure"
            value={store.units.pressure}
            options={[
              { value: "hpa", label: "hPa" },
              { value: "inhg", label: "inHg" },
            ]}
            onChange={(pressure) => store.setUnits({ pressure })}
          />
          <Choice<PrecipitationUnit>
            label="Precipitation"
            value={store.units.precipitation}
            options={[
              { value: "mm", label: "mm" },
              { value: "inch", label: "inches" },
            ]}
            onChange={(precipitation) => store.setUnits({ precipitation })}
          />
          <Choice<DistanceUnit>
            label="Distance"
            value={store.units.distance}
            options={[
              { value: "km", label: "km" },
              { value: "miles", label: "miles" },
            ]}
            onChange={(distance) => store.setUnits({ distance })}
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading title="Appearance" className="mb-5" />

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Theme</span>
              <span className="text-xs text-tertiary">
                Dark mode is a separate design, not an inversion.
              </span>
            </div>
            <ThemeToggle />
          </div>

          <Toggle
            label="12-hour clock"
            description="24-hour keeps every timestamp the same width, which matters in the forecast strip."
            checked={store.hour12}
            onChange={store.setHour12}
          />

          <Toggle
            label="Weather atmosphere"
            description="Subtle background motion matched to conditions. Off by default because it costs battery, and always off under reduced-motion."
            checked={store.atmosphere}
            onChange={store.setAtmosphere}
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Notify me when"
          detail="Thresholds used for advisories"
          className="mb-5"
        />

        <div className="flex flex-col gap-4">
          {store.thresholds.map((threshold) => (
            <div key={threshold.id} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm">{THRESHOLD_LABELS[threshold.metric]}</span>
                <span className="measured text-xs text-tertiary">
                  {THRESHOLD_PREFIX[threshold.metric]} {threshold.value}
                  {THRESHOLD_SUFFIX[threshold.metric]}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <label className="sr-only" htmlFor={`threshold-${threshold.id}`}>
                  {THRESHOLD_LABELS[threshold.metric]} value
                </label>
                <input
                  id={`threshold-${threshold.id}`}
                  type="number"
                  value={threshold.value}
                  onChange={(event) =>
                    store.setThreshold({
                      ...threshold,
                      value: Number(event.target.value),
                    })
                  }
                  className="measured h-10 w-20 rounded-md border border-hairline bg-sunken px-2 text-sm outline-none"
                />
                <Switch.Root
                  checked={threshold.enabled}
                  onCheckedChange={(enabled) => store.setThreshold({ ...threshold, enabled })}
                  aria-label={`Enable ${THRESHOLD_LABELS[threshold.metric]} alerts`}
                  className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-hairline bg-sunken transition-colors data-[state=checked]:bg-primary"
                >
                  <Switch.Thumb className="block size-4 translate-x-1 rounded-full bg-tertiary transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-inverse" />
                </Switch.Root>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Dashboard layout"
          action={
            <Button variant="ghost" size="sm" onClick={store.resetLayout}>
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </Button>
          }
          className="mb-5"
        />

        <ul className="flex flex-col gap-3">
          {DASHBOARD_CARDS.map((card) => (
            <li key={card.id} className="flex items-center justify-between gap-4">
              <span className="text-sm">{card.label}</span>
              <Switch.Root
                checked={!store.hiddenCards.includes(card.id as DashboardCardId)}
                onCheckedChange={() => store.toggleCard(card.id as DashboardCardId)}
                aria-label={`Show ${card.label}`}
                className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-hairline bg-sunken transition-colors data-[state=checked]:bg-primary"
              >
                <Switch.Thumb className="block size-4 translate-x-1 rounded-full bg-tertiary transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-inverse" />
              </Switch.Root>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const THRESHOLD_LABELS: Record<string, string> = {
  "precipitation-probability": "Rain probability",
  "temperature-above": "Temperature above",
  "temperature-below": "Temperature below",
  "wind-speed": "Wind speed",
  "wind-gust": "Wind gusts",
  aqi: "Air quality index",
  "uv-index": "UV index",
};

const THRESHOLD_PREFIX: Record<string, string> = {
  "precipitation-probability": "Above",
  "temperature-above": "Above",
  "temperature-below": "Below",
  "wind-speed": "Above",
  "wind-gust": "Above",
  aqi: "Above",
  "uv-index": "Above",
};

const THRESHOLD_SUFFIX: Record<string, string> = {
  "precipitation-probability": "%",
  "temperature-above": " °C",
  "temperature-below": " °C",
  "wind-speed": " km/h",
  "wind-gust": " km/h",
  aqi: "",
  "uv-index": "",
};

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-0.5 rounded-md border border-hairline p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "measured min-w-14 cursor-pointer rounded-sm px-2.5 py-2 text-xs transition-colors",
              value === option.value
                ? "bg-primary text-inverse"
                : "text-tertiary hover:bg-[--surface-hover] hover:text-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{label}</span>
        <span className="max-w-prose text-xs leading-relaxed text-tertiary">
          {description}
        </span>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="relative mt-1 h-6 w-11 shrink-0 cursor-pointer rounded-full border border-hairline bg-sunken transition-colors data-[state=checked]:bg-primary"
      >
        <Switch.Thumb className="block size-4 translate-x-1 rounded-full bg-tertiary transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-inverse" />
      </Switch.Root>
    </div>
  );
}
