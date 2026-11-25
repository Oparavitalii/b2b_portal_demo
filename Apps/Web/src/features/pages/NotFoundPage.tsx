import { Button, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';

export function NotFoundPage() {
  return (
    <Stack gap='md' align='flex-start' py='xl'>
      <PageTitle
        eyebrow='Błąd 404'
        title='Nie znaleziono strony'
        lead='Ta strona nie istnieje albo zmieniła adres.'
      />
      <Text c='cdmInk.6'>Wróć do katalogu albo sprawdź dane kontaktowe.</Text>
      <Group gap='sm'>
        <Button component={Link} to='/'>
          Przejdź do katalogu
        </Button>
        <Button component={Link} to='/kontakt' variant='default'>
          Kontakt
        </Button>
      </Group>
    </Stack>
  );
}
