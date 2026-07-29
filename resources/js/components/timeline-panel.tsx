import { useEffect, useState } from 'react';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LockResetIcon from '@mui/icons-material/LockReset';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { Box, Collapse, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';

interface TimelineDiffRow {
    key: string;
    old: unknown;
    new: unknown;
}

interface TimelineEntry {
    event: string;
    created_at: string | null;
    actor: string;
    diff: TimelineDiffRow[];
}

const EVENT_META: Record<string, { label: string; icon: typeof HistoryOutlinedIcon; color: string }> = {
    created: { label: 'Account created', icon: PersonAddAlt1OutlinedIcon, color: '#16a34a' },
    updated: { label: 'Profile updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    deleted: { label: 'Account deleted', icon: DeleteOutlineIcon, color: '#dc2626' },
    login: { label: 'Logged in', icon: LoginIcon, color: '#16a34a' },
    logout: { label: 'Logged out', icon: LogoutIcon, color: '#64748b' },
    login_failed: { label: 'Failed login attempt', icon: ErrorOutlineIcon, color: '#dc2626' },
    password_reset: { label: 'Password changed', icon: LockResetIcon, color: '#d97706' },
    groups_updated: { label: 'Groups updated', icon: GroupOutlinedIcon, color: '#7c3aed' },
    roles_updated: { label: 'Roles updated', icon: AdminPanelSettingsOutlinedIcon, color: '#7c3aed' },
};

function humanize(value: string): string {
    return value
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function eventMeta(event: string) {
    return EVENT_META[event] ?? { label: humanize(event), icon: HistoryOutlinedIcon, color: '#64748b' };
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function formatDateTime(value: string | null): { display: string; relative: string } {
    if (!value) return { display: '-', relative: '' };

    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return { display: value, relative: '' };

    const pad = (n: number) => String(n).padStart(2, '0');
    const display = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    let relative: string;
    if (diffSeconds < 60) relative = 'just now';
    else if (diffSeconds < 3600) relative = `${Math.floor(diffSeconds / 60)} minutes ago`;
    else if (diffSeconds < 86400) relative = `${Math.floor(diffSeconds / 3600)} hours ago`;
    else relative = `${Math.floor(diffSeconds / 86400)} days ago`;

    return { display, relative };
}

/**
 * Vertical activity timeline fed by any backend endpoint that returns
 * `{ timeline: TimelineEntry[] }` (see UserController::history).
 */
export function TimelinePanel({ timelineUrl }: { timelineUrl: string }) {
    const [entries, setEntries] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetch(timelineUrl, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { timeline: [] }))
            .then((json) => {
                if (!cancelled) setEntries(json.timeline ?? []);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [timelineUrl]);

    if (!loading && entries.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                No activity recorded yet.
            </Typography>
        );
    }

    return (
        <Stack spacing={0}>
            {entries.map((entry, index) => {
                const { label, icon: Icon, color } = eventMeta(entry.event);
                const { display, relative } = formatDateTime(entry.created_at);
                const isLast = index === entries.length - 1;
                const hasDiff = entry.diff.length > 0;
                const isOpen = expanded === index;

                return (
                    <Box key={index} sx={{ display: 'flex', gap: 2 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Box
                                sx={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: `${color}1a`,
                                    color,
                                    flexShrink: 0,
                                }}
                            >
                                <Icon fontSize="small" />
                            </Box>
                            {!isLast && <Box sx={{ flex: 1, width: '2px', bgcolor: 'divider', my: 0.5 }} />}
                        </Box>

                        <Box sx={{ pb: 3, flex: 1, minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ pt: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {label}
                                </Typography>
                                {hasDiff && (
                                    <IconButton size="small" onClick={() => setExpanded(isOpen ? null : index)}>
                                        <ExpandMoreIcon
                                            fontSize="small"
                                            sx={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                                        />
                                    </IconButton>
                                )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                                {entry.actor} &middot; {display} {relative && `(${relative})`}
                            </Typography>

                            {hasDiff && (
                                <Collapse in={isOpen}>
                                    <Paper variant="outlined" sx={{ mt: 1, borderRadius: 1.5, overflow: 'hidden' }}>
                                        <Table size="small">
                                            <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 700 }}>Field</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, color: '#dc2626' }}>Before</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>After</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {entry.diff.map((row) => (
                                                    <TableRow key={row.key}>
                                                        <TableCell sx={{ color: '#334155' }}>{humanize(row.key)}</TableCell>
                                                        <TableCell sx={{ color: '#dc2626' }}>{formatValue(row.old)}</TableCell>
                                                        <TableCell sx={{ color: 'primary.main', fontWeight: 600 }}>{formatValue(row.new)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Paper>
                                </Collapse>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}
