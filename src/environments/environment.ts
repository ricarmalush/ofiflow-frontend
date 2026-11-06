// URL base de la API de OfiFlow (perfil http de launchSettings.json). La API solo acepta peticiones
// del navegador desde los orígenes de Cors:AllowedOrigins, que en desarrollo es http://localhost:4200.
export const environment = {
    production: false,
    apiUrl: 'http://localhost:5279/api/v1',
    // Los textos legales (spec 021, R17) los redacta el dueño del proyecto y viven fuera de este repositorio. Mientras una dirección esté vacía, la casilla de condiciones
    // muestra el nombre del documento sin enlace (no se enlaza a un sitio que no existe). La versión vigente no es una dirección: es la constante TERMS_VERSION.
    legal: {
        termsUrl: '',
        privacyUrl: ''
    }
};
