import {
  type AdminProduct,
  DISCOUNT_STEP,
  type DiscountRuleInput,
  type DiscountTemplate,
  discountTemplateInputSchema,
} from '@catalog/shared/schemas/admin';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  SegmentedControl,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { apiErrorMessage } from '@/lib/http';
import { formatPercent, formatPLN } from '@/lib/format';

import classes from './Admin.module.css';
import { AdminNav } from './AdminNav';
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  discountErrorMessage,
  useAdminProducts,
  useDiscountTemplates,
  useProductOptions,
  useProductSkus,
  useSaveDiscountTemplate,
} from './api';
import { ProductThumb } from './ProductThumb';

/** '' = no rule (the field is empty). */
type Pct = number | '';
type Draft = {
  name: string;
  categories: Record<string, Pct>;
  products: Record<string, Pct>;
};

function fromTemplate(t: DiscountTemplate | null): Draft {
  const draft: Draft = { name: t?.name ?? '', categories: {}, products: {} };
  for (const r of t?.rules ?? []) {
    if (r.type === 'category') draft.categories[r.target] = r.percent;
    else draft.products[r.target] = r.percent;
  }
  return draft;
}

function toRules(d: Draft): DiscountRuleInput[] {
  const pick = (type: 'category' | 'product', m: Record<string, Pct>) =>
    Object.entries(m)
      .filter(([, p]) => p !== '')
      .map(([target, percent]) => ({ type, target, percent: Number(percent) }));
  return [...pick('category', d.categories), ...pick('product', d.products)];
}

/** Stable text of what would be saved: equal keys = nothing to save. */
function key(d: Draft): string {
  const rules = toRules(d)
    .map((r) => `${r.type}:${r.target}=${r.percent}`)
    .sort();
  return JSON.stringify([d.name.trim(), rules]);
}

function asPct(v: number | string): Pct {
  return typeof v === 'number' ? v : '';
}

// Szablon rabatów as a full page (owner, 2026-10-16): every category and every product
// listed with its own % field, like stock / delivery time in Produkty. The save bar stays
// on screen; leaving with unsaved changes asks whether to save.
export function DiscountTemplateEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nowy';
  const templates = useDiscountTemplates();
  const template = isNew
    ? null
    : (templates.data?.find((t) => t.id === id) ?? null);

  return (
    <>
      <PageTitle
        eyebrow='Panel administratora · Szablony rabatów'
        title={isNew ? 'Nowy szablon rabatów' : 'Edycja szablonu'}
        lead='Wpisz rabat przy kategorii albo przy produkcie. Puste pole = brak rabatu z szablonu. Rabat produktu wygrywa z rabatem jego kategorii; produkty bez rabatu mają rabat ogólny klienta.'
      />
      <AdminNav />
      <Button
        component={Link}
        to='/admin/rabaty'
        variant='subtle'
        color='cdmInk'
        size='xs'
        leftSection={<ArrowLeft size={14} aria-hidden />}
        mb='md'
      >
        Wszystkie szablony
      </Button>
      {templates.isError ? (
        <Alert color='red' title='Nie udało się pobrać szablonu'>
          {apiErrorMessage(templates.error)}
        </Alert>
      ) : !isNew && templates.isPending ? (
        <Loader />
      ) : !isNew && template === null ? (
        <Alert color='gray' title='Nie ma takiego szablonu'>
          Mógł zostać usunięty. Wróć do listy szablonów.
        </Alert>
      ) : (
        <TemplateEditor template={template} />
      )}
    </>
  );
}

function TemplateEditor({ template }: { template: DiscountTemplate | null }) {
  const navigate = useNavigate();
  const save = useSaveDiscountTemplate();
  const options = useProductOptions();
  const [draft, setDraft] = useState<Draft>(() => fromTemplate(template));
  const [saved, setSaved] = useState(() => key(fromTemplate(template)));
  const [nameError, setNameError] = useState<string | null>(null);
  const dirty = key(draft) !== saved;
  /** Set before a navigation the page itself starts (after a create); cleared once it landed. */
  const allowLeave = useRef(false);
  const { pathname } = useLocation();
  useEffect(() => {
    allowLeave.current = false;
  }, [pathname]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allowLeave.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  // Closing the tab / reloading: the browser's own prompt.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const categories = useMemo(() => {
    const all = new Set(options.data?.categories ?? []);
    for (const c of Object.keys(draft.categories)) all.add(c);
    return [...all].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [options.data, draft.categories]);
  const rules = toRules(draft);
  const productCount = rules.filter((r) => r.type === 'product').length;
  const categoryCount = rules.length - productCount;

  const setCategory = (c: string, p: Pct) =>
    setDraft((d) => ({ ...d, categories: { ...d.categories, [c]: p } }));
  const setProducts = (skus: string[], p: Pct) =>
    setDraft((d) => {
      const products = { ...d.products };
      for (const sku of skus) products[sku] = p;
      return { ...d, products };
    });

  /** Saves; resolves true on success. */
  function submit(): Promise<boolean> {
    const parsed = discountTemplateInputSchema.safeParse({
      name: draft.name,
      rules,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'name') setNameError(issue.message);
      notifications.show({
        color: 'red',
        title: 'Nie zapisano szablonu',
        message:
          issue?.path[0] === 'name'
            ? issue.message
            : 'Rabat: od 0 do 100%, co 0,5 punktu procentowego.',
      });
      return Promise.resolve(false);
    }
    setNameError(null);
    return new Promise((resolve) =>
      save.mutate(
        { id: template?.id ?? null, body: parsed.data },
        {
          onSuccess: (result) => {
            setSaved(key(draft));
            notifications.show({
              color: 'green',
              message:
                template === null
                  ? `Utworzono szablon: ${result.name}`
                  : `Zapisano szablon: ${result.name}${result.customersCount > 0 ? ` (ceny ${result.customersCount} klient(ów) zaktualizowane)` : ''}`,
            });
            if (template === null && blocker.state !== 'blocked') {
              allowLeave.current = true;
              navigate(`/admin/rabaty/${result.id}`, { replace: true });
            }
            resolve(true);
          },
          onError: (err) => {
            notifications.show({
              color: 'red',
              title: 'Nie zapisano szablonu',
              message: discountErrorMessage(err),
              autoClose: 8000,
            });
            resolve(false);
          },
        },
      ),
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextInput
        label='Nazwa szablonu'
        placeholder='np. Warsztaty — wtryskiwacze'
        value={draft.name}
        onChange={(e) => {
          const name = e.currentTarget.value;
          setDraft((d) => ({ ...d, name }));
        }}
        error={nameError}
        maxLength={80}
        maw={480}
        mb='lg'
      />

      <Text fw={700} mb='xs'>
        Rabat na kategorię
      </Text>
      <div className={classes.tableBox}>
        <Table verticalSpacing='xs'>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kategoria</Table.Th>
              <Table.Th>Rabat %</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {categories.map((c) => (
              <Table.Tr key={c}>
                <Table.Td>{c}</Table.Td>
                <Table.Td>
                  <PercentInput
                    label={`Rabat (%) na kategorię: ${c}`}
                    value={draft.categories[c] ?? ''}
                    onChange={(p) => setCategory(c, p)}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>

      <Text fw={700} mt='xl' mb='xs'>
        Rabat na produkt
      </Text>
      <ProductRules
        draft={draft}
        onChange={setProducts}
        categoryPct={draft.categories}
      />

      <div
        className={classes.saveBar}
        role='region'
        aria-label='Zapis szablonu'
      >
        <Text size='sm'>
          {dirty ? (
            <Badge color='orange' variant='light' mr='xs'>
              Niezapisane zmiany
            </Badge>
          ) : (
            <Badge color='green' variant='light' mr='xs'>
              Zapisano
            </Badge>
          )}
          Kategorie: {categoryCount} · Produkty: {productCount}
        </Text>
        <Group gap='sm'>
          <Button variant='default' onClick={() => navigate('/admin/rabaty')}>
            Wróć
          </Button>
          <Button
            type='submit'
            color='cdmInk'
            leftSection={<Save size={16} aria-hidden />}
            loading={save.isPending}
          >
            {template === null ? 'Utwórz szablon' : 'Zapisz'}
          </Button>
        </Group>
      </div>

      <Modal
        opened={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title='Zapisać zmiany w szablonie?'
      >
        <Text size='sm'>
          Szablon ma niezapisane zmiany. Jeśli wyjdziesz bez zapisu, zostaną
          utracone.
        </Text>
        <Group justify='flex-end' mt='lg' gap='sm'>
          <Button variant='default' onClick={() => blocker.reset?.()}>
            Zostań
          </Button>
          <Button
            variant='subtle'
            color='red'
            onClick={() => blocker.proceed?.()}
          >
            Wyjdź bez zapisu
          </Button>
          <Button
            color='cdmInk'
            loading={save.isPending}
            onClick={async () => {
              if (await submit()) blocker.proceed?.();
              else blocker.reset?.();
            }}
          >
            Zapisz i wyjdź
          </Button>
        </Group>
      </Modal>
    </form>
  );
}

function PercentInput({
  label,
  value,
  onChange,
  placeholder = '—',
}: {
  label: string;
  value: Pct;
  onChange: (p: Pct) => void;
  placeholder?: string;
}) {
  return (
    <NumberInput
      aria-label={label}
      value={value}
      onChange={(v) => onChange(asPct(v))}
      min={0}
      max={100}
      step={DISCOUNT_STEP}
      decimalScale={1}
      decimalSeparator=','
      suffix=' %'
      clampBehavior='strict'
      allowNegative={false}
      placeholder={placeholder}
      w={110}
      size='sm'
    />
  );
}

function grossOf(p: AdminProduct): number | null {
  return p.priceOnRequest ? null : p.priceGross;
}

// Every product (search + category filter, 50 per page) with its % field and the price
// after the szablon's rabat. "Ustaw dla wszystkich" writes one % into every filtered product.
function ProductRules({
  draft,
  onChange,
  categoryPct,
}: {
  draft: Draft;
  onChange: (skus: string[], p: Pct) => void;
  categoryPct: Record<string, Pct>;
}) {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [bulkPct, setBulkPct] = useState<Pct>('');
  const products = useAdminProducts(q, category, page);
  const options = useProductOptions();
  const allSkus = useProductSkus();
  const categories = options.data?.categories ?? [];
  const data = products.data;
  const total = data?.total ?? 0;
  const pages = data
    ? Math.max(1, Math.ceil(data.total / ADMIN_PRODUCTS_PAGE_SIZE))
    : 1;
  const filtered = q !== '' || category !== '';

  function applyToFiltered(p: Pct) {
    allSkus.mutate(
      { q, category },
      {
        onSuccess: (skus) => onChange(skus, p),
        onError: (err) =>
          notifications.show({ color: 'red', message: apiErrorMessage(err) }),
      },
    );
  }

  return (
    <>
      <div className={classes.toolbar}>
        <TextInput
          label='Szukaj produktu'
          placeholder='SKU, numer OE lub nazwa'
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        {categories.length > 1 ? (
          <div>
            <Text size='sm' fw={500} mb={4}>
              Kategoria
            </Text>
            <SegmentedControl
              aria-label='Filtruj produkty po kategorii'
              color='cdmInk'
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              data={[
                { value: '', label: 'Wszystkie' },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
        ) : null}
      </div>
      <div
        className={classes.bulkBar}
        role='region'
        aria-label='Rabat dla wielu produktów'
      >
        <Text size='sm' fw={600}>
          Jeden rabat dla wszystkich z listy:
        </Text>
        <Group gap='xs' wrap='wrap'>
          <PercentInput
            label='Rabat (%) dla wszystkich z listy'
            value={bulkPct}
            onChange={setBulkPct}
            placeholder='%'
          />
          <Button
            variant='default'
            disabled={bulkPct === '' || total === 0}
            loading={allSkus.isPending}
            onClick={() => applyToFiltered(bulkPct)}
          >
            {filtered
              ? `Ustaw dla ${total} z filtra`
              : `Ustaw dla wszystkich (${total})`}
          </Button>
          <Button
            variant='default'
            disabled={total === 0}
            onClick={() => applyToFiltered('')}
          >
            Wyczyść
          </Button>
        </Group>
      </div>

      {products.isError ? (
        <Alert color='red' title='Nie udało się pobrać produktów'>
          {apiErrorMessage(products.error)}
        </Alert>
      ) : products.isPending ? (
        <Loader />
      ) : !data || data.items.length === 0 ? (
        <Text className={classes.muted}>
          Brak produktów pasujących do wyszukiwania lub filtra.
        </Text>
      ) : (
        <>
          <div className={classes.tableBox}>
            <Table striped highlightOnHover verticalSpacing='xs'>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Zdjęcie</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Nazwa</Table.Th>
                  <Table.Th>Kategoria</Table.Th>
                  <Table.Th>Cena brutto</Table.Th>
                  <Table.Th>Rabat %</Table.Th>
                  <Table.Th>Po rabacie</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((p) => {
                  const own = draft.products[p.sku] ?? '';
                  const fromCategory =
                    p.category !== null ? (categoryPct[p.category] ?? '') : '';
                  const effective = own !== '' ? own : fromCategory;
                  const gross = grossOf(p);
                  return (
                    <Table.Tr key={p.sku}>
                      <Table.Td>
                        <ProductThumb src={p.imageUrl} alt={p.name} />
                      </Table.Td>
                      <Table.Td className={`cdm-mono ${classes.nowrap}`}>
                        {p.sku}
                      </Table.Td>
                      <Table.Td className={classes.nameCell}>
                        {p.name}
                        {!p.active ? (
                          <Badge color='gray' variant='light' ml='xs'>
                            Ukryty
                          </Badge>
                        ) : null}
                      </Table.Td>
                      <Table.Td>{p.category ?? '—'}</Table.Td>
                      <Table.Td className={classes.nowrap}>
                        {gross === null ? 'Na zapytanie' : formatPLN(gross)}
                      </Table.Td>
                      <Table.Td>
                        <PercentInput
                          label={`Rabat (%): ${p.sku}`}
                          value={own}
                          onChange={(v) => onChange([p.sku], v)}
                          placeholder={
                            fromCategory !== ''
                              ? `${formatPercent(fromCategory)} kat.`
                              : '—'
                          }
                        />
                      </Table.Td>
                      <Table.Td className={classes.nowrap}>
                        {gross === null || effective === '' ? (
                          <Text size='xs' className={classes.muted}>
                            {effective === '' ? 'rabat ogólny' : '—'}
                          </Text>
                        ) : (
                          <>
                            {formatPLN(
                              Math.round(gross * (1 - effective / 100)),
                            )}
                            <Text size='xs' className={classes.muted}>
                              −{formatPercent(effective)}
                              {own === '' ? ' (kategoria)' : ''}
                            </Text>
                          </>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
          {pages > 1 ? (
            <Pagination
              mt='md'
              total={pages}
              value={page}
              onChange={setPage}
              color='cdmInk'
            />
          ) : null}
        </>
      )}
    </>
  );
}
