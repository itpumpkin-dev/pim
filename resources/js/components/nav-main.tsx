import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Tooltip } from '@mui/material';

export function NavMain({ items = [], collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
    const page = usePage();

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
                const isActive = item.url === page.url;
                const button = (
                    <ListItemButton
                        key={item.title}
                        component={Link}
                        href={item.url}
                        prefetch
                        selected={isActive}
                        sx={{
                            borderRadius: 1,
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            px: collapsed ? 1 : 2,
                        }}
                    >
                        {item.icon && (
                            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                                <item.icon fontSize="small" />
                            </ListItemIcon>
                        )}
                        {!collapsed && <ListItemText primary={item.title} />}
                    </ListItemButton>
                );

                return collapsed ? (
                    <Tooltip key={item.title} title={item.title} placement="right">
                        {button}
                    </Tooltip>
                ) : (
                    button
                );
            })}
        </List>
    );
}
