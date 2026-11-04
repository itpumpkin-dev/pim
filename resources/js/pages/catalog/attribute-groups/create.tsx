import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriFormErrorSummary } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, FlexBox, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export default function AttributeGroupCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeGroups'), href: '/catalog/attributeGroups' },
        { title: t('addAttributeGroupTitle'), href: '/catalog/attributeGroups/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/attributeGroups', {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeGroupTitle')} />
            <form
                onSubmit={submit}
                style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}
            >
                {/* หัวข้อและปุ่มต่างๆ */}
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <Title level="H3">{t('addAttributeGroupTitle')}</Title>
                    <FlexBox style={{ gap: '0.75rem' }}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/attributeGroups')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('saveAttributeGroup')}
                        </Button>
                    </FlexBox>
                </FlexBox>

                <FlexBox direction="Column" style={{ gap: '1.5rem', maxWidth: 760 }}>
                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </FlexBox>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} style={{ marginTop: '1.5rem', maxWidth: 760 }} />
            </form>
        </AppLayout>
    );
}
