import { Head, useForm } from '@inertiajs/react';
import { Button, FlexBox, Input, Label, Text } from '@ui5/webcomponents-react';
import { FormEventHandler, type ReactNode } from 'react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import AuthLayout from '@/layouts/auth-layout';
import field from './credential-field.module.css';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

interface RegisterForm {
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    password_confirmation: string;
    [key: string]: string;
}

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

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm<RegisterForm>({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    const stateOf = (error?: string) => (error ? 'Negative' : 'None');

    return (
        <AuthLayout title="Create an account" description="Enter your details below to create your account">
            <Head title="Register" />
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                    <Field id="username" label="Username" error={errors.username}>
                        <input
                            id="username"
                            name="username"
                            autoComplete="username"
                            type="text"
                            required
                            autoFocus
                            tabIndex={1}
                            value={data.username}
                            onChange={(e) => setData('username', e.target.value)}
                            disabled={processing}
                            placeholder="username"
                            aria-invalid={Boolean(errors.username)}
                            className={cx(field.input, errors.username && field.invalid)}
                        />
                    </Field>

                    <FlexBox style={{ gap: '1rem' }}>
                        <Field id="first_name" label="First name" error={errors.first_name}>
                            <Input
                                id="first_name"
                                name="first_name"
                                type="Text"
                                required
                                tabIndex={2}
                                value={data.first_name}
                                onInput={(e) => setData('first_name', e.target.value)}
                                disabled={processing}
                                placeholder="First name"
                                style={{ width: '100%' }}
                                valueState={stateOf(errors.first_name)}
                            />
                        </Field>

                        <Field id="last_name" label="Last name" error={errors.last_name}>
                            <Input
                                id="last_name"
                                name="last_name"
                                type="Text"
                                required
                                tabIndex={3}
                                value={data.last_name}
                                onInput={(e) => setData('last_name', e.target.value)}
                                disabled={processing}
                                placeholder="Last name"
                                style={{ width: '100%' }}
                                valueState={stateOf(errors.last_name)}
                            />
                        </Field>
                    </FlexBox>

                    <Field id="email" label="Email address" error={errors.email}>
                        <input
                            id="email"
                            name="email"
                            autoComplete="email"
                            type="email"
                            required
                            tabIndex={4}
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            disabled={processing}
                            placeholder="email@example.com"
                            aria-invalid={Boolean(errors.email)}
                            className={cx(field.input, errors.email && field.invalid)}
                        />
                    </Field>

                    <Field id="password" label="Password" error={errors.password}>
                        <input
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            type="password"
                            required
                            tabIndex={5}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            disabled={processing}
                            placeholder="Password"
                            aria-invalid={Boolean(errors.password)}
                            className={cx(field.input, errors.password && field.invalid)}
                        />
                    </Field>

                    <Field id="password_confirmation" label="Confirm password" error={errors.password_confirmation}>
                        <input
                            id="password_confirmation"
                            name="password_confirmation"
                            autoComplete="new-password"
                            type="password"
                            required
                            tabIndex={6}
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            disabled={processing}
                            placeholder="Confirm password"
                            aria-invalid={Boolean(errors.password_confirmation)}
                            className={cx(field.input, errors.password_confirmation && field.invalid)}
                        />
                    </Field>

                    <Button
                        type="Submit"
                        design="Emphasized"
                        tabIndex={7}
                        disabled={processing}
                        loading={processing}
                        loadingDelay={0}
                        style={{ width: '100%' }}
                    >
                        Create account
                    </Button>
                </FlexBox>

                <Text style={{ textAlign: 'center', color: 'var(--sapContent_LabelColor)' }}>
                    Already have an account?{' '}
                    <TextLink href={route('login')} tabIndex={8}>
                        Log in
                    </TextLink>
                </Text>
            </form>
        </AuthLayout>
    );
}
