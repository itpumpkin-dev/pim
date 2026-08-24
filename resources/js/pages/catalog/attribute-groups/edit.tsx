import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface AttributeGroup {
    id: number;
    code: string;
    name?: string;
}

interface Props {
    group: AttributeGroup;
    translations: Record<string, string>;
    canViewHistory?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE GROUPS', href: '/catalog/attributeGroups' },
    { title: 'EDIT ATTRIBUTE GROUP', href: '#' },
];

export default function AttributeGroupEdit({ group, translations, canViewHistory = false }: Props) {
    const [tabIndex, setTabIndex] = useState(0);
    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: group.code || '',
        translations: translations || {},
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/attributeGroups/${group.id}`, {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Group: ${group.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributeGroups/${group.id}/history`} />}

                {tabIndex === 0 && (
                <>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        Edit Attribute Group
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeGroups"
                            variant="outlined"
                            sx={fioriDefaultSx}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                        >
                            {processing ? 'Saving…' : 'Save Attribute Group'}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    {/* General Panel */}
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                            General
                        </Typography>
                        <TextField
                            label="Code"
                            fullWidth
                            size="small"
                            value={data.code}
                            disabled
                            helperText="This code is generated automatically and can't be changed."
                        />
                    </Paper>

                    <LocaleLabelFields
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3, maxWidth: 800 }}>
                        Please correct the highlighted fields before saving.
                    </Alert>
                )}
                </>
                )}
            </Box>
        </AppLayout>
    );
}
