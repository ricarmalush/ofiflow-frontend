import { escapeHtml } from './escape-html.util';

describe('escapeHtml', () => {
    it('turns markup into plain text', () => {
        expect(escapeHtml('<img src="https://evil.com/x.png">')).toBe('&lt;img src=&quot;https://evil.com/x.png&quot;&gt;');
    });

    it('leaves a normal name as it is', () => {
        expect(escapeHtml('Fontanería López')).toBe('Fontanería López');
    });

    it('escapes ampersands first so existing entities are not half-decoded', () => {
        expect(escapeHtml('A &lt; B')).toBe('A &amp;lt; B');
    });
});
