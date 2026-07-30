import type { DemoDataSummary } from "@repo/db";

export function printDemoDataSummary(summary: DemoDataSummary): void {
  console.info("Approved demo data row counts:");
  console.info(JSON.stringify(summary, null, 2));
}
