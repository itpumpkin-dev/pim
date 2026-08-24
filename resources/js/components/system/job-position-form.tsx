import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'JOB POSITIONS',
        href: '/system/jobPosition',
    },
];

interface JobPositionFormProps {
    jobPosition?: {
        id: number;
        name: string;
        enabled: boolean;
    };
}

interface JobPositionForm {
    name: string;
    enabled: boolean;
    [key: string]: string | boolean;
}

export default function JobPositionFormPage({ jobPosition }: JobPositionFormProps) {
    const isEdit = Boolean(jobPosition);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<JobPositionForm>({
        name: jobPosition?.name ?? '',
        enabled: jobPosition?.enabled ?? true,
    });

    const cancel = () => router.visit('/system/jobPosition');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && jobPosition) {
            put(`/system/jobPosition/${jobPosition.id}`);
        } else {
            post('/system/jobPosition');
        }
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            actions={
                <>
                    <Button variant="outlined" onClick={cancel} sx={fioriDefaultSx}>
                        CANCEL
                    </Button>
                    <Button
                        type="submit"
                        form="job-position-form"
                        variant="contained"
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={fioriEmphasizedSx}
                    >
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <Head title={isEdit ? `Edit ${jobPosition?.name}` : 'Create Job Position'} />
            <Box component="form" id="job-position-form" onSubmit={submit} sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: FIORI.textPrimary }}>
                    {isEdit ? jobPosition?.name : 'New Job Position'}
                </Typography>

                <Paper elevation={0} sx={{ ...fioriCardSx, p: 3, maxWidth: 420 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, color: FIORI.textPrimary }}>
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
                </Paper>
            </Box>
        </AppLayout>
    );
}
