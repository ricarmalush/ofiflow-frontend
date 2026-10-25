// Espejo TS de CustomerDto y de los comandos de clientes (OfiFlow.Application.Customers).

export type CustomerType = 'Person' | 'Company';

export const CUSTOMER_TYPE_LABELS: Readonly<Record<CustomerType, string>> = {
    Person: 'Particular',
    Company: 'Empresa'
};

// Límites de OfiFlow.Domain.Customers (Customer y PhoneNumber). El formulario los usa para avisar
// antes de enviar; la API los vuelve a validar y es la que manda.
export const CUSTOMER_LIMITS = {
    nameMaxLength: 200,
    addressMaxLength: 500,
    notesMaxLength: 2000,
    phonePattern: /^\+?[0-9\s\-()]{6,20}$/
} as const;

export interface Customer {
    id: string;
    type: CustomerType;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
}

// Lo que se edita. El tipo solo se elige al crear: UpdateCustomer no lo cambia.
export interface CustomerInput {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
}
