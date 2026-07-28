import MissionControl from "./MissionControl";

/**
 * Compatibility entry for the established `/mission-control` route.
 *
 * The canonical route renders the complete Mission Control surface. The
 * containment shell remains available as a separate implementation detail and
 * must not replace the operational dashboard.
 */
export default function MissionControlShell() {
  return <MissionControl />;
}
