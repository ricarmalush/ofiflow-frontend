// Solo para tests. Un JWT "de mentira": jwt-decode solo lee el payload (la segunda parte) y no
// comprueba la firma, así que la cabecera y la firma pueden ser cualquier texto.
function base64Url(value: string): string {
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildToken(payload: Record<string, unknown>): string {
    return `header.${base64Url(JSON.stringify(payload))}.signature`;
}

// Token con los claims que emite la API, caducando dentro de una hora salvo que se diga otra cosa.
export function buildSessionToken(overrides: Record<string, unknown> = {}): string {
    return buildToken({
        sub: '11111111-1111-1111-1111-111111111111',
        tenant_id: '22222222-2222-2222-2222-222222222222',
        role: 'Owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...overrides
    });
}
