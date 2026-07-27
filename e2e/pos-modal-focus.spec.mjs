/**
 * E2E: POS modal accessibility (Escape close, focus restoration, focus trap).
 *
 * Run with:
 *   node e2e/pos-modal-focus.spec.mjs
 * or via a runner such as `bunx playwright test`. This file is Playwright-
 * flavoured but purposefully executable as a plain Node script so it can be
 * dropped into any harness. It exercises the RefundDialog because it is the
 * simplest POS modal to open programmatically from a URL.
 *
 * Environment:
 *   BASE_URL          default http://localhost:8080
 *   POS_SALE_ID       an existing sale id to open the refund dialog against
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const SALE_ID = process.env.POS_SALE_ID;
if (!SALE_ID) {
  console.warn("POS_SALE_ID not set — skipping.");
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

try {
  // A tiny harness page that renders a single "Open refund" trigger which
  // launches the app's Refund flow via URL param. Real app pages set the sale
  // id via state; the trigger button here stands in for that state change.
  await page.goto(`${BASE}/sales?refund=${SALE_ID}`, { waitUntil: "networkidle" });

  const trigger = page.getByRole("button", { name: /بېرته ورکړه|refund/i }).first();
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  // Focus trap: tabbing repeatedly must never leave the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    assert.equal(inside, true, `focus escaped the dialog after ${i + 1} tabs`);
  }

  // Escape closes the dialog.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  // Focus restored to the original trigger.
  const restored = await page.evaluate(
    (label) => document.activeElement?.textContent?.includes(label),
    "بېرته ورکړه",
  );
  assert.equal(restored, true, "focus was not restored to the opening trigger");

  console.log("PASS: escape closes, focus restored, tab trapped inside dialog");
} finally {
  await browser.close();
}
