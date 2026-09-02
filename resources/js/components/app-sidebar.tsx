import { NavPrimary } from '@/components/nav-primary';
import { NavSecondary } from '@/components/nav-secondary';
import { useResolvedAppearance } from '@/hooks/use-appearance';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { FIORI } from '@/lib/fiori-style';
import { getTheme } from '@/theme';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Divider, Drawer, ThemeProvider, Toolbar, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLogo from './app-logo';

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
    return useMemo(
        () => [
            {
                // Reachable by every signed-in user — the dashboard page
                // itself hides whatever the viewer has no permission for.
                title: t('dashboard'),
                url: '/dashboard',
                icon: DashboardIcon,
            },
            {
                title: t('catalog'),
                icon: MenuBookIcon,
                items: [
                    {
                        title: t('products'),
                        items: [
                            {
                                title: t('products'),
                                url: '/catalog/products',
                                permission: 'products.list_products',
                            },
                        ],
                    },
                    {
                        title: t('master'),
                        items: [
                            {
                                title: t('categories'),
                                url: '/catalog/categories',
                                permission: 'categories.list_categories',
                                // Otherwise these prefix-match this item too
                                // (they're routed under the Categories CRUD
                                // prefix) and both this item and "จัดการ" would
                                // highlight as active at once — the whole
                                // marketplace-sync + per-platform mapping flow
                                // belongs to the Management hub now.
                                excludeUrls: [
                                    '/catalog/categories/marketplace-sync',
                                    '/catalog/categories/lazada-mapping',
                                    '/catalog/categories/shopee-mapping',
                                    '/catalog/categories/tiktok-mapping',
                                    '/catalog/categories/woocommerce-mapping',
                                ],
                            },
                            {
                                title: t('subCategories'),
                                url: '/catalog/subcategories',
                                permission: 'subcategories.list_subcategories',
                            },
                            {
                                title: t('productGroups'),
                                url: '/catalog/product-groups',
                                permission: 'product_groups.list_product_groups',
                            },
                            {
                                title: t('brands'),
                                url: '/catalog/brands',
                                permission: 'brands.list_brands',
                            },
                            {
                                title: t('unitsSellBuy'),
                                url: '/catalog/base-units',
                                permission: 'base_units.list_base_units',
                            },
                            {
                                title: t('points'),
                                url: '/catalog/points',
                                permission: 'points.list_points',
                            },
                            {
                                title: t('commissionGroups'),
                                url: '/catalog/commission-groups',
                                permission: 'commission_groups.list_commission_groups',
                            },
                            {
                                title: t('bom'),
                                url: '/catalog/bom',
                                permission: 'products.list_products',
                            },
                            {
                                title: t('businessTypes'),
                                url: '/catalog/business-types',
                                permission: 'business_types.list_business_types',
                            },
                            {
                                title: t('productGrades'),
                                url: '/catalog/product-grades',
                                permission: 'products.list_products',
                            },
                            {
                                title: t('vendors'),
                                url: '/catalog/vendors',
                                permission: 'vendors.list_vendors',
                            },
                            {
                                title: t('currencies'),
                                url: '/catalog/currencies',
                                permission: 'currencies.list_currencies',
                            },
                            {
                                title: t('productTypes'),
                                url: '/catalog/product-types',
                                permission: 'product_types.list_product_types',
                            },
                            {
                                title: t('marketplace'),
                                items: [
                                    {
                                        title: t('marketplaceConnect'),
                                        items: [
                                            { title: 'Shopee', url: '/catalog/marketplace/connect/shopee', permission: 'products.list_products' },
                                            { title: 'Lazada', url: '/catalog/marketplace/connect/lazada', permission: 'products.list_products' },
                                            { title: 'TikTok', url: '/catalog/marketplace/connect/tiktok', permission: 'products.list_products' },
                                            { title: 'WooCommerce', url: '/catalog/marketplace/connect/woocommerce', permission: 'products.list_products' },
                                        ],
                                    },
                                    ...(['shopee', 'lazada', 'tiktok', 'woocommerce'] as const).map((platform) => ({
                                        title: platform === 'woocommerce' ? 'WooCommerce' : platform.charAt(0).toUpperCase() + platform.slice(1),
                                        items: [
                                            // หน้าเดียวรวมทั้งแมปหมวดหมู่และแมปแบรนด์ (ลองแยกเป็นหน้าเดี่ยวๆ
                                            // ไปแล้วแต่ user ให้รวมกลับมาเหมือนเดิม) — เลยไม่มีเมนู "แมปฟิว
                                            // brand" แยกต่างหากอีกแล้ว
                                            { title: t('mapCategory'), url: `/catalog/categories/${platform}-mapping`, permission: 'categories.edit_categories' },
                                            // "แมปฟิวส่งข้อมูล" — พาไปหน้าจับคู่แอตทริบิวต์ PIM ↔ แอตทริบิวต์
                                            // marketplace ของแพลตฟอร์มนั้นๆ โดยตรง คนละหน้า/URL กันจริงๆ ต่อ
                                            // แพลตฟอร์ม (เคยรวมเป็นหน้าเดียวมี Tabs สลับ ก่อนแยกจริงตามที่
                                            // user ขอ — ดู docblock ของ MarketplaceAttributeMappingController)
                                            // อยู่ใต้ /catalog/marketplace/ ไม่ใช่ /catalog/attributes/ — ไม่งั้น
                                            // เมนู "แอตทริบิวต์" จะโดน highlight ผิดไปด้วย (ดูคอมเมนต์ที่
                                            // routes/catalog.php ตรง route กลุ่มนี้)
                                            {
                                                title: t('mapPushData'),
                                                url: `/catalog/marketplace/${platform}/attribute-mapping`,
                                                permission: 'attributes.edit_attributes',
                                            },
                                        ],
                                    })),
                                ],
                            },
                        ],
                    },
                    {
                        title: t('attributes'),
                        items: [
                            {
                                title: t('attributes'),
                                url: '/catalog/attributes',
                                permission: 'attributes.list_attributes',
                            },
                            {
                                title: t('attributeGroups'),
                                url: '/catalog/attributeGroups',
                                permission: 'attribute_groups.list_attribute_groups',
                            },
                            {
                                title: t('attributeFamilies'),
                                url: '/catalog/attributeFamilies',
                                permission: 'attribute_families.list_attribute_families',
                            },
                        ],
                    },
                    {
                        title: t('management'),
                        items: [
                            {
                                // No single permission gates this hub — it's a
                                // launcher for missing-translations + the
                                // Categories/Brands marketplace-sync pages, each
                                // behind its own permission, and the page itself
                                // hides whichever tiles the user can't reach.
                                // Gating this entry on products.list_products
                                // keeps it visible for the same audience as the
                                // rest of the Catalog section rather than
                                // requiring a brand-new "management" permission
                                // resource just for a link list.
                                title: t('management'),
                                url: '/catalog/management',
                                permission: 'products.list_products',
                                // Neither of these has its own sidebar/tab entry
                                // (product-translations is a Management-hub card;
                                // marketplace-sync is only reachable via the
                                // back-link on each platform's มาสเตอร์ > มาร์เก็ตเพลส
                                // > {platform} mapping page now) — without this,
                                // visiting one directly leaves no sidebar item
                                // matching its URL, so findActiveGroup falls back
                                // to Dashboard and the whole secondary sidebar
                                // collapses instead of staying on "จัดการ".
                                matchUrls: [
                                    '/catalog/product-translations',
                                    '/catalog/categories/marketplace-sync',
                                ],
                            },
                        ],
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
        ],
        [t],
    );
}

// Nav items only list each section's top-level URL (e.g. /catalog/products)
// — an exact-equality match against the page URL would never match a nested
// detail page (/catalog/products/33/edit, /catalog/products/create, ?query
// strings, ...). Match by path prefix instead (with a '/' boundary so
// /catalog/products doesn't also match an unrelated /catalog/productsX).
function findActiveGroup(items: NavItem[], pageUrl: string): NavItem | null {
    const currentPath = pageUrl.split('?')[0];
    const matchesCurrentPath = (url?: string) => !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));

    // Recurses through any depth of nesting (e.g. Catalog > "หมวดหมู่" group >
    // its leaf links) rather than checking just one level down — the
    // Catalog section's items are themselves label-only groups with no url
    // of their own since the sidebar restructure, so a one-level check here
    // would never find a match and Catalog would stop highlighting as the
    // active primary-nav section.
    const matchesItem = (item: NavItem): boolean =>
        matchesCurrentPath(item.url) || (item.matchUrls ?? []).some(matchesCurrentPath) || (item.items ?? []).some(matchesItem);

    return items.find(matchesItem) || items[0] || null;
}

export function AppSidebar() {
    const { isMobile, openMobile, setOpenMobile, state, setOpen } = useSidebar();
    const page = usePage();
    const { auth } = usePage<SharedData>().props;
    const { resolved } = useResolvedAppearance();
    // SAP Fiori's SideNavigation follows the app's light/dark appearance
    // toggle like the rest of the Fiori-themed UI — FIORI.surface below is a
    // CSS-var token that already resolves to the right shade for `resolved`.
    const sidebarTheme = useMemo(() => getTheme(resolved), [resolved]);
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
            const updatedGroup = filteredMainNavItems.find((item) => item.icon === selectedGroup.icon);
            if (updatedGroup) {
                setSelectedGroup(updatedGroup);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredMainNavItems]);

    const hasSubmenus = selectedGroup && selectedGroup.items && selectedGroup.items.length > 0;
    const width = collapsed ? SIDEBAR_WIDTH_ICON : hasSubmenus ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON;

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
                    borderColor: FIORI.border,
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
                <Divider sx={{ alignSelf: 'stretch', borderColor: FIORI.border }} />
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
                    bgcolor: FIORI.surface,
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
                            fontWeight: 600,
                            fontSize: '1.05rem',
                            color: FIORI.textPrimary,
                        }}
                    >
                        PIM PK
                    </Typography>
                </Toolbar>
                <Divider sx={{ borderColor: FIORI.border }} />
                <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {selectedGroup && <NavSecondary title={selectedGroup.title} items={selectedGroup.items ?? []} />}
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
                    sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, backgroundColor: FIORI.surface } }}
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
                        boxShadow: 'none',
                        borderRight: `1px solid ${FIORI.border}`,
                        backgroundColor: FIORI.surface,
                        transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
                    },
                }}
            >
                {content}
            </Drawer>
        </ThemeProvider>
    );
}
