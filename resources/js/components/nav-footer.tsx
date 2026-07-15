import { type NavItem } from '@/types';
import { List, ListItemButton, ListItemIcon, ListItemText, Tooltip } from '@mui/material';

export function NavFooter({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
    return (
        <List dense sx={{ px: 1 }}>
            {items.map((item) => {
                const button = (
                    <ListItemButton
                        key={item.title}
                        component="a"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            borderRadius: 1,
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            px: collapsed ? 1 : 2,
                            color: 'text.secondary',
                        }}
                    >
                        {item.icon && (
                            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center', color: 'inherit' }}>
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
