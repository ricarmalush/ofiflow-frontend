import { formatDateTime, formatTime, localInputToUtcIso, utcIsoToLocalInput } from './local-datetime.util';

// Estos tests no dependen del huso de la máquina: construyen las fechas con los componentes locales (año, mes, día, hora) y comprueban que lo
// que sale es el mismo instante en UTC con la «Z», y que al volver a leerlo se recupera la hora de pared.
describe('local-datetime util', () => {
    describe('localInputToUtcIso (the wall-clock time the person types -> the UTC instant the API wants)', () => {
        it('returns an ISO instant with the Z for the same moment', () => {
            const iso = localInputToUtcIso('2026-11-10T09:00');

            expect(iso).toMatch(/^2026-11-1\dT\d{2}:\d{2}:00\.000Z$/);
            expect(iso).toBe(new Date(2026, 10, 10, 9, 0).toISOString());
        });

        it('keeps every component of the typed local time when the instant is read back', () => {
            const read = new Date(localInputToUtcIso('2026-11-10T09:45')!);

            expect([read.getFullYear(), read.getMonth(), read.getDate(), read.getHours(), read.getMinutes()]).toEqual([2026, 10, 10, 9, 45]);
        });

        it('accepts the seconds some browsers add', () => {
            expect(localInputToUtcIso('2026-11-10T09:00:30')).toBe(new Date(2026, 10, 10, 9, 0, 30).toISOString());
        });

        it('ignores spaces around the value', () => {
            expect(localInputToUtcIso(' 2026-11-10T09:00 ')).toBe(localInputToUtcIso('2026-11-10T09:00'));
        });

        it('midnight is midnight of the LOCAL day, not of UTC', () => {
            const read = new Date(localInputToUtcIso('2026-11-10T00:00')!);

            expect([read.getDate(), read.getHours(), read.getMinutes()]).toEqual([10, 0, 0]);
        });

        for (const value of [
            '',
            '   ',
            null,
            undefined,
            'mañana',
            '2026-11-10', // solo fecha
            '2026-11-10 09:00', // espacio en vez de T
            '2026-11-10T09:00Z', // ya lleva zona: no es lo que da un datetime-local
            '2026-11-10T09:00+01:00',
            '2026-02-31T10:00', // el 31 de febrero no existe
            '2026-13-01T10:00', // mes 13
            '2026-11-10T25:00', // hora 25
            '2026-11-10T09:60' // minuto 60
        ]) {
            it(`refuses ${JSON.stringify(value)} instead of sending something that is not a date`, () => {
                expect(localInputToUtcIso(value)).toBeNull();
            });
        }
    });

    describe('utcIsoToLocalInput (the instant from the API -> what the input shows)', () => {
        it('shows the wall-clock time of the browser, without seconds or zone', () => {
            const iso = new Date(2026, 10, 10, 9, 5).toISOString();

            expect(utcIsoToLocalInput(iso)).toBe('2026-11-10T09:05');
        });

        it('is the inverse of localInputToUtcIso', () => {
            for (const value of ['2026-01-05T00:00', '2026-06-15T12:30', '2026-12-31T23:59']) {
                expect(utcIsoToLocalInput(localInputToUtcIso(value))).toBe(value);
            }
        });

        it('a late local hour stays on its own local day even if UTC is already the next day', () => {
            const iso = new Date(2026, 10, 10, 23, 30).toISOString();

            expect(utcIsoToLocalInput(iso).startsWith('2026-11-10T23:30')).toBeTrue();
        });

        it('is empty for no date or an unreadable one', () => {
            expect(utcIsoToLocalInput(null)).toBe('');
            expect(utcIsoToLocalInput(undefined)).toBe('');
            expect(utcIsoToLocalInput('')).toBe('');
            expect(utcIsoToLocalInput('no es una fecha')).toBe('');
        });
    });

    describe('formatDateTime and formatTime (what is shown)', () => {
        const iso = new Date(2026, 10, 3, 9, 5).toISOString();

        it('formatDateTime is day/month/year and 24-hour time, zero padded, in the browser time', () => {
            expect(formatDateTime(iso)).toBe('03/11/2026 09:05');
        });

        it('formatTime is only the 24-hour time', () => {
            expect(formatTime(iso)).toBe('09:05');
            expect(formatTime(new Date(2026, 10, 3, 18, 30).toISOString())).toBe('18:30');
        });

        it('midnight is 00:00, not 24:00', () => {
            expect(formatTime(new Date(2026, 10, 3, 0, 0).toISOString())).toBe('00:00');
        });

        it('no date shows a dash (or nothing for the time) and never "Invalid Date"', () => {
            expect(formatDateTime(null)).toBe('—');
            expect(formatDateTime(undefined)).toBe('—');
            expect(formatDateTime('no es una fecha')).toBe('—');
            expect(formatTime(null)).toBe('');
            expect(formatTime('no es una fecha')).toBe('');
        });
    });
});
