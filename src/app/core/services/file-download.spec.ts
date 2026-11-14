import { TestBed } from '@angular/core/testing';
import { FileDownloadService } from './file-download';

describe('FileDownloadService', () => {
    let service: FileDownloadService;
    let created: Blob[];
    let revoked: string[];
    let clicked: { download: string; href: string; inDom: boolean }[];

    beforeEach(() => {
        jasmine.clock().install();
        service = TestBed.inject(FileDownloadService);
        created = [];
        revoked = [];
        clicked = [];
        spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
            created.push(blob as Blob);
            return `blob:test/${created.length}`;
        });
        spyOn(URL, 'revokeObjectURL').and.callFake((url: string) => {
            revoked.push(url);
        });
        // El clic sobre el enlace no descarga nada de verdad: se anota qué enlace era y si estaba en el documento.
        spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
            clicked.push({ download: this.download, href: this.href, inDom: document.body.contains(this) });
        });
    });

    afterEach(() => jasmine.clock().uninstall());

    it('hands the file to the browser through a temporary link with the given name', () => {
        const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

        service.save(blob, 'presupuesto-P-0012.pdf');

        expect(created).toEqual([blob]);
        expect(clicked.length).toBe(1);
        expect(clicked[0].download).toBe('presupuesto-P-0012.pdf');
        expect(clicked[0].href).toBe('blob:test/1');
        expect(clicked[0].inDom).toBeTrue(); // Firefox exige que el enlace esté en el documento al pulsarlo
    });

    it('leaves nothing behind in the document', () => {
        const before = document.querySelectorAll('a').length;

        service.save(new Blob(['x']), 'a.pdf');

        expect(document.querySelectorAll('a').length).toBe(before);
    });

    it('releases the temporary URL after a moment, not before and not never', () => {
        service.save(new Blob(['x']), 'a.pdf');

        expect(revoked).toEqual([]);
        jasmine.clock().tick(FileDownloadService.RevokeDelayMs - 1);
        expect(revoked).toEqual([]);
        jasmine.clock().tick(1);
        expect(revoked).toEqual(['blob:test/1']);
    });

    it('releases each URL of each download', () => {
        service.save(new Blob(['x']), 'a.pdf');
        service.save(new Blob(['y']), 'b.pdf');
        jasmine.clock().tick(FileDownloadService.RevokeDelayMs);

        expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
    });

    it('does not keep the file in any browser storage', () => {
        const local = JSON.stringify({ ...localStorage });
        const session = JSON.stringify({ ...sessionStorage });

        service.save(new Blob(['%PDF-1.7 secreto'], { type: 'application/pdf' }), 'a.pdf');
        jasmine.clock().tick(FileDownloadService.RevokeDelayMs);

        expect(JSON.stringify({ ...localStorage })).toBe(local);
        expect(JSON.stringify({ ...sessionStorage })).toBe(session);
    });
});
