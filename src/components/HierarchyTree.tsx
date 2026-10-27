import Image from "next/image";
import type { DescendantNode, TreeNode } from "@/lib/tree";
import { fullName, gotraLabel, lifeSpan } from "@/lib/reference";

const photoUrl = (id: string, at: Date) => `/api/photo/${id}?v=${at.getTime()}`;

type Labels = { you: string; generation: (n: number) => string; eldest: string; childNo: (n: number) => string; spouseNo: (n: number) => string };

/**
 * The family as a top-down hierarchy: the eldest known ancestor at the top, each generation one
 * row lower, a couple sharing one card, and elbow connectors down to their children (CSS in
 * globals.css, `.htree`). The line from the ancestor to the person (`path`) is picked out in
 * turmeric and the person ringed. Server-rendered; every name links to the person's page.
 */
export function HierarchyTree({
  root,
  path,
  focusId,
  locale,
  href,
  labels,
}: {
  root: DescendantNode;
  path: string[];
  focusId: string;
  locale: string;
  href: (id: string) => string;
  labels: Labels;
}) {
  const onPath = new Set(path);

  const person = (p: TreeNode, focus: boolean) => (
    <a href={href(p.id)} className="group flex min-w-0 items-center gap-2.5 rounded-xl p-1 pr-2 transition hover:bg-brand-soft/60">
      <span
        className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-surface-2 ${
          p.gender === "FEMALE" ? "border-gold/70" : "border-brand/50"
        } ${p.isLiving ? "" : "grayscale-[35%]"}`}
      >
        {p.photo?.visible ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own access-checked route
          <img src={photoUrl(p.id, p.photo.updatedAt)} alt="" className="size-full object-cover" />
        ) : (
          <Image src={`/icons/3d/${p.gender === "FEMALE" ? "girl" : "boy"}.png`} alt="" width={32} height={32} className="size-7" />
        )}
      </span>
      <span className="min-w-0 text-left">
        <span className={`block max-w-40 truncate text-sm leading-tight group-hover:text-brand ${focus ? "font-bold text-brand" : "font-semibold"}`}>
          {fullName(p)}
        </span>
        <span className="block max-w-40 truncate text-[11px] text-muted">
          {[lifeSpan(p), gotraLabel(p.gotra, locale)].filter(Boolean).join(" · ") || " "}
        </span>
      </span>
    </a>
  );

  // `no` is the child no. among the parents' children (siblings are already in order)
  const branch = (n: DescendantNode, gen: number, no?: number) => {
    const focus = n.id === focusId;
    const lit = onPath.has(n.id);
    return (
      <li key={n.id} data-path={lit || undefined}>
        <div
          data-focus={focus || undefined}
          className={`relative inline-flex flex-col rounded-2xl border bg-surface p-1.5 shadow-soft ${
            focus ? "border-accent ring-4 ring-accent/20" : lit ? "border-accent/50" : "border-line"
          }`}
        >
          <span className="absolute -top-2.5 left-3 rounded-full border border-line bg-background px-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {[focus ? labels.you : gen === 0 ? labels.eldest : labels.generation(gen), no && labels.childNo(no)].filter(Boolean).join(" · ")}
          </span>
          <div className="flex flex-col gap-0.5 pt-1.5 sm:flex-row sm:items-center">
            {person(n, focus)}
            {n.spouses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 border-t border-dashed border-line pt-0.5 sm:border-l sm:border-t-0 sm:pl-1 sm:pt-0">
                <span className="flex flex-col items-center px-1 leading-none text-accent" title={n.spouses.length > 1 ? labels.spouseNo(i + 1) : undefined}>
                  <span aria-hidden>⚭</span>
                  {n.spouses.length > 1 && <span className="mt-0.5 text-[10px] font-bold">{i + 1}</span>}
                </span>
                {person(s, s.id === focusId)}
              </div>
            ))}
          </div>
        </div>
        {n.children.length > 0 && <ul data-path={n.children.some((c) => onPath.has(c.id)) || undefined}>{n.children.map((c, i) => branch(c, gen + 1, n.children.length > 1 ? i + 1 : undefined))}</ul>}
      </li>
    );
  };

  return (
    <div className="htree">
      <ul>{branch(root, 0)}</ul>
    </div>
  );
}
