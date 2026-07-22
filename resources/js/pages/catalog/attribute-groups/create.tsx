import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE GROUPS', href: '/catalog/attributeGroups' },
    { title: 'ADD ATTRIBUTE GROUP', href: '/catalog/attributeGroups/create' },
];

export default function AttributeGroupCreate() {
    const { data, setData, post, processing, errors } = useForm({
        code: '',
        name: '',
        label_en: '',
        label_zh_cn: '',
        label_zh_sg: '',
        label_zu: '',
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/catalog/attributeGroups', {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add Attribute Group" />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        Add Attribute Group
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
                            Save Attribute Group
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    {/* General Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
                            General
                        </Typography>
                        <TextField
                            label="Code *"
                            required
                            fullWidth
                            size="small"
                            placeholder="Code"
                            value={data.code}
                            onChange={(e) => {
                                const val = e.target.value;
                                setData('code', val);
                                if (!data.name) setData('name', val);
                            }}
                            error={Boolean(errors.code)}
                            helperText={errors.code}
                        />
                    </Paper>

                    {/* Label Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
                            Label
                        </Typography>
                        <Stack spacing={2}>
                            <TextField
                                label="English (United States)"
                                fullWidth
                                size="small"
                                value={data.label_en}
                                onChange={(e) => {
                                    setData('label_en', e.target.value);
                                    setData('name', e.target.value);
                                }}
                            />
                            <TextField
                                label="Chinese (China)"
                                fullWidth
                                size="small"
                                value={data.label_zh_cn}
                                onChange={(e) => setData('label_zh_cn', e.target.value)}
                            />
                            <TextField
                                label="Chinese (Singapore)"
                                fullWidth
                                size="small"
                                value={data.label_zh_sg}
                                onChange={(e) => setData('label_zh_sg', e.target.value)}
                            />
                            <TextField
                                label="Zulu (South Africa)"
                                fullWidth
                                size="small"
                                value={data.label_zu}
                                onChange={(e) => setData('label_zu', e.target.value)}
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
