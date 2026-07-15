import { Head, useForm } from '@inertiajs/react';
import { Box, Button, CircularProgress, Stack, TextField } from '@mui/material';
import { FormEventHandler } from 'react';

import AuthLayout from '@/layouts/auth-layout';

export default function ConfirmPassword() {
    const { data, setData, post, processing, errors, reset } = useForm({
        password: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.confirm'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthLayout
            title="Confirm your password"
            description="This is a secure area of the application. Please confirm your password before continuing."
        >
            <Head title="Confirm password" />

            <Box component="form" onSubmit={submit}>
                <Stack spacing={3}>
                    <TextField
                        id="password"
                        name="password"
                        label="Password"
                        type="password"
                        placeholder="Password"
                        autoComplete="current-password"
                        value={data.password}
                        autoFocus
                        fullWidth
                        onChange={(e) => setData('password', e.target.value)}
                        error={Boolean(errors.password)}
                        helperText={errors.password}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        >
                            Confirm password
                        </Button>
                    </Box>
                </Stack>
            </Box>
        </AuthLayout>
    );
}
