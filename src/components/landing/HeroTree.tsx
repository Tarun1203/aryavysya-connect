"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Parallax } from "./motion";

/*
 * Three generations drawn in a 100 × 110 box: grandparents, parents (the mother marries in), and
 * three grandchildren. Branches draw themselves in, then a point of light walks the lineage.
 */
type Node = { x: number; y: number; icon: "boy" | "girl"; gen: number; focus?: boolean };
const NODES: Node[] = [
  { x: 26, y: 14, icon: "boy", gen: 0 },
  { x: 54, y: 14, icon: "girl", gen: 0 },
  { x: 40, y: 50, icon: "boy", gen: 1, focus: true },
  { x: 68, y: 50, icon: "girl", gen: 1 },
  { x: 30, y: 92, icon: "girl", gen: 2 },
  { x: 54, y: 92, icon: "boy", gen: 2 },
  { x: 78, y: 92, icon: "girl", gen: 2 },
];
const BRANCHES = [
  { d: "M26 14 H54", delay: 0.3, marriage: true },
  { d: "M40 14 V42", delay: 0.6 },
  { d: "M40 50 H68", delay: 0.9, marriage: true },
  { d: "M54 50 V72 H30 V84", delay: 1.2 },
  { d: "M54 72 V84", delay: 1.3 },
  { d: "M54 72 H78 V84", delay: 1.4 },
];
const LINEAGE = "M40 14 V50 H54 V72 V92";

export function HeroTree() {
  return (
    <div className="relative mx-auto aspect-[10/11] w-full max-w-[460px]">
      {/* glass panel */}
      <div className="absolute inset-[4%] rounded-[2rem] border border-line bg-surface/60 shadow-soft backdrop-blur-sm">
        <div className="bg-dots fade-radial absolute inset-0 rounded-[2rem] opacity-70" />
      </div>

      <svg viewBox="0 0 100 110" className="absolute inset-[4%] h-[92%] w-[92%] overflow-visible" fill="none">
        <defs>
          <linearGradient id="hero-branch" x1="0" y1="0" x2="0" y2="110" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
          <filter id="hero-glow">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>
        {BRANCHES.map((b) =>
          b.marriage ? (
            <motion.path
              key={b.d}
              d={b.d}
              stroke="var(--accent)"
              strokeWidth={0.45}
              strokeDasharray="1.6 1.2"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.9 }}
              transition={{ duration: 0.6, delay: b.delay }}
            />
          ) : (
            <motion.path
              key={b.d}
              d={b.d}
              stroke="url(#hero-branch)"
              strokeWidth={0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: b.delay, ease: "easeInOut" }}
            />
          ),
        )}
        {/* the light walking down the direct line */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
          <circle r="2.2" fill="var(--accent)" filter="url(#hero-glow)">
            <animateMotion dur="4.5s" repeatCount="indefinite" path={LINEAGE} />
          </circle>
          <circle r="0.9" fill="#fff">
            <animateMotion dur="4.5s" repeatCount="indefinite" path={LINEAGE} />
          </circle>
        </motion.g>
      </svg>

      {/* medallions, positioned over the SVG box */}
      <div className="absolute inset-[4%]">
        {NODES.map((n, i) => (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${(n.y / 110) * 100}%` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.15 + n.gen * 0.45 + i * 0.05 }}
          >
            <div
              className={`grid size-11 place-items-center rounded-full border-2 bg-surface shadow-soft sm:size-16 ${
                n.focus ? "border-accent ring-4 ring-accent/20" : n.icon === "boy" ? "border-brand/50" : "border-gold/70"
              }`}
            >
              <Image src={`/icons/3d/${n.icon}.png`} alt="" width={56} height={56} className="size-8 sm:size-12" />
            </div>
            <div className="mx-auto mt-1.5 h-1.5 w-8 rounded-full bg-line sm:w-10" />
            <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-line/70" />
          </motion.div>
        ))}
      </div>

      {/* floating 3D decorations */}
      <Parallax depth={-18} className="absolute -left-2 top-[34%] w-16 sm:w-20">
        <Image src="/icons/3d/map-pin.png" alt="" width={120} height={120} className="animate-float drop-shadow-xl" priority />
      </Parallax>
      <Parallax depth={22} className="absolute -right-3 top-[2%] w-14 sm:w-16">
        <Image src="/icons/3d/star.png" alt="" width={100} height={100} className="animate-float drop-shadow-xl [animation-delay:-2s]" priority />
      </Parallax>
      <Parallax depth={14} className="absolute bottom-[3%] -right-1 w-14 sm:w-[72px]">
        <Image src="/icons/3d/heart.png" alt="" width={100} height={100} className="animate-float drop-shadow-xl [animation-delay:-4s]" priority />
      </Parallax>
    </div>
  );
}
