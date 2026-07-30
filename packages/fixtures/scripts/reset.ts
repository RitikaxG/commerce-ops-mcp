import { resetApprovedDemoData } from "../persistence.js";
import { printDemoDataSummary } from "./output.js";

console.info(
  "Non-production helper: resetting only the nine approved demo orders and their generated workflow records.",
);

try {
  const summary = await resetApprovedDemoData();
  printDemoDataSummary(summary);
} catch (error) {
  console.error("Demo reset failed; the transaction was rolled back.");
  console.error(error);
  process.exitCode = 1;
}
