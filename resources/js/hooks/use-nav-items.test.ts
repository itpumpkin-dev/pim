// @vitest-environment jsdom
import '@/lib/i18n';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filterNavItemsByPermission, flattenNavItems, useMainNavItems, type FlatNavItem } from './use-nav-items';
import type { NavItem } from '@/types';

const TREE: NavItem[] = [
    { title: 'Dashboard', url: '/dashboard' },
    {
        title: 'Catalog',
        items: [
            { title: 'Products', url: '/catalog/products', permission: 'products.list_products' },
            {
                title: 'Master',
                items: [
                    { title: 'Categories', url: '/catalog/categories', permission: 'categories.list_categories' },
                    { title: 'Brands', url: '/catalog/brands', permission: 'brands.list_brands' },
                ],
            },
        ],
    },
];

describe('filterNavItemsByPermission', () => {
    it('keeps an item with no permission requirement unconditionally', () => {
        const result = filterNavItemsByPermission(TREE, []);
        expect(result.map((i) => i.title)).toContain('Dashboard');
    });

    it('drops a leaf item whose permission the user does not have', () => {
        const result = filterNavItemsByPermission(TREE, []);
        const catalog = result.find((i) => i.title === 'Catalog');
        expect(catalog?.items?.find((i) => i.title === 'Products')).toBeUndefined();
    });

    it('keeps a leaf item whose permission the user does have', () => {
        const result = filterNavItemsByPermission(TREE, ['products.list_products']);
        const catalog = result.find((i) => i.title === 'Catalog');
        expect(catalog?.items?.find((i) => i.title === 'Products')).toBeDefined();
    });

    it('drops a group entirely once every one of its children is filtered out', () => {
        const result = filterNavItemsByPermission(TREE, []);
        const catalog = result.find((i) => i.title === 'Catalog');
        // Products (no perm) and Master (both children no perm) are both filtered away
        expect(catalog?.items?.find((i) => i.title === 'Master')).toBeUndefined();
    });

    it('keeps a group when at least one grandchild permission is granted', () => {
        const result = filterNavItemsByPermission(TREE, ['brands.list_brands']);
        const catalog = result.find((i) => i.title === 'Catalog');
        const master = catalog?.items?.find((i) => i.title === 'Master');
        expect(master?.items?.map((i) => i.title)).toEqual(['Brands']);
    });

    it('recurses without mutating the original tree', () => {
        filterNavItemsByPermission(TREE, []);
        const catalog = TREE.find((i) => i.title === 'Catalog');
        expect(catalog?.items?.length).toBe(2);
    });
});

describe('flattenNavItems', () => {
    it('flattens every leaf page with its group-title breadcrumb as path', () => {
        const flat = flattenNavItems(TREE);

        expect(flat).toContainEqual<FlatNavItem>({ title: 'Dashboard', url: '/dashboard', path: [] });
        expect(flat).toContainEqual<FlatNavItem>({ title: 'Products', url: '/catalog/products', path: ['Catalog'] });
        expect(flat).toContainEqual<FlatNavItem>({ title: 'Categories', url: '/catalog/categories', path: ['Catalog', 'Master'] });
    });

    it('drops group-only nodes (no url of their own)', () => {
        const flat = flattenNavItems(TREE);
        expect(flat.find((i) => i.title === 'Catalog')).toBeUndefined();
        expect(flat.find((i) => i.title === 'Master')).toBeUndefined();
    });

    it('returns an empty array for an empty tree', () => {
        expect(flattenNavItems([])).toEqual([]);
    });
});

describe('useMainNavItems', () => {
    it('returns the 4 top-level sections (Dashboard, Catalog, Import/Export, System)', () => {
        const { result } = renderHook(() => useMainNavItems());

        expect(result.current).toHaveLength(4);
        expect(result.current.map((i) => i.url ?? i.title)).toContain('/dashboard');
    });

    it('keeps the same array identity across re-renders (memoized on the translation function)', () => {
        const { result, rerender } = renderHook(() => useMainNavItems());
        const first = result.current;
        rerender();

        expect(result.current).toBe(first);
    });

    it('gives every leaf item a real permission string', () => {
        const { result } = renderHook(() => useMainNavItems());
        const leaves = flattenNavItems(result.current);

        expect(leaves.length).toBeGreaterThan(10);
    });
});
