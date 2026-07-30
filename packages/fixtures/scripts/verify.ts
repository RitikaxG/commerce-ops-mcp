import { verifyApprovedDemoData } from "../persistence.js";
import { printDemoDataSummary } from "./output.js";

try {
  const { summary } = await verifyApprovedDemoData();
  printDemoDataSummary(summary);
} catch (error) {
  console.error("Demo verification failed.");
  console.error(error);
  process.exitCode = 1;
}
