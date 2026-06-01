/**
 * Square article thumbnail with a fallback placeholder if `src` is null
 * or the image fails to load. Lazy-loaded (`loading="lazy"`) so a long
 * list doesn't fetch off-screen images on mount.
 */
import { useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  /** Pixel size of the square thumbnail. Default 48. */
  size?: number;
};

// Small square thumbnail used in article lists. Falls back to a neutral
// box emoji on missing or broken URLs so the layout doesn't shift.
export default function ArticleThumb({ src, alt, size = 48 }: Props) {
  const [failed, setFailed] = useState(false);
  const sizeClass = { width: size, height: size };

  if (!src || failed) {
    return (
      <div
        style={sizeClass}
        className="rounded ui-panel flex items-center justify-center text-lg shrink-0"
        aria-hidden="true"
      >
        📦
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={sizeClass}
      className="rounded object-cover ui-panel shrink-0"
    />
  );
}
