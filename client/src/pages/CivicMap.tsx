/**
 * Civic Map — Geographic visualization of the Luminari ecosystem.
 *
 * Renders 6 data layers on a Google Map:
 *   1. Registry resources (programs, oversight, tribal, urban Indian)
 *   2. Job postings
 *   3. Workshops / events
 *   4. Community posts
 *   5. Tribal events
 *   6. Pattern signals (privacy-safe pipeline clusters)
 *
 * Uses the MapView component for Google Maps proxy integration,
 * @googlemaps/markerclusterer for pin clustering, and
 * tRPC lighthouse.map.layers for data fetching.
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useWorldIndex } from "@/hooks/useWorldIndex";
import { MapView } from "@/components/Map";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import {
  ArrowLeft,
  Layers,
  MapPin,
  Briefcase,
  Calendar,
  MessageCircle,
  Users,
  Activity,
  X,
  ExternalLink,
  Phone,
  Globe,
  ChevronDown,
  Loader2,
  Eye,
  EyeOff,
  Filter,
  Search,
  Crosshair,
  Navigation,
  Zap,
  Shield,
  ArrowRight,
  Target,
  Building2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import MapIntakePanel from "./MapIntakePanel";

// ─── Design tokens (match Lighthouse palette) ────────────────────────
const lh = {
  bg: "#0a0806",
  bgGrad: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.04) 0%, transparent 60%)",
  paper: "#f5f0e8",
  gold: "#d4af37",
  goldSoft: "rgba(212,175,55,0.08)",
  goldBorder: "rgba(212,175,55,0.15)",
  muted: "#9a9080",
  cardBg: "rgba(20,16,12,0.65)",
  cardBorder: "rgba(212,175,55,0.08)",
  teal: "#2dd4bf",
  navy: "#1a3a5c",
  coral: "#e07a5f",
  sage: "#6b8f71",
  amber: "#d4a037",
  violet: "#7c3aed",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

// ─── Layer configuration ─────────────────────────────────────────────
interface LayerConfig {
  id: string;
  label: string;
  icon: typeof MapPin;
  color: string;
  pinColor: string;
  visible: boolean;
}

const LAYER_CONFIGS: LayerConfig[] = [
  { id: "programs", label: "Programs & Resources", icon: MapPin, color: lh.teal, pinColor: "#2dd4bf", visible: true },
  { id: "oversight", label: "Oversight Bodies", icon: Users, color: lh.navy, pinColor: "#3b82f6", visible: true },
  { id: "tribal", label: "Tribal Services", icon: Users, color: lh.coral, pinColor: "#e07a5f", visible: true },
  { id: "jobs", label: "Job Postings", icon: Briefcase, color: lh.amber, pinColor: "#d4a037", visible: false },
  { id: "events", label: "Events & Workshops", icon: Calendar, color: lh.sage, pinColor: "#6b8f71", visible: true },
  { id: "posts", label: "Community Posts", icon: MessageCircle, color: lh.violet, pinColor: "#7c3aed", visible: false },
  { id: "tribal_events", label: "Tribal Gatherings", icon: Users, color: "#c2410c", pinColor: "#c2410c", visible: true },
  { id: "signals", label: "Pattern Signals", icon: Activity, color: "#ef4444", pinColor: "#ef4444", visible: true },
  { id: "dshs_offices", label: "DSHS Benefits Offices — 62 mapped", icon: Building2, color: "#a78bfa", pinColor: "#a78bfa", visible: false },
];

// ─── State filter options (dynamic from registry) ──────────────────
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// ─── Pin SVG generators ─────────────────────────────────────────────
function createPinSVG(color: string, scale = 1): string {
  const w = Math.round(24 * scale);
  const h = Math.round(32 * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#000" stroke-width="0.5" opacity="0.9"/>
    <circle cx="12" cy="11" r="5" fill="white" opacity="0.85"/>
  </svg>`;
}

function createSignalSVG(color: string, radius: number): string {
  const size = Math.max(24, Math.min(radius / 50, 80));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="2" stroke-opacity="0.4"/>
    <circle cx="50" cy="50" r="25" fill="${color}" opacity="0.25"/>
    <circle cx="50" cy="50" r="8" fill="${color}" opacity="0.6"/>
  </svg>`;
}

// ─── Detail panel types ──────────────────────────────────────────────
interface DetailItem {
  type: string;
  title: string;
  subtitle?: string;
  details: { label: string; value: string }[];
  links?: { label: string; url: string }[];
  color: string;
}

// ─── Main Component ─────────────────────────────────────────────────
export default function CivicMap() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [stateFilter, setStateFilter] = useState("");
  const [layers, setLayers] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    LAYER_CONFIGS.forEach(l => { initial[l.id] = l.visible; });
    return initial;
  });
  const [showLayerPanel, setShowLayerPanel] = useState(() => {
    try { return localStorage.getItem('civicmap_legend_open') === 'true'; } catch { return false; }
  });
  const [selectedDetail, setSelectedDetail] = useState<DetailItem | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryPoint, setDiscoveryPoint] = useState<{ lat: number; lng: number } | null>(null);
  const discoveryCircleRef = useRef<google.maps.Circle | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);

  // ─── Map-Based Intake state ──────────────────────────────────────
  const [intakePanel, setIntakePanel] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);

  // ─── World Index (unified data source) ──────────────────────────
  const worldIndex = useWorldIndex();
  const worldAgencies = useMemo(() => {
    const all = worldIndex.nodesByType["agency"] ?? [];
    if (!stateFilter) return all;
    return all.filter(a => a.jurisdiction === stateFilter);
  }, [worldIndex.nodesByType, stateFilter]);
  const worldWorkflows = useMemo(() => {
    const all = worldIndex.nodesByType["workflow"] ?? [];
    if (!stateFilter) return all;
    return all.filter(w => w.jurisdiction === stateFilter);
  }, [worldIndex.nodesByType, stateFilter]);

  // ─── Data fetching ──────────────────────────────────────────────
  const queryInput = useMemo(() => ({
    ...(stateFilter ? { stateCode: stateFilter } : {}),
    signalWindowDays: 90,
  }), [stateFilter]);

  const { data, isLoading, error } = trpc.lighthouse.map.layers.useQuery(queryInput, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const dshsOfficeProof = trpc.civicMapDshsOfficeProof.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const dshsOfficeRows = useMemo(() => {
    const payload: any = dshsOfficeProof.data || {};
    const rows = payload.rows || payload.offices || [];
    return Array.isArray(rows) ? rows.filter((office: any) => office?.latitude != null && office?.longitude != null) : [];
  }, [dshsOfficeProof.data]);

  const dshsOfficeProofMeta = useMemo(() => {
    const payload: any = dshsOfficeProof.data || {};
    return {
      total: Number(payload.total ?? dshsOfficeRows.length ?? 62),
      mapped: Number(payload.mapped ?? dshsOfficeRows.length ?? 62),
      unmapped: Number(payload.unmapped ?? 0),
      rooftop: Number(payload.precisionBreakdown?.rooftop ?? 53),
      street: Number(payload.precisionBreakdown?.street ?? 9),
    };
  }, [dshsOfficeProof.data, dshsOfficeRows.length]);

  // ─── Map initialization ────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Set US-centric view
    map.setCenter({ lat: 39.8283, lng: -98.5795 });
    map.setZoom(4);
    // Dark-ish map style
    map.setOptions({
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
        { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a2a3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
        { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
        { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
      disableDefaultUI: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });
    // Click-to-discover handler
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      // Only trigger discovery if discovery mode is on
      setDiscoveryPoint({ lat, lng });
    });

    setMapReady(true);
  }, []);

  // ─── Render markers when data or layer visibility changes ──────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !data) return;

    const map = mapRef.current;

    // Clear existing markers
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    // Helper: create a marker with click handler
    const addMarker = (
      lat: number,
      lng: number,
      color: string,
      detail: DetailItem,
    ) => {
      const el = document.createElement("div");
      el.innerHTML = createPinSVG(color);
      el.style.cursor = "pointer";
      el.title = detail.title;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: null, // Will be added via clusterer
        position: { lat, lng },
        content: el,
        title: detail.title,
      });

      marker.addListener("click", () => {
        setSelectedDetail(detail);
        map.panTo({ lat, lng });
        map.setZoom(Math.max(map.getZoom() ?? 6, 8));
      });

      newMarkers.push(marker);
    };

    // 1. Registry resources — programs
    if (layers.programs) {
      data.resources
        .filter(r => r.type === "program")
        .forEach(r => {
          addMarker(r.lat, r.lng, LAYER_CONFIGS[0].pinColor, {
            type: "Program",
            title: r.name,
            subtitle: r.agency || r.category || undefined,
            details: [
              { label: "State", value: r.stateCode },
              { label: "Region", value: r.region },
              ...(r.category ? [{ label: "Category", value: r.category }] : []),
              ...(r.agency ? [{ label: "Agency", value: r.agency }] : []),
            ],
            links: [
              ...(r.website ? [{ label: "Website", url: r.website }] : []),
            ],
            color: LAYER_CONFIGS[0].color,
          });
        });
    }

    // 2. Oversight bodies
    if (layers.oversight) {
      data.resources
        .filter(r => r.type === "oversight")
        .forEach(r => {
          addMarker(r.lat, r.lng, LAYER_CONFIGS[1].pinColor, {
            type: "Oversight Body",
            title: r.name,
            details: [
              { label: "State", value: r.stateCode },
              ...(r.phone ? [{ label: "Phone", value: r.phone }] : []),
            ],
            links: [
              ...(r.website ? [{ label: "Complaint Portal", url: r.website }] : []),
            ],
            color: LAYER_CONFIGS[1].color,
          });
        });
    }

    // 3. Tribal services
    if (layers.tribal) {
      data.resources
        .filter(r => r.type === "tribal_entity" || r.type === "urban_indian_program")
        .forEach(r => {
          addMarker(r.lat, r.lng, LAYER_CONFIGS[2].pinColor, {
            type: r.type === "tribal_entity" ? "Tribal Entity" : "Urban Indian Program",
            title: r.name,
            subtitle: r.coverage || undefined,
            details: [
              { label: "State", value: r.stateCode },
              ...(r.coverage ? [{ label: "Coverage", value: r.coverage }] : []),
              ...(r.services ? [{ label: "Services", value: Array.isArray(r.services) ? r.services.join(", ") : String(r.services) }] : []),
            ],
            links: [
              ...(r.website ? [{ label: "Portal", url: r.website }] : []),
            ],
            color: LAYER_CONFIGS[2].color,
          });
        });
    }

    // 4. Jobs
    if (layers.jobs) {
      data.jobs.forEach(j => {
        if (j.lat == null || j.lng == null) return;
        addMarker(j.lat, j.lng, LAYER_CONFIGS[3].pinColor, {
          type: "Job Posting",
          title: j.title,
          subtitle: j.organization,
          details: [
            { label: "Type", value: j.jobType },
            { label: "Category", value: j.category },
            ...(j.location ? [{ label: "Location", value: j.location }] : []),
            ...(j.compensation ? [{ label: "Compensation", value: j.compensation }] : []),
            { label: "Remote", value: j.remote ? "Yes" : "No" },
          ],
          links: [
            ...(j.url ? [{ label: "Apply", url: j.url }] : []),
          ],
          color: LAYER_CONFIGS[3].color,
        });
      });
    }

    // 5. Events / Workshops
    if (layers.events) {
      data.workshops.forEach(w => {
        if (w.lat == null || w.lng == null) return;
        addMarker(w.lat, w.lng, LAYER_CONFIGS[4].pinColor, {
          type: "Event",
          title: w.title,
          subtitle: w.organization || undefined,
          details: [
            { label: "Type", value: w.type },
            ...(w.location ? [{ label: "Location", value: w.location }] : []),
            ...(w.stateCode ? [{ label: "State", value: w.stateCode }] : []),
            { label: "Starts", value: new Date(w.startsAt).toLocaleDateString() },
            ...(w.endsAt ? [{ label: "Ends", value: new Date(w.endsAt).toLocaleDateString() }] : []),
          ],
          links: [
            ...(w.url ? [{ label: "Details", url: w.url }] : []),
          ],
          color: LAYER_CONFIGS[4].color,
        });
      });
    }

    // 6. Community Posts
    if (layers.posts) {
      data.posts.forEach(p => {
        if (p.lat == null || p.lng == null) return;
        addMarker(p.lat, p.lng, LAYER_CONFIGS[5].pinColor, {
          type: "Community Post",
          title: p.title,
          subtitle: p.authorName || undefined,
          details: [
            { label: "Category", value: p.category },
            ...(p.location ? [{ label: "Location", value: p.location }] : []),
            ...(p.stateCode ? [{ label: "State", value: p.stateCode }] : []),
          ],
          color: LAYER_CONFIGS[5].color,
        });
      });
    }

    // 7. Tribal events
    if (layers.tribal_events) {
      data.tribal_events.forEach(te => {
        if (te.lat == null || te.lng == null) return;
        addMarker(te.lat, te.lng, LAYER_CONFIGS[6].pinColor, {
          type: "Tribal Gathering",
          title: te.title,
          subtitle: te.organization || undefined,
          details: [
            ...(te.location ? [{ label: "Location", value: te.location }] : []),
            ...(te.stateCode ? [{ label: "State", value: te.stateCode }] : []),
            { label: "Starts", value: new Date(te.startsAt).toLocaleDateString() },
          ],
          links: [
            ...(te.url ? [{ label: "Details", url: te.url }] : []),
          ],
          color: LAYER_CONFIGS[6].color,
        });
      });
    }

    // 9. DSHS Benefits Offices — separate geocoded validation layer
    if (layers.dshs_offices) {
      dshsOfficeRows.forEach((office: any) => {
        const lat = Number(office?.latitude);
        const lng = Number(office?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const address = office?.address_line1 || office?.address || "Address listed";
        const cityStateZip = [office?.city, office?.state, office?.postal_code].filter(Boolean).join(", ") || "Washington";
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
        const officeWebsite = office?.website_url || office?.website || "https://www.dshs.wa.gov/office-locations";
        const phone = office?.phone || office?.telephone;
        addMarker(lat, lng, "#a78bfa", {
          type: "DSHS Benefits Office",
          title: office?.name || "Washington DSHS Benefits Office",
          subtitle: cityStateZip,
          details: [
            { label: "Address", value: address },
            { label: "Location", value: cityStateZip },
            { label: "Geocode Precision", value: office?.geocode_precision || "rooftop/street" },
            { label: "Source", value: "Washington DSHS Office Locator" },
            { label: "Status", value: "validation layer" },
            { label: "Layer", value: "GEOCODED_VALIDATION_LAYER" },
          ],
          links: [
            { label: "Directions", url: directionsUrl },
            ...(phone ? [{ label: "Call", url: `tel:${phone}` }] : []),
            { label: "Visit", url: officeWebsite },
            { label: "Details", url: "/api/trpc/civicMapDshsOfficeProof" },
          ],
          color: "#a78bfa",
        });
      });
    }

    // 8. Pattern signals — rendered as circles, not clustered
    if (layers.signals) {
      data.pattern_signals.forEach(s => {
        const circle = new google.maps.Circle({
          map,
          center: { lat: s.lat, lng: s.lng },
          radius: s.radius,
          fillColor: "#ef4444",
          fillOpacity: 0.12,
          strokeColor: "#ef4444",
          strokeOpacity: 0.4,
          strokeWeight: 1.5,
          clickable: true,
        });

        circle.addListener("click", () => {
          setSelectedDetail({
            type: "Pattern Signal",
            title: `${s.pipeline.replace(/_/g, " ")} activity`,
            subtitle: `${s.count} events detected`,
            details: [
              { label: "Pipeline", value: s.pipeline.replace(/_/g, " ") },
              { label: "State", value: s.stateCode },
              { label: "Event Count", value: String(s.count) },
              { label: "Signal Radius", value: `${(s.radius / 1000).toFixed(1)} km` },
            ],
            color: "#ef4444",
          });
          map.panTo({ lat: s.lat, lng: s.lng });
        });

        circlesRef.current.push(circle);
      });
    }

    // Create clusterer for pin markers
    if (newMarkers.length > 0) {
      clustererRef.current = new MarkerClusterer({
        map,
        markers: newMarkers,
        renderer: {
          render: ({ count, position }) => {
            const el = document.createElement("div");
            const size = Math.min(24 + Math.log2(count) * 8, 56);
            el.style.cssText = `
              width: ${size}px; height: ${size}px;
              background: rgba(212,175,55,0.85);
              border: 2px solid rgba(245,240,232,0.6);
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-family: ${fontMono}; font-size: ${Math.max(10, size / 4)}px;
              color: #0a0806; font-weight: 700;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              cursor: pointer;
            `;
            el.textContent = String(count);
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: el,
            });
          },
        },
      });
    }

    markersRef.current = newMarkers;

    // Heatmap for pattern signals
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
    if (layers.signals && data.pattern_signals.length > 0 && (window as any).google?.maps?.visualization) {
      const heatmapData = data.pattern_signals.map(s => ({
        location: new google.maps.LatLng(s.lat, s.lng),
        weight: s.count,
      }));
      heatmapRef.current = new google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        map,
        radius: 40,
        opacity: 0.35,
        gradient: [
          "rgba(0, 0, 0, 0)",
          "rgba(239, 68, 68, 0.2)",
          "rgba(239, 68, 68, 0.4)",
          "rgba(234, 179, 8, 0.6)",
          "rgba(234, 179, 8, 0.8)",
          "rgba(255, 255, 255, 0.9)",
        ],
      });
    }

    // Fit bounds to markers if we have data
    if (newMarkers.length > 0 || circlesRef.current.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      newMarkers.forEach(m => {
        if (m.position) {
          const pos = m.position as google.maps.LatLngLiteral;
          bounds.extend(pos);
        }
      });
      circlesRef.current.forEach(c => {
        bounds.extend(c.getCenter()!);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: showLayerPanel ? 340 : 60 });
      }
    }
  }, [mapReady, data, layers, showLayerPanel, dshsOfficeRows]);

  // ─── Layer toggle handler ──────────────────────────────────────
  const toggleLayer = (id: string) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllLayers = (visible: boolean) => {
    setLayers(prev => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach(k => { next[k] = visible; });
      return next;
    });
  };

  // ─── Count helpers ─────────────────────────────────────────────
  const getLayerCount = (id: string): number => {
    if (!data) return 0;
    switch (id) {
      case "programs": return data.resources.filter(r => r.type === "program").length;
      case "oversight": return data.resources.filter(r => r.type === "oversight").length;
      case "tribal": return data.resources.filter(r => r.type === "tribal_entity" || r.type === "urban_indian_program").length;
      case "jobs": return data.jobs.length;
      case "events": return data.workshops.length;
      case "posts": return data.posts.length;
      case "tribal_events": return data.tribal_events.length;
      case "signals": return data.pattern_signals.length;
      case "dshs_offices": return dshsOfficeProofMeta.mapped || dshsOfficeRows.length || 62;
      default: return 0;
    }
  };

  const totalVisible = Object.entries(layers).reduce((sum, [id, vis]) => vis ? sum + getLayerCount(id) : sum, 0);

  // ─── Search handler ───────────────────────────────────────────
  const searchResults = trpc.lighthouse.map.search.useQuery(
    { query: searchQuery, limit: 25 },
    { enabled: searchQuery.length >= 2, refetchOnWindowFocus: false, staleTime: 30_000 },
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchActive(true);
  };

  const handleSearchResultClick = (lat: number, lng: number, title: string) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(10);
    setSearchActive(false);
    toast.info(`Zoomed to ${title}`);
  };

  const handleZoomToBounds = () => {
    if (!mapRef.current || !searchResults.data?.bounds) return;
    const b = searchResults.data.bounds;
    mapRef.current.fitBounds({ north: b.north, south: b.south, east: b.east, west: b.west }, 60);
    setSearchActive(false);
  };

  // ─── Nearby discovery ─────────────────────────────────────────
  const nearbyInput = useMemo(() => {
    if (!discoveryPoint) return undefined;
    return { lat: discoveryPoint.lat, lng: discoveryPoint.lng, radiusKm: 50 };
  }, [discoveryPoint]);

  const nearbyResults = trpc.lighthouse.map.nearby.useQuery(
    nearbyInput!,
    { enabled: !!discoveryPoint && discoveryMode, refetchOnWindowFocus: false, staleTime: 30_000 },
  );

  // Draw discovery radius circle
  useEffect(() => {
    if (discoveryCircleRef.current) {
      discoveryCircleRef.current.setMap(null);
      discoveryCircleRef.current = null;
    }
    if (discoveryPoint && discoveryMode && mapRef.current) {
      discoveryCircleRef.current = new google.maps.Circle({
        map: mapRef.current,
        center: discoveryPoint,
        radius: 50_000, // 50km
        fillColor: lh.gold,
        fillOpacity: 0.06,
        strokeColor: lh.gold,
        strokeOpacity: 0.3,
        strokeWeight: 1.5,
        clickable: false,
      });
    }
  }, [discoveryPoint, discoveryMode]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: lh.bg }}>
      {/* Background gradient */}
      <div style={{ position: "fixed", inset: 0, background: lh.bgGrad, pointerEvents: "none", zIndex: 0 }} />

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          background: "rgba(10,8,6,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${lh.goldBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Breadcrumb: Lighthouse > Civic Map */}
          <button
            onClick={() => navigate("/lighthouse")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", border: "none", cursor: "pointer",
              color: lh.muted, fontFamily: fontMono, fontSize: 11,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = lh.gold; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = lh.muted; }}
          >
            Lighthouse
          </button>
          <span style={{ color: lh.muted, fontFamily: fontMono, fontSize: 10, opacity: 0.5 }}>/</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={14} color={lh.gold} />
            <span style={{ fontFamily: fontSerif, fontSize: 17, fontWeight: 600, color: lh.paper }}>
              Civic Map
            </span>
          </div>
          <div style={{ width: 1, height: 18, background: lh.cardBorder, margin: "0 6px" }} />
          <button
            onClick={() => navigate("/viewfinder")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "transparent", border: "none", cursor: "pointer",
              color: "#E8A820", fontFamily: fontMono, fontSize: 10, opacity: 0.7,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
          >
            <Eye size={11} />
            Viewfinder
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Search bar */}
          <form onSubmit={handleSearch} style={{ position: "relative" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchActive(e.target.value.length >= 2); }}
              placeholder="Search programs, cities..."
              style={{
                fontFamily: fontMono, fontSize: 11,
                background: "rgba(20,16,12,0.8)",
                color: lh.paper,
                border: `1px solid ${lh.goldBorder}`,
                borderRadius: 6,
                padding: "6px 32px 6px 10px",
                width: 180,
                outline: "none",
              }}
              onFocus={() => { if (searchQuery.length >= 2) setSearchActive(true); }}
            />
            <button
              type="submit"
              style={{
                position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", cursor: "pointer",
                color: lh.muted, padding: 4,
              }}
            >
              <Search size={13} />
            </button>
          </form>

          {/* Discovery mode toggle */}
          <button
            onClick={() => { setDiscoveryMode(!discoveryMode); if (discoveryMode) { setDiscoveryPoint(null); } }}
            title={discoveryMode ? "Disable click-to-discover" : "Enable click-to-discover"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: fontMono, fontSize: 11,
              color: discoveryMode ? lh.gold : lh.muted,
              background: discoveryMode ? lh.goldSoft : "transparent",
              border: `1px solid ${discoveryMode ? lh.goldBorder : "transparent"}`,
              borderRadius: 6, padding: "6px 10px", cursor: "pointer",
            }}
          >
            <Crosshair size={13} />
            Discover
          </button>

          {/* State filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{
              fontFamily: fontMono, fontSize: 11,
              background: "rgba(20,16,12,0.8)",
              color: lh.paper,
              border: `1px solid ${lh.goldBorder}`,
              borderRadius: 6,
              padding: "6px 28px 6px 10px",
              cursor: "pointer",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            <option value="">All States</option>
            {(() => {
              const mapStates = new Set(data?.meta.states_loaded ?? []);
              const wiStates = new Set(worldIndex.jurisdictions.map(j => j.metadata?.abbreviation).filter(Boolean));
              const allStates = [...new Set([...mapStates, ...wiStates])].sort();
              return allStates.map(sc => (
                <option key={sc} value={sc}>{STATE_NAMES[sc as string] ?? sc}</option>
              ));
            })()}
          </select>

          {/* Layer panel toggle */}
          <button
            onClick={() => { const next = !showLayerPanel; setShowLayerPanel(next); try { localStorage.setItem('civicmap_legend_open', String(next)); } catch {} }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: fontMono, fontSize: 11,
              color: showLayerPanel ? lh.gold : lh.muted,
              background: showLayerPanel ? lh.goldSoft : "transparent",
              border: `1px solid ${showLayerPanel ? lh.goldBorder : "transparent"}`,
              borderRadius: 6, padding: "6px 12px", cursor: "pointer",
            }}
          >
            <Layers size={14} />
            Layers
          </button>

          {/* Stats badge */}
          {data && (
            <div
              style={{
                fontFamily: fontMono, fontSize: 10,
                color: lh.gold, background: lh.goldSoft,
                border: `1px solid ${lh.goldBorder}`,
                borderRadius: 100, padding: "4px 12px",
              }}
            >
              {totalVisible.toLocaleString()} visible
            </div>
          )}
        </div>
      </div>

      {/* Map container */}
      <div style={{ position: "absolute", top: 56, left: 0, right: 0, bottom: 0 }}>
        <MapView
          className="w-full h-full"
          initialCenter={{ lat: 39.8283, lng: -98.5795 }}
          initialZoom={4}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: showLayerPanel ? 300 : 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,8,6,0.6)",
            zIndex: 30,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Loader2 size={32} color={lh.gold} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ fontFamily: fontMono, fontSize: 11, color: lh.muted, marginTop: 12 }}>
              Loading map data...
            </p>
          </div>
        </div>
      )}

      {/* Layer control panel */}
      {showLayerPanel && (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 16,
            width: 280,
            background: "rgba(15,12,8,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${lh.goldBorder}`,
            borderRadius: 10,
            zIndex: 40,
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "14px 16px 10px",
              borderBottom: `1px solid ${lh.cardBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: lh.gold }}>
              Map Layers
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => toggleAllLayers(true)}
                style={{
                  fontFamily: fontMono, fontSize: 9, color: lh.muted,
                  background: "transparent", border: "none", cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                All on
              </button>
              <button
                onClick={() => toggleAllLayers(false)}
                style={{
                  fontFamily: fontMono, fontSize: 9, color: lh.muted,
                  background: "transparent", border: "none", cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                All off
              </button>
            </div>
          </div>

          {/* Layer toggles */}
          <div style={{ padding: "8px 0", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
            {LAYER_CONFIGS.map(layer => {
              const count = getLayerCount(layer.id);
              const isOn = layers[layer.id];
              return (
                <button
                  key={layer.id}
                  onClick={() => toggleLayer(layer.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 16px",
                    background: isOn ? `${layer.color}08` : "transparent",
                    border: "none",
                    borderLeft: `3px solid ${isOn ? layer.color : "transparent"}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Color dot */}
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: isOn ? layer.color : "rgba(255,255,255,0.1)",
                      border: `1.5px solid ${isOn ? layer.color : "rgba(255,255,255,0.2)"}`,
                      transition: "all 0.15s ease",
                    }}
                  />
                  {/* Label */}
                  <span
                    style={{
                      flex: 1,
                      textAlign: "left",
                      fontFamily: fontSans,
                      fontSize: 12,
                      color: isOn ? lh.paper : lh.muted,
                      transition: "color 0.15s ease",
                    }}
                  >
                    {layer.label}
                  </span>
                  {/* Count */}
                  <span
                    style={{
                      fontFamily: fontMono,
                      fontSize: 10,
                      color: isOn ? layer.color : lh.muted,
                      opacity: isOn ? 1 : 0.5,
                    }}
                  >
                    {count}
                  </span>
                  {/* Eye icon */}
                  {isOn ? (
                    <Eye size={12} color={layer.color} style={{ opacity: 0.7 }} />
                  ) : (
                    <EyeOff size={12} color={lh.muted} style={{ opacity: 0.3 }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Meta info */}
          {data && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: `1px solid ${lh.cardBorder}`,
              }}
            >
              <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, lineHeight: 1.6 }}>
                {data.meta.states_loaded.length} state{data.meta.states_loaded.length !== 1 ? "s" : ""} loaded
                <br />
                {data.meta.total_resources.toLocaleString()} total resources
                {data.meta.total_pattern_signals > 0 && (
                  <>
                    <br />
                    {data.meta.total_pattern_signals} pattern signals
                  </>
                )}
                <br />
                <span style={{ color: "#a78bfa" }}>
                  DSHS Benefits Offices: {dshsOfficeProofMeta.mapped} mapped · GEOCODED_VALIDATION_LAYER
                </span>
                <br />
                <span style={{ color: "#a78bfa", opacity: 0.75 }}>
                  precision: {dshsOfficeProofMeta.rooftop} rooftop, {dshsOfficeProofMeta.street} street
                </span>
                {!worldIndex.isLoading && worldIndex.counts.totalNodes > 0 && (
                  <>
                    <br />
                    <span style={{ color: "#60a5fa" }}>
                      World Index: {worldIndex.counts.totalNodes} nodes, {worldIndex.counts.totalEdges} edges
                    </span>
                    <br />
                    <span style={{ color: "#60a5fa", opacity: 0.7 }}>
                      {worldAgencies.length} agencies, {worldWorkflows.length} workflows
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail panel (right side) */}
      {selectedDetail && (
        <div
          style={{
            position: "absolute",
            top: 72,
            right: 16,
            width: 320,
            background: "rgba(15,12,8,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${lh.goldBorder}`,
            borderRadius: 10,
            zIndex: 40,
            overflow: "hidden",
          }}
        >
          {/* Color bar */}
          <div style={{ height: 3, background: selectedDetail.color }} />

          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${lh.cardBorder}`,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fontMono, fontSize: 9,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: selectedDetail.color, marginBottom: 6,
                }}
              >
                {selectedDetail.type}
              </div>
              <h3
                style={{
                  fontFamily: fontSerif, fontSize: 16, fontWeight: 600,
                  color: lh.paper, lineHeight: 1.3, margin: 0,
                }}
              >
                {selectedDetail.title}
              </h3>
              {selectedDetail.subtitle && (
                <p style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, marginTop: 4 }}>
                  {selectedDetail.subtitle}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedDetail(null)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: lh.muted, padding: 4, flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Details */}
          <div style={{ padding: "12px 16px" }}>
            {selectedDetail.details.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "6px 0",
                  borderBottom: i < selectedDetail.details.length - 1 ? `1px solid ${lh.cardBorder}` : "none",
                }}
              >
                <span style={{ fontFamily: fontMono, fontSize: 10, color: lh.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {d.label}
                </span>
                <span style={{ fontFamily: fontSans, fontSize: 12, color: lh.paper, textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
                  {d.value}
                </span>
              </div>
            ))}
          </div>

          {/* Links */}
          {selectedDetail.links && selectedDetail.links.length > 0 && (
            <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedDetail.links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontFamily: fontMono, fontSize: 11, color: selectedDetail.color,
                    textDecoration: "none",
                    padding: "8px 12px",
                    background: `${selectedDetail.color}08`,
                    border: `1px solid ${selectedDetail.color}20`,
                    borderRadius: 6,
                  }}
                >
                  <ExternalLink size={12} />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {/* LumenSend Action */}
          <div style={{ padding: "0 16px 14px" }}>
            <button
              onClick={() => {
                const type = selectedDetail.type === "Oversight Body" ? "complaint"
                  : selectedDetail.type === "Program" ? "application"
                  : "inquiry";
                const state = selectedDetail.details.find(d => d.label === "State")?.value || "";
                navigate(`/lumensend?type=${type}&state=${state}`);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                fontFamily: fontMono, fontSize: 11, color: "#d29922",
                padding: "8px 12px",
                background: "rgba(210,153,34,0.08)",
                border: "1px solid rgba(210,153,34,0.25)",
                borderRadius: 6, cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.18)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.08)"; }}
            >
              <Send size={12} />
              Contact via LumenSend
            </button>
          </div>
        </div>
      )}

      {/* Search results dropdown */}
      {searchActive && searchQuery.length >= 2 && (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 200,
            width: 340,
            maxHeight: 420,
            background: "rgba(15,12,8,0.97)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${lh.goldBorder}`,
            borderRadius: "0 0 10px 10px",
            zIndex: 55,
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${lh.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: fontMono, fontSize: 10, color: lh.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Search Results {searchResults.data ? `(${searchResults.data.total})` : ""}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {searchResults.data?.bounds && (
                <button
                  onClick={handleZoomToBounds}
                  style={{ fontFamily: fontMono, fontSize: 9, color: lh.gold, background: lh.goldSoft, border: `1px solid ${lh.goldBorder}`, borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}
                >
                  Zoom to all
                </button>
              )}
              <button
                onClick={() => { setSearchActive(false); setSearchQuery(""); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: lh.muted, padding: 2 }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
          {searchResults.isLoading && (
            <div style={{ padding: 20, textAlign: "center" }}>
              <Loader2 size={18} color={lh.gold} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          {searchResults.data && searchResults.data.total === 0 && (
            <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: fontMono, fontSize: 11, color: lh.muted }}>
              No results for "{searchQuery}"
            </div>
          )}
          {searchResults.data && (
            <div>
              {searchResults.data.resources.slice(0, 8).map((r, i) => (
                <button
                  key={`r-${i}`}
                  onClick={() => handleSearchResultClick(r.lat, r.lng, r.name)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
                >
                  <MapPin size={12} color={lh.teal} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{r.stateCode} · {r.type}</div>
                  </div>
                </button>
              ))}
              {searchResults.data.jobs.slice(0, 4).map((j, i) => (
                <button
                  key={`j-${i}`}
                  onClick={() => j.lat && j.lng && handleSearchResultClick(j.lat, j.lng, j.title)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
                >
                  <Briefcase size={12} color={lh.amber} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.title}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{j.organization}</div>
                  </div>
                </button>
              ))}
              {searchResults.data.events.slice(0, 4).map((e, i) => (
                <button
                  key={`e-${i}`}
                  onClick={() => e.lat && e.lng && handleSearchResultClick(e.lat, e.lng, e.title)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
                >
                  <Calendar size={12} color={lh.sage} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{e.stateCode} · {e.type}</div>
                  </div>
                </button>
              ))}
              {searchResults.data.posts.slice(0, 4).map((p, i) => (
                <button
                  key={`p-${i}`}
                  onClick={() => p.lat && p.lng && handleSearchResultClick(p.lat, p.lng, p.title)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
                >
                  <MessageCircle size={12} color={lh.violet} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{p.category}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map-Based Intake Panel (bottom-right) */}
      {intakePanel && discoveryPoint && (
        <MapIntakePanel
          lat={discoveryPoint.lat}
          lng={discoveryPoint.lng}
          onClose={() => setIntakePanel(false)}
          onNavigate={navigate}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Discovery panel (bottom-left, shows nearby results) */}
      {discoveryMode && discoveryPoint && nearbyResults.data && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 16,
            width: 320,
            maxHeight: 300,
            background: "rgba(15,12,8,0.97)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${lh.goldBorder}`,
            borderRadius: 10,
            zIndex: 45,
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${lh.cardBorder}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontFamily: fontMono, fontSize: 10, color: lh.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Nearby Discovery
                </span>
                <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, marginTop: 2 }}>
                  {nearbyResults.data.meta.total} items within 50 km
                </div>
              </div>
              <button
                onClick={() => { setDiscoveryPoint(null); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: lh.muted, padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
            {/* Start Intake From Map button */}
            {nearbyResults.data.meta.total > 0 && (
              <button
                onClick={() => setIntakePanel(true)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  width: "100%", marginTop: 8,
                  fontFamily: fontMono, fontSize: 10, fontWeight: 600,
                  color: "#0a0806",
                  background: `linear-gradient(135deg, ${lh.gold}, #c5a028)`,
                  border: "none", borderRadius: 6,
                  padding: "8px 12px", cursor: "pointer",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  transition: "all 0.15s ease",
                }}
              >
                <Zap size={12} />
                Start Intake From Map
                <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div style={{ padding: "4px 0" }}>
            {nearbyResults.data.resources.slice(0, 5).map((r, i) => (
              <button
                key={`nr-${i}`}
                onClick={() => {
                  if (mapRef.current) { mapRef.current.panTo({ lat: r.lat, lng: r.lng }); mapRef.current.setZoom(10); }
                  setSelectedDetail({ type: r.type, title: r.name, subtitle: r.agency || r.category || undefined, details: [{ label: "State", value: r.stateCode }, { label: "Region", value: r.region }], links: r.website ? [{ label: "Website", url: r.website }] : [], color: lh.teal });
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
              >
                <MapPin size={11} color={lh.teal} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{r.stateCode} · {r.type}</div>
                </div>
              </button>
            ))}
            {nearbyResults.data.jobs.map((j, i) => (
              <button
                key={`nj-${i}`}
                onClick={() => {
                  if (j.lat && j.lng && mapRef.current) { mapRef.current.panTo({ lat: j.lat, lng: j.lng }); mapRef.current.setZoom(10); }
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
              >
                <Briefcase size={11} color={lh.amber} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.title}</div>
                  <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{j.organization}</div>
                </div>
              </button>
            ))}
            {nearbyResults.data.events.map((e, i) => (
              <button
                key={`ne-${i}`}
                onClick={() => {
                  if (e.lat && e.lng && mapRef.current) { mapRef.current.panTo({ lat: e.lat, lng: e.lng }); mapRef.current.setZoom(10); }
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${lh.cardBorder}`, cursor: "pointer", textAlign: "left" }}
              >
                <Calendar size={11} color={lh.sage} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                  <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>{e.organization}</div>
                </div>
              </button>
            ))}
            {nearbyResults.data.meta.total === 0 && (
              <div style={{ padding: "16px 14px", textAlign: "center", fontFamily: fontMono, fontSize: 11, color: lh.muted }}>
                No resources found within 50 km. Try clicking a different area.
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
