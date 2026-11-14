import {
    Table,
    TableCell,
    TableGrowing,
    TableHeaderCell,
    TableHeaderRow,
    TableRow,
    TableSelectionMulti,
    type TablePropTypes,
} from '@ui5/webcomponents-react';
import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import styles from './fiori-responsive-table.module.css';

/**
 * Column pop-in priority, modeled on SAP Fiori's responsive table
 * (https://www.sap.com/design-system/fiori-design-web/ui-elements/responsive-table):
 * when the table is too narrow, lower-priority columns leave the table grid
 * and reflow as label/value pairs in a "pop-in" area beneath the row, instead
 * of the table gaining a horizontal scrollbar. Mapped onto the UI5 Table's
 * `importance` (always=3 > high=2 > medium=1 > low=0); UI5 never pops in the
 * single most important column, so `always` should be reserved for the column
 * that identifies the row (and, if the row is directly actionable, the
 * control the user actually needs).
 */
export type FioriColumnPriority = 'always' | 'high' | 'medium' | 'low';

const PRIORITY_IMPORTANCE: Record<FioriColumnPriority, number> = { always: 3, high: 2, medium: 1, low: 0 };

/**
 * Default column min-widths per priority. UI5's popin is width-driven (a
 * column moves into the popin when the table can't fit every column's
 * min-width), so lower tiers get a wider default min-width — they start
 * popping in earlier, approximating the old breakpoint tiers (xs: always,
 * sm: +high, md: +medium, lg: +low). An explicit `minWidth` wins.
 */
const PRIORITY_MIN_WIDTH: Record<FioriColumnPriority, string> = { always: '6rem', high: '8rem', medium: '10rem', low: '12rem' };

const ALIGN: Record<'left' | 'right' | 'center', 'Left' | 'Right' | 'Center'> = { left: 'Left', right: 'Right', center: 'Center' };

const toCssSize = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value);

export interface FioriResponsiveColumn<Row> {
    key: string;
    header: ReactNode;
    render: (row: Row) => ReactNode;
    align?: 'left' | 'right' | 'center';
    /** @default 'always' */
    priority?: FioriColumnPriority;
    width?: number | string;
    minWidth?: number | string;
    /** Drop this column entirely (not even in the pop-in area) instead of collapsing it — e.g. a decorative/redundant column. */
    hideInPopin?: boolean;
    /** Label used in the pop-in area. Defaults to `header` when that is a string; otherwise UI5 clones the header cell's DOM. */
    popinText?: string;
}

export interface FioriResponsiveTableProps<Row> {
    columns: FioriResponsiveColumn<Row>[];
    rows: Row[];
    getRowKey: (row: Row) => string | number;
    /** Extra class(es) on a row's `ui5-table-row` element (e.g. a highlight/pending tint from a CSS module). */
    rowClassName?: (row: Row) => string | undefined;
    /** @deprecated use `rowClassName` — inline style on the row's `ui5-table-row` element. */
    rowStyle?: (row: Row) => CSSProperties | undefined;
    /**
     * Makes the whole row clickable (UI5 `interactive` row + `row-click`), e.g.
     * to navigate to a detail page. UI5 only fires it when the row itself
     * receives the click — clicks on focusable content inside a cell
     * (buttons, links, inputs) do NOT trigger it, so cells no longer need
     * `stopPropagation()`.
     */
    onRowClick?: (row: Row) => void;
    emptyMessage?: ReactNode;
    /** 'small' (default) renders in UI5 compact density, 'medium' in cozy density. */
    size?: 'small' | 'medium';
    /**
     * 'card' (default) wraps the table in its own bordered/rounded Fiori
     * surface — for a table that's the whole card. 'plain' skips that for a
     * table already nested inside another card alongside its own toolbar,
     * where a second border would double up against the outer one.
     */
    variant?: 'card' | 'plain';
    /**
     * Pins the header row in place while the rows scroll past underneath.
     * Pair with `maxHeight` — the sticky header sticks against the nearest
     * scrolling ancestor, and `maxHeight` makes this component's own wrapper
     * that bounded, scrolling box.
     */
    stickyHeader?: boolean;
    /** Bounds the table's own height and makes it scroll internally — required for `stickyHeader` to actually stick (see above). */
    maxHeight?: number | string;
    /** Shows UI5's busy state over the table (after `loadingDelay`). */
    loading?: boolean;
    /** ms before the busy state appears — UI5's default is 1000, too late to notice for a ~0.5s server round-trip. */
    loadingDelay?: number;
    /**
     * Native Fiori multi-selection (UI5 `TableSelectionMulti`): adds the
     * standard selection column with a select-all header checkbox and the
     * theme's selected-row styling. Passing `onSelectionChange` turns it on;
     * `selectedKeys` are `getRowKey` values (keys of rows not on the current
     * page are kept as-is).
     */
    selectedKeys?: Array<string | number>;
    onSelectionChange?: (keys: string[]) => void;
    /**
     * Fiori "growing" (UI5 `TableGrowing`, Button mode): renders only the first
     * `growingPageSize` rows plus a "More [shown / total]" button that adds the
     * next page. For long client-side lists where mounting every row at once
     * (each a stack of UI5 web components) makes the page stall. Resets to the
     * first page whenever `rows` changes (e.g. a filter was applied).
     */
    growingPageSize?: number;
    style?: CSSProperties;
    className?: string;
}

/**
 * Fiori "Responsive Table" on top of the UI5 Web Components `Table`
 * (`overflowMode="Popin"`): a normal grid when there is room, with
 * lower-priority columns reflowing into a label/value pop-in area beneath
 * each row once the table is too narrow — see `FioriColumnPriority`.
 */
function FioriResponsiveTableInner<Row>({
    columns,
    rows,
    getRowKey,
    rowClassName,
    rowStyle,
    onRowClick,
    emptyMessage,
    size = 'small',
    variant = 'card',
    stickyHeader = false,
    maxHeight,
    loading = false,
    loadingDelay,
    selectedKeys,
    onSelectionChange,
    growingPageSize,
    style,
    className,
}: FioriResponsiveTableProps<Row>) {
    const [visibleCount, setVisibleCount] = useState(growingPageSize ?? Infinity);
    useEffect(() => {
        setVisibleCount(growingPageSize ?? Infinity);
    }, [rows, growingPageSize]);
    const visibleRows = useMemo(() => (visibleCount < rows.length ? rows.slice(0, visibleCount) : rows), [rows, visibleCount]);
    const canGrow = growingPageSize !== undefined && visibleRows.length < rows.length;

    // Built as an element array (not a fragment) so tables using neither
    // feature keep passing `undefined`, exactly as before growing existed.
    const features: ReactElement[] = [];
    if (onSelectionChange) {
        features.push(
            <TableSelectionMulti
                key="selection"
                selected={(selectedKeys ?? []).map(String).join(' ')}
                onChange={(event) => onSelectionChange(Array.from(event.target.getSelectedAsSet()))}
            />,
        );
    }
    if (canGrow) {
        features.push(
            <TableGrowing
                key="growing"
                mode="Button"
                subtext={`[ ${visibleRows.length} / ${rows.length} ]`}
                onLoadMore={() => setVisibleCount((count) => count + growingPageSize)}
            />,
        );
    }

    const rowsByKey = useMemo(() => new Map(rows.map((row) => [String(getRowKey(row)), row])), [rows, getRowKey]);

    const handleRowClick = useCallback<NonNullable<TablePropTypes['onRowClick']>>(
        (event) => {
            if (!onRowClick) return;
            const row = rowsByKey.get(event.detail.row.rowKey ?? '');
            if (row !== undefined) onRowClick(row);
        },
        [onRowClick, rowsByKey],
    );

    const table = (
        <Table
            className={styles.table}
            overflowMode="Popin"
            loading={loading}
            loadingDelay={loadingDelay}
            features={features.length === 0 ? undefined : features.length === 1 ? features[0] : features}
            onRowClick={onRowClick ? handleRowClick : undefined}
            noData={<div className={styles.empty}>{emptyMessage}</div>}
            headerRow={
                <TableHeaderRow sticky={stickyHeader}>
                    {columns.map((column) => {
                        const priority = column.priority ?? 'always';
                        return (
                            <TableHeaderCell
                                key={column.key}
                                importance={PRIORITY_IMPORTANCE[priority]}
                                horizontalAlign={column.align ? ALIGN[column.align] : undefined}
                                width={toCssSize(column.width)}
                                minWidth={toCssSize(column.minWidth) ?? PRIORITY_MIN_WIDTH[priority]}
                                popinHidden={column.hideInPopin}
                                popinText={column.popinText ?? (typeof column.header === 'string' ? column.header : undefined)}
                            >
                                {column.header}
                            </TableHeaderCell>
                        );
                    })}
                </TableHeaderRow>
            }
        >
            {visibleRows.map((row) => {
                const key = String(getRowKey(row));
                const extraClass = rowClassName?.(row);
                return (
                    <TableRow
                        key={key}
                        rowKey={key}
                        interactive={Boolean(onRowClick)}
                        className={[onRowClick ? styles.clickable : '', extraClass ?? ''].filter(Boolean).join(' ') || undefined}
                        style={rowStyle?.(row)}
                    >
                        {columns.map((column) => (
                            <TableCell key={column.key} horizontalAlign={column.align ? ALIGN[column.align] : undefined}>
                                {column.render(row)}
                            </TableCell>
                        ))}
                    </TableRow>
                );
            })}
        </Table>
    );

    const wrapperClass = [
        variant === 'card' ? styles.card : styles.plain,
        maxHeight !== undefined ? styles.scroll : '',
        size === 'small' ? 'ui5-content-density-compact' : '',
        className ?? '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={wrapperClass} style={{ maxHeight: toCssSize(maxHeight), ...style }}>
            {table}
        </div>
    );
}

// memo() ไว้เพราะตารางนี้ถูกใช้ทั่วแอป บางหน้า (เช่น products/edit.tsx variants
// table) ตอนนี้ส่ง columns/rows/getRowKey เป็น reference คงที่แล้ว (useMemo/
// useCallback) — memo ตรงนี้เลยช่วยให้ตารางข้ามการ re-render ทั้งก้อนได้จริง
// เวลามีอย่างอื่นในหน้า re-render โดยไม่เกี่ยวกับตารางเลย ส่วนหน้าที่ยังส่ง prop
// เป็น literal ใหม่ทุก render (เช่น array/ฟังก์ชัน inline) จะไม่ได้ประโยชน์ตรงนี้
// แต่ก็ไม่เสียอะไร — พฤติกรรมเหมือนเดิมทุกอย่าง แค่ไม่ได้ bail out เฉยๆ
// ต้อง cast กลับเป็น typeof ฟังก์ชันเดิมเพราะ memo() ทำให้ generic <Row> หายไป
export const FioriResponsiveTable = memo(FioriResponsiveTableInner) as typeof FioriResponsiveTableInner;
