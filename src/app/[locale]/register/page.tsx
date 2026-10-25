import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { PageTitle } from "@/components/ui";
import { gotraOptions, localOrgOptions } from "@/lib/reference";

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const [gotras, localOrgs] = await Promise.all([gotraOptions(locale), localOrgOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub={t("registerIntro")}>{t("registerTitle")}</PageTitle>
      <RegisterForm gotras={gotras} localOrgs={localOrgs} />
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-brand underline">
          {t("haveAccount")}
        </Link>
      </p>
    </div>
  );
}
