import { Text, Title } from '@mantine/core';
import { type ReactNode, useEffect } from 'react';

const SITE_NAME = 'DEMO PARTS – katalog B2B';

interface PageTitleProps {
  title: string;
  eyebrow?: string;
  lead?: ReactNode;
}

// Page heading (Saira Condensed, ink — never red) + document title.
export function PageTitle({ title, eyebrow, lead }: PageTitleProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <header style={{ marginBottom: 'var(--cdm-space-lg)' }}>
      {eyebrow ? <p className='cdm-eyebrow'>{eyebrow}</p> : null}
      <Title order={1}>{title}</Title>
      {lead ? (
        <Text mt='sm' size='lg' c='cdmInk.6' maw='64ch'>
          {lead}
        </Text>
      ) : null}
    </header>
  );
}
