// Regulamin katalogu B2B (portal.catalog-demo.example).
// Adapted from shop.catalog-demo.example docs/9_Legal/Regulamin_Sklepu_PL.md (v1.3) to THIS
// service: accounts for companies only, order requests sent by e-mail, no
// online payments, no choice of delivery method, no consumer sales.
// The [[DO WERYFIKACJI PRAWNIKA]] flags were resolved on 2026-10-08 from how the
// application works, without a lawyer's review (owner's decision, Decisions.md).
// A [[...]] marker added later is still rendered highlighted by the page.

import type { LegalDocument } from './privacy';

export const termsOfService: LegalDocument = {
  title: 'Regulamin katalogu B2B',
  status:
    'Projekt dokumentu przygotowany na podstawie regulaminu sklepu shop.catalog-demo.example. Fragmenty oznaczone wymagają weryfikacji prawnika przed publikacją.',
  meta: [
    'Serwis: portal.catalog-demo.example',
    'Wersja: 0.1 (projekt)',
    'Obowiązuje od: 8 października 2026 r.',
  ],
  intro:
    'Regulamin określa zasady korzystania z katalogu B2B DEMO PARTS: zakładania konta firmowego, przeglądania oferty, składania zamówień oraz postępowania reklamacyjnego dotyczącego działania serwisu.',
  sections: [
    {
      heading: '§1. Postanowienia ogólne',
      paragraphs: [
        '1. Regulamin określa zasady korzystania z katalogu internetowego działającego pod adresem portal.catalog-demo.example („Katalog”).',
        '2. Regulamin jest regulaminem, o którym mowa w art. 8 ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.',
        '3. Regulamin jest dostępny nieodpłatnie pod adresem portal.catalog-demo.example/regulamin w formie umożliwiającej jego pobranie, utrwalenie i wydrukowanie.',
      ],
    },
    {
      heading: '§2. Usługodawca i Sprzedawca',
      paragraphs: [
        'Usługodawcą i Sprzedawcą jest DEMO PARTS spółka z ograniczoną odpowiedzialnością, ul. Przykładowa 1, 00-001 Wrocław, Polska.',
        'KRS: 0000000000 · NIP: 0000000000 · REGON: 000000000 · Kapitał zakładowy: 5 000,00 zł.',
        'Sąd rejestrowy: Sąd Rejonowy dla Wrocławia-Fabrycznej we Wrocławiu, VI Wydział Gospodarczy Krajowego Rejestru Sądowego.',
        'Serwis (przyjmowanie części i rdzeni): ul. Warsztatowa 1, 00-002 Przykładowo, woj. dolnośląskie.',
        'Kontakt: office@catalog-demo.example · +48 000 000 001 (zamówienia, B2B, współpraca) · +48 000 000 002 (doradztwo techniczne). Godziny pracy: poniedziałek–piątek 8:00–16:00, sobota 9:00–13:00.',
      ],
    },
    {
      heading: '§3. Definicje',
      paragraphs: [
        'Klient – osoba prawna, jednostka organizacyjna albo osoba fizyczna prowadząca działalność gospodarczą, która założyła Konto i korzysta z Katalogu w związku ze swoją działalnością.',
        'Konto – konto firmy w Katalogu, chronione adresem e-mail i hasłem.',
        'Zamówienie – oświadczenie Klienta wysłane z koszyka Katalogu, zawierające wybrane Towary, ich ilości i adres dostawy.',
        'Towar – część oferowana w Katalogu, w szczególności regenerowany wtryskiwacz Common Rail lub pompa wtryskowa. Towar regenerowany nie jest towarem nowym.',
        'Kaucja – zwrotna kwota zabezpieczająca przekazanie Sprzedawcy zużytej części tego samego typu (rdzenia).',
        'Rabat – indywidualny procentowy upust od ceny Towaru, przypisany do Konta przez Sprzedawcę.',
      ],
    },
    {
      heading: '§4. Charakter Katalogu',
      paragraphs: [
        '1. Katalog jest przeznaczony wyłącznie dla przedsiębiorców. Nie służy do sprzedaży konsumentom; konsumenci mogą kupować w sklepie shop.catalog-demo.example.',
        '2. Oferta, ceny i karty Towarów są dostępne wyłącznie po zalogowaniu.',
        '3. Klient będący osobą fizyczną prowadzącą działalność gospodarczą, dla której umowa nie ma charakteru zawodowego (wynika to z treści wpisu w CEIDG), korzysta z ochrony przewidzianej w art. 385⁵ Kodeksu cywilnego oraz w art. 7aa ustawy o prawach konsumenta. Postanowienia Regulaminu wyłączające lub ograniczające tę ochronę nie mają do niego zastosowania. Taki Klient powinien poinformować o tym Sprzedawcę przed wysłaniem Zamówienia.',
      ],
    },
    {
      heading: '§5. Wymagania techniczne',
      paragraphs: [
        'Do korzystania z Katalogu wystarczy urządzenie z dostępem do Internetu, aktualna przeglądarka z obsługą JavaScript i plików cookie oraz czynne konto poczty elektronicznej. Korzystanie z Katalogu jest bezpłatne. Zakazane jest dostarczanie treści o charakterze bezprawnym.',
      ],
    },
    {
      heading: '§6. Konto',
      paragraphs: [
        '1. Rejestracja wymaga podania adresu e-mail i hasła oraz akceptacji Regulaminu i Polityki prywatności. Przed wysłaniem pierwszego Zamówienia Klient uzupełnia w zakładce „Moje konto” nazwę firmy, NIP, imię i nazwisko osoby kontaktowej i numer telefonu.',
        '2. Konto staje się aktywne po kliknięciu w link potwierdzający wysłany na podany adres e-mail. Link jest ważny 24 godziny i może zostać wysłany ponownie.',
        '3. Z chwilą aktywacji Konta zostaje zawarta umowa o świadczenie usług drogą elektroniczną na czas nieoznaczony.',
        '4. Klient odpowiada za prawdziwość podanych danych i za zachowanie hasła w poufności. Dane firmy, adres dostawy i hasło można zmienić w zakładce „Moje konto”.',
        '5. Klient może w każdej chwili usunąć Konto w zakładce „Moje konto”, co rozwiązuje umowę o świadczenie usług drogą elektroniczną. Złożone wcześniej zamówienia pozostają w dokumentacji Sprzedawcy.',
        '6. Sprzedawca może zablokować lub usunąć Konto, jeżeli Klient podał nieprawdziwe dane, narusza Regulamin lub przepisy prawa albo korzysta z Katalogu w sposób zagrażający jego bezpieczeństwu. Zablokowanie uniemożliwia logowanie do czasu odblokowania. Usunięcie Konta rozwiązuje umowę o świadczenie usług drogą elektroniczną; złożone wcześniej Zamówienia pozostają w dokumentacji Sprzedawcy. Klient może wyjaśnić sprawę, kontaktując się z office@catalog-demo.example.',
      ],
    },
    {
      heading: '§7. Ceny i rabaty',
      paragraphs: [
        '1. Informacje o Towarach w Katalogu stanowią zaproszenie do zawarcia umowy w rozumieniu art. 71 Kodeksu cywilnego, a nie ofertę.',
        '2. Ceny są wyrażone w złotych polskich i prezentowane jako netto oraz brutto (z podatkiem VAT 23%).',
        '3. Rabat przypisany do Konta pomniejsza cenę Towaru. Rabat nie dotyczy Kaucji.',
        '4. Kaucja jest prezentowana osobno i nie jest ceną Towaru. Katalog prezentuje Kaucję bez podatku VAT.',
        '5. Towary oznaczone „Cena na zapytanie” nie mają ceny w Katalogu. Ich cenę Sprzedawca podaje indywidualnie po otrzymaniu Zamówienia.',
      ],
    },
    {
      heading: '§8. Zamówienia',
      paragraphs: [
        '1. Klient dodaje Towary do koszyka, uzupełnia adres dostawy w Koncie i wysyła Zamówienie przyciskiem „Wyślij zamówienie”. Zamówienie otrzymuje numer i jest przesyłane do Sprzedawcy pocztą elektroniczną.',
        '2. Katalog nie obsługuje płatności i nie pozwala wybrać sposobu dostawy. Warunki płatności i dostawy Sprzedawca uzgadnia z Klientem po otrzymaniu Zamówienia; dostawa następuje na adres zapisany w Koncie.',
        '3. Wysłanie Zamówienia nie jest zawarciem umowy sprzedaży. Umowa zostaje zawarta z chwilą potwierdzenia przyjęcia Zamówienia przez Sprzedawcę. Sprzedawca potwierdza przyjęcie Zamówienia wiadomością e-mail lub telefonicznie.',
        '4. Historia wysłanych Zamówień jest dostępna w zakładce „Moje konto”.',
      ],
    },
    {
      heading: '§9. Kaucja za rdzeń',
      paragraphs: [
        '1. Przy zakupie części regenerowanych Sprzedawca może pobrać Kaucję. Jej wysokość jest ustalana indywidualnie dla każdego numeru części i jest podana na karcie Towaru oraz w koszyku.',
        '2. Rdzeń należy dostarczyć w terminie 30 dni od odbioru Towaru na adres serwisu: ul. Warsztatowa 1, 00-002 Przykładowo. Koszt przesyłki rdzenia ponosi Klient.',
        '3. Sprzedawca weryfikuje rdzeń w terminie 7 dni od jego otrzymania i zwraca Kaucję w terminie 14 dni od zakończenia weryfikacji.',
        '4. Sprzedawca odmawia zwrotu Kaucji wyłącznie, gdy rdzeń ma inny numer katalogowy albo nie jest częścią tego samego typu, jest niekompletny, jest uszkodzony mechanicznie lub elektrycznie w sposób wykluczający regenerację albo nosi ślady naprawy wykonanej przez podmiot trzeci.',
        '5. Kaucja jest zwracana w tej samej formie, w jakiej Klient zapłacił za Zamówienie, chyba że strony uzgodnią inaczej.',
      ],
    },
    {
      heading: '§10. Gwarancja i rękojmia',
      paragraphs: [
        '1. Sprzedawca udziela na Towary regenerowane gwarancji: 24 miesiące na wtryskiwacze Delphi w wersji „Części oryginalne” oraz 12 miesięcy na pozostałe Towary, w tym wersje „Części zamienne”. Okres gwarancji dla danej pozycji jest podany na karcie Towaru.',
        '2. Gwarancja nie obejmuje uszkodzeń powstałych wskutek zanieczyszczonego paliwa lub niesprawnego filtra paliwa, montażu poza warsztatem specjalistycznym, uszkodzenia mechanicznego lub ingerencji w Towar (w tym zerwania plomb) oraz niesprawności układu paliwowego pojazdu poza samym Towarem.',
        '3. Do zgłoszenia gwarancyjnego Klient dołącza dowód zakupu, potwierdzenie montażu w warsztacie posiadającym odpowiednie uprawnienia oraz zdjęcie wymienionego filtra paliwa. Sprzedawca rozpatruje zgłoszenie w terminie 14 dni.',
        '4. Odpowiedzialność Sprzedawcy z tytułu rękojmi jest wyłączona na podstawie art. 558 § 1 Kodeksu cywilnego. Wyłączenie nie dotyczy gwarancji.',
      ],
    },
    {
      heading: '§11. Reklamacje dotyczące działania Katalogu',
      paragraphs: [
        'Reklamacje dotyczące działania Katalogu można składać na adres office@catalog-demo.example. Zgłoszenie powinno zawierać dane Klienta, opis problemu i żądanie. Sprzedawca rozpatruje reklamację w terminie 14 dni od jej otrzymania.',
      ],
    },
    {
      heading: '§12. Dane osobowe',
      paragraphs: [
        'Administratorem danych osobowych jest Sprzedawca wskazany w §2. Zasady przetwarzania danych opisuje Polityka prywatności dostępna pod adresem portal.catalog-demo.example/polityka-prywatnosci.',
      ],
    },
    {
      heading: '§13. Postanowienia końcowe',
      paragraphs: [
        '1. W sprawach nieuregulowanych stosuje się przepisy prawa polskiego, w szczególności Kodeksu cywilnego i ustawy o świadczeniu usług drogą elektroniczną.',
        '2. Spory rozstrzyga sąd właściwy dla siedziby Sprzedawcy.',
        '3. Sprzedawca może zmienić Regulamin z ważnych przyczyn. O zmianie Klienci posiadający Konto są informowani z co najmniej 14-dniowym wyprzedzeniem. Do zamówień złożonych przed zmianą stosuje się Regulamin w brzmieniu dotychczasowym.',
      ],
    },
  ],
};
