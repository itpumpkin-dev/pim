// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { xsrfToken } from './csrf';

function clearCookies() {
    for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        }
    }
}

describe('xsrfToken', () => {
    afterEach(() => {
        clearCookies();
    });

    it('returns an empty string when there is no XSRF-TOKEN cookie', () => {
        expect(xsrfToken()).toBe('');
    });

    it('returns the decoded token when it is the only cookie', () => {
        document.cookie = 'XSRF-TOKEN=abc%3D123';
        expect(xsrfToken()).toBe('abc=123');
    });

    it('finds the token among other cookies, regardless of position', () => {
        document.cookie = 'foo=bar';
        document.cookie = 'XSRF-TOKEN=middle-token';
        document.cookie = 'baz=qux';
        expect(xsrfToken()).toBe('middle-token');
    });

    it('URL-decodes special characters in the token', () => {
        document.cookie = `XSRF-TOKEN=${encodeURIComponent('a+b/c=d')}`;
        expect(xsrfToken()).toBe('a+b/c=d');
    });
});
