import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, channelsFor, escapeHtml, groupOf, safeLink } from "./notify-core";

test("every kind belongs to one group", () => {
  assert.deepEqual(KINDS.filter((k) => groupOf(k) === "requests"), ["CLAIM_SUBMITTED", "CHANGE_PROPOSED", "MARRIAGE_PROPOSED", "REPORT_FILED"]);
  assert.equal(groupOf("CLAIM_APPROVED"), "decisions");
});

test("channels follow the settings, and only what is set up", () => {
  const all = { email: true, push: true };
  // Defaults: email for answers only, push for both
  assert.deepEqual(channelsFor("CLAIM_APPROVED", null, all), { email: true, push: true });
  assert.deepEqual(channelsFor("CLAIM_SUBMITTED", null, all), { email: false, push: true });
  const quiet = { emailRequests: false, emailDecisions: false, pushRequests: false, pushDecisions: true };
  assert.deepEqual(channelsFor("MARRIAGE_PROPOSED", quiet, all), { email: false, push: false });
  assert.deepEqual(channelsFor("MARRIAGE_ACCEPTED", quiet, all), { email: false, push: true });
  assert.deepEqual(channelsFor("CLAIM_APPROVED", null, { email: false, push: false }), { email: false, push: false }, "no mail server, no push keys");
});

test("links stay inside the site", () => {
  assert.equal(safeLink("/person/abc"), "/person/abc");
  assert.equal(safeLink("https://evil.example"), null);
  assert.equal(safeLink("//evil.example"), null);
  assert.equal(safeLink("/\\evil.example"), null);
  assert.equal(safeLink(null), null);
});

test("email HTML is escaped", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});
