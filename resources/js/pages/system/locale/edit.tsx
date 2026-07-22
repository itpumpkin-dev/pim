import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';

interface Locale {
    id: number;
    code: string;
    display_name: string | null;
    enabled: boolean;
}

interface Props {
    localeModel: Locale;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'SYSTEM', href: '#' },
    { title: 'LOCALES', href: '/system/locales' },
    { title: 'EDIT LOCALE', href: '#' },
];

export default function LocaleEdit({ localeModel }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        code: localeModel.code || '',
        display_name: localeModel.display_name || '',
        enabled: localeModel.enabled,
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        put(`/system/locales/${localeModel.id}`, { replace: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Locale: ${localeModel.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        Edit Locale
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/system/locales"
                            variant="outlined"
                            sx={{
                                borderColor: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            sx={{
                                bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            Save Locale
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    {/* General Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
                            General
                        </Typography>
                        <Stack spacing={2}>
                            <TextField
                                label="Code *"
                                required
                                fullWidth
                                size="small"
                                placeholder="e.g. th, en"
                                value={data.code}
                                onChange={(e) => setData('code', e.target.value)}
                                error={Boolean(errors.code)}
                                helperText={errors.code}
                            />
                            <TextField
                                label="Display Name"
                                fullWidth
                                size="small"
                                placeholder="e.g. ไทย, English"
                                value={data.display_name}
                                onChange={(e) => setData('display_name', e.target.value)}
                                error={Boolean(errors.display_name)}
                                helperText={errors.display_name}
                            />
                        </Stack>
                    </Paper>

                    {/* Status Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                            Status
                        </Typography>
                        <Stack direction="row" spacing={3}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={data.enabled === true}
                                        onChange={() => setData('enabled', true)}
                                    />
                                }
                                label="Active"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={data.enabled === false}
                                        onChange={() => setData('enabled', false)}
                                    />
                                }
                                label="Non Active"
                            />
                        </Stack>
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3, maxWidth: 800 }}>
                        Please correct the highlighted fields before saving.
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
