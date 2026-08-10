"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Command } from "cmdk";
import { Crosshair, Loader2, Search, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { persistSelectedLocation } from "@/lib/locations/client";
import { describeLocation, SUGGESTED_LOCATIONS } from "@/lib/locations/places";
import { usePreferences } from "@/lib/stores/preferences";
import { formatZoneOffset } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import type { GeoLocation } from "@/types/location";

/**
 * Global location search.
 *
 * Opens on ⌘K or /, accepts place names, postal codes and raw coordinates, and
 * shows current conditions beside each result so you can pick the right
 * "Springfield" without opening it first. Previews are fetched for the whole
 * visible list in one batched request.
 */

interface Preview {
  latitude: number;
  longitude: number;
  temperature: number;
  conditionLabel: string;
  glyph: string;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: GeoLocation[] }
  | { status: "error"; message: string };

const previewKey = (location: GeoLocation) =>
  `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;

export function LocationSearch({ current }: { current: GeoLocation }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | undefined>();

  const favorites = usePreferences((store) => store.favorites);
  const recents = usePreferences((store) => store.recents);
  const toggleFavorite = usePreferences((store) => store.toggleFavorite);
  const rememberRecent = usePreferences((store) => store.rememberRecent);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.location.id)),
    [favorites],
  );

  /* ---------------------------------------------------------------- Shortcuts */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ------------------------------------------------------------------ Search */

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();

    // Long enough that typing a city name is one request, short enough that
    // the list feels like it is keeping up.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/geo/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setState({
            status: "error",
            message:
              response.status === 429
                ? "Too many searches at once. Give it a moment."
                : "Search is unavailable right now.",
          });
          return;
        }

        const body = (await response.json()) as { results: GeoLocation[] };
        setState({ status: "ready", results: body.results });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState({ status: "error", message: "Search could not be reached." });
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  /* ---------------------------------------------------------------- Previews */

  const visible = useMemo<GeoLocation[]>(() => {
    if (state.status === "ready") return state.results;
    if (query.trim().length >= 2) return [];
    const saved = favorites.map((favorite) => favorite.location);
    const seen = new Set<string>();
    return [...saved, ...recents, ...SUGGESTED_LOCATIONS]
      .filter((location) => !seen.has(location.id) && seen.add(location.id))
      .slice(0, 8);
  }, [state, query, favorites, recents]);

  /**
   * Keyed by coordinate, recording every point we have *asked* about rather
   * than every point we got an answer for. Without that distinction a place
   * the provider has no reading for — or a request the rate limiter rejects —
   * looks permanently missing, and the effect asks again on every render.
   */
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const missing = visible
      .filter((location) => !requested.current.has(previewKey(location)))
      .slice(0, 6);
    if (missing.length === 0) return;

    for (const location of missing) requested.current.add(previewKey(location));

    const controller = new AbortController();
    const points = missing
      .map((location) => `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`)
      .join(";");

    fetch(`/api/geo/preview?points=${encodeURIComponent(points)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { previews: [] }))
      .then((body: { previews: Preview[] }) => {
        setPreviews((existing) => {
          const next = { ...existing };
          for (const preview of body.previews) {
            next[`${preview.latitude.toFixed(2)},${preview.longitude.toFixed(2)}`] = preview;
          }
          return next;
        });
      })
      // A missing preview is not worth surfacing; the row still works.
      .catch(() => undefined);

    return () => controller.abort();
  }, [visible]);

  /* ------------------------------------------------------------------ Select */

  const choose = useCallback(
    (location: GeoLocation) => {
      persistSelectedLocation(location);
      rememberRecent(location);
      setOpen(false);
      setQuery("");
      router.refresh();
    },
    [rememberRecent, router],
  );

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocateError("This browser cannot share your location.");
      return;
    }

    setLocating(true);
    setLocateError(undefined);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(
            `/api/geo/reverse?lat=${coords.latitude.toFixed(4)}&lon=${coords.longitude.toFixed(4)}`,
          );
          const body = (await response.json()) as { location?: GeoLocation };

          if (body.location) choose(body.location);
          else setLocateError("We could not identify that place.");
        } catch {
          setLocateError("We could not identify that place.");
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. You can search for a place instead."
            : "Your location could not be determined.",
        );
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, [choose]);

  /* ------------------------------------------------------------------ Render */

  const searching = query.trim().length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-10 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md border border-hairline bg-sunken px-3 text-left transition-colors duration-[--duration-fast] hover:border-strong sm:w-72 lg:w-96"
      >
        <Search className="size-4 shrink-0 text-tertiary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-secondary">
          {current.name}
        </span>
        <kbd className="measured hidden shrink-0 rounded-xs border border-hairline px-1.5 py-0.5 text-[10px] text-tertiary sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(0_0_0/0.45)] backdrop-blur-[1px]" />
          <Dialog.Content
            className="fixed left-1/2 top-[8vh] z-50 w-[min(94vw,40rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-strong bg-panel"
            aria-describedby={undefined}
          >
            <VisuallyHidden>
              <Dialog.Title>Search for a location</Dialog.Title>
            </VisuallyHidden>

            <Command shouldFilter={false} loop className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-hairline px-4">
                {state.status === "loading" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-tertiary motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Search className="size-4 shrink-0 text-tertiary" aria-hidden />
                )}
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="City, postal code or coordinates"
                  className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-tertiary"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="cursor-pointer rounded-sm p-1 text-tertiary hover:text-primary"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>

              <Command.List className="scroll-region max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-2">
                {state.status === "error" ? (
                  <div className="px-3 py-8 text-center">
                    <p className="text-sm font-medium">{state.message}</p>
                    <p className="mt-1 text-xs text-tertiary">
                      Your saved locations below still work.
                    </p>
                  </div>
                ) : null}

                {searching && state.status === "ready" && state.results.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <p className="text-sm font-medium">No places match “{query.trim()}”.</p>
                    <p className="mt-1 text-xs text-tertiary">
                      Try a city name, a postal code, or coordinates like 14.6, 121.0.
                    </p>
                  </div>
                ) : null}

                {searching && state.status === "loading" ? (
                  <ul className="space-y-1" aria-hidden>
                    {[0, 1, 2].map((row) => (
                      <li
                        key={row}
                        className="flex h-14 animate-pulse items-center gap-3 rounded-md px-3 motion-reduce:animate-none"
                      >
                        <div className="h-3 w-40 rounded-xs bg-[--surface-hover]" />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!searching ? (
                  <Command.Group
                    heading={
                      favorites.length > 0 || recents.length > 0
                        ? "Saved and recent"
                        : "Suggestions"
                    }
                    className="[&_[cmdk-group-heading]]:label-micro [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2"
                  >
                    {visible.map((location) => (
                      <ResultRow
                        key={location.id}
                        location={location}
                        preview={previews[previewKey(location)]}
                        favorite={favoriteIds.has(location.id)}
                        onSelect={() => choose(location)}
                        onToggleFavorite={() => toggleFavorite(location)}
                      />
                    ))}
                  </Command.Group>
                ) : null}

                {searching && state.status === "ready" && state.results.length > 0 ? (
                  <Command.Group
                    heading="Results"
                    className="[&_[cmdk-group-heading]]:label-micro [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2"
                  >
                    {state.results.map((location) => (
                      <ResultRow
                        key={location.id}
                        location={location}
                        preview={previews[previewKey(location)]}
                        favorite={favoriteIds.has(location.id)}
                        onSelect={() => choose(location)}
                        onToggleFavorite={() => toggleFavorite(location)}
                      />
                    ))}
                  </Command.Group>
                ) : null}
              </Command.List>

              <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
                <button
                  type="button"
                  onClick={locate}
                  disabled={locating}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-secondary transition-colors hover:bg-[--surface-hover] hover:text-primary disabled:opacity-50"
                >
                  {locating ? (
                    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Crosshair className="size-3.5" aria-hidden />
                  )}
                  {locating ? "Finding you…" : "Use my location"}
                </button>

                <p className="measured hidden text-[10px] text-tertiary sm:block">
                  ↑↓ to move · ↵ to select · esc to close
                </p>
              </div>

              {locateError ? (
                <p role="status" className="border-t border-hairline px-4 py-2 text-xs text-secondary">
                  {locateError}
                </p>
              ) : null}
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ResultRow({
  location,
  preview,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  location: GeoLocation;
  preview?: Preview;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  // cmdk needs a stable, unique value per item for keyboard navigation.
  return (
    <Command.Item
      value={`${location.id}|${describeLocation(location)}`}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5",
        "data-[selected=true]:bg-[--surface-active]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{location.name}</span>
        <span className="truncate text-xs text-tertiary">
          {[location.admin1, location.country].filter(Boolean).join(", ") ||
            "Coordinates"}
        </span>
      </div>

      {location.timezone && location.timezone !== "UTC" ? (
        <span className="measured hidden shrink-0 text-[10px] text-tertiary sm:block">
          {formatZoneOffset(location.timezone)}
        </span>
      ) : null}

      {preview ? (
        <span className="flex shrink-0 items-center gap-1.5 text-secondary">
          <WeatherGlyph glyph={preview.glyph} size={18} />
          <span className="readout text-sm">{preview.temperature}°</span>
        </span>
      ) : (
        <span className="w-12" aria-hidden />
      )}

      <button
        type="button"
        aria-label={
          favorite
            ? `Remove ${location.name} from favourites`
            : `Save ${location.name} to favourites`
        }
        aria-pressed={favorite}
        onClick={(event) => {
          // Without this the row's select handler fires and navigates away.
          event.stopPropagation();
          onToggleFavorite();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="shrink-0 cursor-pointer rounded-sm p-1.5 text-tertiary transition-colors hover:text-primary"
      >
        <Star className={cn("size-4", favorite && "fill-current text-primary")} aria-hidden />
      </button>
    </Command.Item>
  );
}
