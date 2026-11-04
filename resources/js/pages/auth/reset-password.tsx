import { Head, useForm } from '@inertiajs/react';
import { Button, FlexBox, Label } from '@ui5/webcomponents-react';
import { FormEventHandler, type ReactNode } from 'react';

import InputError from '@/components/input-error';
import AuthLayout from '@/layouts/auth-layout';
import field from './credential-field.module.css';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

interface ResetPasswordProps {
    token: string;
    email: string;
}

interface ResetPasswordForm {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
    [key: string]: string;
}

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

export default function ResetPassword({ token, email }: ResetPasswordProps) {
    const { data, setData, post, processing, errors, reset } = useForm<ResetPasswordForm>({
        token: token,
        email: email,
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('password.store'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <AuthLayout title="Reset password" description="Please enter your new password below">
            <Head title="Reset password" />

            <form onSubmit={submit}>
                <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                    <Field id="email" label="Email" error={errors.email}>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            name="email"
                            value={data.email}
                            readOnly
                            onChange={(e) => setData('email', e.target.value)}
                            aria-invalid={Boolean(errors.email)}
                            className={cx(field.input, errors.email && field.invalid)}
                        />
                    </Field>

                    <Field id="password" label="Password" error={errors.password}>
                        <input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            name="password"
                            value={data.password}
                            autoFocus
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder="Password"
                            aria-invalid={Boolean(errors.password)}
                            className={cx(field.input, errors.password && field.invalid)}
                        />
                    </Field>

                    <Field id="password_confirmation" label="Confirm password" error={errors.password_confirmation}>
                        <input
                            id="password_confirmation"
                            type="password"
                            autoComplete="new-password"
                            name="password_confirmation"
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            placeholder="Confirm password"
                            aria-invalid={Boolean(errors.password_confirmation)}
                            className={cx(field.input, errors.password_confirmation && field.invalid)}
                        />
                    </Field>

                    <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} loadingDelay={0} style={{ width: '100%' }}>
                        Reset password
                    </Button>
                </FlexBox>
            </form>
        </AuthLayout>
    );
}
