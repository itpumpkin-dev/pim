export interface Auth {
    user: User;
    permissions: string[];
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url?: string;
    /**
     * SAP-icons glyph name (a `@ui5/webcomponents-icons` name such as
     * `"product"` / `"database"`), rendered by the UI5 SideNavigation in
     * app-sidebar.tsx. Every item that renders as a first-level
     * SideNavigationItem should carry one (the collapsed rail shows icons
     * only); sub-items and SideNavigationGroup headers ignore it. The glyph
     * must also be side-effect imported once — see the icon imports at the
     * top of app-sidebar.tsx.
     */
    icon?: string | null;
    isActive?: boolean;
    items?: NavItem[];
    permission?: string;
    /**
     * Extra URL prefixes that should also count as "this item is active" —
     * for a page reachable only via an in-page tab on this item's own page
     * (e.g. /catalog/sales-platforms, the "Sales Platforms" tab on the
     * Channels page) rather than its own sidebar link.
     */
    matchUrls?: string[];
    /**
     * URL prefixes that would otherwise prefix-match this item's own `url`
     * but shouldn't — e.g. /catalog/categories/marketplace-sync sits under
     * /catalog/categories by URL structure (it's routed alongside the
     * Categories CRUD endpoints), but has been reassigned to the "จัดการ"
     * hub's matchUrls, so it must not also light up the "หมวดหมู่" list item.
     */
    excludeUrls?: string[];
}

export interface Locale {
    id: number;
    code: string;
    display_name: string | null;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    status?: string | null;
    success?: string | null;
    error?: string | null;
    warning?: string | null;
    created_option_code?: string | null;
    locale: string;
    locales: Locale[];
    [key: string]: unknown;
}

export interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    name: string;
    employee_id: string | null;
    enabled: boolean;
    email: string;
    avatar_url?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
