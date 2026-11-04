import { Head, useForm } from '@inertiajs/react';
import { Button, FlexBox, Text } from '@ui5/webcomponents-react';
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
                <Text style={{ display: 'block', marginBottom: '1rem', textAlign: 'center', fontWeight: 500, color: 'var(--sapPositiveTextColor)' }}>
                    A new verification link has been sent to the email address you provided during registration.
                </Text>
            )}

            <form onSubmit={submit} style={{ textAlign: 'center' }}>
                <FlexBox direction="Column" alignItems="Center" style={{ gap: '1.5rem' }}>
                    <Button type="Submit" disabled={processing} loading={processing} loadingDelay={0}>
                        Resend verification email
                    </Button>

                    <TextLink href={route('logout')} method="post">
                        Log out
                    </TextLink>
                </FlexBox>
            </form>
        </AuthLayout>
    );
}
