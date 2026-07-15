import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { Box, Button, Fade, Link as MuiLink, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

import DeleteUser from '@/components/delete-user';
import HeadingSmall from '@/components/heading-small';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Profile settings',
        href: '/settings/profile',
    },
];

export default function Profile({ mustVerifyEmail, status }: { mustVerifyEmail: boolean; status?: string }) {
    const { auth } = usePage<SharedData>().props;

    const { data, setData, patch, errors, processing, recentlySuccessful } = useForm({
        name: auth.user.name,
        email: auth.user.email,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        patch(route('profile.update'));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Profile settings" />

            <SettingsLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <HeadingSmall title="Profile information" description="Update your name and email address" />

                    <Box component="form" onSubmit={submit}>
                        <Stack spacing={3}>
                            <TextField
                                id="name"
                                label="Name"
                                fullWidth
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                required
                                autoComplete="name"
                                placeholder="Full name"
                                error={Boolean(errors.name)}
                                helperText={errors.name}
                            />

                            <TextField
                                id="email"
                                type="email"
                                label="Email address"
                                fullWidth
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                required
                                autoComplete="username"
                                placeholder="Email address"
                                error={Boolean(errors.email)}
                                helperText={errors.email}
                            />

                            {mustVerifyEmail && auth.user.email_verified_at === null && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary">
                                        Your email address is unverified.{' '}
                                        <MuiLink component={Link} href={route('verification.send')} method="post" as="button" underline="hover">
                                            Click here to re-send the verification email.
                                        </MuiLink>
                                    </Typography>

                                    {status === 'verification-link-sent' && (
                                        <Typography variant="body2" color="success.main" sx={{ mt: 1, fontWeight: 500 }}>
                                            A new verification link has been sent to your email address.
                                        </Typography>
                                    )}
                                </Box>
                            )}

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Button type="submit" variant="contained" disabled={processing}>
                                    Save
                                </Button>

                                <Fade in={recentlySuccessful}>
                                    <Typography variant="body2" color="text.secondary">
                                        Saved
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
