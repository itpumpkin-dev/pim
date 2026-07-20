import { SidebarProvider } from '@/hooks/use-sidebar';
import { Box } from '@mui/material';
import { useState } from 'react';

interface AppShellProps {
    children: React.ReactNode;
    variant?: 'header' | 'sidebar';
}

export function AppShell({ children, variant = 'header' }: AppShellProps) {
    const [isOpen, setIsOpen] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('sidebar') !== 'false' : true));

    const handleSidebarChange = (open: boolean) => {
        setIsOpen(open);

        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebar', String(open));
        }
    };

    if (variant === 'header') {
        return <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%', flexDirection: 'column' }}>{children}</Box>;
    }

    return (
        <SidebarProvider defaultOpen={isOpen} open={isOpen} onOpenChange={handleSidebarChange}>
            <Box sx={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>{children}</Box>
        </SidebarProvider>
    );
}
