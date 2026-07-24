"use client";

import type { CSSProperties } from "react";

const PARTICLE_COLORS = ["#818CF8", "#C084FC", "#34D399", "#38BDF8", "#F472B6"];

function createParticles() {
  return Array.from({ length: 28 }, (_, index) => {
    const seed = index + 1;

    return {
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      delay: -((seed * 1.37) % 18),
      duration: 10 + ((seed * 1.91) % 14),
      left: `${(seed * 37) % 100}%`,
      opacity: 0.22 + ((seed * 13) % 38) / 100,
      size: 1.5 + ((seed * 17) % 30) / 10,
      start: `${-8 - ((seed * 19) % 24)}px`,
    };
  });
}

const PARTICLES = createParticles();

export function AuroraBackground() {
  return (
    <div className="modern-login-scene" aria-hidden="true">
      <div className="modern-login-aurora">
        <span className="modern-login-blob is-one" />
        <span className="modern-login-blob is-two" />
        <span className="modern-login-blob is-three" />
        <span className="modern-login-blob is-four" />
        <span className="modern-login-blob is-five" />
      </div>
      <div className="modern-login-dot-grid" />
      <div className="modern-login-particles">
        {PARTICLES.map((particle, index) => (
          <span
            className="modern-login-particle"
            key={index}
            style={
              {
                "--delay": `${particle.delay}s`,
                "--duration": `${particle.duration}s`,
                "--op": particle.opacity,
                backgroundColor: particle.color,
                bottom: particle.start,
                height: particle.size,
                left: particle.left,
                width: particle.size,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
