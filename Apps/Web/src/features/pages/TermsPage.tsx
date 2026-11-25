import { termsOfService } from '@/content/terms';

import { LegalDocumentView } from './PrivacyPage';

export function TermsPage() {
  return <LegalDocumentView doc={termsOfService} />;
}
