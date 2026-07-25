import { useEffect, useState } from 'react';
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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
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

    const date = new Date(value.replace(' ', 'T'));
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
                    sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 60, height: 36 }}
                >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                </Select>
                <Typography variant="body2" color="text.secondary">
                    Per Page
                </Typography>
                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
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

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>Date / Time</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>Version</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>User</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pagedEntries.map((entry) => {
                            const { display, relative } = formatDateTime(entry.created_at);
                            return (
                                <TableRow key={entry.version} hover>
                                    <TableCell sx={{ color: '#334155' }}>
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
                                    </TableCell>
                                    <TableCell sx={{ color: '#334155' }}>{entry.version}</TableCell>
                                    <TableCell sx={{ color: 'primary.main' }}>{entry.user}</TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setPreviewEntry(entry)}>
                                            <VisibilityOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {!loading && entries.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No history found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

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

                            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                                <Table size="small">
                                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>Key</TableCell>
                                            <TableCell sx={{ fontWeight: 700, color: '#dc2626' }}>Old Value</TableCell>
                                            <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>New Value</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {previewEntry.diff.map((row) => (
                                            <TableRow key={row.key}>
                                                <TableCell sx={{ color: '#334155' }}>{row.key}</TableCell>
                                                <TableCell sx={{ color: '#dc2626' }}>{formatValue(row.old)}</TableCell>
                                                <TableCell sx={{ color: 'primary.main', fontWeight: 600 }}>{formatValue(row.new)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {previewEntry.diff.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                                    No changes recorded.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
