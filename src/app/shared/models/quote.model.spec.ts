import { QUOTE_LIMITS, QUOTE_STATUS_LABELS, QuoteStatus, VAT_RATES, canDecideQuote, canEditQuote, canSendQuote, formatQuoteNumber, isQuoteExpired, quoteStatusSeverity } from './quote.model';

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
});
