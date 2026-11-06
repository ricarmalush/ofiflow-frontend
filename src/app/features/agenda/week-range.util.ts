// La semana de la agenda (spec 020 F2 y F3): de lunes a domingo, en el huso del navegador. Todo se calcula con los COMPONENTES de la fecha
// local (año, mes, día), nunca sumando 24 horas por día: la semana en que cambia la hora dura 167 o 169 horas, y sumar 168 dejaría el
// final de semana a las 23:00 o a las 01:00 en vez de a medianoche.

// Medianoche local del día n días después (o antes, si n es negativo). new Date(y, m, d + n) deja que JavaScript pase de mes y de año.
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// El lunes de la semana de «date», a las 00:00 locales. getDay(): 0 = domingo ... 6 = sábado; (getDay() + 6) % 7 cuenta desde el lunes.
export function startOfWeek(date: Date): Date {
    return addDays(date, -((date.getDay() + 6) % 7));
}

// Los siete días, de lunes a domingo, cada uno a las 00:00 locales.
export function weekDays(monday: Date): Date[] {
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

// El intervalo [from, to) que se pide a la API: de la medianoche local del lunes a la del lunes siguiente, como instantes UTC con la «Z».
export function weekRange(monday: Date): { from: string; to: string } {
    return { from: monday.toISOString(), to: addDays(monday, 7).toISOString() };
}

// «2026-11-10»: el día LOCAL de una fecha. Sirve para agrupar los trabajos por día sin que un trabajo de las 23:30 caiga en el día siguiente.
export function dayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
