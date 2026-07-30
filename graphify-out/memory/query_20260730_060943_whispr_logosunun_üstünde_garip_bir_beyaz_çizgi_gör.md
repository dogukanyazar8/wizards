---
type: "query"
date: "2026-07-30T06:09:43.273927+00:00"
question: "Whispr logosunun üstünde garip bir beyaz çizgi görüntülüyorum, bunu düzeltir misin?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["AuthWelcomeBrandMark()", "about-primitives.tsx"]
---

# Q: Whispr logosunun üstünde garip bir beyaz çizgi görüntülüyorum, bunu düzeltir misin?

## Answer

Expanded from original query via graph vocab: [about, auth, brand, identity, logo, welcome, highlighted]. AboutIdentityCard rendered an extra absolute logoHighlight View with a 1px white top border that the login AuthWelcomeBrandMark does not render. Removed that overlay and its style; retained the canonical SVG radial highlight.

## Outcome

- Signal: useful

## Source Nodes

- AuthWelcomeBrandMark()
- about-primitives.tsx