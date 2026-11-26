import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Live updates between two people, on the local test database: the admin's bell updates the moment
 * a member reports a record, and a member looking at a record sees the banner when the admin edits
 * it. Neither page is reloaded. Logins are the local test accounts in .env.localdb.
 */
const env = readFileSync(".env.localdb", "utf8");
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const RAVI = "cmvnytfys004pxk28pq3bslpw";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login")), page.click("form button")]);
}

/** Open a page and wait until its live stream is connected (a stream never finishes, so wait for its headers) */
async function openLive(page: Page, path: string) {
  const stream = page.waitForResponse((r) => r.url().includes("/api/events"), { timeout: 60_000 });
  await page.goto(path);
  const res = await stream;
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/event-stream");
  // Give the server a moment to subscribe the stream to its topics
  await page.waitForTimeout(1500);
}

test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !!isMobile, "runs once, on desktop");

test("the bell and a record update live, without a reload", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  const member = await (await browser.newContext()).newPage();
  await signIn(admin, get("SEED_ADMIN_EMAIL"), get("SEED_ADMIN_PASSWORD"));
  await signIn(member, "ravi@example.com", get("SEED_DEMO_PASSWORD"));

  // 1. The admin is on the home page; the member reports a record
  await openLive(admin, "/en");
  const bell = admin.locator('header a[href$="/notifications"]').first();
  const before = Number(((await bell.getAttribute("aria-label")) ?? "").match(/^(\d+)/)?.[1] ?? 0);
  // Marks the admin's page, so a reload would be noticed
  await admin.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));

  await member.goto(`/en/person/${RAVI}`);
  await member.getByText("Report this record").click();
  await member.selectOption("select[name=reason]", "OTHER");
  await member.fill("textarea[name=note]", "Live update test");
  await member.getByRole("button", { name: "Send report" }).click();
  await expect(member.getByText("Saved")).toBeVisible();

  await expect(admin.getByRole("status").filter({ hasText: "You have a new notification" })).toBeVisible({ timeout: 20_000 });
  await expect(bell).toHaveAttribute("aria-label", new RegExp(`^${before + 1} unread`), { timeout: 20_000 });
  expect(await admin.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);

  // 2. The member looks at the record; the admin edits it
  await openLive(member, `/en/person/${RAVI}`);
  await member.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
  await admin.goto(`/en/person/${RAVI}/edit`);
  const occupation = admin.locator("input[name=occupation]");
  const original = await occupation.inputValue();
  await occupation.fill(`${original || "Teacher"} (live test)`);
  await Promise.all([admin.waitForURL(new RegExp(`/person/${RAVI}$`)), admin.locator("form").last().locator("button:not([type=button])").last().click()]);

  const banner = member.getByRole("status").filter({ hasText: "Someone has just changed this record." });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  expect(await member.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
  await banner.getByRole("button", { name: "Show the changes" }).click();
  await expect(member.getByText("(live test)").first()).toBeVisible();

  // The editor's own page shows no banner for their own change
  await expect(admin.getByText("Someone has just changed this record.")).toHaveCount(0);

  // Leave the data as it was: restore the occupation, dismiss the test report
  await admin.goto(`/en/person/${RAVI}/edit`);
  await admin.locator("input[name=occupation]").fill(original);
  await Promise.all([admin.waitForURL(new RegExp(`/person/${RAVI}$`)), admin.locator("form").last().locator("button:not([type=button])").last().click()]);
  await admin.goto("/en/admin/moderation");
  const report = admin.locator("li", { hasText: "Live update test" }).first();
  await report.getByLabel("Dismiss – nothing wrong").check();
  await report.locator("textarea[name=resolution]").fill("Test data");
  await report.getByRole("button", { name: "Save decision" }).click();
  await expect(admin.locator("li", { hasText: "Live update test" })).toHaveCount(0);
});
