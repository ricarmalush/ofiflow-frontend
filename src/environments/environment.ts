// URL base de la API de OfiFlow (perfil http de launchSettings.json). La API solo acepta peticiones
// del navegador desde los orígenes de Cors:AllowedOrigins, que en desarrollo es http://localhost:4200.
export const environment = {
    production: false,
    apiUrl: 'http://localhost:5279/api/v1'
};
