import { test, expect } from "@playwright/test";

// API-free UI smoke: an unauthenticated visit lands on the auth screen, which
// must render the credential form. This catches build/bundle/runtime breakage
// (blank screen, crashing root render) that unit tests in jsdom can miss.
test.describe("auth screen", () => {
  test("renders the sign-in form for an unauthenticated visitor", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("keeps email input editable", async ({ page }) => {
    await page.goto("/");
    const email = page.locator('input[type="email"]');
    await email.fill("tester@example.com");
    await expect(email).toHaveValue("tester@example.com");
  });
});

// French is the product default: a browser in a language the app doesn't
// speak gets French on first paint, not English.
test.describe("default language", () => {
  test.use({ locale: "de-DE" });

  test("serves French to a browser in an unsupported language", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByText("Gestionnaire de garanties & inventaire").first()
    ).toBeVisible();
  });
});
