"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, registerAction } from "@/app/actions/auth";
import type { GotraOption, Option } from "@/lib/reference";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "./ui";
import { LocationPicker } from "./LocationPicker";
import { GotraSelect } from "./GotraSelect";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        <Field label={t("email")}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("password")}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button disabled={pending}>{t("signIn")}</Button>
      </form>
    </Card>
  );
}

export function RegisterForm({
  gotras,
  localOrgs,
}: {
  gotras: GotraOption[];
  localOrgs: (Option & { districtId: string | null })[];
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(registerAction, undefined);
  const [districtId, setDistrictId] = useState("");
  const orgsHere = localOrgs.filter((o) => o.districtId === districtId);
  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t("auth.accountSection")}</h2>
        <Field label={`${t("auth.name")} *`}>
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label={`${t("auth.email")} *`}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("auth.phone")}>
          <Input name="phone" type="tel" autoComplete="tel" />
        </Field>
        <Field label={`${t("auth.password")} *`} hint={t("auth.passwordHint")}>
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">{t("locations.nativePlace")} *</h2>
        {/* The district picked here decides which district in-charge verifies the member */}
        <LocationPicker required onDistrictChange={setDistrictId} />
        <Field label={t("auth.localOrg")} hint={t("auth.localOrgHint")}>
          <Select name="organizationId" defaultValue="" key={districtId} disabled={!orgsHere.length}>
            <option value="">{t("auth.localOrgNone")}</option>
            {orgsHere.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t("auth.familySection")}</h2>
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
        <Field label={t("person.gotra")} hint={t("person.gotraHint")}>
          <GotraSelect name="gotraId" gotras={gotras} emptyLabel={t("person.choose")} />
        </Field>
        <Field label={t("person.fatherName")}>
          <Input name="fatherName" />
        </Field>
        <Field label={t("person.motherName")}>
          <Input name="motherName" />
        </Field>
        <Field label={t("person.birthYear")}>
          <Input name="birthYear" type="number" min={1850} max={2100} />
        </Field>
        <Field label={t("person.nativePlace")}>
          <Input name="nativePlace" />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("person.notes")}>
            <Textarea name="note" />
          </Field>
        </div>
      </Card>
      <Button disabled={pending} className="self-start">
        {t("auth.createAccount")}
      </Button>
    </form>
  );
}
