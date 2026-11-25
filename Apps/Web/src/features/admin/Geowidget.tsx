import { Alert, Loader, Modal, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

import classes from './Shipping.module.css';

// InPost Geowidget v5 (B-22: R-05) — the official locker map, loaded lazily
// the first time an admin opens it. The token comes from
// GET /api/admin/inpost/config (admins only, R-08). A picked point arrives as
// the document event named in `onpoint` with the point in `detail`.

const SCRIPT_URL = 'https://geowidget.inpost.pl/inpost-geowidget.js';
const STYLE_URL = 'https://geowidget.inpost.pl/inpost-geowidget.css';
const POINT_EVENT = 'catalogPoint';

let loading: Promise<void> | null = null;

/** Adds the Geowidget script + stylesheet once per page; a failed load can be retried. */
function loadGeowidget(): Promise<void> {
  if (customElements.get('inpost-geowidget')) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[href="${STYLE_URL}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = STYLE_URL;
      document.head.append(css);
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error('geowidget_load_failed'));
    };
    document.head.append(script);
  });
  return loading;
}

function pointName(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const name = (detail as { name?: unknown }).name;
  return typeof name === 'string' && name !== '' ? name : null;
}

function GeowidgetMap({
  token,
  onPick,
}: {
  token: string;
  onPick: (name: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let alive = true;
    const box = boxRef.current;
    const onPoint = (event: Event) => {
      const name = pointName((event as CustomEvent<unknown>).detail);
      if (name) pickRef.current(name);
    };
    document.addEventListener(POINT_EVENT, onPoint);

    // Created imperatively: React has no typings for this custom element.
    const widget = document.createElement('inpost-geowidget');
    widget.setAttribute('token', token);
    widget.setAttribute('language', 'pl');
    widget.setAttribute('config', 'parcelcollect');
    widget.setAttribute('onpoint', POINT_EVENT);
    widget.className = classes.geowidget ?? '';

    loadGeowidget()
      .then(() => {
        if (!alive || !box) return;
        box.append(widget);
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('error');
      });

    return () => {
      alive = false;
      document.removeEventListener(POINT_EVENT, onPoint);
      widget.remove();
    };
  }, [token]);

  return (
    <div className={classes.geowidgetBox}>
      {state === 'loading' ? (
        <div className={classes.geowidgetLoading}>
          <Loader size='sm' />
          <Text size='sm'>Ładowanie mapy InPost…</Text>
        </div>
      ) : null}
      {state === 'error' ? (
        <Alert color='red' variant='light' title='Mapa InPost niedostępna'>
          Nie udało się wczytać mapy. Wybierz Paczkomat z listy najbliższych
          albo wpisz jego kod.
        </Alert>
      ) : null}
      <div ref={boxRef} className={classes.geowidgetMount} />
    </div>
  );
}

/** Modal with the InPost map; closes after a point is picked. */
export function GeowidgetModal({
  opened,
  token,
  onClose,
  onPick,
}: {
  opened: boolean;
  token: string;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title='Wybierz Paczkomat na mapie'
      size='xl'
      centered
    >
      {opened ? (
        <GeowidgetMap
          token={token}
          onPick={(name) => {
            onPick(name);
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
