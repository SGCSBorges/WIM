import { test, expect, type Page } from "@playwright/test";

/**
 * Responsive overflow guard. Catches the regression static review can't: an
 * element wider than the viewport that forces horizontal page scroll. We assert
 * the document never scrolls horizontally, and on failure name the offending
 * elements so a break is easy to localize.
 *
 * Scope: the API-free public screens (the e2e harness serves the static build
 * with no backend, so authed views aren't reachable here). This still exercises
 * the global layout shell, the auth hero/form, and the password flows across
 * phone → desktop widths.
 */

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 720 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;

const PUBLIC_PAGES = ["/", "/auth/forgot", "/auth/reset"] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const limit = doc.clientWidth + 1; // +1 tolerates sub-pixel rounding
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((el) => el.getBoundingClientRect().right > limit)
      .slice(0, 5)
      .map((el) => {
        const cls = typeof el.className === "string" ? el.className.trim() : "";
        const short = cls.split(/\s+/).slice(0, 3).join(".");
        return short
          ? `${el.tagName.toLowerCase()}.${short}`
          : el.tagName.toLowerCase();
      });
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      offenders,
    };
  });

  expect(
    result.scrollWidth,
    `Horizontal overflow (${result.scrollWidth}px > ${result.clientWidth}px). Offenders: ${
      result.offenders.join(", ") || "none found"
    }`
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    for (const path of PUBLIC_PAGES) {
      test(`no horizontal overflow on ${path}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(path, { waitUntil: "networkidle" });
        // Wait for the React tree to paint something interactive.
        await page.locator("#root :is(input, button, h1)").first().waitFor();
        await expectNoHorizontalOverflow(page);
      });
    }
  });
}
