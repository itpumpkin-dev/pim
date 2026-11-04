import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';

import styles from './locale-pages.module.css';

interface Locale {
    id: number;
    code: string;
    display_name: string | null;
    enabled: boolean;
}

interface Props {
    localeModel: Locale;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'SYSTEM', href: '#' },
    { title: 'LOCALES', href: '/system/locales' },
    { title: 'EDIT LOCALE', href: '#' },
];

export default function LocaleEdit({ localeModel }: Props) {
    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: localeModel.code || '',
        display_name: localeModel.display_name || '',
        enabled: localeModel.enabled,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/system/locales/${localeModel.id}`, {
            replace: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Locale: ${localeModel.code}`} />
            <form onSubmit={submit} className={styles.page}>
                {/* Header Title & Actions */}
                <div className={styles.header}>
                    <Title level="H3">Edit Locale</Title>
                    <div className={styles.headerActions}>
                        <Button icon="nav-back" onClick={() => router.visit('/system/locales')}>
                            Back
                        </Button>
                        <Button type="Submit" design="Emphasized" icon="save" disabled={processing} loading={processing} loadingDelay={0}>
                            {processing ? 'Saving…' : 'Save Locale'}
                        </Button>
                    </div>
                </div>

                <div className={styles.formBody}>
                    {/* General Panel */}
                    <FioriFormGroup title="General">
                        <FioriField
                            label="Code"
                            htmlFor="locale-code"
                            required
                            fullWidth
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                        >
                            <Input
                                id="locale-code"
                                style={{ width: '100%' }}
                                required
                                placeholder="e.g. th, en"
                                value={data.code}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', e.target.value)}
                            />
                        </FioriField>
                        <FioriField
                            label="Display Name"
                            htmlFor="locale-display-name"
                            fullWidth
                            valueState={valueStateOf(errors.display_name)}
                            message={errors.display_name}
                        >
                            <Input
                                id="locale-display-name"
                                style={{ width: '100%' }}
                                placeholder="e.g. ไทย, English"
                                value={data.display_name}
                                valueState={ui5ValueState(valueStateOf(errors.display_name))}
                                onInput={(e) => setData('display_name', e.target.value)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    {/* Status Panel */}
                    <FioriFormGroup title="Status">
                        {/* สองช่องนี้ทำงานแบบ radio: คลิกช่องที่ติ๊กอยู่แล้วต้องไม่เอาติ๊กออก (preventDefault) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                            <CheckBox
                                text="Active"
                                checked={data.enabled === true}
                                onChange={(e) => {
                                    if (!e.target.checked) e.preventDefault();
                                    setData('enabled', true);
                                }}
                            />
                            <CheckBox
                                text="Non Active"
                                checked={data.enabled === false}
                                onChange={(e) => {
                                    if (!e.target.checked) e.preventDefault();
                                    setData('enabled', false);
                                }}
                            />
                        </div>
                    </FioriFormGroup>
                </div>

                <FioriFormErrorSummary
                    errors={errors}
                    message="Please correct the highlighted fields before saving."
                    style={{ marginTop: '1.5rem', maxWidth: 800 }}
                />
            </form>
        </AppLayout>
    );
}
