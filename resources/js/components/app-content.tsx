import { RouteLoadingSkeleton } from '@/components/route-loading-skeleton';
import { Box } from '@mui/material';
import * as React from 'react';

interface AppContentProps extends React.ComponentProps<typeof Box> {
    variant?: 'header' | 'sidebar';
}

export function AppContent({ variant = 'header', children, ...props }: AppContentProps) {
    if (variant === 'sidebar') {
        return (
            <Box
                component="main"
                sx={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
                {...props}
            >
                {children}
                <RouteLoadingSkeleton />
            </Box>
        );
    }

    return (
        <Box
            component="main"
            sx={{ position: 'relative', mx: 'auto', width: '100%', maxWidth: 1280, flex: 1, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 2 }}
            {...props}
        >
            {children}
            <RouteLoadingSkeleton />
        </Box>
    );
}
