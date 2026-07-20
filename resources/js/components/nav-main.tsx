import { useState } from 'react';
import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Collapse, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Tooltip } from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

export function NavMain({ items = [], collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
    const page = usePage();
    const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

    const handleToggle = (title: string) => {
        setOpenItems((prev) => ({ ...prev, [title]: !prev[title] }));
    };

    return (
        <List
            dense
            sx={{ px: 1 }}
            subheader={
                !collapsed ? (
                    <ListSubheader component="div" sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>
                        {/* Platform */}
                    </ListSubheader>
                ) : undefined
            }
        >
            {items.map((item) => {
                const hasChildren = item.items && item.items.length > 0;
                const isActive = item.url ? item.url === page.url : false;
                const isOpen = openItems[item.title];

                const button = (
                    <ListItemButton
                        key={item.title}
                        component={item.url ? Link : 'div'}
                        href={item.url as any}
                        prefetch={item.url ? true : undefined}
                        selected={isActive}
                        onClick={hasChildren ? () => handleToggle(item.title) : undefined}
                        sx={{
                            borderRadius: 1,
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            px: collapsed ? 1 : 2,
                            ...(isActive && {
                                color: 'primary.main',
                                bgcolor: 'rgba(243, 112, 33, 0.08)',
                                '&:hover': {
                                    bgcolor: 'rgba(243, 112, 33, 0.12)',
                                },
                            }),
                        }}
                    >
                        {item.icon && (
                            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center', color: isActive ? 'inherit' : 'text.secondary' }}>
                                <item.icon fontSize="small" />
                            </ListItemIcon>
                        )}
                        {!collapsed && <ListItemText primary={item.title} sx={{ '& .MuiTypography-root': { fontWeight: isActive ? 600 : 400 } }} />}
                        {!collapsed && hasChildren && (isOpen ? <ExpandLess /> : <ExpandMore />)}
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
                        <div key={item.title}>
                            {itemContent}
                            <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                <List component="div" disablePadding sx={{ pl: 4 }}>
                                    {item.items!.map((subItem) => {
                                        const isSubActive = subItem.url === page.url;
                                        return (
                                            <ListItemButton
                                                key={subItem.title}
                                                component={subItem.url ? Link : 'div'}
                                                href={subItem.url as any}
                                                prefetch={subItem.url ? true : undefined}
                                                selected={isSubActive}
                                                sx={{ 
                                                    borderRadius: 1,
                                                    ...(isSubActive && {
                                                        color: 'primary.main',
                                                        bgcolor: 'rgba(243, 112, 33, 0.08)',
                                                        '&:hover': {
                                                            bgcolor: 'rgba(243, 112, 33, 0.12)',
                                                        },
                                                    }),
                                                }}
                                            >
                                                {subItem.icon && (
                                                    <ListItemIcon sx={{ minWidth: 36, color: isSubActive ? 'inherit' : 'text.secondary' }}>
                                                        <subItem.icon fontSize="small" />
                                                    </ListItemIcon>
                                                )}
                                                <ListItemText primary={subItem.title} sx={{ '& .MuiTypography-root': { fontWeight: isSubActive ? 600 : 400 } }} />
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            </Collapse>
                        </div>
                    );
                }

                return (
                    <div key={item.title}>
                        {itemContent}
                    </div>
                );
            })}
        </List>
    );
}
