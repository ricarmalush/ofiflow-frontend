import { FieldError } from './problem-details.model';

// Forma normalizada que exponen los servicios: nunca lanzan. Éxito con sus datos, o fallo con el
// mensaje (real de la API o de respaldo), su código estable y los errores por campo si los hay.
export interface OperationResult<TData = void> {
    isSuccess: boolean;
    message: string;
    data?: TData;
    code?: string;
    fieldErrors?: FieldError[];
}
