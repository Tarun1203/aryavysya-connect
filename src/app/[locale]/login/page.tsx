import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/components/AuthForms";
import { PageTitle } from "@/components/ui";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>{t("signInTitle")}</PageTitle>
      <LoginForm />
      <p className="mt-4 text-sm">
        <Link href="/register" className="text-brand underline">
          {t("noAccount")}
        </Link>
      </p>
    </div>
  );
}
