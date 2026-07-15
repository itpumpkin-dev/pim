import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { Box, Divider, Drawer, Toolbar } from '@mui/material';
import AppLogo from './app-logo';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: DashboardIcon,
    },
];

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        url: 'https://github.com/laravel/react-starter-kit',
        icon: FolderIcon,
    },
    {
        title: 'Documentation',
        url: 'https://laravel.com/docs/starter-kits',
        icon: MenuBookIcon,
    },
];

export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
    const collapsed = state === 'collapsed';
    const width = collapsed ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;

    const content = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar sx={{ px: collapsed ? 1 : 2, justifyContent: collapsed ? 'center' : 'flex-start' }}>
                <Box
                    component={Link}
                    href="/dashboard"
                    prefetch
                    sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit', overflow: 'hidden' }}
                >
                    <AppLogo />
                </Box>
            </Toolbar>
            <Divider />
            <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
                <NavMain items={mainNavItems} collapsed={collapsed} />
            </Box>
            <Box sx={{ mt: 'auto' }}>
                <NavFooter items={footerNavItems} collapsed={collapsed} />
                <Divider />
                <NavUser collapsed={collapsed} />
            </Box>
        </Box>
    );

    if (isMobile) {
        return (
            <Drawer
                anchor="left"
                open={openMobile}
                onClose={() => setOpenMobile(false)}
                ModalProps={{ keepMounted: true }}
                sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH } }}
            >
                {content}
            </Drawer>
        );
    }

    return (
        <Drawer
            variant="permanent"
            sx={{
                width,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                '& .MuiDrawer-paper': {
                    width,
                    boxSizing: 'border-box',
                    overflowX: 'hidden',
                    transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
                },
            }}
        >
            {content}
        </Drawer>
    );
}
