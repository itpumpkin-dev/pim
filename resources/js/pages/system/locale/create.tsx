import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ISO6391 from 'iso-639-1';
import { FormEvent } from 'react';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'SYSTEM', href: '#' },
    { title: 'LOCALES', href: '/system/locales' },
    { title: 'ADD LOCALE', href: '/system/locales/create' },
];

interface LanguageOption {
    code: string;
    name: string;
    nativeName: string;
}

const languageOptions: LanguageOption[] = ISO6391.getLanguages(ISO6391.getAllCodes()).sort((a, b) =>
    a.name.localeCompare(b.name),
);

export default function LocaleCreate() {
    const { data, setData, post, processing, errors, isDirty } = useForm({
        code: '',
        display_name: '',
        enabled: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/system/locales', {
            replace: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add Locale" />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        Add Locale
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/system/locales"
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
                            sx={fioriEmphasizedSx}
                        >
                            {processing ? 'Saving…' : 'Save Locale'}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    {/* General Panel */}
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: FIORI.textPrimary, mb: 2 }}>
                            General
                        </Typography>
                        <Stack spacing={2}>
                            <Autocomplete
                                freeSolo
                                fullWidth
                                size="small"
                                options={languageOptions}
                                getOptionLabel={(option) =>
                                    typeof option === 'string' ? option : `${option.name} (${option.code})`
                                }
                                isOptionEqualToValue={(option, value) =>
                                    typeof value === 'string' ? option.code === value : option.code === value.code
                                }
                                inputValue={data.code}
                                onInputChange={(_, newInputValue, reason) => {
                                    // Ignore 'reset' (MUI replaying the picked
                                    // option's label back into the input) and
                                    // 'clear' — only free typing should drive
                                    // the code field; selection is handled by
                                    // onChange below with the real code.
                                    if (reason === 'input') {
                                        setData('code', newInputValue);
                                    }
                                }}
                                onChange={(_, newValue) => {
                                    if (newValue && typeof newValue !== 'string') {
                                        setData('code', newValue.code);
                                        setData('display_name', newValue.nativeName || newValue.name);
                                    }
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Code *"
                                        required
                                        placeholder="e.g. th, en"
                                        error={Boolean(errors.code)}
                                        helperText={errors.code}
                                    />
                                )}
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
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 1 }}>
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
