import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { Breadcrumbs } from '@/components/breadcrumbs';
import LocaleDropdown from '@/components/locale-dropdown';
import { NavUser } from '@/components/nav-user';
import { ShellSearch } from '@/components/shell-search';
import { useSidebar } from '@/hooks/use-sidebar';
import { getFioriShell } from '@/theme';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, Divider, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AppSidebarHeaderProps {
    breadcrumbs?: BreadcrumbItemType[];
    actions?: ReactNode;
}

export function AppSidebarHeader({ breadcrumbs = [], actions }: AppSidebarHeaderProps) {
    const { toggleSidebar } = useSidebar();
    const { t } = useTranslation('common');
    const theme = useTheme();
    const shell = getFioriShell(theme.palette.mode);

    // md+ shows the search as an always-open pill; below that it collapses
    // to a magnifier button that expands on tap (Horizon shell-bar behaviour)
    // — ShellSearch owns the collapse/expand state itself, this just tells
    // it which mode to render.
    const isCompact = useMediaQuery(theme.breakpoints.down('md'));

    const shellIconSx = {
        width: 36,
        height: 36,
        borderRadius: `${shell.borderRadius}px`,
        color: shell.textColor,
        '&:hover': { bgcolor: shell.hoverBg },
        '&:active': { bgcolor: shell.activeBg },
    } as const;

    return (
        <Box
            component="header"
            sx={{
                position: 'sticky',
                top: 0,
                zIndex: theme.zIndex.appBar,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                height: shell.height,
                minHeight: shell.height,
                px: { xs: 1, sm: 1.5 },
                bgcolor: shell.color,
                color: shell.textColor,
                boxShadow: shell.shadow,
            }}
        >
            <Tooltip title={t('toggleSidebar')}>
                <IconButton onClick={toggleSidebar} edge="start" aria-label={t('toggleSidebar')} sx={{ ...shellIconSx, ml: -0.5 }}>
                    <MenuIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Tooltip>

            <Divider
                orientation="vertical"
                flexItem
                sx={{ my: 1, mx: 0.5, borderColor: shell.searchBorder, display: { xs: 'none', sm: 'block' } }}
            />

            <Box
                sx={{
                    minWidth: 0,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    // Fiori title area: first crumb reads as the product title.
                    '& .MuiBreadcrumbs-root': { minWidth: 0, overflow: 'hidden' },
                    '& .MuiBreadcrumbs-li:first-of-type': { fontWeight: 600 },
                    // never wrap a crumb by character (Thai has no spaces) — keep
                    // it on one line and ellipsis the overflow instead
                    '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', whiteSpace: 'nowrap' },
                    '& .MuiBreadcrumbs-li': { minWidth: 0, overflow: 'hidden' },
                    '& .MuiBreadcrumbs-li a, & .MuiBreadcrumbs-li p': {
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    },
                    '& .MuiBreadcrumbs-separator': { color: shell.secondaryTextColor, mx: 0.5, flexShrink: 0 },
                    // เส้นทางลิงก์จริงใช้สี interactive ของ shell (คลิกได้ต่างจาก
                    // ข้อความปกติชัดเจน) หน้าปัจจุบัน (ตัวสุดท้าย) ใช้สีเข้มสุด
                    // ส่วน placeholder ("#" — segment ที่ยังไม่มีหน้าให้ไปจริงๆ)
                    // ใช้สีรองแบบเดียวกับ separator เพราะไม่ใช่ทั้งลิงก์และไม่ใช่
                    // หน้าปัจจุบัน (ดู Breadcrumbs component ที่ตัดสินใจว่าอันไหน
                    // render เป็น <a> vs <p>)
                    '& .MuiBreadcrumbs-li a': { color: shell.interactiveColor },
                    '& .MuiBreadcrumbs-li p': { color: shell.secondaryTextColor },
                    '& .MuiBreadcrumbs-li:last-of-type p': { color: shell.textColor },
                    // ปุ่ม "…" ตอน collapse (ดู maxItems ใน Breadcrumbs component)
                    '& .MuiBreadcrumbs-li button': { color: shell.secondaryTextColor, minWidth: 'auto' },
                }}
            >
                <Breadcrumbs breadcrumbs={breadcrumbs} compact={isCompact} />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <ShellSearch shell={shell} isCompact={isCompact} />

                {actions}

                <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ my: 1, mx: 0.5, borderColor: shell.searchBorder, display: { xs: 'none', sm: 'block' } }}
                />

                <LocaleDropdown />
                <AppearanceToggleDropdown />
                <NavUser />
            </Box>
        </Box>
    );
}
