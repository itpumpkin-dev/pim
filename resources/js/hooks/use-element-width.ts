import { useEffect, useRef, useState } from 'react';

/** tracks an element's content width via ResizeObserver, for layouts that need to react to their own container instead of the viewport */
export function useElementWidth<T extends HTMLElement>(initial = 1200) {
    const ref = useRef<T | null>(null);
    const [width, setWidth] = useState(initial);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) setWidth(entry.contentRect.width);
        });
        observer.observe(el);
        setWidth(el.getBoundingClientRect().width);

        return () => observer.disconnect();
    }, []);

    return { ref, width };
}
