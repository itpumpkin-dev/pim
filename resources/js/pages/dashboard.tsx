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
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FIORI, FIORI_RAW, FioriStatus, type FioriTone, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriGhostSx, fioriIconButtonSx, fioriTableHeadSx } from '@/lib/fiori-style';

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

const TH_SX = { padding: '12px 20px', fontWeight: 600, fontSize: '0.8rem', color: FIORI.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' };
const TD_SX = { padding: '12px 20px', fontSize: '0.875rem', color: FIORI.textPrimary };
const TR_SX = {
    borderBottom: `1px solid ${FIORI.border}`,
    transition: 'background-color 0.15s',
    '&:hover': { bgcolor: FIORI.hover },
    '&:last-of-type': { borderBottom: 'none' },
};

function TrendBadge({ trend, onColoredBg = false }: { trend?: number | null; onColoredBg?: boolean }) {
    if (trend === null || trend === undefined) {
        return null;
    }
    const isUp = trend >= 0;
    const color = onColoredBg ? 'rgba(255,255,255,0.95)' : isUp ? FIORI.success : FIORI.error;
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
            icon: <Inventory2Icon sx={{ fontSize: 75, opacity: 0.12, position: 'absolute', right: 12, top: 12, color: FIORI.brand }} />,
            link: '/catalog/products',
            permission: 'products.list_products',
        },
        {
            title: t('categories'),
            value: totalCategory,
            trend: totalCategoryTrend,
            icon: <CategoryIcon sx={{ fontSize: 75, opacity: 0.12, position: 'absolute', right: 12, top: 12, color: FIORI.brand }} />,
            link: '/catalog/categories',
            permission: 'categories.list_categories',
        },
        {
            title: t('attributes'),
            value: totalAttribute,
            trend: totalAttributeTrend,
            icon: <AssignmentIcon sx={{ fontSize: 75, opacity: 0.12, position: 'absolute', right: 12, top: 12, color: FIORI.brand }} />,
            link: '/catalog/attributes',
            permission: 'attributes.list_attributes',
        },
        {
            title: t('attributeGroups'),
            value: totalGroup,
            trend: totalGroupTrend,
            icon: <FolderIcon sx={{ fontSize: 75, opacity: 0.12, position: 'absolute', right: 12, top: 12, color: FIORI.brand }} />,
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
            iconBg: FIORI.brand,
            link: '/catalog/attributeFamilies',
            permission: 'attribute_families.list_attribute_families',
        },
        {
            title: t('locales'),
            value: totalLocale,
            trend: totalLocaleTrend,
            icon: <TranslateIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: FIORI.brand,
            link: '/system/locales',
            permission: 'locales.list_locales',
        },
        {
            title: t('currencies'),
            value: totalCurrencies,
            trend: totalCurrenciesTrend,
            icon: <PaidIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: FIORI.neutral,
            // No currency management page (or permission) exists yet in this
            // app, so this card intentionally stays non-clickable (no `link`)
            // and visible to anyone who can reach the dashboard.
        },
        {
            title: t('channels'),
            value: totalChannels,
            trend: totalChannelsTrend,
            icon: <SettingsInputAntennaIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: FIORI.brand,
            link: '/catalog/channels',
            permission: 'channels.list_channels',
        },
        {
            title: t('lowStock'),
            value: lowStockCount,
            trend: null as number | null,
            icon: <WarningAmberIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: lowStockCount > 0 ? FIORI.warning : FIORI.neutral,
            link: '/catalog/products',
            caption: t('lowStockCaption'),
            permission: 'products.list_products',
        },
    ].filter(box => !box.permission || permissions.includes(box.permission));

    // "System Console" widget (Manage Users/Manage Roles launcher) is gated
    // separately from the activity log preview below — they're unrelated
    // permissions even though both used to piggyback on the same one.
    const canViewSystemConsole = permissions.includes('users.list_users') || permissions.includes('roles.list_roles');
    const canViewActivity = permissions.includes('activity_logs.list_activity_logs');
    const canViewProducts = permissions.includes('products.list_products');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard')} />
            <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: FIORI.pageBg, minHeight: '100%', color: FIORI.textPrimary, fontFamily: '"Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>

                {/* Content Header */}
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'start', mb: 3 }}>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                        {t('overview')}
                    </Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ fontSize: '1.8rem', color: FIORI.textPrimary }}>
                        {t('dashboard')}
                    </Typography>
                </Box>

                {/* Toolbar: filters, export, notifications */}
                <Card elevation={0} sx={{ mb: 3, p: 2, ...fioriCardSx }}>
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
                            <Button size="small" onClick={clearFilters} sx={fioriGhostSx}>
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
                            sx={fioriDefaultSx}
                        >
                            {t('exportActivity')}
                        </Button>

                        {permissions.includes('job_trackers.list_job_trackers') && (
                            <Tooltip title={t('failedJobsTooltip', { count: failedJobsCount })}>
                                <IconButton component={Link} href="/import-export/jobs" sx={fioriIconButtonSx}>
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
                        <Grid item xs={12} sm={6} md={3} key={i} sx={{ display: 'flex' }}>
                            <Box
                                sx={{
                                    ...fioriCardSx,
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    width: '100%',
                                    color: FIORI.textPrimary,
                                    '&:hover': {
                                        textDecoration: 'none',
                                        borderColor: FIORI.borderStrong,
                                        '& svg': {
                                            transform: 'scale(1.1)',
                                            transition: 'transform 0.3s linear',
                                        }
                                    }
                                }}
                            >
                                <Box sx={{ p: 2, pb: 2, flex: 1 }}>
                                    <Typography variant="h3" fontWeight={700} sx={{ fontSize: '2.2rem', mb: 1, zIndex: 5, position: 'relative', color: FIORI.textPrimary }}>
                                        {box.value}
                                    </Typography>
                                    <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.02em', color: FIORI.textSecondary, zIndex: 5, position: 'relative' }}>
                                        {box.title}
                                    </Typography>
                                    <TrendBadge trend={box.trend} />
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
                                        bgcolor: FIORI.headerBg,
                                        borderTop: `1px solid ${FIORI.border}`,
                                        color: FIORI.brand,
                                        py: 0.75,
                                        zIndex: 10,
                                        textDecoration: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        transition: 'background-color 0.2s',
                                        '&:hover': {
                                            bgcolor: FIORI.hover,
                                            color: FIORI.brandDark,
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
                        <Grid item xs={12} sm={6} md={3} key={i} sx={{ display: 'flex' }}>
                            <Box
                                component={box.link ? Link : 'div'}
                                {...(box.link ? { href: box.link } : {})}
                                sx={{
                                    ...fioriCardSx,
                                    display: 'flex',
                                    width: '100%',
                                    mb: { xs: 2, md: 0 },
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    cursor: box.link ? 'pointer' : 'default',
                                    transition: 'border-color 0.15s ease',
                                    '&:hover': box.link ? { borderColor: FIORI.borderStrong } : {},
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
                                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                                        {box.title}
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.25rem', color: FIORI.textPrimary, mt: 0.25 }}>
                                        {box.value}
                                    </Typography>
                                    <TrendBadge trend={box.trend} />
                                    {box.caption && (
                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontStyle: 'italic', mt: 0.25 }}>
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
                    <Card elevation={0} sx={{ mb: 3, ...fioriCardSx }}>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: `1px solid ${FIORI.border}`,
                                px: 2.5,
                                py: 1.5,
                            }}
                        >
                            <Box>
                                <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: FIORI.textPrimary }}>
                                    {t('topViewedProducts')}
                                </Typography>
                                <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                    {t('topViewedSubtitle')}
                                </Typography>
                            </Box>
                        </Box>
                        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                            <Box sx={{ overflowX: 'auto' }}>
                                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <Box component="thead" sx={fioriTableHeadSx}>
                                        <Box component="tr">
                                            <Box component="th" sx={TH_SX}>{t('rank')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('product')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('category')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('views')}</Box>
                                        </Box>
                                    </Box>
                                    <Box component="tbody">
                                        {topViewedProducts.map((product, index) => (
                                            <Box component="tr" key={product.id} sx={TR_SX}>
                                                <Box component="td" sx={{ ...TD_SX, fontWeight: 700, color: index < 3 ? FIORI.brand : undefined }}>
                                                    #{index + 1}
                                                </Box>
                                                <Box component="td" sx={TD_SX}>
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
                                                                border: `1px solid ${FIORI.border}`,
                                                                bgcolor: FIORI.headerBg,
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {product.name}
                                                        </Typography>
                                                    </Stack>
                                                </Box>
                                                <Box component="td" sx={{ ...TD_SX, color: FIORI.textSecondary }}>{product.category}</Box>
                                                <Box component="td" sx={{ ...TD_SX, fontWeight: 700 }}>{product.views}</Box>
                                            </Box>
                                        ))}
                                        {topViewedProducts.length === 0 && (
                                            <Box component="tr">
                                                <Box component="td" colSpan={4} sx={{ p: 3, textAlign: 'center', color: FIORI.textSecondary }}>
                                                    {t('noViewData')}
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                )}

                {/* Row 2.6 - Charts */}
                {(canViewActivity || canViewProducts) && (
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        {canViewActivity && (
                            <Grid item xs={12} md={6}>
                                <Card elevation={0} sx={{ ...fioriCardSx, height: '100%' }}>
                                    <Box sx={{ borderBottom: `1px solid ${FIORI.border}`, px: 2.5, py: 1.5 }}>
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: FIORI.textPrimary }}>
                                            {t('activityTrendChartTitle')}
                                        </Typography>
                                    </Box>
                                    <CardContent sx={{ pt: 2 }}>
                                        <LineChart
                                            height={260}
                                            series={[
                                                {
                                                    data: activityTrendChart.map((point) => point.count),
                                                    label: t('activityCount'),
                                                    color: FIORI_RAW.brand,
                                                    area: true,
                                                },
                                            ]}
                                            xAxis={[{ scaleType: 'point', data: activityTrendChart.map((point) => point.date.slice(5)) }]}
                                            margin={{ left: 40, right: 20, top: 20, bottom: 30 }}
                                        />
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}
                        {canViewProducts && (
                            <Grid item xs={12} md={6}>
                                <Card elevation={0} sx={{ ...fioriCardSx, height: '100%' }}>
                                    <Box sx={{ borderBottom: `1px solid ${FIORI.border}`, px: 2.5, py: 1.5 }}>
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: FIORI.textPrimary }}>
                                            {t('categoryPieChartTitle')}
                                        </Typography>
                                    </Box>
                                    <CardContent sx={{ pt: 2 }}>
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
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, py: 4, textAlign: 'center' }}>
                                            {t('noChartData')}
                                        </Typography>
                                    )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}
                    </Grid>
                )}

                {/* Row 3 - AdminLTE Classic Card Widget */}
                {canViewSystemConsole && (
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Card elevation={0} sx={fioriCardSx}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        borderBottom: `1px solid ${FIORI.border}`,
                                        px: 2.5,
                                        py: 1.5,
                                    }}
                                >
                                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: FIORI.textPrimary }}>
                                        {t('systemConsole')}
                                    </Typography>
                                    <Box>
                                        <Tooltip title={t('refresh')}>
                                            <IconButton size="small" sx={{ ...fioriIconButtonSx, mr: 0.5 }} onClick={handleRefresh}>
                                                <RefreshIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton size="small" sx={fioriIconButtonSx} onClick={(event) => setMoreAnchor(event.currentTarget)}>
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
                                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mb: 2 }}>
                                        {t('welcomeMessage')}
                                    </Typography>
                                    <Button
                                        component={Link}
                                        href="/catalog/products"
                                        variant="contained"
                                        sx={fioriEmphasizedSx}
                                    >
                                        {t('manageProducts')}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                )}

                {/* Recent Activity */}
                {canViewActivity && (
                    <Card elevation={0} sx={{ mt: 3, ...fioriCardSx }}>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: `1px solid ${FIORI.border}`,
                                px: 2.5,
                                py: 1.5,
                            }}
                        >
                            <Box>
                                <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: FIORI.textPrimary }}>
                                    {t('recentActivity')}
                                </Typography>
                                <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                    {t('operations')}
                                </Typography>
                            </Box>
                            <Button component={Link} href="/system/activity-logs" size="small" endIcon={<ArrowCircleRightIcon sx={{ fontSize: 16 }} />} sx={fioriGhostSx}>
                                {t('viewAll')}
                            </Button>
                        </Box>
                        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                            <Box sx={{ overflowX: 'auto' }}>
                                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <Box component="thead" sx={fioriTableHeadSx}>
                                        <Box component="tr">
                                            <Box component="th" sx={TH_SX}>{t('id')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('user')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('event')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('targetResource')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('targetId')}</Box>
                                            <Box component="th" sx={TH_SX}>{t('time')}</Box>
                                        </Box>
                                    </Box>
                                    <Box component="tbody">
                                        {recentActivities.map((activity) => {
                                            const eventTone: FioriTone =
                                                activity.event === 'created' ? 'success' :
                                                    activity.event === 'updated' ? 'information' :
                                                        activity.event === 'deleted' ? 'error' :
                                                            'neutral';
                                            return (
                                                <Box component="tr" key={activity.id} sx={TR_SX}>
                                                    <Box component="td" sx={TD_SX}>#{activity.id}</Box>
                                                    <Box component="td" sx={{ ...TD_SX, fontWeight: 600 }}>{activity.user}</Box>
                                                    <Box component="td" sx={TD_SX}>
                                                        <FioriStatus
                                                            label={t(activity.event, { defaultValue: activity.event.toUpperCase() }).toUpperCase()}
                                                            tone={eventTone}
                                                        />
                                                    </Box>
                                                    <Box component="td" sx={{ ...TD_SX, color: FIORI.textSecondary }}>
                                                        {activity.auditable_type || '-'}
                                                    </Box>
                                                    <Box component="td" sx={TD_SX}>
                                                        {activity.auditable_id || '-'}
                                                    </Box>
                                                    <Box component="td" sx={{ ...TD_SX, color: FIORI.textSecondary }}>
                                                        {new Date(activity.created_at).toLocaleString()}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                        {recentActivities.length === 0 && (
                                            <Box component="tr">
                                                <Box component="td" colSpan={6} sx={{ p: 3, textAlign: 'center', color: FIORI.textSecondary }}>
                                                    {t('noActivities')}
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                )}
            </Box>
        </AppLayout>
    );
}
