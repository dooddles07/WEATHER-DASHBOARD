"use client";

import { Check, MapPin, Pencil, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, Panel, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { persistSelectedLocation } from "@/lib/locations/client";
import { describeLocation, SUGGESTED_LOCATIONS } from "@/lib/locations/places";
import { usePreferences } from "@/lib/stores/preferences";
import { formatZoneOffset } from "@/lib/time";
import { formatTemperature } from "@/lib/weather/units";
import type { GeoLocation } from "@/types/location";

interface Preview {
  latitude: number;
  longitude: number;
  temperature: number;
  conditionLabel: string;
  glyph: string;
}

const key = (location: GeoLocation) =>
  `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;

export function LocationManager() {
  const router = useRouter();

  const favorites = usePreferences((store) => store.favorites);
  const recents = usePreferences((store) => store.recents);
  const units = usePreferences((store) => store.units);
  const removeFavorite = usePreferences((store) => store.removeFavorite);
  const renameFavorite = usePreferences((store) => store.renameFavorite);
  const toggleFavorite = usePreferences((store) => store.toggleFavorite);

  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | undefined>();
  const [draftLabel, setDraftLabel] = useState("");

  const places = useMemo(
    () => favorites.map((favorite) => favorite.location),
    [favorites],
  );

  useEffect(() => {
    const targets = places.length > 0 ? places : [];
    if (targets.length === 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const points = targets
      .slice(0, 6)
      .map((place) => `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`)
      .join(";");

    fetch(`/api/geo/preview?points=${encodeURIComponent(points)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { previews: [] }))
      .then((body: { previews: Preview[] }) => {
        const next: Record<string, Preview> = {};
        for (const preview of body.previews) {
          next[`${preview.latitude.toFixed(2)},${preview.longitude.toFixed(2)}`] = preview;
        }
        setPreviews(next);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [places]);

  const open = (location: GeoLocation) => {
    persistSelectedLocation(location);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">My locations</h1>
        <p className="text-xs text-tertiary">
          Saved on this device. Press ⌘K anywhere to add another.
        </p>
      </header>

      {favorites.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-8">
          <MapPin className="size-6 text-tertiary" aria-hidden />
          <p className="text-sm font-medium">No saved locations yet</p>
          <p className="max-w-prose text-xs leading-relaxed text-tertiary">
            Save the places you check often and they will appear here with
            current conditions, ready to switch between.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_LOCATIONS.slice(0, 4).map((location) => (
              <Button
                key={location.id}
                variant="outline"
                size="sm"
                onClick={() => toggleFavorite(location)}
              >
                <Star className="size-3.5" aria-hidden />
                {location.name}
              </Button>
            ))}
          </div>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {favorites.map((favorite) => {
            const location = favorite.location;
            const preview = previews[key(location)];
            const isEditing = editing === location.id;

            return (
              <li key={location.id}>
                <Panel className="flex items-center gap-3 p-4">
                  {isEditing ? (
                    <>
                      <label className="sr-only" htmlFor={`label-${location.id}`}>
                        Name for {location.name}
                      </label>
                      <input
                        id={`label-${location.id}`}
                        autoFocus
                        value={draftLabel}
                        onChange={(event) => setDraftLabel(event.target.value)}
                        placeholder={location.name}
                        className="h-10 min-w-0 flex-1 rounded-md border border-strong bg-sunken px-3 text-sm outline-none"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            renameFavorite(location.id, draftLabel);
                            setEditing(undefined);
                          }
                          if (event.key === "Escape") setEditing(undefined);
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          renameFavorite(location.id, draftLabel);
                          setEditing(undefined);
                        }}
                      >
                        <Check className="size-3.5" aria-hidden />
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(undefined)}>
                        <X className="size-3.5" aria-hidden />
                        <span className="sr-only">Cancel</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => open(location)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">
                            {favorite.label ?? location.name}
                          </span>
                          <span className="truncate text-xs text-tertiary">
                            {favorite.label
                              ? describeLocation(location)
                              : [location.admin1, location.country]
                                  .filter(Boolean)
                                  .join(", ")}
                          </span>
                        </span>

                        <span className="measured hidden shrink-0 text-[10px] text-tertiary sm:block">
                          {formatZoneOffset(location.timezone)}
                        </span>

                        {loading ? (
                          <Skeleton className="h-6 w-16" />
                        ) : preview ? (
                          <span className="flex shrink-0 items-center gap-2 text-secondary">
                            <WeatherGlyph glyph={preview.glyph} size={20} />
                            <span className="readout text-base">
                              {
                                formatTemperature(preview.temperature, units.temperature)
                                  .display
                              }
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-tertiary">—</span>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Rename ${location.name}`}
                          onClick={() => {
                            setEditing(location.id);
                            setDraftLabel(favorite.label ?? "");
                          }}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-md text-tertiary hover:bg-[--surface-hover] hover:text-primary"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${location.name}`}
                          onClick={() => removeFavorite(location.id)}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-md text-tertiary hover:bg-[--surface-hover] hover:text-primary"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {recents.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Recently viewed" />
          <ul className="flex flex-wrap gap-2">
            {recents.map((location) => (
              <li key={location.id}>
                <Button variant="outline" size="sm" onClick={() => open(location)}>
                  <MapPin className="size-3.5" aria-hidden />
                  {location.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
