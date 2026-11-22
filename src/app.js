import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFound, requestId } from "./middlewares/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { uploadsRoot } from "./services/storage/localStorage.js";

/**
 * The whole HTTP pipeline, without a port: server.js listens on it, the tests drive it
 * in-process. The database must already be connected.
 */
export function createApp() {
    const app = express();

    app.disable("x-powered-by");

    // Behind a reverse proxy the request arrives from the proxy's address, and the rate
    // limiter needs the *client's*. Off unless BEHIND_REVERSE_PROXY is set: honouring
    // X-Forwarded-For from an untrusted caller lets them pick the address they are counted
    // under. One hop is trusted - the proxy in front, and nothing behind it.
    if (env.behindReverseProxy) app.set("trust proxy", 1);

    app.use(requestId);

    // Uploaded images are meant to be shown by a web app on another origin in development
    // (the dev server proxies them in practice), so they are not locked to this origin.
    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

    // Open on purpose. The API authenticates with a bearer token the client attaches
    // itself, never with a cookie, so another origin gains nothing a script outside a
    // browser does not already have. The React app is served from the same origin anyway
    // (the dev server and nginx both proxy /api), so no cross-origin request is made at all.
    app.use(cors());

    if (!env.isTest) app.use(morgan(env.isProduction ? "combined" : "dev"));

    app.use(express.json({ limit: "1mb" }));

    // Liveness for the container orchestrator: deliberately anonymous, and deliberately
    // says nothing about the app beyond "the process is answering".
    app.get("/health", (req, res) => res.json({ status: "ok" }));

    // Locally stored files (services/storage/localStorage.js).
    app.use("/uploads", express.static(uploadsRoot, { index: false, dotfiles: "deny" }));

    app.use("/api/v1", apiRouter);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}
