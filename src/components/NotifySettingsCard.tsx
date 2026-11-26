import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { emailConfigured, pushConfigured } from "@/lib/notify";
import { DEFAULT_SETTINGS } from "@/lib/notify-core";
import { saveNotifySettingsAction, removePushSubscriptionAction } from "@/app/actions/notify";
import { ActionForm } from "./ActionForm";
import { Card } from "./ui";
import { PushToggle } from "./PushToggle";

/** Account page: how this member hears about things, by email and browser push, per group. */
export async function NotifySettingsCard({ user }: { user: SessionUser }) {
  const t = await getTranslations("notify");
  const [saved, browsers] = await Promise.all([
    db.notificationSettings.findUnique({ where: { userId: user.id } }),
    db.pushSubscription.findMany({ where: { userId: user.id }, select: { id: true, device: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const s = saved ?? DEFAULT_SETTINGS;
  const email = emailConfigured();
  const push = pushConfigured();
  const box = (name: keyof typeof DEFAULT_SETTINGS, label: string, disabled: boolean) => (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" name={name} defaultChecked={s[name]} disabled={disabled} className="size-4 accent-[var(--brand)]" />
      {label}
    </label>
  );

  return (
    <Card id="notifications" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="font-semibold">{t("settingsTitle")}</h2>
      <p className="text-sm text-muted">{t("settingsIntro")}</p>
      <ActionForm action={saveNotifySettingsAction} submit={t("save")} variant="ghost">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{t("byEmail", { email: user.email })}</legend>
            {box("emailRequests", t("groupRequests"), !email)}
            {box("emailDecisions", t("groupDecisions"), !email)}
            {!email && <p className="text-xs text-muted">{t("emailNotSetUp")}</p>}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{t("byPush")}</legend>
            {box("pushRequests", t("groupRequests"), !push)}
            {box("pushDecisions", t("groupDecisions"), !push)}
            {!push && <p className="text-xs text-muted">{t("pushNotSetUp")}</p>}
          </fieldset>
        </div>
      </ActionForm>
      {push && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
          <p className="text-muted">{t("pushThisBrowser")}</p>
          <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY!} />
          {browsers.length > 0 && (
            <ul className="flex flex-col gap-1">
              {browsers.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-1.5">
                  <span>{b.device ?? t("unknownBrowser")}</span>
                  <form action={removePushSubscriptionAction.bind(null, b.id)}>
                    <button className="text-xs text-muted hover:text-bad">{t("pushRemove")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-muted">{t("privacyNote")}</p>
    </Card>
  );
}
