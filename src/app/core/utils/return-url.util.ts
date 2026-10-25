// returnUrl llega en la query string, así que cualquiera puede fabricar un enlace con él. Solo se
// acepta una ruta interna: "/algo". Se rechazan "https://evil.com", "//evil.com" (sin esquema el
// navegador lo trata como otro dominio) y "/\evil.com" (algunos navegadores convierten \ en /).
// Sin esto, el login sería un open redirect: un enlace legítimo de OfiFlow que, tras entrar,
// lleva al usuario a una copia falsa de la web.
export function safeReturnUrl(value: string | null | undefined, fallback = '/'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
        return fallback;
    }
    return value;
}
