import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Box, Button, Checkbox, FormControlLabel, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'DEPARTMENTS',
        href: '/system/department',
    },
];

interface DepartmentFormProps {
    department?: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

interface DepartmentForm {
    name: string;
    enabled: boolean;
    [key: string]: string | boolean;
}

export default function DepartmentFormPage({ department }: DepartmentFormProps) {
    const isEdit = Boolean(department);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<DepartmentForm>({
        name: department?.name ?? '',
        enabled: department?.enabled ?? true,
    });

    const cancel = () => router.visit('/system/department');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && department) {
            put(`/system/department/${department.id}`);
        } else {
            post('/system/department');
        }
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            actions={
                <>
                    <Button variant="contained" color="inherit" onClick={cancel} sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}>
                        CANCEL
                    </Button>
                    <Button
                        type="submit"
                        form="department-form"
                        variant="contained"
                        color="primary"
                        disabled={processing}
                        sx={{ borderRadius: 8, px: 3, fontWeight: 'bold', color: '#fff' }}
                    >
                        Save
                    </Button>
                </>
            }
        >
            <Head title={isEdit ? `Edit ${department?.name}` : 'Create Department'} />
            <Box component="form" id="department-form" onSubmit={submit} sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
                    {isEdit ? department?.name : 'New Department'}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                            Name *
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            value={data.name}
                            onChange={(e) => {
                                setData('name', e.target.value);
                                clearErrors('name');
                            }}
                            error={Boolean(errors.name)}
                            helperText={errors.name}
                        />
                    </Box>
                    <Box>
                        <FormControlLabel
                            control={<Checkbox checked={data.enabled} onChange={(e) => setData('enabled', e.target.checked)} />}
                            label="Active"
                        />
                    </Box>
                </Box>
            </Box>
        </AppLayout>
    );
}
