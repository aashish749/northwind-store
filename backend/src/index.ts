import "dotenv/config";
import express from "express";
import cors from "cors";

import fs from "node:fs";
import path from "node:path";

import { clerkMiddleware } from "@clerk/express";
import { clerkWebhookHandler } from "./webhooks/clerk";
import { getEnv } from "./lib/env";
import keepAliveCron from "./lib/cron";

import productRouter from "./routes/productRouter";
import meRouter from "./routes/meRouter";
import streamRouter from "./routes/streamRouter";
import chekoutRouter from "./routes/chekoutRouter";
import adminRouter from "./routes/adminRouter";
import orderRouter from "./routes/orderRouter";

const env = getEnv();
const app = express();

// 1. PLACE CORS AT THE VERY TOP
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// 2. RAW BODY PARSER FOR WEBHOOKS (Mounted before standard json parsing)
const rawJson = express.raw({ type: "application/json", limit: "1mb" });
app.post("/webhooks/clerk", rawJson, (req, res) => {
  void clerkWebhookHandler(req, res);
});

// 3. STANDARD JSON BODY PARSER FOR REGULAR ROUTES
app.use(express.json());

// 4. CLERK AUTH MIDDLEWARE (Intercepts regular routes below it)
app.use(clerkMiddleware());

// 5. PUBLIC HEALTH CHECK
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// 6. ROUTERS
app.use("/api/me", meRouter);
app.use("/api/products", productRouter);
app.use("/api/stream", streamRouter);
app.use("/api/checkout", chekoutRouter);
app.use("/api/admin", adminRouter);
app.use("/api/orders", orderRouter);

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get("/{*any}", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (req.path.startsWith("/api") || req.path.startsWith("/webhooks")) {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
  });
}

app.use(
  (
    _err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(500).json({
      error: "Internal server error",
    });
  },
);

app.listen(env.PORT, () => {
  console.log("Listening on port:", env.PORT);
  if (env.NODE_ENV === "production") {
    keepAliveCron.start();
  }
});
