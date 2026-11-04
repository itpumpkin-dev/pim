import Heading from '@/components/heading';
import { type NavItem } from '@/types';
import { router } from '@inertiajs/react';
import { List, ListItemStandard } from '@ui5/webcomponents-react';
import { type ReactNode } from 'react';
import styles from './layout.module.css';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profile',
        url: '/settings/profile',
        icon: null,
    },
    {
        title: 'Password',
        url: '/settings/password',
        icon: null,
    },
    {
        title: 'Appearance',
        url: '/settings/appearance',
        icon: null,
    },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
    const currentPath = window.location.pathname;

    return (
        <div style={{ padding: '1.5rem 1rem' }}>
            <Heading title="Settings" description="Manage your profile and account settings" />

            <div className={styles.columns}>
                <aside className={styles.aside}>
                    <List
                        selectionMode="Single"
                        onItemClick={(e) => {
                            const url = (e.detail.item as HTMLElement).dataset.url;
                            if (url) router.visit(url);
                        }}
                    >
                        {sidebarNavItems.map((item) => (
                            <ListItemStandard key={item.url} data-url={item.url} text={item.title} selected={currentPath === item.url} />
                        ))}
                    </List>
                </aside>

                <div className={styles.divider} />

                <div className={styles.content}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', maxWidth: 576 }}>{children}</div>
                </div>
            </div>
        </div>
    );
}
