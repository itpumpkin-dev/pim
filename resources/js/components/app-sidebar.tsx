import { NavPrimary } from '@/components/nav-primary';
import { NavSecondary } from '@/components/nav-secondary';
import { useResolvedAppearance } from '@/hooks/use-appearance';
import { filterNavItemsByPermission, useMainNavItems } from '@/hooks/use-nav-items';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, useSidebar } from '@/hooks/use-sidebar';
import { FIORI } from '@/lib/fiori-style';
import { getTheme } from '@/theme';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Box, Divider, Drawer, ThemeProvider, Toolbar, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppLogo from './app-logo';

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
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
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
    const filteredMainNavItems = useMemo(
        () => filterNavItemsByPermission(mainNavItems, auth.permissions),
        [mainNavItems, auth.permissions],
    );

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

    // Fiori Side Navigation's real "collapsed" behaviour: an icon-only rail
    // that reveals a floating flyout of the hovered group's items *without*
    // pushing the rail itself back open — this used to instead call
    // setOpen(true) on click, permanently re-expanding the whole sidebar,
    // which isn't how Fiori's collapsed rail behaves at all. flyoutGroup is
    // only ever meaningful while collapsed (see the render guards below) —
    // no need to reset it on expand/collapse toggles since AppSidebar fully
    // remounts every navigation anyway (see the lazy-init comment above).
    const [flyoutGroup, setFlyoutGroup] = useState<NavItem | null>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearFlyoutCloseTimer = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };
    // Small grace delay (not an immediate close) so moving the mouse
    // diagonally from a rail icon toward the flyout panel itself doesn't
    // slam it shut mid-transit — standard flyout-menu hover-intent pattern.
    const scheduleFlyoutClose = () => {
        clearFlyoutCloseTimer();
        closeTimerRef.current = setTimeout(() => setFlyoutGroup(null), 150);
    };
    const openFlyout = (item: NavItem) => {
        clearFlyoutCloseTimer();
        setFlyoutGroup(item.items && item.items.length > 0 ? item : null);
    };

    useEffect(() => clearFlyoutCloseTimer, []);

    // Shared by the docked secondary panel (expanded state) and the
    // collapsed-state flyout overlay below — same title/list, just a
    // different container around it.
    const renderSecondaryPanelContent = (group: NavItem | null) => (
        <>
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
                {group && <NavSecondary title={group.title} items={group.items ?? []} />}
            </Box>
        </>
    );

    const content = (
        <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Primary Sidebar (Narrow Left Column) */}
            <Box
                onMouseLeave={collapsed ? scheduleFlyoutClose : undefined}
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
                        // "Active" หมายถึง section ที่กำลังอยู่จริง (ตาม URL ปัจจุบัน) — คงที่
                        // เสมอ ไม่ผูกกับ flyoutGroup (สถานะแค่ตอน hover/focus ชั่วคราว)
                        // ไม่งั้นแค่ hover ไอคอนอื่นเฉยๆ ระหว่าง collapsed จะไปแย่ง highlight
                        // จาก section ที่ผู้ใช้อยู่จริง แล้วพอเลิก hover ก็จะไม่มีอะไร active
                        // เลยสักตัว — hover ของแต่ละไอคอนมี :hover state ของตัวเองอยู่แล้วพอ
                        activeTitle={selectedGroup?.title ?? null}
                        onSelect={(item) => {
                            setSelectedGroup(item);
                            // ปุ่ม/แตะ (ไม่ใช่แค่ hover) ก็เปิด flyout ได้เหมือนกัน — สำคัญ
                            // สำหรับ touch/keyboard ที่ไม่มี hover ให้ใช้ ไม่ re-expand
                            // sidebar ทั้งแถบแบบเดิมอีกต่อไป (ไม่ใช่พฤติกรรมของ Fiori
                            // collapsed rail จริงๆ — ดูคอมเมนต์ flyoutGroup ด้านบน)
                            if (collapsed) {
                                openFlyout(item);
                            }
                        }}
                        onHoverItem={collapsed ? openFlyout : undefined}
                    />
                </Box>
            </Box>

            {/* Secondary Sidebar (Wider Right Column) — docked in-flow only
            while expanded; while collapsed this stays width:0 and the
            flyout overlay below (position: fixed) takes over on hover */}
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
                {renderSecondaryPanelContent(selectedGroup)}
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

            {/* Fiori collapsed-rail flyout — position:fixed (not inside the
            Drawer's own paper, which clips at SIDEBAR_WIDTH_ICON while
            collapsed) so it floats OVER page content instead of pushing it,
            anchored right at the rail's edge. Only ever mounted while
            collapsed + hovering/focusing a rail item with children. */}
            {collapsed && flyoutGroup && (
                <Box
                    onMouseEnter={clearFlyoutCloseTimer}
                    onMouseLeave={scheduleFlyoutClose}
                    sx={{
                        position: 'fixed',
                        top: 0,
                        left: SIDEBAR_WIDTH_ICON,
                        height: '100vh',
                        width: SIDEBAR_WIDTH - SIDEBAR_WIDTH_ICON,
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: FIORI.surface,
                        borderRight: `1px solid ${FIORI.border}`,
                        // ลอยเหนือเนื้อหาหน้า (ไม่ได้ดันเนื้อหา) เลยต้องมีเงาให้รู้สึกว่า
                        // "ลอย" อยู่จริง ต่างจากแผงที่ docked ในโหมด expanded ที่ไม่ต้องมี
                        boxShadow: '2px 0 10px rgba(0,0,0,0.18)',
                        zIndex: (theme) => theme.zIndex.drawer + 1,
                    }}
                >
                    {renderSecondaryPanelContent(flyoutGroup)}
                </Box>
            )}
        </ThemeProvider>
    );
}
