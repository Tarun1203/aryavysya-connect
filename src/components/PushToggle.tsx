"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/actions/notify";

/** VAPID public key (base64url) as the bytes the browser wants */
const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

type State = "unsupported" | "blocked" | "off" | "on" | "busy";

/**
 * Turn browser push on or off for this browser. The browser asks the member first; nothing is
 * subscribed without that. The service worker (public/sw.js) only shows the notification.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const t = useTranslations("notify");
  const [state, setState] = useState<State>("busy");

  useEffect(() => {
    let live = true;
    const check = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      return sub ? "on" : "off";
    };
    check()
      .then((s) => live && setState(s))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const { ok } = await savePushSubscriptionAction(JSON.stringify(sub));
      setState(ok ? "on" : "off");
    } catch {
      setState("off");
    }
  };

  const turnOff = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  };

  if (state === "unsupported") return <p className="text-xs text-muted">{t("pushUnsupported")}</p>;
  if (state === "blocked") return <p className="text-xs text-muted">{t("pushBlocked")}</p>;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={state === "on" ? turnOff : turnOn}
      className="self-start rounded-xl border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft disabled:opacity-50"
    >
      {state === "on" ? t("pushOff") : t("pushOn")}
    </button>
  );
}
