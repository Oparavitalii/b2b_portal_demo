import { Alert } from '@mantine/core';
import { Link, useSearchParams } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { ApiKeysPanel } from '@/features/apiKeys/ApiKeysPanel';
import { useAuthStore } from '@/lib/auth-store';

import classes from './Account.module.css';
import { AccountMenu, type AccountTab, isAccountTab } from './AccountMenu';
import { AddressSection } from './AddressSection';
import { DeleteAccountSection } from './DeleteAccountSection';
import { PasswordSection } from './PasswordSection';
import { ProfileSection } from './ProfileSection';

const TITLES: Record<AccountTab, string> = {
  dane: 'Dane konta',
  haslo: 'Zmiana hasła',
  adres: 'Adres dostawy',
  api: 'Klucze API',
  'usun-konto': 'Usuń konto',
};

// API keys belong to customers (/me/api-keys is customer-only); the admin manages them per customer.
function ApiKeysSection() {
  const isCustomer = useAuthStore((s) => s.user?.role === 'customer');
  if (isCustomer) return <ApiKeysPanel owner={null} />;
  return (
    <Alert color='gray' variant='light'>
      Konto administratora nie ma własnych kluczy API. Klucze klientów wydajesz
      i unieważniasz w <Link to='/admin/klienci'>Panel admina → Klienci</Link>,
      przycisk „API” przy kliencie.
    </Alert>
  );
}

function Section({ tab }: { tab: AccountTab }) {
  switch (tab) {
    case 'dane':
      return <ProfileSection />;
    case 'haslo':
      return <PasswordSection />;
    case 'adres':
      return <AddressSection />;
    case 'api':
      return <ApiKeysSection />;
    case 'usun-konto':
      return <DeleteAccountSection />;
  }
}

// /moje-konto?tab=dane|haslo|adres|api|usun-konto (R-07, R-08, R-09, R-12; api = B-21).
// An unknown or missing tab shows "Dane konta".
export function AccountPage() {
  const [params] = useSearchParams();
  const raw = params.get('tab');
  const tab: AccountTab = isAccountTab(raw) ? raw : 'dane';

  return (
    <div>
      <PageTitle eyebrow='Moje konto' title={TITLES[tab]} />
      <div className={classes.layout}>
        <AccountMenu active={tab} />
        <div className={classes.content}>
          <section className={classes.panel} aria-label={TITLES[tab]}>
            <Section tab={tab} />
          </section>
        </div>
      </div>
    </div>
  );
}
