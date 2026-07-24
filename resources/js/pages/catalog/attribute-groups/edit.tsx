import LocaleLabelFields from '@/components/catalog/locale-label-fields';
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

interface AttributeGroup {
    id: number;
    code: string;
    name?: string;
}

interface Props {
    group: AttributeGroup;
    translations: Record<string, string>;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE GROUPS', href: '/catalog/attributeGroups' },
    { title: 'EDIT ATTRIBUTE GROUP', href: '#' },
];

export default function AttributeGroupEdit({ group, translations }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        code: group.code || '',
        translations: translations || {},
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        put(`/catalog/attributeGroups/${group.id}`, {
            onSuccess: () => router.visit('/catalog/attributeGroups', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Group: ${group.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        Edit Attribute Group
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeGroups"
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
                            onChange={(e) => setData('code', e.target.value)}
                            error={Boolean(errors.code)}
                            helperText={errors.code}
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
            </Box>
        </AppLayout>
    );
}
