import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "NOT_FOUND" });
};
