import { FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { downloadCsv } from '@/lib/csv';
import { FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/alert.js';
import '@ui5/webcomponents-icons/dist/bell.js';
import '@ui5/webcomponents-icons/dist/connected.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/folder-blank.js';
import '@ui5/webcomponents-icons/dist/form.js';
import '@ui5/webcomponents-icons/dist/money-bills.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/org-chart.js';
import '@ui5/webcomponents-icons/dist/overflow.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import '@ui5/webcomponents-icons/dist/tree.js';
import '@ui5/webcomponents-icons/dist/trend-down.js';
import '@ui5/webcomponents-icons/dist/trend-up.js';
import { Button, ButtonBadge, DatePicker, Icon, Label, Menu, MenuItem, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { ComposedChart, DonutChart } from '@ui5/webcomponents-react-charts';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './dashboard.module.css';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: '/dashboard',
    },
];

interface RecentActivity {
    id: number;
    event: string;
    user: string;
    auditable_type: string | null;
    auditable_id: number | null;
    created_at: string;
}

interface TopViewedProduct {
    id: number;
    sku: string;
    name: string;
    category: string;
    image: string | null;
    views: number;
}

interface CategoryOption {
    id: number;
    name: string;
}

interface DashboardFilters {
    category_id: number | null;
    date_from: string | null;
    date_to: string | null;
}

interface ActivityTrendPoint {
    date: string;
    count: number;
}

interface CategoryPieSlice {
    label: string;
    value: number;
}

interface DashboardProps {
    totalProduct: number;
    totalProductTrend?: number | null;
    totalCategory: number;
    totalCategoryTrend?: number | null;
    totalAttribute: number;
    totalAttributeTrend?: number | null;
    totalGroup: number;
    totalGroupTrend?: number | null;
    totalFamilies: number;
    totalFamiliesTrend?: number | null;
    totalLocale: number;
    totalLocaleTrend?: number | null;
    totalCurrencies: number;
    totalCurrenciesTrend?: number | null;
    totalChannels: number;
    totalChannelsTrend?: number | null;
    lowStockCount?: number;
    recentActivities?: RecentActivity[];
    topViewedProducts?: TopViewedProduct[];
    categoryOptions?: CategoryOption[];
    failedJobsCount?: number;
    activityTrendChart?: ActivityTrendPoint[];
    categoryPieChart?: CategoryPieSlice[];
    filters?: DashboardFilters;
}

const EMPTY_FILTERS: DashboardFilters = { category_id: null, date_from: null, date_to: null };

const SECTION_TITLE_STYLE = { fontSize: '1.1rem', fontWeight: 600, color: 'var(--sapTextColor)' } as const;
const CAPTION_STYLE = { color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' } as const;
const INFO_ICON_STYLE = { width: 28, height: 28, color: '#fff' } as const;

function TrendBadge({ trend, onColoredBg = false }: { trend?: number | null; onColoredBg?: boolean }) {
    if (trend === null || trend === undefined) {
        return null;
    }
    const isUp = trend >= 0;
    const color = onColoredBg ? 'rgba(255,255,255,0.95)' : isUp ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', marginTop: '0.25rem', color, position: 'relative', zIndex: 5 }}>
            <Icon name={isUp ? 'trend-up' : 'trend-down'} style={{ width: 14, height: 14, color }} />
            <span style={{ fontWeight: 700, fontSize: '0.7rem' }}>
                {isUp ? '+' : ''}
                {trend}%
            </span>
        </div>
    );
}

function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
    return (
        <div className={styles.cardHeader}>
            <div>
                <Title level="H5" wrappingType="Normal" style={SECTION_TITLE_STYLE}>
                    {title}
                </Title>
                {subtitle && <div style={CAPTION_STYLE}>{subtitle}</div>}
            </div>
            {actions}
        </div>
    );
}

export default function Dashboard({
    totalProduct = 0,
    totalProductTrend = null,
    totalCategory = 0,
    totalCategoryTrend = null,
    totalAttribute = 0,
    totalAttributeTrend = null,
    totalGroup = 0,
    totalGroupTrend = null,
    totalFamilies = 0,
    totalFamiliesTrend = null,
    totalLocale = 0,
    totalLocaleTrend = null,
    totalCurrencies = 0,
    totalCurrenciesTrend = null,
    totalChannels = 0,
    totalChannelsTrend = null,
    lowStockCount = 0,
    recentActivities = [],
    topViewedProducts = [],
    categoryOptions = [],
    failedJobsCount = 0,
    activityTrendChart = [],
    categoryPieChart = [],
    filters = EMPTY_FILTERS,
}: DashboardProps) {
    const { t } = useTranslation('dashboard');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth?.permissions || [];
    const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

    const applyFilters = (partial: Partial<DashboardFilters>) => {
        router.get(
            '/dashboard',
            {
                category_id: partial.category_id !== undefined ? partial.category_id : filters.category_id,
                date_from: partial.date_from !== undefined ? partial.date_from : filters.date_from,
                date_to: partial.date_to !== undefined ? partial.date_to : filters.date_to,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const clearFilters = () => router.get('/dashboard', {}, { preserveState: true, preserveScroll: true, replace: true });

    const handleRefresh = () => {
        router.get(
            '/dashboard',
            { category_id: filters.category_id, date_from: filters.date_from, date_to: filters.date_to, refresh: 1 },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const hasActiveFilters = Boolean(filters.category_id || filters.date_from || filters.date_to);

    const handleExportActivity = () => {
        const headers = [t('id'), t('user'), t('event'), t('targetResource'), t('targetId'), t('time')];
        const rows = recentActivities.map((activity) => [
            activity.id,
            activity.user,
            activity.event,
            activity.auditable_type ?? '-',
            activity.auditable_id ?? '-',
            new Date(activity.created_at).toLocaleString(),
        ]);
        downloadCsv(`recent-activity-${filters.date_from ?? 'all'}_${filters.date_to ?? 'all'}.csv`, headers, rows);
    };

    // KPI tiles — all use the Fiori brand blue as the single accent color;
    // only the "low stock" tile switches to the warning tone when it's
    // actually non-zero, since that one is semantically an alert.
    const smallBoxes = [
        {
            title: t('products'),
            value: totalProduct,
            trend: totalProductTrend,
            icon: 'product',
            link: '/catalog/products',
            permission: 'products.list_products',
        },
        {
            title: t('categories'),
            value: totalCategory,
            trend: totalCategoryTrend,
            icon: 'tree',
            link: '/catalog/categories',
            permission: 'categories.list_categories',
        },
        {
            title: t('attributes'),
            value: totalAttribute,
            trend: totalAttributeTrend,
            icon: 'form',
            link: '/catalog/attributes',
            permission: 'attributes.list_attributes',
        },
        {
            title: t('attributeGroups'),
            value: totalGroup,
            trend: totalGroupTrend,
            icon: 'folder-blank',
            link: '/catalog/attributeGroups',
            permission: 'attribute_groups.list_attribute_groups',
        },
    ].filter((box) => !box.permission || permissions.includes(box.permission));

    const infoBoxes: {
        title: string;
        value: number;
        trend: number | null;
        icon: string;
        iconBg: string;
        link?: string;
        caption?: string;
        permission?: string;
    }[] = [
        {
            title: t('families'),
            value: totalFamilies,
            trend: totalFamiliesTrend,
            icon: 'org-chart',
            iconBg: 'var(--sapBrandColor)',
            link: '/catalog/attributeFamilies',
            permission: 'attribute_families.list_attribute_families',
        },
        {
            title: t('locales'),
            value: totalLocale,
            trend: totalLocaleTrend,
            icon: 'translate',
            iconBg: 'var(--sapBrandColor)',
            link: '/system/locales',
            permission: 'locales.list_locales',
        },
        {
            title: t('currencies'),
            value: totalCurrencies,
            trend: totalCurrenciesTrend,
            icon: 'money-bills',
            iconBg: 'var(--sapNeutralColor)',
            // No currency management page (or permission) exists yet in this
            // app, so this card intentionally stays non-clickable (no `link`)
            // and visible to anyone who can reach the dashboard.
        },
        {
            title: t('channels'),
            value: totalChannels,
            trend: totalChannelsTrend,
            icon: 'connected',
            iconBg: 'var(--sapBrandColor)',
            link: '/catalog/channels',
            permission: 'channels.list_channels',
        },
        {
            title: t('lowStock'),
            value: lowStockCount,
            trend: null,
            icon: 'alert',
            iconBg: lowStockCount > 0 ? 'var(--sapCriticalColor)' : 'var(--sapNeutralColor)',
            link: '/catalog/products',
            caption: t('lowStockCaption'),
            permission: 'products.list_products',
        },
    ].filter((box) => !box.permission || permissions.includes(box.permission));

    // "System Console" widget (Manage Users/Manage Roles launcher) is gated
    // separately from the activity log preview below — they're unrelated
    // permissions even though both used to piggyback on the same one.
    const canViewSystemConsole = permissions.includes('users.list_users') || permissions.includes('roles.list_roles');
    const canViewActivity = permissions.includes('activity_logs.list_activity_logs');
    const canViewProducts = permissions.includes('products.list_products');

    const trendDataset = activityTrendChart.map((point) => ({ date: point.date.slice(5), count: point.count }));
    const pieDataset = categoryPieChart.map((slice) => ({ label: slice.label, value: slice.value }));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard')} />
            <div className={styles.page}>
                {/* Content Header */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start', marginBottom: '1.5rem' }}>
                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('overview')}</Text>
                    <Title level="H2" style={{ fontSize: '1.8rem', fontWeight: 600 }}>
                        {t('dashboard')}
                    </Title>
                </div>

                {/* Toolbar: filters, export, notifications */}
                <div className={styles.card} style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                        {canViewProducts && categoryOptions.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200 }}>
                                <Label for="dashboard-category-filter" showColon={false}>
                                    {t('filterByCategory')}
                                </Label>
                                <Select
                                    id="dashboard-category-filter"
                                    accessibleName={t('filterByCategory')}
                                    value={filters.category_id != null ? String(filters.category_id) : ''}
                                    onChange={(event) => {
                                        const value = event.detail.selectedOption?.value ?? '';
                                        applyFilters({ category_id: value === '' ? null : Number(value) });
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    <Option value="">{t('allCategories')}</Option>
                                    {categoryOptions.map((category) => (
                                        <Option key={category.id} value={String(category.id)}>
                                            {category.name}
                                        </Option>
                                    ))}
                                </Select>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Label for="dashboard-date-from" showColon={false}>
                                {t('dateFrom')}
                            </Label>
                            <DatePicker
                                id="dashboard-date-from"
                                accessibleName={t('dateFrom')}
                                valueFormat="yyyy-MM-dd"
                                value={filters.date_from ?? ''}
                                onChange={(event) => applyFilters({ date_from: event.detail.value || null })}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Label for="dashboard-date-to" showColon={false}>
                                {t('dateTo')}
                            </Label>
                            <DatePicker
                                id="dashboard-date-to"
                                accessibleName={t('dateTo')}
                                valueFormat="yyyy-MM-dd"
                                value={filters.date_to ?? ''}
                                onChange={(event) => applyFilters({ date_to: event.detail.value || null })}
                            />
                        </div>

                        {hasActiveFilters && (
                            <Button design="Transparent" onClick={clearFilters}>
                                {t('clearFilters')}
                            </Button>
                        )}

                        <div style={{ flexGrow: 1 }} />

                        <Button icon="download" onClick={handleExportActivity} disabled={recentActivities.length === 0}>
                            {t('exportActivity')}
                        </Button>

                        {permissions.includes('job_trackers.list_job_trackers') && (
                            <Button
                                design="Transparent"
                                icon="bell"
                                tooltip={t('failedJobsTooltip', { count: failedJobsCount })}
                                accessibleName={t('failedJobsTooltip', { count: failedJobsCount })}
                                onClick={() => router.visit('/import-export/jobs')}
                                badge={failedJobsCount > 0 ? <ButtonBadge design="OverlayText" text={String(failedJobsCount)} /> : undefined}
                            />
                        )}
                    </div>
                </div>

                {/* Main Content: Row 1 - Small Boxes */}
                <div className={styles.tileGrid} style={{ marginBottom: '1.5rem' }}>
                    {smallBoxes.map((box, i) => (
                        <div key={i} className={`${styles.card} ${styles.smallBox}`}>
                            <div style={{ padding: '1rem', flex: 1 }}>
                                <div
                                    style={{
                                        fontSize: '2.2rem',
                                        fontWeight: 700,
                                        marginBottom: '0.5rem',
                                        zIndex: 5,
                                        position: 'relative',
                                        color: 'var(--sapTextColor)',
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {box.value}
                                </div>
                                <div
                                    style={{
                                        fontSize: '0.9rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.02em',
                                        color: 'var(--sapContent_LabelColor)',
                                        zIndex: 5,
                                        position: 'relative',
                                    }}
                                >
                                    {box.title}
                                </div>
                                <TrendBadge trend={box.trend} />
                                <Icon name={box.icon} className={styles.smallBoxIcon} />
                            </div>
                            <Link href={box.link} className={styles.moreInfo}>
                                {t('moreInfo')} <Icon name="navigation-right-arrow" style={{ width: 16, height: 16, color: 'inherit' }} />
                            </Link>
                        </div>
                    ))}
                </div>

                {/* Row 2 - Info Boxes */}
                <div className={styles.tileGrid} style={{ marginBottom: '2rem' }}>
                    {infoBoxes.map((box, i) => {
                        const content = (
                            <>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 70,
                                        background: box.iconBg,
                                        flexShrink: 0,
                                    }}
                                >
                                    <Icon name={box.icon} style={INFO_ICON_STYLE} />
                                </div>
                                <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div
                                        style={{
                                            color: 'var(--sapContent_LabelColor)',
                                            textTransform: 'uppercase',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {box.title}
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--sapTextColor)', marginTop: '0.125rem' }}>
                                        {box.value}
                                    </div>
                                    <TrendBadge trend={box.trend} />
                                    {box.caption && <div style={{ ...CAPTION_STYLE, fontStyle: 'italic', marginTop: '0.125rem' }}>{box.caption}</div>}
                                </div>
                            </>
                        );
                        return box.link ? (
                            <Link key={i} href={box.link} className={`${styles.card} ${styles.infoBox} ${styles.infoBoxLink}`}>
                                {content}
                            </Link>
                        ) : (
                            <div key={i} className={`${styles.card} ${styles.infoBox}`}>
                                {content}
                            </div>
                        );
                    })}
                </div>

                {/* Row 2.5 - Top Viewed Products */}
                {canViewProducts && (
                    <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
                        <SectionHeader title={t('topViewedProducts')} subtitle={t('topViewedSubtitle')} />
                        <FioriResponsiveTable
                            variant="plain"
                            columns={[
                                {
                                    key: 'rank',
                                    header: t('rank'),
                                    width: '5rem',
                                    render: (product) => {
                                        const index = topViewedProducts.indexOf(product);
                                        return (
                                            <span style={{ fontWeight: 700, color: index < 3 ? 'var(--sapBrandColor)' : undefined }}>
                                                #{index + 1}
                                            </span>
                                        );
                                    },
                                },
                                {
                                    key: 'product',
                                    header: t('product'),
                                    minWidth: '14rem',
                                    render: (product) => (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <img
                                                src={product.image ?? `https://images.dcpumpkin.com/images/product/500/${product.sku}.jpg`}
                                                alt={product.name}
                                                onError={(event) => {
                                                    (event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                                                }}
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    objectFit: 'contain',
                                                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                                                    background: 'var(--sapList_HeaderBackground)',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span style={{ fontWeight: 600 }}>{product.name}</span>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'category',
                                    header: t('category'),
                                    priority: 'medium',
                                    render: (product) => <span className={styles.secondary}>{product.category}</span>,
                                },
                                {
                                    key: 'views',
                                    header: t('views'),
                                    priority: 'high',
                                    align: 'right',
                                    render: (product) => <span style={{ fontWeight: 700 }}>{product.views}</span>,
                                },
                            ]}
                            rows={topViewedProducts}
                            getRowKey={(product) => product.id}
                            emptyMessage={t('noViewData')}
                        />
                    </div>
                )}

                {/* Row 2.6 - Charts */}
                {(canViewActivity || canViewProducts) && (
                    <div className={styles.chartGrid} style={{ marginBottom: '2rem' }}>
                        {canViewActivity && (
                            <div className={styles.card} style={{ height: '100%' }}>
                                <SectionHeader title={t('activityTrendChartTitle')} />
                                <div style={{ padding: '1rem' }}>
                                    <ComposedChart
                                        style={{ height: 260 }}
                                        dataset={trendDataset}
                                        dimensions={[{ accessor: 'date' }]}
                                        measures={[
                                            {
                                                accessor: 'count',
                                                label: t('activityCount'),
                                                type: 'area',
                                                color: 'var(--sapBrandColor)',
                                                hideDataLabel: true,
                                            },
                                        ]}
                                        chartConfig={{ margin: { left: 0, right: 20, top: 20, bottom: 0 } }}
                                    />
                                </div>
                            </div>
                        )}
                        {canViewProducts && (
                            <div className={styles.card} style={{ height: '100%' }}>
                                <SectionHeader title={t('categoryPieChartTitle')} />
                                <div style={{ padding: '1rem' }}>
                                    {categoryPieChart.length > 0 ? (
                                        <DonutChart
                                            style={{ height: 260 }}
                                            dataset={pieDataset}
                                            dimension={{ accessor: 'label' }}
                                            measure={{ accessor: 'value', hideDataLabel: true }}
                                        />
                                    ) : (
                                        <div style={{ color: 'var(--sapContent_LabelColor)', padding: '2rem 0', textAlign: 'center' }}>
                                            {t('noChartData')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Row 3 - AdminLTE Classic Card Widget */}
                {canViewSystemConsole && (
                    <div className={styles.card}>
                        <SectionHeader
                            title={t('systemConsole')}
                            actions={
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <Button
                                        design="Transparent"
                                        icon="refresh"
                                        tooltip={t('refresh')}
                                        accessibleName={t('refresh')}
                                        onClick={handleRefresh}
                                    />
                                    <Button
                                        design="Transparent"
                                        icon="overflow"
                                        accessibleName={t('systemConsole')}
                                        onClick={(event) => setMoreAnchor(event.currentTarget as HTMLElement)}
                                    />
                                    <Menu
                                        opener={moreAnchor}
                                        open={Boolean(moreAnchor)}
                                        onClose={() => setMoreAnchor(null)}
                                        onItemClick={(event) => {
                                            const href = (event.detail.item as HTMLElement).dataset.href;
                                            setMoreAnchor(null);
                                            if (href) router.visit(href);
                                        }}
                                    >
                                        {permissions.includes('users.list_users') && <MenuItem text={t('manageUsers')} data-href="/system/user" />}
                                        {permissions.includes('roles.list_roles') && <MenuItem text={t('manageRoles')} data-href="/system/roles" />}
                                    </Menu>
                                </div>
                            }
                        />
                        <div style={{ padding: '1.5rem' }}>
                            <Text style={{ color: 'var(--sapContent_LabelColor)', marginBottom: '1rem', display: 'block' }}>
                                {t('welcomeMessage')}
                            </Text>
                            <Button design="Emphasized" onClick={() => router.visit('/catalog/products')}>
                                {t('manageProducts')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Recent Activity */}
                {canViewActivity && (
                    <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                        <SectionHeader
                            title={t('recentActivity')}
                            subtitle={t('operations')}
                            actions={
                                <Button design="Transparent" endIcon="navigation-right-arrow" onClick={() => router.visit('/system/activity-logs')}>
                                    {t('viewAll')}
                                </Button>
                            }
                        />
                        <FioriResponsiveTable
                            variant="plain"
                            columns={[
                                { key: 'id', header: t('id'), width: '5rem', render: (activity) => `#${activity.id}` },
                                {
                                    key: 'user',
                                    header: t('user'),
                                    render: (activity) => <span style={{ fontWeight: 600 }}>{activity.user}</span>,
                                },
                                {
                                    key: 'event',
                                    header: t('event'),
                                    priority: 'high',
                                    render: (activity) => {
                                        const eventTone: FioriTone =
                                            activity.event === 'created'
                                                ? 'success'
                                                : activity.event === 'updated'
                                                  ? 'information'
                                                  : activity.event === 'deleted'
                                                    ? 'error'
                                                    : 'neutral';
                                        return (
                                            <FioriStatus
                                                label={t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                                                tone={eventTone}
                                            />
                                        );
                                    },
                                },
                                {
                                    key: 'resource',
                                    header: t('targetResource'),
                                    priority: 'medium',
                                    render: (activity) => <span className={styles.secondary}>{activity.auditable_type || '-'}</span>,
                                },
                                { key: 'targetId', header: t('targetId'), priority: 'low', render: (activity) => activity.auditable_id || '-' },
                                {
                                    key: 'time',
                                    header: t('time'),
                                    priority: 'medium',
                                    render: (activity) => <span className={styles.secondary}>{new Date(activity.created_at).toLocaleString()}</span>,
                                },
                            ]}
                            rows={recentActivities}
                            getRowKey={(activity) => activity.id}
                            emptyMessage={t('noActivities')}
                        />
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
