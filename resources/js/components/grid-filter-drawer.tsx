import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Chip, Drawer, IconButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
    filterable?: boolean;
}

export interface DateRangeValue {
    from?: string;
    to?: string;
}

export type FilterValue = string | DateRangeValue;

const toDateInputValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const quickRanges: Record<string, () => [Date, Date]> = {
    Today: () => {
        const today = new Date();
        return [today, today];
    },
    Yesterday: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return [d, d];
    },
    'This Week': () => {
        const today = new Date();
        const day = today.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        const start = new Date(today);
        start.setDate(today.getDate() - diffToMonday);
        return [start, today];
    },
    'This Month': () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    },
    'Last Month': () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)];
    },
    'Last 3 Months': () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()), today];
    },
    'Last 6 Months': () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), today];
    },
    'This Year': () => {
        const today = new Date();
        return [new Date(today.getFullYear(), 0, 1), today];
    },
};

/**
 * Generic filter drawer driven by grid column metadata (the same
 * `gridConfig.columns` every grid page already receives) — any column
 * flagged `filterable: true` in its YAML gets a control here based on its
 * `type` (string/boolean/datetime). Reusable across grids: a page just
 * needs to flag columns filterable and pass its `columns` + current values.
 */
export function GridFilterDrawer({
    open,
    onClose,
    columns,
    value,
    onApply,
    t,
}: {
    open: boolean;
    onClose: () => void;
    columns: Record<string, GridColumn>;
    value: Record<string, FilterValue>;
    onApply: (filters: Record<string, FilterValue>) => void;
    t: (key: string) => string;
}) {
    const [draft, setDraft] = useState<Record<string, FilterValue>>(value);

    useEffect(() => {
        if (open) setDraft(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filterableEntries = Object.entries(columns).filter(([, column]) => column.filterable);

    const setField = (key: string, val: FilterValue) => setDraft((prev) => ({ ...prev, [key]: val }));

    const save = () => {
        const cleaned: Record<string, FilterValue> = {};
        Object.entries(draft).forEach(([key, val]) => {
            if (typeof val === 'string') {
                if (val !== '') cleaned[key] = val;
            } else if (val && (val.from || val.to)) {
                cleaned[key] = val;
            }
        });
        onApply(cleaned);
        onClose();
    };

    return (
        <Drawer anchor="right" open={open} onClose={onClose}>
            <Box sx={{ width: 340, p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="h6" fontWeight={700}>
                        Apply Filters
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Stack>

                <Stack spacing={2.5}>
                    {filterableEntries.map(([key, column]) => {
                        if (column.type === 'boolean') {
                            const current = (draft[key] as string) ?? '';
                            return (
                                <Box key={key}>
                                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                        {t(column.label)}
                                    </Typography>
                                    <Select fullWidth size="small" displayEmpty value={current} onChange={(e) => setField(key, e.target.value)}>
                                        <MenuItem value="">
                                            <em>Select</em>
                                        </MenuItem>
                                        <MenuItem value="1">Yes</MenuItem>
                                        <MenuItem value="0">No</MenuItem>
                                    </Select>
                                </Box>
                            );
                        }

                        if (column.type === 'datetime' || column.type === 'date') {
                            const current = (draft[key] as DateRangeValue) ?? {};
                            return (
                                <Box key={key}>
                                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                        {t(column.label)}
                                    </Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                        {Object.entries(quickRanges).map(([label, getRange]) => (
                                            <Chip
                                                key={label}
                                                label={label}
                                                size="small"
                                                onClick={() => {
                                                    const [from, to] = getRange();
                                                    setField(key, { from: toDateInputValue(from), to: toDateInputValue(to) });
                                                }}
                                            />
                                        ))}
                                    </Stack>
                                    <Stack direction="row" spacing={1}>
                                        <TextField
                                            type="date"
                                            size="small"
                                            fullWidth
                                            value={current.from ?? ''}
                                            onChange={(e) => setField(key, { ...current, from: e.target.value })}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                        />
                                        <TextField
                                            type="date"
                                            size="small"
                                            fullWidth
                                            value={current.to ?? ''}
                                            onChange={(e) => setField(key, { ...current, to: e.target.value })}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                        />
                                    </Stack>
                                </Box>
                            );
                        }

                        const current = (draft[key] as string) ?? '';
                        return (
                            <Box key={key}>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {t(column.label)}
                                </Typography>
                                <TextField fullWidth size="small" value={current} onChange={(e) => setField(key, e.target.value)} />
                            </Box>
                        );
                    })}
                </Stack>

                <Button fullWidth variant="contained" sx={{ mt: 3, color: 'white' }} onClick={save}>
                    Save
                </Button>
            </Box>
        </Drawer>
    );
}
