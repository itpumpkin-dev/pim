import { Breadcrumbs } from '@/components/breadcrumbs';
import { useSidebar } from '@/hooks/use-sidebar';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import MenuIcon from '@mui/icons-material/Menu';
import { IconButton, Toolbar } from '@mui/material';

export function AppSidebarHeader({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItemType[] }) {
    const { toggleSidebar } = useSidebar();

    return (
        <Toolbar sx={{ borderBottom: 1, borderColor: 'divider', gap: 1 }}>
            <IconButton onClick={toggleSidebar} edge="start" size="small" sx={{ mr: 1 }} aria-label="Toggle sidebar">
                <MenuIcon fontSize="small" />
            </IconButton>
            <Breadcrumbs breadcrumbs={breadcrumbs} />
        </Toolbar>
    );
}
