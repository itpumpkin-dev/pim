import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { followLink } from '@/components/import-export/follow-link';
import ImportFilePreview from '@/components/import-export/import-file-preview';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import { Button, CheckBox, Input, Menu, MenuItem, Option, Select, Tag, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface ImportConfigItem {
    id: number;
    code: string;
    type: string;
    file_format: string;
    field_separator: string;
    action: string;
    validation_strategy: string;
    ai_translate: boolean;
    source_locale: string;
    allowed_errors: number;
    image_directory_path: string | null;
    source_file_path: string | null;
    source_file_name: string | null;
}

interface Props extends CodeEditState {
    config: ImportConfigItem;
    types: string[];
    requiredColumnsByType: Record<string, string[]>;
    columnLabelsByType: Record<string, Record<string, string>>;
}

export default function ImportEdit({ config, types, requiredColumnsByType, columnLabelsByType, canEditCode = false, codeLocked = false }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locales } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('importsTitle'), href: '/import-export/imports' },
        { title: t('editImport'), href: '#' },
    ];

    const { data, setData, post, processing, errors, transform, isDirty, setDefaults } = useForm({
        code: config.code || '',
        type: config.type,
        file_format: config.file_format,
        field_separator: config.field_separator,
        action: config.action,
        validation_strategy: config.validation_strategy,
        ai_translate: Boolean(config.ai_translate),
        source_locale: config.source_locale,
        allowed_errors: config.allowed_errors,
        image_directory_path: config.image_directory_path || '',
        file: null as File | null,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);
    const [sampleMenuOpen, setSampleMenuOpen] = useState(false);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        setActiveAction('save');
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/import-export/imports/${config.id}`, {
            onSuccess: () => router.visit('/import-export/imports', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    const submitAndRun = (e?: FormEvent) => {
        e?.preventDefault();
        setActiveAction('run');
        transform((formData) => ({ ...formData, _method: 'put', run: true }));
        skipNavigationGuardRef.current = true;
        post(`/import-export/imports/${config.id}`, {
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
            <Head title={`${t('editImport')}: ${config.code}`} />
            <form onSubmit={submit} className={styles.page}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('editImport')}
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/import-export/imports')}>
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
                            {t('importNow')}
                        </Button>
                    </div>
                </div>

                <div className={styles.stack}>
                    <FioriFormGroup title={tCatalog('generalTitle')}>
                        <FioriField
                            label={tCatalog('code')}
                            htmlFor="import-code"
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                            hint={tCatalog(codeHintKey({ canEditCode, codeLocked }))}
                        >
                            <Input
                                id="import-code"
                                className={styles.fullWidth}
                                value={data.code}
                                disabled={!canEditCode}
                                maxlength={100}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                            />
                        </FioriField>
                        <FioriField label={t('typeLabel')} htmlFor="import-type">
                            <Select
                                id="import-type"
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
                        <FioriField label={t('sourceLocaleLabel')} htmlFor="import-source-locale" hint={t('sourceLocaleHelp')}>
                            <Select
                                id="import-source-locale"
                                className={styles.fullWidth}
                                value={data.source_locale}
                                onChange={(e) => setData('source_locale', e.detail.selectedOption.value ?? data.source_locale)}
                            >
                                {locales.map((l) => (
                                    <Option key={l.code} value={l.code}>
                                        {l.display_name ?? l.code}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>
                        <FioriField label={t('uploadedFile')} fullWidth>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <FioriFileUploader
                                        files={data.file ? [data.file] : []}
                                        onFilesChange={(files) => setData('file', files[0] ?? null)}
                                        placeholder={t('chooseFile')}
                                        accept=".csv,.xls,.xlsx"
                                        error={errors.file}
                                    />
                                    {!data.file && (
                                        <span className={styles.hint}>
                                            {t('currentFile')}:{' '}
                                            {config.source_file_name ?? config.source_file_path?.split('/').pop() ?? t('noFileUploaded')}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    id="import-sample-menu-opener"
                                    design="Transparent"
                                    icon="download"
                                    endIcon="slim-arrow-down"
                                    style={{ flexShrink: 0 }}
                                    onClick={() => setSampleMenuOpen((open) => !open)}
                                >
                                    {t('downloadSample')}
                                </Button>
                                <Menu
                                    opener="import-sample-menu-opener"
                                    open={sampleMenuOpen}
                                    onClose={() => setSampleMenuOpen(false)}
                                    onItemClick={(e) => {
                                        const format = e.detail.text === 'XLSX' ? 'xlsx' : 'csv';
                                        setSampleMenuOpen(false);
                                        followLink(`/import-export/imports/sample/${data.type}?format=${format}`);
                                    }}
                                >
                                    <MenuItem text="CSV" />
                                    <MenuItem text="XLSX" />
                                </Menu>
                            </div>
                            {(requiredColumnsByType[data.type] ?? []).length > 0 && (
                                <div className={styles.row} style={{ marginTop: '0.5rem' }}>
                                    <span className={styles.smallText}>{t('requiredFields')}:</span>
                                    {requiredColumnsByType[data.type].map((column) => (
                                        <Tag key={column} design="Neutral" hideStateIcon>
                                            {columnLabelsByType[data.type]?.[column] ?? column}
                                        </Tag>
                                    ))}
                                </div>
                            )}
                            <ImportFilePreview file={data.file} fileFormat={data.file_format} fieldSeparator={data.field_separator} />
                        </FioriField>
                        <FioriField
                            label={t('imageDirectoryPath')}
                            htmlFor="import-image-dir"
                            valueState={valueStateOf(errors.image_directory_path)}
                            message={errors.image_directory_path}
                        >
                            <Input
                                id="import-image-dir"
                                className={styles.fullWidth}
                                value={data.image_directory_path}
                                valueState={ui5ValueState(valueStateOf(errors.image_directory_path))}
                                onInput={(e) => setData('image_directory_path', e.target.value)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('settingsTitle')}>
                        <FioriField label={t('action')} htmlFor="import-action">
                            <Select
                                id="import-action"
                                className={styles.fullWidth}
                                value={data.action}
                                onChange={(e) => setData('action', e.detail.selectedOption.value ?? data.action)}
                            >
                                <Option value="create_update">{t('actionCreateUpdate')}</Option>
                                <Option value="delete">{t('actionDelete')}</Option>
                            </Select>
                        </FioriField>
                        <FioriField label={t('validationStrategy')} htmlFor="import-validation">
                            <Select
                                id="import-validation"
                                className={styles.fullWidth}
                                value={data.validation_strategy}
                                onChange={(e) => setData('validation_strategy', e.detail.selectedOption.value ?? data.validation_strategy)}
                            >
                                <Option value="skip_errors">{t('validationStrategySkip')}</Option>
                                <Option value="stop_on_errors">{t('validationStrategyStop')}</Option>
                            </Select>
                        </FioriField>
                        <FioriField label={t('aiTranslate')} htmlFor="import-ai-translate" hint={t('aiTranslateHelp')}>
                            <CheckBox
                                id="import-ai-translate"
                                accessibleName={t('aiTranslate')}
                                checked={data.ai_translate}
                                onChange={(e) => setData('ai_translate', e.target.checked)}
                            />
                        </FioriField>
                        <FioriField
                            label={t('allowedErrors')}
                            htmlFor="import-allowed-errors"
                            valueState={valueStateOf(errors.allowed_errors)}
                            message={errors.allowed_errors}
                        >
                            <Input
                                id="import-allowed-errors"
                                type="Number"
                                className={styles.fullWidth}
                                value={String(data.allowed_errors)}
                                valueState={ui5ValueState(valueStateOf(errors.allowed_errors))}
                                onInput={(e) => setData('allowed_errors', Number(e.target.value))}
                            />
                        </FioriField>
                        <FioriField label={t('fileFormat')} htmlFor="import-format">
                            <Select
                                id="import-format"
                                className={styles.fullWidth}
                                value={data.file_format}
                                onChange={(e) => setData('file_format', e.detail.selectedOption.value ?? data.file_format)}
                            >
                                <Option value="csv">CSV</Option>
                                <Option value="xls">XLS</Option>
                                <Option value="xlsx">XLSX</Option>
                            </Select>
                        </FioriField>
                        <FioriField
                            label={t('fieldSeparator')}
                            htmlFor="import-field-separator"
                            valueState={valueStateOf(errors.field_separator)}
                            message={errors.field_separator}
                        >
                            <Input
                                id="import-field-separator"
                                className={styles.fullWidth}
                                value={data.field_separator}
                                valueState={ui5ValueState(valueStateOf(errors.field_separator))}
                                onInput={(e) => setData('field_separator', e.target.value)}
                            />
                        </FioriField>
                    </FioriFormGroup>
                </div>

                <FioriFormErrorSummary errors={errors} message={tCatalog('correctHighlightedFields')} style={{ marginTop: '1rem' }} />
            </form>
        </AppLayout>
    );
}
