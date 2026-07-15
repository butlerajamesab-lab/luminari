import MissionControl from "./MissionControl";

/**
 * Compatibility entry for the historical `/mission-control` route.
 *
 * The canonical route must render the established full Mission Control surface.
 * The former containment shell is preserved separately as
 * `MissionControlContainmentShell.tsx` for explicit diagnostic use only.
 */
export default function MissionControlShell() {
  return <MissionControl />;
}
