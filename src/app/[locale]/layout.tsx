import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Noto_Sans, Noto_Sans_Telugu, Noto_Sans_Kannada, Noto_Sans_Tamil } from "next/font/google";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import "../globals.css";

const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto" });
const notoTe = Noto_Sans_Telugu({ subsets: ["telugu"], variable: "--font-noto-te" });
const notoKn = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-noto-kn" });
const notoTa = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-noto-ta" });

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: { default: t("name"), template: `%s · ${t("name")}` }, description: t("tagline") };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("app");

  return (
    <html lang={locale} className={`${noto.variable} ${notoTe.variable} ${notoKn.variable} ${notoTa.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans antialiased">
        <NextIntlClientProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-line py-6 text-center text-xs text-muted">{t("footer")}</footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
