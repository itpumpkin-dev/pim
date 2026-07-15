import { Head, useForm } from '@inertiajs/react';
import { Box, Button, CircularProgress, Stack, TextField } from '@mui/material';
import { FormEventHandler } from 'react';

import AuthLayout from '@/layouts/auth-layout';

interface ResetPasswordProps {
    token: string;
    email: string;
}

interface ResetPasswordForm {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
    [key: string]: string;
}

export default function ResetPassword({ token, email }: ResetPasswordProps) {
    const { data, setData, post, processing, errors, reset } = useForm<ResetPasswordForm>({
        token: token,
        email: email,
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('password.store'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <AuthLayout title="Reset password" description="Please enter your new password below">
            <Head title="Reset password" />

            <Box component="form" onSubmit={submit}>
                <Stack spacing={3}>
                    <TextField
                        id="email"
                        type="email"
                        name="email"
                        label="Email"
                        autoComplete="email"
                        value={data.email}
                        fullWidth
                        InputProps={{ readOnly: true }}
                        onChange={(e) => setData('email', e.target.value)}
                        error={Boolean(errors.email)}
                        helperText={errors.email}
                    />

                    <TextField
                        id="password"
                        type="password"
                        name="password"
                        label="Password"
                        autoComplete="new-password"
                        value={data.password}
                        fullWidth
                        autoFocus
                        onChange={(e) => setData('password', e.target.value)}
                        placeholder="Password"
                        error={Boolean(errors.password)}
                        helperText={errors.password}
                    />

                    <TextField
                        id="password_confirmation"
                        type="password"
                        name="password_confirmation"
                        label="Confirm password"
                        autoComplete="new-password"
                        value={data.password_confirmation}
                        fullWidth
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        placeholder="Confirm password"
                        error={Boolean(errors.password_confirmation)}
                        helperText={errors.password_confirmation}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        Reset password
                    </Button>
                </Stack>
            </Box>
        </AuthLayout>
    );
}
