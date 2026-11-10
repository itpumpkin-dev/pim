import { filterNavItemsByPermission, useMainNavItems } from '@/hooks/use-nav-items';
import { useSidebar } from '@/hooks/use-sidebar';
import { APP_VERSION_TEXT } from '@/lib/app-version';
import { type NavItem, type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
// Every glyph named by NavItem.icon in hooks/use-nav-items.ts must be
// registered once — UI5 renders nothing for an icon whose module was never
// imported. Keep this list in sync with that file.
import '@ui5/webcomponents-icons/dist/action-settings.js';
import '@ui5/webcomponents-icons/dist/badge.js';
import '@ui5/webcomponents-icons/dist/building.js';
import '@ui5/webcomponents-icons/dist/cart.js';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/course-book.js';
import '@ui5/webcomponents-icons/dist/database.js';
import '@ui5/webcomponents-icons/dist/direction-arrows.js';
import '@ui5/webcomponents-icons/dist/download-from-cloud.js';
import '@ui5/webcomponents-icons/dist/employee.js';
import '@ui5/webcomponents-icons/dist/globe.js';
import '@ui5/webcomponents-icons/dist/group.js';
import '@ui5/webcomponents-icons/dist/hint.js';
import '@ui5/webcomponents-icons/dist/history.js';
import '@ui5/webcomponents-icons/dist/home.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/role.js';
import '@ui5/webcomponents-icons/dist/settings.js';
import '@ui5/webcomponents-icons/dist/switch-classes.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import '@ui5/webcomponents-icons/dist/task.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import {
    SideNavigation,
    SideNavigationGroup,
    SideNavigationItem,
    SideNavigationSubItem,
    type SideNavigationPropTypes,
} from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The nav tree as UI5's SideNavigation can render it. SideNavigation has a
 * fixed shape — optional SideNavigationGroup (a titled section) >
 * SideNavigationItem (icon + text) > SideNavigationSubItem (text only) — so
 * the free-form NavItem tree from use-nav-items.ts is mapped onto it here:
 *
 *  - a top-level leaf (Dashboard) → a plain item;
 *  - a top-level node with children (Catalog, Import/Export, System) → a group;
 *  - inside a group, each child → an item, its leaf children → sub-items;
 *  - anything nested deeper than that (Catalog > Master > Marketplace >
 *    {platform}) can't be a sub-sub-item, so that branch is lifted to its
 *    own item right after its parent (Master, then Marketplace).
 */
interface SideNode {
    key: string;
    kind: 'group' | 'item' | 'sub';
    title: string;
    icon?: string;
    url?: string;
    source: NavItem;
    children: SideNode[];
}

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

// Stable key for a node — its path down the (original) tree. `title` alone
// isn't unique across the whole tree, and a group node has no `url`.
const keyOf = (parentKey: string, item: NavItem) => `${parentKey}/${item.title}`;

function toItems(list: NavItem[], parentKey: string): SideNode[] {
    const result: SideNode[] = [];
    for (const raw of list) {
        const item = unwrap(raw);
        const key = keyOf(parentKey, item);
        const children = item.items ?? [];

        if (children.length === 0) {
            result.push({ key, kind: 'item', title: item.title, icon: item.icon ?? undefined, url: item.url, source: item, children: [] });
            continue;
        }

        const subs: SideNode[] = [];
        const lifted: SideNode[] = [];
        for (const rawChild of children) {
            const child = unwrap(rawChild);
            if (child.items && child.items.length > 0) {
                lifted.push(...toItems([child], key));
            } else {
                subs.push({ key: keyOf(key, child), kind: 'sub', title: child.title, url: child.url, source: child, children: [] });
            }
        }

        if (subs.length > 0 || item.url) {
            result.push({ key, kind: 'item', title: item.title, icon: item.icon ?? undefined, url: item.url, source: item, children: subs });
        }
        result.push(...lifted);
    }
    return result;
}

function toSideNavTree(items: NavItem[]): SideNode[] {
    return items.map((raw) => {
        const item = unwrap(raw);
        const key = keyOf('', item);
        const children = item.items ?? [];
        if (children.length === 0) {
            return { key, kind: 'item', title: item.title, icon: item.icon ?? undefined, url: item.url, source: item, children: [] };
        }
        return { key, kind: 'group', title: item.title, source: item, children: toItems(children, key) };
    });
}

/**
 * How strongly `item` claims the current path — the length of the longest
 * matching URL prefix (0 = no match). Nav items only list each section's
 * top-level URL (e.g. /catalog/products), so match by path prefix with a '/'
 * boundary (nested detail pages, ?query strings), honouring
 * matchUrls/excludeUrls. The longest match wins so overlapping prefixes
 * (/catalog/attributes vs /catalog/attributes/api-sources) pick the right one.
 */
function matchScore(item: NavItem, currentPath: string): number {
    const matches = (url?: string) => !!url && (currentPath === url || currentPath.startsWith(url.endsWith('/') ? url : url + '/'));
    let score = 0;
    if (matches(item.url) && !(item.excludeUrls ?? []).some(matches)) score = item.url!.length;
    for (const url of item.matchUrls ?? []) {
        if (matches(url)) score = Math.max(score, url.length);
    }
    return score;
}

function findSelected(tree: SideNode[], currentPath: string): { key: string | null; branch: string[] } {
    let best: { key: string; branch: string[]; score: number } | null = null;
    const walk = (nodes: SideNode[], ancestors: string[]) => {
        for (const node of nodes) {
            if (node.children.length > 0) {
                walk(node.children, [...ancestors, node.key]);
            }
            if (node.kind !== 'group' && node.url) {
                const score = matchScore(node.source, currentPath);
                if (score > 0 && (!best || score > best.score)) best = { key: node.key, branch: ancestors, score };
            }
        }
    };
    walk(tree, []);
    const found = best as { key: string; branch: string[] } | null;
    return { key: found?.key ?? null, branch: found?.branch ?? [] };
}

// Expanded/collapsed state of every group and parent item, remembered across
// navigations and reloads (the whole shell remounts on each Inertia visit).
const STORAGE_KEY = 'pim.sidenav.expanded';

function readExpanded(): Record<string, boolean> {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return saved ? (JSON.parse(saved) as Record<string, boolean>) : {};
    } catch {
        return {}; // private mode / disabled storage
    }
}

/**
 * SAP Fiori Side Navigation on the official UI5 `SideNavigation`, placed in
 * NavigationLayout's `sideContent` slot by AppShell. Items are filtered by
 * the viewer's permissions, the item matching the current URL is selected
 * (and its branch force-expanded), and clicks go through Inertia's
 * `router.visit` so navigation stays client-side — each leaf still carries a
 * real `href`, so ctrl/⌘/shift-click opens it in a new tab as before.
 *
 * Collapsed mode (icon rail with a flyout per item) and the small-screen
 * overlay are the control's own behaviour, driven by NavigationLayout's
 * `mode` (see app-shell.tsx).
 */
export function AppSidebar({ slot }: { slot?: string }) {
    const { t } = useTranslation('nav');
    const page = usePage<SharedData>();
    const { auth } = page.props;
    const { isMobile, setOpenMobile } = useSidebar();
    const mainNavItems = useMainNavItems();

    const tree = useMemo(() => toSideNavTree(filterNavItemsByPermission(mainNavItems, auth.permissions)), [mainNavItems, auth.permissions]);

    const currentPath = page.url.split('?')[0];
    const selected = useMemo(() => findSelected(tree, currentPath), [tree, currentPath]);

    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
        const initial = readExpanded();
        selected.branch.forEach((k) => (initial[k] = true));
        return initial;
    });

    // Keep the active branch open as the route changes without disturbing
    // whatever else the user has expanded or collapsed.
    useEffect(() => {
        setExpanded((prev) => {
            if (selected.branch.every((k) => prev[k])) return prev;
            const next = { ...prev };
            selected.branch.forEach((k) => (next[k] = true));
            return next;
        });
    }, [selected.branch]);

    const isExpanded = (node: SideNode) => expanded[node.key] ?? node.kind === 'group';

    const onItemToggle: SideNavigationPropTypes['onItemToggle'] = (e) => {
        const item = e.detail.item as unknown as HTMLElement & { expanded: boolean };
        const key = item.dataset.key;
        if (!key) return;
        // fired *before* UI5 flips `expanded`, so the new value is the inverse
        const value = !item.expanded;
        setExpanded((prev) => {
            const next = { ...prev, [key]: value };
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const visit =
        (url: string) =>
        (e: { detail: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }; preventDefault: () => void }) => {
            const { altKey, ctrlKey, metaKey, shiftKey } = e.detail;
            if (altKey || ctrlKey || metaKey || shiftKey) return; // let the real href open a new tab/window
            e.preventDefault();
            if (isMobile) setOpenMobile(false);
            router.visit(url);
        };

    const renderItem = (node: SideNode) => {
        const hasSubs = node.children.length > 0;
        return (
            <SideNavigationItem
                key={node.key}
                data-key={node.key}
                text={node.title}
                tooltip={node.title}
                icon={node.icon}
                href={node.url}
                selected={selected.key === node.key}
                expanded={hasSubs ? isExpanded(node) : undefined}
                // Parent items without a page of their own (Master, Attributes,
                // Marketplace) only expand/collapse their sub-items.
                unselectable={hasSubs && !node.url}
                onClick={node.url ? visit(node.url) : undefined}
            >
                {node.children.map((sub) => (
                    <SideNavigationSubItem
                        key={sub.key}
                        data-key={sub.key}
                        text={sub.title}
                        tooltip={sub.title}
                        href={sub.url}
                        selected={selected.key === sub.key}
                        onClick={sub.url ? visit(sub.url) : undefined}
                    />
                ))}
            </SideNavigationItem>
        );
    };

    return (
        <SideNavigation
            slot={slot}
            data-ui5-compact-size
            onItemToggle={onItemToggle}
            accessibleName={t('mainNavigation')}
            // Build version pinned at the bottom of the rail; disabled = greyed, not clickable.
            fixedItems={<SideNavigationItem icon="hint" text={APP_VERSION_TEXT} tooltip={APP_VERSION_TEXT} disabled />}
        >
            {tree.map((node) =>
                node.kind === 'group' ? (
                    <SideNavigationGroup key={node.key} data-key={node.key} text={node.title} expanded={isExpanded(node)}>
                        {node.children.map(renderItem)}
                    </SideNavigationGroup>
                ) : (
                    renderItem(node)
                ),
            )}
        </SideNavigation>
    );
}
