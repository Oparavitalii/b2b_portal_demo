import { Link } from 'react-router-dom';

import { company, companyLegalLine, formatAddress } from '@/content/company';
import { useAuthStore } from '@/lib/auth-store';

import classes from './Layout.module.css';

// Port of shop.catalog-demo.example Footer20 (woodmart-child footer.php:164-328): dark
// brand band with a red top line, colour logo, tagline, short intro, link
// columns, company identity line and copyright.
const katalogLinks = [
  { label: 'Katalog produktów', to: '/' },
  { label: 'Koszyk', to: '/koszyk' },
  { label: 'Moje konto', to: '/moje-konto' },
  { label: 'Zamówienia', to: '/moje-konto/zamowienia' },
];

// The admin sees the panel instead of the customer links.
const adminLinks = [
  { label: 'Klienci i rabaty', to: '/admin/klienci' },
  { label: 'Zamówienia', to: '/admin/zamowienia' },
  { label: 'Produkty', to: '/admin/produkty' },
];

const dokumentyLinks = [
  { label: 'Regulamin', to: '/regulamin' },
  { label: 'Polityka prywatności', to: '/polityka-prywatnosci' },
  { label: 'Dokumentacja API', to: '/dokumentacja-api' },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const mainLinks = isAdmin ? adminLinks : katalogLinks;

  return (
    <footer className={classes.footer} aria-label='Stopka witryny'>
      <div className={classes.footerInner}>
        <div className={classes.footerBody}>
          <div className={classes.footerBrand}>
            <Link
              to='/'
              className={classes.footerLogo}
              aria-label='Katalog DEMO PARTS, strona główna'
            >
              <img
                src='/img/logo/Catalog_Logo_Kolor.svg'
                width={210}
                height={28}
                alt='DEMO PARTS'
                loading='lazy'
                decoding='async'
              />
            </Link>
            <p className={classes.footerTagline}>{company.tagline}</p>
            <p className={classes.footerIntro}>
              Katalog B2B części regenerowanych DEMO PARTS dla firm i warsztatów.
              Każda firma ma swój rabat, a zamówienia trafiają e-mailem prosto
              do DEMO PARTS.
            </p>
          </div>

          <nav className={classes.footerGrid} aria-label='Nawigacja w stopce'>
            <div>
              <h2 className={classes.footerColTitle}>
                {isAdmin ? 'Panel admina' : 'Katalog'}
              </h2>
              <ul className={classes.footerList}>
                {mainLinks.map((item) => (
                  <li key={item.to}>
                    <Link className={classes.footerLink} to={item.to}>
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    className={classes.footerLink}
                    href={company.website}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    Sklep shop.catalog-demo.example
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={classes.footerColTitle}>Dokumenty</h2>
              <ul className={classes.footerList}>
                {dokumentyLinks.map((item) => (
                  <li key={item.to}>
                    <Link className={classes.footerLink} to={item.to}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className={classes.footerColTitle}>Kontakt</h2>
              <address className={classes.footerAddr}>
                {formatAddress(company.service)}
              </address>
              <ul className={classes.footerList}>
                {company.phones.map((phone) => (
                  <li key={phone.tel}>
                    <a className={classes.footerLink} href={`tel:${phone.tel}`}>
                      {phone.label}: {phone.display}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    className={classes.footerLink}
                    href={`mailto:${company.email}`}
                  >
                    {company.email}
                  </a>
                </li>
                <li>
                  <Link className={classes.footerLink} to='/kontakt'>
                    Wszystkie dane kontaktowe
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className={classes.footerLegal}>
          <p className={classes.footerLegalId}>{companyLegalLine}</p>
          <p className={classes.footerLegalTm}>{company.trademarkNote}</p>
        </div>

        <div className={classes.footerBottom}>
          <p className={classes.footerCopy}>
            © {year} {company.shortName} Wszystkie prawa zastrzeżone.
          </p>
          <p className={classes.footerCopy}>{company.catalogHost}</p>
        </div>
      </div>
    </footer>
  );
}
