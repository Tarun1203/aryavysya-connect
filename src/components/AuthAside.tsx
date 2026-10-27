import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "./Logo";

/** The kumkum panel beside the sign-in and registration forms: what happens after joining. */
export async function AuthAside({ className = "" }: { className?: string }) {
  const t = await getTranslations("home");
  const steps = [
    { icon: "boy", title: t("step1Title"), body: t("step1Body") },
    { icon: "tick", title: t("step2Title"), body: t("step2Body") },
    { icon: "star", title: t("step3Title"), body: t("step3Body") },
  ];
  return (
    <aside className={`relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#5e1a0e] via-[#a3341f] to-[#c77d12] p-7 text-white shadow-soft ${className}`}>
      <div aria-hidden className="bg-dots absolute inset-0 opacity-20 [--foreground:#fff]" />
      <div aria-hidden className="absolute -bottom-24 -right-16 size-72 rounded-full bg-accent/40 blur-3xl" />
      <div className="relative flex h-full flex-col gap-6">
        <div className="flex items-center gap-3">
          <LogoMark className="size-11 drop-shadow" />
          <span className="font-display text-sm uppercase tracking-[0.2em] text-white/80">{t("eyebrow")}</span>
        </div>
        <h2 className="text-2xl font-semibold leading-snug">{t.rich("heroTitle", { hl: (c) => <em className="text-[#ffd27a]">{c}</em> })}</h2>
        <ol className="flex flex-col gap-4">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <Image src={`/icons/3d/${s.icon}.png`} alt="" width={44} height={44} className="size-11 shrink-0" />
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="text-sm text-white/80">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Image src="/icons/3d/shield.png" alt="" width={120} height={120} className="animate-float mt-auto self-end drop-shadow-2xl" />
      </div>
    </aside>
  );
}
