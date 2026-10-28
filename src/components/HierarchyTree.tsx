import Image from "next/image";
import type { DescendantNode, TreeNode } from "@/lib/tree";
import { fullName, gotraLabel, lifeSpan } from "@/lib/reference";

const photoUrl = (id: string, at: Date) => `/api/photo/${id}?v=${at.getTime()}`;

type Labels = {
  you: string;
  generation: (n: number) => string;
  eldest: string;
  childNo: (n: number) => string;
  spouseNo: (n: number) => string;
  /** Gotra prefixes when all three are shown: own, birth, mother's */
  gotraShort: { own: string; birth: string; mother: string };
  actions: string;
  open: string;
  edit: string;
  addParent: string;
  addSpouse: string;
  addChild: string;
  collapse: (n: number) => string;
};

/** Everyone below a node (children, their spouses, grandchildren…), for the collapse button. */
const below = (n: DescendantNode): number => n.children.reduce((s, c) => s + 1 + c.spouses.length + below(c), 0);

/**
 * The family as a top-down hierarchy: the eldest known ancestor at the top, each generation one
 * row lower, a couple sharing one card, and elbow connectors down to their children (CSS in
 * globals.css, `.htree`). The line from the ancestor to the person (`path`) is picked out in
 * turmeric and the person ringed. Server-rendered; every name links to the person's page.
 *
 * Each card carries all three gotras; the tree frame's gotra switch decides which show (CSS, by
 * `data-gotra` on the frame). People the viewer may edit get a small menu (a plain <details>, so it
 * works without scripts), and branches with children a collapse button that TreeViewport handles.
 * Private people are already masked by the caller: no name, gotras, menu, or search name.
 */
export function HierarchyTree({
  root,
  path,
  focusId,
  locale,
  href,
  labels,
  canEdit,
}: {
  root: DescendantNode;
  path: string[];
  focusId: string;
  locale: string;
  href: (id: string) => string;
  labels: Labels;
  /** Whether the viewer may edit this person (the actions menu); the pages still check */
  canEdit: (id: string) => boolean;
}) {
  const onPath = new Set(path);

  const gotras = (p: TreeNode) => {
    const own = gotraLabel(p.gotra, locale);
    const birth = gotraLabel(p.birthGotra, locale);
    const mother = gotraLabel(p.maternalGotra, locale);
    return (
      <>
        {own && (
          <span className="g-own" title={labels.gotraShort.own}>
            <b className="g-tag">{labels.gotraShort.own} </b>
            {own}
          </span>
        )}
        {birth && (
          <span className="g-birth" title={labels.gotraShort.birth}>
            <b className="g-tag">{labels.gotraShort.birth} </b>
            {birth}
          </span>
        )}
        {mother && (
          <span className="g-mother" title={labels.gotraShort.mother}>
            <b className="g-tag">{labels.gotraShort.mother} </b>
            {mother}
          </span>
        )}
      </>
    );
  };

  const menu = (p: TreeNode) => (
    <details className="node-menu relative print:hidden">
      <summary aria-label={labels.actions} title={labels.actions} className="grid size-6 cursor-pointer list-none place-items-center rounded-full text-muted hover:bg-brand-soft hover:text-brand">
        ⋯
      </summary>
      <div className="absolute right-0 top-7 z-20 flex w-44 flex-col rounded-xl border border-line bg-surface p-1 text-left text-sm shadow-soft">
        <a href={href(p.id)} className="rounded-lg px-3 py-1.5 hover:bg-brand-soft">
          {labels.open}
        </a>
        <a href={`${href(p.id)}/edit`} className="rounded-lg px-3 py-1.5 hover:bg-brand-soft">
          {labels.edit}
        </a>
        <a href={`${href(p.id)}/add/parent`} className="rounded-lg px-3 py-1.5 hover:bg-brand-soft">
          + {labels.addParent}
        </a>
        <a href={`${href(p.id)}/add/spouse`} className="rounded-lg px-3 py-1.5 hover:bg-brand-soft">
          + {labels.addSpouse}
        </a>
        <a href={`${href(p.id)}/add/child`} className="rounded-lg px-3 py-1.5 hover:bg-brand-soft">
          + {labels.addChild}
        </a>
      </div>
    </details>
  );

  const person = (p: TreeNode, focus: boolean) =>
    p.private ? (
      // Private to this viewer: a placeholder in its place, nothing to open
      <span className="flex min-w-0 items-center gap-2.5 rounded-xl p-1 pr-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line bg-surface-2">
          <Image src="/icons/3d/lock.png" alt="" width={28} height={28} loading="eager" className="size-6" />
        </span>
        <span className="text-sm italic text-muted">{p.givenName}</span>
      </span>
    ) : (
      <span className="flex min-w-0 items-center" data-person={p.id} data-name={[fullName(p), p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}>
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
              <Image src={`/icons/3d/${p.gender === "FEMALE" ? "girl" : "boy"}.png`} alt="" width={32} height={32} loading="eager" className="size-7" />
            )}
          </span>
          <span className="min-w-0 text-left">
            <span className={`block max-w-40 truncate text-sm leading-tight group-hover:text-brand ${focus ? "font-bold text-brand" : "font-semibold"}`}>
              {fullName(p)}
            </span>
            <span className="block max-w-40 truncate text-[11px] text-muted">{lifeSpan(p) || " "}</span>
            <span className="gotras block max-w-44 text-[11px] leading-snug text-muted">{gotras(p)}</span>
          </span>
        </a>
        {canEdit(p.id) && menu(p)}
      </span>
    );

  // `no` is the child no. among the parents' children (siblings are already in order)
  const branch = (n: DescendantNode, gen: number, no?: number) => {
    const focus = n.id === focusId;
    const lit = onPath.has(n.id);
    const hidden = below(n);
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
          {n.children.length > 0 && (
            // Handled by TreeViewport (one listener for the whole tree); the count shows when collapsed
            <button
              type="button"
              data-toggle
              aria-expanded="true"
              title={labels.collapse(hidden)}
              className="branch-toggle absolute -bottom-3 left-1/2 z-10 grid h-6 min-w-6 -translate-x-1/2 place-items-center rounded-full border border-line bg-surface px-1.5 text-[11px] leading-none text-muted shadow-soft hover:text-brand print:hidden"
            >
              <span className="when-open">−</span>
              <span className="when-closed">+{hidden}</span>
            </button>
          )}
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
