import AppLogoIcon from '@/components/app-logo-icon';
import LocaleDropdown from '@/components/locale-dropdown';
import TextLink from '@/components/text-link';
import { Head, Link, useForm } from '@inertiajs/react';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriEmphasizedSx, fioriGhostSx } from '@/lib/fiori-style';

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
    const { t } = useTranslation('auth');
    const [showPassword, setShowPassword] = useState(false);
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
                    bgcolor: FIORI.pageBg,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, sm: 6 }, py: { xs: 4, sm: 6 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                        <LocaleDropdown />
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', maxWidth: 360, mx: 'auto' }}>
                            <Stack spacing={3}>
                                <Stack spacing={1}>
                                    <Typography variant="h4" sx={{ fontWeight: 600 }}>
                                        {t('signIn')}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        {t('signInSubtitle')}
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
                                            label={t('emailAddress')}
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
                                                type={showPassword ? 'text' : 'password'}
                                                label={t('password')}
                                                required
                                                tabIndex={2}
                                                autoComplete="current-password"
                                                value={data.password}
                                                onChange={(e) => setData('password', e.target.value)}
                                                placeholder="Password"
                                                fullWidth
                                                error={Boolean(errors.password)}
                                                helperText={errors.password}
                                                slotProps={{
                                                    input: {
                                                        endAdornment: (
                                                            <InputAdornment position="end">
                                                                <IconButton
                                                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                                                    onClick={() => setShowPassword((prev) => !prev)}
                                                                    edge="end"
                                                                    tabIndex={-1}
                                                                >
                                                                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                                                </IconButton>
                                                            </InputAdornment>
                                                        ),
                                                    },
                                                }}
                                            />
                                            {canResetPassword && (
                                                <Box sx={{ textAlign: 'right', mt: 1 }}>
                                                    <TextLink href={route('password.request')} tabIndex={5} style={{ fontSize: '0.875rem' }}>
                                                        {t('forgotPassword')}
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
                                            label={t('rememberMe')}
                                        />

                                        <Button
                                            type="submit"
                                            variant="contained"
                                            size="large"
                                            fullWidth
                                            tabIndex={4}
                                            disabled={processing}
                                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                                            sx={{ ...fioriEmphasizedSx, py: 1.25 }}
                                        >
                                            {t('signIn')}
                                        </Button>

                                        <Button
                                            component={Link}
                                            href={route('home')}
                                            variant="text"
                                            fullWidth
                                            tabIndex={5}
                                            sx={{ ...fioriGhostSx, mt: 0 }}
                                        >
                                            {t('backToHome')}
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
                        bgcolor: FIORI.surface,
                        color: FIORI.textPrimary,
                        borderLeft: `1px solid ${FIORI.border}`,
                    }}
                >
                    <Stack spacing={1} alignItems="center" sx={{ position: 'relative', textAlign: 'center', px: 6, maxWidth: 420 }}>
                        <AppLogoIcon style={{ width: 96, height: 96 }} />
                        <Typography variant="h4" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                            PIM Pumpkin
                        </Typography>
                        <Typography variant="body1" sx={{ color: FIORI.textSecondary }}>
                            {t('appTagline')}
                        </Typography>
                    </Stack>
                </Box>
            </Box>
        </>
    );
}
