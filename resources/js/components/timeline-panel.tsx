import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LockResetIcon from '@mui/icons-material/LockReset';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { Box, Chip, Collapse, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';

interface TimelineDiffRow {
    key: string;
    old: unknown;
    new: unknown;
}

type TimelineCategory = 'signin' | 'account' | 'work';

interface TimelineEntry {
    event: string;
    // Older responses (other endpoints reusing this panel) may omit these.
    category?: TimelineCategory;
    subject_type?: string | null;
    subject_id?: number | string | null;
    created_at: string | null;
    actor: string;
    diff: TimelineDiffRow[];
}

const CATEGORY_FILTERS: Array<{ key: 'all' | TimelineCategory; labelKey: string }> = [
    { key: 'all', labelKey: 'timelineFilterAll' },
    { key: 'signin', labelKey: 'timelineFilterSignin' },
    { key: 'work', labelKey: 'timelineFilterWork' },
    { key: 'account', labelKey: 'timelineFilterAccount' },
];

const EVENT_META: Record<string, { label: string; icon: typeof HistoryOutlinedIcon; color: string }> = {
    // "created"/"updated"/"deleted" are the generic events the Auditable
    // trait fires automatically for ANY model (see app/Models/Concerns/
    // Auditable.php) — kept entity-agnostic ("Record ...") since this panel
    // is shared across users, products, and anything else Auditable.
    created: { label: 'Record created', icon: PersonAddAlt1OutlinedIcon, color: '#16a34a' },
    updated: { label: 'Record updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    deleted: { label: 'Record deleted', icon: DeleteOutlineIcon, color: '#dc2626' },
    login: { label: 'Logged in', icon: LoginIcon, color: '#16a34a' },
    logout: { label: 'Logged out', icon: LogoutIcon, color: '#64748b' },
    login_failed: { label: 'Failed login attempt', icon: ErrorOutlineIcon, color: '#dc2626' },
    password_reset: { label: 'Password changed', icon: LockResetIcon, color: '#d97706' },
    groups_updated: { label: 'Groups updated', icon: GroupOutlinedIcon, color: '#7c3aed' },
    roles_updated: { label: 'Roles updated', icon: AdminPanelSettingsOutlinedIcon, color: '#7c3aed' },
    duplicated: { label: 'Duplicated', icon: Inventory2OutlinedIcon, color: '#2563eb' },
    labels_set: { label: 'Labels set', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    labels_updated: { label: 'Labels updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    published_shops_updated: { label: 'Sales channels updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    import_run: { label: 'Import run', icon: HistoryOutlinedIcon, color: '#0891b2' },
    // ProductController::recordProductValueChanges() — the two events that
    // cover almost every real product edit (plain product-row column
    // changes already fall under "updated" above via the Auditable trait).
    attribute_values_updated: { label: 'Product details updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
    variant_values_updated: { label: 'Variant details updated', icon: EditNoteOutlinedIcon, color: '#2563eb' },
};

// 'work' entries land on humanize() for their label; keep a distinct icon/tint
// so they read differently from account/sign-in rows at a glance.
const WORK_FALLBACK = { icon: Inventory2OutlinedIcon, color: '#2563eb' };

function humanize(value: unknown): string {
    return String(value)
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function eventMeta(event: string, category?: TimelineCategory) {
    if (EVENT_META[event]) return EVENT_META[event];
    const fallback = category === 'work' ? WORK_FALLBACK : { icon: HistoryOutlinedIcon, color: '#64748b' };
    return { label: humanize(event), ...fallback };
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return '—';
        // list payloads can hold objects (e.g. permissions: {resource, action})
        return value
            .map((item) => (item !== null && typeof item === 'object' ? Object.values(item).join('.') : String(item)))
            .join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function formatDateTime(value: string | null): { display: string; relative: string } {
    if (!value) return { display: '-', relative: '' };

    // `value` is ISO 8601 with an explicit UTC offset (see
    // UserController::history()), so this already localizes to the
    // viewer's own timezone — no manual offset math needed.
    const date = new Date(value);
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
    const { t } = useTranslation('system');
    const [entries, setEntries] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [filter, setFilter] = useState<'all' | TimelineCategory>('all');

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

    const counts = useMemo(() => {
        const base: Record<'all' | TimelineCategory, number> = { all: entries.length, signin: 0, account: 0, work: 0 };
        for (const entry of entries) {
            if (entry.category) base[entry.category] += 1;
        }
        return base;
    }, [entries]);

    const visible = useMemo(
        () => (filter === 'all' ? entries : entries.filter((entry) => entry.category === filter)),
        [entries, filter],
    );

    // Some categories may not exist for a given user (e.g. a user who has
    // never performed a 'work' action) — hide those filter chips entirely.
    const availableFilters = CATEGORY_FILTERS.filter((option) => option.key === 'all' || counts[option.key] > 0);

    if (!loading && entries.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('timelineEmpty')}
            </Typography>
        );
    }

    return (
        <Stack spacing={2}>
            {availableFilters.length > 2 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {availableFilters.map((option) => (
                        <Chip
                            key={option.key}
                            label={`${t(option.labelKey)} (${counts[option.key]})`}
                            size="small"
                            color={filter === option.key ? 'primary' : 'default'}
                            variant={filter === option.key ? 'filled' : 'outlined'}
                            onClick={() => {
                                setFilter(option.key);
                                setExpanded(null);
                            }}
                        />
                    ))}
                </Stack>
            )}

            {visible.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    {t('timelineEmptyFiltered')}
                </Typography>
            ) : (
            <Stack spacing={0}>
            {visible.map((entry, index) => {
                const { label, icon: Icon, color } = eventMeta(entry.event, entry.category);
                const { display, relative } = formatDateTime(entry.created_at);
                const isLast = index === visible.length - 1;
                const subject = entry.subject_type
                    ? `${entry.subject_type}${entry.subject_id != null ? ` #${entry.subject_id}` : ''}`
                    : null;
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
                                {entry.actor} &middot; {subject ? `${subject} · ` : ''}{display} {relative && `(${relative})`}
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
            )}
        </Stack>
    );
}
