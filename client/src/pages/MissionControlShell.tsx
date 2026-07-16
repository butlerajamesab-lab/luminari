import MissionControl from "./MissionControl";


/**
 * Compatibility entry for the historical `/mission-control` route.
 *
 * The canonical route renders the established full Mission Control surface.
 * The former containment shell remains available separately for explicit
 * diagnostic use only.
 */
export default function MissionControlShell() {
  return <MissionControl />;
}
