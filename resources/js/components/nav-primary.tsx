import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Box, Tooltip, ButtonBase } from '@mui/material';

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
                py: 2,
                gap: 2,
                borderRight: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
        >
            {items.map((item) => {
                const Icon = item.icon;
                if (!Icon) return null;

                const isActive = activeTitle === item.title;

                const buttonContent = (
                    <ButtonBase
                        onClick={() => onSelect(item)}
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            transition: 'all 0.2s ease-in-out',
                            color: isActive ? 'primary.main' : 'rgba(255, 255, 255, 0.7)',
                            bgcolor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            '&:hover': {
                                bgcolor: 'rgba(255, 255, 255, 0.05)',
                                color: '#fff',
                            },
                        }}
                    >
                        {/* Active Left Indicator Bar */}
                        {isActive && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 0,
                                    width: 3,
                                    height: 20,
                                    borderRadius: '0 4px 4px 0',
                                    bgcolor: 'primary.main',
                                }}
                            />
                        )}
                        <Icon sx={{ fontSize: '1.4rem' }} />
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
