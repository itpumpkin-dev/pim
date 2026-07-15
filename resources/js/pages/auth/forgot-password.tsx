import { Head, useForm } from '@inertiajs/react';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';

export default function ForgotPassword({ status }: { status?: string }) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.email'));
    };

    return (
        <AuthLayout title="Forgot password" description="Enter your email to receive a password reset link">
            <Head title="Forgot password" />

            {status && (
                <Typography variant="body2" color="success.main" sx={{ mb: 2, textAlign: 'center', fontWeight: 500 }}>
                    {status}
                </Typography>
            )}

            <Stack spacing={3}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2}>
                        <TextField
                            id="email"
                            type="email"
                            name="email"
                            label="Email address"
                            autoComplete="off"
                            value={data.email}
                            autoFocus
                            fullWidth
                            onChange={(e) => setData('email', e.target.value)}
                            placeholder="email@example.com"
                            error={Boolean(errors.email)}
                            helperText={errors.email}
                        />

                        <Box sx={{ my: 1, display: 'flex', justifyContent: 'flex-start' }}>
                            <Button
                                type="submit"
                                variant="contained"
                                fullWidth
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            >
                                Email password reset link
                            </Button>
                        </Box>
                    </Stack>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    Or, return to <TextLink href={route('login')}>log in</TextLink>
                </Typography>
            </Stack>
        </AuthLayout>
    );
}
