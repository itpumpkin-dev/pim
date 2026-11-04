import { useAppearance, type Appearance } from '@/hooks/use-appearance';
import '@ui5/webcomponents-icons/dist/dark-mode.js';
import '@ui5/webcomponents-icons/dist/light-mode.js';
import '@ui5/webcomponents-icons/dist/palette.js';
import { Button, Menu, MenuItem, MenuItemGroup, type MenuPropTypes } from '@ui5/webcomponents-react';
import { useState, type CSSProperties } from 'react';

export const APPEARANCE_OPTIONS: { mode: Appearance; label: string; icon: string }[] = [
    { mode: 'light', label: 'Light', icon: 'light-mode' },
    { mode: 'dark', label: 'Dark', icon: 'dark-mode' },
    { mode: 'system', label: 'System', icon: 'palette' },
];

export const appearanceIcon = (appearance: Appearance) => APPEARANCE_OPTIONS.find((o) => o.mode === appearance)?.icon ?? 'palette';

interface AppearanceMenuProps {
    open: boolean;
    opener: HTMLElement | null;
    onClose: () => void;
}

/**
 * The light/dark/system picker on its own — opened from the standalone
 * toggle button below, or from the ShellBar item in app-sidebar-header.tsx
 * (which supplies its own opener element).
 */
export function AppearanceMenu({ open, opener, onClose }: AppearanceMenuProps) {
    const { appearance, updateAppearance } = useAppearance();

    const onItemClick: MenuPropTypes['onItemClick'] = (e) => {
        const mode = (e.detail.item as HTMLElement).dataset.mode as Appearance | undefined;
        if (mode) updateAppearance(mode);
        onClose();
    };

    return (
        <Menu open={open && !!opener} opener={opener ?? undefined} onClose={onClose} onItemClick={onItemClick} horizontalAlign="End">
            <MenuItemGroup checkMode="Single">
                {APPEARANCE_OPTIONS.map((o) => (
                    <MenuItem key={o.mode} data-mode={o.mode} text={o.label} icon={o.icon} checked={appearance === o.mode} />
                ))}
            </MenuItemGroup>
        </Menu>
    );
}

export default function AppearanceToggleDropdown({ style, className }: { style?: CSSProperties; className?: string }) {
    const { appearance } = useAppearance();
    const [opener, setOpener] = useState<HTMLElement | null>(null);

    return (
        <span style={{ display: 'inline-flex', ...style }} className={className}>
            <Button
                design="Transparent"
                icon={appearanceIcon(appearance)}
                tooltip="Toggle theme"
                accessibleName="Toggle theme"
                onClick={(e) => setOpener(opener ? null : (e.currentTarget as HTMLElement))}
            />
            <AppearanceMenu open={!!opener} opener={opener} onClose={() => setOpener(null)} />
        </span>
    );
}
