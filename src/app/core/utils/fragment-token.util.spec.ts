import { clearFragment, readFragmentToken } from './fragment-token.util';

describe('readFragmentToken', () => {
    it('reads the token from the fragment', () => {
        expect(readFragmentToken('#token=abc-_123')).toBe('abc-_123');
    });

    it('works without the leading #', () => {
        expect(readFragmentToken('token=abc')).toBe('abc');
    });

    it('returns null when there is no fragment, no token or an empty one', () => {
        expect(readFragmentToken('')).toBeNull();
        expect(readFragmentToken('#')).toBeNull();
        expect(readFragmentToken('#other=1')).toBeNull();
        expect(readFragmentToken('#token=')).toBeNull();
    });

    it('ignores other parameters in the fragment', () => {
        expect(readFragmentToken('#a=1&token=xyz&b=2')).toBe('xyz');
    });
});

describe('clearFragment', () => {
    afterEach(() => history.replaceState(history.state, '', location.pathname));

    it('removes the fragment from the address bar and keeps the query string', () => {
        history.replaceState(history.state, '', `${location.pathname}?x=1#token=secreto`);
        expect(location.hash).toBe('#token=secreto');

        clearFragment();

        expect(location.hash).toBe('');
        expect(location.search).toBe('?x=1');
    });

    it('does nothing when there is no fragment', () => {
        const before = location.href;

        clearFragment();

        expect(location.href).toBe(before);
    });
});
