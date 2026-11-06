import { REGISTRATION_INVALID_CODE, TERMS_VERSION } from './legal';

describe('legal constants (spec 021)', () => {
    it('the terms version is a label the API accepts as Legal:TermsVersion (up to 20 characters: letters, digits, dot, dash and underscore)', () => {
        // Las mismas reglas que LegalOptions.Validate en la API: si esta etiqueta no las cumpliera, la API ni arrancaría con ella.
        expect(TERMS_VERSION.length).toBeGreaterThan(0);
        expect(TERMS_VERSION.length).toBeLessThanOrEqual(20);
        expect(TERMS_VERSION).toMatch(/^[A-Za-z0-9._-]+$/);
    });

    it('the stable code of a link that does not serve is the one of the API (IdentityErrors.RegistrationInvalid)', () => {
        expect(REGISTRATION_INVALID_CODE).toBe('registration.invalid');
    });
});
