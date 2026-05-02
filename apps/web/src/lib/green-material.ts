type GreenFamily = {
  h: number;
  lBase: number;
  name: string;
  s: number;
};

type Bloom = {
  h: number;
  l: number;
  opacity: number;
  posX: number;
  posY: number;
  s: number;
  size: number;
};

export type GreenMaterial = {
  buttonBackground: string;
  buttonBorder: string;
  buttonShadow: string;
  cardShadow: string;
  focusBorder: string;
  focusRing: string;
  glowTint: string;
  orbs: Array<{
    background: string;
    height: string;
    left: string;
    opacity: number;
    top: string;
    width: string;
  }>;
  pageBackground: string;
};

const greenFamilies: GreenFamily[] = [
  { h: 132, lBase: 0.13, name: "pine", s: 0.48 },
  { h: 141, lBase: 0.16, name: "sage", s: 0.42 },
  { h: 151, lBase: 0.14, name: "emerald", s: 0.54 },
  { h: 161, lBase: 0.12, name: "verdigris", s: 0.46 },
  { h: 118, lBase: 0.14, name: "moss", s: 0.4 },
];

function fnv1a(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lcg(seed: number) {
  let state = seed || 1;

  return function rng() {
    state = Math.imul(48271, state) | 0;
    return (state >>> 0) / 0xffffffff;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normalizedHue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (normalizedHue < 60) {
    r = c;
    g = x;
  } else if (normalizedHue < 120) {
    r = x;
    g = c;
  } else if (normalizedHue < 180) {
    g = c;
    b = x;
  } else if (normalizedHue < 240) {
    g = x;
    b = c;
  } else if (normalizedHue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hslHex(h: number, s: number, l: number) {
  return toHex(...hslToRgb(h, s, l));
}

function rgbaString(h: number, s: number, l: number, alpha: number) {
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

export function generateGreenMaterial(seedValue: string): GreenMaterial {
  const seed = seedValue.trim() === "" ? "harwick" : seedValue.trim().toLowerCase();
  const rng = lcg(fnv1a(seed));
  const blooms: Bloom[] = [];

  for (let index = 0; index < 4; index += 1) {
    const family = greenFamilies[Math.floor(rng() * greenFamilies.length)] ?? greenFamilies[0]!;

    blooms.push({
      h: (family.h + (rng() - 0.5) * 18 + 360) % 360,
      l: 0.46 + rng() * 0.16,
      opacity: 0.18 + rng() * 0.16,
      posX: 12 + rng() * 76,
      posY: 8 + rng() * 78,
      s: Math.min(0.72, Math.max(0.34, family.s + (rng() - 0.5) * 0.12)),
      size: 28 + rng() * 24,
    });
  }

  const baseHue = blooms[0]?.h ?? 141;
  const baseAngle = 136 + Math.floor(rng() * 28);
  const darkStops = [
    hslHex(baseHue - 8, 0.34, 0.12),
    hslHex(baseHue + 6, 0.4, 0.19),
    hslHex(baseHue - 12, 0.3, 0.14),
  ];

  const bloomLayers = blooms.map((bloom) => {
    const [r, g, b] = hslToRgb(bloom.h, bloom.s, bloom.l);

    return `radial-gradient(ellipse at ${bloom.posX.toFixed(1)}% ${bloom.posY.toFixed(1)}%, rgba(${r},${g},${b},${bloom.opacity.toFixed(3)}) 0%, transparent ${bloom.size.toFixed(1)}%)`;
  });

  const texture =
    "repeating-linear-gradient(112deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 9px)";
  const baseGradient =
    `linear-gradient(${baseAngle}deg, ${darkStops[0]} 0%, ${darkStops[1]} 52%, ${darkStops[2]} 100%)`;

  return {
    buttonBackground: [
      `linear-gradient(145deg, ${hslHex(baseHue + 8, 0.54, 0.34)} 0%, ${hslHex(baseHue - 4, 0.5, 0.2)} 100%)`,
    ].join(", "),
    buttonBorder: rgbaString(baseHue + 10, 0.45, 0.6, 0.22),
    buttonShadow: [
      `inset 0 1px 0 ${rgbaString(baseHue + 12, 0.54, 0.82, 0.18)}`,
      `0 18px 38px ${rgbaString(baseHue - 6, 0.48, 0.14, 0.28)}`,
    ].join(", "),
    cardShadow: `0 36px 90px ${rgbaString(baseHue - 8, 0.34, 0.11, 0.34)}`,
    focusBorder: hslHex(baseHue + 4, 0.42, 0.45),
    focusRing: rgbaString(baseHue + 4, 0.44, 0.42, 0.18),
    glowTint: rgbaString(baseHue + 2, 0.42, 0.44, 0.2),
    orbs: blooms.slice(0, 3).map((bloom, index) => ({
      background: `radial-gradient(circle, ${rgbaString(bloom.h, bloom.s, bloom.l, 0.22 + index * 0.03)} 0%, transparent 70%)`,
      height: `${420 + index * 110}px`,
      left: `${Math.max(8, bloom.posX - 16).toFixed(1)}%`,
      opacity: 0.9,
      top: `${Math.max(4, bloom.posY - 18).toFixed(1)}%`,
      width: `${420 + index * 110}px`,
    })),
    pageBackground: [texture, ...bloomLayers, baseGradient].join(", "),
  };
}
