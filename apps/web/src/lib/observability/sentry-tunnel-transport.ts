import { Agent, request } from "node:https";

// Dedicated pool: telemetry cannot consume the application's outbound socket budget.
const agent = new Agent({
  keepAlive: true,
  maxSockets: 8,
  maxTotalSockets: 8,
  maxFreeSockets: 2,
  timeout: 10_000,
});

export type SentryTunnelResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
};

export function postSentryEnvelope(
  target: URL,
  body: Buffer,
  signal: AbortSignal,
): Promise<SentryTunnelResult> {
  return new Promise((resolve, reject) => {
    const upstream = request(
      target,
      {
        method: "POST",
        agent,
        // Sentry's allowlisted ingest hosts support IPv4. Railway's public IPv6
        // egress is opt-in; keep this choice local to telemetry, not global DNS.
        family: 4,
        signal,
        headers: {
          "content-type": "application/x-sentry-envelope",
          "content-length": body.byteLength,
        },
      },
      (response) => {
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > 65_536) {
            response.destroy(new Error("Sentry response exceeded its size limit"));
          }
        });
        response.once("error", reject);
        response.once("end", () =>
          resolve({ status: response.statusCode ?? 502, headers: response.headers }),
        );
        // Drain a bounded response for keep-alive reuse. Never reflect its body,
        // cookies or redirects to the browser. No automatic POST retries.
      },
    );
    upstream.once("error", reject);
    upstream.end(body);
  });
}
