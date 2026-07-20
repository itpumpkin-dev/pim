import { Breadcrumbs } from '@/components/breadcrumbs';
import { useSidebar } from '@/hooks/use-sidebar';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, IconButton, Toolbar } from '@mui/material';
import { type ReactNode } from 'react';

interface AppSidebarHeaderProps {
    breadcrumbs?: BreadcrumbItemType[];
    actions?: ReactNode;
}

export function AppSidebarHeader({ breadcrumbs = [], actions }: AppSidebarHeaderProps) {
    const { toggleSidebar } = useSidebar();

    return (
        <Toolbar
            sx={{
                position: 'sticky',
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
                gap: 1,
            }}
        >
            <IconButton onClick={toggleSidebar} edge="start" size="small" sx={{ mr: 1 }} aria-label="Toggle sidebar">
                <MenuIcon fontSize="small" />
            </IconButton>
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {actions && (
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {actions}
                </Box>
            )}
        </Toolbar>
    );
}
