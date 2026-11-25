import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import classes from './Catalog.module.css';

interface ProductImageProps {
  src: string | null;
  alt: string;
  eager?: boolean;
}

// Square product photo (object-fit: contain). A missing or broken file shows
// a neutral box instead of a broken-image icon.
export function ProductImage({ src, alt, eager = false }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;

  return (
    <div className={classes.media}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding='async'
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className={classes.fallback} role='img' aria-label={alt}>
          <ImageOff size={32} strokeWidth={1.5} aria-hidden />
          <span>Brak zdjęcia</span>
        </div>
      )}
    </div>
  );
}
