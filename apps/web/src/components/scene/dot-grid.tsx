"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  cloneDotGridTheme,
  DARK_DOT_GRID_THEME,
  LIGHT_DOT_GRID_THEME,
} from "@/components/scene/dot-grid-themes";
import {
  buildDots,
  lerpTheme,
  renderDotGrid,
  type DotGridPoint,
} from "@/components/scene/dot-grid-utils";

function getActiveTheme() {
  return document.documentElement.dataset.theme === "light"
    ? LIGHT_DOT_GRID_THEME
    : DARK_DOT_GRID_THEME;
}

export function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<DotGridPoint[]>([]);
  const mouseRef = useRef({ x: -999, y: -999 });
  const rafRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const sizeRef = useRef({ height: 0, width: 0 });
  const targetThemeRef = useRef(cloneDotGridTheme(DARK_DOT_GRID_THEME));
  const themeRef = useRef(cloneDotGridTheme(DARK_DOT_GRID_THEME));

  const resize = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { height, width };
    dotsRef.current = buildDots(width, height);
  }, []);

  useEffect(() => {
    targetThemeRef.current = cloneDotGridTheme(getActiveTheme());
    themeRef.current = cloneDotGridTheme(getActiveTheme());

    const observer = new MutationObserver(() => {
      targetThemeRef.current = cloneDotGridTheme(getActiveTheme());
    });

    observer.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const onLeave = () => {
      mouseRef.current = { x: -999, y: -999 };
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => {
      reducedMotionRef.current = motionQuery.matches;
    };

    updateReducedMotion();
    motionQuery.addEventListener("change", updateReducedMotion);

    return () => motionQuery.removeEventListener("change", updateReducedMotion);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const loop = (timestamp: number) => {
      const { height, width } = sizeRef.current;

      lerpTheme(themeRef.current, targetThemeRef.current);
      renderDotGrid({
        context,
        dots: dotsRef.current,
        height,
        mouse: mouseRef.current,
        theme: themeRef.current,
        time: reducedMotionRef.current ? 0 : timestamp / 1000,
        width,
      });

      if (!reducedMotionRef.current) {
        rafRef.current = window.requestAnimationFrame(loop);
      }
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => window.cancelAnimationFrame(rafRef.current);
  }, []);

  return <canvas ref={canvasRef} className="modern-login-dot-canvas" aria-hidden="true" />;
}
