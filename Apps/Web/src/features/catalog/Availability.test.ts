import { availability, stockDefaults } from '@catalog/shared/schemas/product';
import { describe, expect, it } from 'vitest';

// B-19: in stock → 24 h, production → 72 h; display only.
describe('availability', () => {
  it('in stock ships in 24 h', () => {
    expect(availability(10)).toEqual({
      inStock: true,
      label: 'W magazynie: 10 szt.',
      leadTimeHours: 24,
      leadTimeText: 'Wysyłka w 24 h',
    });
  });

  it('exactly the stock is still 24 h', () => {
    expect(availability(10, 10).leadTimeHours).toBe(24);
  });

  it('more than in stock ships from production in 72 h', () => {
    const a = availability(10, 12);
    expect(a.inStock).toBe(false);
    expect(a.label).toBe('W magazynie: 10 szt.');
    expect(a.leadTimeText).toBe('Wysyłka w 72 h');
  });

  it('zero or unknown stock is production, 72 h', () => {
    for (const stock of [0, null]) {
      const a = availability(stock);
      expect(a).toMatchObject({
        inStock: false,
        label: 'W produkcji',
        leadTimeHours: 72,
      });
    }
  });
});

// Pilot_Run 2026-10-10: the admin's delivery time wins over the automatic one.
describe('availability with the admin delivery time', () => {
  it('48 h set by the admin is shown even with stock', () => {
    expect(availability(4, 1, 48)).toMatchObject({
      inStock: true,
      leadTimeHours: 48,
      leadTimeText: 'Wysyłka w 48 h',
    });
  });

  it('more than in stock is production: at least 72 h even when the admin set 24', () => {
    expect(availability(4, 5, 24)).toMatchObject({
      leadTimeHours: 72,
      inStock: false,
    });
    expect(availability(0, 1, 48).leadTimeHours).toBe(48);
  });

  it('null keeps the automatic 24 / 72 h', () => {
    expect(stockDefaults('Wtryskiwacze')).toEqual({
      stock: 4,
      leadTimeHours: null,
    });
    for (const category of ['Pompy CR', 'Zbiorniki AdBlue']) {
      expect(stockDefaults(category)).toEqual({ stock: 1, leadTimeHours: 72 });
    }
    expect(availability(4, 1, null).leadTimeHours).toBe(24);
    expect(availability(4, 5, null).leadTimeHours).toBe(72);
  });
});
