import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { Button, FlexBox, Input, Label, Text } from '@ui5/webcomponents-react';
import { FormEventHandler, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteUser from '@/components/delete-user';
import HeadingSmall from '@/components/heading-small';
import InputError from '@/components/input-error';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
    return (
        <FlexBox direction="Column" style={{ gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <Label for={id} required showColon={false}>
                {label}
            </Label>
            {children}
            <InputError message={error} />
        </FlexBox>
    );
}

export default function Profile({ mustVerifyEmail, status }: { mustVerifyEmail: boolean; status?: string }) {
    const { t } = useTranslation('settings');
    const { auth } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('profileInformation'),
            href: '/settings/profile',
        },
    ];

    const { data, setData, patch, errors, processing, recentlySuccessful, isDirty, setDefaults } = useForm({
        username: auth.user.username,
        first_name: auth.user.first_name,
        last_name: auth.user.last_name,
        email: auth.user.email,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        skipNavigationGuardRef.current = true;
        patch(route('profile.update'), {
            // This page doesn't navigate away or reset() on success — it
            // stays put with the just-saved values still in the fields, so
            // without this, isDirty would stay permanently true (comparing
            // against the values from when the page first loaded) and the
            // guard above would nag on every later navigation even though
            // everything's saved.
            onSuccess: () => setDefaults(),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const stateOf = (error?: string) => (error ? 'Negative' : 'None');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('profileInformation')} />

            <SettingsLayout>
                <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                    <HeadingSmall title={t('profileInformation')} description={t('profileInformationDesc')} />

                    <form onSubmit={submit}>
                        <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                            <Field id="username" label={t('username')} error={errors.username}>
                                <Input
                                    id="username"
                                    style={{ width: '100%' }}
                                    value={data.username}
                                    onInput={(e) => setData('username', e.target.value)}
                                    required
                                    placeholder={t('username')}
                                    valueState={stateOf(errors.username)}
                                />
                            </Field>

                            <FlexBox style={{ gap: '1rem' }}>
                                <Field id="first_name" label={t('firstName')} error={errors.first_name}>
                                    <Input
                                        id="first_name"
                                        style={{ width: '100%' }}
                                        value={data.first_name}
                                        onInput={(e) => setData('first_name', e.target.value)}
                                        required
                                        placeholder={t('firstName')}
                                        valueState={stateOf(errors.first_name)}
                                    />
                                </Field>

                                <Field id="last_name" label={t('lastName')} error={errors.last_name}>
                                    <Input
                                        id="last_name"
                                        style={{ width: '100%' }}
                                        value={data.last_name}
                                        onInput={(e) => setData('last_name', e.target.value)}
                                        required
                                        placeholder={t('lastName')}
                                        valueState={stateOf(errors.last_name)}
                                    />
                                </Field>
                            </FlexBox>

                            <Field id="email" label={t('emailAddress')} error={errors.email}>
                                <Input
                                    id="email"
                                    type="Email"
                                    style={{ width: '100%' }}
                                    value={data.email}
                                    onInput={(e) => setData('email', e.target.value)}
                                    required
                                    placeholder={t('emailAddress')}
                                    valueState={stateOf(errors.email)}
                                />
                            </Field>

                            {mustVerifyEmail && auth.user.email_verified_at === null && (
                                <div>
                                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>
                                        {t('emailUnverified')}{' '}
                                        <Link
                                            href={route('verification.send')}
                                            method="post"
                                            as="button"
                                            style={{
                                                background: 'none',
                                                border: 0,
                                                padding: 0,
                                                cursor: 'pointer',
                                                font: 'inherit',
                                                color: 'var(--sapLinkColor)',
                                            }}
                                        >
                                            {t('resendVerification')}
                                        </Link>
                                    </Text>

                                    {status === 'verification-link-sent' && (
                                        <Text
                                            style={{ display: 'block', marginTop: '0.5rem', fontWeight: 500, color: 'var(--sapPositiveTextColor)' }}
                                        >
                                            {t('verificationSent')}
                                        </Text>
                                    )}
                                </div>
                            )}

                            <FlexBox alignItems="Center" style={{ gap: '1rem' }}>
                                <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} loadingDelay={0}>
                                    {processing ? t('saving') : t('save')}
                                </Button>

                                <Text
                                    style={{
                                        color: 'var(--sapContent_LabelColor)',
                                        opacity: recentlySuccessful ? 1 : 0,
                                        transition: 'opacity 225ms ease-in-out',
                                    }}
                                >
                                    {t('saved')}
                                </Text>
                            </FlexBox>
                        </FlexBox>
                    </form>
                </FlexBox>

                <DeleteUser />
            </SettingsLayout>
        </AppLayout>
    );
}
