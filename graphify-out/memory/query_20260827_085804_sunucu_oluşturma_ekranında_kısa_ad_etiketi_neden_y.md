---
type: "query"
date: "2026-08-27T08:58:04.374016+00:00"
question: "Sunucu oluşturma ekranında kısa ad etiketi neden yazarken dikey oynuyor ve hangi bileşen düzeltilmeli?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CreateServerModal()", "Input"]
---

# Q: Sunucu oluşturma ekranında kısa ad etiketi neden yazarken dikey oynuyor ve hangi bileşen düzeltilmeli?

## Answer

Expanded from original query via vocab: [server, create, short, name, input, field, label, prefix, abbreviation, modal, form, workspace]. CreateServerModal içindeki 128 px kısa-ad başlığı ek Zorunlu rozeti nedeniyle sıkışıp iki satıra kırılıyordu. Referans yapısına dönülerek rozet kaldırıldı ve FieldHeader etiketi tek satıra sabitlendi; 3 karakter doğrulaması korunuyor.

## Outcome

- Signal: useful

## Source Nodes

- CreateServerModal()
- Input