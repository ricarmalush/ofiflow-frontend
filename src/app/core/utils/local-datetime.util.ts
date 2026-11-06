// Fechas de la programación (spec 020). La API guarda y devuelve instantes en UTC con la «Z» (2026-11-10T08:00:00Z); la persona escribe y
// lee la hora de su reloj. Todo el paso de una a otra está en este fichero, y se hace con los COMPONENTES de la fecha local, nunca
// sumando horas: así un día con cambio de hora sigue siendo un día.

const pad = (n: number) => String(n).padStart(2, '0');

// <input type="datetime-local"> da y recibe «YYYY-MM-DDTHH:mm» (a veces con segundos), sin zona: es la hora de pared del navegador.
const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// De la hora de pared que escribe la persona al instante UTC que espera la API. null si está vacío o no es una fecha real
// (31 de febrero, mes 13...): el navegador la rechazaría de todos modos, pero no se envía nada que no sea una fecha.
export function localInputToUtcIso(value: string | null | undefined): string | null {
    const match = LOCAL_INPUT.exec((value ?? '').trim());
    if (!match) {
        return null;
    }

    const [year, month, day, hour, minute, second] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
    const date = new Date(year, month - 1, day, hour, minute, second);

    // new Date(2026, 1, 31) no falla: da el 3 de marzo. Se comprueba que la fecha no se desbordó.
    const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;
    return real ? date.toISOString() : null;
}

// Del instante UTC de la API a lo que debe enseñar el input: la hora de pared del navegador, sin segundos ni zona.
export function utcIsoToLocalInput(iso: string | null | undefined): string {
    const date = parse(iso);
    return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

// Para enseñar: «10/11/2026 09:00», en 24 horas y en la hora del navegador. «—» si no hay fecha.
export function formatDateTime(iso: string | null | undefined): string {
    const date = parse(iso);
    return date
        ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
        : '—';
}

// Solo la hora, «09:00». Cadena vacía si no hay fecha.
export function formatTime(iso: string | null | undefined): string {
    const date = parse(iso);
    return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

function parse(iso: string | null | undefined): Date | null {
    if (!iso) {
        return null;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}
