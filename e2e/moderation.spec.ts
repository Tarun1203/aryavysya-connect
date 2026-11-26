import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Moderation end to end, on the local test database: the language filter on the person form, a
 * member's report, and a moderator resolving it. Logins are the local test accounts in .env.localdb.
 */
const env = readFileSync(".env.localdb", "utf8");
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
// Ravi Kumar Kotha, a demo member in the local seed data
const RAVI = "cmvnytfys004pxk28pq3bslpw";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login")), page.click("form button")]);
}

// One flow, in order, on one browser profile
test.describe.configure({ mode: "serial" });
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !!isMobile, "runs once, on desktop");

test("the filter, a member's report and a moderator's decision", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, get("SEED_ADMIN_EMAIL"), get("SEED_ADMIN_PASSWORD"));

  // 1. An abusive word in the notes is refused, and nothing is saved
  await admin.goto(`/en/person/${RAVI}/edit`);
  const notes = admin.locator("textarea[name=notes]");
  const original = await notes.inputValue();
  await notes.fill("He is a b1tch");
  await admin.locator("form").last().locator("button:not([type=button])").last().click();
  await expect(admin.getByText(/Please remove the offensive words from: Notes/)).toBeVisible();

  // 2. A word that may be innocent is saved, and goes to the moderators
  await notes.fill("Known as dick at school");
  await Promise.all([admin.waitForURL(new RegExp(`/person/${RAVI}$`)), admin.locator("form").last().locator("button:not([type=button])").last().click()]);
  await admin.goto("/en/admin/moderation");
  const filtered = admin.locator("li", { hasText: "Language filter" }).filter({ hasText: "Ravi Kumar Kotha" }).first();
  await expect(filtered).toContainText("“dick” in notes");

  // 3. A member reports the record; a second report is turned away
  const member = await (await browser.newContext()).newPage();
  await signIn(member, "ravi@example.com", get("SEED_DEMO_PASSWORD"));
  await member.goto(`/en/person/${RAVI}`);
  const report = async () => {
    await member.getByText("Report this record").click();
    await member.selectOption("select[name=reason]", "PRIVACY");
    await member.fill("textarea[name=note]", "My phone number was in the notes earlier");
    await member.getByRole("button", { name: "Send report" }).click();
  };
  await report();
  await expect(member.getByText("Saved")).toBeVisible();
  await member.reload();
  await report();
  await expect(member.getByText(/already reported this record/)).toBeVisible();

  // 4. The moderator resolves it; the member is told the outcome
  await admin.goto("/en/admin/moderation");
  const fromMember = admin.locator("li", { hasText: "Reported by Ravi Kumar Kotha" }).filter({ hasText: "Details that shouldn't be shown" }).first();
  await expect(fromMember).toContainText("My phone number was in the notes earlier");
  await fromMember.getByLabel("Resolved – something was changed").check();
  await fromMember.locator("textarea[name=resolution]").fill("The notes were cleaned up");
  await fromMember.getByRole("button", { name: "Save decision" }).click();
  await expect(admin.locator("li", { hasText: "Reported by Ravi Kumar Kotha" }).filter({ hasText: "My phone number" })).toHaveCount(0);

  await member.goto("/en/notifications");
  await expect(member.locator("main li").first()).toContainText(/Your report R-\d{6}: Resolved – The notes were cleaned up/);

  // Leave the data as it was: dismiss the filter's report and restore the notes
  await admin.goto("/en/admin/moderation");
  const stillOpen = admin.locator("li", { hasText: "Language filter" }).filter({ hasText: "Ravi Kumar Kotha" }).first();
  await stillOpen.getByLabel("Dismiss – nothing wrong").check();
  await stillOpen.locator("textarea[name=resolution]").fill("Test data");
  await stillOpen.getByRole("button", { name: "Save decision" }).click();
  await admin.goto(`/en/person/${RAVI}/edit`);
  await admin.locator("textarea[name=notes]").fill(original);
  await Promise.all([admin.waitForURL(new RegExp(`/person/${RAVI}$`)), admin.locator("form").last().locator("button:not([type=button])").last().click()]);
});
