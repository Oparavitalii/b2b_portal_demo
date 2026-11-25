// DEMO PARTS company data — one source for the header, footer, Kontakt page and
// legal texts. Copied from shop.catalog-demo.example:
// - wp-content/themes/woodmart-child/template-parts/kontakt-block.php
//   (service address :37, phones :83-84, e-mail :93, company line :193-197)
// - docs/9_Legal/Regulamin_Sklepu_PL.md §2 (seat, KRS, NIP, REGON, capital,
//   court, hours) — itself taken from the KRS register extract.

export interface CompanyPhone {
  label: string;
  display: string;
  tel: string;
}

export interface CompanyAddress {
  street: string;
  postalCode: string;
  city: string;
  region?: string;
  country: string;
}

export const company = {
  shortName: 'DEMO PARTS sp. z o.o.',
  fullName: 'DEMO PARTS spółka z ograniczoną odpowiedzialnością',
  tagline: 'DEMO PARTS · DIESEL PARTS REMANUFACTURING',
  seat: {
    street: 'ul. Przykładowa 1',
    postalCode: '00-001',
    city: 'Wrocław',
    country: 'Polska',
  } satisfies CompanyAddress,
  service: {
    street: 'ul. Warsztatowa 1',
    postalCode: '00-002',
    city: 'Przykładowo',
    region: 'Dolnośląskie',
    country: 'Polska',
  } satisfies CompanyAddress,
  krs: '0000000000',
  nip: '0000000000',
  regon: '000000000',
  shareCapital: '5 000,00 zł',
  registrationDate: '1 stycznia 2026 r.',
  court:
    'Sąd Rejonowy dla Wrocławia-Fabrycznej we Wrocławiu, VI Wydział Gospodarczy Krajowego Rejestru Sądowego',
  phones: [
    {
      label: 'Zamówienia, B2B, współpraca',
      display: '000 000 001',
      tel: '+48000000001',
    },
    {
      label: 'Doradztwo techniczne',
      display: '000 000 002',
      tel: '+48000000002',
    },
  ] satisfies CompanyPhone[],
  email: 'office@catalog-demo.example',
  hours: 'poniedziałek–piątek 8:00–16:00, sobota 9:00–13:00',
  website: 'https://shop.catalog-demo.example',
  catalogHost: 'portal.catalog-demo.example',
  trademarkNote:
    'DEMO PARTS sp. z o.o. nie jest właścicielem znaków towarowych Bosch, Delphi, Denso, Siemens i Continental. Podajemy je wyłącznie w celu dobrania odpowiedniego produktu.',
} as const;

/** 'ul. Warsztatowa 1, 00-002 Przykładowo, Dolnośląskie' */
export function formatAddress(address: CompanyAddress): string {
  const city = `${address.postalCode} ${address.city}`;
  return [address.street, city, address.region].filter(Boolean).join(', ');
}

/** Short identity line used in the footer: 'DEMO PARTS sp. z o.o. · KRS … · NIP …'. */
export const companyLegalLine = `${company.shortName} · KRS ${company.krs} · NIP ${company.nip}`;
