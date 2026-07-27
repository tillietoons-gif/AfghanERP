import type { ReactNode } from "react";

/**
 * Decorative aurora/mesh backdrop. Absolute positioned, non-interactive.
 * Sits behind hero content on dashboards, auth, reports hub.
 */
export function MeshBackdrop({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "mesh";
  className?: string;
}) {
  const bg = variant === "hero" ? "gradient-hero" : "gradient-mesh";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div className={`absolute inset-0 ${bg}`} />
      <div
        className="float-orb absolute -top-24 -left-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 55%, transparent), transparent)",
        }}
      />
      <div
        className="float-orb absolute -bottom-32 -right-16 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 60%, transparent), transparent)",
          animationDelay: "-4s",
        }}
      />
      {/* Subtle grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

export function MeshChildren({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
