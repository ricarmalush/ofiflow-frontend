// La versión de las condiciones de uso que esta interfaz enseña (spec 021 D7). Viaja en la petición de pedir el registro y en la de aceptar una invitación, y la API la compara con
// la suya (Legal:TermsVersion): si no coinciden, rechaza con 400 en el campo acceptedTermsVersion. Así, quien tenga abierta una pantalla antigua no acepta unas condiciones que no
// ha visto. SUBIRLA A LA VEZ que Legal:TermsVersion en la API, cuando el dueño del proyecto publique unas condiciones nuevas.
export const TERMS_VERSION = '2026-11';

// El código estable con el que la API rechaza un token de registro desconocido, caducado, usado, sustituido o cuyo email ya tiene cuenta (los cinco dan el mismo; spec 021 R11).
export const REGISTRATION_INVALID_CODE = 'registration.invalid';
