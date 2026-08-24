import { useEffect, useState } from 'react';
import { FIORI } from '@/lib/fiori-style';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import {
    Box,
    Divider,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
    Dialog,
    DialogContent,
    DialogTitle,
} from '@mui/material';

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
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                        <Typography variant="body2" sx={{ color: '#f59e0b' }}>
                            {display}
                        </Typography>
                        {relative && (
                            <Typography variant="body2" color="text.secondary">
                                ({relative})
                            </Typography>
                        )}
                    </Stack>
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
            render: (entry) => <Typography sx={{ color: 'primary.main' }}>{entry.user}</Typography>,
        },
        {
            key: 'actions',
            header: 'Actions',
            priority: 'always',
            align: 'right',
            render: (entry) => (
                <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setPreviewEntry(entry)}>
                    <VisibilityOutlinedIcon fontSize="small" />
                </IconButton>
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
            render: (row) => <Typography sx={{ color: '#334155' }}>{row.key}</Typography>,
        },
        {
            key: 'old',
            header: <Typography component="span" sx={{ fontWeight: 700, color: '#dc2626' }}>Old Value</Typography>,
            priority: 'high',
            render: (row) => <Typography sx={{ color: '#dc2626' }}>{formatValue(row.old)}</Typography>,
        },
        {
            key: 'new',
            header: <Typography component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>New Value</Typography>,
            priority: 'high',
            render: (row) => (
                <Typography sx={{ color: 'primary.main', fontWeight: 600 }}>{formatValue(row.new)}</Typography>
            ),
        },
    ];

    return (
        <Box sx={{ px: { xs: 2, md: 4 } }}>
            <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Select
                    value={perPage}
                    onChange={(e) => {
                        setPerPage(Number(e.target.value));
                        setPage(1);
                    }}
                    size="small"
                    sx={{ bgcolor: FIORI.surface, borderRadius: 1.5, minWidth: 60, height: 36 }}
                >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                </Select>
                <Typography variant="body2" color="text.secondary">
                    Per Page
                </Typography>
                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body2">{page}</Typography>
                </Paper>
                <Typography variant="body2" color="text.secondary">
                    of {lastPage}
                </Typography>
                <Stack direction="row" spacing={0.2}>
                    <IconButton size="small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>
                        <ChevronRightIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </Stack>

            <FioriResponsiveTable
                columns={columns}
                rows={pagedEntries}
                getRowKey={(entry) => entry.version}
                emptyMessage={loading ? null : 'No history found.'}
            />

            <Dialog open={previewEntry !== null} onClose={() => setPreviewEntry(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 1 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            History Preview
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Quickly review your updates and changes.
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setPreviewEntry(null)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <Divider />
                <DialogContent>
                    {previewEntry && (
                        <>
                            <Stack spacing={0.75} sx={{ mb: 2.5 }}>
                                <Typography variant="body2">
                                    <b>Version :</b> {previewEntry.version}
                                </Typography>
                                <Typography variant="body2">
                                    <b>Date/Time :</b> {formatDateTime(previewEntry.created_at).display}
                                </Typography>
                                <Typography variant="body2">
                                    <b>User :</b> {previewEntry.user}
                                </Typography>
                            </Stack>

                            <FioriResponsiveTable
                                size="small"
                                columns={diffColumns}
                                rows={previewEntry.diff}
                                getRowKey={(row) => row.key}
                                emptyMessage="No changes recorded."
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
