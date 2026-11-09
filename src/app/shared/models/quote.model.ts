// Espejo TS de QuoteDto, QuoteListItemDto y los enums de OfiFlow.Domain.Quotes (spec 023). Los importes van en CÉNTIMOS ENTEROS: nunca un decimal de euros.

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';

export const QUOTE_STATUS_LABELS: Readonly<Record<QuoteStatus, string>> = {
    Draft: 'Borrador',
    Sent: 'Enviado',
    Accepted: 'Aceptado',
    Rejected: 'Rechazado'
};

// Los únicos tipos de IVA que admite la API (VatRates.Allowed): una lista cerrada, también aquí, para ofrecer solo esos.
export const VAT_RATES = [0, 4, 10, 21] as const;

export type QuoteTagSeverity = 'info' | 'warn' | 'success' | 'secondary' | 'contrast' | 'danger';

export interface QuoteItem {
    id: string;
    position: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    vatPercent: number;
    // El neto de la línea, calculado por el servidor.
    netCents: number;
}

export interface VatBreakdownLine {
    vatPercent: number;
    baseCents: number;
    vatCents: number;
}

export interface Quote {
    id: string;
    number: number;
    customerId: string;
    customerName: string;
    jobId: string | null;
    title: string;
    notes: string | null;
    // Una fecha de calendario («2026-12-31»), sin hora ni huso.
    validUntil: string | null;
    status: QuoteStatus;
    netCents: number;
    vatCents: number;
    totalCents: number;
    vatBreakdown: VatBreakdownLine[];
    items: QuoteItem[];
    sentAt: string | null;
    decidedAt: string | null;
    createdAt: string;
    // La versión de fila (base64): se devuelve al modificar y, si alguien lo cambió mientras tanto, la API no pisa nada.
    version: string;
}

export interface QuoteListItem {
    id: string;
    number: number;
    customerId: string;
    customerName: string;
    jobId: string | null;
    title: string;
    status: QuoteStatus;
    totalCents: number;
    validUntil: string | null;
    createdAt: string;
    sentAt: string | null;
    decidedAt: string | null;
}

export interface PagedResult<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalCount: number;
}

// Una línea tal y como se manda: NUNCA lleva un importe calculado (el neto de la línea y los totales los pone el servidor).
export interface QuoteLineInput {
    description: string;
    quantity: number;
    unitPriceCents: number;
    vatPercent: number;
}

export interface QuoteInput {
    jobId: string | null;
    title: string;
    notes: string | null;
    validUntil: string | null;
    items: QuoteLineInput[];
}

// Límites de OfiFlow.Domain.Quotes.Quote.
export const QUOTE_LIMITS = {
    titleMaxLength: 200,
    notesMaxLength: 2000,
    descriptionMaxLength: 500,
    maxItems: 100,
    quantityMax: 99999.999,
    quantityDecimals: 3,
    unitPriceCentsMax: 9_999_999_999
} as const;

export type QuoteTransition = 'send' | 'accept' | 'reject';

// Solo deciden qué botón se ofrece; si el estado cambió entre tanto, la API responde 400 con su mensaje y la pantalla lo muestra.
export const canEditQuote = (status: QuoteStatus) => status === 'Draft';
export const canSendQuote = (status: QuoteStatus) => status === 'Draft';
export const canDecideQuote = (status: QuoteStatus) => status === 'Sent';

export function quoteStatusSeverity(status: QuoteStatus): QuoteTagSeverity {
    switch (status) {
        case 'Sent':
            return 'info';
        case 'Accepted':
            return 'success';
        case 'Rejected':
            return 'danger';
        default:
            return 'secondary';
    }
}

// «P-0012»: solo para enseñarlo; el número es un entero correlativo dentro de la empresa.
export const formatQuoteNumber = (number: number) => `P-${String(number).padStart(4, '0')}`;

// «Caducado» es solo informativo (spec 023 R9): un borrador o un presupuesto enviado cuya validez ya pasó. Un presupuesto resuelto no caduca. Las fechas de calendario
// «aaaa-mm-dd» se comparan como texto, sin pasar por ningún huso.
export function isQuoteExpired(validUntil: string | null, status: QuoteStatus, today: Date): boolean {
    if (!validUntil || (status !== 'Draft' && status !== 'Sent')) {
        return false;
    }
    const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return validUntil < todayLocal;
}
