import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Box, Tooltip, ButtonBase } from '@mui/material';
import { FIORI } from '@/lib/fiori-style';

interface NavPrimaryProps {
    items: NavItem[];
    activeTitle: string | null;
    onSelect: (item: NavItem) => void;
}

export function NavPrimary({ items, activeTitle, onSelect }: NavPrimaryProps) {
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

                return (
                    <Tooltip key={item.title} title={item.title} placement="right" arrow enterDelay={200}>
                        {item.url ? (
                            <Box component={Link} href={item.url} sx={{ display: 'block', textDecoration: 'none' }}>
                                {buttonContent}
                            </Box>
                        ) : (
                            <Box sx={{ display: 'block' }}>{buttonContent}</Box>
                        )}
                    </Tooltip>
                );
            })}
        </Box>
    );
}
