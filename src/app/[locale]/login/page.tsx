import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/components/AuthForms";
import { AuthAside } from "@/components/AuthAside";
import { PageTitle } from "@/components/ui";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-8 md:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center md:py-8">
        <PageTitle>{t("signInTitle")}</PageTitle>
        <LoginForm />
        <p className="mt-5 text-sm">
          <Link href="/register" className="font-medium text-brand underline-offset-4 hover:underline">
            {t("noAccount")} →
          </Link>
        </p>
      </div>
      <AuthAside className="hidden md:block" />
    </div>
  );
}
