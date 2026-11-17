import { useEffect, useState } from "react";
import type { CoverId } from "../../design-system/components/CoverArt";

const DEFAULT_ACCENT = "252 132 165";

const coverFallbacks: Record<CoverId, string> = {
  moonlit: "96 126 164",
  seaside: "228 128 108",
  signal: "173 143 82",
  daydream: "104 146 170",
  stardust: "112 83 150",
  rain: "91 137 115",
  winter: "105 119 145",
  glass: "166 124 128",
  nocturnal: "183 91 61",
  spring: "208 140 147",
};

function accentFromPixels(data: Uint8ClampedArray): string | null {
  const buckets = new Map<
    string,
    { count: number; r: number; g: number; b: number; score: number }
  >();

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 180) {
      continue;
    }
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (luma < 24 || luma > 238 || saturation < 0.12) {
      continue;
    }

    const key = [r, g, b].map((value) => Math.round(value / 24)).join(":");
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, score: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.score += (0.35 + saturation) * (0.72 + luma / 255);
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    const score = bucket.score * Math.log2(bucket.count + 1);
    if (!best || score > best.score) {
      best = {
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
        score,
      };
    }
  }
  if (!best) {
    return null;
  }

  const lift = (value: number) => Math.min(255, Math.round(value * 0.72 + 52));
  return [lift(best.r), lift(best.g), lift(best.b)].join(" ");
}

async function sampleAccent(url: string): Promise<string | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = url;
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });
  if (!image.naturalWidth || !image.naturalHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 28;
  canvas.height = 42;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return accentFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

export function useCoverAccent(sourceUrl: string | null, cover: CoverId | null | undefined) {
  const fallback = (cover ? coverFallbacks[cover] : DEFAULT_ACCENT) ?? DEFAULT_ACCENT;
  const [sample, setSample] = useState<{ url: string; accent: string | null } | null>(null);

  useEffect(() => {
    if (!sourceUrl) {
      return;
    }

    let cancelled = false;
    void sampleAccent(sourceUrl)
      .then((value) => {
        if (!cancelled) {
          setSample({ url: sourceUrl, accent: value });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  return sample?.url === sourceUrl && sample.accent ? sample.accent : fallback;
}
