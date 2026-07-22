import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { Box, Button, Fade, Link as MuiLink, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteUser from '@/components/delete-user';
import HeadingSmall from '@/components/heading-small';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

export default function Profile({ mustVerifyEmail, status }: { mustVerifyEmail: boolean; status?: string }) {
    const { t } = useTranslation('settings');
    const { auth } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('profileInformation'),
            href: '/settings/profile',
        },
    ];

    const { data, setData, patch, errors, processing, recentlySuccessful } = useForm({
        username: auth.user.username,
        first_name: auth.user.first_name,
        last_name: auth.user.last_name,
        email: auth.user.email,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        patch(route('profile.update'));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('profileInformation')} />

            <SettingsLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <HeadingSmall title={t('profileInformation')} description={t('profileInformationDesc')} />

                    <Box component="form" onSubmit={submit}>
                        <Stack spacing={3}>
                            <TextField
                                id="username"
                                label={t('username')}
                                fullWidth
                                value={data.username}
                                onChange={(e) => setData('username', e.target.value)}
                                required
                                autoComplete="username"
                                placeholder={t('username')}
                                error={Boolean(errors.username)}
                                helperText={errors.username}
                            />

                            <Stack direction="row" spacing={2}>
                                <TextField
                                    id="first_name"
                                    label={t('firstName')}
                                    fullWidth
                                    value={data.first_name}
                                    onChange={(e) => setData('first_name', e.target.value)}
                                    required
                                    autoComplete="given-name"
                                    placeholder={t('firstName')}
                                    error={Boolean(errors.first_name)}
                                    helperText={errors.first_name}
                                />

                                <TextField
                                    id="last_name"
                                    label={t('lastName')}
                                    fullWidth
                                    value={data.last_name}
                                    onChange={(e) => setData('last_name', e.target.value)}
                                    required
                                    autoComplete="family-name"
                                    placeholder={t('lastName')}
                                    error={Boolean(errors.last_name)}
                                    helperText={errors.last_name}
                                />
                            </Stack>

                            <TextField
                                id="email"
                                type="email"
                                label={t('emailAddress')}
                                fullWidth
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                required
                                autoComplete="username"
                                placeholder={t('emailAddress')}
                                error={Boolean(errors.email)}
                                helperText={errors.email}
                            />

                            {mustVerifyEmail && auth.user.email_verified_at === null && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('emailUnverified')}{' '}
                                        <MuiLink component={Link} href={route('verification.send')} method="post" as="button" underline="hover">
                                            {t('resendVerification')}
                                        </MuiLink>
                                    </Typography>

                                    {status === 'verification-link-sent' && (
                                        <Typography variant="body2" color="success.main" sx={{ mt: 1, fontWeight: 500 }}>
                                            {t('verificationSent')}
                                        </Typography>
                                    )}
                                </Box>
                            )}

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Button type="submit" variant="contained" disabled={processing}>
                                    {t('save')}
                                </Button>

                                <Fade in={recentlySuccessful}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('saved')}
                                    </Typography>
                                </Fade>
                            </Box>
                        </Stack>
                    </Box>
                </Box>

                <DeleteUser />
            </SettingsLayout>
        </AppLayout>
    );
}
