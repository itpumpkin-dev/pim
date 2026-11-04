import { Icon } from '@ui5/webcomponents-react';
import { createElement, type ComponentType, type CSSProperties } from 'react';

/** A renderable icon component (size/colour via `style`). */
export type IconType = ComponentType<{ style?: CSSProperties; className?: string; fontSize?: 'small' | 'medium' | 'large' | 'inherit' }>;

const ICON_SIZE = { small: '1.25rem', medium: '1.5rem', large: '2.1875rem', inherit: '1em' } as const;

const cache = new Map<string, IconType>();

/**
 * Wrap a SAP-icons name as an `IconType` component. The caller must
 * side-effect import the icon module (`@ui5/webcomponents-icons/dist/<name>.js`).
 * Memoised per name so the component identity is stable across renders.
 */
export function sapIcon(name: string): IconType {
    const cached = cache.get(name);
    if (cached) {
        return cached;
    }
    const SapIcon: IconType = ({ style, className, fontSize }) => {
        const size = fontSize ? ICON_SIZE[fontSize] : undefined;
        return createElement(Icon, { name, className, style: size ? { width: size, height: size, ...style } : style });
    };
    SapIcon.displayName = `SapIcon(${name})`;
    cache.set(name, SapIcon);
    return SapIcon;
}
