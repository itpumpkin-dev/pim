import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Collapse, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { FIORI } from '@/lib/fiori-style';

interface NavSecondaryProps {
    title: string;
    items: NavItem[];
}

/**
 * SAP Fiori "Side Navigation" — a collapsible tree. Every node that has
 * children is a disclosure row (label + rotating chevron) that expands its
 * children inline; leaf nodes are links that highlight when their route is
 * active. The branch leading to the current route is always force-expanded;
 * anything else the user opens/closes is remembered in localStorage, keyed
 * by the section title (AppSidebar remounts on every navigation, so without
 * persistence the tree would snap shut on each page load).
 */

// A group whose only child repeats its own title (e.g. "Products" > "Products")
// is really just that one leaf — every Catalog entity is wrapped in a group
// for a uniform data shape, but a header restating the single link below it is
// noise. Unwrap it so it renders as a plain link.
function unwrap(item: NavItem): NavItem {
    let node = item;
    while (node.items && node.items.length === 1 && node.items[0].title === node.title) {
        node = node.items[0];
    }
    return node;
}

// Stable key for a node — its path down the tree. `title` alone isn't unique
// across the whole tree (a leaf "Shopee" under Connection Settings vs. the
// "Shopee" mapping group), and a group node has no `url`.
const keyOf = (parentKey: string, item: NavItem) => `${parentKey}/${item.title}`;

export function NavSecondary({ title, items }: NavSecondaryProps) {
    const page = usePage();
    const currentPath = page.url.split('?')[0];

    // item.url only holds a section's top-level URL, so match by path prefix
    // (with a '/' boundary) — exact equality never matches a nested detail
    // page (/catalog/products/33/edit, ?query strings, ...).
    const matches = (url?: string) => !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));

    const isLeafActive = (item: NavItem) =>
        (matches(item.url) && !(item.excludeUrls ?? []).some(matches)) || (item.matchUrls ?? []).some(matches);

    // Keys of every group that contains the active route somewhere beneath it —
    // these stay open no matter what.
    const activeBranchKeys = useMemo(() => {
        const keys: string[] = [];
        const walk = (list: NavItem[], parentKey: string): boolean => {
            let hasActive = false;
            for (const raw of list) {
                const item = unwrap(raw);
                const key = keyOf(parentKey, item);
                if (item.items && item.items.length > 0) {
                    if (walk(item.items, key)) {
                        keys.push(key);
                        hasActive = true;
                    }
                } else if (isLeafActive(item)) {
                    hasActive = true;
                }
            }
            return hasActive;
        };
        walk(items, '');
        return keys;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, currentPath]);

    const storageKey = `pim.nav.expanded:${title}`;

    const [open, setOpen] = useState<Set<string>>(() => {
        const initial = new Set(activeBranchKeys);
        try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved) (JSON.parse(saved) as string[]).forEach((k) => initial.add(k));
        } catch {
            /* private mode / disabled storage — fall back to just the active branch */
        }
        return initial;
    });

    // Keep the active branch open as the route changes without disturbing
    // whatever else the user has expanded.
    useEffect(() => {
        setOpen((prev) => {
            if (activeBranchKeys.every((k) => prev.has(k))) return prev;
            const next = new Set(prev);
            activeBranchKeys.forEach((k) => next.add(k));
            return next;
        });
    }, [activeBranchKeys]);

    const toggle = (key: string) => {
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try {
                window.localStorage.setItem(storageKey, JSON.stringify([...next]));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const rowSx = (depth: number, active: boolean, isGroup: boolean) => ({
        position: 'relative' as const,
        borderRadius: '8px',
        pl: 1.5 + Math.max(0, depth) * 1.25,
        pr: 1,
        py: 0.6,
        minHeight: 34,
        mb: 0.25,
        transition: 'background-color 0.12s ease, color 0.12s ease',
        color: active ? FIORI.brand : FIORI.textPrimary,
        bgcolor: active && !isGroup ? FIORI.selected : 'transparent',
        '&:hover': { bgcolor: active && !isGroup ? FIORI.selected : FIORI.hover },
        '&.Mui-selected, &.Mui-selected:hover': { bgcolor: FIORI.selected, color: FIORI.brand },
        '&::before':
            active && !isGroup
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
    });

    const labelSx = (depth: number, active: boolean) => ({
        m: 0,
        '& .MuiTypography-root': {
            fontSize: depth === 0 ? '0.9rem' : '0.875rem',
            fontWeight: active || depth === 0 ? 600 : 400,
            lineHeight: 1.3,
            whiteSpace: 'nowrap' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        },
    });

    const renderNode = (raw: NavItem, depth: number, parentKey: string) => {
        const item = unwrap(raw);
        const children = item.items ?? [];
        const key = keyOf(parentKey, item);

        if (children.length === 0) {
            const active = isLeafActive(item);
            return (
                <ListItemButton
                    key={item.url ?? key}
                    component={item.url ? Link : 'div'}
                    href={item.url as string}
                    selected={active}
                    disableRipple
                    sx={rowSx(depth, active, false)}
                >
                    <ListItemText primary={item.title} sx={labelSx(depth, active)} />
                </ListItemButton>
            );
        }

        const isOpen = open.has(key);
        const hasActiveDescendant = activeBranchKeys.includes(key);

        return (
            <Fragment key={key}>
                <ListItemButton disableRipple onClick={() => toggle(key)} sx={rowSx(depth, hasActiveDescendant, true)}>
                    <ListItemText primary={item.title} sx={labelSx(depth, hasActiveDescendant)} />
                    <ExpandMoreIcon
                        fontSize="small"
                        sx={{
                            color: FIORI.textSecondary,
                            transition: 'transform 0.15s ease',
                            transform: isOpen ? 'none' : 'rotate(-90deg)',
                        }}
                    />
                </ListItemButton>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                    <List dense disablePadding>
                        {children.map((child) => renderNode(child, depth + 1, key))}
                    </List>
                </Collapse>
            </Fragment>
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
                {items.map((item) => renderNode(item, 0, ''))}
            </List>
        </Box>
    );
}
