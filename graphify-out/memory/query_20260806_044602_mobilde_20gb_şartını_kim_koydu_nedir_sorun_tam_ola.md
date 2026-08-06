---
type: "query"
date: "2026-08-06T04:46:02.695085+00:00"
question: "mobilde 20gb şartını kim koydu nedir sorun tam olarak?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["workflow", "runner", "mobile", "release"]
---

# Q: mobilde 20gb şartını kim koydu nedir sorun tam olarak?

## Answer

Expanded via graph vocabulary: mobile release runner temp android build workflow storage github hosted self. Git history attributes the 20 GiB RUNNER_TEMP preflight guard to unsigned commit fb7b1d08 by Whispr Quality <quality@whispr.invalid>. It is a repository-specific safety floor, not a documented Expo requirement. It checks free space before eas build --local because the build copies the project into temporary storage and produces duplicated dependencies plus Gradle/CMake native outputs. Exact 20 GiB is not justified by a measurement in source or commit history. Standard GitHub-hosted runners advertise 14 GB SSD, so the unchanged guard cannot pass there. Historical run 30561914929 passed preflight and later failed on missing Sentry auth token, not disk.

## Outcome

- Signal: useful

## Source Nodes

- workflow
- runner
- mobile
- release