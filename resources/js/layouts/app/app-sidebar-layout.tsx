import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { FlashToast } from '@/components/flash-toast';
import { type BreadcrumbItem } from '@/types';
import { type ReactNode } from 'react';

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
    actions,
}: {
    children: React.ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    actions?: ReactNode;
}) {
    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar">
                <AppSidebarHeader breadcrumbs={breadcrumbs} actions={actions} />
                {children}
            </AppContent>
            <FlashToast />
        </AppShell>
    );
}
