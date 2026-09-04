import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";

test("dashboard exposes the secure tenancy console shell", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /Phase 1/);
  assert.match(html, /Memeriksa sesi/);
  assert.match(html, /Maknyak Platform/);
});
