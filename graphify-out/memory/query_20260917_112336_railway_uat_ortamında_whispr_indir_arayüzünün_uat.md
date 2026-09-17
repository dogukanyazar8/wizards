---
type: "query"
date: "2026-09-17T11:23:36.728193+00:00"
question: "Railway UAT ortamında Whispr indir arayüzünün UAT bölümüne Cloudflare R2 latest UAT Windows build bağlantısı nasıl eklenir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WHISPR_DESKTOP_DOWNLOAD_URL", "desktop-download.ts", "download-catalog-service.ts", "AdminDownloads", "desktopDownloadRoute"]
---

# Q: Railway UAT ortamında Whispr indir arayüzünün UAT bölümüne Cloudflare R2 latest UAT Windows build bağlantısı nasıl eklenir?

## Answer

Expanded graph terms: WHISPR_DESKTOP_DOWNLOAD_URL desktop-download release uat windows R2 manifest latest. Existing implementation is DB-backed through /admin/downloads; environment variables alone do not populate the modal. Recommended always-latest flow: set UAT whispr-web WHISPR_RELEASE_CHANNEL=uat, WHISPR_DESKTOP_DOWNLOAD_MANIFEST_URL=https://updates.whispr.team/desktop/uat/latest.json, replace stale NEXT_PUBLIC_WHISPR_DESKTOP_DOWNLOAD_URL with the UAT app /api/v1/desktop/download route, redeploy, then create or edit the UAT/WINDOWS/DIRECT DownloadArtifact in /admin/downloads using the same redirect URL and publish it. The redirect resolves the signed latest.json platforms.windows-x86_64.url and caches it 60 seconds. Current live manifest is version 0.9.0, tag v0.9.0-uat.26, artifact size 4085336 bytes. Do not use latest.json itself as the user download link.

## Outcome

- Signal: useful

## Source Nodes

- WHISPR_DESKTOP_DOWNLOAD_URL
- desktop-download.ts
- download-catalog-service.ts
- AdminDownloads
- desktopDownloadRoute