import { Head } from '@inertiajs/react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';
import { FIORI } from '@/lib/fiori-style';

export default function ForgotPassword() {
    const { t } = useTranslation('auth');

    return (
        <AuthLayout title={t('forgotPasswordTitle')} description={t('forgotPasswordDescription')}>
            <Head title={t('forgotPasswordTitle')} />

            <Stack spacing={3}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        p: 2,
                        borderRadius: '8px',
                        border: `1px solid ${FIORI.border}`,
                        bgcolor: FIORI.pageBg,
                    }}
                >
                    <InfoOutlinedIcon sx={{ color: FIORI.information, mt: '2px' }} fontSize="small" />
                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                        {t('contactAdminForPasswordReset')}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    <TextLink href={route('login')}>{t('backToLogin')}</TextLink>
                </Typography>
            </Stack>
        </AuthLayout>
    );
}
