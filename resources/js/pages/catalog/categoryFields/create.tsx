import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { OptionListEditor } from '@/components/catalog/option-list-editor';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Option, Select, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '../categories/category-pages.module.css';

const FIELD_TYPES = ['Text', 'Textarea', 'Boolean', 'Select', 'Multiselect', 'Datetime', 'Date', 'Image', 'File', 'Checkbox'];

export default function CategoryFieldCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categoryFields'), href: '/catalog/categoryFields' },
        { title: 'Create Field', href: '/catalog/categoryFields/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        type: 'Text',
        labels: {} as Record<string, string>,
        options: [] as string[],
        is_required: false as boolean,
        // ตั้งค่าเริ่มต้นให้ติ๊ก "AI translate" ไว้ — ฟิลด์หมวดหมู่ที่สร้างใหม่
        // ส่วนใหญ่ต้องการ label ครบทุกภาษา (จับคู่พฤติกรรมกับหน้าสร้าง Attribute)
        is_ai_translate: true as boolean,
        status: true as boolean,
        position: 0,
        display_section: 'General',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/categoryFields', {
            onSuccess: () => router.visit('/catalog/categoryFields', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create Category Field" />
            <form onSubmit={submit} className={styles.formPage}>
                <div className={styles.formHeader}>
                    <Title level="H3" wrappingType="Normal">
                        Create Category Field
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/categoryFields')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} loading={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </div>
                </div>

                <div className={styles.formStack}>
                    <FioriFormGroup title="General Config">
                        <FioriField label="Field Type" htmlFor="field-type" required>
                            <Select
                                id="field-type"
                                className={styles.fullWidth}
                                value={data.type}
                                onChange={(e) => setData('type', e.detail.selectedOption.value ?? 'Text')}
                            >
                                {FIELD_TYPES.map((type) => (
                                    <Option key={type} value={type}>
                                        {type}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        {(data.type === 'Select' || data.type === 'Multiselect') && (
                            <FioriField label="Options" fullWidth>
                                <OptionListEditor value={data.options} onChange={(options) => setData('options', options)} />
                            </FioriField>
                        )}

                        <FioriField label="Position" htmlFor="field-position" valueState={valueStateOf(errors.position)} message={errors.position}>
                            <Input
                                id="field-position"
                                type="Number"
                                className={styles.fullWidth}
                                value={String(data.position)}
                                valueState={ui5ValueState(valueStateOf(errors.position))}
                                onInput={(e) => setData('position', Number(e.target.value))}
                            />
                        </FioriField>

                        <FioriField
                            label="Display Section"
                            htmlFor="field-display-section"
                            valueState={valueStateOf(errors.display_section)}
                            message={errors.display_section}
                            hint="Optional UI grouping name"
                        >
                            <Input
                                id="field-display-section"
                                className={styles.fullWidth}
                                value={data.display_section}
                                valueState={ui5ValueState(valueStateOf(errors.display_section))}
                                onInput={(e) => setData('display_section', e.target.value)}
                            />
                        </FioriField>

                        <FioriField label="">
                            <div className={styles.checkRow}>
                                <CheckBox
                                    text="Required field"
                                    checked={data.is_required}
                                    onChange={(e) => setData('is_required', e.target.checked)}
                                />
                                <CheckBox
                                    text={t('aiTranslate')}
                                    checked={data.is_ai_translate}
                                    onChange={(e) => setData('is_ai_translate', e.target.checked)}
                                />
                                <CheckBox text="Status Active" checked={data.status} onChange={(e) => setData('status', e.target.checked)} />
                            </div>
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title="Field Labels"
                        values={data.labels}
                        onChange={(localeId, value) => setData('labels', { ...data.labels, [localeId]: value })}
                    />
                </div>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} className={styles.errorSummary} />
            </form>
        </AppLayout>
    );
}
