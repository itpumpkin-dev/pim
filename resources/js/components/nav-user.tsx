import { useInitials } from '@/hooks/use-initials';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { type SharedData, type User } from '@/types';
import { router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action-settings.js';
import '@ui5/webcomponents-icons/dist/log.js';
import { Avatar, BusyIndicator, UserMenu, UserMenuAccount, UserMenuItem, type UserMenuPropTypes } from '@ui5/webcomponents-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * Profile avatar for the ShellBar `profile` slot. Shows the user's photo
 * when they have one, otherwise their initials.
 */
export function UserAvatar({ user, slot }: { user: User; slot?: string }) {
    const getInitials = useInitials();

    return (
        <Avatar slot={slot} size="XS" initials={user.avatar_url ? undefined : getInitials(user.name)} accessibleName={user.name}>
            {user.avatar_url ? <img src={user.avatar_url} alt={user.name} /> : null}
        </Avatar>
    );
}

interface NavUserMenuProps {
    open: boolean;
    opener: HTMLElement | null;
    onClose: () => void;
}

/**
 * SAP Fiori "User Menu" opened from the ShellBar avatar: account header
 * (name, email, photo), a Settings entry (the user's own edit page) and a
 * Log out footer. Navigation goes through Inertia so it stays client-side.
 */
export function NavUserMenu({ open, opener, onClose }: NavUserMenuProps) {
    const { t } = useTranslation('common');
    const { auth } = usePage<SharedData>().props;
    const cleanup = useMobileNavigation();
    const getInitials = useInitials();
    const [loggingOut, setLoggingOut] = useState(false);

    if (!auth.user) return null;
    const user = auth.user;

    const close = () => {
        cleanup();
        onClose();
    };

    const onItemClick: UserMenuPropTypes['onItemClick'] = (e) => {
        const href = (e.detail.item as HTMLElement).dataset.href;
        close();
        if (href) router.visit(href);
    };

    const logout = () => {
        setLoggingOut(true);
        router.post(
            route('logout'),
            {},
            {
                // On success Inertia swaps to the post-logout page and this
                // component unmounts with the overlay; only a failed request
                // gets here with the shell still on screen.
                onFinish: () => setLoggingOut(false),
            },
        );
    };

    return (
        <>
            {loggingOut &&
                createPortal(
                    <div
                        role="status"
                        aria-live="assertive"
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 10000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '1rem',
                            background: 'color-mix(in srgb, var(--sapBackgroundColor) 75%, transparent)',
                            color: 'var(--sapTextColor)',
                            fontFamily: 'var(--sapFontFamily)',
                            fontSize: 'var(--sapFontHeader5Size)',
                        }}
                    >
                        <BusyIndicator active size="L" />
                        <span>{t('loggingOut')}</span>
                    </div>,
                    document.body,
                )}
            <UserMenu
                open={open && !!opener}
                opener={opener ?? undefined}
                onClose={onClose}
                onItemClick={onItemClick}
                // UserMenu's built-in Sign Out button (no custom footer). The menu
                // closes and a full-screen busy overlay covers the app until the
                // logout request and redirect finish, so the click never looks ignored.
                onSignOutClick={() => {
                    close();
                    if (!loggingOut) logout();
                }}
                accounts={
                    <UserMenuAccount
                        titleText={user.name}
                        subtitleText={user.email}
                        avatarSrc={user.avatar_url || undefined}
                        avatarInitials={getInitials(user.name)}
                        selected
                    />
                }
            >
                <UserMenuItem icon="action-settings" text={t('settings')} data-href={route('system.user.edit', user.id)} />
            </UserMenu>
        </>
    );
}
