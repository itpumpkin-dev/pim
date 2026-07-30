import echo from '@/echo';
import { router } from '@inertiajs/react';
import { useEffect } from 'react';

type ProductDataChangedPayload = { id: number; enabled: boolean };

/**
 * Listens on the public "storefront" channel for product changes (own
 * fields, attribute values, enabled toggled, or deleted) pushed by
 * ProductController. `onChange` is called for every event; callers decide
 * whether that means "reload the list" (home) or "check if it's the product
 * I'm looking at" (show page).
 */
export function useStorefrontWatcher(onChange: (payload: ProductDataChangedPayload) => void) {
    useEffect(() => {
        const channel = echo.channel('storefront');
        channel.listen('.product.updated', onChange);

        return () => {
            echo.leave('storefront');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/** Default reload behaviour for the home page product grid. */
export function reloadStorefrontLists() {
    router.reload({ only: ['products', 'categories'] });
}
