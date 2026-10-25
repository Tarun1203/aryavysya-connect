import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Card, Notice } from "@/components/ui";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const user = await currentUser();
  const [people, gotras, districts] = await Promise.all([db.person.count(), db.gotra.count(), db.district.count()]);

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-2xl bg-gradient-to-br from-brand to-accent p-8 text-white sm:p-12">
        {user && <p className="mb-2 text-lg opacity-90">{t("welcome", { name: user.name })}</p>}
        <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">{t("heroTitle")}</h1>
        <p className="mt-4 max-w-2xl text-lg opacity-95">{t("heroBody")}</p>
        {!user && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-lg bg-white px-5 py-2.5 font-semibold text-brand">
              {t("ctaJoin")}
            </Link>
            <Link href="/login" className="rounded-lg border border-white/70 px-5 py-2.5 font-semibold">
              {t("ctaSignIn")}
            </Link>
          </div>
        )}
        <p className="mt-6 text-sm opacity-80">{t("stats", { people, gotras, districts })}</p>
      </section>

      {user?.status === "PENDING" && (
        <Notice tone="warn">{t("pendingNotice", { district: user.district?.name ?? "" })}</Notice>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <Card key={n}>
            <div className="mb-2 grid size-8 place-items-center rounded-full bg-brand-soft font-bold text-brand">{n}</div>
            <h2 className="font-semibold">{t(`step${n}Title`)}</h2>
            <p className="mt-1 text-sm text-muted">{t(`step${n}Body`)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
