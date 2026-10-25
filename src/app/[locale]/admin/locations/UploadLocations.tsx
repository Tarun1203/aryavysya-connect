"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ImportSummary } from "@/lib/locations/import";
import { Button, Notice } from "@/components/ui";

export function UploadLocations() {
  const t = useTranslations("locations");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ImportSummary & { error?: string }) | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      // Raw body (not multipart) so the server can stream-parse very large files
      const res = await fetch("/api/admin/locations/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      setResult(await res.json());
      router.refresh();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) } as ImportSummary);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2"
      />
      <Button onClick={upload} disabled={!file || busy} className="self-start">
        {busy ? t("uploading") : t("upload")}
      </Button>
      {result?.error && <Notice tone="bad">{t("failed", { error: result.error })}</Notice>}
      {result && !result.error && (
        <Notice tone="ok">
          {t("result", {
            rows: result.rows,
            format: result.format ?? "-",
            localities: result.localities,
            taluks: result.taluks,
            pins: result.villagesGivenPincode,
          })}
          {result.districtsCreated.length > 0 && (
            <div className="mt-2 text-warn">
              {t("newDistricts", { count: result.districtsCreated.length })} {result.districtsCreated.join("; ")}
            </div>
          )}
        </Notice>
      )}
    </div>
  );
}
