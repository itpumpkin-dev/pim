import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Box, Tooltip, ButtonBase } from '@mui/material';
import { FIORI } from '@/lib/fiori-style';

interface NavPrimaryProps {
    items: NavItem[];
    activeTitle: string | null;
    onSelect: (item: NavItem) => void;
    /** Fiori collapsed-mode flyout — parent only acts on this while the rail is collapsed (see app-sidebar.tsx). No-op prop is fine while expanded. */
    onHoverItem?: (item: NavItem) => void;
}

export function NavPrimary({ items, activeTitle, onSelect, onHoverItem }: NavPrimaryProps) {
    return (
        <Box
            sx={{
                width: 70,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 1.5,
                gap: 0.5,
            }}
        >
            {items.map((item) => {
                const Icon = item.icon;
                if (!Icon) return null;

                const isActive = activeTitle === item.title;

                const buttonContent = (
                    <ButtonBase
                        onClick={() => onSelect(item)}
                        onMouseEnter={() => onHoverItem?.(item)}
                        onFocus={() => onHoverItem?.(item)}
                        aria-current={isActive ? 'page' : undefined}
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            transition: 'background-color 0.15s ease, color 0.15s ease',
                            color: isActive ? FIORI.brand : FIORI.textSecondary,
                            bgcolor: isActive ? FIORI.selected : 'transparent',
                            '&:hover': {
                                bgcolor: isActive ? FIORI.selected : FIORI.hover,
                                color: isActive ? FIORI.brand : FIORI.textPrimary,
                            },
                        }}
                    >
                        {/* Fiori active-item left accent bar */}
                        {isActive && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 0,
                                    width: 3,
                                    height: 22,
                                    borderRadius: '0 3px 3px 0',
                                    bgcolor: FIORI.brand,
                                }}
                            />
                        )}
                        <Icon sx={{ fontSize: '1.375rem' }} />
                    </ButtonBase>
                );

                const wrapped = item.url ? (
                    <Box key={item.title} component={Link} href={item.url} sx={{ display: 'block', textDecoration: 'none' }}>
                        {buttonContent}
                    </Box>
                ) : (
                    <Box key={item.title} sx={{ display: 'block' }}>
                        {buttonContent}
                    </Box>
                );

                // ตัวที่มี children จะโชว์ flyout panel อยู่แล้ว (มี title เป็นหัวข้อ
                // panel ให้เห็นชัดๆ) — ไม่ต้องมี tooltip ข้อความเดิมซ้อนขึ้นมาอีกชั้น
                // เหลือ tooltip ไว้แค่ตัวที่ไม่มี children (ไม่มี flyout ให้เลย เช่น
                // Dashboard) ที่ยังต้องพึ่ง tooltip เป็นทางเดียวที่บอกชื่อได้
                if (item.items && item.items.length > 0) {
                    return wrapped;
                }

                return (
                    <Tooltip key={item.title} title={item.title} placement="right" arrow enterDelay={200}>
                        {wrapped}
                    </Tooltip>
                );
            })}
        </Box>
    );
}
