"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/*
 * Live updates in the browser: one EventSource per page (/api/events), shared by every component
 * that listens. A person page adds its record, so the stream also carries changes to it. The
 * browser reconnects on its own if the line drops (the server asks for a 10-second wait).
 */
type Live = { type: string; topic: string; by?: string };
const handlers = new Set<(e: Live) => void>();
const people = new Map<string, number>();
let source: EventSource | null = null;
let url = "";

function sync() {
  if (!handlers.size) {
    source?.close();
    source = null;
    url = "";
    return;
  }
  const person = [...people.keys()][0];
  const next = `/api/events${person ? `?person=${encodeURIComponent(person)}` : ""}`;
  if (source && next === url) return;
  source?.close();
  url = next;
  source = new EventSource(next);
  for (const type of ["notification", "person-changed"]) {
    source.addEventListener(type, (ev) => {
      let data: Omit<Live, "type">;
      try {
        data = JSON.parse((ev as MessageEvent).data);
      } catch {
        return;
      }
      handlers.forEach((h) => h({ ...data, type }));
    });
  }
}

/** Call `onEvent` for each live event on this page; `person` adds that record's changes. */
function useLive(onEvent: (e: Live) => void, person?: string) {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => {
    const h = (e: Live) => ref.current(e);
    handlers.add(h);
    if (person) people.set(person, (people.get(person) ?? 0) + 1);
    sync();
    return () => {
      handlers.delete(h);
      if (person) {
        const n = (people.get(person) ?? 1) - 1;
        if (n) people.set(person, n);
        else people.delete(person);
      }
      sync();
    };
  }, [person]);
}

/**
 * The bell, kept current: on a new notification the page's server parts are fetched again (the
 * count, the list) and a short message appears. Reading one on another device updates it too.
 */
export function LiveBell({ me }: { me: string }) {
  const t = useTranslations("live");
  const router = useRouter();
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive((e) => {
    if (e.type !== "notification") return;
    // Several at once become one refresh
    if (refresh.current) clearTimeout(refresh.current);
    refresh.current = setTimeout(() => router.refresh(), 400);
  });
  // A new one from someone else shows the message; one read on another device just updates the count
  useLive((e) => {
    if (e.type !== "notification" || e.by === me || document.visibilityState !== "visible") return;
    setToast(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(false), 6000);
  });
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="glass fixed bottom-4 right-4 z-[60] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm print:hidden">
      <span aria-hidden className="size-2 rounded-full bg-brand" />
      {t("newNotification")}
      <Link href="/notifications" onClick={() => setToast(false)} className="font-semibold text-brand hover:underline">
        {t("open")}
      </Link>
      <button type="button" aria-label={t("dismiss")} onClick={() => setToast(false)} className="text-muted hover:text-foreground">
        ×
      </button>
    </div>
  );
}

/**
 * On a person's page: when someone else changes this record, say so and offer a refresh – not an
 * automatic one, since the reader may be in the middle of something.
 */
export function RecordChanged({ personId, me }: { personId: string; me: string }) {
  const t = useTranslations("live");
  const router = useRouter();
  const [changed, setChanged] = useState(false);
  useLive((e) => {
    if (e.type === "person-changed" && e.topic === `person:${personId}` && e.by !== me) setChanged(true);
  }, personId);
  if (!changed) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
      <span>{t("recordChanged")}</span>
      <button
        type="button"
        onClick={() => {
          setChanged(false);
          router.refresh();
        }}
        className="rounded-xl border border-brand px-3 py-1 font-medium text-brand hover:bg-brand-soft"
      >
        {t("refresh")}
      </button>
    </div>
  );
}
