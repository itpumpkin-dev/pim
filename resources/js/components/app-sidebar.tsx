import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Divider, Drawer, Toolbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AppLogo from './app-logo';

function useMainNavItems(): NavItem[] {
    const { t } = useTranslation('nav');

    return [
        {
            title: t('dashboard'),
            url: '/dashboard',
            icon: DashboardIcon,
            permission: 'dashboards.list_dashboards',
        },
        {
            title: t('catalog'),
            icon: MenuBookIcon,
            items: [
                {
                    title: t('products'),
                    url: '/catalog/products',
                },
                {
                    title: t('categories'),
                    url: '/catalog/categories',
                },
                {
                    title: t('categoryFields'),
                    url: '/catalog/categoryFields',
                },
                {
                    title: t('attributes'),
                    url: '/catalog/attributes',
                },
                {
                    title: t('attributeGroups'),
                    url: '/catalog/attributeGroups',
                },
                {
                    title: t('attributeFamilies'),
                    url: '/catalog/attributeFamilies',
                },
            ],
        },
        {
            title: t('system'),
            icon: SettingsIcon,
            items: [
                {
                    title: t('users'),
                    url: '/system/user',
                    permission: 'users.list_users',
                },
                {
                    title: t('userGroups'),
                    url: '/system/userGroup',
                    permission: 'user_groups.list_user_groups',
                },
                {
                    title: t('roles'),
                    url: '/system/roles',
                    permission: 'roles.list_roles',
                },
                {
                    title: t('locales'),
                    url: '/system/locales',
                    permission: 'locales.list_locales',
                },
            ],
        },
    ];
}

export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
    const { auth } = usePage<SharedData>().props;
    const collapsed = state === 'collapsed';
    const width = collapsed ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;
    const mainNavItems = useMainNavItems();

    const filterNavItems = (items: NavItem[]): NavItem[] => {
        return items
            .filter((item) => !item.permission || auth.permissions.includes(item.permission))
            .map((item) => ({
                ...item,
                items: item.items ? filterNavItems(item.items) : undefined,
            }))
            .filter((item) => !item.items || item.items.length > 0);
    };

    const filteredMainNavItems = filterNavItems(mainNavItems);

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
                <NavMain items={filteredMainNavItems} collapsed={collapsed} />
            </Box>
            <Box sx={{ mt: 'auto' }}>
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
