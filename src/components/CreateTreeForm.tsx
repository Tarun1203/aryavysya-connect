"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createTreeAction } from "@/app/actions/tree";
import type { GotraOption } from "@/lib/reference";
import { NAKSHATRAS, RASIS } from "@/lib/constants";
import { Button, Card, Field, Input, Notice, Select } from "./ui";
import { GotraSelect } from "./GotraSelect";
import { LocationPicker } from "./LocationPicker";

/** Start a new family tree: the founder's required details, then a duplicate check before anything is created. */
export function CreateTreeForm({ gotras }: { gotras: GotraOption[] }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(createTreeAction, undefined);

  // Submitting through the dispatcher (not the form's action prop) keeps what was typed
  // when the server comes back with possible duplicates instead of a new record
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("person.givenName")} *`}>
          <Input name="givenName" required />
        </Field>
        <Field label={`${t("person.surname")} *`}>
          <Input name="surname" required />
        </Field>
        <Field label={`${t("person.gender")} *`}>
          <Select name="gender" required defaultValue="">
            <option value="">{t("person.choose")}</option>
            <option value="MALE">{t("person.male")}</option>
            <option value="FEMALE">{t("person.female")}</option>
            <option value="OTHER">{t("person.other")}</option>
          </Select>
        </Field>
        <Field label={`${t("person.gotra")} *`} hint={t("person.gotraHint")}>
          <GotraSelect name="gotraId" gotras={gotras} emptyLabel={t("person.choose")} required />
        </Field>
        <Field label={t("person.fatherName")} hint={t("trees.fatherHint")}>
          <Input name="fatherName" />
        </Field>
        <Field label={t("person.birthDate")} hint={t("person.dateHint")}>
          <Input name="birthDate" pattern="\d{4}(-\d{2}(-\d{2})?)?" />
        </Field>
        <Field label={t("person.nakshatra")}>
          <Select name="nakshatra" defaultValue="">
            <option value="">{t("person.choose")}</option>
            {NAKSHATRAS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("person.rasi")}>
          <Select name="rasi" defaultValue="">
            <option value="">{t("person.choose")}</option>
            {RASIS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("person.aliases")} hint={t("person.aliasesHint")}>
          <Input name="aliases" />
        </Field>
        <Field label={t("person.currentCity")}>
          <Input name="currentCity" />
        </Field>
        {/* Founders are usually living members; older ancestors can be marked on their own page */}
        <input type="hidden" name="isLiving" value="on" />
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold">{t("locations.nativePlace")} *</h3>
        <LocationPicker prefix="native" required />
      </Card>

      {state?.duplicates && (
        <Card className="flex flex-col gap-3 border-warn">
          <h3 className="font-semibold">{t("trees.possibleDuplicates", { count: state.duplicates.length })}</h3>
          <p className="text-sm text-muted">{t("trees.duplicatesHint")}</p>
          <ul className="flex flex-col gap-2">
            {state.duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <div>
                  <Link href={`/person/${d.id}`} target="_blank" className="font-medium hover:text-brand">
                    {d.name}
                  </Link>{" "}
                  <span className="text-xs text-muted">{d.code}</span>
                  <div className="text-xs text-muted">{d.detail}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.reasons.map((r) => (
                      <span key={r} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">
                        {t(`trees.reason_${r}`)}
                      </span>
                    ))}
                  </div>
                </div>
                <Link href={`/person/${d.id}`} className="text-sm text-brand hover:underline">
                  {t("trees.openExisting")}
                </Link>
              </li>
            ))}
          </ul>
          <Button name="confirm" value="yes" variant="danger" disabled={pending} className="self-start">
            {t("trees.createAnyway")}
          </Button>
        </Card>
      )}

      {/* After editing the details the admin can check again */}
      <Button variant={state?.duplicates ? "ghost" : "primary"} disabled={pending} className="self-start">
        {t(state?.duplicates ? "trees.checkAgain" : "trees.checkAndCreate")}
      </Button>
    </form>
  );
}
