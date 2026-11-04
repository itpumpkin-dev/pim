import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/home.js';
import '@ui5/webcomponents-icons/dist/locked.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import { Button, FlexBox, Icon, Text, Title } from '@ui5/webcomponents-react';
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
            <FlexBox justifyContent="Center" alignItems="Center" style={{ minHeight: '60vh', padding: '1rem' }}>
                <div
                    style={{
                        maxWidth: 480,
                        width: '100%',
                        textAlign: 'center',
                        padding: '2rem',
                        boxSizing: 'border-box',
                        background: 'var(--sapGroup_ContentBackground)',
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                    }}
                >
                    <div
                        style={{
                            margin: '0 auto 1rem',
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--sapErrorBackground)',
                            color: 'var(--sapNegativeColor)',
                        }}
                    >
                        <Icon name="locked" style={{ width: '2rem', height: '2rem', color: 'inherit' }} />
                    </div>
                    <Text
                        style={{
                            display: 'block',
                            fontSize: 'var(--sapFontSmallSize)',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--sapContent_LabelColor)',
                        }}
                    >
                        403
                    </Text>
                    <Title level="H2" size="H4" wrappingType="Normal" style={{ marginBottom: '0.5rem' }}>
                        {t('forbiddenTitle')}
                    </Title>
                    <Text style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--sapContent_LabelColor)' }}>{message}</Text>
                    <Text
                        style={{
                            display: 'block',
                            marginBottom: '1.5rem',
                            fontSize: 'var(--sapFontSmallSize)',
                            color: 'var(--sapContent_LabelColor)',
                        }}
                    >
                        {t('forbiddenHint')}
                    </Text>
                    <FlexBox justifyContent="Center" wrap="Wrap" style={{ gap: '0.75rem' }}>
                        <Button icon="nav-back" onClick={() => window.history.back()}>
                            {t('forbiddenGoBack')}
                        </Button>
                        <Button design="Emphasized" icon="home" onClick={() => router.visit('/dashboard')}>
                            {t('forbiddenGoDashboard')}
                        </Button>
                    </FlexBox>
                </div>
            </FlexBox>
        </AppLayout>
    );
}
