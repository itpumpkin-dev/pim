import { type NavItem } from '@/types';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsIcon from '@mui/icons-material/Settings';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The full sidebar nav tree (unfiltered by permission) — moved out of
 * app-sidebar.tsx so resources/js/components/shell-search.tsx can build its
 * "App suggestions" (jump straight to a menu page) from the exact same data
 * the sidebar itself renders, instead of maintaining a second copy of this
 * tree that would drift out of sync with it.
 */
export function useMainNavItems(): NavItem[] {
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
                                // ไม่ใช่แค่ item เฉยๆ — group นี้มีลูกตัวเดียวชื่อซ้ำกับตัวเอง
                                // เลยโดน unwrap() ใน nav-secondary.tsx ยุบทิ้ง เหลือแค่ item
                                // ตัวในนี้ตัวเดียวที่ render จริงที่ depth 0 — iconName เลย
                                // ต้องมาอยู่ตรงนี้ ไม่ใช่ที่ wrapper ข้างบน (ซึ่งจะถูกทิ้งไป)
                                iconName: 'navProduct',
                            },
                        ],
                    },
                    {
                        title: t('master'),
                        // group นี้มีลูกหลายตัว (ไม่ได้โดน unwrap()) เลยยัง render เป็น
                        // node ของตัวเองที่ depth 0 จริงๆ — iconName ใส่ตรงนี้ได้เลย
                        iconName: 'navMaster',
                        items: [
                            {
                                title: t('categories'),
                                url: '/catalog/categories',
                                permission: 'categories.list_categories',
                                // Otherwise these prefix-match this item too
                                // (they're routed under the Categories CRUD
                                // prefix) and both this item and the relevant
                                // มาร์เก็ตเพลส/จัดการ item would highlight as
                                // active at once — the per-platform mapping
                                // pages belong to มาสเตอร์ > มาร์เก็ตเพลส >
                                // {platform} now (its matchUrls claims them),
                                // marketplace-sync still belongs to จัดการ.
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
                            // {
                            //     title: t('rawMaterials'),
                            //     url: '/catalog/raw-materials',
                            //     permission: 'raw_materials.list_raw_materials',
                            // },
                            {
                                title: t('bom'),
                                url: '/catalog/bom',
                                permission: 'bom.list_bom',
                            },
                            {
                                title: t('businessTypes'),
                                url: '/catalog/business-types',
                                permission: 'business_types.list_business_types',
                            },
                            {
                                title: t('productGrades'),
                                url: '/catalog/product-grades',
                                permission: 'product_grades.list_product_grades',
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
                                // แต่ก่อนซ้อน 2 ชั้น (มาร์เก็ตเพลส > การเชื่อมต่อ [4 แพลตฟอร์ม] +
                                // มาร์เก็ตเพลส > {แพลตฟอร์ม} > [จับคู่หมวดหมู่, จับคู่ข้อมูลส่ง])
                                // ตอนนี้แบนราบเหลือแค่ มาร์เก็ตเพลส > {แพลตฟอร์ม} ตรงๆ แต่ละอันพาไป
                                // หน้า hub ของแพลตฟอร์มนั้น (resources/js/pages/catalog/marketplace/
                                // platform-hub.tsx) ที่โชว์การ์ดทั้ง 3 อัน (จับคู่หมวดหมู่/จับคู่
                                // ข้อมูลส่ง/ตั้งค่าการเชื่อมต่อ) พร้อมกันในที่เดียว แทนที่จะต้องไล่
                                // เปิดเมนูย่อยทีละชั้น — สิทธิ์เข้าถึงแต่ละการ์ดยังเช็คที่หน้า
                                // ปลายทางเหมือนเดิม (การ์ดจะซ่อนเองถ้าไม่มีสิทธิ์) เข้าหน้า hub เองได้
                                // เสมอ (ไม่มีสิทธิ์เฉพาะของหน้า hub — เหมือนกับที่ marketplace/
                                // connect/{platform} เดิมก็ไม่มีสิทธิ์เฉพาะของตัวเองเช่นกัน)
                                title: t('marketplace'),
                                items: (['shopee', 'lazada', 'tiktok', 'woocommerce'] as const).map((platform) => ({
                                    title: platform === 'woocommerce' ? 'WooCommerce' : platform.charAt(0).toUpperCase() + platform.slice(1),
                                    url: `/catalog/marketplace/${platform}`,
                                    permission: 'products.list_products',
                                    // การ์ดบนหน้า hub พาไปหน้าจริงที่ไม่ได้อยู่ใต้
                                    // /catalog/marketplace/{platform}/ ทุกอัน (เช่น หน้าจับคู่
                                    // หมวดหมู่อยู่คนละ path เลย) — ต้องระบุ matchUrls ตรงๆ ไม่งั้น
                                    // เปิดจากการ์ดแล้วเมนู "มาร์เก็ตเพลส" นี้จะไม่ไฮไลต์ (เหมือน
                                    // ปัญหาเดียวกับที่หน้า "จัดการ" เจอมาก่อน — ดูคอมเมนต์ที่นั่น)
                                    matchUrls: [
                                        `/catalog/categories/${platform}-mapping`,
                                        `/catalog/marketplace/${platform}/attribute-mapping`,
                                        `/catalog/marketplace/connect/${platform}`,
                                    ],
                                })),
                            },
                        ],
                    },
                    {
                        title: t('attributes'),
                        // 3 ลูก ไม่โดน unwrap() (ดูคอมเมนต์ที่ "หมวดหมู่หลัก" ด้านบน) —
                        // ยัง render เป็น node ของตัวเองที่ depth 0 จริง
                        iconName: 'navAttributes',
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
                                // ลูกตัวเดียวชื่อซ้ำ wrapper — โดน unwrap() เหมือน "สินค้า"
                                // ด้านบน iconName เลยต้องมาอยู่ตรงนี้แทน
                                iconName: 'navManagement',
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
                        iconName: 'navImport',
                    },
                    {
                        title: t('exports'),
                        url: '/import-export/exports',
                        permission: 'export_configs.list_export_configs',
                        iconName: 'navExport',
                    },
                    {
                        title: t('jobTracker'),
                        url: '/import-export/jobs',
                        permission: 'job_trackers.list_job_trackers',
                        iconName: 'navJobTracker',
                    },
                    {
                        title: t('wooConvert'),
                        url: '/import-export/woo-convert',
                        permission: 'woo_conversions.list_woo_conversions',
                        iconName: 'navWooConvert',
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
                        iconName: 'navChannels',
                    },
                    {
                        title: t('users'),
                        url: '/system/user',
                        permission: 'users.list_users',
                        iconName: 'navUsers',
                    },
                    {
                        title: t('userGroups'),
                        url: '/system/userGroup',
                        permission: 'user_groups.list_user_groups',
                        iconName: 'navUserGroups',
                    },
                    {
                        title: t('departments'),
                        url: '/system/department',
                        permission: 'departments.list_departments',
                        iconName: 'navDepartments',
                    },
                    {
                        title: t('jobPositions'),
                        url: '/system/jobPosition',
                        permission: 'job_positions.list_job_positions',
                        iconName: 'navJobPositions',
                    },
                    {
                        title: t('roles'),
                        url: '/system/roles',
                        permission: 'roles.list_roles',
                        iconName: 'navRoles',
                    },
                    {
                        title: t('locales'),
                        url: '/system/locales',
                        permission: 'locales.list_locales',
                        iconName: 'navLocales',
                    },
                    {
                        title: t('translationProviders'),
                        url: '/system/translationProviders',
                        permission: 'translation_providers.list_translation_providers',
                        iconName: 'navTranslationProviders',
                    },
                    {
                        title: t('activityLogs'),
                        url: '/system/activity-logs',
                        permission: 'activity_logs.list_activity_logs',
                        iconName: 'navActivityLogs',
                    },
                ],
            },
        ],
        [t],
    );
}

/**
 * Same permission filter AppSidebar's `filteredMainNavItems` applies — pulled
 * out so shell-search.tsx's "App suggestions" only ever offer pages the
 * viewer can actually reach (it never renders a page it filtered out).
 */
export function filterNavItemsByPermission(items: NavItem[], permissions: string[]): NavItem[] {
    return items
        .filter((item) => !item.permission || permissions.includes(item.permission))
        .map((item) => ({
            ...item,
            items: item.items ? filterNavItemsByPermission(item.items, permissions) : undefined,
        }))
        .filter((item) => !item.items || item.items.length > 0);
}

/** One reachable page, flattened out of the nav tree for shell-search.tsx. */
export interface FlatNavItem {
    title: string;
    url: string;
    /** breadcrumb of the group titles above this page, e.g. ["Catalog", "Master"] */
    path: string[];
}

/**
 * Flattens the (already permission-filtered) nav tree down to just its leaf
 * pages (nodes with a `url`) — group-only nodes (Catalog, Master, ...) don't
 * have a page of their own to jump to, so they're dropped, but their titles
 * still ride along as each leaf's `path` for the suggestion list to show
 * ("หมวดหมู่ — Catalog > Master").
 */
export function flattenNavItems(items: NavItem[], path: string[] = []): FlatNavItem[] {
    return items.flatMap((item) => {
        const children = item.items ?? [];
        if (children.length === 0) {
            return item.url ? [{ title: item.title, url: item.url, path }] : [];
        }
        return flattenNavItems(children, [...path, item.title]);
    });
}
