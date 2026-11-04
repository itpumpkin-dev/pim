import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Below this width the side navigation behaves as a mobile drawer: hidden by
 * default and opened on demand (`openMobile`) instead of the desktop
 * expanded/collapsed rail (`open`). Same breakpoint MUI's `down('md')` used
 * before the UI5 migration (900px).
 */
const MOBILE_QUERY = '(max-width: 899.95px)';

interface SidebarContextValue {
    isMobile: boolean;
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    toggleSidebar: () => void;
    state: 'expanded' | 'collapsed';
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

// Every Inertia page wraps itself in <AppLayout> (no persistent layout), so
// the whole shell — this provider included — remounts on each navigation.
// With `persist`, the desktop expanded/collapsed choice is remembered here at
// module level: it survives client-side navigations for the rest of the
// session but still resets to expanded on a full page reload (the old
// localStorage flag made a once-collapsed sidebar stick forever).
let rememberedOpen: boolean | null = null;

function useMediaQuery(query: string): boolean {
    const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
    const [matches, setMatches] = useState(get);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener?.('change', onChange);
        return () => mql.removeEventListener?.('change', onChange);
    }, [query]);

    return matches;
}

interface SidebarProviderProps {
    children: ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Remember the (uncontrolled) desktop open state across client-side navigations. */
    persist?: boolean;
}

export function SidebarProvider({ children, defaultOpen = true, open: openProp, onOpenChange, persist = false }: SidebarProviderProps) {
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const [internalOpen, setInternalOpen] = useState(() => (persist && rememberedOpen !== null ? rememberedOpen : defaultOpen));
    const [openMobile, setOpenMobile] = useState(false);

    const open = openProp ?? internalOpen;

    const setOpen = useCallback(
        (value: boolean) => {
            if (onOpenChange) {
                onOpenChange(value);
            } else {
                setInternalOpen(value);
                if (persist) rememberedOpen = value;
            }
        },
        [onOpenChange, persist],
    );

    const toggleSidebar = useCallback(() => {
        if (isMobile) {
            setOpenMobile((value) => !value);
        } else {
            setOpen(!open);
        }
    }, [isMobile, open, setOpen]);

    const value = useMemo<SidebarContextValue>(
        () => ({
            isMobile,
            open,
            setOpen,
            openMobile,
            setOpenMobile,
            toggleSidebar,
            state: open ? 'expanded' : 'collapsed',
        }),
        [isMobile, open, setOpen, openMobile, toggleSidebar],
    );

    return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
    const context = useContext(SidebarContext);

    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }

    return context;
}
