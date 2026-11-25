import { Code } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';

import classes from './LegalPage.module.css';

// Public client API documentation (B-21), Polish. Same text as
// docs/Api_V1/Api_V1_Klienci.md — change both together.

const BASE = 'https://portal.catalog-demo.example/api/v1';

const RESPONSE_EXAMPLE = `{
  "items": [
    {
      "sku": "095000-5800",
      "name": "Wtryskiwacz Denso 095000-5800 — regenerowany",
      "category": "Wtryskiwacze",
      "producer": "Denso",
      "imageUrl": "https://portal.catalog-demo.example/img/products/Produkt_Denso_095000_5800.webp",
      "makes": ["Citroën", "Fiat", "Ford", "Peugeot"],
      "priceOnRequest": false,
      "price": {
        "unitNet": 43024,
        "unitGross": 52920,
        "unitDeposit": 15000,
        "listNet": 47805,
        "listGross": 58800
      },
      "hasVariants": false,
      "variants": [],
      "stock": 4,
      "leadTimeHours": 24,
      "discountPercent": 10,
      "oeNumbers": ["095000-5800", "0950005801"],
      "engineCodes": ["P8FA"],
      "applications": [
        { "marka": "Ford", "model": "Transit Mk7", "silnik": "2.2 TDCi (P8FA), 63 kW", "lata": "2006–2014" }
      ],
      "description": "…",
      "attributes": {},
      "active": true,
      "updatedAt": "2026-10-14T09:12:00.000Z"
    }
  ],
  "total": 340,
  "page": 1,
  "pageSize": 100,
  "discountPercent": 10,
  "currency": "PLN",
  "amountsIn": "grosze",
  "vatRate": 0.23,
  "generatedAt": "2026-10-14T13:00:00.000Z"
}`;

const CURL_EXAMPLE = `curl -H "Authorization: Bearer $CATALOG_API_KEY" \\
  "${BASE}/products?pageSize=500"`;

const PHP_EXAMPLE = `$ch = curl_init('${BASE}/products?pageSize=500');
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('CATALOG_API_KEY')],
    CURLOPT_RETURNTRANSFER => true,
]);
$data = json_decode(curl_exec($ch), true);
foreach ($data['items'] as $p) {
    echo $p['sku'], ' ', $p['price'] ? $p['price']['unitGross'] / 100 : 'na zapytanie', "\\n";
}`;

const PYTHON_EXAMPLE = `import os, requests

r = requests.get(
    "${BASE}/products",
    params={"pageSize": 500},
    headers={"Authorization": f"Bearer {os.environ['CATALOG_API_KEY']}"},
    timeout=30,
)
r.raise_for_status()
for p in r.json()["items"]:
    print(p["sku"], p["price"]["unitGross"] / 100 if p["price"] else "na zapytanie")`;

function Block({ children }: { children: string }) {
  return (
    <Code block className={classes.code}>
      {children}
    </Code>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={classes.section}>
      <h2 className={classes.sectionHeading}>{heading}</h2>
      {children}
    </section>
  );
}

const SECTIONS = [
  ['klucz', '1. Klucz API'],
  ['uwierzytelnianie', '2. Uwierzytelnianie'],
  ['lista', '3. Lista produktów'],
  ['produkt', '4. Jeden produkt'],
  ['pola', '5. Pola i ceny'],
  ['synchronizacja', '6. Synchronizacja'],
  ['bledy', '7. Limity i błędy'],
  ['przyklady', '8. Przykłady'],
] as const;

// /dokumentacja-api — public, no login: a client's developer reads it before they have an account.
export function ApiDocsPage() {
  return (
    <article className={classes.doc}>
      <PageTitle title='API dla klientów (v1)' eyebrow='Dokumenty' />
      <p className={classes.intro}>
        API pozwala Twojemu systemowi (ERP, sklep internetowy, arkusz, skrypt)
        automatycznie pobierać katalog DEMO PARTS <strong>z Twoimi cenami</strong> —
        tymi samymi, które widzisz po zalogowaniu w katalogu. API służy{' '}
        <strong>tylko do odczytu</strong>: nie składa zamówień i niczego nie
        zmienia.
      </p>
      <ul className={classes.list}>
        <li>
          Adres: <Code>{BASE}</Code>
        </li>
        <li>Format: JSON (UTF-8)</li>
        <li>
          Specyfikacja OpenAPI (Postman, generatory kodu):{' '}
          <a href={`${BASE}/openapi.yaml`}>{`${BASE}/openapi.yaml`}</a> — bez
          klucza.
        </li>
        <li>
          Tylko z serwera do serwera: API nie wysyła nagłówków CORS, więc skrypt
          na stronie w przeglądarce (z innej domeny) go nie wywoła — i dobrze,
          bo klucz nie może trafić do przeglądarki.
        </li>
      </ul>

      <nav className={classes.toc} aria-label='Spis treści'>
        <ol className={classes.tocList}>
          {SECTIONS.map(([id, heading]) => (
            <li key={id}>
              <a href={`#${id}`}>{heading}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id='klucz' heading='1. Klucz API'>
        <ol className={classes.list}>
          <li>
            Zaloguj się i otwórz{' '}
            <Link to='/moje-konto?tab=api'>Moje konto → Klucze API</Link>.
          </li>
          <li>
            Wpisz nazwę (np. „Integracja ERP”), wybierz zakres i kliknij{' '}
            <strong>Utwórz klucz</strong>.
          </li>
          <li>
            <strong>Skopiuj klucz od razu</strong> — pokazujemy go tylko raz.
            Zgubiony klucz unieważnij i utwórz nowy.
          </li>
        </ol>
        <p className={classes.paragraph}>
          Klucz może też utworzyć dla Ciebie DEMO PARTS. Możesz mieć najwyżej 5
          aktywnych kluczy. Zakres klucza:
        </p>
        <ul className={classes.list}>
          <li>
            <strong>Cały katalog</strong> — wszystkie aktywne produkty.
          </li>
          <li>
            <strong>Wybrane produkty</strong> — tylko podane SKU i/lub wszystkie
            produkty z wybranych kategorii. SKU muszą istnieć w katalogu
            (wielkość liter nie ma znaczenia przy dodawaniu).
          </li>
        </ul>
        <p className={classes.paragraph}>
          Klucz to sekret, jak hasło: trzymaj go na serwerze, nie w kodzie
          strony w przeglądarce i nie w repozytorium. Nie wklejaj go do adresu
          URL. Unieważniony klucz przestaje działać od razu.
        </p>
      </Section>

      <Section id='uwierzytelnianie' heading='2. Uwierzytelnianie'>
        <p className={classes.paragraph}>
          Każde zapytanie wysyła klucz w nagłówku (nie w adresie):
        </p>
        <Block>
          {
            'Authorization: Bearer cdm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
          }
        </Block>
        <p className={classes.paragraph}>
          Brak klucza, zły lub unieważniony klucz, zablokowane konto →{' '}
          <Code>{'401 {"error":"UNAUTHORIZED"}'}</Code>. Dlatego adres API
          otwarty w zwykłej przeglądarce zwraca 401 — to poprawne.
        </p>
      </Section>

      <Section id='lista' heading='3. Lista produktów'>
        <Block>{'GET /api/v1/products?page=1&pageSize=100'}</Block>
        <p className={classes.paragraph}>Parametry (wszystkie opcjonalne):</p>
        <ul className={classes.list}>
          <li>
            <Code>page</Code> — numer strony, od 1 (domyślnie 1).
          </li>
          <li>
            <Code>pageSize</Code> — produktów na stronę, 1–500 (domyślnie 100).
            Przy obecnym katalogu <Code>pageSize=500</Code> zwraca wszystko
            jednym zapytaniem.
          </li>
          <li>
            <Code>updatedSince</Code> — tylko produkty zmienione od tej chwili,
            np. <Code>2026-10-14T00:00:00Z</Code> albo <Code>2026-10-14</Code>{' '}
            (czas UTC). Strefę z plusem trzeba zakodować w adresie:{' '}
            <Code>2026-10-14T00:00:00%2B02:00</Code> — niezakodowany{' '}
            <Code>+</Code> zamienia się na spację i API zwraca 400. Najprościej
            używać <Code>Z</Code> (UTC), jak w <Code>generatedAt</Code>.
          </li>
        </ul>
        <p className={classes.paragraph}>
          Produkty są posortowane po SKU, więc strony są stabilne. Odpowiedź:
        </p>
        <Block>{RESPONSE_EXAMPLE}</Block>
      </Section>

      <Section id='produkt' heading='4. Jeden produkt'>
        <Block>{'GET /api/v1/products/{sku}'}</Block>
        <p className={classes.paragraph}>
          Odpowiedź:{' '}
          <Code>
            {'{"item": { … }, "discountPercent": …, "currency": "PLN", …}'}
          </Code>
          . Produkt nieaktywny, nieznany lub poza zakresem klucza →{' '}
          <Code>{'404 {"error":"NOT_FOUND","meta":{"entity":"product"}}'}</Code>
          .
        </p>
      </Section>

      <Section id='pola' heading='5. Pola i ceny'>
        <ul className={classes.list}>
          <li>
            <strong>Kwoty są w groszach</strong> (liczby całkowite):{' '}
            <Code>52920</Code> = 529,20 zł. Bez błędów zaokrągleń.
          </li>
          <li>
            <Code>price.unitGross</Code> / <Code>unitNet</Code> — Twoja cena
            brutto / netto za 1 szt. (z Twoim rabatem).
          </li>
          <li>
            <Code>price.listGross</Code> / <Code>listNet</Code> — cena
            katalogowa przed rabatem (tylko gdy masz rabat).
          </li>
          <li>
            <Code>price.unitDeposit</Code> — kaucja brutto za 1 szt. (bez
            rabatu, VAT 0%).
          </li>
          <li>
            <Code>priceOnRequest: true</Code> → <Code>price: null</Code>, cena
            na zapytanie.
          </li>
          <li>
            <Code>variants</Code> — wersje „oryginalne” i „zamienne” z własnymi
            cenami (gdy produkt je ma).
          </li>
          <li>
            <Code>stock</Code> — sztuki w magazynie; <Code>leadTimeHours</Code>{' '}
            — czas wysyłki 1 szt. (24, 48 lub 72 h).
          </li>
          <li>
            <Code>discountPercent</Code> — Twój rabat: przy produkcie rabat na
            ten produkt, w odpowiedzi rabat ogólny. Zmienia go DEMO PARTS; nowe ceny
            są w API od razu.
          </li>
        </ul>
      </Section>

      <Section id='synchronizacja' heading='6. Synchronizacja (zalecane)'>
        <ol className={classes.list}>
          <li>
            Pierwszy raz pobierz wszystko:{' '}
            <Code>GET /products?pageSize=500</Code> (kolejne strony, aż{' '}
            <Code>page × pageSize ≥ total</Code>). Zapisz{' '}
            <Code>generatedAt</Code> z odpowiedzi{' '}
            <strong>pierwszej strony</strong> — wtedy zmiana, która zdarzy się w
            trakcie pobierania kolejnych stron, wróci przy następnej
            synchronizacji.
          </li>
          <li>
            Potem co np. godzinę:{' '}
            <Code>
              {'GET /products?updatedSince=<zapisany generatedAt>&pageSize=500'}
            </Code>{' '}
            (wszystkie strony) i zapisz nowy <Code>generatedAt</Code> z
            pierwszej strony. <Code>generatedAt</Code> kończy się na{' '}
            <Code>Z</Code>, więc można go wkleić do adresu bez kodowania.
          </li>
          <li>
            Produkt z <Code>{'"active": false'}</Code> został wycofany — usuń go
            u siebie.
          </li>
          <li>
            Gdy Twój rabat się zmienił, <Code>updatedSince</Code> zwraca cały
            katalog, bo zmieniły się wszystkie ceny; <Code>updatedAt</Code>{' '}
            każdego produktu jest wtedy nie starszy niż chwila zmiany rabatu.
          </li>
          <li>
            Produkt, który przestał pasować do zakresu klucza (np. zmienił
            kategorię), po prostu znika z wyników — przy pełnej synchronizacji
            usuń u siebie SKU, których API już nie zwraca.
          </li>
        </ol>
      </Section>

      <Section id='bledy' heading='7. Limity i błędy'>
        <ul className={classes.list}>
          <li>
            <strong>120 zapytań na minutę na klucz.</strong> Powyżej →{' '}
            <Code>
              {'429 {"error":"TOO_MANY_REQUESTS","meta":{"retryAfter":60}}'}
            </Code>{' '}
            — odczekaj podaną liczbę sekund (ta sama wartość jest w nagłówku{' '}
            <Code>Retry-After</Code>).
          </li>
          <li>
            <Code>400</Code> — zły parametr (np. <Code>pageSize=1000</Code>,
            nieczytelna data w <Code>updatedSince</Code>). Treść:{' '}
            <Code>
              {
                '{"success":false,"error":{"issues":[{"path":["pageSize"],"message":"…"}],"name":"ZodError"}}'
              }
            </Code>{' '}
            — pole <Code>issues[].path</Code> wskazuje zły parametr. Pozostałe
            błędy mają postać <Code>{'{"error":"KOD"}'}</Code>.
          </li>
          <li>
            <Code>401</Code> — brak / zły / unieważniony klucz (z nagłówkiem{' '}
            <Code>{'WWW-Authenticate: Bearer realm="catalog-api"'}</Code>).
          </li>
          <li>
            <Code>404</Code> — brak produktu lub poza zakresem klucza; także
            adres spoza API (np. literówka w ścieżce).
          </li>
          <li>
            Zapis (<Code>POST</Code>, <Code>PUT</Code>, <Code>PATCH</Code>,{' '}
            <Code>DELETE</Code>) nie istnieje — API zwraca{' '}
            <Code>{'405 {"error":"METHOD_NOT_ALLOWED"}'}</Code> z nagłówkiem{' '}
            <Code>Allow: GET, HEAD</Code>.
          </li>
        </ul>
      </Section>

      <Section id='przyklady' heading='8. Przykłady'>
        <p className={classes.paragraph}>curl:</p>
        <Block>{CURL_EXAMPLE}</Block>
        <p className={classes.paragraph}>PHP:</p>
        <Block>{PHP_EXAMPLE}</Block>
        <p className={classes.paragraph}>Python:</p>
        <Block>{PYTHON_EXAMPLE}</Block>
        <p className={classes.paragraph}>
          Pytania: <a href='mailto:office@catalog-demo.example'>office@catalog-demo.example</a>.
        </p>
      </Section>
    </article>
  );
}
