import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    Box,
    Button,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    MenuItem,
    Pagination,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

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

const EVENT_COLORS: Record<string, string> = {
    created: '#28a745',
    updated: '#007bff',
    deleted: '#dc3545',
    login: '#17a2b8',
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
            <Box sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
                    {t('activityLogsTitle', { count: activities.total })}
                </Typography>

                <Card variant="outlined" sx={{ mb: 3, p: 2, borderRadius: 2 }}>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 180 }}>
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

                        <FormControl size="small" sx={{ minWidth: 200 }}>
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
                        />
                        <TextField
                            size="small"
                            type="date"
                            label={t('dateTo')}
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={filters.date_to ?? ''}
                            onChange={(event) => applyFilters({ date_to: event.target.value || null })}
                        />

                        {hasActiveFilters && (
                            <Button size="small" onClick={clearFilters}>
                                {t('clearFilters')}
                            </Button>
                        )}
                    </Stack>
                </Card>

                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 0 }}>
                        <Box sx={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('id')}</th>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('user')}</th>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('event')}</th>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('targetResource')}</th>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('targetId')}</th>
                                        <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem' }}>{t('time')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activities.data.map((activity) => (
                                        <tr key={activity.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>#{activity.id}</td>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600 }}>{activity.user}</td>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#fff',
                                                        backgroundColor: EVENT_COLORS[activity.event] ?? '#6c757d',
                                                    }}
                                                >
                                                    {t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'text.secondary' }}>
                                                {activity.auditable_type || '-'}
                                            </td>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>{activity.auditable_id || '-'}</td>
                                            <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'text.secondary' }}>
                                                {new Date(activity.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {activities.data.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'text.secondary' }}>
                                                {t('noActivities')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </Box>
                    </CardContent>
                </Card>

                {activities.last_page > 1 && (
                    <Stack direction="row" justifyContent="center" sx={{ mt: 3 }}>
                        <Pagination
                            count={activities.last_page}
                            page={activities.current_page}
                            onChange={(_event, page) => goToPage(page)}
                            color="primary"
                        />
                    </Stack>
                )}
            </Box>
        </AppLayout>
    );
}
