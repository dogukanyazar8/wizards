---
type: "query"
date: "2026-08-24T16:07:48.524549+00:00"
question: "Anasayfadaki arkadaşlar alanında tümü butonuna tıklayınca splash screen halen daha geliyor, bunu tekrar kontrol edip sorunu çözer misin yan etkiye sebebiyet vermeden?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["HomeFriendsStrip()", "MessagesFriendsLoading()"]
---

# Q: Anasayfadaki arkadaşlar alanında tümü butonuna tıklayınca splash screen halen daha geliyor, bunu tekrar kontrol edip sorunu çözer misin yan etkiye sebebiyet vermeden?

## Answer

Expanded from original query via graph vocab: [home, friends, link, route, router, navigation, messages, splash]. HomeFriendsStrip already uses Next Link to /messages/friends. Root cause was the missing nearest App Router loading boundary: dynamic route navigation fell through to (main)/loading.tsx and rendered AppStartupScreen. Added route-local messages/friends/loading.tsx with an accessible regional skeleton and reduced-motion handling; startup and other routes remain unchanged.

## Outcome

- Signal: useful

## Source Nodes

- HomeFriendsStrip()
- MessagesFriendsLoading()