"use client";

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "", y = 18 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up from 0 once visible, formatted for the page's language. */
export function CountUp({ value, locale }: { value: number; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {shown.toLocaleString(locale)}
    </span>
  );
}

/** A card with a soft turmeric glow that follows the pointer. */
export function SpotlightCard({ children, className = "", ...props }: ComponentProps<"div">) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const glow = useMotionTemplate`radial-gradient(360px circle at ${x}px ${y}px, var(--glow), transparent 70%)`;
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left);
    y.set(e.clientY - r.top);
  };
  return (
    <div
      onMouseMove={move}
      onMouseLeave={() => (x.set(-400), y.set(-400))}
      className={`group relative overflow-hidden rounded-3xl border border-line bg-surface shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent/40 ${className}`}
      {...props}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glow }} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** A vertical line that fills with kumkum-to-turmeric light as the steps scroll past. */
export function Timeline({ steps }: { steps: { title: string; body: string; icon: ReactNode }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const fill = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1]), { stiffness: 120, damping: 28 });
  return (
    <ol ref={ref} className="relative mx-auto flex max-w-3xl flex-col gap-12 pl-14 sm:pl-20">
      <span aria-hidden className="absolute left-[22px] top-2 bottom-2 w-px bg-line sm:left-[30px]" />
      <motion.span
        aria-hidden
        style={{ scaleY: fill }}
        className="absolute left-[22px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-brand via-accent to-gold shadow-[0_0_12px_var(--accent)] sm:left-[30px]"
      />
      {steps.map((s, i) => (
        <li key={s.title} className="relative">
          <span className="absolute -left-14 top-0 grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-soft sm:-left-20 sm:size-[60px]">
            {s.icon}
          </span>
          <Reveal delay={0.05}>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">0{i + 1}</div>
            <h3 className="mt-1 font-display text-2xl font-semibold">{s.title}</h3>
            <p className="mt-2 max-w-xl text-muted">{s.body}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

/** Moves gently with the pointer, for floating decorations. */
export function Parallax({ children, depth = 12, className = "" }: { children: ReactNode; depth?: number; className?: string }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(useTransform(mx, (v) => v * depth), { stiffness: 80, damping: 20 });
  const y = useSpring(useTransform(my, (v) => v * depth), { stiffness: 80, damping: 20 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);
  return (
    <motion.div style={{ x, y }} className={className}>
      {children}
    </motion.div>
  );
}
