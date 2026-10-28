import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ContactBlock, LegalPage, Section } from "@/components/LegalPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("termsTitle") };
}

/** Terms of use. Keep in step with how the site actually works. */
export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const link = "text-brand underline";

  return (
    <LegalPage page="terms">
      <p>
        These terms apply to everyone who uses Arya Vysya Vamsha Vruksham. By registering or using the site you agree to them. How we handle personal data
        is explained in the <Link href="/privacy" className={link}>privacy notice</Link>.
      </p>

      <Section n={1} title="Who can join">
        <p>
          The site is for members of the Arya Vysya community and their families. You must be 18 or over to register. Children appear only as part of their
          family&apos;s tree, under their parents&apos; control (see <Link href="/child-safety" className={link}>Child safety</Link>). Membership is
          endorsed by your local sangha or sabha and confirmed by the district in-charge, who may decline a request.
        </p>
      </Section>

      <Section n={2} title="Your account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>One account per person, in your own name, with true details.</li>
          <li>Keep your password and sign-in codes to yourself; you are responsible for what is done with your account.</li>
          <li>Tell us through the grievance page if you think someone else has used your account.</li>
        </ul>
      </Section>

      <Section n={3} title="Adding and changing family records">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Add only your own relatives, with details you believe to be true. Where you can, tell living relatives that you have added them.</li>
          <li>Do not add a living person who has asked not to be included, and respect a withdrawal of consent.</li>
          <li>
            Some changes – to verified records, to another member&apos;s own record, or removing a verified link – go for review before they apply. If you
            believe a record is wrong, raise a dispute on it rather than changing it back and forth.
          </li>
          <li>Administrators may correct, merge, verify or remove records, and decide proposals and disputes. Every such action is recorded.</li>
        </ul>
      </Section>

      <Section n={4} title="What you may not do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Enter false information, impersonate someone, or create records for people who do not exist.</li>
          <li>Harass, threaten or shame anyone, or use the site to pressure families over marriages.</li>
          <li>Copy, export or collect other people&apos;s details, by hand or by automated means, or use them for commercial purposes or outside the community.</li>
          <li>Try to get round privacy settings, sign-in limits or access rules, or interfere with the site&apos;s working.</li>
        </ul>
      </Section>

      <Section n={5} title="The marriage check">
        <p>
          The gotra and relationship check is a reference based only on what has been recorded. Records can be incomplete or wrong, and customs differ
          between regions and families. It is not a decision or advice; families should consult their elders and purohit.
        </p>
      </Section>

      <Section n={6} title="Verification">
        <p>
          &quot;Verified&quot; means a community body or administrator has checked a membership, a record or a link from what they know and what was shown to
          them. It is not a government identity check and does not guarantee that every detail is correct.
        </p>
      </Section>

      <Section n={7} title="Photos and other content">
        <p>
          Upload only photos you have the right to share, with the consent of the person shown (or a parent, for a child). You allow the site to show them
          to members as you choose; you can hide or remove them at any time. Administrators may remove content that breaks these terms.
        </p>
      </Section>

      <Section n={8} title="Suspension">
        <p>
          Administrators may suspend or close an account that breaks these terms or puts others at risk. You can ask for a decision to be reconsidered
          through the grievance page.
        </p>
      </Section>

      <Section n={9} title="Responsibility">
        <p>
          The site is offered by the community as it is. We take care to keep it working and the records accurate, but we cannot promise it will always be
          available or free of errors, and we are not responsible for decisions people make based on its records. Nothing in these terms limits rights you
          have by law.
        </p>
      </Section>

      <Section n={10} title="Law and contact">
        <p>These terms are governed by the laws of India. Questions and complaints go to the Grievance Officer:</p>
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
