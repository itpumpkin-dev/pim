import { useMemo, useState } from 'react';
import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Box, Collapse, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';

// AdminLTE "solid" active style: the active nav-link gets a full accent-color
// background instead of a soft tint, matching AdminLTE's Primary nav scheme.
const activeSx = {
    bgcolor: 'primary.main',
    color: '#fff',
    '& .MuiListItemIcon-root': { color: '#fff' },
    '&:hover': { bgcolor: 'primary.dark' },
};

const hoverSx = {
    '&:hover': { bgcolor: 'action.hover' },
};

export function NavMain({ items = [], collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
    const page = usePage();
    const { t } = useTranslation('nav');

    const defaultOpenItems = useMemo(() => {
        const open: Record<string, boolean> = {};
        items.forEach((item) => {
            if (item.items?.some((sub) => sub.url === page.url)) {
                open[item.title] = true;
            }
        });
        return open;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [openItems, setOpenItems] = useState<Record<string, boolean>>(defaultOpenItems);

    const handleToggle = (title: string) => {
        setOpenItems((prev) => ({ ...prev, [title]: !prev[title] }));
    };

    return (
        <List
            dense
            sx={{ px: 1 }}
            subheader={
                !collapsed ? (
                    <ListSubheader
                        component="div"
                        sx={{
                            lineHeight: '32px',
                            bgcolor: 'transparent',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            color: 'text.disabled',
                        }}
                    >
                        {t('mainNavigation')}
                    </ListSubheader>
                ) : undefined
            }
        >
            {items.map((item) => {
                const hasChildren = item.items && item.items.length > 0;
                const isActive = item.url ? item.url === page.url : false;
                const isGroupActive = item.items?.some((sub) => sub.url === page.url) ?? false;
                const isOpen = !!openItems[item.title];

                const button = (
                    <ListItemButton
                        key={item.title}
                        component={item.url ? Link : 'div'}
                        href={item.url as any}
                        selected={isActive}
                        onClick={hasChildren ? () => handleToggle(item.title) : undefined}
                        sx={{
                            borderRadius: 1.5,
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            px: collapsed ? 1 : 2,
                            py: 0.75,
                            ...(isActive ? activeSx : hoverSx),
                            ...(isGroupActive &&
                                !isActive && {
                                    bgcolor: 'action.selected',
                                    color: 'text.primary',
                                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                                }),
                        }}
                    >
                        {item.icon && (
                            <ListItemIcon
                                sx={{
                                    minWidth: collapsed ? 0 : 36,
                                    justifyContent: 'center',
                                    color: isActive ? '#fff' : isGroupActive ? 'primary.main' : 'text.secondary',
                                }}
                            >
                                <item.icon fontSize="small" />
                            </ListItemIcon>
                        )}
                        {!collapsed && (
                            <ListItemText
                                primary={item.title}
                                sx={{
                                    '& .MuiTypography-root': {
                                        fontWeight: isActive ? 600 : hasChildren ? 600 : 500,
                                        fontSize: hasChildren ? '1rem' : '1rem',
                                    },
                                }}
                            />
                        )}
                        {!collapsed && hasChildren && (
                            <ExpandMoreIcon
                                fontSize="small"
                                sx={{
                                    color: 'text.disabled',
                                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: (theme) => theme.transitions.create('transform', { duration: theme.transitions.duration.shortest }),
                                }}
                            />
                        )}
                    </ListItemButton>
                );

                const itemContent = collapsed ? (
                    <Tooltip key={item.title} title={item.title} placement="right">
                        {button}
                    </Tooltip>
                ) : (
                    button
                );

                if (hasChildren && !collapsed) {
                    return (
                        <Box key={item.title} sx={{ mb: 0.5 }}>
                            {itemContent}
                            <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                <List
                                    component="div"
                                    disablePadding
                                    sx={{
                                        ml: '33px',
                                        pl: '18px',
                                        borderLeft: '1px solid',
                                        borderColor: 'divider',
                                        my: 0.25,
                                    }}
                                >
                                    {item.items!.map((subItem) => {
                                        const isSubActive = subItem.url === page.url;
                                        return (
                                            <ListItemButton
                                                key={subItem.title}
                                                component={subItem.url ? Link : 'div'}
                                                href={subItem.url as any}
                                                selected={isSubActive}
                                                sx={{
                                                    borderRadius: 1.5,
                                                    px: 1.5,
                                                    py: 0.625,
                                                    mb: 0.25,
                                                    ...(isSubActive ? activeSx : hoverSx),
                                                }}
                                            >
                                                {subItem.icon && (
                                                    <ListItemIcon sx={{ minWidth: 32, color: isSubActive ? '#fff' : 'text.secondary' }}>
                                                        <subItem.icon fontSize="small" />
                                                    </ListItemIcon>
                                                )}
                                                <ListItemText
                                                    primary={subItem.title}
                                                    sx={{
                                                        '& .MuiTypography-root': {
                                                            fontSize: '0.9rem',
                                                            fontWeight: isSubActive ? 600 : 400,
                                                            color: isSubActive ? '#fff' : 'text.secondary',
                                                        },
                                                    }}
                                                />
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            </Collapse>
                        </Box>
                    );
                }

                return (
                    <Box key={item.title} sx={{ mb: 0.5 }}>
                        {itemContent}
                    </Box>
                );
            })}
        </List>
    );
}
