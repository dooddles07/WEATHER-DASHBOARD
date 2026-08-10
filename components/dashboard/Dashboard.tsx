"use client";

import { useMemo } from "react";

import { Panel, SectionHeading, Unavailable } from "@/components/ui/primitives";
import { AlertBanner } from "@/components/alerts/AlertBanner";
import { AtmosphericRibbon } from "@/components/weather/AtmosphericRibbon";
import { BandGauge } from "@/components/weather/BandGauge";
import { CurrentConditions } from "@/components/weather/CurrentConditions";
import { DailyStrip } from "@/components/weather/DailyStrip";
import { InsightList } from "@/components/weather/InsightList";
import { PrecipitationTimeline } from "@/components/weather/PrecipitationTimeline";
import { ScoreRow } from "@/components/weather/ScoreRow";
import { SunArc } from "@/components/weather/SunArc";
import { WindCompass } from "@/components/weather/WindCompass";
import { usePublishAmbient } from "@/lib/stores/ambient";
import { usePreferences } from "@/lib/stores/preferences";
import { useScrub } from "@/lib/stores/scrub";
import { localDateKey } from "@/lib/time";
import {
  airQualityGuidance,
  dominantPollutant,
  headlineIndex,
} from "@/lib/weather/aqi";
import type { Insight } from "@/lib/weather/insights";
import { interpolateHour } from "@/lib/weather/interpolate";
import { AQI_BANDS, UV_BANDS } from "@/lib/weather/scales";
import { allActivityScores } from "@/lib/weather/scores";
import { formatDistance, formatPercent, formatPressure } from "@/lib/weather/units";
import type { WeatherAlert } from "@/types/alerts";
import type { WeatherBundle } from "@/types/weather";

/**
 * The command centre.
 *
 * Everything below the ribbon reads from one clock. When the timeline is
 * scrubbed, `active` moves and every card re-derives from the interpolated
 * forecast for that moment — the wind swings, the UV band changes, the sun
 * moves along its arc. Nothing here calls `Date.now()`.
 *
 * Panels are used only where a panel means something: a discrete reading with
 * its own scale. Continuous data — the ribbon, the fortnight — runs full width
 * with hairline separators instead, so the page does not become a field of
 * identical boxes.
 */

export function Dashboard({
  bundle,
  insights,
  alerts,
  serverNow,
}: {
  bundle: WeatherBundle;
  insights: Insight[];
  alerts: WeatherAlert[];
  serverNow: number;
}) {
  const units = usePreferences((store) => store.units);
  const hour12 = usePreferences((store) => store.hour12);
  const scrubbedAt = useScrub((state) => state.scrubbedAt);

  const active = scrubbedAt ?? serverNow;
  const scrubbed = scrubbedAt !== null;

  const hour = useMemo(
    () => interpolateHour(bundle.hourly, active),
    [bundle.hourly, active],
  );

  const today = useMemo(() => {
    const key = localDateKey(active, bundle.location.timezone);
    return bundle.daily.find((day) => day.date === key);
  }, [bundle.daily, bundle.location.timezone, active]);

  const astronomy = useMemo(() => {
    const key = localDateKey(active, bundle.location.timezone);
    return bundle.astronomy.find((entry) => entry.date === key) ?? bundle.astronomy[0];
  }, [bundle.astronomy, bundle.location.timezone, active]);

  const scores = useMemo(
    () => (hour ? allActivityScores({ hour, airQuality: bundle.airQuality }) : []),
    [hour, bundle.airQuality],
  );

  usePublishAmbient({
    temperature: bundle.current?.temperature,
    condition: bundle.current?.condition,
    isDay: bundle.current?.isDay,
  });

  if (!hour) {
    return (
      <Panel className="mt-4">
        <Unavailable
          title="Weather data temporarily unavailable"
          message="We could not reach the weather service for this location. Your other saved places may still work, and this will retry automatically."
        />
      </Panel>
    );
  }

  const aqi = bundle.airQuality ? headlineIndex(bundle.airQuality) : undefined;
  const uv = hour.uvIndex;

  return (
    <div className="flex flex-col gap-4">
      {/* Full-bleed: the ribbon is the page's spine, not a card on it. */}
      <div className="-mx-4 lg:-mx-6">
        <AtmosphericRibbon
          hours={bundle.hourly}
          location={bundle.location}
          unit={units.temperature}
          hour12={hour12}
          serverNow={serverNow}
        />
      </div>

      {alerts.length > 0 ? (
        <AlertBanner alerts={alerts} timezone={bundle.location.timezone} hour12={hour12} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-5">
          <Panel className="p-5">
            <CurrentConditions
              hour={hour}
              today={today}
              location={bundle.location}
              units={units}
              hour12={hour12}
              fetchedAt={bundle.fetchedAt}
              now={serverNow}
              scrubbed={scrubbed}
            />
          </Panel>

          <Panel className="p-5">
            <SectionHeading
              title="Weather intelligence"
              detail="Generated from this forecast"
              className="mb-4"
            />
            <InsightList insights={insights} />
          </Panel>

          <section aria-labelledby="scores-heading">
            <SectionHeading
              id="scores-heading"
              title="Conditions for"
              detail={scrubbed ? "at the selected time" : "right now"}
              className="mb-3"
            />
            <ScoreRow scores={scores} />
          </section>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-7">
          <Panel className="p-5">
            <SectionHeading
              title="Next 14 days"
              detail="Tap a day for detail"
              className="mb-3"
            />
            <DailyStrip
              days={bundle.daily}
              location={bundle.location}
              units={units}
              today={active}
            />
          </Panel>

          <Panel className="p-5">
            <SectionHeading title="Precipitation" className="mb-4" />
            <PrecipitationTimeline
              nowcast={bundle.nowcast}
              hours={bundle.hourly}
              timezone={bundle.location.timezone}
              hour12={hour12}
              now={serverNow}
            />
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Panel className="p-5">
              <SectionHeading title="Wind" className="mb-4" />
              <WindCompass
                speed={hour.windSpeed}
                direction={hour.windDirection}
                gust={hour.windGust}
                unit={units.wind}
              />
            </Panel>

            <Panel className="p-5">
              <SectionHeading title="Sun and moon" className="mb-4" />
              {astronomy ? (
                <SunArc
                  astronomy={astronomy}
                  location={bundle.location}
                  instant={active}
                  hour12={hour12}
                />
              ) : (
                <p className="text-sm text-tertiary">
                  Astronomical data is unavailable for this location.
                </p>
              )}
            </Panel>

            <Panel className="p-5">
              <SectionHeading title="Air quality" className="mb-4" />
              {aqi !== undefined && bundle.airQuality ? (
                <div className="flex flex-col gap-4">
                  <BandGauge
                    value={aqi}
                    bands={AQI_BANDS}
                    max={300}
                    label="US AQI"
                    spokenUnit="on the air quality index"
                    caption={airQualityGuidance(aqi).detail}
                  />
                  {(() => {
                    const dominant = dominantPollutant(bundle.airQuality!);
                    return dominant ? (
                      <p className="border-t border-hairline pt-3 text-xs text-tertiary">
                        Driven by{" "}
                        <span className="text-secondary">{dominant.label}</span> at{" "}
                        <span className="measured">
                          {dominant.concentration.toFixed(1)} µg/m³
                        </span>
                        .
                      </p>
                    ) : null;
                  })()}
                </div>
              ) : (
                <Unavailable
                  title="No air quality data"
                  message="No monitoring data is published for this location right now. The rest of the forecast is unaffected."
                  className="p-0"
                />
              )}
            </Panel>

            <Panel className="p-5">
              <SectionHeading title="UV index" className="mb-4" />
              {uv !== undefined ? (
                <BandGauge
                  value={uv}
                  bands={UV_BANDS}
                  max={13}
                  label="UV"
                  spokenUnit="on the UV index"
                  caption={
                    uv >= 6
                      ? "Sunscreen, a hat and shade around the middle of the day are worth planning for."
                      : uv >= 3
                        ? "Moderate exposure. Sun protection is sensible for long periods outdoors."
                        : "Low exposure. No protection needed for short periods outdoors."
                  }
                />
              ) : (
                <p className="text-sm text-tertiary">
                  UV data is unavailable for this location.
                </p>
              )}
            </Panel>

            <Panel className="p-5 sm:col-span-2">
              <SectionHeading title="Atmosphere" className="mb-4" />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Reading
                  label="Pressure"
                  value={
                    hour.pressure !== undefined
                      ? formatPressure(hour.pressure, units.pressure).display
                      : "—"
                  }
                  detail={pressureTrend(bundle, active)}
                />
                <Reading
                  label="Humidity"
                  value={
                    hour.humidity !== undefined
                      ? formatPercent(hour.humidity).display
                      : "—"
                  }
                />
                <Reading
                  label="Visibility"
                  value={
                    hour.visibility !== undefined
                      ? formatDistance(hour.visibility, units.distance).display
                      : "—"
                  }
                  detail={
                    hour.visibility !== undefined && hour.visibility < 5000
                      ? "Reduced"
                      : undefined
                  }
                />
                <Reading
                  label="Cloud cover"
                  value={
                    hour.cloudCover !== undefined
                      ? formatPercent(hour.cloudCover).display
                      : "—"
                  }
                  detail={
                    hour.freezingLevel !== undefined
                      ? `Freezing level ${Math.round(hour.freezingLevel)} m`
                      : undefined
                  }
                />
              </dl>
            </Panel>
          </div>
        </div>
      </div>

      {bundle.degraded.length > 0 ? (
        <Panel surface="sunken" className="p-4">
          <p className="label-micro mb-2">Partial data</p>
          <ul className="flex flex-col gap-1">
            {bundle.degraded.map((entry) => (
              <li key={entry.subsystem} className="text-xs text-tertiary">
                {entry.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function Reading({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="label-micro">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="readout text-lg">{value}</span>
        {detail ? <span className="text-xs text-tertiary">{detail}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Falling pressure is the classic sign of approaching bad weather, which makes
 * the direction more useful than the reading. Three hours is the interval
 * synoptic charts have always used for this.
 */
function pressureTrend(bundle: WeatherBundle, active: number): string | undefined {
  const now = interpolateHour(bundle.hourly, active);
  const before = interpolateHour(bundle.hourly, active - 3 * 3600_000);

  if (!now?.pressure || !before?.pressure) return undefined;

  const change = now.pressure - before.pressure;
  if (Math.abs(change) < 1) return "Steady over 3 hours";
  return `${change > 0 ? "Rising" : "Falling"} ${Math.abs(change).toFixed(1)} hPa in 3 hours`;
}
