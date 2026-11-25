// Polityka prywatności katalogu B2B (portal.catalog-demo.example).
// Adapted from shop.catalog-demo.example docs/9_Legal/Polityka_Prywatnosci_PL.md to THIS
// service: company accounts, order requests sent by e-mail, no payments, no
// delivery choice, no analytics, no marketing tools, self-hosted fonts.
// The [[DO WERYFIKACJI PRAWNIKA]] flags were resolved on 2026-10-08 from how the
// application works, without a lawyer's review (owner's decision, Decisions.md).
// A [[...]] marker added later is still rendered highlighted by the page.

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  status: string;
  meta: string[];
  intro: string;
  sections: LegalSection[];
}

export const privacyPolicy: LegalDocument = {
  title: 'Polityka prywatności',
  status:
    'Projekt dokumentu przygotowany na podstawie polityki prywatności sklepu shop.catalog-demo.example. Fragmenty oznaczone wymagają weryfikacji prawnika przed publikacją.',
  meta: [
    'Serwis: portal.catalog-demo.example',
    'Wersja: 0.1 (projekt)',
    'Obowiązuje od: 8 października 2026 r.',
  ],
  intro:
    'Ta polityka opisuje, jakie dane przetwarzamy w katalogu B2B DEMO PARTS dostępnym pod adresem portal.catalog-demo.example, w jakim celu, jak długo i jakie prawa przysługują osobom, których dane dotyczą. Katalog jest przeznaczony wyłącznie dla firm: służy do przeglądania oferty po zalogowaniu i wysyłania zamówień do DEMO PARTS. W katalogu nie ma płatności online.',
  sections: [
    {
      heading: '1. Administrator danych',
      paragraphs: [
        'Administratorem danych osobowych jest DEMO PARTS spółka z ograniczoną odpowiedzialnością z siedzibą we Wrocławiu, ul. Przykładowa 1, 00-001 Wrocław, wpisana do Krajowego Rejestru Sądowego pod numerem KRS 0000000000, NIP 0000000000, REGON 000000000, kapitał zakładowy 5 000,00 zł.',
        'Kontakt w sprawach danych osobowych: office@catalog-demo.example. Telefon: +48 000 000 001 (zamówienia, B2B), +48 000 000 002 (doradztwo techniczne).',
        'Adres serwisu (warsztatu), który nie jest adresem siedziby: ul. Warsztatowa 1, 00-002 Przykładowo, woj. dolnośląskie.',
        'Administrator nie powołał Inspektora Ochrony Danych, ponieważ nie ma takiego obowiązku (art. 37 RODO). We wszystkich sprawach danych osobowych można pisać na office@catalog-demo.example.',
      ],
    },
    {
      heading: '2. Jakie dane przetwarzamy',
      paragraphs: [
        'Konto firmy: adres e-mail, hasło (zapisane wyłącznie jako skrót kryptograficzny, nigdy jawnie), nazwa firmy, NIP, imię i nazwisko osoby kontaktowej, numer telefonu oraz data potwierdzenia adresu e-mail.',
        'Adres dostawy zapisany w koncie: nazwa firmy, ulica, kod pocztowy, miejscowość, kraj, telefon.',
        'Zamówienia: numer zamówienia, data, zamówione pozycje, ceny, rabat, kaucje, uwagi do zamówienia oraz kopia danych firmy i adresu dostawy z chwili złożenia zamówienia.',
        'Rabat procentowy przypisany do konta przez DEMO PARTS.',
        'Dane techniczne: adres IP, data i godzina żądania, informacje o przeglądarce oraz logi serwera prowadzone przez dostawcę hostingu.',
        'Dane sesji i bezpieczeństwa: identyfikatory sesji logowania, jednorazowe tokeny potwierdzenia adresu e-mail i resetu hasła (przechowywane jako skrót) oraz dziennik zdarzeń bezpieczeństwa, np. resetu hasła. Przy sesjach logowania i w dzienniku zdarzeń zapisywany jest adres IP oraz identyfikator przeglądarki (User-Agent).',
        'Dane firmy (nazwa, NIP) są danymi osobowymi wtedy, gdy firmę prowadzi osoba fizyczna. Dane osoby kontaktowej są danymi osobowymi zawsze.',
      ],
    },
    {
      heading: '3. Cele i podstawy prawne',
      paragraphs: [
        'Założenie i prowadzenie konta, logowanie, potwierdzenie adresu e-mail, reset hasła – świadczenie usługi drogą elektroniczną na podstawie Regulaminu: art. 6 ust. 1 lit. b RODO.',
        'Przyjęcie i obsługa zamówienia, kontakt w sprawie płatności i dostawy – działania przed zawarciem umowy sprzedaży i jej wykonanie: art. 6 ust. 1 lit. b RODO.',
        'Dane osoby kontaktowej reprezentującej firmę – prawnie uzasadniony interes administratora polegający na komunikacji z kontrahentem: art. 6 ust. 1 lit. f RODO.',
        'Wystawianie i przechowywanie dokumentów księgowych po realizacji zamówienia: art. 6 ust. 1 lit. c RODO (przepisy podatkowe i o rachunkowości).',
        'Bezpieczeństwo serwisu, kopie zapasowe, ustalenie i obrona roszczeń: art. 6 ust. 1 lit. f RODO.',
      ],
    },
    {
      heading: '4. Dobrowolność podania danych',
      paragraphs: [
        'Podanie danych jest dobrowolne, ale bez adresu e-mail i hasła nie da się założyć konta, a bez danych firmy (nazwa, NIP, osoba kontaktowa, telefon) i adresu dostawy nie da się wysłać zamówienia.',
      ],
    },
    {
      heading: '5. Odbiorcy danych',
      paragraphs: [
        'Upoważnieni pracownicy i współpracownicy DEMO PARTS – w zakresie obsługi kont i zamówień.',
        'Dostawca hostingu i poczty elektronicznej: PRZYKŁADOWY HOSTING sp. z o.o., ul. Serwerowa 1, 00-003 Przykładowo, KRS 0000000000, NIP 0000000000, REGON 000000000. Na jego serwerach w Polsce działa katalog i jego baza danych.',
        'Wiadomości e-mail katalogu (potwierdzenie adresu, reset hasła, zamówienie wysyłane do DEMO PARTS) są wysyłane przez serwer pocztowy SMTP. Serwer pocztowy prowadzi dostawca hostingu katalogu w domenie shop.catalog-demo.example.',
        'Przewoźnik dostarczający zamówione części – w zakresie danych adresowych i kontaktowych potrzebnych do doręczenia. Przewoźnika wybiera Sprzedawca przy uzgadnianiu realizacji zamówienia.',
        'Podmiot świadczący usługi księgowe – w zakresie dokumentacji finansowo-księgowej. Biuro rachunkowe nie zostało jeszcze wybrane, dlatego podajemy kategorię odbiorcy (art. 13 ust. 1 lit. e RODO).',
        'Organy uprawnione na podstawie przepisów prawa.',
        'Z podmiotami przetwarzającymi dane w imieniu DEMO PARTS zawierane są umowy powierzenia (art. 28 RODO). Dotyczy to w szczególności dostawcy hostingu, na którego serwerach działa katalog portal.catalog-demo.example.',
      ],
    },
    {
      heading: '6. Przekazywanie danych poza EOG',
      paragraphs: [
        'Nie przekazujemy danych poza Europejski Obszar Gospodarczy. Katalog nie korzysta z Google Analytics, Google Ads, Meta Pixel, map Google ani czcionek ładowanych z serwerów Google – kroje pisma są serwowane z naszego serwera.',
      ],
    },
    {
      heading: '7. Okres przechowywania',
      paragraphs: [
        'Konto – przez czas jego istnienia. Konto można usunąć samodzielnie w zakładce „Moje konto”; usunięcie kasuje konto, adres dostawy, koszyk i sesje logowania.',
        'Zamówienia – po usunięciu konta zamówienia pozostają bez powiązania z kontem, z kopią danych firmy i adresu z chwili złożenia, przez okres wymagany przepisami podatkowymi i o rachunkowości (5 lat od końca roku kalendarzowego, w którym upłynął termin płatności podatku), a następnie do upływu przedawnienia roszczeń.',
        'Konta, których adres e-mail nie został potwierdzony – do potwierdzenia adresu albo do usunięcia konta przez administratora, także na żądanie osoby, której dane dotyczą.',
        'Tokeny potwierdzenia adresu e-mail tracą ważność po 24 godzinach, a tokeny resetu hasła po 1 godzinie.',
        'Kopie zapasowe bazy danych – przechowujemy 7 ostatnich kopii; dane usunięte z bazy pozostają w kopiach do ich nadpisania w cyklu rotacji i nie są w tym czasie wykorzystywane.',
        'Logi serwera – przez okres stosowany przez dostawcę hostingu, nie dłużej niż jest to potrzebne do zapewnienia bezpieczeństwa i diagnostyki.',
      ],
    },
    {
      heading: '8. Prawa osób, których dane dotyczą',
      paragraphs: [
        'Masz prawo dostępu do danych i otrzymania ich kopii, do ich sprostowania, usunięcia (art. 17 RODO), ograniczenia przetwarzania i przeniesienia, a także prawo sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie.',
        'Dane konta i adres dostawy możesz w każdej chwili poprawić samodzielnie w zakładce „Moje konto”, tam też możesz usunąć konto.',
        'Żądania kieruj na adres office@catalog-demo.example. Odpowiadamy w ciągu 1 miesiąca; termin można przedłużyć o kolejne 2 miesiące przy żądaniach złożonych, informując o tym w pierwszym miesiącu.',
      ],
    },
    {
      heading: '9. Skarga do organu nadzorczego',
      paragraphs: [
        'Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl.',
      ],
    },
    {
      heading: '10. Pliki cookie i pamięć przeglądarki',
      paragraphs: [
        'Katalog używa wyłącznie jednego pliku cookie, niezbędnego do działania logowania: zabezpieczonego ciasteczka z tokenem odświeżania sesji (httpOnly, dostępnego tylko dla adresów /api/auth). Bez niego nie da się pozostać zalogowanym. Ciasteczko nazywa się refresh_token i jest ważne 7 dni od ostatniego odświeżenia sesji; wylogowanie je usuwa.',
        'W pamięci przeglądarki (localStorage) zapisujemy znacznik catalog_session o wartości „1”, który informuje aplikację, że w tej przeglądarce ktoś się wcześniej logował. Znacznik nie zawiera danych osobowych i jest usuwany przy wylogowaniu.',
        'Nie używamy plików cookie analitycznych, marketingowych ani funkcjonalnych i nie stosujemy narzędzi zewnętrznych, które by je zapisywały. Dlatego katalog nie wyświetla banera zgody: przechowywanie informacji niezbędnych do świadczenia usługi żądanej przez użytkownika nie wymaga zgody. Wyjątek ten, przewidziany w ustawie z dnia 12 lipca 2024 r. – Prawo komunikacji elektronicznej, obejmuje ciasteczko sesji oraz techniczny znacznik zapisywany w pamięci przeglądarki (localStorage).',
      ],
    },
    {
      heading: '11. Zautomatyzowane decyzje i profilowanie',
      paragraphs: [
        'Nie podejmujemy zautomatyzowanych decyzji wywołujących skutki prawne ani nie profilujemy użytkowników. Rabat przypisany do konta ustala pracownik DEMO PARTS.',
      ],
    },
    {
      heading: '12. Zmiany polityki',
      paragraphs: [
        'Aktualna wersja jest zawsze dostępna pod adresem portal.catalog-demo.example/polityka-prywatnosci. O istotnych zmianach informujemy z 14-dniowym wyprzedzeniem.',
      ],
    },
  ],
};
