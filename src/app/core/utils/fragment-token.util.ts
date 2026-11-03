// Lee el token de un enlace de correo: "#token=...". Los enlaces de OfiFlow (invitación y restablecer contraseña) llevan el secreto en el
// fragmento y no en la consulta: el fragmento no viaja al servidor ni queda en sus registros ni en la cabecera Referer. Devuelve null si no hay.
export function readFragmentToken(hash: string): string | null {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get('token');
    return value ? value : null;
}

// Quita el fragmento de la barra de direcciones y del historial: si alguien mira la pantalla o el historial del navegador después, ya no ve el token.
export function clearFragment(): void {
    if (location.hash) {
        history.replaceState(history.state, '', location.pathname + location.search);
    }
}
