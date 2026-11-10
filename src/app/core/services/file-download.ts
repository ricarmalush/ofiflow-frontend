import { Injectable } from '@angular/core';

// Entrega al navegador un fichero que ya está en memoria (la descarga del PDF de un presupuesto, spec 025). Es un servicio aparte para que las pantallas no toquen el DOM y se pueda
// probar sin descargar nada. El fichero NO se guarda en ningún almacenamiento del navegador: vive en una URL temporal que se libera después.
@Injectable({
    providedIn: 'root'
})
export class FileDownloadService {
    // Tiempo que se deja viva la URL temporal tras pulsar el enlace: el navegador ya empezó la descarga, pero algunos necesitan un instante para leerla.
    static readonly RevokeDelayMs = 1000;

    save(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        // La URL temporal se libera: si no, el documento (con los datos fiscales de la empresa y los precios) se queda en memoria hasta cerrar la pestaña.
        setTimeout(() => URL.revokeObjectURL(url), FileDownloadService.RevokeDelayMs);
    }
}
