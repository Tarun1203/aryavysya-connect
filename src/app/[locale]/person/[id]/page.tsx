import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { canAddRelative, canEditPerson, isAdmin } from "@/lib/permissions";
import { getFamily } from "@/lib/tree";
import { fullName, gotraLabel, kulaLabels, lifeSpan, memberCode, personState } from "@/lib/reference";
import { mergePersonAction, removeLinkAction } from "@/app/actions/person";
import { ActionForm } from "@/components/ActionForm";
import { PersonPicker } from "@/components/PersonPicker";
import { PrivateNotice } from "@/components/PrivateNotice";
import { consentPanel, isPrivateFor, maskList } from "@/lib/consent";
import { ConsentCard } from "@/components/ConsentCard";
import { respondMarriageAction, updateMarriageAction } from "@/app/actions/marriage";
import Image from "next/image";
import { Badge, buttonClass, Card, Notice } from "@/components/ui";
import { PhotoUpload } from "@/components/PhotoUpload";
import { defaultVisible, photoRights, photoUrl } from "@/lib/photo";
import { removePhotoAction, setPhotoVisibleAction, uploadPhotoAction } from "@/app/actions/photo";

type P = { id: string; givenName: string; surname: string; birthDate: string | null; deathDate: string | null; isLiving: boolean; gotra: { name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null } | null };

export default async function PersonPage({ params }: PageProps<"/[locale]/person/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireViewer(locale);
  const family = await getFamily(id);
  if (!family) notFound();
  // A merged-away record keeps its id and points to the surviving one
  if (family.person.status === "MERGED" && family.person.mergedIntoId) redirect({ href: `/person/${family.person.mergedIntoId}`, locale });
  const t = await getTranslations("person");
  const tc = await getTranslations("consent");
  if (await isPrivateFor(user, id)) return <PrivateNotice title={tc("privateTitle")} body={tc("privateBody")} />;
  const format = await getFormatter();
  const { person, proposals, childNo } = family;
  // Relatives who are private to this viewer show as "Private", with no link
  const privateLabel = tc("privateLabel");
  const maskLinks = async <L extends { person: Parameters<typeof maskList>[0][number] }>(links: L[]) => {
    const shown = await maskList(links.map((l) => l.person), user, privateLabel);
    return links.map((l, i) => ({ ...l, person: shown[i] as L["person"] }));
  };
  const [parents, spouses, children, siblings] = await Promise.all([
    maskLinks(family.parents),
    maskLinks(family.spouses),
    maskLinks(family.children),
    maskList(family.siblings, user, privateLabel),
  ]);
  const tm = await getTranslations("marriage");
  const tmerge = await getTranslations("merge");
  const marriedWoman = person.gender === "FEMALE" && spouses.some((s) => s.person.gender === "MALE");

  const [editable, canParent, canChild, canSpouse, photo] = await Promise.all([
    canEditPerson(user, id),
    canAddRelative(user, id, "parent"),
    canAddRelative(user, id, "child", spouses[0]?.person.id),
    canAddRelative(user, id, "spouse"),
    photoRights(user, id),
  ]);
  const consent = person.isLiving ? await consentPanel(user, id) : null;
  const self = person.user?.id === user.id;
  const showConsent = !!consent && (editable || consent.canGiveAsGuardian || consent.canRecordForm || consent.canGiveSelf || consent.canWithdraw);
  const tp = await getTranslations("photo");
  const showPhoto = !!person.photo && (person.photo.visible || photo.seeHidden);
  const consentLabel = tp(photo.reason === "guardian" ? "consentGuardian" : photo.reason === "self" ? "consentSelf" : "consentFamily");
  const history = isAdmin(user)
    ? await db.auditLog.findMany({ where: { entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];

  const details: [string, string | null | undefined][] = [
    // Married woman: own gotra (her husband's) + her birth gotra; everyone else: own + mother's gotra
    [t("ownGotra"), gotraLabel(person.gotra, locale)],
    marriedWoman ? [t("birthGotraMaiden"), gotraLabel(person.birthGotra, locale)] : [t("maternalGotra"), gotraLabel(person.maternalGotra, locale)],
    [t("kulas"), person.gotra && kulaLabels(person.gotra, locale).join(", ")],
    [t("birthDate"), person.birthDate],
    [t("birthOrder"), childNo && childNo.of > 1 ? t("childNoOf", { n: childNo.n, of: childNo.of }) : null],
    [t("birthPlace"), placeLine(person.birthPlace, person.birthLocality)],
    [t("deathDate"), person.isLiving ? null : person.deathDate],
    [t("deathTithi"), person.isLiving ? null : person.deathTithi],
    [t("nativePlace"), placeLine(person.nativePlace, person.nativeLocality)],
    [t("district"), person.district && `${person.district.name}, ${person.district.state}`],
    [t("nakshatra"), person.nakshatra],
    [t("rasi"), person.rasi],
    [t("kuladevata"), person.kuladevata],
    [t("occupation"), person.occupation],
    [t("currentCity"), person.currentCity],
  ];

  const PersonLink = ({ p, linkId, kind, no }: { p: P; linkId?: string; kind?: "parentChild" | "couple"; no?: string }) => (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
      {(p as { private?: boolean }).private ? (
        <span className="text-sm italic text-muted">{p.givenName}</span>
      ) : (
      <Link href={`/person/${p.id}`} className="flex items-baseline gap-2 hover:text-brand">
        {no && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{no}</span>}
        <span className="font-medium">{fullName(p)}</span>
        <span className="ml-2 text-xs text-muted">
          {[lifeSpan(p), gotraLabel(p.gotra, locale)].filter(Boolean).join(" · ")}
        </span>
      </Link>
      )}
      {editable && linkId && kind && (
        <form action={removeLinkAction.bind(null, kind, linkId, id)}>
          <button className="text-xs text-muted hover:text-bad" title={t("removeLink")} aria-label={t("removeLink")}>
            ✕
          </button>
        </form>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header: photo (or a 3D figure), names and record details */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-soft">
        <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-[#5e1a0e] via-[#a3341f] to-[#c77d12]">
          <div className="bg-dots absolute inset-0 opacity-25 [--foreground:#fff]" />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-10 sm:px-7">
          <div className="flex flex-wrap items-end gap-5">
            <div className={`grid size-28 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-surface bg-surface-2 shadow-soft ring-2 ${person.gender === "FEMALE" ? "ring-gold/70" : "ring-brand/50"}`}>
              {showPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own access-checked route
                <img src={photoUrl(person.id, person.photo!.updatedAt)} alt={fullName(person)} className={`size-full object-cover ${person.photo!.visible ? "" : "opacity-80"}`} />
              ) : (
                <Image src={`/icons/3d/${person.gender === "FEMALE" ? "girl" : "boy"}.png`} alt="" width={96} height={96} className="size-20" />
              )}
            </div>
            <div className="flex flex-col gap-1 pb-1">
              <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold sm:text-4xl">
                {fullName(person)}
                {person.user?.id === user.id && <Badge tone="gold">{t("you")}</Badge>}
              </h1>
              {(person.givenNameLocal || person.surnameLocal) && (
                <p className="font-display text-xl text-muted">{[person.givenNameLocal, person.surnameLocal].filter(Boolean).join(" ")}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge>{t(`state_${personState(person)}`)}</Badge>
                {lifeSpan(person) && <Badge tone="muted">{lifeSpan(person)}</Badge>}
                <Badge tone="muted">
                  <span className="font-mono">{memberCode(person.memberNo)}</span>
                </Badge>
              </div>
              {person.aliases.length > 0 && (
                <p className="text-sm text-muted">
                  {t("aliases")}: {person.aliases.join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/tree/${id}`} className={buttonClass("ghost")}>
              {t("viewTree")}
            </Link>
            {editable && (
              <Link href={`/person/${id}/edit`} className={buttonClass("primary")}>
                {t("edit")}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Notice tone={editable ? "ok" : "info"}>{editable ? t("editable") : t("readOnly")}</Notice>

      {proposals.map((pr) => (
        <Notice key={pr.linkId} tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {pr.incoming ? tm("incoming", { name: fullName(pr.person), by: pr.proposedBy ?? "—" }) : tm("outgoing", { name: fullName(pr.person) })}{" "}
              <Link href={`/person/${pr.person.id}`} className="underline">
                {tm("view")}
              </Link>
            </span>
            {editable && (
              <span className="flex gap-2">
                {pr.incoming ? (
                  <>
                    <form action={respondMarriageAction.bind(null, pr.linkId, true)}>
                      <button className={buttonClass("primary", "px-3 py-1")}>{tm("accept")}</button>
                    </form>
                    <form action={respondMarriageAction.bind(null, pr.linkId, false)}>
                      <button className="rounded-xl border border-line px-3 py-1 text-sm hover:bg-surface">{tm("decline")}</button>
                    </form>
                  </>
                ) : (
                  <form action={removeLinkAction.bind(null, "couple", pr.linkId, id)}>
                    <button className="rounded-xl border border-line px-3 py-1 text-sm hover:bg-surface">{tm("withdraw")}</button>
                  </form>
                )}
              </span>
            )}
          </div>
        </Notice>
      ))}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <dl className="grid gap-3 text-sm">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
          {person.notes && <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm">{person.notes}</p>}
          {(photo.manage || (photo.remove && person.photo) || (editable && !photo.manage)) && (
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">{tp("title")}</h3>
              {person.photo && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">{person.photo.visible ? tp("shown") : tp(photo.minor ? "hiddenMinor" : "hidden")}</span>
                  {photo.manage && (
                    <form action={setPhotoVisibleAction.bind(null, id, !person.photo.visible)}>
                      <button className="rounded border border-line px-2 py-0.5 hover:bg-brand-soft">{person.photo.visible ? tp("hide") : tp("show")}</button>
                    </form>
                  )}
                  {photo.remove && (
                    <form action={removePhotoAction.bind(null, id)}>
                      <button className="rounded px-2 py-0.5 text-muted hover:text-bad">{tp("remove")}</button>
                    </form>
                  )}
                </div>
              )}
              {photo.manage ? (
                <PhotoUpload
                  action={uploadPhotoAction.bind(null, id)}
                  defaultVisible={person.photo?.visible ?? defaultVisible(person)}
                  hasPhoto={!!person.photo}
                  consentLabel={consentLabel}
                />
              ) : (
                <p className="text-xs text-muted">{tp(photo.minor ? "guardianOnly" : photo.reason === "self" ? "selfOnly" : "notAllowed")}</p>
              )}
            </div>
          )}
        </Card>

        <Card className="grid gap-6 lg:col-span-2 sm:grid-cols-2">
          <Section title={t("parents")} none={t("none")}>
            {parents.map((p) => (
              <PersonLink key={p.linkId} p={p.person} linkId={p.linkId} kind="parentChild" />
            ))}
          </Section>
          <Section title={t("spouses")} none={t("none")}>
            {spouses.map((s) => (
              <li key={s.linkId} className="flex flex-col gap-1">
                <ul>
                  <PersonLink p={s.person} linkId={s.linkId} kind="couple" no={spouses.length > 1 ? t("spouseNo", { n: spouses.indexOf(s) + 1 }) : undefined} />
                </ul>
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
                  {s.status !== "CONFIRMED" && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-foreground">{tm(`status_${s.status}`)}</span>}
                  {s.marriageDate && <span>{tm("married", { date: s.marriageDate })}</span>}
                  {s.endDate && <span>{tm("ended", { date: s.endDate })}</span>}
                  {editable && (
                    <details className="w-full">
                      <summary className="cursor-pointer text-brand hover:underline">{tm("editMarriage")}</summary>
                      <form action={updateMarriageAction.bind(null, s.linkId)} className="mt-2 grid grid-cols-3 gap-2">
                        <select name="status" defaultValue={s.status} className="rounded border border-line bg-background px-2 py-1">
                          {(["CONFIRMED", "WIDOWED", "DIVORCED"] as const).map((st) => (
                            <option key={st} value={st}>
                              {tm(`status_${st}`)}
                            </option>
                          ))}
                        </select>
                        <input name="marriageDate" defaultValue={s.marriageDate ?? ""} placeholder={tm("marriageDate")} pattern="\d{4}(-\d{2}(-\d{2})?)?" className="min-w-0 rounded border border-line bg-background px-2 py-1" />
                        <input name="endDate" defaultValue={s.endDate ?? ""} placeholder={tm("endDate")} pattern="\d{4}(-\d{2}(-\d{2})?)?" className="min-w-0 rounded border border-line bg-background px-2 py-1" />
                        <button className="col-span-3 justify-self-start rounded border border-line px-3 py-1 hover:bg-brand-soft">{t("save")}</button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </Section>
          <Section title={t("children")} none={t("none")}>
            {children.map((c, i) => (
              <PersonLink key={c.linkId} p={c.person} linkId={c.linkId} kind="parentChild" no={t("childNo", { n: i + 1 })} />
            ))}
          </Section>
          <Section title={t("siblings")} none={t("none")}>
            {siblings.map((s) => (
              <PersonLink key={s.id} p={s} />
            ))}
          </Section>
          {(canParent || canChild || canSpouse) && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {canParent && parents.length < 2 && (
                <Link href={`/person/${id}/add/parent`} className="rounded-xl border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addParent")}
                </Link>
              )}
              {canSpouse && (
                <Link href={`/person/${id}/add/spouse`} className="rounded-xl border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addSpouse")}
                </Link>
              )}
              {canChild && (
                <Link href={`/person/${id}/add/child`} className="rounded-xl border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addChild")}
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      {showConsent && consent && (
        <ConsentCard personId={id} name={fullName(person)} panel={consent} showHistory={isAdmin(user) || self || consent.canGiveAsGuardian} />
      )}

      {isAdmin(user) && editable && (
        <Card>
          <details className="group">
            <summary className="cursor-pointer font-semibold">{tmerge("title")}</summary>
            <p className="mb-3 mt-2 text-sm text-muted">{tmerge("intro", { code: memberCode(person.memberNo) })}</p>
            <ActionForm action={mergePersonAction.bind(null, id)} submit={tmerge("submit")} variant="danger" className="flex max-w-xl flex-col gap-3">
              <PersonPicker name="duplicateId" placeholder={tmerge("search")} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" required className="mt-0.5 accent-brand" />
                <span>{tmerge("confirm", { name: fullName(person) })}</span>
              </label>
            </ActionForm>
          </details>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{t("history")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-3">
                <span className="text-muted">{format.dateTime(h.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="font-medium">{h.action}</span>
                <span>{h.user?.name ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Section({ title, none, children: items }: { title: string; none: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {items.length ? <ul className="flex flex-col gap-2">{items}</ul> : <p className="text-sm text-muted">{none}</p>}
    </div>
  );
}

type LinkedPlace = { name: string; pincode: string | null; taluk: { name: string } | null; district: { name: string; state: string } } | null;

/** Typed place text, plus the linked village / post office with taluk, district and pincode. */
function placeLine(text: string | null, place: LinkedPlace) {
  if (!place) return text;
  const linked = [place.name, place.taluk?.name, place.district.name, place.district.state].filter(Boolean).join(", ") + (place.pincode ? ` – ${place.pincode}` : "");
  // Text filled in from the picker itself starts with the place name – showing it again would repeat it
  const repeats = !text || text.toLowerCase().startsWith(place.name.toLowerCase()) || linked.toLowerCase().startsWith(text.toLowerCase());
  return repeats ? linked : `${text} (${linked})`;
}
