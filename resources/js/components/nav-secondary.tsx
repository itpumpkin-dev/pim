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
                disableRipple
                sx={{
                    position: 'relative',
                    borderRadius: '8px',
                    pl: indented ? 2.75 : 1.75,
                    pr: 1.5,
                    py: 0.6,
                    minHeight: 34,
                    mb: 0.25,
                    transition: 'background-color 0.12s ease, color 0.12s ease',
                    color: isActive ? FIORI.brand : FIORI.textPrimary,
                    bgcolor: isActive ? FIORI.selected : 'transparent',
                    '&:hover': {
                        bgcolor: isActive ? FIORI.selected : FIORI.hover,
                    },
                    '&.Mui-selected, &.Mui-selected:hover': {
                        bgcolor: FIORI.selected,
                        color: FIORI.brand,
                    },
                    // Fiori active-item left accent bar
                    '&::before': isActive
                        ? {
                              content: '""',
                              position: 'absolute',
                              left: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 3,
                              height: 20,
                              borderRadius: '0 3px 3px 0',
                              bgcolor: FIORI.brand,
                          }
                        : undefined,
                }}
            >
                <ListItemText
                    primary={item.title}
                    sx={{
                        m: 0,
                        '& .MuiTypography-root': {
                            fontSize: '0.875rem',
                            fontWeight: isActive ? 600 : 400,
                            lineHeight: 1.3,
                        },
                    }}
                />
            </ListItemButton>
        );
    };

    return (
        <Box sx={{ width: 200, height: '100%', py: 1.5, display: 'flex', flexDirection: 'column' }}>
            <Typography
                component="h2"
                sx={{
                    px: 2.5,
                    mb: 1,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: FIORI.textSecondary,
                    fontSize: '0.8125rem',
                }}
            >
                {title}
            </Typography>
            <List
                dense
                sx={{
                    px: 1,
                    flex: 1,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: 6 },
                    '&::-webkit-scrollbar-thumb': { bgcolor: FIORI.border, borderRadius: 3 },
                }}
            >
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
                            <Box key={item.title} sx={{ mt: index === 0 ? 0.5 : 2, mb: 0.5 }}>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: 'block',
                                        px: 0.75,
                                        pb: 0.5,
                                        fontWeight: 900,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        color: FIORI.textSecondary,
                                        fontSize: '0.85rem',
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
