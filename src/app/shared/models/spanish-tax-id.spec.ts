import { TAX_ID_VECTORS } from './tax-id-vectors';
import { isValidSpanishPostalCode, isValidSpanishTaxId, normalizeTaxId } from './spanish-tax-id';

// El NIF, NIE y CIF en pantalla contra LOS MISMOS casos fijos que el backend (spec 024 R3): identificadores reales y públicos y los calculados a mano. Si los dos lados dan lo
// mismo para cada caso, la pantalla nunca avisa de un error que la API aceptaría ni deja pasar uno que la API rechazaría.
describe('isValidSpanishTaxId · the fixed cases shared with the backend', () => {
    for (const vector of TAX_ID_VECTORS) {
        it(vector.name, () => {
            expect(isValidSpanishTaxId(vector.input)).toBe(vector.valid);
            if (vector.valid) {
                expect(normalizeTaxId(vector.input)).toBe(vector.normalized!);
            }
        });
    }

    it('the fixed cases are all there (a sentinel: an emptied table would pass in a vacuum)', () => {
        const names = TAX_ID_VECTORS.map((vector) => vector.name);

        expect(TAX_ID_VECTORS.length).toBeGreaterThanOrEqual(85);
        expect(TAX_ID_VECTORS.filter((v) => v.valid).length).toBeGreaterThanOrEqual(30);
        expect(TAX_ID_VECTORS.filter((v) => !v.valid).length).toBeGreaterThanOrEqual(40);
        expect(names.some((n) => n.startsWith('NIF'))).toBeTrue();
        expect(names.some((n) => n.startsWith('NIE'))).toBeTrue();
        expect(names.some((n) => n.startsWith('CIF'))).toBeTrue();
        expect(names.some((n) => n.includes('Telefónica'))).toBeTrue();
        expect(names.some((n) => n.includes('árabe'))).toBeTrue();
    });

    it('every valid case is also valid already normalized, and normalizing twice changes nothing', () => {
        for (const vector of TAX_ID_VECTORS.filter((v) => v.valid)) {
            expect(isValidSpanishTaxId(vector.normalized)).withContext(vector.name).toBeTrue();
            expect(normalizeTaxId(vector.normalized!)).withContext(vector.name).toBe(vector.normalized!);
            expect(vector.normalized!.length).withContext(vector.name).toBe(9);
        }
    });
});

describe('isValidSpanishTaxId', () => {
    it('accepts the letter of every remainder of a NIF (the 23 letters, none skipped)', () => {
        const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
        for (let remainder = 0; remainder < 23; remainder++) {
            const number = String(remainder).padStart(8, '0');
            expect(isValidSpanishTaxId(number + letters[remainder])).withContext(number).toBeTrue();
            expect(isValidSpanishTaxId(number + letters[(remainder + 1) % 23])).withContext(number + ' (next letter)').toBeFalse();
        }
    });

    it('is false for an absent value, an empty one and one that is only separators', () => {
        expect(isValidSpanishTaxId(null)).toBeFalse();
        expect(isValidSpanishTaxId(undefined)).toBeFalse();
        expect(isValidSpanishTaxId('')).toBeFalse();
        expect(isValidSpanishTaxId('  .- ')).toBeFalse();
    });

    it('rejects more than twenty characters before normalizing, even if it would normalize to a valid one', () => {
        expect(isValidSpanishTaxId('12345678Z' + ' '.repeat(11))).toBeTrue();
        expect(isValidSpanishTaxId('12345678Z' + ' '.repeat(12))).toBeFalse();
    });

    it('does not turn letters of other alphabets into ASCII ones (the long s and the dotless i)', () => {
        expect(isValidSpanishTaxId('ſ1234567D')).toBeFalse();
        expect(isValidSpanishTaxId('G1039281ı')).toBeFalse();
        expect(normalizeTaxId('ſı')).toBe('ſı');
    });

    it('does not accept K, L or M (minors and foreigners without NIE are not admitted yet)', () => {
        for (const first of ['K', 'L', 'M']) {
            expect(isValidSpanishTaxId(`${first}1234567A`)).withContext(first).toBeFalse();
        }
    });
});

describe('normalizeTaxId', () => {
    it('upper-cases ASCII letters and drops whitespace, hyphens and dots', () => {
        expect(normalizeTaxId('  x-1234567.l ')).toBe('X1234567L');
        expect(normalizeTaxId('12.345.678-z')).toBe('12345678Z');
    });

    it('treats as whitespace exactly what .NET does, not what the \s of JavaScript does', () => {
        // Se construyen con códigos, no con el carácter escrito: un espacio invisible en el fichero fuente es una trampa.
        // U+0085, U+00A0, U+2028 y U+3000 son espacio en .NET; U+FEFF no lo es (aunque el \s de JavaScript sí lo incluya).
        const between = (code: number) => '12345678' + String.fromCharCode(code) + 'Z';
        for (const code of [0x85, 0xa0, 0x1680, 0x2003, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]) {
            expect(normalizeTaxId(between(code))).withContext(code.toString(16)).toBe('12345678Z');
            expect(isValidSpanishTaxId(between(code))).withContext(code.toString(16)).toBeTrue();
        }
        expect(normalizeTaxId(between(0xfeff))).toBe(between(0xfeff));
        expect(isValidSpanishTaxId(between(0xfeff))).toBeFalse();
    });
});

describe('isValidSpanishPostalCode', () => {
    it('accepts five digits whose first two are a province from 01 to 52', () => {
        for (const code of ['01001', '28001', '08001', '41001', '52999']) {
            expect(isValidSpanishPostalCode(code)).withContext(code).toBeTrue();
        }
    });

    it('rejects the provinces that do not exist (00 and from 53 on)', () => {
        for (const code of ['00001', '53001', '60000', '99999']) {
            expect(isValidSpanishPostalCode(code)).withContext(code).toBeFalse();
        }
    });

    it('rejects the wrong length, letters and digits of other alphabets', () => {
        for (const code of ['', '2800', '280011', '2800A', 'ABCDE', '２８００１', '٢٨٠٠١', '28 001', '28-001']) {
            expect(isValidSpanishPostalCode(code)).withContext(code).toBeFalse();
        }
        expect(isValidSpanishPostalCode(null)).toBeFalse();
        expect(isValidSpanishPostalCode(undefined)).toBeFalse();
    });

    it('ignores the spaces at the ends (it is stored trimmed)', () => {
        expect(isValidSpanishPostalCode(' 28001 ')).toBeTrue();
        expect(isValidSpanishPostalCode('\t28001\n')).toBeTrue();
    });
});
