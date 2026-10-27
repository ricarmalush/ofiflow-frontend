// Códigos de error estables de la API (ADR-011): son los que se comparan en código. El texto
// (`detail`) está traducido y puede cambiar; el código no.

// 403 que reciben los miembros de una empresa suspendida por la plataforma (spec 011 R15): en el
// login con las credenciales correctas, y en cualquier petición con un token todavía válido.
export const TENANT_SUSPENDED_CODE = 'tenant.suspended';

// Respaldo por si el 403 llegara sin el texto de la API.
export const TENANT_SUSPENDED_MESSAGE = 'Tu empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.';

// 403 por falta de permiso: «tu rol no puede hacer esto». Si el rol cambió desde que se cargó la
// cuenta, la interfaz estaba ofreciendo algo que ya no puede; se vuelve a pedir la cuenta para corregirla.
export const FORBIDDEN_CODE = 'auth.forbidden';
