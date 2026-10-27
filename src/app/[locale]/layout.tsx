import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Fraunces, Noto_Sans, Noto_Sans_Telugu, Noto_Sans_Kannada, Noto_Sans_Tamil } from "next/font/google";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MotionProvider } from "@/components/MotionProvider";
import "../globals.css";

const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto" });
const notoTe = Noto_Sans_Telugu({ subsets: ["telugu"], variable: "--font-noto-te" });
const notoKn = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-noto-kn" });
const notoTa = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-noto-ta" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "opsz"] });

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

  return (
    <html lang={locale} className={`${noto.variable} ${notoTe.variable} ${notoKn.variable} ${notoTa.variable} ${fraunces.variable} h-full scroll-smooth`}>
      <body className="relative isolate flex min-h-full flex-col overflow-x-clip font-sans antialiased">
        {/* Without JavaScript the reveal animations never run, so show everything as it is */}
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
        <NextIntlClientProvider>
          <MotionProvider>
            {/* A soft kumkum and turmeric glow behind the top of every page */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden print:hidden">
              <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
              <div className="bg-grid fade-radial absolute inset-0 opacity-60" />
            </div>
            <Header />
            <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-28">{children}</main>
            <Footer />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
