import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui";

/** Shown for any page that doesn't exist, in the reader's language. */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <Image src="/icons/3d/zoom.png" alt="" width={120} height={120} className="drop-shadow-xl" />
      <h1 className="text-3xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted">{t("notFoundBody")}</p>
      <Link href="/" className={buttonClass("primary")}>
        {t("goHome")}
      </Link>
    </div>
  );
}
