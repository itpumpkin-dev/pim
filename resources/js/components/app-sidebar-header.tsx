import { AppearanceMenu, appearanceIcon } from '@/components/appearance-dropdown';
import { LocaleMenu } from '@/components/locale-dropdown';
import { NavUserMenu, UserAvatar } from '@/components/nav-user';
import { NotificationPopover, useNotifications } from '@/components/notification-bell';
import { ShellSearch } from '@/components/shell-search';
import { useAppearance } from '@/hooks/use-appearance';
import { useLocale } from '@/hooks/use-locale';
import { useSidebar } from '@/hooks/use-sidebar';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/globe.js';
import '@ui5/webcomponents-icons/dist/menu2.js';
import { Button, ShellBar, ShellBarItem } from '@ui5/webcomponents-react';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import AppLogoIcon from './app-logo-icon';

type OpenPopup = { kind: 'notifications' | 'locale' | 'appearance' | 'user'; opener: HTMLElement } | null;

/**
 * SAP Fiori Shell Bar — the top bar of every app-shell page, on the official
 * UI5 `ShellBar` (placed in NavigationLayout's `header` slot by AppShell):
 * menu button (toggles the side navigation), logo + product title (→
 * dashboard), Shell Search, notifications bell (realtime count), language
 * and appearance switches, and the profile avatar opening the User Menu.
 *
 * Every popover hangs off the opener element the ShellBar hands back in its
 * click event (`detail.targetRef`), which is also the overflow button when
 * the bar is too narrow to show the item itself. They're portalled to
 * <body> so nothing but ShellBar ends up in the layout's header slot.
 */
export function AppSidebarHeader({ slot }: { slot?: string }) {
    const { t } = useTranslation('common');
    const { auth } = usePage<SharedData>().props;
    const { toggleSidebar, isMobile } = useSidebar();
    const { appearance } = useAppearance();
    const { locale, locales } = useLocale();
    const feed = useNotifications();

    const [popup, setPopup] = useState<OpenPopup>(null);
    const close = useCallback(() => setPopup(null), []);
    const toggle = (kind: NonNullable<OpenPopup>['kind'], opener: HTMLElement) =>
        setPopup((prev) => (prev?.kind === kind && prev.opener === opener ? null : { kind, opener }));

    // The ShellBar collapses the search field to a magnifier button on its
    // own when the bar is narrow; this mirrors its state so Ctrl+K can expand
    // it again (ShellSearch → onExpandRequest).
    const [searchVisible, setSearchVisible] = useState(!isMobile);
    const expandSearch = useCallback(() => setSearchVisible(true), []);

    const currentLocale = locales.find((l) => l.code === locale);
    const unread = feed.unreadCount;

    return (
        <>
            <ShellBar
                slot={slot}
                primaryTitle="PIM Pumpkin"
                logo={<AppLogoIcon style={{ height: '2rem', width: 'auto' }} />}
                onLogoClick={() => router.visit('/dashboard')}
                startButton={
                    <Button
                        icon="menu2"
                        design="Transparent"
                        tooltip={t('toggleSidebar')}
                        accessibleName={t('toggleSidebar')}
                        onClick={toggleSidebar}
                    />
                }
                searchField={<ShellSearch onExpandRequest={expandSearch} />}
                showSearchField={searchVisible}
                onSearchFieldToggle={(e) => setSearchVisible(e.detail.expanded)}
                showNotifications
                notificationsCount={unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined}
                onNotificationsClick={(e) => toggle('notifications', e.detail.targetRef)}
                profile={auth.user ? <UserAvatar user={auth.user} /> : undefined}
                onProfileClick={(e) => toggle('user', e.detail.targetRef)}
            >
                <ShellBarItem
                    icon="globe"
                    text={currentLocale?.display_name ?? t('language')}
                    onClick={(e) => toggle('locale', e.detail.targetRef)}
                />
                <ShellBarItem icon={appearanceIcon(appearance)} text="Theme" onClick={(e) => toggle('appearance', e.detail.targetRef)} />
            </ShellBar>

            {createPortal(
                <>
                    <NotificationPopover feed={feed} open={popup?.kind === 'notifications'} opener={popup?.opener ?? null} onClose={close} />
                    <LocaleMenu open={popup?.kind === 'locale'} opener={popup?.opener ?? null} onClose={close} />
                    <AppearanceMenu open={popup?.kind === 'appearance'} opener={popup?.opener ?? null} onClose={close} />
                    <NavUserMenu open={popup?.kind === 'user'} opener={popup?.opener ?? null} onClose={close} />
                </>,
                document.body,
            )}
        </>
    );
}
