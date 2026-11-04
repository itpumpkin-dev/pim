import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import {
    BusyIndicator,
    Button,
    Icon,
    Input,
    Option,
    OptionGroup,
    SegmentedButton,
    SegmentedButtonItem,
    Select,
    Tag,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './marketplace-mapping-ui.module.css';

/**
 * Small UI5 building blocks shared by the marketplace mapping screens
 * (categories/{shopee,lazada,tiktok,woocommerce}-mapping.tsx, the
 * Shopee/TikTok brand mapping panels and AttributeMappingTable) — they all
 * render the same header / stat tiles / search + pager toolbar / mapping chips,
 * so the layout lives here once instead of four copies of the same markup.
 */

export { styles as mappingStyles };

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ') || undefined;

export function MappingPage({ children }: { children: ReactNode }) {
    return <div className={styles.page}>{children}</div>;
}

export function MappingPageHeader({
    backLabel,
    onBack,
    title,
    subtitle,
    actions,
}: {
    backLabel: string;
    onBack: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className={styles.pageHeader}>
            <div className={styles.pageHeaderText}>
                <Button design="Transparent" icon="nav-back" onClick={onBack} className={styles.backButton}>
                    {backLabel}
                </Button>
                <Title level="H2" size="H3" wrappingType="Normal">
                    {title}
                </Title>
                <div className={styles.divider} />
                {subtitle && <Text className={styles.subtitle}>{subtitle}</Text>}
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
        </div>
    );
}

export interface MappingStatTile {
    label: string;
    value: number;
    accent?: boolean;
}

export function MappingStatTiles({ tiles }: { tiles: MappingStatTile[] }) {
    return (
        <div className={styles.statTiles}>
            {tiles.map((tile) => (
                <div key={tile.label} className={styles.statTile}>
                    <span className={styles.statLabel}>{tile.label}</span>
                    <span className={cx(styles.statValue, tile.accent && styles.statValueAccent)}>{tile.value.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}

/** Search on the left, filter/pager controls on the right (stacked below 900px). */
export function MappingToolbar({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
    return <div className={cx(styles.toolbar, compact && styles.toolbarCompact)}>{children}</div>;
}

export function MappingToolbarGroup({ children }: { children: ReactNode }) {
    return <div className={styles.toolbarGroup}>{children}</div>;
}

export function MappingSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <Input
            className={styles.searchInput}
            value={value}
            placeholder={placeholder}
            showClearIcon
            icon={<Icon name="search" />}
            onInput={(e) => onChange(e.target.value)}
        />
    );
}

export function MappingFilterToggle<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <SegmentedButton
            onSelectionChange={(e) => {
                const next = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as T | undefined;
                if (next) onChange(next);
            }}
        >
            {options.map((option) => (
                <SegmentedButtonItem key={option.value} data-value={option.value} selected={value === option.value}>
                    {option.label}
                </SegmentedButtonItem>
            ))}
        </SegmentedButton>
    );
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/** "per page" select + "page N of M" + first/prev/next/last buttons (no UI5 equivalent). */
export function MappingPager({
    perPage,
    onPerPageChange,
    currentPage,
    lastPage,
    onGoToPage,
    loading = false,
}: {
    perPage: number;
    onPerPageChange: (value: number) => void;
    currentPage: number;
    lastPage: number;
    onGoToPage: (page: number) => void;
    loading?: boolean;
}) {
    const { t: tGrid } = useTranslation('grid');
    const atFirst = currentPage <= 1;
    const atLast = currentPage >= lastPage;

    return (
        <div className={styles.pager}>
            {loading && <BusyIndicator active delay={0} size="S" />}

            <Select
                className={styles.perPageSelect}
                value={String(perPage)}
                accessibleName={tGrid('perPage')}
                onChange={(e) => onPerPageChange(Number(e.detail.selectedOption.value))}
            >
                {PER_PAGE_OPTIONS.map((n) => (
                    <Option key={n} value={String(n)}>
                        {n}
                    </Option>
                ))}
            </Select>
            <span className={styles.caption}>{tGrid('perPage')}</span>

            <span className={styles.pageBox}>{currentPage}</span>
            <span className={styles.caption}>{tGrid('pageOf', { lastPage })}</span>

            <div className={styles.pagerButtons}>
                <Button
                    design="Transparent"
                    icon="sys-first-page"
                    accessibleName="First page"
                    tooltip="First page"
                    disabled={atFirst}
                    onClick={() => onGoToPage(1)}
                />
                <Button
                    design="Transparent"
                    icon="slim-arrow-left"
                    accessibleName="Previous page"
                    tooltip="Previous page"
                    disabled={atFirst}
                    onClick={() => onGoToPage(currentPage - 1)}
                />
                <Button
                    design="Transparent"
                    icon="slim-arrow-right"
                    accessibleName="Next page"
                    tooltip="Next page"
                    disabled={atLast}
                    onClick={() => onGoToPage(currentPage + 1)}
                />
                <Button
                    design="Transparent"
                    icon="sys-last-page"
                    accessibleName="Last page"
                    tooltip="Last page"
                    disabled={atLast}
                    onClick={() => onGoToPage(lastPage)}
                />
            </div>
        </div>
    );
}

/** Section title row ("Lazada Brands", "Attributes for …") with a sync status message + action buttons on the right. */
export function MappingSectionHeader({
    title,
    message,
    actions,
    small = false,
}: {
    title: ReactNode;
    message?: ReactNode;
    actions?: ReactNode;
    /** subtitle-sized title with no top margin — for a panel embedded in another page's section */
    small?: boolean;
}) {
    return (
        <div className={cx(styles.sectionHeader, small && styles.sectionHeaderFlush)}>
            <Title level={small ? 'H5' : 'H4'} size={small ? 'H6' : 'H5'} wrappingType="Normal">
                {title}
            </Title>
            {(message || actions) && (
                <div className={styles.toolbarGroup}>
                    {message && <span className={styles.syncMessage}>{message}</span>}
                    {actions}
                </div>
            )}
        </div>
    );
}

export function MappingEmptyPrompt({ children }: { children: ReactNode }) {
    return <div className={styles.emptyPrompt}>{children}</div>;
}

/** Default-design button with the "synchronize" icon that turns into a busy indicator while `busy`. */
export function MappingSyncButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <Button icon={busy ? undefined : 'synchronize'} loading={busy} loadingDelay={0} disabled={busy} onClick={onClick}>
            {children}
        </Button>
    );
}

/** A mapped PIM category (green) or a staged-but-unsaved change (dashed amber), with a remove/undo "×". */
export function MappingChip({
    label,
    variant,
    onDelete,
    deleteLabel,
}: {
    label: string;
    variant: 'mapped' | 'pending';
    onDelete: () => void;
    deleteLabel: string;
}) {
    return (
        <span className={cx(styles.chip, variant === 'mapped' ? styles.chipMapped : styles.chipPending)} title={label}>
            <span className={styles.chipLabel}>{label}</span>
            <Button
                design="Transparent"
                icon="decline"
                className={styles.chipDelete}
                tooltip={deleteLabel}
                accessibleName={deleteLabel}
                onClick={onDelete}
            />
        </span>
    );
}

export function LeafStatusTag({ leaf, label }: { leaf: boolean; label: string }) {
    return (
        <Tag design={leaf ? 'Positive' : 'Neutral'} hideStateIcon>
            {label}
        </Tag>
    );
}

export function MandatoryTag({ label }: { label: string }) {
    return (
        <Tag design="Critical" hideStateIcon>
            {label}
        </Tag>
    );
}

/** A picker in a table cell plus a small busy indicator while that row's mapping is being saved. */
export function MappingPickerCell({ saving, children }: { saving: boolean; children: ReactNode }) {
    return (
        <div className={styles.pickerCell}>
            <div className={styles.pickerCellControl}>{children}</div>
            {saving && <BusyIndicator active delay={0} size="S" />}
        </div>
    );
}

/** Busy indicator for a table's `emptyMessage` while its rows are still loading. */
export function MappingLoading() {
    return <BusyIndicator active delay={0} size="M" />;
}

export interface MappingTargetOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface MappingTargetGroup {
    header: string;
    options: MappingTargetOption[];
}

/**
 * The "Map to" select of an attribute-mapping row: a leading "not used"
 * option plus titled groups (UI5 `OptionGroup`). UI5 `Option` has no public
 * `disabled` — the protected property is still set (greys it out + blocks
 * clicks) and a pick of a disabled option is additionally reverted here, so
 * keyboard selection can't slip through either.
 */
export function MappingTargetSelect({
    value,
    onChange,
    emptyLabel,
    groups,
}: {
    value: string;
    onChange: (value: string) => void;
    emptyLabel: string;
    groups: MappingTargetGroup[];
}) {
    const disabledValues = new Set(groups.flatMap((g) => g.options.filter((o) => o.disabled).map((o) => o.value)));

    return (
        <Select
            style={{ width: '100%' }}
            value={value}
            onChange={(e) => {
                const next = e.detail.selectedOption.value ?? '';
                if (disabledValues.has(next)) {
                    e.target.value = value;
                    return;
                }
                onChange(next);
            }}
        >
            <Option value="">{emptyLabel}</Option>
            {groups.map((group) => (
                <OptionGroup key={group.header} headerText={group.header}>
                    {group.options.map((option) => (
                        <Option key={option.value} value={option.value} {...(option.disabled ? ({ disabled: true } as Record<string, unknown>) : {})}>
                            {option.label}
                        </Option>
                    ))}
                </OptionGroup>
            ))}
        </Select>
    );
}
