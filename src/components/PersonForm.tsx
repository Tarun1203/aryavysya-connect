"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import type { GotraOption, Option } from "@/lib/reference";
import { NAKSHATRAS, RASIS, DEFAULT_KULADEVATA } from "@/lib/constants";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "./ui";
import { LocationPicker, type PickedLocation } from "./LocationPicker";
import { GotraSelect } from "./GotraSelect";

export type PersonDefaults = Partial<{
  givenName: string;
  surname: string;
  givenNameLocal: string | null;
  surnameLocal: string | null;
  aliases: string[];
  gender: string;
  gotraId: string | null;
  isLiving: boolean;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathTithi: string | null;
  nativePlace: string | null;
  nakshatra: string | null;
  rasi: string | null;
  kuladevata: string | null;
  occupation: string | null;
  currentCity: string | null;
  notes: string | null;
  districtId: string | null;
}>;

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  defaults?: PersonDefaults;
  gotras: GotraOption[];
  /** Saved native / birth places for the location pickers */
  places?: { native: PickedLocation; birth: PickedLocation };
  coParents?: Option[];
  submitLabel?: string;
};

export function PersonForm({ action, defaults = {}, gotras, places = { native: {}, birth: {} }, coParents, submitLabel }: Props) {
  const t = useTranslations("person");
  const tl = useTranslations("locations");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [living, setLiving] = useState(defaults.isLiving ?? true);
  const d = (k: keyof PersonDefaults) => (defaults[k] as string | null | undefined) ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("givenName")} *`}>
          <Input name="givenName" defaultValue={d("givenName")} required />
        </Field>
        <Field label={`${t("surname")} *`}>
          <Input name="surname" defaultValue={d("surname")} required />
        </Field>
        <Field label={t("givenNameLocal")}>
          <Input name="givenNameLocal" defaultValue={d("givenNameLocal")} />
        </Field>
        <Field label={t("surnameLocal")}>
          <Input name="surnameLocal" defaultValue={d("surnameLocal")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("aliases")} hint={t("aliasesHint")}>
            <Input name="aliases" defaultValue={defaults.aliases?.join(", ") ?? ""} />
          </Field>
        </div>
        <Field label={`${t("gender")} *`}>
          <Select name="gender" defaultValue={d("gender")} required>
            <option value="">{t("choose")}</option>
            <option value="MALE">{t("male")}</option>
            <option value="FEMALE">{t("female")}</option>
            <option value="OTHER">{t("other")}</option>
          </Select>
        </Field>
        <Field label={t("gotra")} hint={t("gotraHint")}>
          <GotraSelect name="gotraId" gotras={gotras} defaultValue={d("gotraId")} emptyLabel={t("choose")} />
        </Field>
        {coParents && coParents.length > 0 && (
          <Field label={t("otherParent")}>
            <Select name="coParentId" defaultValue={coParents[0].id}>
              <option value="">{t("choose")}</option>
              {coParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isLiving" checked={living} onChange={(e) => setLiving(e.target.checked)} className="size-4 accent-brand" />
          {t("isLiving")}
        </label>
        <Field label={t("birthDate")} hint={t("dateHint")}>
          <Input name="birthDate" defaultValue={d("birthDate")} pattern="\d{4}(-\d{2}(-\d{2})?)?" />
        </Field>
        {!living && (
          <>
            <Field label={t("deathDate")} hint={t("dateHint")}>
              <Input name="deathDate" defaultValue={d("deathDate")} pattern="\d{4}(-\d{2}(-\d{2})?)?" />
            </Field>
            <Field label={t("deathTithi")}>
              <Input name="deathTithi" defaultValue={d("deathTithi")} />
            </Field>
          </>
        )}
        <Field label={t("nakshatra")}>
          <Select name="nakshatra" defaultValue={d("nakshatra")}>
            <option value="">{t("choose")}</option>
            {NAKSHATRAS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("rasi")}>
          <Select name="rasi" defaultValue={d("rasi")}>
            <option value="">{t("choose")}</option>
            {RASIS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("kuladevata")}>
          <Input name="kuladevata" defaultValue={defaults.kuladevata ?? DEFAULT_KULADEVATA} />
        </Field>
        <Field label={t("occupation")}>
          <Input name="occupation" defaultValue={d("occupation")} />
        </Field>
        <Field label={t("currentCity")}>
          <Input name="currentCity" defaultValue={d("currentCity")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("notes")}>
            <Textarea name="notes" defaultValue={d("notes")} />
          </Field>
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold">{tl("nativePlace")}</h3>
        <Field label={t("nativePlace")}>
          <Input name="nativePlace" defaultValue={d("nativePlace")} />
        </Field>
        <LocationPicker prefix="native" defaults={places.native} />
      </Card>
      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold">{tl("birthPlace")}</h3>
        <Field label={t("birthPlace")}>
          <Input name="birthPlace" defaultValue={d("birthPlace")} />
        </Field>
        <LocationPicker prefix="birth" defaults={places.birth} />
      </Card>
      <Button disabled={pending} className="self-start">
        {submitLabel ?? t("save")}
      </Button>
    </form>
  );
}
