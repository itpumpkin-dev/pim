import { SidebarProvider } from '@/hooks/use-sidebar';
import { Box } from '@mui/material';
import { useState } from 'react';

interface AppShellProps {
    children: React.ReactNode;
    variant?: 'header' | 'sidebar';
}

export function AppShell({ children, variant = 'header' }: AppShellProps) {
    // Always starts expanded on every page load — the collapsed/expanded
    // state no longer persists across reloads (previously read/wrote a
    // 'sidebar' localStorage flag, so a user who once collapsed it would
    // keep landing on a collapsed sidebar on this machine forever). Still
    // toggleable for the rest of the session via setOpen/toggleSidebar.
    const [isOpen, setIsOpen] = useState(true);

    if (variant === 'header') {
        return <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%', flexDirection: 'column' }}>{children}</Box>;
    }

    return (
        <SidebarProvider defaultOpen open={isOpen} onOpenChange={setIsOpen}>
            <Box sx={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>{children}</Box>
        </SidebarProvider>
    );
}
