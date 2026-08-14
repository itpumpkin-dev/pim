import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Box, List, ListItemButton, ListItemText, Typography } from '@mui/material';

interface NavSecondaryProps {
    title: string;
    items: NavItem[];
}

export function NavSecondary({ title, items }: NavSecondaryProps) {
    const page = usePage();

    // Same reasoning as app-sidebar.tsx's currentPath matching: item.url only
    // ever holds a section's top-level URL (e.g. /catalog/products), so exact
    // equality against page.url never matches a nested detail page
    // (/catalog/products/33/edit, ?query strings, ...) and nothing ever
    // highlights as active once you're inside a list item.
    const currentPath = page.url.split('?')[0];

    return (
        <Box sx={{ width: 200, height: '100%', py: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography
                variant="subtitle2"
                sx={{
                    px: 3,
                    mb: 2,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.75rem',
                }}
            >
                {title}
            </Typography>
            <List dense sx={{ px: 1.5, flex: 1, overflowY: 'auto' }}>
                {items.map((item) => {
                    const matches = (url?: string) => !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));
                    const isActive = matches(item.url) || (item.matchUrls ?? []).some(matches);

                    return (
                        <ListItemButton
                            // item.url (a route path) is guaranteed unique among
                            // sibling items; item.title is a translated display
                            // string and isn't — under zh, "Categories" and
                            // "Category Fields" both render as "类别", so keying
                            // on title collided and React logged duplicate-key
                            // warnings (and could misattribute item identity
                            // across updates). Every leaf item here always has
                            // a url; the title fallback only guards the type.
                            key={item.url ?? item.title}
                            component={item.url ? Link : 'div'}
                            href={item.url as any}
                            selected={isActive}
                            sx={{
                                borderRadius: '8px',
                                px: 2,
                                py: 0.8,
                                mb: 0.5,
                                transition: 'all 0.15s ease-in-out',
                                color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                                bgcolor: isActive ? 'primary.main' : 'transparent',
                                '&:hover': {
                                    bgcolor: isActive ? 'primary.dark' : 'rgba(255, 255, 255, 0.05)',
                                    color: '#fff',
                                },
                                '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    color: '#fff',
                                    '&:hover': {
                                        bgcolor: 'primary.dark',
                                    },
                                },
                            }}
                        >
                            <ListItemText
                                primary={item.title}
                                sx={{
                                    m: 0,
                                    '& .MuiTypography-root': {
                                        fontSize: '0.9rem',
                                        fontWeight: isActive ? 600 : 500,
                                    },
                                }}
                            />
                        </ListItemButton>
                    );
                })}
            </List>
        </Box>
    );
}
