import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/components/AuthForms";
import { AuthAside } from "@/components/AuthAside";
import { OtpForm } from "@/components/OtpForm";
import { Segmented } from "@/components/Segmented";
import { Card, PageTitle } from "@/components/ui";
import { sendLoginCodeAction, verifyLoginCodeAction } from "@/app/actions/otp";
import { otpAvailable } from "@/lib/otp";

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const { with: method } = (await searchParams) as { with?: string };
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const to = await getTranslations("otp");
  // Phone sign-in appears once SMS is set up (MSG91), or on a development machine
  const phone = otpAvailable() && method === "phone";
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-8 md:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center md:py-8">
        <PageTitle>{t("signInTitle")}</PageTitle>
        {otpAvailable() && (
          <Segmented
            className="mb-4 w-fit"
            items={[
              { href: "/login", label: to("withEmail"), active: !phone },
              { href: "/login?with=phone", label: to("withPhone"), active: phone },
            ]}
          />
        )}
        {phone ? (
          <Card>
            <OtpForm send={sendLoginCodeAction} verify={verifyLoginCodeAction} submitLabel={t("signIn")} />
            <p className="mt-4 text-xs text-muted">{to("onlyVerified")}</p>
          </Card>
        ) : (
          <LoginForm />
        )}
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
