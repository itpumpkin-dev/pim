import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * Shown on a full page load of a URL the user has no permission for (typed,
 * bookmarked, refreshed). In-app clicks never land here — those bounce back
 * with a toast instead (app/Exceptions/ForbiddenResponder.php).
 */
export default function Forbidden({ message }: { message: string }) {
    const { t } = useTranslation();

    return (
        <AppLayout breadcrumbs={[{ title: t('forbiddenTitle'), href: '' }]}>
            <Head title={t('forbiddenTitle')} />
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', p: 2 }}>
                <Card variant="outlined" sx={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
                    <CardContent sx={{ p: 4 }}>
                        <Box
                            sx={{
                                mx: 'auto',
                                mb: 2,
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'error.light',
                                color: 'error.contrastText',
                            }}
                        >
                            <LockOutlinedIcon fontSize="large" />
                        </Box>
                        <Typography variant="overline" color="text.secondary">
                            403
                        </Typography>
                        <Typography variant="h5" fontWeight={600} gutterBottom>
                            {t('forbiddenTitle')}
                        </Typography>
                        <Typography color="text.secondary" sx={{ mb: 1 }}>
                            {message}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            {t('forbiddenHint')}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
                            <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => window.history.back()}>
                                {t('forbiddenGoBack')}
                            </Button>
                            <Button variant="contained" startIcon={<DashboardIcon />} component={Link} href="/dashboard">
                                {t('forbiddenGoDashboard')}
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        </AppLayout>
    );
}
