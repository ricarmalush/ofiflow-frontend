import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { TermsCheckbox } from './terms-checkbox';

// Una pantalla mínima que usa la casilla como la usan las de verdad: con un control que exige estar marcado.
@Component({
    selector: 'app-host',
    standalone: true,
    imports: [TermsCheckbox],
    template: `<app-terms-checkbox [control]="control" [termsUrl]="termsUrl" [privacyUrl]="privacyUrl" />`
})
class Host {
    control = new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] });
    termsUrl = '';
    privacyUrl = '';
}

describe('TermsCheckbox (spec 021)', () => {
    let fixture: ComponentFixture<Host>;
    let host: Host;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        fixture = TestBed.createComponent(Host);
        host = fixture.componentInstance;
    });

    const root = () => fixture.nativeElement as HTMLElement;
    const termsLink = () => root().querySelector<HTMLAnchorElement>('[data-testid="terms-link"]');
    const privacyLink = () => root().querySelector<HTMLAnchorElement>('[data-testid="privacy-link"]');

    it('starts unchecked, so the person has to accept on purpose', () => {
        fixture.detectChanges();

        expect(host.control.value).toBeFalse();
        expect(host.control.invalid).toBeTrue();
    });

    it('is bound to the control it receives: ticking it validates the control', () => {
        fixture.detectChanges();

        host.control.setValue(true);
        fixture.detectChanges();

        expect(host.control.valid).toBeTrue();
        expect(root().querySelector('p-checkbox')).not.toBeNull();
    });

    it('ticking the checkbox with a click sets the control, and unticking it clears it (it is really bound, not just rendered)', () => {
        fixture.detectChanges();
        const input = () => root().querySelector<HTMLInputElement>('input[type="checkbox"]')!;

        input().click();
        fixture.detectChanges();
        expect(host.control.value).toBeTrue();
        expect(host.control.valid).toBeTrue();

        input().click();
        fixture.detectChanges();
        expect(host.control.value).toBeFalse();
        expect(host.control.invalid).toBeTrue();
    });

    it('reflects the control in the checkbox: ticked from code shows ticked', () => {
        fixture.detectChanges();
        const input = () => root().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(input().checked).toBeFalse();

        host.control.setValue(true);
        fixture.detectChanges();

        expect(input().checked).toBeTrue();
    });

    it('says what is accepted: the terms of use and the privacy policy', () => {
        fixture.detectChanges();

        const label = root().querySelector('label')?.textContent?.replace(/\s+/g, ' ').trim();
        expect(label).toBe('He leído y acepto las condiciones de uso y la política de privacidad.');
    });

    it('without configured addresses shows the names without links (it does not link to a place that does not exist)', () => {
        fixture.detectChanges();

        expect(termsLink()).toBeNull();
        expect(privacyLink()).toBeNull();
    });

    it('with configured addresses links both documents, in another tab and without opener', () => {
        host.termsUrl = 'https://ofiflow.example/condiciones';
        host.privacyUrl = 'https://ofiflow.example/privacidad';
        fixture.detectChanges();

        expect(termsLink()?.getAttribute('href')).toBe('https://ofiflow.example/condiciones');
        expect(privacyLink()?.getAttribute('href')).toBe('https://ofiflow.example/privacidad');
        for (const link of [termsLink(), privacyLink()]) {
            expect(link?.getAttribute('target')).toBe('_blank');
            expect(link?.getAttribute('rel')).toContain('noopener');
            expect(link?.getAttribute('rel')).toContain('noreferrer');
        }
    });

    it('links only the document whose address is configured', () => {
        host.termsUrl = 'https://ofiflow.example/condiciones';
        fixture.detectChanges();

        expect(termsLink()).not.toBeNull();
        expect(privacyLink()).toBeNull();
    });

    it('ties the label to the checkbox, so clicking the text ticks it', () => {
        fixture.detectChanges();

        expect(root().querySelector('label')?.getAttribute('for')).toBe('acceptTerms');
    });
});
