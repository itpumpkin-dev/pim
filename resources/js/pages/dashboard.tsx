import AppLayout from '@/layouts/app-layout';
import { downloadCsv } from '@/lib/csv';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Box,
    Card,
    CardContent,
    Grid,
    Typography,
    Button,
    IconButton,
    useTheme,
    Divider,
    Stack,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Tooltip,
    Badge,
    Menu,
} from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FolderIcon from '@mui/icons-material/Folder';
import SchemaIcon from '@mui/icons-material/Schema';
import TranslateIcon from '@mui/icons-material/Translate';
import PaidIcon from '@mui/icons-material/Paid';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowCircleRightIcon from '@mui/icons-material/ArrowCircleRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import NotificationsIcon from '@mui/icons-material/Notifications';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { PALETTE } from '@/theme';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

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

function TrendBadge({ trend, onColoredBg = false }: { trend?: number | null; onColoredBg?: boolean }) {
    if (trend === null || trend === undefined) {
        return null;
    }
    const isUp = trend >= 0;
    const color = onColoredBg ? 'rgba(255,255,255,0.95)' : isUp ? '#22c55e' : '#ef4444';
    const Icon = isUp ? TrendingUpIcon : TrendingDownIcon;

    return (
        <Stack direction="row" spacing={0.3} alignItems="center" sx={{ mt: 0.5, color, position: 'relative', zIndex: 5 }}>
            <Icon sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
                {isUp ? '+' : ''}
                {trend}%
            </Typography>
        </Stack>
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
    const theme = useTheme();
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

    // Map AdminLTE UI components using the customized PALETTE from theme.ts
    // Accent (Orange #EA580C) / Highlight (Cyan #06B6D4) / Primary (Slate Blue #334155) / Secondary (Mid Gray #9CA3AF)
    const smallBoxes = [
        {
            title: t('products'),
            value: totalProduct,
            trend: totalProductTrend,
            icon: <Inventory2Icon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.accent, // Signal Orange #EA580C
            color: '#fff',
            link: '/catalog/products',
            permission: 'products.list_products',
        },
        {
            title: t('categories'),
            value: totalCategory,
            trend: totalCategoryTrend,
            icon: <CategoryIcon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.highlight, // Data Cyan #06B6D4
            color: '#fff',
            link: '/catalog/categories',
            permission: 'categories.list_categories',
        },
        {
            title: t('attributes'),
            value: totalAttribute,
            trend: totalAttributeTrend,
            icon: <AssignmentIcon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.primary, // Slate Blue #334155
            color: '#fff',
            link: '/catalog/attributes',
            permission: 'attributes.list_attributes',
        },
        {
            title: t('attributeGroups'),
            value: totalGroup,
            trend: totalGroupTrend,
            icon: <FolderIcon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.secondary, // Mid Gray #9CA3AF
            color: '#fff',
            link: '/catalog/attributeGroups',
            permission: 'attribute_groups.list_attribute_groups',
        },
    ].filter(box => !box.permission || permissions.includes(box.permission));

    const infoBoxes = [
        {
            title: t('families'),
            value: totalFamilies,
            trend: totalFamiliesTrend,
            icon: <SchemaIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.accent, // Signal Orange
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            link: '/catalog/attributeFamilies',
            permission: 'attribute_families.list_attribute_families',
        },
        {
            title: t('locales'),
            value: totalLocale,
            trend: totalLocaleTrend,
            icon: <TranslateIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.highlight, // Data Cyan
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            link: '/system/locales',
            permission: 'locales.list_locales',
        },
        {
            title: t('currencies'),
            value: totalCurrencies,
            trend: totalCurrenciesTrend,
            icon: <PaidIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.primary, // Slate Blue
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            // No currency management page exists yet in this app, so this
            // card intentionally stays non-clickable (no `link`).
            permission: 'currencies.list_currencies',
        },
        {
            title: t('channels'),
            value: totalChannels,
            trend: totalChannelsTrend,
            icon: <SettingsInputAntennaIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.secondary, // Mid Gray
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            link: '/catalog/channels',
            permission: 'channels.list_channels',
        },
        {
            title: t('lowStock'),
            value: lowStockCount,
            trend: null as number | null,
            icon: <WarningAmberIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: lowStockCount > 0 ? '#DC2626' : PALETTE.secondary,
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            link: '/catalog/products',
            caption: t('lowStockCaption'),
            permission: 'products.list_products',
        },
    ].filter(box => !box.permission || permissions.includes(box.permission));

    const canViewConsole = permissions.includes('users.list_users') || permissions.includes('roles.list_roles');
    const canViewProducts = permissions.includes('products.list_products');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard')} />
            <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.default', minHeight: '100%', color: 'text.primary', fontFamily: '"Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>

                {/* Content Header */}
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'start', mb: 3 }}>
                    <Typography variant="h5" fontWeight={400} sx={{ fontSize: '1rem', color: 'text.secondary' }}>
                        {t('overview')}
                    </Typography>
                    <Typography variant="h5" fontWeight={700} sx={{ fontSize: '1.8rem', color: 'text.primary' }}>
                        {t('dashboard')}
                    </Typography>
                </Box>

                {/* Toolbar: filters, export, notifications */}
                <Card variant="outlined" sx={{ mb: 3, p: 2, borderRadius: '0.25rem', bgcolor: 'background.paper' }}>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                        {canViewProducts && categoryOptions.length > 0 && (
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <InputLabel id="dashboard-category-filter-label">{t('filterByCategory')}</InputLabel>
                                <Select
                                    labelId="dashboard-category-filter-label"
                                    label={t('filterByCategory')}
                                    value={filters.category_id ?? ''}
                                    onChange={(event) => applyFilters({ category_id: event.target.value === '' ? null : Number(event.target.value) })}
                                >
                                    <MenuItem value="">{t('allCategories')}</MenuItem>
                                    {categoryOptions.map((category) => (
                                        <MenuItem key={category.id} value={category.id}>
                                            {category.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}

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

                        <Box sx={{ flexGrow: 1 }} />

                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FileDownloadOutlinedIcon />}
                            onClick={handleExportActivity}
                            disabled={recentActivities.length === 0}
                        >
                            {t('exportActivity')}
                        </Button>

                        {permissions.includes('job_trackers.list_job_trackers') && (
                            <Tooltip title={t('failedJobsTooltip', { count: failedJobsCount })}>
                                <IconButton component={Link} href="/import-export/jobs">
                                    <Badge badgeContent={failedJobsCount} color="error">
                                        <NotificationsIcon />
                                    </Badge>
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                </Card>

                {/* Main Content: Row 1 - Small Boxes */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {smallBoxes.map((box, i) => (
                        <Grid item xs={12} sm={6} md={3} key={i}>
                            <Box
                                sx={{
                                    position: 'relative',
                                    display: 'block',
                                    borderRadius: '0.25rem',
                                    bgcolor: box.bg,
                                    color: box.color,
                                    boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)',
                                    overflow: 'hidden',
                                    '&:hover': {
                                        textDecoration: 'none',
                                        '& svg': {
                                            transform: 'scale(1.1)',
                                            transition: 'transform 0.3s linear',
                                        }
                                    }
                                }}
                            >
                                <Box sx={{ p: 2, pb: 4 }}>
                                    <Typography variant="h3" fontWeight={700} sx={{ fontSize: '2.2rem', mb: 1, zIndex: 5, position: 'relative' }}>
                                        {box.value}
                                    </Typography>
                                    <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.02em', opacity: 0.9, zIndex: 5, position: 'relative' }}>
                                        {box.title}
                                    </Typography>
                                    <TrendBadge trend={box.trend} onColoredBg />
                                    {box.icon}
                                </Box>
                                <Box
                                    component={Link}
                                    href={box.link}
                                    sx={{
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: 'rgba(0,0,0,.1)',
                                        color: box.color,
                                        py: 0.75,
                                        zIndex: 10,
                                        textDecoration: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        transition: 'background-color 0.2s',
                                        '&:hover': {
                                            bgcolor: 'rgba(0,0,0,.15)',
                                            color: box.color,
                                        }
                                    }}
                                >
                                    {t('moreInfo')} <ArrowCircleRightIcon sx={{ fontSize: 16, ml: 1 }} />
                                </Box>
                            </Box>
                        </Grid>
                    ))}
                </Grid>

                {/* Row 2 - Info Boxes */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    {infoBoxes.map((box, i) => (
                        <Grid item xs={12} sm={6} md={3} key={i}>
                            <Box
                                component={box.link ? Link : 'div'}
                                {...(box.link ? { href: box.link } : {})}
                                sx={{
                                    display: 'flex',
                                    borderRadius: '0.25rem',
                                    bgcolor: box.bg,
                                    boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: { xs: 2, md: 0 },
                                    overflow: 'hidden',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    cursor: box.link ? 'pointer' : 'default',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    '&:hover': box.link ? { transform: 'translateY(-2px)', boxShadow: 3 } : {},
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 70,
                                        bgcolor: box.iconBg,
                                        flexShrink: 0,
                                    }}
                                >
                                    {box.icon}
                                </Box>
                                <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                                        {box.title}
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.25rem', color: 'text.primary', mt: 0.25 }}>
                                        {box.value}
                                    </Typography>
                                    <TrendBadge trend={box.trend} />
                                    {box.caption && (
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', mt: 0.25 }}>
                                            {box.caption}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Grid>
                    ))}
                </Grid>

                {/* Row 2.5 - Top Viewed Products */}
                {canViewProducts && (
                    <Box sx={{ mb: 4 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'start', mb: 3 }}>
                            <Typography variant="h5" fontWeight={400} sx={{ fontSize: '1rem', color: 'text.secondary' }}>
                                {t('topViewedSubtitle')}
                            </Typography>
                            <Typography variant="h5" fontWeight={700} sx={{ fontSize: '1.8rem', color: 'text.primary' }}>
                                {t('topViewedProducts')}
                            </Typography>
                        </Box>

                        <Card
                            variant="outlined"
                            sx={{
                                borderRadius: '0.25rem',
                                borderTop: `3px solid ${PALETTE.accent}`,
                                bgcolor: 'background.paper',
                                boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)',
                            }}
                        >
                            <CardContent sx={{ p: 0 }}>
                                <Box sx={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('rank')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('product')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('category')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('views')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topViewedProducts.map((product, index) => (
                                                <tr key={product.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', fontWeight: 700, color: index < 3 ? PALETTE.accent : undefined }}>
                                                        #{index + 1}
                                                    </td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>
                                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                                            <Box
                                                                component="img"
                                                                src={product.image ?? `https://images.dcpumpkin.com/images/product/500/${product.sku}.jpg`}
                                                                alt={product.name}
                                                                onError={(event) => {
                                                                    (event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                                                                }}
                                                                sx={{
                                                                    width: 36,
                                                                    height: 36,
                                                                    objectFit: 'contain',
                                                                    borderRadius: 1,
                                                                    border: '1px solid',
                                                                    borderColor: 'divider',
                                                                    bgcolor: 'action.hover',
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <Typography variant="body2" fontWeight={600}>
                                                                {product.name}
                                                            </Typography>
                                                        </Stack>
                                                    </td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'text.secondary' }}>{product.category}</td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', fontWeight: 700 }}>{product.views}</td>
                                                </tr>
                                            ))}
                                            {topViewedProducts.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'text.secondary' }}>
                                                        {t('noViewData')}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </Box>
                            </CardContent>
                        </Card>
                    </Box>
                )}

                {/* Row 2.6 - Charts */}
                {(canViewConsole || canViewProducts) && (
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        {canViewConsole && (
                            <Grid item xs={12} md={6}>
                                <Card
                                    variant="outlined"
                                    sx={{ borderRadius: '0.25rem', borderTop: `3px solid ${PALETTE.highlight}`, bgcolor: 'background.paper', p: 2, height: '100%' }}
                                >
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                                        {t('activityTrendChartTitle')}
                                    </Typography>
                                    <LineChart
                                        height={260}
                                        series={[
                                            {
                                                data: activityTrendChart.map((point) => point.count),
                                                label: t('activityCount'),
                                                color: PALETTE.highlight,
                                                area: true,
                                            },
                                        ]}
                                        xAxis={[{ scaleType: 'point', data: activityTrendChart.map((point) => point.date.slice(5)) }]}
                                        margin={{ left: 40, right: 20, top: 20, bottom: 30 }}
                                    />
                                </Card>
                            </Grid>
                        )}
                        {canViewProducts && (
                            <Grid item xs={12} md={6}>
                                <Card
                                    variant="outlined"
                                    sx={{ borderRadius: '0.25rem', borderTop: `3px solid ${PALETTE.accent}`, bgcolor: 'background.paper', p: 2, height: '100%' }}
                                >
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                                        {t('categoryPieChartTitle')}
                                    </Typography>
                                    {categoryPieChart.length > 0 ? (
                                        <PieChart
                                            height={260}
                                            series={[
                                                {
                                                    data: categoryPieChart.map((slice, index) => ({ id: index, value: slice.value, label: slice.label })),
                                                    innerRadius: 40,
                                                },
                                            ]}
                                        />
                                    ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                                            {t('noChartData')}
                                        </Typography>
                                    )}
                                </Card>
                            </Grid>
                        )}
                    </Grid>
                )}

                {/* Row 3 - AdminLTE Classic Card Widget */}
                {canViewConsole && (
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Card
                                variant="outlined"
                                sx={{
                                    borderRadius: '0.25rem',
                                    borderTop: `3px solid ${PALETTE.accent}`,
                                    bgcolor: 'background.paper',
                                    boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)',
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        px: 2.5,
                                        py: 1.5,
                                    }}
                                >
                                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: 'text.primary' }}>
                                        {t('systemConsole')}
                                    </Typography>
                                    <Box>
                                        <Tooltip title={t('refresh')}>
                                            <IconButton size="small" sx={{ mr: 0.5 }} onClick={handleRefresh}>
                                                <RefreshIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton size="small" onClick={(event) => setMoreAnchor(event.currentTarget)}>
                                            <MoreVertIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                        <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
                                            {permissions.includes('users.list_users') && (
                                                <MenuItem component={Link} href="/system/user" onClick={() => setMoreAnchor(null)}>
                                                    {t('manageUsers')}
                                                </MenuItem>
                                            )}
                                            {permissions.includes('roles.list_roles') && (
                                                <MenuItem component={Link} href="/system/roles" onClick={() => setMoreAnchor(null)}>
                                                    {t('manageRoles')}
                                                </MenuItem>
                                            )}
                                        </Menu>
                                    </Box>
                                </Box>
                                <CardContent sx={{ p: 3 }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                        {t('welcomeMessage')}
                                    </Typography>
                                    <Button
                                        component={Link}
                                        href="/catalog/products"
                                        variant="contained"
                                        sx={{
                                            bgcolor: PALETTE.accent,
                                            color: '#fff',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            borderRadius: '0.25rem',
                                            boxShadow: 'none',
                                            '&:hover': {
                                                bgcolor: PALETTE.accent,
                                                opacity: 0.9,
                                                boxShadow: 'none',
                                            }
                                        }}
                                    >
                                        {t('manageProducts')}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                )}

                <Divider sx={{ my: 3 }} />
                {/* Recent Activity */}
                {canViewConsole && (
                    <Box sx={{ mt: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
                            <Box>
                                <Typography variant="h5" fontWeight={400} sx={{ fontSize: '1rem', color: 'text.secondary' }}>
                                    {t('operations')}
                                </Typography>
                                <Typography variant="h5" fontWeight={700} sx={{ fontSize: '1.8rem', color: 'text.primary' }}>
                                    {t('recentActivity')}
                                </Typography>
                            </Box>
                            <Button component={Link} href="/system/activity-logs" size="small" endIcon={<ArrowCircleRightIcon sx={{ fontSize: 16 }} />}>
                                {t('viewAll')}
                            </Button>
                        </Stack>

                        <Card
                            variant="outlined"
                            sx={{
                                borderRadius: '0.25rem',
                                borderTop: `3px solid ${PALETTE.highlight}`,
                                bgcolor: 'background.paper',
                                boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)',
                            }}
                        >
                            <CardContent sx={{ p: 0 }}>
                                <Box sx={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('id')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('user')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('event')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('targetResource')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('targetId')}</th>
                                                <th style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>{t('time')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentActivities.map((activity) => (
                                                <tr key={activity.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>#{activity.id}</td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600 }}>{activity.user}</td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            color: '#fff',
                                                            backgroundColor:
                                                                activity.event === 'created' ? '#28a745' :
                                                                    activity.event === 'updated' ? '#007bff' :
                                                                        activity.event === 'deleted' ? '#dc3545' :
                                                                            activity.event === 'login' ? '#17a2b8' : '#6c757d'
                                                        }}>
                                                            {t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'text.secondary' }}>
                                                        {activity.auditable_type || '-'}
                                                    </td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem' }}>
                                                        {activity.auditable_id || '-'}
                                                    </td>
                                                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'text.secondary' }}>
                                                        {new Date(activity.created_at).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                            {recentActivities.length === 0 && (
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
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
