import type { ReactNode } from 'react';

import { PageTitle } from '@/components/PageTitle';

import classes from './Auth.module.css';

interface AuthCardProps {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

// Frame of every public auth page: heading + one card, footer links below a rule.
export function AuthCard({
  eyebrow = 'Katalog B2B',
  title,
  lead,
  wide = false,
  footer,
  children,
}: AuthCardProps) {
  return (
    <div className={classes.wrap}>
      <section
        className={wide ? `${classes.card} ${classes.cardWide}` : classes.card}
      >
        <PageTitle eyebrow={eyebrow} title={title} lead={lead} />
        {children}
        {footer ? <div className={classes.footer}>{footer}</div> : null}
      </section>
    </div>
  );
}
