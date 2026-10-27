import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { AuthAside } from "@/components/AuthAside";
import { PageTitle } from "@/components/ui";
import { gotraOptions, localOrgOptions } from "@/lib/reference";

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const [gotras, localOrgs] = await Promise.all([gotraOptions(locale), localOrgOptions()]);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <PageTitle sub={t("registerIntro")}>{t("registerTitle")}</PageTitle>
        <RegisterForm gotras={gotras} localOrgs={localOrgs} />
        <p className="mt-5 text-sm">
          <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
            {t("haveAccount")} →
          </Link>
        </p>
      </div>
      <AuthAside className="hidden lg:sticky lg:top-24 lg:block" />
    </div>
  );
}
