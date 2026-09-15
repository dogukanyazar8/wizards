import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RiskyField, RiskyButton, RiskyFooter } from "./risky-field";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

test("expanded account fields use the same typography as settings rows and controls", () => {
  const field = renderToStaticMarkup(
    <RiskyField label="Mevcut parola" testId="field" value="" onChange={() => {}} />,
  );
  const label = field.match(/<label[^>]*>/u)?.[0] ?? "";
  assert.match(label, /font-family:inherit/u);
  assert.ok(label.includes(`font-size:${pxToRem(SETTINGS_METRICS.row.titleFontSize)}`));
  assert.doesNotMatch(label, /text-transform:uppercase|letter-spacing:0\.1em/u);
  const input = field.match(/<input[^>]*>/u)?.[0] ?? "";
  assert.match(input, /font-family:inherit/u);
  assert.ok(input.includes(`font-size:${pxToRem(SETTINGS_METRICS.controls.input.fontSize)}`));
  const button = renderToStaticMarkup(
    <RiskyButton label="Kaydet" testId="button" onClick={() => {}} />,
  );
  assert.ok(button.includes(`font-size:${pxToRem(SETTINGS_METRICS.controls.action.fontSize)}`));
  const footer = renderToStaticMarkup(<RiskyFooter help="Açıklama">{null}</RiskyFooter>);
  assert.ok(footer.includes(`font-size:${pxToRem(SETTINGS_METRICS.row.subFontSize)}`));
});
