import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    useMediaQuery,
    useTheme,
    type SxProps,
    type Theme,
} from '@mui/material';
import { Fragment, type ReactNode } from 'react';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';

/**
 * Column pop-in priority, modeled on SAP Fiori's responsive table
 * (https://www.sap.com/design-system/fiori-design-web/ui-elements/responsive-table):
 * on a narrow viewport, lower-priority columns leave the table grid and
 * reflow as label/value pairs in a "pop-in" area beneath the row, instead of
 * the table gaining a horizontal scrollbar. `always` never pops — reserve it
 * for the column that identifies the row (and, if the row is directly
 * actionable, the control the user actually needs — see
 * AttributeMappingTable's "Map to" column) since it's the only thing
 * guaranteed visible on a phone.
 */
export type FioriColumnPriority = 'always' | 'high' | 'medium' | 'low';

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
}

export interface FioriResponsiveTableProps<Row> {
    columns: FioriResponsiveColumn<Row>[];
    rows: Row[];
    getRowKey: (row: Row) => string | number;
    rowSx?: (row: Row) => SxProps<Theme>;
    /** Makes the whole row (grid row + its pop-in area) clickable, e.g. to navigate to a detail page — mirrors a plain `<TableRow onClick>`. Adds a pointer cursor automatically. */
    onRowClick?: (row: Row) => void;
    emptyMessage?: ReactNode;
    size?: 'small' | 'medium';
    /**
     * 'card' (default) wraps the table in its own bordered/rounded Fiori
     * surface — for a table that's the whole card. 'plain' skips that (no
     * Paper, no border/radius) for a table already nested inside another
     * Fiori card alongside its own toolbar (e.g. attributes/index.tsx),
     * where a second border would double up against the outer one.
     */
    variant?: 'card' | 'plain';
}

/** Which priority tiers stay as real columns at the current breakpoint — narrower viewport keeps fewer tiers, mirroring Fiori's auto pop-in mode. */
function useVisiblePriorities(): FioriColumnPriority[] {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const isSm = useMediaQuery(theme.breakpoints.between('sm', 'md'));
    const isMd = useMediaQuery(theme.breakpoints.between('md', 'lg'));

    if (isXs) return ['always'];
    if (isSm) return ['always', 'high'];
    if (isMd) return ['always', 'high', 'medium'];
    return ['always', 'high', 'medium', 'low'];
}

const headCellSx = {
    fontWeight: 600,
    color: FIORI.textPrimary,
    borderBottom: `1px solid ${FIORI.border}`,
};

/**
 * Fiori "Responsive Table": a normal grid on desktop, with lower-priority
 * columns reflowing into a label/value pop-in area beneath each row once the
 * viewport is too narrow to fit them — see `FioriColumnPriority`. Shared
 * across every catalog admin list/mapping table instead of each page
 * hand-rolling its own `<TableContainer>` breakpoint logic.
 */
export function FioriResponsiveTable<Row>({ columns, rows, getRowKey, rowSx, onRowClick, emptyMessage, size = 'small', variant = 'card' }: FioriResponsiveTableProps<Row>) {
    const visiblePriorities = useVisiblePriorities();
    const visibleColumns = columns.filter((c) => visiblePriorities.includes(c.priority ?? 'always'));
    const popinColumns = columns.filter((c) => !visiblePriorities.includes(c.priority ?? 'always') && !c.hideInPopin);
    const hasPopin = popinColumns.length > 0;
    const colSpan = visibleColumns.length || 1;

    const table = (
        <Table size={size}>
            <TableHead sx={{ bgcolor: FIORI.headerBg }}>
                <TableRow>
                    {visibleColumns.map((column) => (
                        <TableCell
                            key={column.key}
                            align={column.align}
                            sx={{ ...headCellSx, width: column.width, minWidth: column.minWidth }}
                        >
                            {column.header}
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => {
                    const key = getRowKey(row);
                    const rowStyle = [
                        { '&:hover': { bgcolor: FIORI.hover } },
                        onRowClick ? { cursor: 'pointer' } : {},
                        rowSx?.(row) ?? {},
                    ] as SxProps<Theme>;
                    const handleRowClick = onRowClick ? () => onRowClick(row) : undefined;

                    return (
                        <Fragment key={key}>
                            <TableRow sx={rowStyle} onClick={handleRowClick}>
                                {visibleColumns.map((column) => (
                                    <TableCell
                                        key={column.key}
                                        align={column.align}
                                        sx={{ borderBottom: hasPopin ? 'none' : `1px solid ${FIORI.border}` }}
                                    >
                                        {column.render(row)}
                                    </TableCell>
                                ))}
                            </TableRow>

                            {hasPopin && (
                                <TableRow sx={rowStyle} onClick={handleRowClick}>
                                    <TableCell colSpan={colSpan} sx={{ pt: 0, pb: 1.25, borderBottom: `1px solid ${FIORI.border}` }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                            {popinColumns.map((column) => (
                                                <Box key={column.key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ color: FIORI.textSecondary, fontWeight: 600, flexShrink: 0, pt: '2px' }}
                                                    >
                                                        {column.header}
                                                    </Typography>
                                                    <Box sx={{ textAlign: 'right', minWidth: 0 }}>{column.render(row)}</Box>
                                                </Box>
                                            ))}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            )}
                        </Fragment>
                    );
                })}

                {rows.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">{emptyMessage}</Typography>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );

    if (variant === 'plain') {
        return <TableContainer>{table}</TableContainer>;
    }

    return (
        <TableContainer component={Paper} elevation={0} sx={fioriCardSx}>
            {table}
        </TableContainer>
    );
}
