import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies MapLibre's worker chunks into `public/maplibre/`.
 *
 * MapLibre loads its worker as an ES module sibling — `maplibre-gl-worker.mjs`
 * importing `./maplibre-gl-shared.mjs`. Turbopack does not emit those chunks
 * for us, so the worker request falls through to the app's HTML and the map
 * hangs forever with no error, because the style never finishes parsing.
 *
 * Serving the prebuilt worker from `public/` and pointing `setWorkerUrl` at it
 * sidesteps the bundler entirely. This runs before dev and build so the copy
 * can never drift from the installed version.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const source = join(root, "node_modules", "maplibre-gl", "dist");
const destination = join(root, "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(destination, { recursive: true });

await Promise.all(
  FILES.map((file) => copyFile(join(source, file), join(destination, file))),
);

console.log(`maplibre worker copied to public/maplibre (${FILES.length} files)`);
