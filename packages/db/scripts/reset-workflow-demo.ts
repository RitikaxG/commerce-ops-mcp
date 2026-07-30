import { resetWorkflowDemoData } from "../testing.js";

const counts = await resetWorkflowDemoData();
console.log(JSON.stringify({ workflowDemoReset: true, counts }, null, 2));
