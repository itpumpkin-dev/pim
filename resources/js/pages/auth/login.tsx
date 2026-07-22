import AppLogoIcon from '@/components/app-logo-icon';
import TextLink from '@/components/text-link';
import { Head, Link, useForm } from '@inertiajs/react';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

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
        <>
            <Head title="Log in" />
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    bgcolor: 'background.default',
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, sm: 6 }, py: { xs: 4, sm: 6 } }}>
                    <Box
                        component={Link}
                        href={route('home')}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'text.primary' }}
                    >
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                                color: 'primary.contrastText',
                            }}
                        >
                            <AppLogoIcon style={{ width: 36, height: 36, fill: 'currentColor' }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            PIM <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>Pumpkin</Box>
                        </Typography>
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', maxWidth: 360, mx: 'auto' }}>
                            <Stack spacing={3}>
                                <Stack spacing={1}>
                                    <Typography variant="h4" sx={{ fontWeight: 600 }}>
                                        Sign in
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        Enter your email and password to access your account.
                                    </Typography>
                                </Stack>

                                {status && (
                                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 500 }}>
                                        {status}
                                    </Typography>
                                )}

                                <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                                            size="large"
                                            fullWidth
                                            tabIndex={4}
                                            disabled={processing}
                                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                                        >
                                            Sign in
                                        </Button>

                                        <Button
                                            component={Link}
                                            href={route('home')}
                                            variant="text"
                                            fullWidth
                                            tabIndex={5}
                                            sx={{ mt: 0 }}
                                        >
                                            กลับไปหน้าแรก (Home)
                                        </Button>
                                    </Stack>
                                </Box>
                            </Stack>
                        </Box>
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: { xs: 'none', md: 'flex' },
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        borderLeft: 1,
                        borderColor: 'divider',
                    }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            width: 480,
                            height: 480,
                            borderRadius: '50%',
                            top: -160,
                            right: -160,
                            bgcolor: 'rgba(255, 255, 255, 0.08)',
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            width: 320,
                            height: 320,
                            borderRadius: '50%',
                            bottom: -120,
                            left: -100,
                            bgcolor: 'rgba(255, 255, 255, 0.06)',
                        }}
                    />
                    <Stack spacing={1} alignItems="center" sx={{ position: 'relative', textAlign: 'center', px: 6, maxWidth: 420 }}>
                        <AppLogoIcon style={{ width: 96, height: 96 }} />
                        <Typography variant="h4" sx={{ fontWeight: 600 }}>
                            PIM Pumpkin
                        </Typography>
                        <Typography variant="body1" sx={{ opacity: 0.85 }}>
                            Products Management Information System
                        </Typography>
                    </Stack>
                </Box>
            </Box>
        </>
    );
}
