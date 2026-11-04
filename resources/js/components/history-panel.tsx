import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import '@ui5/webcomponents-icons/dist/appointment-2.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Bar, Button, Dialog, Icon, Option, Select, Tag, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';

import styles from './history-panel.module.css';

interface HistoryDiffRow {
    key: string;
    old: unknown;
    new: unknown;
}

interface HistoryEntry {
    version: number;
    event: string;
    created_at: string | null;
    user: string;
    diff: HistoryDiffRow[];
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function formatDateTime(value: string | null): { display: string; relative: string } {
    if (!value) return { display: '-', relative: '' };

    // `value` is ISO 8601 with an explicit UTC offset (see
    // HasVersionHistory::versionHistoryFor()), so this already localizes
    // to the viewer's own timezone — no manual offset math needed.
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { display: value, relative: '' };

    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const pad = (n: number) => String(n).padStart(2, '0');
    const display = `${weekday}, ${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    let relative: string;
    if (diffSeconds < 60) relative = 'just now';
    else if (diffSeconds < 3600) relative = `${Math.floor(diffSeconds / 60)} minutes ago`;
    else if (diffSeconds < 86400) relative = `${Math.floor(diffSeconds / 3600)} hours ago`;
    else relative = `${Math.floor(diffSeconds / 86400)} days ago`;

    return { display, relative };
}

const PER_PAGE_OPTIONS = [10, 25, 50];

/**
 * Version-history table + "History Preview" diff modal, fed by any backend
 * endpoint that returns `{ history: HistoryEntry[] }` (see HasVersionHistory
 * on the Laravel side, which every catalog module controller uses).
 */
export function HistoryPanel({ historyUrl }: { historyUrl: string }) {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null);
    const [perPage, setPerPage] = useState(10);
    const [page, setPage] = useState(1);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetch(historyUrl, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { history: [] }))
            .then((json) => {
                if (!cancelled) setEntries(json.history ?? []);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [historyUrl]);

    const lastPage = Math.max(1, Math.ceil(entries.length / perPage));
    const pagedEntries = entries.slice((page - 1) * perPage, page * perPage);

    // Column pop-in priority (SAP Fiori responsive table): Date/Time
    // identifies the entry and Actions holds the only interactive control
    // (View), so both stay always visible; User and Version are descriptive
    // and reflow into the pop-in area first as space runs out.
    const columns: FioriResponsiveColumn<HistoryEntry>[] = [
        {
            key: 'dateTime',
            header: 'Date / Time',
            priority: 'always',
            render: (entry) => {
                const { display, relative } = formatDateTime(entry.created_at);
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Icon name="appointment-2" style={{ width: '1rem', height: '1rem', color: 'var(--sapCriticalColor)' }} />
                        <span style={{ color: 'var(--sapCriticalTextColor)' }}>{display}</span>
                        {relative && <span style={{ color: 'var(--sapContent_LabelColor)' }}>({relative})</span>}
                    </span>
                );
            },
        },
        {
            key: 'version',
            header: 'Version',
            priority: 'medium',
            render: (entry) => entry.version,
        },
        {
            key: 'user',
            header: 'User',
            priority: 'high',
            render: (entry) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--sapLinkColor)' }}>{entry.user}</span>
                    {/* ค่าที่งานแปลอัตโนมัติเขียน (AutoTranslateProductValueJob) — แยกให้เห็นจาก
                        การแก้ไขที่คนพิมพ์เอง ผู้ใช้ที่แสดงคือคนที่สั่งแปล */}
                    {entry.event === 'attribute_values_auto_translated' && (
                        <Tag design="Set2" colorScheme="5" hideStateIcon>
                            AI translated
                        </Tag>
                    )}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            priority: 'always',
            align: 'right',
            render: (entry) => (
                <Button design="Transparent" icon="show" tooltip="View" accessibleName="View" onClick={() => setPreviewEntry(entry)} />
            ),
        },
    ];

    // The diff preview's Old/New Value columns are given the same priority
    // so they always pop in (or stay) together — splitting a before/after
    // comparison across the visible grid and the pop-in area would defeat
    // the point of a diff view.
    const diffColumns: FioriResponsiveColumn<HistoryDiffRow>[] = [
        {
            key: 'key',
            header: 'Key',
            priority: 'always',
            render: (row) => <span style={{ color: 'var(--sapTextColor)' }}>{row.key}</span>,
        },
        {
            key: 'old',
            header: <span style={{ fontWeight: 700, color: 'var(--sapNegativeTextColor)' }}>Old Value</span>,
            popinText: 'Old Value',
            priority: 'high',
            render: (row) => <span style={{ color: 'var(--sapNegativeTextColor)' }}>{formatValue(row.old)}</span>,
        },
        {
            key: 'new',
            header: <span style={{ fontWeight: 700, color: 'var(--sapLinkColor)' }}>New Value</span>,
            popinText: 'New Value',
            priority: 'high',
            render: (row) => <span style={{ color: 'var(--sapLinkColor)', fontWeight: 600 }}>{formatValue(row.new)}</span>,
        },
    ];

    return (
        <div className={styles.panel}>
            <div className={styles.pager}>
                <Select
                    accessibleName="Per Page"
                    style={{ width: '5rem' }}
                    onChange={(e) => {
                        setPerPage(Number(e.detail.selectedOption.value));
                        setPage(1);
                    }}
                >
                    {PER_PAGE_OPTIONS.map((n) => (
                        <Option key={n} value={String(n)} selected={perPage === n}>
                            {n}
                        </Option>
                    ))}
                </Select>
                <Text style={{ color: 'var(--sapContent_LabelColor)' }}>Per Page</Text>
                <span className={styles.pageBox}>{page}</span>
                <Text style={{ color: 'var(--sapContent_LabelColor)' }}>of {lastPage}</Text>
                <Button
                    design="Transparent"
                    icon="slim-arrow-left"
                    accessibleName="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                />
                <Button
                    design="Transparent"
                    icon="slim-arrow-right"
                    accessibleName="Next page"
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                />
            </div>

            <FioriResponsiveTable
                columns={columns}
                rows={pagedEntries}
                getRowKey={(entry) => entry.version}
                loading={loading}
                emptyMessage={loading ? null : 'No history found.'}
            />

            <Dialog
                open={previewEntry !== null}
                onClose={() => setPreviewEntry(null)}
                style={{ width: 'min(600px, calc(100vw - 2rem))' }}
                header={
                    <Bar
                        startContent={
                            <div style={{ padding: '0.5rem 0' }}>
                                <Title level="H5" size="H5">
                                    History Preview
                                </Title>
                                <Text style={{ color: 'var(--sapContent_LabelColor)' }}>Quickly review your updates and changes.</Text>
                            </div>
                        }
                        endContent={<Button design="Transparent" icon="decline" accessibleName="Close" onClick={() => setPreviewEntry(null)} />}
                    />
                }
            >
                {previewEntry && (
                    <>
                        <div className={styles.meta}>
                            <span>
                                <b>Version :</b> {previewEntry.version}
                            </span>
                            <span>
                                <b>Date/Time :</b> {formatDateTime(previewEntry.created_at).display}
                            </span>
                            <span>
                                <b>User :</b> {previewEntry.user}
                            </span>
                        </div>

                        <FioriResponsiveTable
                            size="small"
                            columns={diffColumns}
                            rows={previewEntry.diff}
                            getRowKey={(row) => row.key}
                            emptyMessage="No changes recorded."
                        />
                    </>
                )}
            </Dialog>
        </div>
    );
}
