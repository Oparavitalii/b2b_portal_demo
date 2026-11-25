import {
  type CustomerAdmin,
  customerDiscountsInputSchema,
  type CustomerDiscounts,
} from '@catalog/shared/schemas/admin';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Percent } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiErrorMessage } from '@/lib/http';
import { formatPercent } from '@/lib/format';

import classes from './Admin.module.css';
import {
  discountErrorMessage,
  useCustomerDiscounts,
  useDiscountTemplates,
  useSaveCustomerDiscounts,
} from './api';
import {
  DiscountRulesEditor,
  type RuleDraft,
  ruleErrors,
  ruleText,
  toDrafts,
  toRuleInput,
} from './DiscountRulesEditor';

// "Rabaty produktowe" cell of the customer list: linked szablon + own rule count, and the
// button that opens the editor (Pilot_Run 2026-10-16).
export function CustomerDiscountsCell({
  customer,
}: {
  customer: CustomerAdmin;
}) {
  const [open, setOpen] = useState(false);
  const label = customer.companyName ?? customer.email;
  return (
    <div className={classes.discountsCell}>
      <div>
        {customer.discountTemplateName ? (
          <Badge variant='light' color='cdmInk' radius='sm' tt='none'>
            {customer.discountTemplateName}
          </Badge>
        ) : null}
        {customer.customRulesCount > 0 ? (
          <Text size='xs'>Własne: {customer.customRulesCount}</Text>
        ) : null}
        {!customer.discountTemplateName && customer.customRulesCount === 0 ? (
          <Text size='xs' className={classes.muted}>
            Tylko rabat ogólny
          </Text>
        ) : null}
      </div>
      <Button
        size='xs'
        variant='light'
        color='cdmInk'
        leftSection={<Percent size={14} aria-hidden />}
        onClick={() => setOpen(true)}
        aria-label={`Rabaty produktowe klienta ${label}`}
      >
        Ustaw
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={`Rabaty produktowe: ${label}`}
        size='xl'
      >
        {open ? (
          <CustomerDiscountsLoader
            customerId={customer.id}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function CustomerDiscountsLoader({
  customerId,
  onDone,
}: {
  customerId: string;
  onDone: () => void;
}) {
  const current = useCustomerDiscounts(customerId);
  const templates = useDiscountTemplates();
  if (current.isError || templates.isError) {
    return (
      <Alert color='red' title='Nie udało się pobrać rabatów'>
        {apiErrorMessage(current.error ?? templates.error)}
      </Alert>
    );
  }
  if (!current.data || !templates.data) return <Loader />;
  return (
    <CustomerDiscountsForm
      customerId={customerId}
      initial={current.data}
      onDone={onDone}
    />
  );
}

function CustomerDiscountsForm({
  customerId,
  initial,
  onDone,
}: {
  customerId: string;
  initial: CustomerDiscounts;
  onDone: () => void;
}) {
  const templates = useDiscountTemplates().data ?? [];
  const save = useSaveCustomerDiscounts();
  const [templateId, setTemplateId] = useState<string | null>(
    initial.templateId,
  );
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    toDrafts(initial.rules),
  );
  const [submitted, setSubmitted] = useState(false);
  const template = templates.find((t) => t.id === templateId) ?? null;

  const parsed = customerDiscountsInputSchema.safeParse({
    templateId,
    rules: toRuleInput(rules),
  });
  const rowErrors =
    submitted && !parsed.success ? ruleErrors(parsed.error.issues) : {};

  function submit() {
    setSubmitted(true);
    if (!parsed.success) return;
    save.mutate(
      { id: customerId, body: parsed.data },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: 'Zapisano rabaty produktowe klienta',
          });
          onDone();
        },
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Nie zapisano rabatów',
            message: discountErrorMessage(err),
            autoClose: 8000,
          }),
      },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Text size='sm' mb='md'>
        Rabat ogólny klienta:{' '}
        <strong>{formatPercent(initial.discountPercent)}</strong> — dla
        produktów bez rabatu produktowego (zmienisz go w kolumnie „Rabat
        ogólny”).
      </Text>

      <Group align='flex-end' gap='sm' mb={6}>
        <Select
          label='Szablon rabatów'
          placeholder='Bez szablonu'
          data={templates.map((t) => ({ value: t.id, label: t.name }))}
          value={templateId}
          onChange={setTemplateId}
          clearable
          searchable
          nothingFoundMessage='Brak szablonów'
          w={320}
        />
        <Anchor component={Link} to='/admin/rabaty' size='sm' mb={8}>
          Utwórz lub edytuj szablony
        </Anchor>
      </Group>
      {template ? (
        <div className={classes.ruleChips}>
          {template.rules.length === 0 ? (
            <Text size='xs' className={classes.muted}>
              Szablon nie ma reguł.
            </Text>
          ) : (
            template.rules.map((r) => (
              <Badge
                key={`${r.type}:${r.target}`}
                variant='light'
                color='gray'
                radius='sm'
                tt='none'
              >
                {ruleText(r)}
              </Badge>
            ))
          )}
        </div>
      ) : null}

      <Text size='sm' fw={600} mt='lg' mb={4}>
        Własne rabaty klienta
      </Text>
      <Text size='xs' className={classes.muted} mb='sm'>
        Wygrywają z szablonem. Kolejność: własny rabat na produkt → własny na
        kategorię → szablon (produkt → kategoria) → rabat ogólny.
      </Text>
      <DiscountRulesEditor
        value={rules}
        onChange={setRules}
        errors={rowErrors}
      />

      <Group justify='flex-end' mt='lg'>
        <Button variant='default' onClick={onDone}>
          Anuluj
        </Button>
        <Button type='submit' color='cdmInk' loading={save.isPending}>
          Zapisz
        </Button>
      </Group>
    </form>
  );
}
