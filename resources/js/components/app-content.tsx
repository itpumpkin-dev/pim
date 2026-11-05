import { Breadcrumbs } from '@/components/breadcrumbs';
import { LocaleSwitchOverlay } from '@/components/locale-switch-overlay';
import { RouteLoadingSkeleton } from '@/components/route-loading-skeleton';
import { type BreadcrumbItem } from '@/types';
import { type ReactNode } from 'react';

interface AppContentProps {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    /** Page-level actions shown at the right end of the breadcrumb bar. */
    actions?: ReactNode;
}

/**
 * The page content area (NavigationLayout's default slot). `<main>` is the
 * scroll container — ScrollTopButton and LocaleSwitchOverlay rely on that —
 * with a sticky breadcrumb/actions bar at its top (the trail used to sit
 * inside the shell bar; Fiori puts it in the page header instead).
 */
export function AppContent({ children, breadcrumbs = [], actions }: AppContentProps) {
    const showBar = breadcrumbs.length > 0 || !!actions;

    return (
        // The wrapper is exactly the visible content area. RouteLoadingSkeleton
        // sits here, outside the scrolling <main>: an absolute overlay inside a
        // scroll container only covers its first screenful, so on a scrolled or
        // long page the old content showed below it during navigation.
        // `isolation: isolate` keeps the z-indexes in here (sticky breadcrumb bar,
        // overlays) local to the content area: the collapsed SideNavigation widens
        // the hovered item over the content, and without this the breadcrumb bar
        // (z-index 5) painted over it.
        <div style={{ position: 'relative', height: '100%', minWidth: 0, isolation: 'isolate' }}>
            <main
                style={{
                    position: 'relative',
                    height: '100%',
                    minWidth: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box',
                }}
            >
                {showBar && (
                    <header
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 5,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            minHeight: '2.75rem',
                            padding: '0 1rem',
                            background: 'var(--sapPageHeader_Background, var(--sapObjectHeader_Background))',
                            borderBottom: '1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor))',
                            boxShadow: 'var(--sapContent_HeaderShadow)',
                            flexShrink: 0,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <Breadcrumbs breadcrumbs={breadcrumbs} />
                        </div>
                        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>{actions}</div>}
                    </header>
                )}
                {children}
                <LocaleSwitchOverlay />
            </main>
            <RouteLoadingSkeleton />
        </div>
    );
}
