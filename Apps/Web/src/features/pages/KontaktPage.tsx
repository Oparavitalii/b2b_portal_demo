import { Button, Group } from '@mantine/core';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageTitle } from '@/components/PageTitle';
import { company, formatAddress } from '@/content/company';

import classes from './LegalPage.module.css';

// R-13 — public contact page. Data from content/company.ts (shop.catalog-demo.example
// kontakt-block.php + Regulamin §2). No Google Maps embed: only a plain
// link the visitor chooses to open, so no data goes to Google on load.
function ContactCard({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={classes.card}>
      <span className={classes.cardIcon} aria-hidden>
        {icon}
      </span>
      <div className={classes.cardBody}>
        <span className={classes.cardLabel}>{label}</span>
        {children}
      </div>
    </div>
  );
}

export function KontaktPage() {
  const serviceAddress = formatAddress(company.service);
  const seatAddress = formatAddress(company.seat);
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(serviceAddress)}`;

  return (
    <div>
      <PageTitle
        eyebrow='Kontakt'
        title='Serwis w Przykładowo: napisz albo zadzwoń'
        lead='W sprawie zamówień, dostępności części i współpracy B2B.'
      />

      <div className={classes.contactGrid}>
        <ContactCard icon={<MapPin size={22} />} label='Serwis'>
          <address
            className={classes.cardValue}
            style={{ fontStyle: 'normal' }}
          >
            {serviceAddress}
          </address>
          <a
            className={classes.cardValue}
            href={mapsUrl}
            target='_blank'
            rel='noopener noreferrer'
          >
            Otwórz w Mapach Google
          </a>
        </ContactCard>

        <ContactCard icon={<Phone size={22} />} label='Telefon'>
          {company.phones.map((phone) => (
            <a
              key={phone.tel}
              className={classes.cardValue}
              href={`tel:${phone.tel}`}
            >
              {phone.label}: {phone.display}
            </a>
          ))}
        </ContactCard>

        <ContactCard icon={<Mail size={22} />} label='E-mail'>
          <a className={classes.cardValue} href={`mailto:${company.email}`}>
            {company.email}
          </a>
        </ContactCard>

        <ContactCard icon={<Clock size={22} />} label='Godziny pracy'>
          <span className={classes.cardValue}>{company.hours}</span>
        </ContactCard>
      </div>

      <Group gap='sm'>
        <Button
          component='a'
          href={`mailto:${company.email}`}
          leftSection={<Mail size={18} />}
        >
          Napisz do nas
        </Button>
        <Button
          component='a'
          href={`tel:${company.phones[0]?.tel ?? ''}`}
          variant='default'
        >
          Zadzwoń
        </Button>
      </Group>

      <div className={classes.legalBlock}>
        <p>
          <strong>{company.shortName}</strong> · Siedziba: {seatAddress}
        </p>
        <p>
          KRS {company.krs} · NIP {company.nip} · REGON {company.regon} ·
          Kapitał zakładowy {company.shareCapital}
        </p>
        <p>{company.court}</p>
        <p>
          Adres serwisu (tu przyjmujemy części i rdzenie): {serviceAddress}.
          Siedziba we Wrocławiu nie przyjmuje przesyłek z częściami.
        </p>
      </div>
    </div>
  );
}
