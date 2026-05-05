import { createServer } from "http";
import next from "next";
import { assertWebEnvironment } from "./src/lib/env.js";
import { initSocketServer } from "./src/lib/socket/server.js";

try {
  process.loadEnvFile();
} catch {
  // Next will still pick up shell-provided env vars in development.
}

const dev = process.env.NODE_ENV !== "production";
assertWebEnvironment(process.env, dev ? "development" : "production");

const app = next({ dev });
const handler = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || "3000");

app.prepare().then(() => {
  const httpServer = createServer(handler);
  initSocketServer(httpServer);
  httpServer.listen(PORT, () => {
    console.info(`Server running on http://localhost:${PORT}`);
  });
});
