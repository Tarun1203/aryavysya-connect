import Image from "next/image";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { gotraLabel } from "@/lib/reference";
import { buttonClass, Eyebrow, Notice } from "@/components/ui";
import { HeroTree } from "@/components/landing/HeroTree";
import { CountUp, Reveal, SpotlightCard, Timeline } from "@/components/landing/motion";

const icon3d = (name: string, size = 64, className = "") => <Image src={`/icons/3d/${name}.png`} alt="" width={size} height={size} className={className} />;

/** Full-bleed band inside the centred main column. */
const Bleed = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`relative left-1/2 w-screen -translate-x-1/2 ${className}`}>{children}</div>
);

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const user = await currentUser();
  const member = canView(user);
  const [people, gotraCount, districts, gotras] = await Promise.all([
    db.person.count({ where: { status: { not: "MERGED" } } }),
    db.gotra.count(),
    db.district.count(),
    db.gotra.findMany({ orderBy: [{ no: { sort: "asc", nulls: "last" } }, { name: "asc" }], take: 40 }),
  ]);
  const gotraNames = gotras.map((g) => gotraLabel(g, locale)!);

  const features = [
    { n: 1, icon: "shield", span: "lg:col-span-2" },
    { n: 2, icon: "notebook", span: "" },
    { n: 3, icon: "heart", span: "" },
    { n: 4, icon: "map-pin", span: "" },
    { n: 5, icon: "zoom", span: "" },
    { n: 6, icon: "star", span: "lg:col-span-3" },
  ];
  const stats = [
    { value: people, label: t("statPeople") },
    { value: gotraCount, label: t("statGotras") },
    { value: districts, label: t("statDistricts") },
  ];

  return (
    <div className="flex flex-col gap-28">
      {/* ---------- Hero ---------- */}
      <section className="relative -mt-6 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        {/* the spotlight beam from the top left */}
        <svg aria-hidden viewBox="0 0 3787 2842" fill="none" className="animate-spotlight pointer-events-none absolute -left-40 -top-56 -z-10 h-[150%] w-[140%] opacity-0 lg:-left-60 lg:w-[90%]">
          <g filter="url(#spot-blur)">
            <ellipse cx="1924.71" cy="273.501" rx="1924.71" ry="273.501" transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)" fill="var(--accent)" fillOpacity="0.16" />
          </g>
          <defs>
            <filter id="spot-blur" x="0.86" y="0.84" width="3785.16" height="2840.26" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="151" />
            </filter>
          </defs>
        </svg>

        <div className="flex flex-col items-start gap-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3 text-xs font-medium shadow-soft backdrop-blur">
              <span className="rounded-full bg-gradient-to-r from-brand to-accent px-2 py-0.5 text-[11px] font-semibold text-white">ॐ</span>
              {t("eyebrow")}
            </span>
          </Reveal>
          {user && (
            <Reveal delay={0.05}>
              <p className="font-display text-lg text-brand">{t("welcome", { name: user.name })}</p>
            </Reveal>
          )}
          <Reveal delay={0.1}>
            <h1 className="text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              {t.rich("heroTitle", { hl: (chunks) => <span className="text-gradient animate-shimmer italic [animation-duration:8s]">{chunks}</span> })}
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="max-w-xl text-lg leading-relaxed text-muted">{t("heroBody")}</p>
          </Reveal>
          <Reveal delay={0.3} className="flex flex-wrap gap-3">
            {member && user?.personId ? (
              <>
                <Link href={`/tree/${user.personId}`} className={buttonClass("primary", "px-6 py-3 text-base")}>
                  {t("ctaMember")} →
                </Link>
                <Link href="/search" className={buttonClass("ghost", "px-6 py-3 text-base")}>
                  {t("ctaSearch")}
                </Link>
              </>
            ) : !user ? (
              <>
                <Link href="/register" className={buttonClass("primary", "px-6 py-3 text-base")}>
                  {t("ctaJoin")} →
                </Link>
                <Link href="/login" className={buttonClass("ghost", "px-6 py-3 text-base")}>
                  {t("ctaSignIn")}
                </Link>
              </>
            ) : null}
          </Reveal>
          <Reveal delay={0.4} className="mt-2 grid w-full max-w-lg grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface/70 shadow-soft backdrop-blur">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-3">
                <div className="font-display text-2xl font-semibold text-brand sm:text-3xl">
                  <CountUp value={s.value} locale={locale} />
                </div>
                <div className="text-xs text-muted">{s.label}</div>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal delay={0.15} y={30}>
          <HeroTree />
        </Reveal>
      </section>

      {user?.status === "PENDING" && <Notice tone="warn">{t("pendingNotice", { district: user.district?.name ?? "" })}</Notice>}

      {/* ---------- Gotra strip ---------- */}
      <Bleed className="-my-12 border-y border-line bg-surface-2/50 py-5">
        <p className="mb-3 px-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted">{t("gotraStrip", { count: gotraCount })}</p>
        <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
          <ul className="animate-marquee flex shrink-0 gap-3 pr-3 hover:[animation-play-state:paused]">
            {[...gotraNames, ...gotraNames].map((g, i) => (
              <li key={i} aria-hidden={i >= gotraNames.length} className="whitespace-nowrap rounded-full border border-line bg-surface px-4 py-1.5 font-display text-sm">
                {g}
              </li>
            ))}
          </ul>
        </div>
      </Bleed>

      {/* ---------- Features bento ---------- */}
      <section id="features" className="scroll-mt-28">
        <Reveal className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-3 text-center">
          <Eyebrow>{t("featuresEyebrow")}</Eyebrow>
          <h2 className="text-3xl font-semibold sm:text-4xl">{t("featuresTitle")}</h2>
          <p className="text-muted">{t("featuresSub")}</p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.n} delay={0.06 * i} className={f.span}>
              <SpotlightCard className="h-full p-6">
                <div className={`flex h-full gap-5 ${f.span ? "flex-col sm:flex-row sm:items-center" : "flex-col"}`}>
                  <div className="relative grid size-20 shrink-0 place-items-center">
                    <span aria-hidden className="absolute inset-2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-md" />
                    {icon3d(f.icon, 80, "relative size-20 drop-shadow-lg transition duration-500 group-hover:-rotate-6 group-hover:scale-110")}
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{t(`f${f.n}Title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{t(`f${f.n}Body`)}</p>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-28">
        <Reveal className="mx-auto mb-14 flex max-w-2xl flex-col items-center gap-3 text-center">
          <Eyebrow>{t("howEyebrow")}</Eyebrow>
          <h2 className="text-3xl font-semibold sm:text-4xl">{t("howTitle")}</h2>
        </Reveal>
        <Timeline
          steps={[
            { title: t("step1Title"), body: t("step1Body"), icon: icon3d("boy", 44, "size-8 sm:size-10") },
            { title: t("step2Title"), body: t("step2Body"), icon: icon3d("tick", 44, "size-8 sm:size-10") },
            { title: t("step3Title"), body: t("step3Body"), icon: icon3d("star", 44, "size-8 sm:size-10") },
          ]}
        />
      </section>

      {/* ---------- Privacy ---------- */}
      <section id="privacy" className="scroll-mt-28">
        <Reveal>
          <div className="relative grid items-center gap-8 overflow-hidden rounded-[2rem] border border-line bg-surface p-8 shadow-soft sm:p-12 md:grid-cols-[auto_1fr]">
            <div className="bg-grid fade-radial pointer-events-none absolute inset-0 opacity-50" />
            <div className="relative mx-auto grid size-40 place-items-center">
              <span aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
              {icon3d("lock", 140, "relative animate-float drop-shadow-2xl")}
            </div>
            <div className="relative flex flex-col gap-4">
              <h2 className="text-3xl font-semibold">{t("privacyTitle")}</h2>
              <p className="max-w-2xl leading-relaxed text-muted">{t("privacyBody")}</p>
              <ul className="flex flex-wrap gap-2">
                {[t("privacy1"), t("privacy2"), t("privacy3")].map((p) => (
                  <li key={p} className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-sm text-ok">
                    <span aria-hidden>✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Call to action ---------- */}
      <section>
        <Reveal>
          {/* A slowly turning turmeric light runs around the border */}
          <div className="relative overflow-hidden rounded-[2rem] p-px">
            <div aria-hidden className="absolute -inset-[150%] animate-[spin_9s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,var(--accent)_40deg,var(--brand)_80deg,transparent_120deg)]" />
            <div className="relative overflow-hidden rounded-[calc(2rem-1px)] bg-gradient-to-br from-[#5e1a0e] via-[#a3341f] to-[#b8560f] px-6 py-16 text-center text-white sm:px-12">
              <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-20 [--foreground:#fff]" />
              <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/2 h-64 w-[700px] -translate-x-1/2 rounded-full bg-accent/50 blur-3xl" />
              <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
                <div className="flex -space-x-3">
                  {["boy", "girl", "heart", "girl", "boy"].map((n, i) => (
                    <span key={i} className="grid size-12 place-items-center rounded-full border-2 border-white/40 bg-white/15 backdrop-blur">
                      {icon3d(n, 40, "size-9")}
                    </span>
                  ))}
                </div>
                <h2 className="text-3xl font-semibold sm:text-5xl">{t("ctaTitle")}</h2>
                <p className="text-lg text-white/85">{t("ctaBody")}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {user ? (
                    <Link href={user.personId ? `/tree/${user.personId}` : "/account"} className="rounded-xl bg-white px-6 py-3 font-semibold text-[#5e1a0e] shadow-lg transition hover:-translate-y-px">
                      {t("ctaMember")} →
                    </Link>
                  ) : (
                    <>
                      <Link href="/register" className="rounded-xl bg-white px-6 py-3 font-semibold text-[#5e1a0e] shadow-lg transition hover:-translate-y-px">
                        {t("ctaJoin")} →
                      </Link>
                      <Link href="/login" className="rounded-xl border border-white/50 px-6 py-3 font-semibold transition hover:bg-white/10">
                        {t("ctaSignIn")}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
