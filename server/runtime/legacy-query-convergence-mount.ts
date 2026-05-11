import { architectureMapCompatRouter } from '../routers/architecture-map-compat-router';
import { resourceDirectoryCompatRouter } from '../routers/resource-directory-compat-router';
import { legalLibraryCompatRouter } from '../routers/legal-library-compat-router';
import { guidedIntakeCompatRouter } from '../routers/guided-intake-compat-router';
import { missionControlCompatRouter } from '../routers/mission-control-compat-router';

export const legacyQueryConvergenceMount = {
  architectureMap: architectureMapCompatRouter,
  resources: resourceDirectoryCompatRouter,
  legalLibrary: legalLibraryCompatRouter,
  guidedIntake: guidedIntakeCompatRouter,
  missionControl: missionControlCompatRouter,
};

export function getLegacyQueryConvergenceMount() {
  return legacyQueryConvergenceMount;
}
