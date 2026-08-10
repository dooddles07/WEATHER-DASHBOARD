"use client";

import type { Map as MapLibreMap, RasterTileSource } from "maplibre-gl";
import { Crosshair, Layers, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Panel } from "@/components/ui/primitives";
import { BASE_STYLE, layerById, MAP_LAYERS, type MapLayerId } from "@/lib/maps/layers";
import { usePreferences } from "@/lib/stores/preferences";
import { formatHour } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import type { GeoLocation } from "@/types/location";
import type { RadarIndex } from "@/lib/maps/radar";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The weather map.
 *
 * Loaded only on the routes that use it — MapLibre and its worker are by far
 * the heaviest thing in the product, and the dashboard should never pay for
 * them.
 *
 * The overlay is a single raster source whose tile URL is swapped as the
 * timeline moves, rather than one source per frame. Twenty stacked sources is
 * the usual approach and it costs twenty tile pyramids in memory; swapping
 * costs one, at the price of a brief blank while the new frame loads.
 */

const OVERLAY_SOURCE = "isobar-overlay";
const OVERLAY_LAYER = "isobar-overlay-layer";

export interface WeatherMapProps {
  location: GeoLocation;
  radar?: RadarIndex;
  /** False when OPENWEATHER_API_KEY is absent; the model layers then say so. */
  owmConfigured: boolean;
  initialLayer?: MapLayerId;
  /** Radar mode leads with the timeline and starts playing. */
  emphasiseTimeline?: boolean;
}

export function WeatherMap({
  location,
  radar,
  owmConfigured,
  initialLayer = "radar",
  emphasiseTimeline = false,
}: WeatherMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const theme = usePreferences((store) => store.theme);
  const hour12 = usePreferences((store) => store.hour12);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [layer, setLayer] = useState<MapLayerId>(initialLayer);
  const [opacity, setOpacity] = useState(0.75);
  const [frame, setFrame] = useState(radar?.nowIndex ?? 0);
  const [playing, setPlaying] = useState(emphasiseTimeline);
  const [panelOpen, setPanelOpen] = useState(false);

  const definition = layerById(layer);
  const frames = radar?.frames ?? [];
  const animated = layer === "radar" || layer === "satellite";

  const activeFrames = layer === "satellite" ? (radar?.satellite ?? []) : frames;

  /** The tile template for whatever is currently selected. */
  const tileUrl = useMemo(() => {
    if (layer === "none") return undefined;
    if (animated) return activeFrames[Math.min(frame, activeFrames.length - 1)]?.tileUrl;
    return definition.tileUrl;
  }, [layer, animated, activeFrames, frame, definition.tileUrl]);

  /* -------------------------------------------------------------- Map setup */

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;

    // Imported here rather than at module scope so the bundle only loads when
    // the component actually mounts.
    void import("maplibre-gl")
      .then(
        ({
          Map,
          NavigationControl,
          ScaleControl,
          AttributionControl,
          setWorkerUrl,
        }) => {
          if (cancelled) return;

          // Served from `public/` by `scripts/copy-maplibre-worker.mjs`. See
          // that file for why the bundler cannot be relied on here.
          setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

          const dark =
            theme === "dark" ||
            (theme === "system" &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);

          const map = new Map({
            container,
            style: dark ? BASE_STYLE.dark : BASE_STYLE.light,
            center: [location.longitude, location.latitude],
            zoom: 6,
            attributionControl: false,
            // Keyboard users need to pan and zoom without a mouse.
            keyboard: true,
          });

          map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
          map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
          map.addControl(new AttributionControl({ compact: true }), "bottom-right");

          const markReady = () => {
            if (!cancelled) setReady(true);
          };

          // `load` is the documented signal, but it fires once and is missed if
          // the style resolved before the listener attached. `idle` fires
          // whenever the map settles, so together they cover both orderings.
          map.on("load", markReady);
          map.on("idle", markReady);
          if (map.loaded()) markReady();

          // Tile fetches fail routinely at the edges of a pan and are not worth
          // surfacing. Only a failure to fetch the style itself means there is
          // no map to show.
          map.on("error", (event) => {
            const url = (event.error as { url?: string } | undefined)?.url;
            if (url?.includes("/styles/")) setFailed(true);
          });

          mapRef.current = map;
        },
      )
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Intentionally mounts once: theme and location changes are handled below
    // so that switching city does not tear down and rebuild the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- Follow location */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({
      center: [location.longitude, location.latitude],
      duration: 600,
    });
  }, [ready, location.longitude, location.latitude]);

  /* ------------------------------------------------------------ Overlay tiles */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const existing = map.getSource(OVERLAY_SOURCE) as RasterTileSource | undefined;

    if (!tileUrl) {
      if (map.getLayer(OVERLAY_LAYER)) map.removeLayer(OVERLAY_LAYER);
      if (existing) map.removeSource(OVERLAY_SOURCE);
      return;
    }

    if (existing) {
      existing.setTiles([tileUrl]);
      return;
    }

    map.addSource(OVERLAY_SOURCE, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      attribution:
        definition.source === "RainViewer"
          ? "Radar © RainViewer"
          : "Weather layers © OpenWeatherMap",
    });

    map.addLayer({
      id: OVERLAY_LAYER,
      type: "raster",
      source: OVERLAY_SOURCE,
      paint: { "raster-opacity": opacity },
    });
    // `opacity` deliberately excluded: it is applied by the effect below, and
    // including it here would tear the source down on every slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tileUrl, definition.source]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(OVERLAY_LAYER)) return;
    map.setPaintProperty(OVERLAY_LAYER, "raster-opacity", opacity);
  }, [ready, opacity]);

  /* ---------------------------------------------------------------- Playback */

  useEffect(() => {
    if (!playing || !animated || activeFrames.length < 2) return;

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % activeFrames.length);
    }, 550);

    return () => clearInterval(timer);
  }, [playing, animated, activeFrames.length]);

  const locate = useCallback(() => {
    const map = mapRef.current;
    if (!map || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.easeTo({ center: [coords.longitude, coords.latitude], zoom: 8 });
    });
  }, []);

  /* ------------------------------------------------------------------ Render */

  const currentFrame = activeFrames[Math.min(frame, activeFrames.length - 1)];
  const availableLayers = MAP_LAYERS.filter(
    (entry) => !entry.needsKey || owmConfigured,
  );

  return (
    <div className="relative overflow-hidden rounded-md border border-hairline">
      <div
        ref={containerRef}
        className="h-[clamp(24rem,68dvh,52rem)] w-full bg-sunken"
        role="application"
        aria-label={`Weather map centred on ${location.name}. ${definition.label} layer.`}
      />

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-sunken p-8">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium">The map could not be loaded</p>
            <p className="mt-1.5 text-xs leading-relaxed text-tertiary">
              Base map tiles are unavailable right now. The forecast and radar
              data elsewhere in the app are unaffected.
            </p>
          </div>
        </div>
      ) : null}

      {!ready && !failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-sunken">
          <p className="text-xs text-tertiary">Loading map…</p>
        </div>
      ) : null}

      {/* Controls float over the map but stay reachable in the tab order. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-strong bg-panel px-3 text-sm hover:bg-[--surface-hover]"
          >
            <Layers className="size-4" aria-hidden />
            {definition.label}
          </button>

          {panelOpen ? (
            <Panel className="w-64 p-3">
              <fieldset>
                <legend className="label-micro mb-2">Layer</legend>
                <div className="flex flex-col">
                  {availableLayers.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-sm px-1.5 py-1.5 hover:bg-[--surface-hover]"
                    >
                      <input
                        type="radio"
                        name="map-layer"
                        value={entry.id}
                        checked={layer === entry.id}
                        onChange={() => {
                          setLayer(entry.id);
                          setFrame(radar?.nowIndex ?? 0);
                        }}
                        className="mt-1 accent-[var(--text-primary)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm">{entry.label}</span>
                        <span className="text-[11px] leading-snug text-tertiary">
                          {entry.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {!owmConfigured ? (
                <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-tertiary">
                  Temperature, wind, pressure and cloud layers need an
                  OpenWeatherMap key. Set <code>OPENWEATHER_API_KEY</code> to
                  enable them.
                </p>
              ) : null}

              <div className="mt-3 border-t border-hairline pt-3">
                <label
                  htmlFor="layer-opacity"
                  className="label-micro mb-2 block"
                >
                  Opacity
                </label>
                <input
                  id="layer-opacity"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(opacity * 100)}
                  onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                  className="w-full accent-[var(--text-primary)]"
                />
              </div>
            </Panel>
          ) : null}
        </div>

        <button
          type="button"
          onClick={locate}
          aria-label="Centre on my location"
          className="pointer-events-auto mr-11 flex size-10 cursor-pointer items-center justify-center rounded-md border border-strong bg-panel hover:bg-[--surface-hover]"
        >
          <Crosshair className="size-4" aria-hidden />
        </button>
      </div>

      {/* Legend */}
      {definition.legend ? (
        <div
          className={cn(
            "pointer-events-none absolute left-3 rounded-md border border-hairline bg-panel/95 p-2.5",
            // Clears the timeline when one is showing, and the scale control
            // when one is not.
            animated && activeFrames.length > 1 ? "bottom-24" : "bottom-12",
          )}
        >
          <p className="label-micro mb-1.5">
            {definition.label} · {definition.legend.unit}
          </p>
          <div
            className="h-2 w-40 rounded-full"
            style={{ background: definition.legend.gradient }}
            aria-hidden
          />
          <div className="mt-1 flex justify-between">
            {definition.legend.ticks.map((tick) => (
              <span key={tick} className="measured text-[9px] text-tertiary">
                {tick}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Timeline */}
      {animated && activeFrames.length > 1 ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-hairline bg-panel/95 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause animation" : "Play animation"}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-hairline hover:bg-[--surface-hover]"
            >
              {playing ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
            </button>

            <label className="sr-only" htmlFor="radar-frame">
              Radar frame
            </label>
            <input
              id="radar-frame"
              type="range"
              min={0}
              max={activeFrames.length - 1}
              value={Math.min(frame, activeFrames.length - 1)}
              onChange={(event) => {
                setPlaying(false);
                setFrame(Number(event.target.value));
              }}
              className="min-w-0 flex-1 accent-[var(--text-primary)]"
              aria-valuetext={
                currentFrame
                  ? `${formatHour(currentFrame.time, location.timezone, { hour12 })}${currentFrame.forecast ? ", forecast" : ""}`
                  : undefined
              }
            />

            <span className="measured w-24 shrink-0 text-right text-xs">
              {currentFrame
                ? formatHour(currentFrame.time, location.timezone, { hour12 })
                : "—"}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between">
            <span className="measured text-[10px] text-tertiary">
              {activeFrames[0]
                ? formatHour(activeFrames[0].time, location.timezone, { hour12 })
                : ""}
            </span>
            <span
              className={cn(
                "text-[10px]",
                currentFrame?.forecast ? "text-secondary" : "text-tertiary",
              )}
            >
              {currentFrame?.forecast
                ? "Forecast — extrapolated from radar motion"
                : "Observed"}
            </span>
            <span className="measured text-[10px] text-tertiary">
              {activeFrames[activeFrames.length - 1]
                ? formatHour(
                    activeFrames[activeFrames.length - 1].time,
                    location.timezone,
                    { hour12 },
                  )
                : ""}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
