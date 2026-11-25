import Link from "next/link";

/**
 * The Kwez eye: two flat, interlocking swoops around a plum pupil (from the 2026 brand board).
 * Drawn inline so it stays crisp at every size; colours come from the brand tokens.
 * Decorative unless a label is given.
 */
export function EyeMark({ size = 36, label, className = "" }: { size?: number; label?: string; className?: string }) {
  return (
    <svg
      viewBox="6 -34 566 566"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`eye-mark shrink-0 select-none ${className}`}
      focusable="false"
    >
      <path fill="var(--color-blue)" d="M12 318 C 50 268 98 228 156 194 L 166 206 C 112 242 62 282 20 322 C 16 325 9 322 12 318 Z" />
      <path fill="var(--color-cyan)" d="M88 236 C 150 110 232 25 332 25 C 432 25 497 70 499 128 C 500 152 474 162 452 152 C 430 142 412 112 382 96 C 342 74 292 70 247 90 C 192 115 152 160 124 214 Z" />
      <path fill="var(--color-violet)" d="M110 224 C 170 175 260 145 340 148 C 372 149 392 150 400 138 C 408 126 404 116 396 110 C 432 126 448 150 470 155 C 490 159 499 146 499 128 C 502 176 470 210 420 208 C 380 206 350 190 300 182 C 230 172 170 197 124 228 Z" />
      <path fill="var(--color-violet)" d="M80 345 C 95 335 130 330 160 338 C 185 345 178 368 182 378 C 195 400 270 410 338 398 C 312 430 270 452 215 452 C 130 452 78 405 80 345 Z" />
      <path fill="var(--color-plum)" d="M508 226 C 440 290 370 318 300 322 C 240 326 200 296 150 296 C 110 296 82 318 80 345 C 95 335 130 330 160 338 C 185 345 178 368 182 378 C 190 392 230 384 282 364 C 352 338 442 300 508 226 Z" />
      <path fill="var(--color-pink)" d="M558 177 C 565 175 568 180 565 186 C 520 282 440 472 250 472 C 190 472 140 457 115 432 C 170 447 250 442 320 402 C 400 357 470 290 558 177 Z" />
      <circle className="eye-mark-pupil" fill="var(--color-plum)" cx="290" cy="248" r="46" />
    </svg>
  );
}

/** The "kwez" wordmark and its pink tagline. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className}`}>
      <span className="brand-kwez">kwez</span>
      <span className="brand-tagline">Generative Engine Optimization</span>
    </span>
  );
}

/**
 * Header logo: just the eye; on hover or keyboard focus the "kwez" wordmark and tagline
 * slide out of it.
 */
export function BrandLogo() {
  return (
    <Link href="/" aria-label="Kwez GEO Audit, home" className="brand-logo group flex items-center rounded-full">
      <EyeMark size={52} />
      <span className="brand-logo-reveal" aria-hidden>
        <Wordmark className="pl-2 pr-1" />
      </span>
    </Link>
  );
}

/** Loading indicator: the eye blinks. Flat, no glow. */
export function EyeLoader({ size = 56, label = "Loading" }: { size?: number; label?: string | null }) {
  // label={null}: purely visual (e.g. inside a button whose text already says what's happening).
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className="eye-loader inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <EyeMark size={size} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
