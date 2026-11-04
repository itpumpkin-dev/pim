import '@ui5/webcomponents-icons/dist/decline.js';
import { Bar, Button, DatePicker, Dialog, Input, Label, Option, Select, Tag, Title } from '@ui5/webcomponents-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
    filterable?: boolean;
}

export interface DateRangeValue {
    [key: string]: string | undefined;
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

// keys are grid.json translation keys
const quickRanges: Record<string, () => [Date, Date]> = {
    rangeToday: () => {
        const today = new Date();
        return [today, today];
    },
    rangeYesterday: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return [d, d];
    },
    rangeThisWeek: () => {
        const today = new Date();
        const day = today.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        const start = new Date(today);
        start.setDate(today.getDate() - diffToMonday);
        return [start, today];
    },
    rangeThisMonth: () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    },
    rangeLastMonth: () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)];
    },
    rangeLast3Months: () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()), today];
    },
    rangeLast6Months: () => {
        const today = new Date();
        return [new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), today];
    },
    rangeThisYear: () => {
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
    // `t` (prop) translates the page's column labels; tGrid covers this drawer's own chrome
    const { t: tGrid } = useTranslation('grid');
    const [draft, setDraft] = useState<Record<string, FilterValue>>(value);
    const idPrefix = useId();

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

    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;

    // UI5 has no Drawer — the filter panel is a (centered) UI5 Dialog with a
    // Save action in its footer bar.
    return (
        <Dialog
            open={open}
            onClose={onClose}
            style={{ width: 'min(380px, calc(100vw - 2rem))' }}
            header={
                <Bar
                    startContent={
                        <Title level="H5" size="H5">
                            {tGrid('filterDrawerTitle')}
                        </Title>
                    }
                    endContent={<Button design="Transparent" icon="decline" accessibleName="Close" onClick={onClose} />}
                />
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <Button design="Emphasized" onClick={save}>
                            {tGrid('filterDrawerSave')}
                        </Button>
                    }
                />
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {filterableEntries.map(([key, column]) => {
                    const id = `${idPrefix}-${key}`;

                    if (column.type === 'boolean') {
                        const current = (draft[key] as string) ?? '';
                        return (
                            <div key={key} style={fieldStyle}>
                                <Label for={id} showColon={false}>
                                    {t(column.label)}
                                </Label>
                                <Select
                                    id={id}
                                    style={{ width: '100%' }}
                                    value={current}
                                    onChange={(e) => setField(key, e.detail.selectedOption.value ?? '')}
                                >
                                    <Option value="">{tGrid('filterDrawerSelect')}</Option>
                                    <Option value="1">{tGrid('yes')}</Option>
                                    <Option value="0">{tGrid('no')}</Option>
                                </Select>
                            </div>
                        );
                    }

                    if (column.type === 'datetime' || column.type === 'date') {
                        const current = (draft[key] as DateRangeValue) ?? {};
                        return (
                            <div key={key} style={fieldStyle}>
                                <Label for={`${id}-from`} showColon={false}>
                                    {t(column.label)}
                                </Label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    {Object.entries(quickRanges).map(([rangeKey, getRange]) => (
                                        <Tag
                                            key={rangeKey}
                                            interactive
                                            design="Neutral"
                                            hideStateIcon
                                            onClick={() => {
                                                const [from, to] = getRange();
                                                setField(key, { from: toDateInputValue(from), to: toDateInputValue(to) });
                                            }}
                                        >
                                            {tGrid(rangeKey)}
                                        </Tag>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <DatePicker
                                        id={`${id}-from`}
                                        style={{ flex: 1, minWidth: 0 }}
                                        valueFormat="yyyy-MM-dd"
                                        displayFormat="yyyy-MM-dd"
                                        value={current.from ?? ''}
                                        onChange={(e) => setField(key, { ...current, from: e.detail.value })}
                                    />
                                    <DatePicker
                                        style={{ flex: 1, minWidth: 0 }}
                                        valueFormat="yyyy-MM-dd"
                                        displayFormat="yyyy-MM-dd"
                                        value={current.to ?? ''}
                                        onChange={(e) => setField(key, { ...current, to: e.detail.value })}
                                    />
                                </div>
                            </div>
                        );
                    }

                    const current = (draft[key] as string) ?? '';
                    return (
                        <div key={key} style={fieldStyle}>
                            <Label for={id} showColon={false}>
                                {t(column.label)}
                            </Label>
                            <Input id={id} style={{ width: '100%' }} value={current} onInput={(e) => setField(key, e.target.value)} />
                        </div>
                    );
                })}
            </div>
        </Dialog>
    );
}
