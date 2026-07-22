import { Head, useForm } from '@inertiajs/react';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';

interface RegisterForm {
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    password_confirmation: string;
    [key: string]: string;
}

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm<RegisterForm>({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <AuthLayout title="Create an account" description="Enter your details below to create your account">
            <Head title="Register" />
            <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Stack spacing={3}>
                    <TextField
                        id="username"
                        type="text"
                        label="Username"
                        required
                        autoFocus
                        tabIndex={1}
                        autoComplete="username"
                        value={data.username}
                        onChange={(e) => setData('username', e.target.value)}
                        disabled={processing}
                        placeholder="username"
                        fullWidth
                        error={Boolean(errors.username)}
                        helperText={errors.username}
                    />

                    <Stack direction="row" spacing={2}>
                        <TextField
                            id="first_name"
                            type="text"
                            label="First name"
                            required
                            tabIndex={2}
                            autoComplete="given-name"
                            value={data.first_name}
                            onChange={(e) => setData('first_name', e.target.value)}
                            disabled={processing}
                            placeholder="First name"
                            fullWidth
                            error={Boolean(errors.first_name)}
                            helperText={errors.first_name}
                        />

                        <TextField
                            id="last_name"
                            type="text"
                            label="Last name"
                            required
                            tabIndex={3}
                            autoComplete="family-name"
                            value={data.last_name}
                            onChange={(e) => setData('last_name', e.target.value)}
                            disabled={processing}
                            placeholder="Last name"
                            fullWidth
                            error={Boolean(errors.last_name)}
                            helperText={errors.last_name}
                        />
                    </Stack>

                    <TextField
                        id="email"
                        type="email"
                        label="Email address"
                        required
                        tabIndex={4}
                        autoComplete="email"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        disabled={processing}
                        placeholder="email@example.com"
                        fullWidth
                        error={Boolean(errors.email)}
                        helperText={errors.email}
                    />

                    <TextField
                        id="password"
                        type="password"
                        label="Password"
                        required
                        tabIndex={5}
                        autoComplete="new-password"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        disabled={processing}
                        placeholder="Password"
                        fullWidth
                        error={Boolean(errors.password)}
                        helperText={errors.password}
                    />

                    <TextField
                        id="password_confirmation"
                        type="password"
                        label="Confirm password"
                        required
                        tabIndex={6}
                        autoComplete="new-password"
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        disabled={processing}
                        placeholder="Confirm password"
                        fullWidth
                        error={Boolean(errors.password_confirmation)}
                        helperText={errors.password_confirmation}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        tabIndex={7}
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        Create account
                    </Button>
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    Already have an account?{' '}
                    <TextLink href={route('login')} tabIndex={8}>
                        Log in
                    </TextLink>
                </Typography>
            </Box>
        </AuthLayout>
    );
}
