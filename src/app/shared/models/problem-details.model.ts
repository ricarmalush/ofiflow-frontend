// Espejo TS de los errores de la API (GlobalExceptionHandler, RFC 9457). Un 2xx devuelve el DTO
// tal cual, sin envoltorio; solo los errores llegan con esta forma.

export interface FieldError {
    field: string;
    code: string;
    message: string;
}

export interface ProblemDetails {
    type?: string;
    title?: string;
    status?: number;
    // Texto para el usuario, ya traducido al idioma de la petición.
    detail?: string;
    // Identificador estable del error (ADR-011): para decidir en código, nunca comparar "detail".
    code?: string;
    // Solo en errores de validación (400): uno por campo.
    errors?: FieldError[];
    traceId?: string;
}
