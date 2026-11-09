import { QUOTE_TOTALS_VECTORS } from './quote-totals-vectors';
import { centsToEuros, computeQuoteTotals, eurosToCents, formatEuros, lineNetCents } from './quote-totals';

// El cálculo de la vista previa contra LOS MISMOS casos fijos que el backend (spec 023 D4): si los dos lados dan lo mismo para cada caso, el total que se ve mientras se
// edita es el que devolverá la API.
describe('computeQuoteTotals · the fixed cases shared with the backend', () => {
    for (const vector of QUOTE_TOTALS_VECTORS) {
        it(vector.name, () => {
            const lines = vector.lines.flatMap((line) => Array.from({ length: line.repeat ?? 1 }, () => ({ quantity: line.quantity, unitPriceCents: line.unitPriceCents, vatPercent: line.vatPercent })));

            const totals = computeQuoteTotals(lines);

            expect(totals.netCents).toBe(vector.net);
            expect(totals.vatCents).toBe(vector.vat);
            expect(totals.totalCents).toBe(vector.total);
            expect(totals.breakdown).toEqual(vector.breakdown);
        });
    }

    it('the fixed cases are all there (a sentinel: an emptied table would pass in a vacuum)', () => {
        const names = QUOTE_TOTALS_VECTORS.map((vector) => vector.name);

        expect(names.length).toBeGreaterThanOrEqual(15);
        expect(names.some((n) => n.includes('UNA vez por tipo'))).toBeTrue();
        expect(names.some((n) => n.includes('alejándose de cero'))).toBeTrue();
        expect(names.some((n) => n.includes('cien líneas'))).toBeTrue();
        expect(names.some((n) => n.includes('mezcla de cuatro tipos'))).toBeTrue();
    });
});

describe('lineNetCents', () => {
    it('rounds the half cent away from zero, not to the even cent', () => {
        expect(lineNetCents(0.5, 1)).toBe(1);
        expect(lineNetCents(1.5, 1)).toBe(2);
        expect(lineNetCents(2.5, 1)).toBe(3);
        expect(lineNetCents(0.001, 500)).toBe(1);
        expect(lineNetCents(0.001, 499)).toBe(0);
    });

    it('is exact where floating point is not (1.005 × 1000 thousandths, 0.1 and 0.2)', () => {
        expect(lineNetCents(1.005, 1000)).toBe(1005);
        expect(lineNetCents(0.1, 3)).toBe(0);
        expect(lineNetCents(0.3, 1000)).toBe(300);
        expect(lineNetCents(1.1, 1000)).toBe(1100);
    });
});

describe('computeQuoteTotals', () => {
    it('rounds the VAT once per rate, not once per line', () => {
        const five = Array.from({ length: 5 }, () => ({ quantity: 1, unitPriceCents: 2, vatPercent: 21 }));

        expect(computeQuoteTotals(five).vatCents).toBe(2);
        expect(five.reduce((sum, line) => sum + Math.round((lineNetCents(line.quantity, line.unitPriceCents) * line.vatPercent) / 100), 0)).toBe(0);
    });

    it('orders the breakdown by rate whatever the order of the lines', () => {
        const totals = computeQuoteTotals([
            { quantity: 1, unitPriceCents: 100, vatPercent: 21 },
            { quantity: 1, unitPriceCents: 100, vatPercent: 0 },
            { quantity: 1, unitPriceCents: 100, vatPercent: 10 }
        ]);

        expect(totals.breakdown.map((row) => row.vatPercent)).toEqual([0, 10, 21]);
    });

    it('is the same for any order of the lines', () => {
        const lines = [
            { quantity: 2.5, unitPriceCents: 1234, vatPercent: 21 },
            { quantity: 0.001, unitPriceCents: 500, vatPercent: 10 },
            { quantity: 3, unitPriceCents: 2500, vatPercent: 4 }
        ];

        expect(computeQuoteTotals([...lines].reverse())).toEqual(computeQuoteTotals(lines));
    });

    it('no lines give zero everywhere', () => {
        expect(computeQuoteTotals([])).toEqual({ netCents: 0, vatCents: 0, totalCents: 0, breakdown: [] });
    });
});

describe('euros and cents', () => {
    it('converts what is typed (two decimals) into whole cents without floating-point dust', () => {
        expect(eurosToCents(12.34)).toBe(1234);
        expect(eurosToCents(0.1 + 0.2)).toBe(30);
        expect(eurosToCents(1.15)).toBe(115);
        expect(eurosToCents(19.99)).toBe(1999);
        expect(centsToEuros(1234)).toBe(12.34);
    });

    it('formats in euros with the Spanish format', () => {
        // es-ES no separa los miles de un número de cuatro cifras («1234,56 €») pero sí a partir de cinco («12.345,60 €»).
        expect(formatEuros(123456).replace(/\s/g, ' ')).toContain('1234,56');
        expect(formatEuros(1234560).replace(/\s/g, ' ')).toContain('12.345,60');
        expect(formatEuros(123456)).toContain('€');
        expect(formatEuros(0)).toContain('0,00');
    });
});
