// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from './track-event';

describe('trackEvent', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=abc%3D123';
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(new Response('{}'))),
        );
    });

    it('POSTs a click event with its productId/category as the JSON body', () => {
        trackEvent({ eventType: 'click', productId: 42, category: 'Sealant' });

        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe('/storefront/events');
        expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
        expect(JSON.parse(init.body)).toEqual({ event_type: 'click', product_id: 42, category: 'Sealant' });
    });

    it('sends product_id: null for a category_select event', () => {
        trackEvent({ eventType: 'category_select', category: 'Adhesive' });

        const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({ event_type: 'category_select', product_id: null, category: 'Adhesive' });
    });

    it('includes the decoded XSRF cookie value in the X-XSRF-TOKEN header', () => {
        trackEvent({ eventType: 'category_select', category: 'X' });

        const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(init.headers['X-XSRF-TOKEN']).toBe('abc=123');
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('silently swallows a fetch rejection instead of throwing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('network down'))),
        );

        expect(() => trackEvent({ eventType: 'category_select', category: 'X' })).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
});
