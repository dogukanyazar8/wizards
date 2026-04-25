import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./src/lib/socket/server.js";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handler = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || "3000");

app.prepare().then(() => {
  const httpServer = createServer(handler);
  initSocketServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
});
