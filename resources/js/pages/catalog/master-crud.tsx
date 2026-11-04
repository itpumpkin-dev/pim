import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sort-ascending.js';
import '@ui5/webcomponents-icons/dist/sort-descending.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, Icon, Input, Tag, Title } from '@ui5/webcomponents-react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriFormErrorSummary } from '@/components/fiori-form';

import styles from './master-crud.module.css';

/**
 * Shared UI5 building blocks for the Catalog master-data CRUD pages
 * (brands, base units, currencies, vendors, …) so every index / create / edit
 * screen has the same Fiori layout:
 *
 *  - <MasterListPage>     page shell for an index: title + intro + "Add" button
 *  - <MasterListToolbar>  results count (left) + search field / extra filters (right)
 *  - <MasterPagination>   first / prev / current / next / last page buttons
 *  - <SortableHeader>     clickable column header with the current sort direction
 *  - <RowActions>         the right-aligned edit / delete icon buttons in a row
 *  - <CountTag>           interactive count tag (e.g. "products using this")
 *  - <MasterFormPage>     page shell for create / edit: title, Back + Save, error summary
 *
 * Only presentation lives here — each page keeps its own data handling,
 * Inertia calls, permission checks and i18n keys.
 */

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

interface MasterListPageProps {
    title: ReactNode;
    intro?: ReactNode;
    /** label of the emphasized "Add" button; the button only renders when `onAdd` is given */
    addLabel?: ReactNode;
    onAdd?: () => void;
    /** extra header buttons rendered before the Add button */
    actions?: ReactNode;
    /** rendered above the title (e.g. a section tab strip) */
    before?: ReactNode;
    children: ReactNode;
    style?: CSSProperties;
}

export function MasterListPage({ title, intro, addLabel, onAdd, actions, before, children, style }: MasterListPageProps) {
    return (
        <div className={styles.page} style={style}>
            {before}
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <Title level="H2" size="H3" wrappingType="Normal">
                        {title}
                    </Title>
                    {intro && <span className={styles.intro}>{intro}</span>}
                </div>
                {(actions || onAdd) && (
                    <div className={styles.headerActions}>
                        {actions}
                        {onAdd && (
                            <Button design="Emphasized" icon="add" onClick={onAdd}>
                                {addLabel}
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}

interface MasterListToolbarProps {
    /** e.g. tGrid('results', { count }) */
    resultsLabel?: ReactNode;
    search?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    /** extra controls (filters) rendered after the results label */
    start?: ReactNode;
    /** extra controls rendered before the search field */
    end?: ReactNode;
}

export function MasterListToolbar({ resultsLabel, search, onSearchChange, searchPlaceholder, start, end }: MasterListToolbarProps) {
    return (
        <div className={styles.toolbar}>
            <div className={styles.toolbarStart}>
                {resultsLabel !== undefined && <span className={styles.muted}>{resultsLabel}</span>}
                {start}
            </div>
            <div className={styles.toolbarEnd}>
                {end}
                {onSearchChange && (
                    <Input
                        className={styles.search}
                        value={search ?? ''}
                        placeholder={searchPlaceholder}
                        accessibleName={searchPlaceholder}
                        showClearIcon
                        icon={<Icon name="search" />}
                        onInput={(e) => onSearchChange(e.target.value)}
                    />
                )}
            </div>
        </div>
    );
}

interface MasterPaginationProps {
    currentPage: number;
    lastPage: number;
    /** e.g. tGrid('pageOf', { lastPage }) */
    label: ReactNode;
    onPageChange: (page: number) => void;
    /** extra controls (e.g. a per-page Select) rendered before the label */
    children?: ReactNode;
}

export function MasterPagination({ currentPage, lastPage, label, onPageChange, children }: MasterPaginationProps) {
    const atStart = currentPage <= 1;
    const atEnd = currentPage >= lastPage;

    return (
        <div className={styles.pagination}>
            {children}
            <span className={styles.muted}>{label}</span>
            <div className={styles.paginationButtons}>
                <Button design="Transparent" icon="sys-first-page" accessibleName="«" disabled={atStart} onClick={() => onPageChange(1)} />
                <Button
                    design="Transparent"
                    icon="slim-arrow-left"
                    accessibleName="‹"
                    disabled={atStart}
                    onClick={() => onPageChange(currentPage - 1)}
                />
                <span className={styles.currentPage}>{currentPage}</span>
                <Button
                    design="Transparent"
                    icon="slim-arrow-right"
                    accessibleName="›"
                    disabled={atEnd}
                    onClick={() => onPageChange(currentPage + 1)}
                />
                <Button design="Transparent" icon="sys-last-page" accessibleName="»" disabled={atEnd} onClick={() => onPageChange(lastPage)} />
            </div>
        </div>
    );
}

interface SortableHeaderProps {
    label: string;
    active: boolean;
    direction: 'asc' | 'desc';
    onSort: () => void;
}

/** Replaces MUI `TableSortLabel`: a header-styled button with the active sort direction icon. */
export function SortableHeader({ label, active, direction, onSort }: SortableHeaderProps) {
    const dir = active ? direction : 'asc';
    return (
        <button
            type="button"
            className={styles.sortHeader}
            onClick={onSort}
            aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
        >
            <span>{label}</span>
            <Icon name={dir === 'asc' ? 'sort-ascending' : 'sort-descending'} className={cx(styles.sortIcon, active && styles.sortIconActive)} />
        </button>
    );
}

interface RowActionsProps {
    onEdit?: () => void;
    onDelete?: () => void;
    /** extra row buttons rendered before edit/delete */
    children?: ReactNode;
}

export function RowActions({ onEdit, onDelete, children }: RowActionsProps) {
    const { t: tGrid } = useTranslation('grid');
    return (
        <div className={styles.rowActions}>
            {children}
            {onEdit && (
                <Button
                    design="Transparent"
                    icon="edit"
                    tooltip={tGrid('rowActions.edit')}
                    accessibleName={tGrid('rowActions.edit')}
                    onClick={onEdit}
                />
            )}
            {onDelete && (
                <Button
                    design="Transparent"
                    icon="delete"
                    tooltip={tGrid('rowActions.delete')}
                    accessibleName={tGrid('rowActions.delete')}
                    onClick={onDelete}
                />
            )}
        </div>
    );
}

/** Interactive count tag (replaces the clickable blue MUI count Chip). Renders a muted "0" when empty. */
export function CountTag({ count, tooltip, onClick }: { count: number; tooltip?: string; onClick: () => void }) {
    if (!count) return <span className={styles.dash}>0</span>;
    return (
        <Tag design="Information" interactive title={tooltip} onClick={onClick} style={{ fontWeight: 700 }}>
            {count}
        </Tag>
    );
}

/** Bold primary cell text (row identifier). */
export function StrongText({ children }: { children: ReactNode }) {
    return <span className={styles.strong}>{children}</span>;
}

/** Secondary cell text; renders a muted dash when empty. `maxWidth` truncates with an ellipsis. */
export function SecondaryText({ value, maxWidth }: { value: ReactNode; maxWidth?: number }) {
    if (value === null || value === undefined || value === '') return <span className={styles.dash}>—</span>;
    return (
        <span className={cx(styles.secondary, maxWidth !== undefined && styles.ellipsis)} style={maxWidth !== undefined ? { maxWidth } : undefined}>
            {value}
        </span>
    );
}

export const masterStyles = styles;

interface MasterFormPageProps {
    title: ReactNode;
    /** where "Back" goes */
    backHref: string;
    processing: boolean;
    onSubmit: (event: FormEvent) => void;
    /** Inertia `errors` — shows the error summary strip below the form when non-empty */
    errors: Record<string, string | undefined>;
    children: ReactNode;
    /** @default 760 */
    maxWidth?: number;
    /** extra header buttons rendered between Back and Save */
    actions?: ReactNode;
    /** hide the Save button (read-only view) */
    hideSave?: boolean;
    /** keep Save disabled (e.g. a required picker is still empty) */
    saveDisabled?: boolean;
    /** rendered above the title (e.g. a General / History tab strip) */
    before?: ReactNode;
}

/**
 * Create / edit page shell: a native <form> (so Enter-to-submit and the
 * page's own `submit(event)` keep working — Save is a UI5 `type="Submit"`
 * button, which calls `form.requestSubmit()`), title + Back + Save header,
 * a column of form groups and the error summary strip.
 */
export function MasterFormPage({
    title,
    backHref,
    processing,
    onSubmit,
    errors,
    children,
    saveDisabled = false,
    maxWidth = 760,
    actions,
    hideSave = false,
    before,
}: MasterFormPageProps) {
    const { t } = useTranslation('catalog');

    return (
        <form onSubmit={onSubmit} className={styles.formPage} style={{ '--master-form-max-width': `${maxWidth}px` } as CSSProperties}>
            {before}
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <Title level="H2" size="H3" wrappingType="Normal">
                        {title}
                    </Title>
                </div>
                <div className={styles.headerActions}>
                    <Button icon="nav-back" onClick={() => router.visit(backHref)}>
                        {t('back')}
                    </Button>
                    {actions}
                    {!hideSave && (
                        <Button
                            type="Submit"
                            design="Emphasized"
                            icon="save"
                            disabled={processing || saveDisabled}
                            loading={processing}
                            loadingDelay={0}
                        >
                            {processing ? t('saving') : t('save')}
                        </Button>
                    )}
                </div>
            </div>

            <div className={styles.formStack}>{children}</div>

            <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} className={styles.errorSummary} />
        </form>
    );
}
