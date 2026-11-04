import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Button, DatePicker, FlexBox, Label, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import type { ReactNode } from 'react';
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

const EVENT_TONE: Record<string, FioriTone> = {
    created: 'success',
    updated: 'information',
    deleted: 'error',
    login: 'neutral',
};

const cardStyle = {
    background: 'var(--sapGroup_ContentBackground)',
    border: '1px solid var(--sapGroup_ContentBorderColor)',
    borderRadius: 'var(--sapElement_BorderCornerRadius)',
} as const;

const secondaryText = { color: 'var(--sapContent_LabelColor)' } as const;

/** Page numbers to show: first, last, current ±1, with `null` gaps for "…". */
function pageWindow(current: number, last: number): Array<number | null> {
    const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
    const sorted = [...pages].sort((a, b) => a - b);
    const out: Array<number | null> = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
        out.push(p);
    });
    return out;
}

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
        router.get('/system/activity-logs', { ...filters, page }, { preserveState: true, preserveScroll: true, replace: true });
    };

    const columns: FioriResponsiveColumn<Activity>[] = [
        { key: 'id', header: t('id'), priority: 'high', render: (activity: Activity) => <Text>#{activity.id}</Text> },
        {
            key: 'user',
            header: t('user'),
            priority: 'always',
            render: (activity: Activity) => <Text style={{ fontWeight: 600 }}>{activity.user}</Text>,
        },
        {
            key: 'event',
            header: t('event'),
            priority: 'always',
            render: (activity: Activity) => (
                <FioriStatus
                    label={t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                    tone={EVENT_TONE[activity.event] ?? 'neutral'}
                />
            ),
        },
        {
            key: 'auditable_type',
            header: t('targetResource'),
            priority: 'medium',
            render: (activity: Activity) => <Text style={secondaryText}>{activity.auditable_type || '-'}</Text>,
        },
        {
            key: 'auditable_id',
            header: t('targetId'),
            priority: 'low',
            render: (activity: Activity) => <Text>{activity.auditable_id || '-'}</Text>,
        },
        {
            key: 'created_at',
            header: t('time'),
            priority: 'high',
            render: (activity: Activity) => <Text style={secondaryText}>{new Date(activity.created_at).toLocaleString()}</Text>,
        },
    ];

    const filterField = (id: string, label: string, control: ReactNode) => (
        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
            <Label for={id} showColon={false}>
                {label}
            </Label>
            {control}
        </FlexBox>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('activityLogsTitle', { count: activities.total })} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <Title level="H3" wrappingType="Normal" style={{ marginBottom: '1.5rem' }}>
                    {t('activityLogsTitle', { count: activities.total })}
                </Title>

                <div style={{ ...cardStyle, marginBottom: '1.5rem', padding: '1rem' }}>
                    <FlexBox wrap="Wrap" alignItems="End" style={{ gap: '1rem' }}>
                        {filterField(
                            'activity-log-event',
                            t('filterByEvent'),
                            <Select
                                id="activity-log-event"
                                style={{ minWidth: 180 }}
                                value={filters.event ?? ''}
                                onChange={(e) => applyFilters({ event: e.detail.selectedOption.value || null })}
                            >
                                <Option value="">{t('allEvents')}</Option>
                                {events.map((event) => (
                                    <Option key={event} value={event}>
                                        {t(event, { defaultValue: event })}
                                    </Option>
                                ))}
                            </Select>,
                        )}

                        {filterField(
                            'activity-log-user',
                            t('filterByUser'),
                            <Select
                                id="activity-log-user"
                                style={{ minWidth: 200 }}
                                value={filters.user_id != null ? String(filters.user_id) : ''}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    applyFilters({ user_id: value === '' ? null : Number(value) });
                                }}
                            >
                                <Option value="">{t('allUsers')}</Option>
                                {users.map((user) => (
                                    <Option key={user.id} value={String(user.id)}>
                                        {user.name}
                                    </Option>
                                ))}
                            </Select>,
                        )}

                        {filterField(
                            'activity-log-date-from',
                            t('dateFrom'),
                            <DatePicker
                                id="activity-log-date-from"
                                valueFormat="yyyy-MM-dd"
                                value={filters.date_from ?? ''}
                                onChange={(e) => applyFilters({ date_from: e.detail.value || null })}
                            />,
                        )}
                        {filterField(
                            'activity-log-date-to',
                            t('dateTo'),
                            <DatePicker
                                id="activity-log-date-to"
                                valueFormat="yyyy-MM-dd"
                                value={filters.date_to ?? ''}
                                onChange={(e) => applyFilters({ date_to: e.detail.value || null })}
                            />,
                        )}

                        {hasActiveFilters && (
                            <Button design="Transparent" onClick={clearFilters}>
                                {t('clearFilters')}
                            </Button>
                        )}
                    </FlexBox>
                </div>

                <FioriResponsiveTable
                    columns={columns}
                    rows={activities.data}
                    getRowKey={(activity) => activity.id}
                    emptyMessage={t('noActivities')}
                />

                {activities.last_page > 1 && (
                    <FlexBox justifyContent="Center" alignItems="Center" wrap="Wrap" style={{ gap: '0.25rem', marginTop: '1.5rem' }}>
                        <Button
                            design="Transparent"
                            icon="slim-arrow-left"
                            accessibleName="Previous page"
                            disabled={activities.current_page <= 1}
                            onClick={() => goToPage(activities.current_page - 1)}
                        />
                        {pageWindow(activities.current_page, activities.last_page).map((page, index) =>
                            page === null ? (
                                <Text key={`gap-${index}`} style={secondaryText}>
                                    …
                                </Text>
                            ) : (
                                <Button
                                    key={page}
                                    design={page === activities.current_page ? 'Emphasized' : 'Transparent'}
                                    onClick={() => page !== activities.current_page && goToPage(page)}
                                >
                                    {String(page)}
                                </Button>
                            ),
                        )}
                        <Button
                            design="Transparent"
                            icon="slim-arrow-right"
                            accessibleName="Next page"
                            disabled={activities.current_page >= activities.last_page}
                            onClick={() => goToPage(activities.current_page + 1)}
                        />
                    </FlexBox>
                )}
            </div>
        </AppLayout>
    );
}
