import { QUOTE_LIMITS, QUOTE_STATUS_LABELS, QuoteStatus, VAT_RATES, canDecideQuote, canEditQuote, canSendQuote, formatQuoteNumber, isQuoteExpired, isValidQuoteRecipient, quoteStatusSeverity } from './quote.model';

describe('quote model', () => {
    const statuses: QuoteStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected'];

    it('only a draft is edited and sent, and only a sent quote is decided', () => {
        expect(statuses.filter(canEditQuote)).toEqual(['Draft']);
        expect(statuses.filter(canSendQuote)).toEqual(['Draft']);
        expect(statuses.filter(canDecideQuote)).toEqual(['Sent']);
    });

    it('has a label and a severity for every status, all different severities except none', () => {
        expect(Object.keys(QUOTE_STATUS_LABELS)).toEqual(statuses);
        expect(statuses.map(quoteStatusSeverity)).toEqual(['secondary', 'info', 'success', 'danger']);
    });

    it('offers exactly the VAT rates the API admits and the limits of the API', () => {
        expect([...VAT_RATES]).toEqual([0, 4, 10, 21]);
        expect(QUOTE_LIMITS).toEqual({ titleMaxLength: 200, notesMaxLength: 2000, descriptionMaxLength: 500, maxItems: 100, quantityMax: 99999.999, quantityDecimals: 3, unitPriceCentsMax: 9_999_999_999 });
    });

    it('formats the number with four digits', () => {
        expect(formatQuoteNumber(1)).toBe('P-0001');
        expect(formatQuoteNumber(12)).toBe('P-0012');
        expect(formatQuoteNumber(12345)).toBe('P-12345');
    });

    describe('isQuoteExpired', () => {
        const today = new Date(2026, 10, 9, 23, 59);

        it('is informative: a draft or a sent quote whose validity is before today', () => {
            expect(isQuoteExpired('2026-11-08', 'Draft', today)).toBeTrue();
            expect(isQuoteExpired('2026-11-08', 'Sent', today)).toBeTrue();
        });

        it('today and later are not expired, and no validity never expires', () => {
            expect(isQuoteExpired('2026-11-09', 'Sent', today)).toBeFalse();
            expect(isQuoteExpired('2026-11-10', 'Draft', today)).toBeFalse();
            expect(isQuoteExpired(null, 'Sent', today)).toBeFalse();
        });

        it('a resolved quote does not expire', () => {
            expect(isQuoteExpired('2020-01-01', 'Accepted', today)).toBeFalse();
            expect(isQuoteExpired('2020-01-01', 'Rejected', today)).toBeFalse();
        });

        it('compares calendar dates, not instants: the time of day does not matter', () => {
            expect(isQuoteExpired('2026-11-09', 'Draft', new Date(2026, 10, 9, 0, 0))).toBeFalse();
            expect(isQuoteExpired('2026-11-09', 'Draft', new Date(2026, 10, 10, 0, 0))).toBeTrue();
        });
    });

    describe('isValidQuoteRecipient (spec 026 R5: one address, nothing that separates or wraps addresses)', () => {
        it('accepts a plain address, with the surrounding spaces ignored', () => {
            for (const value of ['cliente@ejemplo.es', 'Ana.Perez+presupuestos@sub.ejemplo.co.uk', 'a@b.co', '  cliente@ejemplo.es  ', 'ñandú@ejemplo.es']) {
                expect(isValidQuoteRecipient(value)).withContext(value).toBeTrue();
            }
        });

        it('refuses what is not exactly one plain address', () => {
            const refused = [
                '',
                '   ',
                'sin-arroba.es',
                'sin@punto',
                'a@@b.es',
                'a b@ejemplo.es',
                'uno@ejemplo.es, dos@ejemplo.es',
                'uno@ejemplo.es,dos@ejemplo.es',
                'uno@ejemplo.es;dos@ejemplo.es',
                'uno,dos@ejemplo.es',
                'Ana <ana@ejemplo.es>',
                '<ana@ejemplo.es>',
                '"ana"@ejemplo.es',
                // Un solo carácter prohibido cada vez, con una dirección que sin él sería válida: cada uno falla por sí solo.
                'ana;@ejemplo.es',
                'ana<@ejemplo.es',
                'ana>@ejemplo.es',
                'ana(@ejemplo.es',
                'ana)@ejemplo.es',
                'ana[@ejemplo.es',
                'ana]@ejemplo.es',
                'ana,@ejemplo.es',
                'ana"@ejemplo.es',
                'ana(comentario)@ejemplo.es',
                'ana@[127.0.0.1].es',
                'ana\\@ejemplo.es',
                'ana@ejemplo.es\r\nBcc: otro@ejemplo.es',
                'ana\u0000@ejemplo.es',
                'ana\u0007@ejemplo.es',
                'ana\u007f@ejemplo.es',
                'ana\u0085@ejemplo.es'
            ];
            for (const value of refused) {
                expect(isValidQuoteRecipient(value)).withContext(JSON.stringify(value)).toBeFalse();
            }
        });

        it('accepts 254 characters and refuses 255', () => {
            const tail = '@ejemplo.es';

            expect(isValidQuoteRecipient('a'.repeat(254 - tail.length) + tail)).toBeTrue();
            expect(isValidQuoteRecipient('a'.repeat(255 - tail.length) + tail)).toBeFalse();
            // Los espacios de los extremos no cuentan para el límite.
            expect(isValidQuoteRecipient('  ' + 'a'.repeat(254 - tail.length) + tail + '  ')).toBeTrue();
        });
    });
});
