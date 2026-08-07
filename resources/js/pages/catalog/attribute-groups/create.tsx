import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Stack,
    Typography,
} from '@mui/material';
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

    const { data, setData, post, processing, errors } = useForm({
        translations: {} as Record<string, string>,
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/catalog/attributeGroups', {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeGroupTitle')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        {t('addAttributeGroupTitle')}
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeGroups"
                            variant="outlined"
                            sx={{
                                color: 'primary.main',
                                borderColor: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            {t('back')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{
                                bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            {processing ? t('saving') : t('saveAttributeGroup')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3, maxWidth: 800 }}>
                        {t('correctHighlightedFields')}
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
