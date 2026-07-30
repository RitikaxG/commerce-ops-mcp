// Typed synthetic cases and seed helpers begin in later accepted phases.
export { commerceFixtures } from "./commerce.js";
export { approvedOrderIds, approvedScenarioManifest } from "./manifest.js";
export {
  resetApprovedDemoData,
  seedApprovedDemoData,
  validateCurrentApprovedDemoData,
  verifyApprovedDemoData,
} from "./persistence.js";
export {
  DEMO_REFERENCE_TIME,
  EXPECTED_PROCESSING_WINDOW_MINUTES,
  isInsideExpectedProcessingWindow,
} from "./reference-time.js";
export {
  FixtureValidationError,
  validateApprovedDemoData,
  validateFixtureRelationships,
  validateFixtureShapes,
} from "./validation.js";
