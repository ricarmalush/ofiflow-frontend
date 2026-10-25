import qrcode from 'qrcode-generator';

// Genera el QR en el navegador y lo devuelve como data URL (imagen GIF) para un <img>.
// Nunca se usa un servicio externo de QR (api.qrserver.com y similares): habría que mandarle la
// URI otpauth://, que lleva el secreto TOTP, y ese tercero podría generar tus códigos.
// Se usa <img src="data:..."> y no el SVG con [innerHTML], para no pintar HTML generado.
export function qrDataUrl(text: string, cellSize = 4, margin = 4): string {
    // typeNumber 0 = tamaño automático; 'M' = corrección de errores media (estándar para TOTP).
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(cellSize, margin);
}
