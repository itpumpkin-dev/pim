import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Box, Button, Fade, Stack, TextField, Typography } from '@mui/material';
import { FormEventHandler, useRef } from 'react';

import HeadingSmall from '@/components/heading-small';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Password settings',
        href: '/settings/password',
    },
];

export default function Password() {
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);

    const { data, setData, errors, put, reset, processing, recentlySuccessful } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const updatePassword: FormEventHandler = (e) => {
        e.preventDefault();

        put(route('password.update'), {
            preserveScroll: true,
            onSuccess: () => reset(),
            onError: (errors) => {
                if (errors.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }

                if (errors.current_password) {
                    reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Profile settings" />

            <SettingsLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <HeadingSmall title="Update password" description="Ensure your account is using a long, random password to stay secure" />

                    <Box component="form" onSubmit={updatePassword}>
                        <Stack spacing={3}>
                            <TextField
                                id="current_password"
                                label="Current password"
                                inputRef={currentPasswordInput}
                                value={data.current_password}
                                onChange={(e) => setData('current_password', e.target.value)}
                                type="password"
                                fullWidth
                                autoComplete="current-password"
                                placeholder="Current password"
                                error={Boolean(errors.current_password)}
                                helperText={errors.current_password}
                            />

                            <TextField
                                id="password"
                                label="New password"
                                inputRef={passwordInput}
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                type="password"
                                fullWidth
                                autoComplete="new-password"
                                placeholder="New password"
                                error={Boolean(errors.password)}
                                helperText={errors.password}
                            />

                            <TextField
                                id="password_confirmation"
                                label="Confirm password"
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                type="password"
                                fullWidth
                                autoComplete="new-password"
                                placeholder="Confirm password"
                                error={Boolean(errors.password_confirmation)}
                                helperText={errors.password_confirmation}
                            />

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Button type="submit" variant="contained" disabled={processing}>
                                    Save password
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
            </SettingsLayout>
        </AppLayout>
    );
}
