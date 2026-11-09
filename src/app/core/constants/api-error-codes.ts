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

// 403 de la obligación del segundo factor (spec 022): «tu rol exige el segundo factor y todavía no lo tienes activo». NO es auth.forbidden: la persona está autenticada y puede hacer
// algo, activarlo. No cierra la sesión: lleva a la pantalla de seguridad (donde se activa). Se decide por el código, nunca por el texto.
export const MFA_ENROLLMENT_REQUIRED_CODE = 'mfa.enrollment_required';

// Alguien modificó el presupuesto mientras se editaba (spec 023 R10): la API no pisa nada y la pantalla ofrece recargar o guardar de todos modos. Se decide por el código, nunca por el texto.
export const QUOTE_CHANGED_MEANWHILE_CODE = 'quote.changed_meanwhile';

// La pantalla donde se activa el segundo factor: la única a la que puede ir quien debe activarlo y no lo ha hecho (spec 022 D9).
export const SECURITY_ROUTE = '/account/security';
