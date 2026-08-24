import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Box, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { FIORI } from '@/lib/fiori-style';

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

    const matches = (url?: string) => !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));

    // item.url (a route path) is guaranteed unique among sibling leaf items;
    // item.title is a translated display string and isn't — under zh,
    // "Categories" and "Category Fields" both render as "类别", so keying on
    // title collided and React logged duplicate-key warnings (and could
    // misattribute item identity across updates). Every leaf item here
    // always has a url; the title fallback only guards the type.
    const renderLeaf = (item: NavItem, indented: boolean) => {
        const isOwnUrlActive = matches(item.url) && !(item.excludeUrls ?? []).some(matches);
        const isActive = isOwnUrlActive || (item.matchUrls ?? []).some(matches);

        return (
            <ListItemButton
                key={item.url ?? item.title}
                component={item.url ? Link : 'div'}
                href={item.url as any}
                selected={isActive}
                sx={{
                    borderRadius: '8px',
                    pl: indented ? 3 : 2,
                    pr: 2,
                    py: 0.8,
                    mb: 0.5,
                    transition: 'all 0.15s ease-in-out',
                    color: isActive ? '#fff' : FIORI.textPrimary,
                    bgcolor: isActive ? FIORI.brand : 'transparent',
                    '&:hover': {
                        bgcolor: isActive ? FIORI.brandDark : FIORI.hover,
                        color: isActive ? '#fff' : FIORI.textPrimary,
                    },
                    '&.Mui-selected': {
                        bgcolor: FIORI.brand,
                        color: '#fff',
                        '&:hover': {
                            bgcolor: FIORI.brandDark,
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
    };

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
                    color: FIORI.textSecondary,
                    fontSize: '0.75rem',
                }}
            >
                {title}
            </Typography>
            <List dense sx={{ px: 1.5, flex: 1, overflowY: 'auto' }}>
                {items.map((item, index) => {
                    // A grouped item (e.g. "หมวดหมู่" wrapping the "หมวดหมู่"/
                    // "ฟิลด์หมวดหมู่" links) renders as a section label
                    // followed by its indented children — it has no url of
                    // its own, since NavItem already supports nesting one
                    // level deeper (used for the primary sidebar's own
                    // Dashboard/Catalog/... groups) and reusing that shape
                    // here avoids a second, parallel grouping concept. Plain
                    // leaf items without nested `items` (Import/Export,
                    // System) still render exactly as before.
                    //
                    // A group whose only child repeats the group's own title
                    // (e.g. "สินค้า" > "สินค้า") skips the label entirely and
                    // renders as a single plain leaf instead — every entity
                    // in Catalog got wrapped in its own group for a
                    // consistent data shape, but a header that just restates
                    // the one link below it is pure visual noise, not a real
                    // section.
                    if (item.items && item.items.length === 1 && item.items[0].title === item.title) {
                        return renderLeaf(item.items[0], false);
                    }

                    if (item.items && item.items.length > 0) {
                        return (
                            <Box key={item.title} sx={{ mt: index === 0 ? 0 : 1.5, mb: 0.5 }}>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: 'block',
                                        px: 2,
                                        pb: 0.5,
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        color: FIORI.textSecondary,
                                        fontSize: '0.68rem',
                                    }}
                                >
                                    {item.title}
                                </Typography>
                                {item.items.map((child) => renderLeaf(child, true))}
                            </Box>
                        );
                    }

                    return renderLeaf(item, false);
                })}
            </List>
        </Box>
    );
}
