import { Head, useForm } from '@inertiajs/react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';

export default function VerifyEmail({ status }: { status?: string }) {
    const { post, processing } = useForm({});

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('verification.send'));
    };

    return (
        <AuthLayout title="Verify email" description="Please verify your email address by clicking on the link we just emailed to you.">
            <Head title="Email verification" />

            {status === 'verification-link-sent' && (
                <Typography variant="body2" color="success.main" sx={{ mb: 2, textAlign: 'center', fontWeight: 500 }}>
                    A new verification link has been sent to the email address you provided during registration.
                </Typography>
            )}

            <Box component="form" onSubmit={submit} sx={{ textAlign: 'center' }}>
                <Stack spacing={3} alignItems="center">
                    <Button
                        type="submit"
                        variant="outlined"
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        Resend verification email
                    </Button>

                    <TextLink href={route('logout')} method="post">
                        Log out
                    </TextLink>
                </Stack>
            </Box>
        </AuthLayout>
    );
}
