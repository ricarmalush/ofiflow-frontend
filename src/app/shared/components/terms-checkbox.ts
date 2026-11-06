import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { environment } from '../../../environments/environment';

// La casilla de «he leído y acepto» las condiciones de uso y la política de privacidad (spec 021 R16, D8). Se usa en pedir el registro y en aceptar una invitación: toda persona que
// crea una cuenta las acepta. El control lo trae la pantalla (con Validators.requiredTrue), para que su formulario decida si se puede enviar.
//
// Qué dicen los textos lo decide el dueño del proyecto (R17); aquí solo se enlazan. Mientras una dirección no esté configurada (environment.legal) se muestra el nombre del documento
// sin enlace: enlazar a un sitio que no existe sería peor que no enlazar. Los enlaces se abren en otra pestaña y sin `opener`, para no perder lo que la persona ya escribió.
@Component({
    selector: 'app-terms-checkbox',
    standalone: true,
    imports: [ReactiveFormsModule, CheckboxModule],
    template: `
        <div class="flex items-start gap-3">
            <p-checkbox [inputId]="inputId()" [formControl]="control()" [binary]="true" data-testid="terms-checkbox" />
            <label [for]="inputId()" class="leading-snug">
                He leído y acepto
                @if (termsUrl()) {
                    <a [href]="termsUrl()" target="_blank" rel="noopener noreferrer" class="text-primary font-medium" data-testid="terms-link">las condiciones de uso</a>
                } @else {
                    las condiciones de uso
                }
                y
                @if (privacyUrl()) {
                    <a [href]="privacyUrl()" target="_blank" rel="noopener noreferrer" class="text-primary font-medium" data-testid="privacy-link">la política de privacidad</a>.
                } @else {
                    la política de privacidad.
                }
            </label>
        </div>
    `
})
export class TermsCheckbox {
    readonly control = input.required<FormControl<boolean>>();
    readonly inputId = input('acceptTerms');
    // Por defecto, las del entorno; los tests (y quien necesite otras) pueden pasarlas.
    readonly termsUrl = input(environment.legal.termsUrl);
    readonly privacyUrl = input(environment.legal.privacyUrl);
}
