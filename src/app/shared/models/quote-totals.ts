import { VatBreakdownLine } from './quote.model';

// La VISTA PREVIA del total de un presupuesto mientras se edita (spec 023 D4, D13). Repite, con la MISMA regla, el cálculo del servidor (QuoteCalculator):
//   - neto de la línea = cantidad × precio, redondeado al céntimo ALEJÁNDOSE DE CERO;
//   - base de un tipo de IVA = suma de los netos de las líneas con ese tipo;
//   - IVA del tipo = base × tipo / 100, redondeado UNA vez por tipo (no por línea);
//   - neto = suma de las bases; IVA = suma de los IVA por tipo; total = neto + IVA.
// Con ARITMÉTICA ENTERA (BigInt): un número de coma flotante no reproduce el redondeo del servidor (0,1 + 0,2 ≠ 0,3). La cantidad se lleva en milésimas.
// Lo que manda SIEMPRE es lo que devuelve la API al guardar; los mismos casos fijos que el backend (quote-totals-vectors) comprueban que las dos reglas coinciden.

export interface TotalsLine {
    quantity: number;
    unitPriceCents: number;
    vatPercent: number;
}

export interface QuoteTotals {
    netCents: number;
    vatCents: number;
    totalCents: number;
    breakdown: VatBreakdownLine[];
}

// Cantidad en milésimas: hasta 3 decimales, así que `cantidad × 1000` es un entero (el redondeo solo corrige el error de coma flotante de, por ejemplo, 1,005 × 1000).
const toThousandths = (quantity: number) => BigInt(Math.round(quantity * 1000));

// Dividir y redondear alejándose de cero (los importes aquí nunca son negativos).
function divideRounded(numerator: bigint, denominator: bigint): bigint {
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function lineNetCents(quantity: number, unitPriceCents: number): number {
    return Number(divideRounded(toThousandths(quantity) * BigInt(unitPriceCents), 1000n));
}

export function computeQuoteTotals(lines: readonly TotalsLine[]): QuoteTotals {
    const bases = new Map<number, bigint>();
    for (const line of lines) {
        const net = divideRounded(toThousandths(line.quantity) * BigInt(line.unitPriceCents), 1000n);
        bases.set(line.vatPercent, (bases.get(line.vatPercent) ?? 0n) + net);
    }

    const breakdown = [...bases.entries()].sort(([a], [b]) => a - b).map(([vatPercent, base]) => ({ vatPercent, base, vat: divideRounded(base * BigInt(vatPercent), 100n) }));

    const net = breakdown.reduce((sum, row) => sum + row.base, 0n);
    const vat = breakdown.reduce((sum, row) => sum + row.vat, 0n);

    return {
        netCents: Number(net),
        vatCents: Number(vat),
        totalCents: Number(net + vat),
        breakdown: breakdown.map((row) => ({ vatPercent: row.vatPercent, baseCents: Number(row.base), vatCents: Number(row.vat) }))
    };
}

// Euros (lo que se teclea) <-> céntimos (lo que se guarda y se manda). Con dos decimales como máximo, `euros × 100` es un entero salvo el error de coma flotante.
export const eurosToCents = (euros: number) => Math.round(euros * 100);
export const centsToEuros = (cents: number) => cents / 100;

const euroFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const formatEuros = (cents: number) => euroFormat.format(centsToEuros(cents));
