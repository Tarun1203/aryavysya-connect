import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { canEditPerson } from "@/lib/permissions";
import { fullName, gotraOptions } from "@/lib/reference";
import { pickerDefaults } from "@/lib/locations/resolve";
import { updatePersonAction } from "@/app/actions/person";
import { PersonForm } from "@/components/PersonForm";
import { PageTitle } from "@/components/ui";
import { editNeedsReview } from "@/lib/review";

export default async function EditPersonPage({ params }: PageProps<"/[locale]/person/[id]/edit">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireViewer(locale);
  const person = await db.person.findUnique({ where: { id } });
  if (!person) notFound();
  if (!(await canEditPerson(user, id))) redirect({ href: `/person/${id}`, locale });
  const t = await getTranslations("person");
  const tr = await getTranslations("review");
  const review = await editNeedsReview(user, id);
  const [gotras, native, birth] = await Promise.all([
    gotraOptions(locale),
    pickerDefaults(person.nativeLocalityId, person.districtId),
    pickerDefaults(person.birthLocalityId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>
        {t("edit")}: {fullName(person)}
      </PageTitle>
      <PersonForm
        action={updatePersonAction.bind(null, id)}
        defaults={person}
        gotras={gotras}
        places={{ native, birth }}
        submitLabel={review ? tr("sendForReview") : undefined}
        review={review ? { notice: tr(person.verifiedAt ? "editVerifiedNotice" : "editMemberNotice"), reasonLabel: tr("reason") } : undefined}
      />
    </div>
  );
}
