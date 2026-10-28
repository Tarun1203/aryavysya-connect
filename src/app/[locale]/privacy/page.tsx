import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ContactBlock, LegalPage, Section } from "@/components/LegalPage";
import { GRIEVANCE_DAYS } from "@/lib/legal";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle") };
}

/**
 * Privacy notice under the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025.
 * Every statement here describes what the code does; change them together.
 */
export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const link = "text-brand underline";

  return (
    <LegalPage page="privacy">
      <p>
        This notice explains what personal data Arya Vysya Vamsha Vruksham collects, why, who can see it, how long it is kept, and how you can use your
        rights under India&apos;s Digital Personal Data Protection Act, 2023 (&quot;DPDP Act&quot;) and the DPDP Rules, 2025.
      </p>

      <Section n={1} title="Who we are">
        <p>The site is run by the organisation below, which decides why and how your data is used (the &quot;Data Fiduciary&quot;).</p>
        <ContactBlock />
      </Section>

      <Section n={2} title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Your account:</strong> name, email, mobile number (optional), password (stored only as a one-way hash, never in readable form), your
            district, your local sangha or sabha, and your language.
          </li>
          <li>
            <strong>Your membership request:</strong> your name, gender, father&apos;s and mother&apos;s names, birth year, native place, gotra and any note you
            add.
          </li>
          <li>
            <strong>Family-tree records</strong> (yours, and relatives added by you or your family): names (including in your own script and other names),
            gender, the three gotras (own, birth and mother&apos;s), whether living, birth and death dates, tithi of death, birth place, native place,
            district, birth star, moon sign, family deity, occupation, current city, notes, child number, parent–child and marriage links with their dates
            and status, and an optional photo.
          </li>
          <li>
            <strong>Records of what happens:</strong> consents given and withdrawn, the history of changes (who changed what, and when), proposed changes,
            disputes and their decisions, and verification by administrators.
          </li>
          <li>
            <strong>Security:</strong> a sign-in cookie, and for each device you sign in on, its browser and system type (such as &quot;Chrome on
            Android&quot;) and when it was last used, so you can see and sign out your devices; for SMS sign-in codes, your mobile number and a
            scrambled (hashed) form of your IP address. Codes themselves are stored only as hashes.
          </li>
          <li>
            We do <strong>not</strong> collect Aadhaar, PAN, bank or card details, your precise location or your contacts, and we use no analytics or
            advertising trackers.
          </li>
        </ul>
      </Section>

      <Section n={3} title="Why we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>To verify and keep your membership</strong> – your local sangha or sabha and the district in-charge check that you belong to the family
            you named. (Consent: &quot;membership&quot;.)
          </li>
          <li>
            <strong>To show people in the family trees and search to verified members</strong> – so families can preserve their lineage and find relatives.
            (Consent: &quot;family tree&quot;.)
          </li>
          <li>
            <strong>To show a photo</strong>, only if one is uploaded with consent. (Consent: &quot;photo&quot;.)
          </li>
          <li>
            <strong>To give a reference marriage check</strong> from the recorded gotras and family links. It is a guide based on recorded data only, not a
            decision; families and elders decide.
          </li>
          <li>
            <strong>To keep the records accurate</strong> – catching duplicate records, recording who changed what, and handling proposed changes and
            disputes.
          </li>
          <li>
            <strong>To keep the service secure</strong> – sign-in, limits on SMS codes, and preventing misuse; and where the law requires it.
          </li>
        </ul>
        <p>We do not sell your data, use it for advertising, or use it for any purpose other than these.</p>
      </Section>

      <Section n={4} title="Who can see it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Verified members</strong> can see the family trees and search. Children under 18, people with no birth year recorded who are neither
            married nor parents, and anyone who has withdrawn family-tree consent are shown only as &quot;Private&quot; outside their family.
          </li>
          <li>
            <strong>Your family</strong> (the members allowed to edit the generations around you) and <strong>administrators</strong> for your area – the local
            sangha or sabha administrator, the district in-charge, the state administrator and the super administrators – can see the full records they look
            after.
          </li>
          <li>
            Contact details on accounts (email, phone) are seen only by you and the administrators; they are not shown in the trees or search.
          </li>
          <li>
            <strong>Service providers</strong> that run the site for us process data only on our instructions: Render (web hosting), Neon (database) and,
            for SMS codes, MSG91 (receives only your number and the code).
          </li>
          <li>We disclose data to others only where the law requires it.</li>
        </ul>
      </Section>

      <Section n={5} title="Where it is stored">
        <p>
          The site and its database run on cloud servers provided by Render and Neon. The web service runs in Render&apos;s Singapore region, so your data
          is stored and processed outside India, as the DPDP Act allows unless the Government restricts transfers to a country.
        </p>
      </Section>

      <Section n={6} title="Relatives you add">
        <p>
          When you add a relative, you confirm that you are family and that the details are, to your knowledge, true. Any person in the tree – or their
          parent, if they are a child – can ask to see, correct or dispute their record, withdraw consent, or ask for it to be removed, by writing to the
          Grievance Officer through the <Link href="/grievance" className={link}>grievance page</Link>. Once they register, they can do much of this from
          their own page.
        </p>
      </Section>

      <Section n={7} title="Children">
        <p>
          A child under 18 is shown as &quot;Private&quot; outside their family until a parent gives consent, either through the parent&apos;s own verified
          account or on a signed form recorded by an administrator. Children&apos;s photos can be added only by a parent. We do not track children or show
          them advertising. See <Link href="/child-safety" className={link}>Child safety</Link>.
        </p>
      </Section>

      <Section n={8} title="Your rights">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>See your data:</strong> your record is on your page; for a summary of everything we hold about you, ask through the grievance page.
          </li>
          <li>
            <strong>Correct it:</strong> edit it, propose a change, or raise a dispute on the record.
          </li>
          <li>
            <strong>Withdraw consent</strong> at any time from the consent card on your page (or your child&apos;s). Withdrawing does not affect what was done
            before.
          </li>
          <li>
            <strong>Have it erased:</strong> ask through the grievance page. We then delete or remove the personal details of the living person within{" "}
            {GRIEVANCE_DAYS} days, except what the law requires us to keep. Records of ancestors who have passed away may be kept as community history.
          </li>
          <li>
            <strong>Nominate someone</strong> to use these rights for you if you die or cannot act yourself – tell us through the grievance page.
          </li>
          <li>
            <strong>Complain:</strong> the Grievance Officer answers within {GRIEVANCE_DAYS} days. If you are not satisfied, you may complain to the Data
            Protection Board of India.
          </li>
        </ul>
      </Section>

      <Section n={9} title="How long we keep it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your account and family records: while your membership continues, or until you ask for them to be erased.</li>
          <li>Records of ancestors who have passed away: kept as the family&apos;s history.</li>
          <li>Consent records and the history of changes: kept as proof of what was agreed and done, for as long as the record they relate to.</li>
          <li>SMS sign-in code requests: deleted after 30 days.</li>
          <li>Records of signed-in devices: deleted a month after the session ends.</li>
        </ul>
      </Section>

      <Section n={10} title="How we protect it">
        <p>
          Passwords and codes are stored only as hashes; the site is served over HTTPS; the sign-in cookie cannot be read by scripts; each role sees only what
          it needs; and every change is recorded. If a personal data breach happens, we will inform the Data Protection Board of India and the people
          affected, as the DPDP Rules require.
        </p>
      </Section>

      <Section n={11} title="Cookies">
        <p>
          We use one essential cookie, <code>vamsha_session</code>, to keep you signed in for up to 7 days. It is encrypted and holds only a random
          session number; you can end any session from your account page. There are no other cookies – no analytics, no advertising.
        </p>
      </Section>

      <Section n={12} title="Changes to this notice">
        <p>
          The date at the top shows the current version. If we change how your data is used, we will show it on the site and ask for your consent again
          where the change needs it.
        </p>
      </Section>
    </LegalPage>
  );
}
