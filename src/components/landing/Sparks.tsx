"use client";

import { useEffect, useRef } from "react";

/**
 * Turmeric sparks – like embers rising from a diya – drifting up around the hero tree, nudged
 * away by the pointer. Plain canvas, a few dozen points. It draws only while on screen and the tab
 * is visible, and not at all for people who ask their system for reduced motion.
 */
export function Sparks({ className = "", count = 46 }: { className?: string; count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const styles = getComputedStyle(el);
    // Glowing light adds up on a dark page; on a light one it turns to grey, so sparks are painted instead
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const colours = [styles.getPropertyValue("--accent").trim() || "#e8a33d", styles.getPropertyValue("--brand").trim() || "#a3341f", "#f6d48b"];
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    type Spark = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; c: string; phase: number };
    const spawn = (anywhere: boolean): Spark => {
      const max = 6 + Math.random() * 8;
      return {
        x: w * (0.15 + Math.random() * 0.7),
        y: anywhere ? Math.random() * h : h * (0.75 + Math.random() * 0.3),
        vx: (Math.random() - 0.5) * 6,
        vy: -(8 + Math.random() * 18),
        r: 0.8 + Math.random() * 2.2,
        life: anywhere ? Math.random() * max : 0,
        max,
        c: colours[Math.floor(Math.random() * colours.length)],
        phase: Math.random() * Math.PI * 2,
      };
    };
    const sparks = Array.from({ length: count }, () => spawn(true));
    const pointer = { x: -1e4, y: -1e4 };

    let frame = 0, last = performance.now(), visible = true;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = dark.matches ? "lighter" : "source-over";
      const halo = dark.matches ? 4 : 2.6;
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.life += dt;
        if (s.life > s.max || s.y < -10) {
          sparks[i] = spawn(false);
          continue;
        }
        // A gentle sideways sway, and a push away from the pointer
        const dx = s.x - pointer.x, dy = s.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 110 * 110) {
          const f = (1 - Math.sqrt(d2) / 110) * 220 * dt;
          s.vx += (dx / (Math.sqrt(d2) || 1)) * f;
          s.vy += (dy / (Math.sqrt(d2) || 1)) * f;
        }
        s.vx *= 0.98;
        s.x += (s.vx + Math.sin(now / 900 + s.phase) * 6) * dt;
        s.y += s.vy * dt;
        // Fade in, glow, fade out
        const t = s.life / s.max;
        const alpha = Math.min(1, t * 5) * (1 - t) * 0.9;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * halo);
        g.addColorStop(0, s.c);
        g.addColorStop(dark.matches ? 1 : 0.45, dark.matches ? "transparent" : s.c);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = dark.matches ? alpha : alpha * 0.7;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * halo, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || !visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onMove, { passive: true });
    start();
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
    };
  }, [count]);

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none ${className}`} />;
}
