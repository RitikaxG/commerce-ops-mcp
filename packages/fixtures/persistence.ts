import {
  getDemoDataSummary,
  readDemoCommerceData,
  resetDemoData,
  seedDemoData,
  type DemoDataSummary,
} from "@repo/db";
import type { CommerceFixtureSet } from "@repo/schemas";

import { commerceFixtures } from "./commerce.js";
import { approvedScenarioManifest } from "./manifest.js";
import { validateApprovedDemoData } from "./validation.js";

export function validateCurrentApprovedDemoData(): CommerceFixtureSet {
  return validateApprovedDemoData(commerceFixtures, approvedScenarioManifest)
    .fixtures;
}

export async function seedApprovedDemoData(): Promise<DemoDataSummary> {
  const fixtures = validateCurrentApprovedDemoData();
  return seedDemoData(fixtures);
}

export async function resetApprovedDemoData(): Promise<DemoDataSummary> {
  const fixtures = validateCurrentApprovedDemoData();
  return resetDemoData(fixtures);
}

export async function verifyApprovedDemoData(): Promise<{
  fixtures: CommerceFixtureSet;
  summary: DemoDataSummary;
}> {
  const fixtures = validateCurrentApprovedDemoData();
  const [persistedFixtures, summary] = await Promise.all([
    readDemoCommerceData(fixtures),
    getDemoDataSummary(fixtures),
  ]);

  return {
    fixtures: persistedFixtures,
    summary,
  };
}
