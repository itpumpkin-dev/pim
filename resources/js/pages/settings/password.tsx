import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Button, FlexBox, Label, Text } from '@ui5/webcomponents-react';
import { FormEventHandler, useRef, type ReactNode } from 'react';

import HeadingSmall from '@/components/heading-small';
import InputError from '@/components/input-error';
import field from '@/pages/auth/credential-field.module.css';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Password settings',
        href: '/settings/password',
    },
];

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
    return (
        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
            <Label for={id} showColon={false}>
                {label}
            </Label>
            {children}
            <InputError message={error} />
        </FlexBox>
    );
}

export default function Password() {
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);

    const { data, setData, errors, put, reset, processing, recentlySuccessful, isDirty } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const updatePassword: FormEventHandler = (e) => {
        e.preventDefault();

        skipNavigationGuardRef.current = true;
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
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Profile settings" />

            <SettingsLayout>
                <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                    <HeadingSmall title="Update password" description="Ensure your account is using a long, random password to stay secure" />

                    <form onSubmit={updatePassword}>
                        <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                            <Field id="current_password" label="Current password" error={errors.current_password}>
                                <input
                                    id="current_password"
                                    name="current_password"
                                    autoComplete="current-password"
                                    ref={currentPasswordInput}
                                    value={data.current_password}
                                    onChange={(e) => setData('current_password', e.target.value)}
                                    type="password"
                                    placeholder="Current password"
                                    aria-invalid={Boolean(errors.current_password)}
                                    className={cx(field.input, errors.current_password && field.invalid)}
                                />
                            </Field>

                            <Field id="password" label="New password" error={errors.password}>
                                <input
                                    id="password"
                                    name="password"
                                    autoComplete="new-password"
                                    ref={passwordInput}
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    type="password"
                                    placeholder="New password"
                                    aria-invalid={Boolean(errors.password)}
                                    className={cx(field.input, errors.password && field.invalid)}
                                />
                            </Field>

                            <Field id="password_confirmation" label="Confirm password" error={errors.password_confirmation}>
                                <input
                                    id="password_confirmation"
                                    name="password_confirmation"
                                    autoComplete="new-password"
                                    value={data.password_confirmation}
                                    onChange={(e) => setData('password_confirmation', e.target.value)}
                                    type="password"
                                    placeholder="Confirm password"
                                    aria-invalid={Boolean(errors.password_confirmation)}
                                    className={cx(field.input, errors.password_confirmation && field.invalid)}
                                />
                            </Field>

                            <FlexBox alignItems="Center" style={{ gap: '1rem' }}>
                                <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} loadingDelay={0}>
                                    {processing ? 'Saving…' : 'Save password'}
                                </Button>

                                <Text
                                    style={{
                                        color: 'var(--sapContent_LabelColor)',
                                        opacity: recentlySuccessful ? 1 : 0,
                                        transition: 'opacity 225ms ease-in-out',
                                    }}
                                >
                                    Saved
                                </Text>
                            </FlexBox>
                        </FlexBox>
                    </form>
                </FlexBox>
            </SettingsLayout>
        </AppLayout>
    );
}
