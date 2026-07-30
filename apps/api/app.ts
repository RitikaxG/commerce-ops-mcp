import express from "express";

import { notFoundMiddleware } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.disable("x-powered-by");
app.use("/health", healthRouter);
app.use(notFoundMiddleware);
