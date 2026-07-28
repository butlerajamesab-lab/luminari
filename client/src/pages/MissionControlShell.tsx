import MissionControlContainmentShell from "./MissionControlContainmentShell";

/**
 * Canonical /mission-control entry.
 *
 * The overview shell is intentionally bounded. The complete historical
 * Mission Control surface remains available at /mission-control/full, but it
 * must not mount its full operational query fan-out on the canonical entry.
 */
export default function MissionControlShell() {
  return <MissionControlContainmentShell />;
}
