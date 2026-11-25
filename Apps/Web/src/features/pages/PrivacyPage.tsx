import { Fragment } from 'react';

import { PageTitle } from '@/components/PageTitle';
import { type LegalDocument, privacyPolicy } from '@/content/privacy';

import classes from './LegalPage.module.css';

// [[...]] markers (lawyer flags) are rendered highlighted, never hidden.
const FLAG_PATTERN = /(\[\[[^\]]+\]\])/g;

function renderWithFlags(text: string) {
  return text.split(FLAG_PATTERN).map((part, index) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <mark key={index} className={classes.flag}>
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function sectionId(index: number): string {
  return `sekcja-${index + 1}`;
}

// Shared renderer for the legal documents (privacy policy, terms).
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <article className={classes.doc}>
      <PageTitle title={doc.title} eyebrow='Dokumenty' />
      <ul className={classes.meta}>
        {doc.meta.map((line) => (
          <li key={line}>{renderWithFlags(line)}</li>
        ))}
      </ul>
      <p className={classes.status} role='note'>
        {doc.status}
      </p>
      <p className={classes.intro}>{doc.intro}</p>

      <nav className={classes.toc} aria-label='Spis treści'>
        <ol className={classes.tocList}>
          {doc.sections.map((section, index) => (
            <li key={section.heading}>
              <a href={`#${sectionId(index)}`}>{section.heading}</a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((section, index) => (
        <section
          key={section.heading}
          id={sectionId(index)}
          className={classes.section}
        >
          <h2 className={classes.sectionHeading}>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className={classes.paragraph}>
              {renderWithFlags(paragraph)}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

export function PrivacyPage() {
  return <LegalDocumentView doc={privacyPolicy} />;
}
