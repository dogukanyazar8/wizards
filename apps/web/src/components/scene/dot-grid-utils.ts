import type { DotGridThemeValues } from "@/components/scene/dot-grid-themes";

export interface DotGridPoint {
  baseR: number;
  colorIdx: number;
  offset: number;
  x: number;
  y: number;
}

interface MousePoint {
  x: number;
  y: number;
}

interface NearDot extends DotGridPoint {
  dist: number;
  prox: number;
}

function getGridSpacing(width: number, height: number) {
  const area = width * height;
  const cappedSpacing = Math.sqrt(area / 2800);

  if (width < 768) {
    return 0;
  }

  if (width < 1280) {
    return Math.max(38, cappedSpacing);
  }

  return Math.max(34, cappedSpacing);
}

export function buildDots(width: number, height: number): DotGridPoint[] {
  const spacing = getGridSpacing(width, height);

  if (!spacing) {
    return [];
  }

  const dots: DotGridPoint[] = [];
  const cols = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / spacing) + 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      dots.push({
        baseR: 1.2 + Math.random() * 0.8,
        colorIdx: Math.floor(Math.random() * 6),
        offset: Math.random() * Math.PI * 2,
        x: col * spacing - spacing / 2 + (row % 2) * spacing * 0.5,
        y: row * spacing,
      });
    }
  }

  return dots;
}

export function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

export function lerpTheme(current: DotGridThemeValues, target: DotGridThemeValues, amount = 0.04) {
  current.baseAlpha = lerp(current.baseAlpha, target.baseAlpha, amount);
  current.waveAlpha = lerp(current.waveAlpha, target.waveAlpha, amount);
  current.spotBoost = lerp(current.spotBoost, target.spotBoost, amount);
  current.spotRadiusBoost = lerp(current.spotRadiusBoost, target.spotRadiusBoost, amount);
  current.spotlightRadius = lerp(current.spotlightRadius, target.spotlightRadius, amount);
  current.lineRadius = lerp(current.lineRadius, target.lineRadius, amount);
  current.lineOpacity = lerp(current.lineOpacity, target.lineOpacity, amount);
  current.glowAlpha = lerp(current.glowAlpha, target.glowAlpha, amount);
  current.glowBlurMult = lerp(current.glowBlurMult, target.glowBlurMult, amount);

  for (let colorIndex = 0; colorIndex < current.dotColors.length; colorIndex += 1) {
    const currentColor = current.dotColors[colorIndex];
    const targetColor = target.dotColors[colorIndex];

    if (!currentColor || !targetColor) {
      continue;
    }

    for (let channel = 0; channel < 3; channel += 1) {
      currentColor[channel] = lerp(currentColor[channel] ?? 0, targetColor[channel] ?? 0, amount);
    }
  }
}

export function renderDotGrid({
  context,
  dots,
  height,
  mouse,
  theme,
  time,
  width,
}: {
  context: CanvasRenderingContext2D;
  dots: DotGridPoint[];
  height: number;
  mouse: MousePoint;
  theme: DotGridThemeValues;
  time: number;
  width: number;
}) {
  context.clearRect(0, 0, width, height);

  const nearDots: NearDot[] = [];

  for (const dot of dots) {
    const color = theme.dotColors[dot.colorIdx] ?? theme.dotColors[0] ?? [129, 140, 248];
    const red = color[0] ?? 129;
    const green = color[1] ?? 140;
    const blue = color[2] ?? 248;
    const wave = Math.sin(dot.x * 0.015 + time * 0.8) * Math.cos(dot.y * 0.012 + time * 0.5);
    const breath = Math.sin(time * 1.35 + dot.offset) * 0.12;
    const dx = dot.x - mouse.x;
    const dy = dot.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const prox = Math.max(0, 1 - dist / theme.spotlightRadius);
    const alpha = Math.min(
      1,
      theme.baseAlpha +
        Math.abs(wave) * theme.waveAlpha +
        prox * theme.spotBoost +
        Math.abs(breath) * 0.015,
    );
    const radius = Math.max(0.3, dot.baseR + wave * 0.4 + breath + prox * theme.spotRadiusBoost);

    if (prox > 0.25) {
      context.shadowColor = `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${theme.glowAlpha})`;
      context.shadowBlur = prox * theme.glowBlurMult;
    } else {
      context.shadowBlur = 0;
    }

    context.beginPath();
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha.toFixed(3)})`;
    context.fill();

    if (prox > 0.08) {
      nearDots.push({ ...dot, dist, prox });
    }
  }

  context.shadowBlur = 0;

  const lineRadius = theme.lineRadius;

  for (let firstIndex = 0; firstIndex < nearDots.length; firstIndex += 1) {
    const first = nearDots[firstIndex];

    if (!first || first.dist > lineRadius) {
      continue;
    }

    for (let secondIndex = firstIndex + 1; secondIndex < nearDots.length; secondIndex += 1) {
      const second = nearDots[secondIndex];

      if (!second || second.dist > lineRadius) {
        continue;
      }

      const pairDist = Math.sqrt((first.x - second.x) ** 2 + (first.y - second.y) ** 2);

      if (pairDist >= lineRadius) {
        continue;
      }

      const lineAlpha =
        (1 - pairDist / lineRadius) * Math.min(first.prox, second.prox) * theme.lineOpacity;

      context.beginPath();
      context.moveTo(first.x, first.y);
      context.lineTo(second.x, second.y);
      context.strokeStyle = `rgba(129,140,248,${lineAlpha.toFixed(3)})`;
      context.lineWidth = 0.5;
      context.stroke();
    }
  }
}
