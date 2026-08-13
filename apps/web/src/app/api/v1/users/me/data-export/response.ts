export function createAccountDataExportResponse(stream: ReadableStream<Uint8Array>, now: Date) {
  const date = now.toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="whispr-data-export-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
