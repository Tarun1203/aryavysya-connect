import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@/lib/auth";
import { GRIEVANCE_DAYS } from "@/lib/legal";
import { memberCode } from "@/lib/reference";
import { db } from "@/lib/db";
import { ContactBlock, LegalPage, Section } from "@/components/LegalPage";
import { GrievanceForm } from "@/components/GrievanceForm";

export async function generateMetadata({ params }: PageProps<"/[locale]/grievance">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("grievanceTitle") };
}

/** How to reach the Grievance Officer, and the form – open to everyone, signed in or not. */
export default async function GrievancePage({ params }: PageProps<"/[locale]/grievance">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await currentUser();
  const self = user?.personId ? await db.person.findUnique({ where: { id: user.personId }, select: { memberNo: true } }) : null;
  const link = "text-brand underline";

  return (
    <LegalPage page="grievance">
      <Section n={1} title="The Grievance Officer">
        <p>
          Write to the Grievance Officer to see the data we hold about you, correct or erase it, withdraw consent, nominate someone to act for you, report a
          child-safety concern, or complain about how your data or your family&apos;s records have been handled. You do not need an account.
        </p>
        <ContactBlock />
      </Section>

      <Section n={2} title="What happens next">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You get a reference number as soon as you send the form below.</li>
          <li>We may ask you to confirm who you are before giving out or changing anyone&apos;s details.</li>
          <li>We answer within {GRIEVANCE_DAYS} days. Child-safety reports are dealt with first.</li>
          <li>
            If you are not satisfied with the answer, you may complain to the Data Protection Board of India. See the{" "}
            <Link href="/privacy" className={link}>privacy notice</Link> for your rights.
          </li>
        </ul>
      </Section>

      <Section n={3} title="Send a request or complaint">
        <GrievanceForm defaults={{ name: user?.name, contact: user?.email ?? undefined }} />
        {self && <p className="text-xs text-muted">Your member code is {memberCode(self.memberNo)} – mention it if your request is about your own record.</p>}
      </Section>
    </LegalPage>
  );
}
