import type { FacetValue } from '@catalog/shared/schemas/product';
import { Select, TextInput } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { Search } from 'lucide-react';
import { useState } from 'react';

import classes from './Catalog.module.css';
import type { CatalogFilters as Filters } from './useCatalogParams';

interface CatalogFiltersProps {
  filters: Filters;
  categories: FacetValue[];
  makes: FacetValue[];
  onChange: (patch: Partial<Filters>) => void;
}

function toOptions(facets: FacetValue[], selected: string) {
  const options = facets.map((f) => ({
    value: f.value,
    label: `${f.value} (${f.count})`,
  }));
  // Keep the chosen value visible even when the facet list no longer has it.
  if (selected && !facets.some((f) => f.value === selected)) {
    options.unshift({ value: selected, label: `${selected} (0)` });
  }
  return options;
}

// Filter bar in the shop.catalog-demo.example shop style (.cdm-bar): OE / SKU / name search
// (debounced 300 ms) + category + vehicle make selects fed by API facets.
export function CatalogFilters({
  filters,
  categories,
  makes,
  onChange,
}: CatalogFiltersProps) {
  const [search, setSearch] = useState(filters.q);
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  // URL changed from outside (back button, reset) → mirror it in the input.
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q);
    setSearch(filters.q);
  }
  const pushSearch = useDebouncedCallback((value: string) => {
    onChange({ q: value });
  }, 300);

  return (
    <section className={classes.bar} aria-label='Filtry katalogu'>
      <div className={classes.barGrid}>
        <TextInput
          className={classes.search}
          label='Szukaj'
          placeholder='Szukaj po numerze OE, SKU lub nazwie'
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setSearch(value);
            pushSearch(value);
          }}
          inputMode='search'
          type='search'
          maxLength={100}
        />
        <Select
          label='Kategoria'
          placeholder='Wszystkie kategorie'
          data={toOptions(categories, filters.category)}
          value={filters.category || null}
          onChange={(value) => onChange({ category: value ?? '' })}
          clearable
          searchable
          nothingFoundMessage='Brak kategorii'
        />
        <Select
          label='Marka pojazdu'
          placeholder='Wszystkie marki'
          data={toOptions(makes, filters.make)}
          value={filters.make || null}
          onChange={(value) => onChange({ make: value ?? '' })}
          clearable
          searchable
          nothingFoundMessage='Brak marek'
        />
      </div>
    </section>
  );
}
