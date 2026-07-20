import { Head, useForm } from '@inertiajs/react';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';

interface LoginForm {
    email: string;
    password: string;
    remember: boolean;
    [key: string]: string | boolean;
}

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
}

export default function Login({ status, canResetPassword }: LoginProps) {
    const { data, setData, post, processing, errors, reset } = useForm<LoginForm>({
        email: '',
        password: '',
        remember: false,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthLayout title="Log in to your account" description="Enter your email and password below to log in">
            <Head title="Log in" />

            <Paper component="form" onSubmit={submit} sx={{ p: 4, borderRadius: 2, boxShadow: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Stack spacing={3}>
                    <TextField
                        id="email"
                        type="email"
                        label="Email address"
                        required
                        autoFocus
                        tabIndex={1}
                        autoComplete="email"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        placeholder="email@example.com"
                        fullWidth
                        error={Boolean(errors.email)}
                        helperText={errors.email}
                    />

                    <Box>
                        <TextField
                            id="password"
                            type="password"
                            label="Password"
                            required
                            tabIndex={2}
                            autoComplete="current-password"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder="Password"
                            fullWidth
                            error={Boolean(errors.password)}
                            helperText={errors.password}
                        />
                        {canResetPassword && (
                            <Box sx={{ textAlign: 'right', mt: 1 }}>
                                <TextLink href={route('password.request')} tabIndex={5} style={{ fontSize: '0.875rem' }}>
                                    Forgot password?
                                </TextLink>
                            </Box>
                        )}
                    </Box>

                    <FormControlLabel
                        control={
                            <Checkbox
                                id="remember"
                                name="remember"
                                tabIndex={3}
                                checked={data.remember}
                                onChange={(e) => setData('remember', e.target.checked)}
                            />
                        }
                        label="Remember me"
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        tabIndex={4}
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        Log in
                    </Button>
                </Stack>

                {/* <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    Don't have an account?{' '}
                    <TextLink href={route('register')} tabIndex={5}>
                        Sign up
                    </TextLink>
                </Typography> */}
            </Paper>

            {status && (
                <Typography variant="body2" color="success.main" sx={{ mb: 2, textAlign: 'center', fontWeight: 500 }}>
                    {status}
                </Typography>
            )}
        </AuthLayout>
    );
}
