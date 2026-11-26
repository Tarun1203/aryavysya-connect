import { expect, test, type Page } from "@playwright/test";

/** Page errors and anything the Content-Security-Policy blocked, collected per test */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to|Hydration/i.test(m.text())) problems.push(m.text());
  });
  return problems;
}

for (const locale of ["en", "te", "kn", "ta"]) {
  test(`home page in ${locale}`, async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto(`/${locale}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("h1")).toBeVisible();
    // The gotra ribbons and the stats come from the database
    await expect(page.locator(".animate-marquee li").first()).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test("security headers are sent", async ({ page }) => {
  const res = await page.goto("/en");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("members-only pages send visitors to sign in", async ({ page }) => {
  for (const path of ["/en/search", "/en/notifications", "/en/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/en\/login/);
  }
  await expect(page.locator("input[name=email]")).toBeVisible();
});

test("unknown pages show the translated 404", async ({ page }) => {
  const problems = watch(page);
  const res = await page.goto("/te/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toBeVisible();
  expect(problems).toEqual([]);
});
