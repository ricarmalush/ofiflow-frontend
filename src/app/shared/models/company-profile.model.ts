// Espejo TS de CompanyProfileDto y UpsertCompanyProfileCommand (OfiFlow.Application.Company, spec 024): el perfil fiscal de la empresa, quién emite los documentos.

// Lo que devuelve GET /company/profile. Si la empresa todavía no lo ha guardado, TODOS los campos vienen a null e isComplete es false: es lo normal tras registrarse, no un error.
export interface CompanyProfile {
    legalName: string | null;
    taxId: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    phone: string | null;
    email: string | null;
    isComplete: boolean;
}

// Lo que envía PUT /company/profile: TODOS los campos cada vez (un opcional ausente borra el anterior). No lleva empresa, ni id, ni fechas: la empresa sale del token.
export interface CompanyProfileInput {
    legalName: string;
    taxId: string;
    addressLine: string;
    postalCode: string;
    city: string;
    province: string | null;
    phone: string | null;
    email: string | null;
}

// Cotas de OfiFlow.Domain.Company (CompanyProfile, SpanishTaxId) y de PhoneNumber / Email. El formulario las usa para avisar antes de enviar; la API las vuelve a validar y es la que manda.
export const COMPANY_LIMITS = {
    legalNameMaxLength: 200,
    addressLineMaxLength: 200,
    cityMaxLength: 100,
    provinceMaxLength: 100,
    // Lo más largo que se acepta ANTES de normalizar el NIF (con espacios, guiones o puntos de por medio).
    taxIdInputMaxLength: 20,
    phoneMaxLength: 20,
    emailMaxLength: 320,
    phonePattern: /^\+?[0-9\s\-()]{6,20}$/
} as const;

// Una empresa sin perfil guardado, tal como la devuelve la API.
export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
    legalName: null,
    taxId: null,
    addressLine: null,
    postalCode: null,
    city: null,
    province: null,
    phone: null,
    email: null,
    isComplete: false
};
