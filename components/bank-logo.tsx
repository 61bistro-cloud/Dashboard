import Image from "next/image";
import fs from "node:fs";
import path from "node:path";

const LOGO_DIR = path.join(process.cwd(), "public", "logos");

/** Map BankAccount.code → { display props for fallback monogram } */
const FALLBACK: Record<string, { letter: string; bg: string; text: string }> = {
  KBANK: { letter: "ก", bg: "bg-emerald-500", text: "text-canvas" },
  SCB: { letter: "S", bg: "bg-purple-700", text: "text-canvas" },
  CASH: { letter: "฿", bg: "bg-surface", text: "text-ink" },
  KBANK_CREDIT: { letter: "💳", bg: "bg-amber-100", text: "text-amber-900" },
};

/** Returns the first existing logo file for this bank code, or null. */
function findLogo(code: string): string | null {
  const lower = code.toLowerCase();
  for (const ext of ["svg", "png", "webp", "jpg"]) {
    const file = path.join(LOGO_DIR, `${lower}.${ext}`);
    try {
      if (fs.existsSync(file)) return `/logos/${lower}.${ext}`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function BankLogo({
  code,
  name,
  size = 36,
}: {
  code: string;
  name: string;
  size?: number;
}) {
  const src = findLogo(code);
  if (src) {
    return (
      <span
        className="inline-flex items-center justify-center overflow-hidden rounded-input bg-canvas border border-hairline"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="object-contain"
        />
      </span>
    );
  }

  const f = FALLBACK[code] ?? {
    letter: name.slice(0, 1).toUpperCase(),
    bg: "bg-surface",
    text: "text-ink",
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-input font-semibold ${f.bg} ${f.text}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
      }}
      aria-label={name}
    >
      {f.letter}
    </span>
  );
}
