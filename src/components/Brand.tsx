import Image from "next/image";
import Link from "next/link";

/** The Kwez eye. Decorative unless a label is given. */
export function EyeMark({ size = 36, label, className = "" }: { size?: number; label?: string; className?: string }) {
  return (
    <Image
      src={size > 48 ? "/brand/eye-192.png" : "/brand/eye-96.png"}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
      priority={size <= 48}
    />
  );
}

/**
 * Header logo: just the eye; on hover or keyboard focus the "Kwez / Generative Engine
 * Optimisation" wordmark slides out beside it.
 */
export function BrandLogo() {
  return (
    <Link href="/" aria-label="Kwez GEO Audit, home" className="brand-logo group flex items-center rounded-full">
      <EyeMark size={38} className="brand-logo-eye" />
      <span className="brand-logo-reveal" aria-hidden>
        <span className="flex flex-col justify-center pl-3 pr-1">
          <span className="brand-kwez h-[22px]" />
          <span className="mt-1 whitespace-nowrap text-[8.5px] font-semibold uppercase leading-[1.15] tracking-[0.2em] text-ink">
            Generative Engine
            <br />
            Optimisation
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Loading indicator: the eye blinks, with a soft pulse around it. */
export function EyeLoader({ size = 56, label = "Loading", halo = true }: { size?: number; label?: string | null; halo?: boolean }) {
  // label={null}: purely visual (e.g. inside a button whose text already says what's happening).
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={`eye-loader inline-grid shrink-0 place-items-center rounded-full ${halo ? "eye-loader--halo" : ""}`}
      style={{ width: size, height: size }}
    >
      <EyeMark size={size} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
