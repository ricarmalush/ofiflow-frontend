// Espejo TS de OfiFlow.Application.Identity.SessionDto (spec 016 de la API).

// Una sesión activa de la cuenta, tal como la devuelve GET /account/sessions.
export interface SessionInfo {
    // El Id público de la sesión: el mismo `sid` del token. Solo sirve para pedir cerrarla (DELETE /account/sessions/{id}).
    id: string;
    // Una etiqueta fija elegida por la API («Chrome en Windows», «Dispositivo desconocido»), nunca el navegador crudo.
    device: string;
    startedAt: string;
    // La última renovación de la sesión (como mucho cada 30 min de uso), no la última petición.
    lastActiveAt: string;
    // Red aproximada: la IP TRUNCADA (203.0.113.0). Nulo en sesiones anteriores a la spec 016.
    approximateIp: string | null;
    // Es la sesión de esta pestaña (la del token de esta petición).
    current: boolean;
}
