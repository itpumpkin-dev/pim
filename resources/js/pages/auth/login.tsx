import AppLogoIcon from '@/components/app-logo-icon';
import InputError from '@/components/input-error';
import LocaleDropdown from '@/components/locale-dropdown';
import TextLink from '@/components/text-link';
import { APP_VERSION_TEXT } from '@/lib/app-version';
import { Head, Link, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/show.js';
import { Button, CheckBox, FlexBox, Label, Text, Title } from '@ui5/webcomponents-react';
import { FormEventHandler, useState } from 'react';
import { useTranslation } from 'react-i18next';

import field from './credential-field.module.css';
import styles from './login.module.css';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

interface LoginForm {
    email: string;
    password: string;
    remember: boolean;
    [key: string]: string | boolean;
}

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
}

export default function Login({ status, canResetPassword }: LoginProps) {
    const { t } = useTranslation('auth');
    const [showPassword, setShowPassword] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm<LoginForm>({
        email: '',
        password: '',
        remember: false,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    const togglePasswordLabel = showPassword ? t('hidePassword') : t('showPassword');

    return (
        <>
            <Head title="Log in" />
            <div className={styles.page}>
                <div className={styles.formColumn}>
                    <FlexBox alignItems="Center" justifyContent="SpaceBetween">
                        <Link href={route('home')} className={styles.brandLink}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
                                <AppLogoIcon style={{ width: 36, height: 36, fill: 'currentColor' }} />
                            </span>
                            <span className={styles.brandName}>
                                PIM <span className={styles.brandAccent}>Pumpkin</span>
                            </span>
                        </Link>
                        <LocaleDropdown />
                    </FlexBox>

                    <FlexBox alignItems="Center" style={{ flex: 1 }}>
                        <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                            <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                                <FlexBox direction="Column" style={{ gap: '0.5rem' }}>
                                    <Title level="H1" size="H2" wrappingType="Normal">
                                        {t('signIn')}
                                    </Title>
                                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('signInSubtitle')}</Text>
                                </FlexBox>

                                {status && <Text style={{ fontWeight: 500, color: 'var(--sapPositiveTextColor)' }}>{status}</Text>}

                                <form onSubmit={submit}>
                                    <FlexBox direction="Column" style={{ gap: '1.5rem' }}>
                                        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
                                            <Label for="email" required showColon={false}>
                                                {t('emailAddress')}
                                            </Label>
                                            <input
                                                id="email"
                                                name="email"
                                                type="email"
                                                required
                                                autoFocus
                                                tabIndex={1}
                                                autoComplete="email"
                                                value={data.email}
                                                onChange={(e) => setData('email', e.target.value)}
                                                placeholder="email@example.com"
                                                aria-invalid={Boolean(errors.email)}
                                                className={cx(field.input, errors.email && field.invalid)}
                                            />
                                            <InputError message={errors.email} />
                                        </FlexBox>

                                        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
                                            <Label for="password" required showColon={false}>
                                                {t('password')}
                                            </Label>
                                            <div className={field.withAction}>
                                                <input
                                                    id="password"
                                                    name="password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    tabIndex={2}
                                                    autoComplete="current-password"
                                                    value={data.password}
                                                    onChange={(e) => setData('password', e.target.value)}
                                                    placeholder="Password"
                                                    aria-invalid={Boolean(errors.password)}
                                                    className={cx(field.input, errors.password && field.invalid)}
                                                />
                                                <Button
                                                    className={field.action}
                                                    design="Transparent"
                                                    icon={showPassword ? 'hide' : 'show'}
                                                    tooltip={togglePasswordLabel}
                                                    accessibleName={togglePasswordLabel}
                                                    tabIndex={-1}
                                                    onClick={() => setShowPassword((prev) => !prev)}
                                                />
                                            </div>
                                            <InputError message={errors.password} />
                                            {canResetPassword && (
                                                <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                                                    <TextLink href={route('password.request')} tabIndex={5} style={{ fontSize: '0.875rem' }}>
                                                        {t('forgotPassword')}
                                                    </TextLink>
                                                </div>
                                            )}
                                        </FlexBox>

                                        <CheckBox
                                            id="remember"
                                            name="remember"
                                            tabIndex={3}
                                            text={t('rememberMe')}
                                            checked={data.remember}
                                            onChange={(e) => setData('remember', e.target.checked)}
                                        />

                                        <Button
                                            type="Submit"
                                            design="Emphasized"
                                            tabIndex={4}
                                            disabled={processing}
                                            loading={processing}
                                            loadingDelay={0}
                                            style={{ width: '100%' }}
                                        >
                                            {t('signIn')}
                                        </Button>

                                        <Button
                                            design="Transparent"
                                            tabIndex={5}
                                            style={{ width: '100%' }}
                                            onClick={() => router.visit(route('home'))}
                                        >
                                            {t('backToHome')}
                                        </Button>
                                    </FlexBox>
                                </form>
                            </FlexBox>
                        </div>
                    </FlexBox>
                    <div className={styles.footer}>
                        <Text className={styles.footerText}>© Pumpkin Corporation Company Limited | Bangkok {new Date().getFullYear()}</Text>
                        <Text className={styles.footerText}>{APP_VERSION_TEXT}</Text>
                    </div>
                </div>

                <div className={styles.heroPanel}>
                    <FlexBox
                        direction="Column"
                        alignItems="Center"
                        style={{ gap: '0.5rem', position: 'relative', textAlign: 'center', padding: '0 3rem', maxWidth: 420 }}
                    >
                        <AppLogoIcon style={{ width: 96, height: 96 }} />
                        <Title level="H2" size="H2" wrappingType="Normal">
                            PIM Pumpkin
                        </Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('appTagline')}</Text>
                    </FlexBox>
                </div>
            </div>
        </>
    );
}
