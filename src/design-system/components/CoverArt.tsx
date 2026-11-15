import { useState } from "react";
import type { ReactNode } from "react";

export type CoverId =
  | "moonlit"
  | "seaside"
  | "signal"
  | "daydream"
  | "stardust"
  | "rain"
  | "winter"
  | "glass"
  | "nocturnal"
  | "spring";

export interface CoverWork {
  title: string;
  originalTitle: string;
  developer: string;
  year: number | null;
  cover: CoverId | null;
  coverUrl?: string | null;
}

interface CoverArtProps {
  work: CoverWork;
  className?: string;
  focus?: "center" | "top";
}

function Artwork({ kind }: { kind: CoverId }): ReactNode {
  switch (kind) {
    case "moonlit":
      return (
        <>
          <circle cx="408" cy="224" r="148" fill="#E8DCC3" opacity="0.92" />
          <circle
            cx="408"
            cy="224"
            r="178"
            fill="none"
            stroke="#E8DCC3"
            strokeWidth="1"
            opacity="0.18"
          />
          <circle cx="96" cy="116" r="2" fill="#E8DCC3" opacity="0.8" />
          <circle cx="170" cy="72" r="1.4" fill="#E8DCC3" opacity="0.6" />
          <circle cx="510" cy="96" r="1.6" fill="#E8DCC3" opacity="0.7" />
          <circle cx="550" cy="170" r="1.1" fill="#E8DCC3" opacity="0.55" />
          <path
            d="M0 714 104 684l76 18 82-58 92 54 86-33 74 24 86-17v228H0Z"
            fill="#0A1018"
            opacity="0.92"
          />
          <rect x="128" y="694" width="100" height="206" fill="#0A1018" />
          <rect x="158" y="742" width="18" height="36" fill="#D7A25C" />
          <rect x="204" y="742" width="10" height="18" fill="#D7A25C" opacity="0.35" />
          <path d="M0 764h600" stroke="#E8DCC3" strokeWidth="1" opacity="0.12" />
          <path d="M64 0v900" stroke="#E8DCC3" strokeWidth="1" opacity="0.08" />
        </>
      );
    case "seaside":
      return (
        <>
          <circle cx="462" cy="280" r="78" fill="#F5D8B5" />
          <path d="M0 520h600v380H0Z" fill="#2A5B63" />
          <path d="M0 520h600v106H0Z" fill="#3C7A7D" opacity="0.8" />
          <path d="M0 652q78-36 156 0t156 0q78-36 156 0t132 0v248H0Z" fill="#244F57" />
          <path
            d="M0 716q88-28 176 0t176 0q88-28 176 0t72 0"
            fill="none"
            stroke="#A8D1CE"
            strokeWidth="2"
            opacity="0.28"
          />
          <path d="M356 0h244v164H356Z" fill="#F4E9DA" />
          <path
            d="M356 164q22 26 44 0 22 26 44 0 22 26 44 0 22 26 44 0 22 26 44 0 14 18 24 0v-20H356Z"
            fill="#F4E9DA"
          />
          <path d="M404 0v158M452 0v158M500 0v158M548 0v158" stroke="#DCCBB8" />
          <path d="M78 0v900" stroke="#F4E9DA" strokeWidth="2" opacity="0.26" />
        </>
      );
    case "signal":
      return (
        <>
          <rect y="544" width="600" height="356" fill="#C9A65D" opacity="0.5" />
          <path d="M0 694h600" stroke="#2B2A24" strokeWidth="2" opacity="0.42" />
          <path d="M0 732h600" stroke="#2B2A24" strokeWidth="2" opacity="0.28" />
          <path
            d="M-80 900 430 510M680 900 170 510"
            stroke="#2B2A24"
            strokeWidth="14"
            opacity="0.7"
          />
          <path
            d="M-80 900 430 510M680 900 170 510"
            stroke="#E7DBC2"
            strokeWidth="4"
            opacity="0.45"
          />
          <rect x="276" y="454" width="46" height="446" fill="#2B2A24" />
          <g transform="translate(300 388)">
            <path d="M-152-18 152-70l18 44-304 52Z" fill="#2B2A24" />
            <path d="M-152 70 152 18l18 44-304 52Z" fill="#2B2A24" />
            <path d="M-120-20 120-60M-120 60 120 20" stroke="#B2493C" strokeWidth="14" />
            <circle cx="0" cy="0" r="20" fill="#E7DBC2" />
          </g>
          <circle cx="300" cy="494" r="12" fill="#B2493C" />
          <path d="M522 108v82" stroke="#2B2A24" strokeWidth="2" opacity="0.4" />
          <circle cx="522" cy="200" r="7" fill="#B2493C" />
        </>
      );
    case "daydream":
      return (
        <>
          <rect
            x="86"
            y="116"
            width="428"
            height="618"
            fill="#F7F4ED"
            opacity="0.5"
            transform="rotate(-6 300 425)"
          />
          <circle
            cx="306"
            cy="394"
            r="172"
            fill="none"
            stroke="#41637A"
            strokeWidth="1.5"
            opacity="0.34"
          />
          <circle cx="306" cy="394" r="110" fill="#BFD8DE" opacity="0.24" />
          <path d="M306 520V706" stroke="#41637A" strokeWidth="3" opacity="0.55" />
          <path d="M306 624q-64-62-108-14 42 62 108 14Z" fill="#6A8E9A" opacity="0.48" />
          <path d="M306 584q58-56 96-10-38 56-96 10Z" fill="#41637A" opacity="0.4" />
          <path d="M306 676q-54-44-92-8 36 48 92 8Z" fill="#6A8E9A" opacity="0.3" />
          <rect x="392" y="146" width="112" height="296" fill="#F7F4ED" opacity="0.28" />
          <path d="M112 146v510" stroke="#F7F4ED" strokeWidth="1" opacity="0.5" />
        </>
      );
    case "stardust":
      return (
        <>
          <circle cx="374" cy="404" r="220" fill="#D6B36A" />
          <circle
            cx="374"
            cy="404"
            r="184"
            fill="none"
            stroke="#2A1E45"
            strokeWidth="1"
            opacity="0.45"
          />
          <circle
            cx="374"
            cy="404"
            r="154"
            fill="none"
            stroke="#2A1E45"
            strokeWidth="1"
            opacity="0.34"
          />
          <circle
            cx="374"
            cy="404"
            r="120"
            fill="none"
            stroke="#2A1E45"
            strokeWidth="1"
            opacity="0.3"
          />
          <circle cx="374" cy="404" r="42" fill="#2A1E45" />
          <circle cx="374" cy="404" r="8" fill="#D6B36A" />
          <path
            d="M92 658C178 498 330 338 558 282"
            fill="none"
            stroke="#F1E6C8"
            strokeWidth="1"
            opacity="0.28"
          />
          <circle cx="104" cy="662" r="9" fill="#F1E6C8" opacity="0.9" />
          <circle cx="104" cy="662" r="24" fill="none" stroke="#F1E6C8" opacity="0.25" />
          <circle cx="88" cy="118" r="1.8" fill="#F1E6C8" opacity="0.8" />
          <circle cx="184" cy="78" r="1.2" fill="#F1E6C8" opacity="0.6" />
          <circle cx="522" cy="96" r="1.6" fill="#F1E6C8" opacity="0.7" />
        </>
      );
    case "rain":
      return (
        <>
          <rect
            x="62"
            y="94"
            width="476"
            height="624"
            fill="none"
            stroke="#9DB4A7"
            strokeWidth="1"
            opacity="0.28"
          />
          <path
            d="M62 252h476M62 410h476M62 568h476M220 94v624M380 94v624"
            stroke="#9DB4A7"
            strokeWidth="1"
            opacity="0.16"
          />
          <path
            d="M86 146 70 250M126 132l-16 104M166 146l-16 104M206 132l-16 104M246 146l-16 104M286 132l-16 104M326 146l-16 104M366 132l-16 104M406 146l-16 104M446 132l-16 104M486 146l-16 104M526 132l-16 104"
            stroke="#C3D2C8"
            strokeWidth="2"
            opacity="0.24"
          />
          <path d="M172 446a128 128 0 0 1 256 0Z" fill="#8C3F38" />
          <path d="M300 446v184q0 44 46 44" fill="none" stroke="#E3D8C5" strokeWidth="4" />
          <ellipse cx="300" cy="760" rx="188" ry="20" fill="#C3D2C8" opacity="0.09" />
          <path d="M208 470h184" stroke="#E3D8C5" strokeWidth="1" opacity="0.3" />
        </>
      );
    case "winter":
      return (
        <>
          <circle cx="446" cy="190" r="58" fill="#E9E2D4" opacity="0.82" />
          <circle cx="96" cy="150" r="1.8" fill="#E9E2D4" opacity="0.7" />
          <circle cx="162" cy="88" r="1.3" fill="#E9E2D4" opacity="0.5" />
          <circle cx="530" cy="92" r="2" fill="#E9E2D4" opacity="0.6" />
          <circle cx="500" cy="300" r="1.2" fill="#E9E2D4" opacity="0.4" />
          <path d="M0 664 118 604l118 34 124-86 128 68 112-28v308H0Z" fill="#111820" />
          <path d="M354 556h150v210H354Z" fill="#141B22" />
          <path d="M330 560 429 480l99 80Z" fill="#1D262E" />
          <rect x="392" y="610" width="48" height="52" fill="#D9A45A" />
          <rect x="401" y="619" width="30" height="34" fill="#F2D59B" opacity="0.7" />
          <path d="M416 610v52M392 636h48" stroke="#1D262E" strokeWidth="3" />
          <path d="M0 800q120-26 240 0t240 0q60-13 120 0v100H0Z" fill="#2A333B" opacity="0.45" />
        </>
      );
    case "glass":
      return (
        <>
          <path d="M74 88h452v724H74Z" fill="none" stroke="#6F8B72" strokeWidth="2" opacity="0.4" />
          <path
            d="M74 88 300 262 526 88"
            fill="none"
            stroke="#F6EDE7"
            strokeWidth="2"
            opacity="0.55"
          />
          <path
            d="M74 812 300 612 526 812"
            fill="none"
            stroke="#F6EDE7"
            strokeWidth="2"
            opacity="0.4"
          />
          <path d="M300 262v350M74 500h452" stroke="#6F8B72" strokeWidth="1" opacity="0.28" />
          <path d="M106 118 252 244v226L106 344Z" fill="#6F8B72" opacity="0.2" />
          <path d="M494 118 348 244v226l146-126Z" fill="#F6EDE7" opacity="0.18" />
          <circle cx="300" cy="520" r="76" fill="#F4E6DF" opacity="0.7" />
          <circle cx="300" cy="520" r="24" fill="#B99A8E" opacity="0.55" />
          <path
            d="M300 596v132M300 676q-48-34-72-4 28 38 72 4ZM300 650q44-30 66-2-26 34-66 2Z"
            fill="#6F8B72"
            opacity="0.55"
          />
          <path
            d="M224 444 300 520M376 444 300 520"
            stroke="#F6EDE7"
            strokeWidth="1"
            opacity="0.35"
          />
        </>
      );
    case "nocturnal":
      return (
        <>
          <circle cx="430" cy="252" r="142" fill="#E06A3C" opacity="0.9" />
          <path d="M0 640 92 598l70 22 86-58 78 48 96-34 78 32 100-22v314H0Z" fill="#061416" />
          <path d="M0 760h600v140H0Z" fill="#040F11" />
          <rect x="118" y="590" width="84" height="170" fill="#08191B" />
          <rect x="144" y="628" width="14" height="20" fill="#8EC9C4" opacity="0.75" />
          <rect x="144" y="674" width="14" height="20" fill="#E06A3C" opacity="0.65" />
          <rect x="398" y="560" width="118" height="200" fill="#08191B" />
          <rect x="424" y="602" width="12" height="24" fill="#8EC9C4" opacity="0.55" />
          <rect x="456" y="602" width="12" height="24" fill="#8EC9C4" opacity="0.35" />
          <path d="M280 0v900" stroke="#8EC9C4" strokeWidth="1" opacity="0.12" />
          <path d="M0 844h600" stroke="#8EC9C4" strokeWidth="1" opacity="0.12" />
          <circle cx="128" cy="116" r="1.8" fill="#F2E9D8" opacity="0.55" />
          <circle cx="196" cy="86" r="1.2" fill="#F2E9D8" opacity="0.4" />
          <circle cx="540" cy="118" r="1.6" fill="#F2E9D8" opacity="0.5" />
        </>
      );
    case "spring":
      return (
        <>
          <rect x="68" y="104" width="464" height="700" fill="#F7F2EA" opacity="0.62" />
          <rect x="104" y="146" width="392" height="430" fill="#A9C8D6" />
          <rect
            x="104"
            y="146"
            width="392"
            height="430"
            fill="none"
            stroke="#F7F2EA"
            strokeWidth="12"
          />
          <path d="M300 146v430" stroke="#F7F2EA" strokeWidth="8" opacity="0.7" />
          <path d="M104 360h392" stroke="#F7F2EA" strokeWidth="8" opacity="0.55" />
          <path
            d="M134 520q88-148 176-64t124-26"
            fill="none"
            stroke="#5E7C82"
            strokeWidth="2"
            opacity="0.3"
          />
          <rect x="156" y="646" width="192" height="44" fill="#8C3F38" opacity="0.8" />
          <path d="M180 668h144" stroke="#F7F2EA" strokeWidth="2" opacity="0.65" />
          <circle cx="430" cy="606" r="14" fill="#F0C8C4" />
          <circle cx="470" cy="660" r="9" fill="#F0C8C4" />
          <circle cx="404" cy="696" r="7" fill="#F0C8C4" opacity="0.7" />
          <path d="M492 214q26 16 0 34-26-18 0-34Z" fill="#F0C8C4" opacity="0.75" />
        </>
      );
  }
}

const figurePlacements: Partial<
  Record<CoverId, { x: number; y: number; scale: number; opacity: number; mirror?: boolean }>
> = {
  moonlit: { x: 300, y: 350, scale: 0.9, opacity: 0.96 },
  seaside: { x: 360, y: 335, scale: 0.92, opacity: 0.94, mirror: true },
  stardust: { x: 374, y: 315, scale: 0.95, opacity: 0.95 },
  rain: { x: 300, y: 335, scale: 0.88, opacity: 0.95 },
  glass: { x: 300, y: 320, scale: 0.9, opacity: 0.92 },
  nocturnal: { x: 320, y: 330, scale: 0.9, opacity: 0.95, mirror: true },
};

function HeroineFigure({ kind }: { kind: CoverId }) {
  const placement = figurePlacements[kind];
  if (!placement) {
    return null;
  }
  const scaleX = placement.mirror ? -placement.scale : placement.scale;

  return (
    <g
      transform={`translate(${placement.x} ${placement.y}) scale(${scaleX} ${placement.scale})`}
      opacity={placement.opacity}
      aria-hidden="true"
    >
      <path
        d="M-62-78C-108-38-116 8-104 66L-126 228C-130 248-108 258-96 240L-72 152L-82 330H82L72 152L96 240C108 258 130 248 126 228L104 66C116 8 108-38 62-78Z"
        fill="var(--figure-dark)"
      />
      <path d="M-14-38-16 20H16L14-38Z" fill="var(--figure-face)" />
      <ellipse cx="0" cy="-92" rx="44" ry="52" fill="var(--figure-face)" />
      <path
        d="M-50-100C-58-152-30-170 0-170 30-170 58-152 50-100 40-128 22-140 0-140-22-140-40-128-50-100Z"
        fill="var(--figure-dark)"
      />
      <path
        d="M-50-108C-38-142-20-146-8-120L-14-100C-28-116-38-112-50-96Z"
        fill="var(--figure-dark)"
      />
      <path d="M50-108C38-142 20-146 8-120L14-100C28-116 38-112 50-96Z" fill="var(--figure-dark)" />
      <path
        d="M-64 10C-98 40-108 100-102 168L-84 320H84L102 168C108 100 98 40 64 10 44 34 20 44 0 44-20 44-44 34-64 10Z"
        fill="var(--figure-dark)"
      />
      <path d="M-30 12 0 50 30 12 20 2 0 30-20 2Z" fill="var(--figure-accent)" opacity="0.9" />
      <path d="M-10 24-34 44-10 52Z" fill="var(--figure-accent)" />
      <path d="M10 24 34 44 10 52Z" fill="var(--figure-accent)" />
      <circle cx="0" cy="38" r="5" fill="var(--figure-accent)" />
      <path
        d="M-96 56C-138 100-148 190-126 258L-104 244C-112 190-104 132-76 88Z"
        fill="var(--figure-dark)"
      />
      <path
        d="M96 56C138 100 148 190 126 258L104 244C112 190 104 132 76 88Z"
        fill="var(--figure-dark)"
      />
      <path d="M-84 260-122 440H122L84 260Z" fill="var(--figure-dark)" />
      <path
        d="M-58 266-86 436M-20 260-30 440M20 260 30 440M58 266 86 436"
        stroke="var(--figure-accent)"
        strokeWidth="1.2"
        opacity="0.18"
      />
      <path d="M-50 438-44 590H-18L-22 438Z" fill="var(--figure-dark)" />
      <path d="M50 438 44 590H18L22 438Z" fill="var(--figure-dark)" />
      <path d="M-46 580H-18L-14 600H-52Z" fill="var(--figure-accent)" opacity="0.65" />
      <path d="M46 580H18L14 600H52Z" fill="var(--figure-accent)" opacity="0.65" />
      <ellipse cx="-15" cy="-96" rx="3" ry="4.5" fill="var(--figure-dark)" />
      <ellipse cx="15" cy="-96" rx="3" ry="4.5" fill="var(--figure-dark)" />
      <path
        d="M-5-74Q0-70 5-74"
        stroke="var(--figure-accent)"
        strokeWidth="1.3"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M-58-54C-76-10-78 40-70 92"
        stroke="var(--figure-accent)"
        strokeWidth="1.4"
        fill="none"
        opacity="0.45"
      />
      <path
        d="M58-54C76-10 78 40 70 92"
        stroke="var(--figure-accent)"
        strokeWidth="1.4"
        fill="none"
        opacity="0.45"
      />
    </g>
  );
}

export function CoverArt({ work, className = "", focus = "center" }: CoverArtProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = Boolean(work.coverUrl && failedUrl === work.coverUrl);

  if (work.coverUrl && !imageFailed) {
    return (
      <div
        className={`cover-art cover-art--image ${className}`.trim()}
        role="img"
        aria-label={`${work.title} 封面`}
      >
        <img
          className="cover-art__image"
          src={work.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(work.coverUrl ?? null)}
        />
      </div>
    );
  }

  if (!work.cover) {
    return (
      <div
        className={`cover-art cover-art--fallback ${className}`.trim()}
        role="img"
        aria-label={`${work.title} 封面占位`}
      >
        <div className="cover-art__fallback-grid" aria-hidden="true" />
        <span className="cover-art__fallback-mark" aria-hidden="true">
          MM
        </span>
        <div className="cover-art__type">
          {work.originalTitle ? <p className="cover-art__jp">{work.originalTitle}</p> : null}
          <h3 className="cover-art__title">{work.title}</h3>
          <p className="cover-art__credit">
            {work.developer}
            {work.year ? (
              <>
                <span>·</span>
                {work.year}
              </>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  const cover = work.cover;

  return (
    <div
      className={`cover-art cover-art--${cover} ${className}`.trim()}
      role="img"
      aria-label={`${work.title} 封面`}
    >
      <svg
        className="cover-art__scene"
        viewBox="0 0 600 900"
        preserveAspectRatio={focus === "top" ? "xMidYMin slice" : "xMidYMid slice"}
        aria-hidden="true"
      >
        <Artwork kind={cover} />
        <HeroineFigure kind={cover} />
      </svg>
      <div className="cover-art__grain" aria-hidden="true" />
      <div className="cover-art__type">
        <p className="cover-art__jp">{work.originalTitle}</p>
        <h3 className="cover-art__title">{work.title}</h3>
        <p className="cover-art__credit">
          {work.developer} <span>·</span> {work.year}
        </p>
      </div>
    </div>
  );
}
