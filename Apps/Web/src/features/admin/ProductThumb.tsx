import { useState } from 'react';

import classes from './Admin.module.css';

// 48 px product photo; a neutral box when there is no file (or it fails to load).
export function ProductThumb({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <span className={classes.thumbEmpty} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={classes.thumb}
      loading='lazy'
      width={48}
      height={48}
      onError={() => setBroken(true)}
    />
  );
}
