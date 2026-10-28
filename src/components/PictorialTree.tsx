import type { DescendantNode, TreeNode } from "@/lib/tree";

const photoUrl = (id: string, at: Date) => `/api/photo/${id}?v=${at.getTime()}`;

/**
 * The family drawn as a tree: the eldest known ancestor at the trunk, each generation one level
 * higher on curving branches that thin out as they climb, every person a medallion among leaves
 * with their spouse beside them. `path` (ancestor → person) is drawn in gold and the person ringed.
 * Pure SVG, rendered on the server; each medallion links to the person's page.
 */
type Placed = { node: DescendantNode; gen: number; x: number; y: number; parent?: Placed };

const UNIT = 150; // horizontal space per leaf person
const ROW = 170; // vertical space per generation
const TOP = 70;
const GROUND = 150; // room for the trunk and roots under the eldest ancestor
const R = 28; // medallion radius
const R_SPOUSE = 19;

const SPOUSE_W = 0.55; // extra units a spouse needs
const MARGIN = 96; // left margin for the generation labels

/** Width in units each subtree needs: its own medallions, or its children side by side. */
function width(n: DescendantNode): number {
  const own = 1 + n.spouses.length * SPOUSE_W;
  const kids = n.children.reduce((s, c) => s + width(c), 0);
  return Math.max(own, kids);
}

function depthOf(n: DescendantNode): number {
  return 1 + Math.max(0, ...n.children.map(depthOf));
}

function layout(root: DescendantNode) {
  const depth = depthOf(root);
  const height = TOP + (depth - 1) * ROW + GROUND;
  const placed: Placed[] = [];
  const place = (n: DescendantNode, gen: number, left: number, parent?: Placed) => {
    const w = width(n);
    const me: Placed = { node: n, gen, x: MARGIN + (left + w / 2) * UNIT, y: height - GROUND - gen * ROW, parent };
    placed.push(me);
    // Children are centred under (well, above) their parent
    const kidsW = n.children.reduce((s, c) => s + width(c), 0);
    let cursor = left + (w - kidsW) / 2;
    for (const c of n.children) {
      place(c, gen + 1, cursor, me);
      cursor += width(c);
    }
  };
  place(root, 0, 0);
  return { placed, width: MARGIN + Math.max(width(root) * UNIT, 360), height, depth };
}

/** Deterministic 0..1 from an id, so the leaves don't move between renders. */
function rand(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const initials = (p: TreeNode) => (p.givenName[0] ?? "") + (p.surname[0] ?? "");
const year = (d: string | null) => d?.slice(0, 4) ?? "";
const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function Medallion({ p, cx, cy, r, focus, href }: { p: TreeNode; cx: number; cy: number; r: number; focus?: boolean; href: string }) {
  return (
    // A private person has no link to follow, and no name for the tree's find box
    <a
      href={p.private ? undefined : href}
      aria-label={`${p.givenName} ${p.surname}`}
      data-name={p.private ? undefined : [p.givenName, p.surname, p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}
    >
      <title>{`${p.givenName} ${p.surname}${year(p.birthDate) ? ` · ${year(p.birthDate)}` : ""}`}</title>
      {focus && <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="var(--color-foreground)" strokeWidth={3} />}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={p.gender === "FEMALE" ? "var(--color-accent)" : "var(--color-brand)"}
        stroke="var(--color-surface)"
        strokeWidth={3}
        strokeDasharray={p.isLiving ? undefined : "4 3"}
        opacity={p.isLiving ? 1 : 0.8}
      />
      {/* Only photos the family chose to show appear in the tree; hidden ones stay initials for everyone */}
      {p.photo?.visible ? (
        <>
          <clipPath id={`clip-${p.id}`}>
            <circle cx={cx} cy={cy} r={r - 2.5} />
          </clipPath>
          <image
            href={photoUrl(p.id, p.photo.updatedAt)}
            x={cx - r + 2.5}
            y={cy - r + 2.5}
            width={(r - 2.5) * 2}
            height={(r - 2.5) * 2}
            clipPath={`url(#clip-${p.id})`}
            preserveAspectRatio="xMidYMid slice"
            opacity={p.isLiving ? 1 : 0.85}
          />
        </>
      ) : (
        <text x={cx} y={cy + r * 0.18} textAnchor="middle" fontSize={r * 0.62} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
          {initials(p)}
        </text>
      )}
    </a>
  );
}

export function PictorialTree({
  root,
  path,
  focusId,
  href,
  labels,
}: {
  root: DescendantNode;
  /** ids from the eldest ancestor down to the focused person */
  path: string[];
  focusId: string;
  href: (id: string) => string;
  labels: { generation: (n: number) => string; you: string };
}) {
  const { placed, width: w, height: h, depth } = layout(root);
  const onPath = new Set(path);
  const rootPos = placed[0];

  const branch = (p: Placed) => {
    const from = p.parent!;
    const x1 = from.x, y1 = from.y - R * 0.6, x2 = p.x, y2 = p.y + R * 0.8;
    const mid = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid + 20}, ${x2} ${y2}`;
  };
  const thickness = (gen: number) => Math.max(3, 20 - gen * 3.5);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`${root.givenName} ${root.surname}`}
      className="block max-w-none select-none"
      style={{ fontFamily: "inherit" }}
    >
      <defs>
        <linearGradient id="bark" x1="0" x2="1">
          <stop offset="0" stopColor="#5b3a1e" />
          <stop offset="0.5" stopColor="#8a5a2f" />
          <stop offset="1" stopColor="#5b3a1e" />
        </linearGradient>
        <radialGradient id="canopy" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#7cb342" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7cb342" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* canopy glow and ground */}
      <ellipse cx={w / 2} cy={(h - GROUND) / 2 + 20} rx={w / 2} ry={(h - GROUND) / 2 + 40} fill="url(#canopy)" />
      <ellipse cx={rootPos.x} cy={h - 22} rx={Math.min(w / 2, 260)} ry={16} fill="#6b8e23" opacity={0.35} />

      {/* trunk with roots */}
      <path
        d={`M ${rootPos.x - 30} ${h - 22} C ${rootPos.x - 18} ${h - 70}, ${rootPos.x - 14} ${rootPos.y + 60}, ${rootPos.x - 10} ${rootPos.y + R}
            L ${rootPos.x + 10} ${rootPos.y + R} C ${rootPos.x + 14} ${rootPos.y + 60}, ${rootPos.x + 18} ${h - 70}, ${rootPos.x + 30} ${h - 22} Z`}
        fill="url(#bark)"
      />
      {[-1, 1].map((s) => (
        <path key={s} d={`M ${rootPos.x + s * 20} ${h - 30} q ${s * 30} 6 ${s * 56} 16`} stroke="#5b3a1e" strokeWidth={7} strokeLinecap="round" fill="none" />
      ))}

      {/* generation guides */}
      {Array.from({ length: depth }, (_, g) => (
        <text key={g} x={12} y={h - GROUND - g * ROW + 4} fontSize={11} fill="var(--color-muted)">
          {g === 0 ? "" : labels.generation(g)}
        </text>
      ))}

      {/* branches: plain first, then the focused person's line on top */}
      {placed
        .filter((p) => p.parent)
        .sort((a, b) => Number(onPath.has(a.node.id)) - Number(onPath.has(b.node.id)))
        .map((p) => (
          <g key={`b-${p.node.id}`}>
            <path d={branch(p)} stroke="#6d4524" strokeWidth={thickness(p.gen)} strokeLinecap="round" fill="none" />
            {onPath.has(p.node.id) && onPath.has(p.parent!.node.id) && (
              <path d={branch(p)} stroke="#d4a017" strokeWidth={Math.max(2, thickness(p.gen) / 3)} strokeLinecap="round" fill="none" opacity={0.9} />
            )}
          </g>
        ))}

      {/* leaves behind each person */}
      {placed.map((p) =>
        Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2 + rand(p.node.id, i) * 0.8;
          const d = R + 6 + rand(p.node.id, i + 20) * 14;
          const lx = p.x + Math.cos(a) * d, ly = p.y + Math.sin(a) * d * 0.8;
          return (
            <ellipse
              key={`l-${p.node.id}-${i}`}
              cx={lx}
              cy={ly}
              rx={13}
              ry={6}
              transform={`rotate(${(a * 180) / Math.PI + 90} ${lx} ${ly})`}
              fill={["#558b2f", "#689f38", "#7cb342", "#33691e"][i % 4]}
              opacity={0.75}
            />
          );
        })
      )}

      {/* people */}
      {placed.map((p) => {
        const n = p.node;
        const focus = n.id === focusId;
        return (
          <g key={`p-${n.id}`} data-focus={focus || n.spouses.some((s) => s.id === focusId) ? "" : undefined}>
            {n.spouses.map((s, i) => {
              const sx = p.x + R + 8 + R_SPOUSE + i * (R_SPOUSE * 2 + 8), sy = p.y + 8;
              return (
                <g key={s.id}>
                  <path d={`M ${p.x + R - 4} ${p.y + 4} Q ${(p.x + sx) / 2} ${p.y - 10} ${sx - R_SPOUSE + 2} ${sy}`} stroke="#d4a017" strokeWidth={2} fill="none" />
                  <Medallion p={s} cx={sx} cy={sy} r={R_SPOUSE} focus={s.id === focusId} href={href(s.id)} />
                  <text x={sx} y={sy + R_SPOUSE + 13} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                    {short(s.givenName, 12)}
                  </text>
                </g>
              );
            })}
            <Medallion p={n} cx={p.x} cy={p.y} r={R} focus={focus} href={href(n.id)} />
            <text x={p.x} y={p.y + R + 16} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--color-foreground)">
              {short(n.givenName)}
            </text>
            <text x={p.x} y={p.y + R + 30} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
              {[short(n.surname, 12), year(n.birthDate)].filter(Boolean).join(" · ")}
            </text>
            {focus && (
              <text x={p.x} y={p.y - R - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#b8860b">
                {labels.you}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
