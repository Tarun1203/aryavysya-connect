import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireViewer } from "@/lib/guard";
import { editableIds } from "@/lib/permissions";
import {
  descendants,
  lineageRoot,
  pedigree,
  type DescendantNode,
  type TreeNode,
} from "@/lib/tree";
import {
  fullName,
  gotraLabel,
  lifeSpan,
  memberCode,
  personState,
} from "@/lib/reference";
import { Card, PageTitle } from "@/components/ui";
import { PictorialTree } from "@/components/PictorialTree";
import { TreeViewport } from "@/components/TreeViewport";
import { Segmented } from "@/components/Segmented";
import { HierarchyTree } from "@/components/HierarchyTree";

export default async function TreePage({
  params,
  searchParams,
}: PageProps<"/[locale]/tree/[id]">) {
  const { locale, id } = await params;
  const { view } = (await searchParams) as { view?: string };
  setRequestLocale(locale);
  const user = await requireViewer(locale);
  const t = await getTranslations("tree");
  const VIEWS = ["hierarchy", "picture", "list", "chart"] as const;
  const current = (VIEWS as readonly string[]).includes(view ?? "") ? (view as (typeof VIEWS)[number]) : "hierarchy";
  const viewLabel = { hierarchy: "viewHierarchy", picture: "viewPicture", list: "viewList", chart: "viewChart" } as const;
  const tabs = (
    <Segmented
      className="w-fit"
      items={VIEWS.map((v) => ({
        href: v === "hierarchy" ? `/tree/${id}` : `/tree/${id}?view=${v}`,
        label: t(viewLabel[v]),
        active: current === v,
      }))}
    />
  );

  if (current !== "chart") {
    // The whole lineage: from the eldest known ancestor of this person up to three generations past them
    const { rootId, path } = await lineageRoot(id, 8);
    const root = await descendants(rootId, Math.min(10, path.length + 2));
    if (!root) notFound();
    const person = path.length > 1 ? (await pedigree(id, 1))[0][0] : root;
    const tp = await getTranslations("person");

    if (current === "list") {
      // Everyone in the lineage, generation by generation, in birth order
      const rows: { gen: number; node: DescendantNode }[] = [];
      const walk = (n: DescendantNode, gen: number) => {
        rows.push({ gen, node: n });
        n.children.forEach((c) => walk(c, gen + 1));
      };
      walk(root, 1);
      const gens = [...new Set(rows.map((r) => r.gen))].sort((a, b) => a - b);
      const onPath = new Set(path);
      const people =
        rows.length + rows.reduce((n, r) => n + r.node.spouses.length, 0);
      // The columns after the member code; a spouse's row shows ⚭ in place of the code
      const cells = (p: TreeNode, focus: boolean) => [
        <td key="name" className="p-2">
          <Link
            href={`/person/${p.id}`}
            className={`hover:text-brand ${focus ? "font-bold text-brand" : "font-medium"}`}
          >
            {fullName(p)}
          </Link>
          {(p.givenNameLocal || p.surnameLocal) && (
            <div className="text-xs text-muted">
              {[p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}
            </div>
          )}
        </td>,
        <td key="life" className="p-2 whitespace-nowrap">
          {lifeSpan(p)}
        </td>,
        <td key="gotra" className="p-2">
          {gotraLabel(p.gotra, locale) ?? "–"}
        </td>,
        <td key="state" className="p-2">
          {p.status && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">
              {tp(
                `state_${personState({ status: p.status, isLiving: p.isLiving })}`,
              )}
            </span>
          )}
        </td>,
      ];
      return (
        <div className="flex flex-col gap-4">
          <PageTitle eyebrow={t("eyebrow")} sub={t("listHint", { people, generations: gens.length })}>
            {t("title", { name: person ? fullName(person) : fullName(root) })}
          </PageTitle>
          {tabs}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-brand-soft text-left">
                <tr>
                  <th className="p-2 pl-4">{t("colCode")}</th>
                  <th className="p-2">{t("colName")}</th>
                  <th className="p-2">{t("colLife")}</th>
                  <th className="p-2">{tp("ownGotra")}</th>
                  <th className="p-2">{t("colState")}</th>
                </tr>
              </thead>
              {gens.map((g) => (
                <tbody key={g}>
                  <tr>
                    <th
                      colSpan={5}
                      className="border-b border-line bg-surface p-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {g === 1 ? t("eldest") : t("generation", { n: g - 1 })}
                    </th>
                  </tr>
                  {rows
                    .filter((r) => r.gen === g)
                    .flatMap((r) => [
                      <tr
                        key={r.node.id}
                        className={`border-b border-line ${onPath.has(r.node.id) ? "bg-brand-soft/40" : ""}`}
                      >
                        <td className="p-2 pl-4 font-mono text-xs text-muted">
                          {r.node.memberNo ? memberCode(r.node.memberNo) : ""}
                        </td>
                        {cells(r.node, r.node.id === id)}
                      </tr>,
                      // Spouses sit right under the person they married into the family with
                      ...r.node.spouses.map((sp) => (
                        <tr
                          key={`${r.node.id}-${sp.id}`}
                          className="border-b border-line text-muted"
                        >
                          <td className="p-2 pl-4 text-right text-xs">⚭</td>
                          {cells(sp, sp.id === id)}
                        </tr>
                      )),
                    ])}
                </tbody>
              ))}
            </table>
          </Card>
        </div>
      );
    }

    const heading = t("title", { name: person ? fullName(person) : fullName(root) });
    if (current === "picture") {
      return (
        <div className="flex flex-col gap-4">
          <PageTitle eyebrow={t("eyebrow")} sub={t("pictureHint")}>
            {heading}
          </PageTitle>
          {tabs}
          <TreeViewport>
            <PictorialTree
              root={root}
              path={path}
              focusId={id}
              href={(pid) => `/${locale}/person/${pid}`}
              labels={{
                generation: (n) => t("generation", { n }),
                you: t("thisPerson"),
              }}
            />
          </TreeViewport>
          <p className="text-xs text-muted">{t("legend")}</p>
        </div>
      );
    }

    // Default: the top-down hierarchy
    return (
      <div className="flex flex-col gap-4">
        <PageTitle eyebrow={t("eyebrow")} sub={t("hierarchyHint")}>
          {heading}
        </PageTitle>
        {tabs}
        <TreeViewport>
          <HierarchyTree
            root={root}
            path={path}
            focusId={id}
            locale={locale}
            href={(pid) => `/${locale}/person/${pid}`}
            labels={{
              generation: (n) => t("generation", { n }),
              you: t("focusBadge"),
              eldest: t("eldest"),
            }}
          />
        </TreeViewport>
      </div>
    );
  }

  const [rows, desc, editable] = await Promise.all([
    pedigree(id, 6),
    descendants(id, 4),
    editableIds(user),
  ]);
  if (!rows[0][0] || !desc) notFound();
  const canEdit = (pid: string) => editable === null || editable.has(pid);

  const Box = ({ p }: { p: TreeNode | null | undefined }) =>
    p === undefined ? (
      <div aria-hidden className="h-[54px]" />
    ) : p ? (
      <Link
        href={`/person/${p.id}`}
        className={`block rounded-xl border border-l-4 px-3 py-2 text-sm shadow-sm transition hover:border-brand ${
          p.gender === "FEMALE" ? "border-l-accent" : "border-l-brand"
        } ${canEdit(p.id) ? "border-line bg-surface" : "border-dashed border-line bg-background"}`}
      >
        <div className="font-medium leading-tight">{fullName(p)}</div>
        <div className="text-xs text-muted">{lifeSpan(p)}</div>
      </Link>
    ) : (
      <div className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
        {t("unknown")}
      </div>
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
      <PageTitle eyebrow={t("eyebrow")}>{t("title", { name: fullName(rows[0][0]) })}</PageTitle>
      {tabs}

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
