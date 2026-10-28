import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalPage, Section } from "@/components/LegalPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/child-safety">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("childSafetyTitle") };
}

/** How children are protected – matches src/lib/consent.ts and src/lib/photo.ts. */
export default async function ChildSafetyPage({ params }: PageProps<"/[locale]/child-safety">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const link = "text-brand underline";

  return (
    <LegalPage page="childSafety">
      <Section n={1} title="Who is treated as a child">
        <p>
          Anyone living who is under 18, by the birth year in their record. Someone living with no birth year recorded who is neither married nor a parent is
          treated as a child too, until a birth year is added. A living child can only be added with a birth year (an estimate is fine).
        </p>
      </Section>

      <Section n={2} title="Private until a parent agrees">
        <p>
          Outside their own family, a child is shown only as &quot;Private&quot;: no name, dates, gotra, photo or link, and they do not appear in search. Their
          family and the administrators for their area see the record as it is. The child becomes visible to verified members only when a parent gives
          consent through their own verified account, or an administrator records a consent form signed by the child&apos;s guardian. A parent can withdraw
          that consent at any time from the consent card on the child&apos;s page.
        </p>
      </Section>

      <Section n={3} title="Photos">
        <p>
          Only a parent of the child can add, hide or replace a child&apos;s photo, and a photo is hidden by default. Administrators can remove any photo.
        </p>
      </Section>

      <Section n={4} title="No tracking, no advertising, no contact">
        <p>
          The site has no analytics or advertising, and nothing that tracks or profiles children. Children cannot register, and the site has no messaging, so
          no one can contact a child through it.
        </p>
      </Section>

      <Section n={5} title="Turning 18">
        <p>
          When a child turns 18 by their recorded birth year, they are treated as an adult: they can register, see and correct their own record, and
          withdraw consent for themselves.
        </p>
      </Section>

      <Section n={6} title="If you are worried">
        <p>
          If you think a child&apos;s details are shown wrongly, or someone is misusing the site in a way that affects a child, tell us at once through the{" "}
          <Link href="/grievance" className={link}>grievance page</Link> and choose &quot;Child safety&quot;. These reports are dealt with first. If a child is
          in danger, contact the police (112) or Childline (1098).
        </p>
      </Section>
    </LegalPage>
  );
}
