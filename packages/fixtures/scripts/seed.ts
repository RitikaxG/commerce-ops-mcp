import { seedApprovedDemoData } from "../persistence.js";
import { printDemoDataSummary } from "./output.js";

try {
  const summary = await seedApprovedDemoData();
  printDemoDataSummary(summary);
} catch (error) {
  console.error("Demo seed failed; the transaction was rolled back.");
  console.error(error);
  process.exitCode = 1;
}
