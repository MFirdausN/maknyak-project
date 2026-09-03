import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";

test("dashboard exposes the platform domains and version", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /Foundation v0\.1/);
  assert.match(html, /Identity/);
  assert.match(html, /Workspace/);
  assert.match(html, /AI/);
});
