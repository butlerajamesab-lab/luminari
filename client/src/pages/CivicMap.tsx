import { useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { StationNav } from "@/components/station-nav";

// Navigation on this page is the shared StationNav strip only. A page-local
// navItems row that duplicated the strip used to render in the header; it was
// removed so the page carries exactly one navigation row.

// The basemap key arrives from the Render environment
// (VITE_CARTO_BASEMAP_KEY) and is forwarded to the map frame as a query
// parameter — the source file stays free of embedded credentials, and the
// key can rotate without a code change.
const cartoBasemapKey = import.meta.env.VITE_CARTO_BASEMAP_KEY as
  | string
  | undefined;

export default function CivicMap() {
  const frameParams = new URLSearchParams(window.location.search);
  if (cartoBasemapKey && !frameParams.has("carto_key")) {
    frameParams.set("carto_key", cartoBasemapKey);
  }
  const frameSuffix = frameParams.toString() ? `?${frameParams.toString()}` : "";

  // Leaflet inside the frame must never initialize against a zero-size
  // container — that is the jigsaw-scramble origin. Measure this shell's
  // container first, and only mount the iframe once it has real dimensions.
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    if (frameReady) return;
    let attempts = 0;
    const measure = () => {
      const el = shellRef.current;
      if (el && el.offsetHeight > 10 && el.offsetWidth > 10) {
        setFrameReady(true);
        return;
      }
      attempts += 1;
      if (attempts < 120) {
        requestAnimationFrame(measure);
      } else {
        // Fallback: after ~2 seconds of retries, mount anyway — the inner
        // page's own invalidateSize passes remain as the second line.
        setFrameReady(true);
      }
    };
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [frameReady]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MapPinned className="h-4 w-4 text-cyan-400" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Civic Map</h1>
              <p className="truncate text-[11px] text-muted-foreground">Geographic view of the v3.13 Resource Directory</p>
            </div>
          </div>
        </div>

      </header>

      <div className="border-b border-border px-4 py-3">
        <StationNav />
      </div>

      <div ref={shellRef} className="min-h-0 flex-1">
        {frameReady && (
          <iframe
            src={`/civicmap.html${frameSuffix}`}
            className="h-full w-full border-0"
            title="Civic Map — Resource Directory geography"
          />
        )}
      </div>
    </div>
  );
}
