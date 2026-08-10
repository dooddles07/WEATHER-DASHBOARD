/**
 * A place the app can show weather for.
 *
 * `timezone` is an IANA identifier and is not optional: every time in this
 * product is rendered in the local time of the place being viewed, never the
 * viewer's. Tokyo weather reads in Tokyo time even when you are in Manila.
 */
export interface GeoLocation {
  /** Stable key. `openmeteo:1701668` for a gazetteer hit, `at:14.60,120.98` for raw coordinates. */
  id: string;
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2, used to pick the right official alert feed. */
  countryCode: string;
  /** State, province or region. */
  admin1?: string;
  /** County or district. */
  admin2?: string;
  latitude: number;
  longitude: number;
  /** Metres above sea level. */
  elevation?: number;
  timezone: string;
  population?: number;
  /** URL segment for the public page, e.g. `manila-philippines`. */
  slug: string;
}

/** A location the user has chosen to keep. */
export interface SavedLocation {
  location: GeoLocation;
  /** User-supplied name such as "Home" or "Work". Falls back to the place name. */
  label?: string;
  addedAt: string;
  order: number;
}

export interface SearchResultPreview {
  temperature: number;
  conditionLabel: string;
  isDay: boolean;
  code: number;
}

export interface LocationSearchResult {
  location: GeoLocation;
  /** Populated lazily — the list renders before previews arrive. */
  preview?: SearchResultPreview;
}
