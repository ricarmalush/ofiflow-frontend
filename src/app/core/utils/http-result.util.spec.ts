import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { NETWORK_ERROR_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from '../constants/service-messages';
import { extractErrorMessage, toOperationResult } from './http-result.util';

describe('http-result.util', () => {
    describe('extractErrorMessage', () => {
        it('uses the ProblemDetails detail when the API sends one', () => {
            const error = new HttpErrorResponse({ status: 400, error: { detail: 'El email ya existe.', code: 'Email.Duplicate' } });

            expect(extractErrorMessage(error)).toBe('El email ya existe.');
        });

        it('falls back to the network message when the request never reached the API', () => {
            const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

            expect(extractErrorMessage(error)).toBe(NETWORK_ERROR_MESSAGE);
        });

        it('falls back to the generic message when the body is not JSON', () => {
            const error = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

            expect(extractErrorMessage(error)).toBe(UNEXPECTED_ERROR_MESSAGE);
        });
    });

    describe('toOperationResult', () => {
        it('wraps a 2xx body as a success with its data', async () => {
            const result = await firstValueFrom(toOperationResult(of({ id: 7 })));

            expect(result).toEqual({ isSuccess: true, message: '', data: { id: 7 } });
        });

        it('turns a validation error into a failure with its code and field errors, without throwing', async () => {
            const problem = {
                status: 400,
                detail: 'La petición no es válida.',
                code: 'Validation.Failed',
                errors: [{ field: 'Email', code: 'Email.Invalid', message: 'El email no es válido.' }]
            };
            const source = throwError(() => new HttpErrorResponse({ status: 400, error: problem }));

            const result = await firstValueFrom(toOperationResult(source));

            expect(result.isSuccess).toBeFalse();
            expect(result.message).toBe('La petición no es válida.');
            expect(result.code).toBe('Validation.Failed');
            expect(result.fieldErrors).toEqual(problem.errors);
        });
    });
});
