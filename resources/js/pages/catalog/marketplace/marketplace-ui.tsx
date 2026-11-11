/**
 * Shared UI5 building blocks for the catalog/marketplace/* product pages
 * (Lazada/Shopee/TikTok/WooCommerce "สินค้า (Product Mapping)" + Lazada
 * Master Product List). Pure presentation — no data fetching, no Inertia
 * calls — so each page keeps its own data flow exactly as before and only
 * the markup is shared.
 *
 * NB: lives under pages/ (Inertia's page glob picks it up as a lazy chunk but
 * nothing ever resolves it as a page — it has no default export).
 */
import '@ui5/webcomponents-icons/dist/locked.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { BusyIndicator, Button, Icon, Input, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { forwardRef, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import styles from './marketplace.module.css';

export { styles as marketplaceStyles };

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

/** semantic text colours (UI5 theme) — replaces FIORI.success/warning/error/textSecondary in converted code */
export const TONE_TEXT = {
    success: 'var(--sapPositiveTextColor)',
    warning: 'var(--sapCriticalTextColor)',
    error: 'var(--sapNegativeTextColor)',
    neutral: 'var(--sapContent_LabelColor)',
    brand: 'var(--sapBrandColor)',
    text: 'var(--sapTextColor)',
} as const;

/** `window.matchMedia` hook (replaces MUI useMediaQuery / responsive `sx` breakpoints). */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}

/** Small/medium inline busy indicator (MUI CircularProgress replacement). */
export function Spinner({ size = 'S', style }: { size?: 'S' | 'M' | 'L'; style?: CSSProperties }) {
    return <BusyIndicator active delay={0} size={size} style={style} />;
}

/** Centered spinner block used while a section is loading. */
export function CenteredSpinner({ padding = '2rem 0' }: { padding?: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding }}>
            <Spinner size="M" />
        </div>
    );
}

/** Secondary caption text (MUI Typography variant="caption"). */
export function Caption({ children, mono, block, style }: { children: ReactNode; mono?: boolean; block?: boolean; style?: CSSProperties }) {
    return (
        <span className={styles.caption} style={{ display: block ? 'block' : undefined, fontFamily: mono ? 'monospace' : undefined, ...style }}>
            {children}
        </span>
    );
}

/** Body text paragraph (MUI Typography variant="body2"). */
export function Body({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    return <div style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapTextColor)', ...style }}>{children}</div>;
}

/** Page title + subtitle row with optional trailing actions. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}
        >
            <div>
                <Title level="H4" size="H4" wrappingType="Normal" className={styles.pageTitle}>
                    {title}
                </Title>
                {subtitle && <Text className={styles.subtitle}>{subtitle}</Text>}
            </div>
            {actions}
        </div>
    );
}

/** Search box with a trailing search icon (MUI TextField + InputAdornment). */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <Input
            value={value}
            placeholder={placeholder}
            onInput={(e) => onChange(e.target.value ?? '')}
            icon={<Icon name="search" />}
            showClearIcon
            className={styles.searchField}
        />
    );
}

/** per-page select + current page / last page + first/prev/next/last buttons — same pattern as products/index.tsx. */
export function Pager({
    currentPage,
    lastPage,
    perPage,
    perPageLabel,
    onPerPageChange,
    onGoToPage,
}: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    perPageLabel: string;
    onPerPageChange: (value: number) => void;
    onGoToPage: (page: number) => void;
}) {
    return (
        <div className={styles.pager}>
            <Select
                value={String(perPage)}
                onChange={(e) => onPerPageChange(Number(e.detail.selectedOption.value))}
                style={{ width: '5rem', minWidth: 0 }}
                accessibleName={perPageLabel}
            >
                {[10, 25, 50, 100].map((n) => (
                    <Option key={n} value={String(n)}>
                        {n}
                    </Option>
                ))}
            </Select>
            <span className={styles.muted} style={{ fontSize: 'var(--sapFontSize)' }}>
                {perPageLabel}
            </span>
            <span className={styles.pageBox}>{currentPage}</span>
            <span className={styles.muted} style={{ fontSize: 'var(--sapFontSize)' }}>
                / {lastPage}
            </span>
            <div style={{ display: 'flex' }}>
                <Button
                    design="Transparent"
                    icon="sys-first-page"
                    accessibleName="First page"
                    disabled={currentPage <= 1}
                    onClick={() => onGoToPage(1)}
                />
                <Button
                    design="Transparent"
                    icon="slim-arrow-left"
                    accessibleName="Previous page"
                    disabled={currentPage <= 1}
                    onClick={() => onGoToPage(currentPage - 1)}
                />
                <Button
                    design="Transparent"
                    icon="slim-arrow-right"
                    accessibleName="Next page"
                    disabled={currentPage >= lastPage}
                    onClick={() => onGoToPage(currentPage + 1)}
                />
                <Button
                    design="Transparent"
                    icon="sys-last-page"
                    accessibleName="Last page"
                    disabled={currentPage >= lastPage}
                    onClick={() => onGoToPage(lastPage)}
                />
            </div>
        </div>
    );
}

export interface KpiTile<F extends string> {
    label: string;
    value: number;
    tone?: 'success' | 'warning';
    filterValue: F;
}

/** Clickable KPI strip above the product table — clicking a tile applies its filter. */
export function KpiTiles<F extends string>({ tiles, active, onSelect }: { tiles: KpiTile<F>[]; active: F; onSelect: (value: F) => void }) {
    return (
        <div className={styles.kpiStrip}>
            {tiles.map((kpi) => (
                <div
                    key={kpi.label}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(kpi.filterValue)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(kpi.filterValue);
                        }
                    }}
                    className={cx(styles.kpiTile, active === kpi.filterValue && styles.kpiTileActive)}
                >
                    <span className={styles.kpiLabel}>{kpi.label}</span>
                    <span className={styles.kpiValue} style={{ color: kpi.tone ? TONE_TEXT[kpi.tone] : TONE_TEXT.text }}>
                        {kpi.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Object Page section card — forwards its ref for the scroll-spy anchor bar. */
export const SectionCard = forwardRef<HTMLDivElement, { children: ReactNode; scrollMarginTop?: number; style?: CSSProperties }>(function SectionCard(
    { children, scrollMarginTop, style },
    ref,
) {
    return (
        <div
            ref={ref}
            // sectionCard = hover tint per step (see marketplace.module.css)
            className={`${styles.card} ${styles.sectionCard}`}
            style={{ padding: '1.5rem', scrollMarginTop: scrollMarginTop ? `${scrollMarginTop}px` : undefined, ...style }}
        >
            {children}
        </div>
    );
});

/** Bold section heading + secondary description. */
export function SectionHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
    return (
        <div>
            <Title level="H6" size="H6" wrappingType="Normal" style={{ display: 'block' }}>
                {title}
            </Title>
            {description && (
                <div style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapContent_LabelColor)', marginTop: '0.25rem' }}>{description}</div>
            )}
        </div>
    );
}

/** Centered lock icon + message for a section that isn't available yet. */
export function LockedNotice({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '2rem 0',
                color: 'var(--sapContent_LabelColor)',
            }}
        >
            <Icon name="locked" style={{ width: '1.25rem', height: '1.25rem', color: 'var(--sapContent_LabelColor)' }} />
            <span style={{ fontSize: 'var(--sapFontSize)' }}>{children}</span>
        </div>
    );
}

/** Vertical gap stack (MUI Stack spacing). */
export function VStack({ gap = '1rem', children, style }: { gap?: string; children: ReactNode; style?: CSSProperties }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

/** Horizontal row (MUI Stack direction="row"). */
export function HStack({
    gap = '0.5rem',
    align = 'center',
    justify,
    wrap,
    children,
    style,
}: {
    gap?: string;
    align?: CSSProperties['alignItems'];
    justify?: CSSProperties['justifyContent'];
    wrap?: boolean;
    children: ReactNode;
    style?: CSSProperties;
}) {
    return (
        <div style={{ display: 'flex', alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, gap, ...style }}>
            {children}
        </div>
    );
}

/** Simple two-column mapping table (platform attribute ↔ PIM attribute) with a header row and row hover. */
export function MappingTable({ headers, children }: { headers: [ReactNode, ReactNode]; children: ReactNode }) {
    return (
        <table className={styles.mapTable}>
            <thead>
                <tr>
                    <th>{headers[0]}</th>
                    <th>{headers[1]}</th>
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    );
}

export interface ValueRow {
    label: string;
    value: string | null;
    type?: string | null;
    mandatory?: boolean;
}

/** label/value list with dividers (quick-view tabs + push-confirm review). Empty values show in the error colour. */
export function ValueRows({
    rows,
    showRequired,
    requiredLabel = 'จำเป็น',
    emptyLabel = '— ยังไม่ได้กรอก —',
    rowPadding = '0.5rem 0',
    style,
}: {
    rows: ValueRow[];
    showRequired?: boolean;
    requiredLabel?: string;
    emptyLabel?: string;
    rowPadding?: string;
    style?: CSSProperties;
}) {
    return (
        <div style={style}>
            {rows.map((row, idx) => (
                <div
                    key={idx}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        padding: rowPadding,
                        borderTop: idx > 0 ? '1px solid var(--sapGroup_ContentBorderColor)' : undefined,
                    }}
                >
                    <div style={{ flexShrink: 0 }}>
                        <Body>
                            {row.label}{' '}
                            {showRequired && row.mandatory && (
                                <span style={{ fontSize: 'var(--sapFontSmallSize)', color: TONE_TEXT.warning, fontWeight: 700 }}>
                                    {requiredLabel}
                                </span>
                            )}
                        </Body>
                        {row.type && <Caption block>{row.type}</Caption>}
                    </div>
                    <Body style={{ color: row.value ? TONE_TEXT.text : TONE_TEXT.error, fontWeight: row.value ? 400 : 600, textAlign: 'right' }}>
                        {row.value ?? emptyLabel}
                    </Body>
                </div>
            ))}
        </div>
    );
}

/** Thumbnail strip for the platform images (hides broken images instead of showing the browser's broken icon). */
export function ImageThumbs({ urls, size, alt, style }: { urls: string[]; size: number; alt: (idx: number) => string; style?: CSSProperties }) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', ...style }}>
            {urls.map((url, idx) => (
                <img
                    key={idx}
                    src={url}
                    alt={alt(idx)}
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                    }}
                    className={styles.thumb}
                    style={{ width: size, height: size }}
                />
            ))}
        </div>
    );
}
