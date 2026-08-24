import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Pagination,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FIORI, FioriStatus, type FioriTone, fioriCardSx, fioriGhostSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface Activity {
    id: number;
    event: string;
    user: string;
    auditable_type: string | null;
    auditable_id: number | null;
    created_at: string;
}

interface PaginatedActivities {
    data: Activity[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface UserOption {
    id: number;
    name: string;
}

interface ActivityLogFilters {
    event: string | null;
    user_id: number | null;
    date_from: string | null;
    date_to: string | null;
}

const EMPTY_FILTERS: ActivityLogFilters = { event: null, user_id: null, date_from: null, date_to: null };

const EVENT_TONE: Record<string, FioriTone> = {
    created: 'success',
    updated: 'information',
    deleted: 'error',
    login: 'neutral',
};

export default function ActivityLogIndex({
    activities,
    events = [],
    users = [],
    filters = EMPTY_FILTERS,
}: {
    activities: PaginatedActivities;
    events?: string[];
    users?: UserOption[];
    filters?: ActivityLogFilters;
}) {
    const { t } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('activityLogs'), href: '/system/activity-logs' },
    ];

    const applyFilters = (partial: Partial<ActivityLogFilters>) => {
        router.get(
            '/system/activity-logs',
            {
                event: partial.event !== undefined ? partial.event : filters.event,
                user_id: partial.user_id !== undefined ? partial.user_id : filters.user_id,
                date_from: partial.date_from !== undefined ? partial.date_from : filters.date_from,
                date_to: partial.date_to !== undefined ? partial.date_to : filters.date_to,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const clearFilters = () => router.get('/system/activity-logs', {}, { preserveState: true, preserveScroll: true, replace: true });

    const hasActiveFilters = Boolean(filters.event || filters.user_id || filters.date_from || filters.date_to);

    const goToPage = (page: number) => {
        router.get(
            '/system/activity-logs',
            { ...filters, page },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('activityLogsTitle', { count: activities.total })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: FIORI.textPrimary }}>
                    {t('activityLogsTitle', { count: activities.total })}
                </Typography>

                <Paper elevation={0} sx={{ ...fioriCardSx, mb: 3, p: 2 }}>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                        <FormControl size="small" sx={{ ...fioriSearchFieldSx, minWidth: 180 }}>
                            <InputLabel id="activity-log-event-label">{t('filterByEvent')}</InputLabel>
                            <Select
                                labelId="activity-log-event-label"
                                label={t('filterByEvent')}
                                value={filters.event ?? ''}
                                onChange={(event) => applyFilters({ event: event.target.value || null })}
                            >
                                <MenuItem value="">{t('allEvents')}</MenuItem>
                                {events.map((event) => (
                                    <MenuItem key={event} value={event}>
                                        {t(event, { defaultValue: event })}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ ...fioriSearchFieldSx, minWidth: 200 }}>
                            <InputLabel id="activity-log-user-label">{t('filterByUser')}</InputLabel>
                            <Select
                                labelId="activity-log-user-label"
                                label={t('filterByUser')}
                                value={filters.user_id ?? ''}
                                onChange={(event) => applyFilters({ user_id: event.target.value === '' ? null : Number(event.target.value) })}
                            >
                                <MenuItem value="">{t('allUsers')}</MenuItem>
                                {users.map((user) => (
                                    <MenuItem key={user.id} value={user.id}>
                                        {user.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            size="small"
                            type="date"
                            label={t('dateFrom')}
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={filters.date_from ?? ''}
                            onChange={(event) => applyFilters({ date_from: event.target.value || null })}
                            sx={fioriSearchFieldSx}
                        />
                        <TextField
                            size="small"
                            type="date"
                            label={t('dateTo')}
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={filters.date_to ?? ''}
                            onChange={(event) => applyFilters({ date_to: event.target.value || null })}
                            sx={fioriSearchFieldSx}
                        />

                        {hasActiveFilters && (
                            <Button size="small" onClick={clearFilters} sx={fioriGhostSx}>
                                {t('clearFilters')}
                            </Button>
                        )}
                    </Stack>
                </Paper>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Box sx={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: FIORI.headerBg, borderBottom: `1px solid ${FIORI.border}` }}>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('id')}</th>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('user')}</th>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('event')}</th>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('targetResource')}</th>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('targetId')}</th>
                                    <th style={{ padding: '10px 20px', fontWeight: 600, fontSize: '0.8125rem', color: FIORI.textPrimary }}>{t('time')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activities.data.map((activity) => (
                                    <tr key={activity.id} style={{ borderBottom: `1px solid ${FIORI.border}` }}>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem', color: FIORI.textPrimary }}>#{activity.id}</td>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem', fontWeight: 600, color: FIORI.textPrimary }}>{activity.user}</td>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem' }}>
                                            <FioriStatus
                                                label={t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                                                tone={EVENT_TONE[activity.event] ?? 'neutral'}
                                            />
                                        </td>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem', color: FIORI.textSecondary }}>
                                            {activity.auditable_type || '-'}
                                        </td>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem', color: FIORI.textPrimary }}>{activity.auditable_id || '-'}</td>
                                        <td style={{ padding: '10px 20px', fontSize: '0.8125rem', color: FIORI.textSecondary }}>
                                            {new Date(activity.created_at).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {activities.data.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: FIORI.textSecondary }}>
                                            {t('noActivities')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </Box>
                </Paper>

                {activities.last_page > 1 && (
                    <Stack direction="row" justifyContent="center" sx={{ mt: 3 }}>
                        <Pagination
                            count={activities.last_page}
                            page={activities.current_page}
                            onChange={(_event, page) => goToPage(page)}
                            sx={{
                                '& .MuiPaginationItem-root': { borderRadius: '6px', color: FIORI.textPrimary },
                                '& .Mui-selected': { bgcolor: `${FIORI.brand} !important`, color: '#fff' },
                            }}
                        />
                    </Stack>
                )}
            </Box>
        </AppLayout>
    );
}
