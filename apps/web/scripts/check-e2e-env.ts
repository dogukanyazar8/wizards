import {
  formatE2EEnvironmentValidation,
  validateE2EEnvironment,
} from "../src/lib/e2e/environment";

const validation = validateE2EEnvironment(process.env);
const report = formatE2EEnvironmentValidation(validation);

if (!validation.ok) {
  console.error(report);
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn(report);
} else {
  console.info(report);
}
