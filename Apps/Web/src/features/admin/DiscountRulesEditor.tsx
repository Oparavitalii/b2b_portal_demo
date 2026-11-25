import {
  DISCOUNT_STEP,
  type DiscountRule,
  type DiscountRuleInput,
  type DiscountRuleType,
} from '@catalog/shared/schemas/admin';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  Text,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { FolderTree, Package, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ZodIssue } from 'zod';

import { formatPercent } from '@/lib/format';

import classes from './Admin.module.css';
import { useAdminProducts, useProductOptions } from './api';

/** One editable row; key is local only (React list key). */
export interface RuleDraft {
  key: string;
  type: DiscountRuleType;
  target: string;
  label: string | null;
  percent: number | string;
}

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `rule-${nextKey}`;
}

export function toDrafts(rules: DiscountRule[]): RuleDraft[] {
  return rules.map((r) => ({ ...r, key: newKey() }));
}

/** Body rules; an empty % becomes NaN so the schema reports it on that row. */
export function toRuleInput(drafts: RuleDraft[]): DiscountRuleInput[] {
  return drafts.map((d) => ({
    type: d.type,
    target: d.target,
    percent: typeof d.percent === 'number' ? d.percent : Number.NaN,
  }));
}

/** zod issues at ['rules', i, …] → {i: first message}. Other issues are left to the caller. */
export function ruleErrors(issues: ZodIssue[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const issue of issues) {
    const [root, index] = issue.path;
    if (root === 'rules' && typeof index === 'number' && !(index in out)) {
      out[index] =
        issue.path[2] === 'percent' && issue.code === 'invalid_type'
          ? 'Podaj rabat'
          : issue.message;
    }
  }
  return out;
}

export const TYPE_LABELS: Record<DiscountRuleType, string> = {
  category: 'Kategoria',
  product: 'Produkt',
};

/** 'Wtryskiwacze −20%' / '095000-5800 Wtryskiwacz… −25%' — read-only summary of a rule. */
export function ruleText(rule: DiscountRule): string {
  const target =
    rule.type === 'product' && rule.label
      ? `${rule.target} · ${rule.label}`
      : rule.target;
  return `${target}: −${formatPercent(rule.percent)}`;
}

interface DiscountRulesEditorProps {
  value: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
  /** Row index → message (from the zod issues of the form). */
  errors?: Record<number, string>;
}

// Rows of {Kategoria | Produkt, target, %}. A product rule beats a category rule.
export function DiscountRulesEditor({
  value,
  onChange,
  errors = {},
}: DiscountRulesEditorProps) {
  const options = useProductOptions();
  const categories = options.data?.categories ?? [];

  const update = (key: string, patch: Partial<RuleDraft>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (type: DiscountRuleType) =>
    onChange([
      ...value,
      { key: newKey(), type, target: '', label: null, percent: '' },
    ]);
  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  return (
    <div className={classes.rules}>
      {value.length === 0 ? (
        <Text size='sm' className={classes.muted}>
          Brak reguł. Dodaj kategorię albo produkt.
        </Text>
      ) : (
        value.map((rule, i) => (
          <div key={rule.key} className={classes.ruleRow}>
            <Select
              aria-label={`Reguła ${i + 1}: typ`}
              data={[
                { value: 'category', label: TYPE_LABELS.category },
                { value: 'product', label: TYPE_LABELS.product },
              ]}
              value={rule.type}
              allowDeselect={false}
              onChange={(v) =>
                v &&
                v !== rule.type &&
                update(rule.key, {
                  type: v as DiscountRuleType,
                  target: '',
                  label: null,
                })
              }
              w={130}
              size='sm'
            />
            <div className={classes.ruleTarget}>
              {rule.type === 'category' ? (
                <Select
                  aria-label={`Reguła ${i + 1}: kategoria`}
                  placeholder='Wybierz kategorię'
                  data={
                    rule.target && !categories.includes(rule.target)
                      ? [rule.target, ...categories]
                      : categories
                  }
                  value={rule.target || null}
                  onChange={(v) => update(rule.key, { target: v ?? '' })}
                  searchable
                  nothingFoundMessage='Brak kategorii'
                  error={errors[i]}
                  size='sm'
                />
              ) : (
                <ProductPicker
                  index={i}
                  sku={rule.target}
                  label={rule.label}
                  error={errors[i]}
                  onChange={(sku, label) =>
                    update(rule.key, { target: sku, label })
                  }
                />
              )}
            </div>
            <NumberInput
              aria-label={`Reguła ${i + 1}: rabat (%)`}
              value={rule.percent}
              onChange={(v) => update(rule.key, { percent: v })}
              min={0}
              max={100}
              step={DISCOUNT_STEP}
              decimalScale={1}
              decimalSeparator=','
              suffix=' %'
              clampBehavior='strict'
              allowNegative={false}
              placeholder='%'
              w={100}
              size='sm'
            />
            <ActionIcon
              variant='subtle'
              color='red'
              size='lg'
              onClick={() => remove(rule.key)}
              aria-label={`Usuń regułę ${i + 1}`}
            >
              <Trash2 size={16} aria-hidden />
            </ActionIcon>
          </div>
        ))
      )}
      <Group gap='xs'>
        <Button
          size='xs'
          variant='default'
          leftSection={<FolderTree size={14} aria-hidden />}
          onClick={() => add('category')}
        >
          Dodaj kategorię
        </Button>
        <Button
          size='xs'
          variant='default'
          leftSection={<Package size={14} aria-hidden />}
          onClick={() => add('product')}
        >
          Dodaj produkt
        </Button>
      </Group>
    </div>
  );
}

// Searchable SKU picker backed by the admin product search (SKU, name, OE numbers).
function ProductPicker({
  index,
  sku,
  label,
  error,
  onChange,
}: {
  index: number;
  sku: string;
  label: string | null;
  error?: string;
  onChange: (sku: string, label: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const products = useAdminProducts(q, '', 1);
  const items = products.data?.items ?? [];
  const optionLabel = (s: string, name: string | null) =>
    name ? `${s} · ${name}` : s;
  const data = items.map((p) => ({
    value: p.sku,
    label: optionLabel(p.sku, p.name),
  }));
  if (sku && !data.some((o) => o.value === sku)) {
    data.unshift({ value: sku, label: optionLabel(sku, label) });
  }

  return (
    <Select
      aria-label={`Reguła ${index + 1}: produkt`}
      placeholder='Szukaj: SKU, nazwa lub numer OE'
      data={data}
      value={sku || null}
      onChange={(v) => {
        const picked = items.find((p) => p.sku === v);
        onChange(v ?? '', picked?.name ?? (v === sku ? label : null));
      }}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      // The API already filtered by SKU / name / OE: show its results as they are.
      filter={({ options }) => options}
      nothingFoundMessage={products.isFetching ? 'Szukam…' : 'Brak produktów'}
      error={error}
      size='sm'
    />
  );
}
