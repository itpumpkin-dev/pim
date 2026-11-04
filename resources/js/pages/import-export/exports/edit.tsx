import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, Input, Option, Select, Switch, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface ExportConfigItem {
    id: number;
    code: string;
    type: string;
    file_format: string;
    field_separator: string;
    with_media: boolean;
}

interface Props extends CodeEditState {
    config: ExportConfigItem;
    types: string[];
}

export default function ExportEdit({ config, types, canEditCode = false, codeLocked = false }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('exportsTitle'), href: '/import-export/exports' },
        { title: t('editExport'), href: '#' },
    ];

    const { data, setData, put, processing, errors, transform, isDirty, setDefaults } = useForm({
        code: config.code || '',
        type: config.type,
        file_format: config.file_format,
        field_separator: config.field_separator,
        with_media: Boolean(config.with_media),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        setActiveAction('save');
        skipNavigationGuardRef.current = true;
        put(`/import-export/exports/${config.id}`, {
            onSuccess: () => router.visit('/import-export/exports', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    const submitAndRun = (e?: FormEvent) => {
        e?.preventDefault();
        setActiveAction('run');
        transform((formData) => ({ ...formData, run: true }));
        skipNavigationGuardRef.current = true;
        put(`/import-export/exports/${config.id}`, {
            onSuccess: () => setDefaults(),
            onFinish: () => {
                transform((formData) => formData);
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editExport')}: ${config.code}`} />
            <form onSubmit={submit} className={styles.page}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('editExport')}
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/import-export/exports')}>
                            {tCatalog('back')}
                        </Button>
                        <Button icon="save" disabled={processing} loading={activeAction === 'save'} loadingDelay={0} onClick={() => submit()}>
                            {activeAction === 'save' ? tCatalog('saving') : tCatalog('save')}
                        </Button>
                        <Button
                            design="Emphasized"
                            icon="play"
                            disabled={processing}
                            loading={activeAction === 'run'}
                            loadingDelay={0}
                            onClick={() => submitAndRun()}
                        >
                            {t('exportNow')}
                        </Button>
                    </div>
                </div>

                <FioriFormGroup title={tCatalog('generalTitle')}>
                    <FioriField
                        label={tCatalog('code')}
                        htmlFor="export-code"
                        valueState={valueStateOf(errors.code)}
                        message={errors.code}
                        hint={tCatalog(codeHintKey({ canEditCode, codeLocked }))}
                    >
                        <Input
                            id="export-code"
                            className={styles.fullWidth}
                            value={data.code}
                            disabled={!canEditCode}
                            maxlength={100}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                            onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                        />
                    </FioriField>
                    <FioriField label={t('typeLabel')} htmlFor="export-type">
                        <Select
                            id="export-type"
                            className={styles.fullWidth}
                            value={data.type}
                            onChange={(e) => setData('type', e.detail.selectedOption.value ?? data.type)}
                        >
                            {types.map((type) => (
                                <Option key={type} value={type}>
                                    {typeLabel(type)}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>
                    <FioriField
                        label={t('fieldSeparator')}
                        htmlFor="export-field-separator"
                        valueState={valueStateOf(errors.field_separator)}
                        message={errors.field_separator}
                    >
                        <Input
                            id="export-field-separator"
                            className={styles.fullWidth}
                            value={data.field_separator}
                            valueState={ui5ValueState(valueStateOf(errors.field_separator))}
                            onInput={(e) => setData('field_separator', e.target.value)}
                        />
                    </FioriField>
                    <FioriField label={t('fileFormat')} htmlFor="export-format">
                        <Select
                            id="export-format"
                            className={styles.fullWidth}
                            value={data.file_format}
                            onChange={(e) => setData('file_format', e.detail.selectedOption.value ?? data.file_format)}
                        >
                            <Option value="csv">CSV</Option>
                            <Option value="xls">XLS</Option>
                            <Option value="xlsx">XLSX</Option>
                        </Select>
                    </FioriField>
                    <FioriField label={t('withMedia')} htmlFor="export-with-media">
                        <Switch id="export-with-media" checked={data.with_media} onChange={(e) => setData('with_media', e.target.checked)} />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormErrorSummary errors={errors} message={tCatalog('correctHighlightedFields')} style={{ marginTop: '1rem' }} />
            </form>
        </AppLayout>
    );
}
