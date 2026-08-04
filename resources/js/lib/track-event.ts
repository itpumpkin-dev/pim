import { xsrfToken } from '@/lib/csrf';

type TrackEventPayload =
    | { eventType: 'click'; productId: number; category: string | null }
    | { eventType: 'category_select'; category: string };

/** Fire-and-forget storefront analytics beacon; failures are silently ignored. */
export function trackEvent(payload: TrackEventPayload) {
    fetch('/storefront/events', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: JSON.stringify({
            event_type: payload.eventType,
            product_id: payload.eventType === 'click' ? payload.productId : null,
            category: payload.category,
        }),
    }).catch(() => {});
}
