/**
 * The Facta mark (public/icon.svg), drawn inline so it follows the theme:
 * the tile and the F are coloured by --logo-tile and --logo-mark.
 */
export default function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Facta" className={className}>
      <rect width="120" height="120" rx="27" fill="var(--logo-tile)" />
      <polygon
        fill="var(--logo-mark)"
        stroke="var(--logo-mark)"
        strokeWidth="7"
        strokeLinejoin="round"
        points="46,31 93,31 90.4,41 55.4,41 51.3,57 73,57 70.9,65 49.2,65 42.5,91 30.5,91"
      />
    </svg>
  );
}
