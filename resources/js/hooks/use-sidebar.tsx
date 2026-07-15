import { useMediaQuery, useTheme } from '@mui/material';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_WIDTH_ICON = 68;

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

interface SidebarProviderProps {
    children: ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider({ children, defaultOpen = true, open: openProp, onOpenChange }: SidebarProviderProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const [openMobile, setOpenMobile] = useState(false);

    const open = openProp ?? internalOpen;

    const setOpen = (value: boolean) => {
        if (onOpenChange) {
            onOpenChange(value);
        } else {
            setInternalOpen(value);
        }
    };

    const toggleSidebar = () => {
        if (isMobile) {
            setOpenMobile((value) => !value);
        } else {
            setOpen(!open);
        }
    };

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isMobile, open, openMobile],
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
