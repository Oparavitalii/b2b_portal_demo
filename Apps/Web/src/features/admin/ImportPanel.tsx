import type { ImportResult } from '@catalog/shared/schemas/admin';
import {
  Alert,
  Button,
  FileInput,
  Group,
  List,
  Text,
  Title,
} from '@mantine/core';
import { FileJson, Upload } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage, parseApiError } from '@/lib/http';

import classes from './Admin.module.css';
import { useImportProducts } from './api';

const MAX_BYTES = 20 * 1024 * 1024;

function importErrorMessage(err: unknown): string {
  const info = parseApiError(err);
  if (info.code === 'invalid_import_file')
    return 'Plik nie jest poprawnym Products_Data.json (brak listy „produkty”).';
  if (info.code === 'payload_too_large' || info.status === 413)
    return 'Plik jest za duży (limit 20 MB).';
  return apiErrorMessage(err);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={classes.stat}>
      <div className={classes.statValue}>{value}</div>
      <Text size='sm' className={classes.muted}>
        {label}
      </Text>
    </div>
  );
}

// R-25 / R-16: upload Products_Data.json → upsert by SKU in one transaction.
export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const importer = useImportProducts();

  async function run() {
    if (!file) return;
    setLocalError(null);
    setResult(null);
    if (file.size > MAX_BYTES) {
      setLocalError('Plik jest za duży (limit 20 MB).');
      return;
    }
    const text = await file.text();
    try {
      JSON.parse(text);
    } catch {
      setLocalError('Wybrany plik nie zawiera poprawnych danych JSON.');
      return;
    }
    importer.mutate(text, {
      onSuccess: (res) => setResult(res),
      onError: (err) => setLocalError(importErrorMessage(err)),
    });
  }

  return (
    <section className={classes.importBox} aria-labelledby='import-title'>
      <Title order={2} size='h3' id='import-title'>
        Import produktów
      </Title>
      <Text size='sm' mt={4} mb='sm' className={classes.muted}>
        Wybierz plik Products_Data.json z projektu DEMO PARTS. Produkty są
        aktualizowane według SKU; pozycje z poprzedniego importu, których nie
        ma w pliku, zostaną ukryte w katalogu. Stan, czas wysyłki, zdjęcia
        dodane w panelu i produkty dodane ręcznie zostają bez zmian.
      </Text>
      <Group align='end' wrap='wrap'>
        <FileInput
          label='Plik JSON'
          placeholder='Products_Data.json'
          accept='.json,application/json'
          leftSection={<FileJson size={16} aria-hidden />}
          value={file}
          onChange={(f) => {
            setFile(f);
            setLocalError(null);
          }}
          clearable
          w={320}
          maw='100%'
        />
        <Button
          leftSection={<Upload size={16} aria-hidden />}
          disabled={!file}
          loading={importer.isPending}
          onClick={() => void run()}
        >
          Importuj
        </Button>
      </Group>

      {localError ? (
        <Alert color='red' mt='md' title='Import nie powiódł się'>
          {localError}
        </Alert>
      ) : null}

      {result ? (
        <>
          <div className={classes.stats} aria-live='polite'>
            <Stat label='Dodane' value={result.created} />
            <Stat label='Zaktualizowane' value={result.updated} />
            <Stat label='Ukryte (brak w pliku)' value={result.deactivated} />
            <Stat label='Pominięte' value={result.skipped.length} />
          </div>
          {result.skipped.length > 0 ? (
            <Alert color='yellow' mt='md' title='Pominięte rekordy'>
              <List size='sm'>
                {result.skipped.map((reason) => (
                  <List.Item key={reason}>{reason}</List.Item>
                ))}
              </List>
            </Alert>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
