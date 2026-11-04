import { Head, useForm } from '@inertiajs/react';
import { Button, FlexBox, Label } from '@ui5/webcomponents-react';
import { FormEventHandler } from 'react';

import InputError from '@/components/input-error';
import AuthLayout from '@/layouts/auth-layout';
import field from './credential-field.module.css';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

export default function ConfirmPassword() {
    const { data, setData, post, processing, errors, reset } = useForm({
        password: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.confirm'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthLayout
            title="Confirm your password"
            description="This is a secure area of the application. Please confirm your password before continuing."
        >
            <Head title="Confirm password" />

            <form onSubmit={submit}>
                <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                    <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
                        <Label for="password" showColon={false}>
                            Password
                        </Label>
                        <input
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            type="password"
                            placeholder="Password"
                            value={data.password}
                            autoFocus
                            aria-invalid={Boolean(errors.password)}
                            className={cx(field.input, errors.password && field.invalid)}
                            onChange={(e) => setData('password', e.target.value)}
                        />
                        <InputError message={errors.password} />
                    </FlexBox>

                    <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} loadingDelay={0} style={{ width: '100%' }}>
                        Confirm password
                    </Button>
                </FlexBox>
            </form>
        </AuthLayout>
    );
}
