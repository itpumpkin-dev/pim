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
import AppLogo from './app-logo';

const MAIN_NAV_ITEMS: NavItem[] = [

    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: DashboardIcon,
        permission: 'dashboards.list_dashboards',
    },
    {
        title: 'Catalog',
        icon: MenuBookIcon,
        items: [
            {
                title: 'Products',
                url: '/catalog/products',
            },
            {
                title: 'Categories',
                url: '/catalog/categories',
            },
            {
                title: 'Category Fields',
                url: '/catalog/categoryFields',
            },
            {
                title: 'Attributes',
                url: '/catalog/attributes',
            },
            {
                title: 'Attribute Groups',
                url: '/catalog/attributeGroups',
            },
            {
                title: 'Attribute Families',
                url: '/catalog/attributeFamilies',
            },
        ],
    },
    {
        title: 'System',
        icon: SettingsIcon,
        items: [
            {
                title: 'Users',
                url: '/system/user',
                permission: 'users.list_users',
            },
            {
                title: 'User Groups',
                url: '/system/userGroup',
                permission: 'user_groups.list_user_groups',
            },
            {
                title: 'Roles',
                url: '/system/roles',
                permission: 'roles.list_roles',
            },
        ],
    },
    // {
    //     title: 'Users',
    //     url: '/users',
    //     icon: GroupIcon,
    // },
];


export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
    const { auth } = usePage<SharedData>().props;
    const collapsed = state === 'collapsed';
    const width = collapsed ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;

    const filterNavItems = (items: NavItem[]): NavItem[] => {
        return items
            .filter((item) => !item.permission || auth.permissions.includes(item.permission))
            .map((item) => ({
                ...item,
                items: item.items ? filterNavItems(item.items) : undefined,
            }))
            .filter((item) => !item.items || item.items.length > 0);
    };

    const filteredMainNavItems = filterNavItems(MAIN_NAV_ITEMS);

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
