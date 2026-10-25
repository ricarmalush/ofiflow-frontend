import { safeReturnUrl } from './return-url.util';

describe('safeReturnUrl', () => {
    it('keeps an internal route', () => {
        expect(safeReturnUrl('/jobs/42?tab=notes')).toBe('/jobs/42?tab=notes');
    });

    it('falls back to the home page when there is no returnUrl', () => {
        expect(safeReturnUrl(null)).toBe('/');
    });

    for (const attack of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'evil.com']) {
        it(`rejects ${attack} (open redirect)`, () => {
            expect(safeReturnUrl(attack)).toBe('/');
        });
    }
});
