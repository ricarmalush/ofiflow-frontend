// La validación del NIF, NIE y CIF y del código postal español en pantalla (spec 024 R3, R4). Es una AYUDA al teclear: avisa antes de enviar, pero la que manda es la API
// (SpanishTaxId y SpanishPostalCode del backend), que vuelve a validar y es la que decide. Por eso es una copia fiel del algoritmo y se prueba contra LOS MISMOS casos fijos
// (tax-id-vectors.ts, copia de TaxIdVectors.json del backend).

const CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_LETTER_CONTROLS = 'JABCDEFGHI';
const CIF_LETTER_ONLY_ENTITIES = 'PQRSNW';
const CIF_DIGIT_ONLY_ENTITIES = 'ABEH';
const CIF_ENTITIES = 'ABCDEFGHJNPQRSUVW';

// Lo que ocupa un identificador normalizado, y lo más largo que se acepta antes de normalizar. Los mismos números que SpanishTaxId.
export const TAX_ID_LENGTH = 9;
export const TAX_ID_INPUT_MAX_LENGTH = 20;

// Los espacios en blanco de char.IsWhiteSpace de .NET, escritos uno a uno: el \s de JavaScript difiere (incluye U+FEFF y no incluye U+0085) y un carácter así no debe
// dar un veredicto distinto en la pantalla y en la API.
const WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

/** Mayúsculas y sin espacios, guiones ni puntos: `12.345.678-z` con espacios de más es `12345678Z`. No valida nada. Solo las letras ASCII se pasan a mayúscula. */
export function normalizeTaxId(value: string): string {
    let result = '';
    for (const c of value) {
        if (WHITESPACE.test(c) || c === '-' || c === '.') {
            continue;
        }
        result += c >= 'a' && c <= 'z' ? String.fromCharCode(c.charCodeAt(0) - 32) : c;
    }
    return result;
}

/** ¿Es un NIF, NIE o CIF español de verdad, con su dígito o letra de control correcto? */
export function isValidSpanishTaxId(value: string | null | undefined): boolean {
    return value != null && value.length <= TAX_ID_INPUT_MAX_LENGTH && hasValidControl(normalizeTaxId(value));
}

function isAsciiDigit(c: string): boolean {
    return c >= '0' && c <= '9';
}

function allAsciiDigits(text: string): boolean {
    return text.length > 0 && Array.from(text).every(isAsciiDigit);
}

function hasValidControl(id: string): boolean {
    if (id.length !== TAX_ID_LENGTH) {
        return false;
    }
    const first = id[0];
    if (isAsciiDigit(first)) {
        return isNif(id);
    }
    if (first === 'X' || first === 'Y' || first === 'Z') {
        return isNie(id);
    }
    return CIF_ENTITIES.includes(first) && isCif(id);
}

function controlLetterFor(n: number): string {
    return CONTROL_LETTERS[n % 23];
}

function isNif(id: string): boolean {
    const digits = id.substring(0, 8);
    return allAsciiDigits(digits) && id[8] === controlLetterFor(Number(digits));
}

function isNie(id: string): boolean {
    const digits = id.substring(1, 8);
    if (!allAsciiDigits(digits)) {
        return false;
    }
    // X → 0, Y → 1, Z → 2 delante de las siete cifras, y se calcula como un NIF de ocho cifras.
    const prefix = id.charCodeAt(0) - 'X'.charCodeAt(0);
    return id[8] === controlLetterFor(prefix * 10_000_000 + Number(digits));
}

function isCif(id: string): boolean {
    const digits = id.substring(1, 8);
    if (!allAsciiDigits(digits)) {
        return false;
    }
    // Posiciones impares (1.ª, 3.ª, 5.ª, 7.ª): se duplica y se suman las cifras del resultado. Pares: se suman tal cual.
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        const digit = Number(digits[i]);
        if (i % 2 === 0) {
            const doubled = digit * 2;
            sum += Math.floor(doubled / 10) + (doubled % 10);
        } else {
            sum += digit;
        }
    }
    const controlDigit = (10 - (sum % 10)) % 10;
    const control = id[8];
    const digitMatches = control === String(controlDigit);
    const letterMatches = control === CIF_LETTER_CONTROLS[controlDigit];

    if (CIF_LETTER_ONLY_ENTITIES.includes(id[0])) {
        return letterMatches;
    }
    if (CIF_DIGIT_ONLY_ENTITIES.includes(id[0])) {
        return digitMatches;
    }
    return digitMatches || letterMatches;
}

/** Cinco cifras ASCII cuyas dos primeras son una provincia que existe (01 a 52). Los espacios de los extremos no cuentan. */
export function isValidSpanishPostalCode(value: string | null | undefined): boolean {
    if (value == null) {
        return false;
    }
    let code = value;
    while (code.length > 0 && WHITESPACE.test(code[0])) code = code.substring(1);
    while (code.length > 0 && WHITESPACE.test(code[code.length - 1])) code = code.substring(0, code.length - 1);
    if (code.length !== 5 || !allAsciiDigits(code)) {
        return false;
    }
    const province = Number(code.substring(0, 2));
    return province >= 1 && province <= 52;
}
