import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Icon } from '@/components/icon';
import LocaleDropdown from '@/components/locale-dropdown';
import { NavUser } from '@/components/nav-user';
import { useSidebar } from '@/hooks/use-sidebar';
import { getFioriShell } from '@/theme';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, Divider, IconButton, InputBase, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AppSidebarHeaderProps {
    breadcrumbs?: BreadcrumbItemType[];
    actions?: ReactNode;
    /**
     * Fiori Shell Bar has a search field in its right region. It only
     * renders when a handler is supplied — no global search backend means
     * no empty search box shipped by default.
     */
    onSearch?: (query: string) => void;
    searchPlaceholder?: string;
}

export function AppSidebarHeader({ breadcrumbs = [], actions, onSearch, searchPlaceholder }: AppSidebarHeaderProps) {
    const { toggleSidebar } = useSidebar();
    const { t } = useTranslation('common');
    const theme = useTheme();
    const shell = getFioriShell(theme.palette.mode);

    // md+ shows the search as an always-open pill; below that it collapses
    // to a magnifier button that expands on tap (Horizon shell-bar behaviour).
    const isCompact = useMediaQuery(theme.breakpoints.down('md'));
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const showSearchField = Boolean(onSearch) && (!isCompact || searchOpen);

    useEffect(() => {
        if (showSearchField && isCompact) {
            searchInputRef.current?.focus();
        }
    }, [showSearchField, isCompact]);

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        onSearch?.(query.trim());
    };

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
                {onSearch &&
                    (showSearchField ? (
                        <Box
                            component="form"
                            role="search"
                            onSubmit={submitSearch}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                height: 32,
                                pl: 1,
                                pr: 0.5,
                                width: { xs: 200, md: 260 },
                                bgcolor: shell.searchBg,
                                border: `1px solid ${shell.searchBorder}`,
                                borderRadius: `${shell.borderRadius}px`,
                                '&:focus-within': { borderColor: shell.interactiveColor },
                            }}
                        >
                            <InputBase
                                inputRef={searchInputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onBlur={() => isCompact && !query && setSearchOpen(false)}
                                placeholder={searchPlaceholder ?? t('search')}
                                sx={{ flex: 1, fontSize: 14, color: shell.textColor }}
                            />
                            <IconButton type="submit" aria-label={t('search')} sx={{ ...shellIconSx, width: 28, height: 28 }}>
                                <Icon name="search" sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Box>
                    ) : (
                        <Tooltip title={t('search')}>
                            <IconButton aria-label={t('search')} onClick={() => setSearchOpen(true)} sx={shellIconSx}>
                                <Icon name="search" sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    ))}

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
