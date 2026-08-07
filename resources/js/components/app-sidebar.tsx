import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { useResolvedAppearance } from '@/hooks/use-appearance';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { getTheme } from '@/theme';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Divider, Drawer, ThemeProvider, Toolbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AppLogo from './app-logo';

// AdminLTE sidebars are always dark-on-text, independent of the app's
// light/dark mode toggle — so the sidebar gets its own fixed-dark theme
// for text/icon contrast. Its background color still tracks the app's
// resolved mode (see SIDEBAR_BG below).
const sidebarTheme = getTheme('dark');

const SIDEBAR_BG = {
    light: '#343a40',
    dark: '#0d1117',
} as const;

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
            title: t('importExport'),
            icon: ImportExportIcon,
            items: [
                {
                    title: t('imports'),
                    url: '/import-export/imports',
                    permission: 'import_configs.list_import_configs',
                },
                {
                    title: t('exports'),
                    url: '/import-export/exports',
                    permission: 'export_configs.list_export_configs',
                },
                {
                    title: t('jobTracker'),
                    url: '/import-export/jobs',
                    permission: 'job_trackers.list_job_trackers',
                },
            ],
        },
        {
            title: t('system'),
            icon: SettingsIcon,
            items: [
                {
                    title: t('channels'),
                    url: '/catalog/channels',
                    permission: 'channels.list_channels',
                },
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
                    title: t('departments'),
                    url: '/system/department',
                    permission: 'departments.list_departments',
                },
                {
                    title: t('jobPositions'),
                    url: '/system/jobPosition',
                    permission: 'job_positions.list_job_positions',
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
                {
                    title: t('translationProviders'),
                    url: '/system/translationProviders',
                    permission: 'translation_providers.list_translation_providers',
                },
                {
                    title: t('activityLogs'),
                    url: '/system/activity-logs',
                    permission: 'activity_logs.list_activity_logs',
                },
            ],
        },
    ];
}

export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
    const { auth } = usePage<SharedData>().props;
    const { resolved } = useResolvedAppearance();
    const sidebarBg = SIDEBAR_BG[resolved];
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
            <Toolbar
                sx={{
                    px: collapsed ? 1 : 2,
                    minHeight: '57px !important',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                }}
            >
                <Box
                    component={Link}
                    href="/dashboard"
                    prefetch
                    sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit', overflow: 'hidden' }}
                >
                    <AppLogo collapsed={collapsed} />
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
            <ThemeProvider theme={sidebarTheme}>
                <Drawer
                    anchor="left"
                    open={openMobile}
                    onClose={() => setOpenMobile(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, backgroundColor: sidebarBg } }}
                >
                    {content}
                </Drawer>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider theme={sidebarTheme}>
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
                        boxShadow: '4px 0 8px rgba(0, 0, 0, 0.15)',
                        backgroundColor: sidebarBg,
                        transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
                    },
                }}
            >
                {content}
            </Drawer>
        </ThemeProvider>
    );
}
