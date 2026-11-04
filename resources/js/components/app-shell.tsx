import { SidebarProvider, useSidebar } from '@/hooks/use-sidebar';
import { NavigationLayout } from '@ui5/webcomponents-react';
import { type ReactElement, type ReactNode } from 'react';

interface AppShellProps {
    children: ReactNode;
    /** The ShellBar (rendered into NavigationLayout's `header` slot). */
    header: ReactElement;
    /** The SideNavigation (rendered into NavigationLayout's `sideContent` slot). */
    sideContent: ReactElement;
}

function ShellFrame({ children, header, sideContent }: AppShellProps) {
    const { isMobile, open, openMobile } = useSidebar();

    // Desktop: the menu button flips the rail between expanded and the
    // icon-only collapsed mode. Mobile/tablet: hidden (phone) or icon rail
    // (tablet) by default, expanded on demand — NavigationLayout itself
    // turns "Expanded" into a full-width overlay below 600px.
    const expanded = isMobile ? openMobile : open;

    return (
        <NavigationLayout mode={expanded ? 'Expanded' : 'Collapsed'} header={header} sideContent={sideContent}>
            {children}
        </NavigationLayout>
    );
}

/**
 * SAP Fiori app shell — UI5 `NavigationLayout` (ShellBar on top, Side
 * Navigation on the left, page content in the rest). The layout positions
 * itself `absolute; inset: 0`, so it sits in a fixed full-viewport box.
 *
 * The sidebar's expanded/collapsed choice is remembered across Inertia
 * navigations for the session (`persist`) but resets to expanded on a full
 * reload — see hooks/use-sidebar.tsx.
 */
export function AppShell(props: AppShellProps) {
    return (
        <SidebarProvider defaultOpen persist>
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
                <ShellFrame {...props} />
            </div>
        </SidebarProvider>
    );
}
