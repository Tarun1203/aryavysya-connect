import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { UploadLocations } from "./UploadLocations";

export default async function LocationsPage({ params }: PageProps<"/[locale]/admin/locations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("locations");

  const [states, districts, taluks, villages, offices, withPin] = await Promise.all([
    db.district.findMany({ distinct: ["state"], select: { state: true } }).then((r) => r.length),
    db.district.count(),
    db.taluk.count(),
    db.locality.count({ where: { kind: "VILLAGE" } }),
    db.locality.count({ where: { kind: "POST_OFFICE" } }),
    db.locality.count({ where: { kind: "VILLAGE", pincode: { not: null } } }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("uploadTitle")}</h2>
        <p className="text-sm text-muted">{t("uploadHelp")}</p>
        <UploadLocations />
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-2 font-semibold">{t("title")}</h2>
          <p className="text-sm">{t("stats", { states, districts, taluks, villages, offices })}</p>
          <p className="mt-1 text-xs text-muted">{t("withPincode", { count: withPin })}</p>
        </Card>
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">{t("sources")}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <a className="text-brand underline" href="https://lgdirectory.gov.in" target="_blank" rel="noreferrer">
                {t("sourceLgd")}
              </a>
            </li>
            <li>
              <a
                className="text-brand underline"
                href="https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month"
                target="_blank"
                rel="noreferrer"
              >
                {t("sourceIndiaPost")}
              </a>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
