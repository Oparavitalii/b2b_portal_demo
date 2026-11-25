import {
  API_KEYS_MAX_ACTIVE,
  type ApiKey,
  type CreateApiKeyInput,
  createApiKeySchema,
  type CreatedApiKey,
} from '@catalog/shared/schemas/apiKeys';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Modal,
  MultiSelect,
  SegmentedControl,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { zodErrors } from '@/features/auth/form-utils';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage, parseApiError } from '@/lib/http';

import {
  type ApiKeysOwner,
  useApiKeys,
  useCatalogCategories,
  useCreateApiKey,
  useRevokeApiKey,
} from './api';

const EMPTY: CreateApiKeyInput = {
  name: '',
  scope: 'all',
  skus: [],
  categories: [],
};

function createError(err: unknown): string {
  const info = parseApiError(err);
  const code = info.code;
  if (code === 'api_key_unknown_skus') {
    const skus = (info.meta as { skus?: string[] } | undefined)?.skus ?? [];
    return `Nie ma w katalogu: ${skus.join(', ')}. Popraw lub usuń te SKU.`;
  }
  if (code === 'api_key_limit')
    return `Możesz mieć najwyżej ${API_KEYS_MAX_ACTIVE} aktywnych kluczy. Unieważnij nieużywany klucz.`;
  if (code === 'api_key_scope_empty')
    return 'Wybierz co najmniej jeden SKU lub kategorię.';
  return apiErrorMessage(err);
}

function scopeLabel(k: ApiKey): string {
  if (k.scope === 'all') return 'Cały katalog';
  const parts = [];
  if (k.skus.length > 0) parts.push(`${k.skus.length} SKU`);
  if (k.categories.length > 0) parts.push(k.categories.join(', '));
  return parts.join(' + ');
}

function CreateForm({
  owner,
  disabled,
  onCreated,
}: {
  owner: ApiKeysOwner;
  disabled: boolean;
  onCreated: (created: CreatedApiKey) => void;
}) {
  const create = useCreateApiKey(owner);
  const categories = useCatalogCategories();
  const form = useForm<CreateApiKeyInput>({
    initialValues: EMPTY,
    validate: (values) => zodErrors(createApiKeySchema, values),
  });

  const submit = form.onSubmit((values) => {
    create.reset();
    create.mutate(createApiKeySchema.parse(values), {
      onSuccess: (created) => {
        form.setValues(EMPTY);
        form.resetDirty();
        onCreated(created);
      },
    });
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap='sm'>
        <Title order={3} size='h5'>
          Nowy klucz
        </Title>
        {create.isError ? (
          <Alert color='red' variant='light' role='alert'>
            {createError(create.error)}
          </Alert>
        ) : null}
        <TextInput
          label='Nazwa klucza'
          description='Np. „Integracja ERP” — żeby odróżnić klucze od siebie.'
          maxLength={60}
          required
          {...form.getInputProps('name')}
        />
        <div>
          <Text size='sm' fw={500} mb={4}>
            Zakres
          </Text>
          <SegmentedControl
            data={[
              { value: 'all', label: 'Cały katalog' },
              { value: 'list', label: 'Wybrane produkty' },
            ]}
            {...form.getInputProps('scope')}
          />
        </div>
        {form.values.scope === 'list' ? (
          <>
            <TagsInput
              label='SKU'
              description='Wpisz SKU i naciśnij Enter. Można wkleić listę rozdzieloną przecinkami.'
              splitChars={[',', ' ', ';']}
              clearable
              {...form.getInputProps('skus')}
            />
            <MultiSelect
              label='Kategorie'
              description='Wszystkie produkty z wybranych kategorii, także dodane później.'
              data={categories.data ?? []}
              searchable
              clearable
              {...form.getInputProps('categories')}
            />
          </>
        ) : null}
        <Group>
          <Button
            type='submit'
            leftSection={<KeyRound size={16} aria-hidden />}
            loading={create.isPending}
            disabled={disabled}
          >
            Utwórz klucz
          </Button>
          {disabled ? (
            <Text size='sm' c='cdmInk.6'>
              Limit {API_KEYS_MAX_ACTIVE} aktywnych kluczy.
            </Text>
          ) : null}
        </Group>
      </Stack>
    </form>
  );
}

function NewKeyModal({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={created !== null}
      onClose={onClose}
      title='Klucz API utworzony'
      size='lg'
      closeOnClickOutside={false}
    >
      {created ? (
        <Stack gap='md'>
          <Alert color='orange' variant='light'>
            Skopiuj klucz teraz. Ze względów bezpieczeństwa nie pokażemy go
            ponownie — jeśli go zgubisz, unieważnij go i utwórz nowy.
          </Alert>
          <Code block data-testid='api-key-plain'>
            {created.key}
          </Code>
          <Group justify='space-between'>
            <CopyButton value={created.key}>
              {({ copied, copy }) => (
                <Button
                  variant='light'
                  leftSection={<Copy size={16} aria-hidden />}
                  onClick={copy}
                >
                  {copied ? 'Skopiowano' : 'Kopiuj klucz'}
                </Button>
              )}
            </CopyButton>
            <Button onClick={onClose}>Zapisałem klucz</Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

function QuickStart() {
  const base =
    typeof window === 'undefined' ? '' : `${window.location.origin}/api/v1`;
  return (
    <Stack gap='xs'>
      <Title order={3} size='h5'>
        Jak użyć
      </Title>
      <Text size='sm' c='cdmInk.6'>
        Klucz wysyłasz w nagłówku <Code>Authorization: Bearer …</Code>. API
        zwraca produkty w JSON (stronami do 500 sztuk) z Twoimi cenami — tymi
        samymi, które widzisz w katalogu. Tylko odczyt. Kwoty są w groszach.
      </Text>
      <Code block>
        {`curl -H "Authorization: Bearer cdm_live_…" \\\n  "${base}/products?page=1&pageSize=500"\n\n# tylko zmienione od daty:\ncurl -H "Authorization: Bearer cdm_live_…" \\\n  "${base}/products?updatedSince=2026-10-14T00:00:00Z"\n\n# jeden produkt:\ncurl -H "Authorization: Bearer cdm_live_…" "${base}/products/SKU"`}
      </Code>
      <Text size='sm'>
        Pełna instrukcja (pola, synchronizacja, błędy, przykłady w PHP i
        Pythonie):{' '}
        <Anchor component={Link} to='/dokumentacja-api'>
          Dokumentacja API
        </Anchor>
      </Text>
    </Stack>
  );
}

function KeysTable({ owner, keys }: { owner: ApiKeysOwner; keys: ApiKey[] }) {
  const revoke = useRevokeApiKey(owner);

  const confirmRevoke = (k: ApiKey) =>
    modals.openConfirmModal({
      title: 'Unieważnić klucz?',
      children: (
        <Text size='sm'>
          Klucz „{k.name}” ({k.prefix}…) przestanie działać od razu. Systemy,
          które go używają, dostaną błąd 401. Tej operacji nie można cofnąć.
        </Text>
      ),
      labels: { confirm: 'Unieważnij', cancel: 'Anuluj' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        revoke.mutate(k.id, {
          onSuccess: () =>
            notifications.show({
              color: 'green',
              message: `Unieważniono klucz: ${k.name}`,
            }),
          onError: (err) =>
            notifications.show({
              color: 'red',
              title: 'Nie unieważniono klucza',
              message: apiErrorMessage(err),
              autoClose: 8000,
            }),
        }),
    });

  if (keys.length === 0) {
    return <Text c='cdmInk.6'>Brak kluczy API.</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={760}>
      <Table striped verticalSpacing='sm'>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nazwa</Table.Th>
            <Table.Th>Klucz</Table.Th>
            <Table.Th>Zakres</Table.Th>
            <Table.Th>Utworzony</Table.Th>
            <Table.Th>Ostatnio użyty</Table.Th>
            <Table.Th>Zapytania</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {keys.map((k) => (
            <Table.Tr key={k.id}>
              <Table.Td>{k.name}</Table.Td>
              <Table.Td>
                <Code>{k.prefix}…</Code>
              </Table.Td>
              <Table.Td>{scopeLabel(k)}</Table.Td>
              <Table.Td>
                {formatDateTime(k.createdAt)}
                <Text size='xs' c='cdmInk.6'>
                  {k.createdBy === 'admin' ? 'przez DEMO PARTS' : 'przez klienta'}
                </Text>
              </Table.Td>
              <Table.Td>
                {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : '—'}
              </Table.Td>
              <Table.Td>{k.requestCount}</Table.Td>
              <Table.Td>
                {k.revokedAt !== null ? (
                  <Badge color='gray' variant='light'>
                    Unieważniony
                  </Badge>
                ) : (
                  <Button
                    size='xs'
                    variant='subtle'
                    color='red'
                    onClick={() => confirmRevoke(k)}
                    loading={revoke.isPending && revoke.variables === k.id}
                    aria-label={`Unieważnij klucz ${k.name}`}
                  >
                    Unieważnij
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

// Client API keys (B-21): list, create (plain key shown once), revoke.
// owner null = the signed-in customer (Moje konto); a UUID = the admin managing that customer.
export function ApiKeysPanel({ owner }: { owner: ApiKeysOwner }) {
  const keys = useApiKeys(owner);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const active = (keys.data ?? []).filter((k) => k.revokedAt === null).length;

  return (
    <Stack gap='lg'>
      <Text c='cdmInk.6'>
        {owner === null
          ? 'Klucz API pozwala Twojemu systemowi (ERP, sklep, arkusz) automatycznie pobierać katalog DEMO PARTS z Twoimi cenami.'
          : 'Klucze API tego klienta. Klucz pokazujemy tylko raz, przy utworzeniu — przekaż go klientowi bezpiecznym kanałem.'}
      </Text>
      {keys.isError ? (
        <Alert color='red' variant='light' role='alert'>
          Nie udało się wczytać kluczy. {apiErrorMessage(keys.error)}
        </Alert>
      ) : !keys.data ? (
        <Loader color='cdmInk.9' />
      ) : (
        <KeysTable owner={owner} keys={keys.data} />
      )}
      <CreateForm
        owner={owner}
        disabled={active >= API_KEYS_MAX_ACTIVE}
        onCreated={setCreated}
      />
      <QuickStart />
      <NewKeyModal created={created} onClose={() => setCreated(null)} />
    </Stack>
  );
}
