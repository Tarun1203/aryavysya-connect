import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireViewer } from "@/lib/guard";
import { editableIds } from "@/lib/permissions";
import { descendants, pedigree, type DescendantNode, type TreeNode } from "@/lib/tree";
import { fullName, lifeSpan } from "@/lib/reference";
import { Card, PageTitle } from "@/components/ui";

export default async function TreePage({ params }: PageProps<"/[locale]/tree/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireViewer(locale);
  const [rows, desc, editable] = await Promise.all([pedigree(id, 6), descendants(id, 4), editableIds(user)]);
  if (!rows[0][0] || !desc) notFound();
  const t = await getTranslations("tree");
  const canEdit = (pid: string) => editable === null || editable.has(pid);

  const Box = ({ p }: { p: TreeNode | null | undefined }) =>
    p === undefined ? (
      <div aria-hidden className="h-[54px]" />
    ) : p ? (
      <Link
        href={`/person/${p.id}`}
        className={`block rounded-lg border border-l-4 px-3 py-2 text-sm shadow-sm transition hover:border-brand ${
          p.gender === "FEMALE" ? "border-l-accent" : "border-l-brand"
        } ${canEdit(p.id) ? "border-line bg-surface" : "border-dashed border-line bg-background"}`}
      >
        <div className="font-medium leading-tight">{fullName(p)}</div>
        <div className="text-xs text-muted">{lifeSpan(p)}</div>
      </Link>
    ) : (
      <div className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">{t("unknown")}</div>
    );

  const Descendant = ({ node }: { node: DescendantNode }) => (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-52">
          <Box p={node} />
        </div>
        {node.spouses.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="text-accent" aria-hidden>
              ⚭
            </span>
            <div className="w-48">
              <Box p={s} />
            </div>
          </div>
        ))}
      </div>
      {node.children.length > 0 && (
        <ul className="ml-6 flex flex-col gap-3 border-l-2 border-line pl-4">
          {node.children.map((c) => (
            <Descendant key={c.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageTitle>{t("title", { name: fullName(rows[0][0]) })}</PageTitle>

      <Card className="overflow-x-auto">
        <h2 className="mb-4 font-semibold">{t("ancestors")}</h2>
        <div className="flex min-w-max gap-4">
          {rows.map((row, g) => (
            <div key={g} className="flex w-52 flex-col gap-2">
              <div className="h-4 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                {g > 0 && t("generation", { n: g })}
              </div>
              <div className="flex flex-1 flex-col justify-center gap-2">
                {row.filter(Boolean).map((p) => (
                  <Box key={p!.id} p={p} />
                ))}
                {g > 0 && !row.some(Boolean) && <Box p={null} />}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-4 font-semibold">{t("descendants")}</h2>
        <ul className="min-w-max">
          <Descendant node={desc} />
        </ul>
      </Card>
    </div>
  );
}
