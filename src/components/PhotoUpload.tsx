"use client";

import { startTransition, useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { Button, Notice } from "./ui";

const SIZE = 320;

/** Centre-crop to a square and shrink to 320px JPEG, so photos stay small in the database. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

export function PhotoUpload({
  action,
  defaultVisible,
  hasPhoto,
  consentLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  defaultVisible: boolean;
  hasPhoto: boolean;
  consentLabel: string;
}) {
  const t = useTranslations("photo");
  const [state, dispatch, pending] = useActionState(action, undefined);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return setPreview(null);
    try {
      const blob = await squareJpeg(file);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setError(t("notImage"));
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!preview) return setError(t("choosePhoto"));
    const fd = new FormData(e.currentTarget);
    fd.set("photo", new File([preview.blob], "photo.jpg", { type: "image/jpeg" }));
    startTransition(() => dispatch(fd));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      {(error || state?.error) && <Notice tone="bad">{error ?? state?.error}</Notice>}
      {state?.ok && <Notice tone="ok">{t("saved")}</Notice>}
      <div className="flex items-center gap-3">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not an optimisable asset
          <img src={preview.url} alt="" className="size-16 rounded-full object-cover" />
        )}
        <input type="file" accept="image/*" onChange={pick} className="min-w-0 text-xs file:mr-2 file:rounded file:border file:border-line file:bg-surface file:px-2 file:py-1" />
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="visible" defaultChecked={defaultVisible} className="mt-0.5 accent-brand" />
        <span>{t("showInTree")}</span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="consent" required className="mt-0.5 accent-brand" />
        <span>{consentLabel}</span>
      </label>
      <Button disabled={pending || !preview} className="self-start">
        {hasPhoto ? t("replace") : t("upload")}
      </Button>
    </form>
  );
}
