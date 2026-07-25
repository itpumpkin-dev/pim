import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Box, Card, CardContent, Grid, Typography, Button, IconButton, useTheme, Divider } from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FolderIcon from '@mui/icons-material/Folder';
import SchemaIcon from '@mui/icons-material/Schema';
import TranslateIcon from '@mui/icons-material/Translate';
import PaidIcon from '@mui/icons-material/Paid';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import ArrowCircleRightIcon from '@mui/icons-material/ArrowCircleRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { PALETTE } from '@/theme';
import { useTranslation } from 'react-i18next';

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

interface DashboardProps {
    totalProduct: number;
    totalCategory: number;
    totalAttribute: number;
    totalGroup: number;
    totalFamilies: number;
    totalLocale: number;
    totalCurrencies: number;
    totalChannels: number;
    recentActivities?: RecentActivity[];
}

export default function Dashboard({
    totalProduct = 0,
    totalCategory = 0,
    totalAttribute = 0,
    totalGroup = 0,
    totalFamilies = 0,
    totalLocale = 0,
    totalCurrencies = 0,
    totalChannels = 0,
    recentActivities = [],
}: DashboardProps) {
    const theme = useTheme();
    const { t } = useTranslation('dashboard');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth?.permissions || [];

    // Map AdminLTE UI components using the customized PALETTE from theme.ts
    // Accent (Orange #EA580C) / Highlight (Cyan #06B6D4) / Primary (Slate Blue #334155) / Secondary (Mid Gray #9CA3AF)
    const smallBoxes = [
        {
            title: t('products'),
            value: totalProduct,
            icon: <Inventory2Icon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.accent, // Signal Orange #EA580C
            color: '#fff',
            link: '/catalog/products',
            permission: 'products.list_products',
        },
        {
            title: t('categories'),
            value: totalCategory,
            icon: <CategoryIcon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.highlight, // Data Cyan #06B6D4
            color: '#fff',
            link: '#',
            permission: 'categories.list_categories',
        },
        {
            title: t('attributes'),
            value: totalAttribute,
            icon: <AssignmentIcon sx={{ fontSize: 75, opacity: 0.15, position: 'absolute', right: 12, top: 12 }} />,
            bg: PALETTE.primary, // Slate Blue #334155
            color: '#fff',
            link: '#',
            permission: 'attributes.list_attributes',
        },
        {
            title: t('attributeGroups'),
            value: totalGroup,
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
            icon: <SchemaIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.accent, // Signal Orange
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            permission: 'attribute_families.list_attribute_families',
        },
        {
            title: t('locales'),
            value: totalLocale,
            icon: <TranslateIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.highlight, // Data Cyan
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            permission: 'locales.list_locales',
        },
        {
            title: t('currencies'),
            value: totalCurrencies,
            icon: <PaidIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.primary, // Slate Blue
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            permission: 'currencies.list_currencies',
        },
        {
            title: t('channels'),
            value: totalChannels,
            icon: <SettingsInputAntennaIcon sx={{ fontSize: 28, color: '#fff' }} />,
            iconBg: PALETTE.secondary, // Mid Gray
            bg: theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
            permission: 'channels.list_channels',
        },
    ].filter(box => !box.permission || permissions.includes(box.permission));

    const canViewConsole = permissions.includes('users.list_users') || permissions.includes('roles.list_roles');

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
                                sx={{
                                    display: 'flex',
                                    borderRadius: '0.25rem',
                                    bgcolor: box.bg,
                                    boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.08)',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: { xs: 2, md: 0 },
                                    overflow: 'hidden',
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 70,
                                        bgcolor: box.iconBg,
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
                                </Box>
                            </Box>
                        </Grid>
                    ))}
                </Grid>

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
                                        <IconButton size="small" sx={{ mr: 0.5 }}>
                                            <RefreshIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                        <IconButton size="small">
                                            <MoreVertIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
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
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'start', mb: 3 }}>
                            <Typography variant="h5" fontWeight={400} sx={{ fontSize: '1rem', color: 'text.secondary' }}>
                                {t('operations')}
                            </Typography>
                            <Typography variant="h5" fontWeight={700} sx={{ fontSize: '1.8rem', color: 'text.primary' }}>
                                {t('recentActivity')}
                            </Typography>
                        </Box>

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
