import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/badge.js';
import '@ui5/webcomponents-icons/dist/building.js';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/database.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/download-from-cloud.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/employee.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/globe.js';
import '@ui5/webcomponents-icons/dist/group.js';
import '@ui5/webcomponents-icons/dist/log.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/role.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/settings.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sort.js';
import '@ui5/webcomponents-icons/dist/switch-classes.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import '@ui5/webcomponents-icons/dist/task.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import { Icon as Ui5Icon, type IconPropTypes } from '@ui5/webcomponents-react';
import type { CSSProperties } from 'react';

/**
 * Curated semantic icon names → SAP-icons (Horizon) names. Every SAP icon
 * listed here is side-effect imported above (each import registers just that
 * one glyph, v4 + v5), so `<Icon name="…" />` from this module always
 * renders — no wildcard "import every icon" anywhere.
 *
 * Naming is our own semantic name (matching what the MUI icon it replaced
 * was used for, or — for `nav*` — what sidebar item it labels), not always
 * the SAP-icons name. `close`/`cancel` both point at "decline";
 * `chevronRight`/`expandMore` point at slim-arrow-right/down (row-expand
 * toggles). `navExport` reuses "upload-to-cloud" like `upload`.
 *
 * Need the raw SAP name (e.g. for `<Button icon="…">`)? Use `ICON_NAMES[name]`
 * — and keep the matching side-effect import (already done here).
 */
export const ICON_NAMES = {
    search: 'search',
    edit: 'edit',
    delete: 'delete',
    save: 'save',
    add: 'add',
    close: 'decline',
    cancel: 'decline',
    back: 'nav-back',
    firstPage: 'sys-first-page',
    lastPage: 'sys-last-page',
    chevronLeft: 'slim-arrow-left',
    chevronRight: 'slim-arrow-right',
    expandMore: 'slim-arrow-down',
    sync: 'synchronize',
    filter: 'filter',
    sort: 'sort',
    copy: 'copy',
    download: 'download',
    upload: 'upload-to-cloud',
    play: 'play',
    view: 'show',

    // ── nav-secondary.tsx (root items of the second sidebar) ──
    navProduct: 'product',
    navMaster: 'database',
    navAttributes: 'tag',
    navManagement: 'settings',
    navImport: 'download-from-cloud',
    navExport: 'upload-to-cloud',
    navJobTracker: 'task',
    navWooConvert: 'switch-classes',
    navChannels: 'chain-link',
    navUsers: 'employee',
    navUserGroups: 'group',
    navDepartments: 'building',
    navJobPositions: 'badge',
    navRoles: 'role',
    navLocales: 'globe',
    navTranslationProviders: 'translate',
    navActivityLogs: 'log',
} as const;

export type IconName = keyof typeof ICON_NAMES;

/** @deprecated MUI-style sizes kept for old call sites — prefer `style={{ width, height }}`. */
type LegacyFontSize = 'small' | 'medium' | 'large' | 'inherit';

const LEGACY_SIZE: Record<LegacyFontSize, string> = { small: '1.25rem', medium: '1.5rem', large: '2.1875rem', inherit: '1em' };

export interface AppIconProps extends Omit<IconPropTypes, 'name'> {
    name: IconName;
    /** @deprecated use `style={{ width, height }}` */
    fontSize?: LegacyFontSize;
    style?: CSSProperties;
    className?: string;
    title?: string;
}

/**
 * UI5 `<Icon>` for one of our curated `IconName`s. Size via
 * `style={{ width: '1rem', height: '1rem' }}` (UI5 default is 1rem); colour
 * via `style={{ color }}`. Accepts every other UI5 Icon prop (`design`,
 * `mode`, `accessibleName`, `showTooltip`, `onClick`, …).
 */
export function Icon({ name, fontSize, style, ...rest }: AppIconProps) {
    const size = fontSize ? LEGACY_SIZE[fontSize] : undefined;

    return <Ui5Icon name={ICON_NAMES[name]} style={size ? { width: size, height: size, ...style } : style} {...rest} />;
}
