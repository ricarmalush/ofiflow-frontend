import { addDays, dayKey, startOfWeek, weekDays, weekRange } from './week-range.util';

// Las semanas se construyen con los componentes locales (new Date(año, mes, día)), así que estos tests dan lo mismo en cualquier huso. Lo
// único que depende de la máquina es si hay cambio de hora: el test de la semana del cambio se salta (pending) si la zona no lo tiene.
describe('week-range util', () => {
    const monday = new Date(2026, 10, 9); // lunes 9 de noviembre de 2026

    describe('startOfWeek', () => {
        it('every day from Monday to Sunday belongs to the week that starts on that Monday, at local midnight', () => {
            for (let day = 9; day <= 15; day++) {
                const start = startOfWeek(new Date(2026, 10, day, 15, 30));

                expect(start.getTime()).withContext(`día ${day}`).toBe(monday.getTime());
            }
        });

        it('the Sunday night (23:59) is still the week that is ending, not the next one', () => {
            expect(startOfWeek(new Date(2026, 10, 15, 23, 59, 59)).getTime()).toBe(monday.getTime());
        });

        it('Monday at 00:00 is its own week start', () => {
            expect(startOfWeek(new Date(2026, 10, 9, 0, 0, 0)).getTime()).toBe(monday.getTime());
        });

        it('the next Monday starts a new week', () => {
            expect(startOfWeek(new Date(2026, 10, 16, 0, 0, 1)).getTime()).toBe(new Date(2026, 10, 16).getTime());
        });

        it('crosses the year: Thursday 1 January 2026 belongs to the week of Monday 29 December 2025', () => {
            expect(startOfWeek(new Date(2026, 0, 1)).getTime()).toBe(new Date(2025, 11, 29).getTime());
        });

        it('crosses the month: Sunday 1 March 2026 belongs to the week of Monday 23 February', () => {
            expect(startOfWeek(new Date(2026, 2, 1)).getTime()).toBe(new Date(2026, 1, 23).getTime());
        });
    });

    describe('addDays', () => {
        it('moves by calendar days and always lands on local midnight', () => {
            const later = addDays(new Date(2026, 10, 9, 18, 45), 3);

            expect([later.getDate(), later.getHours(), later.getMinutes()]).toEqual([12, 0, 0]);
        });

        it('goes back with a negative number and crosses the month', () => {
            expect(addDays(new Date(2026, 10, 2), -3).getTime()).toBe(new Date(2026, 9, 30).getTime());
        });
    });

    describe('weekDays', () => {
        it('are seven consecutive days from Monday to Sunday, each at local midnight', () => {
            const days = weekDays(monday);

            expect(days.length).toBe(7);
            expect(days.map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
            expect(days.map((day) => day.getDate())).toEqual([9, 10, 11, 12, 13, 14, 15]);
            expect(days.every((day) => day.getHours() === 0 && day.getMinutes() === 0)).toBeTrue();
        });
    });

    describe('weekRange', () => {
        it('goes from local midnight of Monday to local midnight of the next Monday, as UTC instants with the Z', () => {
            const { from, to } = weekRange(monday);

            expect(from).toBe(monday.toISOString());
            expect(to).toBe(new Date(2026, 10, 16).toISOString());
            expect(from.endsWith('Z')).toBeTrue();
            expect(to.endsWith('Z')).toBeTrue();
        });

        it('every week of the year starts and ends at local midnight (it is not a fixed 168 hours)', () => {
            let week = startOfWeek(new Date(2026, 0, 1));
            for (let i = 0; i < 53; i++) {
                const { from, to } = weekRange(week);
                const start = new Date(from);
                const end = new Date(to);

                expect([start.getHours(), start.getMinutes(), start.getSeconds()]).withContext(`inicio de la semana ${i}`).toEqual([0, 0, 0]);
                expect([end.getHours(), end.getMinutes(), end.getSeconds()]).withContext(`final de la semana ${i}`).toEqual([0, 0, 0]);
                expect(end.getTime()).withContext(`la semana ${i} termina el lunes siguiente`).toBe(addDays(week, 7).getTime());
                week = addDays(week, 7);
            }
        });

        it('the week when the clocks change lasts 167 or 169 hours, and still ends at midnight', () => {
            let week = startOfWeek(new Date(2026, 0, 1));
            const odd: number[] = [];
            for (let i = 0; i < 53; i++) {
                const { from, to } = weekRange(week);
                const hours = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
                if (hours !== 168) {
                    odd.push(hours);
                }
                week = addDays(week, 7);
            }

            if (odd.length === 0) {
                pending('La zona horaria de esta máquina no tiene cambio de hora: no hay semana que probar.');
            }
            expect(odd.every((hours) => hours === 167 || hours === 169)).toBeTrue();
            expect(odd.length).toBe(2); // primavera y otoño
        });
    });

    describe('dayKey', () => {
        it('is the LOCAL day as year-month-day, zero padded', () => {
            expect(dayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
            expect(dayKey(new Date(2026, 10, 10, 23, 30))).toBe('2026-11-10');
        });

        it('a job at 23:30 local stays on its own day even when UTC says it is already the next one', () => {
            const instant = new Date(new Date(2026, 10, 10, 23, 30).toISOString());

            expect(dayKey(instant)).toBe('2026-11-10');
        });
    });
});
