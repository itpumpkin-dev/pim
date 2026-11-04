import { Head } from '@inertiajs/react';
import { FlexBox, MessageStrip, Text } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';

export default function ForgotPassword() {
    const { t } = useTranslation('auth');

    return (
        <AuthLayout title={t('forgotPasswordTitle')} description={t('forgotPasswordDescription')}>
            <Head title={t('forgotPasswordTitle')} />

            <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                <MessageStrip design="Information" hideCloseButton>
                    {t('contactAdminForPasswordReset')}
                </MessageStrip>

                <Text style={{ textAlign: 'center' }}>
                    <TextLink href={route('login')}>{t('backToLogin')}</TextLink>
                </Text>
            </FlexBox>
        </AuthLayout>
    );
}
