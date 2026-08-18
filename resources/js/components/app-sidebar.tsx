import { NavPrimary } from '@/components/nav-primary';
import { NavSecondary } from '@/components/nav-secondary';
import { useResolvedAppearance } from '@/hooks/use-appearance';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { getTheme } from '@/theme';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Divider, Drawer, ThemeProvider, Toolbar, Typography } from '@mui/material';
import { useState, useMemo, useEffect } from 'react';
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

    // Must be stable across renders that don't actually change translations:
    // filteredMainNavItems (useMemo below) depends on this array's identity,
    // and a second effect depends on filteredMainNavItems and unconditionally
    // calls setSelectedGroup — an unmemoized array here (a fresh literal every
    // render) makes that chain recompute and re-set state on every single
    // render, which is an unbounded render loop (surfaced as React's "Maximum
    // update depth exceeded", most visibly under the product edit page's
    // useTransition-driven re-render churn, but not actually specific to it).
    return useMemo(() => [
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
                {
                    title: t('wooConvert'),
                    url: '/import-export/woo-convert',
                    permission: 'woo_conversions.list_woo_conversions',
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
                    // "Sales Platforms" is a tab on the Channels page, not
                    // its own sidebar entry — without this, viewing it makes
                    // the whole sidebar lose its highlighted section.
                    matchUrls: ['/catalog/sales-platforms'],
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
    ], [t]);
}

// Nav items only list each section's top-level URL (e.g. /catalog/products)
// — an exact-equality match against the page URL would never match a nested
// detail page (/catalog/products/33/edit, /catalog/products/create, ?query
// strings, ...). Match by path prefix instead (with a '/' boundary so
// /catalog/products doesn't also match an unrelated /catalog/productsX).
function findActiveGroup(items: NavItem[], pageUrl: string): NavItem | null {
    const currentPath = pageUrl.split('?')[0];
    const matchesCurrentPath = (url?: string) =>
        !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));
    const matchesItem = (item: NavItem) => matchesCurrentPath(item.url) || (item.matchUrls ?? []).some(matchesCurrentPath);

    return (
        items.find((item) => matchesItem(item) || (item.items && item.items.some(matchesItem))) || items[0] || null
    );
}

export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state, setOpen } = useSidebar();
    const page = usePage();
    const { auth } = usePage<SharedData>().props;
    const { resolved } = useResolvedAppearance();
    const sidebarBg = SIDEBAR_BG[resolved];
    const collapsed = state === 'collapsed';
    const mainNavItems = useMainNavItems();

    // Memoize filtered items to avoid unnecessary recalculations and keep stable references
    const filteredMainNavItems = useMemo(() => {
        const filterNavItems = (items: NavItem[]): NavItem[] => {
            return items
                .filter((item) => !item.permission || auth.permissions.includes(item.permission))
                .map((item) => ({
                    ...item,
                    items: item.items ? filterNavItems(item.items) : undefined,
                }))
                .filter((item) => !item.items || item.items.length > 0);
        };
        return filterNavItems(mainNavItems);
    }, [mainNavItems, auth.permissions]);

    // Lazy-initialized (not useState(null) + an effect) so the very first
    // paint after AppSidebar mounts — which is every navigation, since each
    // page wraps itself in <AppLayout> rather than Inertia persisting a
    // shared layout instance — already has the right group selected. With
    // useState(null), that first paint always rendered with hasSubmenus
    // false (secondary sidebar collapsed to width 0/opacity 0), then the
    // post-mount effect set the real group and the secondary sidebar
    // animated open — a visible flash on every page load.
    const [selectedGroup, setSelectedGroup] = useState<NavItem | null>(() => findActiveGroup(filteredMainNavItems, page.url));

    // Still needed for a page.url change without a remount (e.g. if a future
    // refactor moves to Inertia's persistent-layout pattern) — harmless
    // no-op re-render on first mount since it recomputes the same group the
    // lazy initializer above already set.
    useEffect(() => {
        const activeGroup = findActiveGroup(filteredMainNavItems, page.url);
        if (activeGroup) {
            setSelectedGroup(activeGroup);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page.url]);

    // Keep selectedGroup in sync with new translated items when language changes
    useEffect(() => {
        if (selectedGroup) {
            const updatedGroup = filteredMainNavItems.find(item => item.icon === selectedGroup.icon);
            if (updatedGroup) {
                setSelectedGroup(updatedGroup);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredMainNavItems]);

    const hasSubmenus = selectedGroup && selectedGroup.items && selectedGroup.items.length > 0;
    const width = collapsed ? SIDEBAR_WIDTH_ICON : (hasSubmenus ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON);

    const content = (
        <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Primary Sidebar (Narrow Left Column) */}
            <Box
                sx={{
                    width: SIDEBAR_WIDTH_ICON,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRight: '1px solid',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                }}
            >
                <Toolbar
                    sx={{
                        px: 1,
                        minHeight: '57px !important',
                        justifyContent: 'center',
                    }}
                >
                    <Box
                        component={Link}
                        href="/dashboard"
                        prefetch
                        sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                    >
                        <AppLogo collapsed={true} />
                    </Box>
                </Toolbar>
                <Divider sx={{ alignSelf: 'stretch', borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', alignSelf: 'stretch' }}>
                    <NavPrimary
                        items={filteredMainNavItems}
                        activeTitle={selectedGroup?.title ?? null}
                        onSelect={(item) => {
                            if (collapsed) {
                                setOpen(true);
                            }
                            setSelectedGroup(item);
                        }}
                    />
                </Box>
            </Box>

            {/* Secondary Sidebar (Wider Right Column) */}
            <Box
                sx={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: (theme) => theme.transitions.create(['width', 'opacity'], { duration: theme.transitions.duration.shortest }),
                    width: hasSubmenus && !collapsed ? SIDEBAR_WIDTH - SIDEBAR_WIDTH_ICON : 0,
                    opacity: hasSubmenus && !collapsed ? 1 : 0,
                    overflow: 'hidden',
                    bgcolor: 'rgba(0, 0, 0, 0.12)',
                }}
            >
                <Toolbar
                    sx={{
                        px: 3,
                        minHeight: '57px !important',
                        justifyContent: 'flex-start',
                    }}
                >
                    <Typography
                        variant="h6"
                        noWrap
                        sx={{
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            color: '#fff',
                            letterSpacing: '0.02em',
                        }}
                    >
                        PIM PK
                    </Typography>
                </Toolbar>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {selectedGroup && (
                        <NavSecondary title={selectedGroup.title} items={selectedGroup.items ?? []} />
                    )}
                </Box>
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

