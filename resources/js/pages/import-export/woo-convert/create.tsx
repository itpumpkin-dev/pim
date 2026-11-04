import { FioriField, FioriFormErrorSummary, FioriFormGroup, FioriMessageStrip } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/document.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-up.js';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Button, CheckBox, Icon, Option, Select, Title } from '@ui5/webcomponents-react';
import { DragEvent, FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface AttributeFamilyOption {
    code: string;
    name: string;
}

interface Props {
    families: AttributeFamilyOption[];
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirrors WooCommerceConversionController::convert()'s 'file' => 'max:38912'
// (38912 KB = 38MB) — checked client-side so a too-large file is rejected
// immediately instead of after uploading tens of MB just to have the server
// say no.
const MAX_FILE_SIZE_MB = 38;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Click-to-browse (native <label> + hidden input) and drag-and-drop share
 * one drop target so users aren't forced to hunt for a tiny "choose file"
 * button — the whole box is the target either way.
 */
function FileDropzone({
    file,
    onSelect,
    label,
    hint,
    error,
}: {
    file: File | null;
    onSelect: (file: File | null) => void;
    label: string;
    hint?: string;
    error?: string;
}) {
    const [dragging, setDragging] = useState(false);

    const handleDrop = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) {
            onSelect(dropped);
        }
    };

    if (file) {
        return (
            <div className={styles.selectedFile}>
                <Icon name="document" style={{ width: '1.5rem', height: '1.5rem', color: 'var(--sapPositiveColor)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span className={styles.ellipsis} style={{ fontWeight: 600, color: 'var(--sapTextColor)', fontSize: 'var(--sapFontSize)' }}>
                        {file.name}
                    </span>
                    <span className={styles.smallText}>{formatFileSize(file.size)}</span>
                </div>
                <Button design="Transparent" icon="decline" accessibleName="remove" tooltip="remove" onClick={() => onSelect(null)} />
            </div>
        );
    }

    return (
        <div>
            <label
                className={[styles.dropzone, dragging ? styles.dropzoneActive : ''].filter(Boolean).join(' ')}
                onDragOver={(e: DragEvent<HTMLElement>) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
            >
                <Icon
                    name="upload"
                    style={{ width: '2rem', height: '2rem', color: dragging ? 'var(--sapBrandColor)' : 'var(--sapContent_LabelColor)' }}
                />
                <span style={{ fontWeight: 600, color: 'var(--sapTextColor)', fontSize: 'var(--sapFontSize)' }}>{label}</span>
                {hint && <span className={styles.smallText}>{hint}</span>}
                <input type="file" hidden accept=".csv" onChange={(e) => onSelect(e.target.files?.[0] ?? null)} />
            </label>
            {error && (
                <span className={styles.smallText} style={{ display: 'block', marginTop: '0.25rem', color: 'var(--sapNegativeTextColor)' }}>
                    {error}
                </span>
            )}
        </div>
    );
}

export default function WooConvertCreate({ families }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
        { title: t('wooConvertNewConversion'), href: '/import-export/woo-convert/create' },
    ];

    const { data, setData, post, processing, errors, setError, clearErrors, isDirty } = useForm({
        file: null as File | null,
        category_map: null as File | null,
        family_code: '',
        emit_name: true as boolean,
        emit_description: true as boolean,
        strip_html: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const [advancedOpen, setAdvancedOpen] = useState(false);
    const advancedErrorCount = ['category_map', 'family_code'].filter((key) => errors[key as keyof typeof errors]).length;

    const selectFile = (file: File | null) => {
        if (file && file.size > MAX_FILE_SIZE_BYTES) {
            setData('file', null);
            setError('file', t('wooConvertFileTooLarge', { size: formatFileSize(file.size) }));
            return;
        }
        clearErrors('file');
        setData('file', file);
    };

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/import-export/woo-convert', {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertTitle')} />
            <form onSubmit={submit} className={styles.page} style={{ maxWidth: 720, marginInline: 'auto' }}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('wooConvertTitle')}
                    </Title>
                    <Button icon="nav-back" onClick={() => router.visit('/import-export/woo-convert')}>
                        {tCatalog('back')}
                    </Button>
                </div>

                <FioriMessageStrip severity="information" style={{ marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>
                    {t('wooConvertIntro')}
                </FioriMessageStrip>

                <div className={styles.stack}>
                    <FioriFormGroup title={t('wooConvertFileSectionTitle')}>
                        <FileDropzone
                            file={data.file}
                            onSelect={selectFile}
                            label={t('wooConvertDropzoneLabel')}
                            hint={t('wooConvertFileHelp')}
                            error={errors.file}
                        />
                    </FioriFormGroup>

                    <div>
                        <Button
                            design="Transparent"
                            endIcon={advancedOpen ? 'slim-arrow-up' : 'slim-arrow-down'}
                            onClick={() => setAdvancedOpen((v) => !v)}
                        >
                            {t('wooConvertAdvancedOptions')}
                        </Button>

                        {(advancedOpen || advancedErrorCount > 0) && (
                            <div className={styles.stack} style={{ marginTop: '0.5rem' }}>
                                <FioriFormGroup title={t('wooConvertCategorySectionTitle')} description={t('wooConvertCategoryHelp')}>
                                    <FileDropzone
                                        file={data.category_map}
                                        onSelect={(file) => setData('category_map', file)}
                                        label={t('wooConvertCategoryMapChoose')}
                                        error={errors.category_map}
                                    />
                                </FioriFormGroup>

                                <FioriFormGroup title={t('wooConvertFamilySectionTitle')}>
                                    <FioriField
                                        label={t('wooConvertFamilyCode')}
                                        htmlFor="woo-convert-family"
                                        hint={t('wooConvertFamilyCodeHelp')}
                                        valueState={errors.family_code ? 'error' : 'none'}
                                        message={errors.family_code}
                                        labelWidth={160}
                                    >
                                        <Select
                                            id="woo-convert-family"
                                            className={styles.fullWidth}
                                            value={data.family_code}
                                            valueState={errors.family_code ? 'Negative' : 'None'}
                                            onChange={(e) => setData('family_code', e.detail.selectedOption.value ?? '')}
                                        >
                                            <Option value="">{t('wooConvertFamilyCodeNone')}</Option>
                                            {families.map((family) => (
                                                <Option key={family.code} value={family.code}>
                                                    {family.name} ({family.code})
                                                </Option>
                                            ))}
                                        </Select>
                                    </FioriField>
                                </FioriFormGroup>

                                <FioriFormGroup title={t('wooConvertOptionsSectionTitle')}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <CheckBox
                                            text={t('wooConvertEmitName')}
                                            checked={data.emit_name}
                                            onChange={(e) => setData('emit_name', e.target.checked)}
                                        />
                                        <CheckBox
                                            text={t('wooConvertEmitDescription')}
                                            checked={data.emit_description}
                                            onChange={(e) => setData('emit_description', e.target.checked)}
                                        />
                                        <CheckBox
                                            text={t('wooConvertStripHtml')}
                                            checked={data.strip_html}
                                            onChange={(e) => setData('strip_html', e.target.checked)}
                                        />
                                        {(data.emit_name || data.emit_description) && (
                                            <span className={styles.smallText} style={{ whiteSpace: 'pre-line' }}>
                                                {t('wooConvertLocaleCaveat')}
                                            </span>
                                        )}
                                    </div>
                                </FioriFormGroup>
                            </div>
                        )}
                    </div>
                </div>

                <FioriFormErrorSummary errors={errors} message={tCatalog('correctHighlightedFields')} style={{ marginTop: '1rem' }} />

                <Button
                    design="Emphasized"
                    icon="play"
                    disabled={processing || !data.file}
                    loading={processing}
                    loadingDelay={0}
                    onClick={() => submit()}
                    style={{ width: '100%', marginTop: '1.5rem' }}
                >
                    {processing ? t('wooConvertSubmitting') : t('wooConvertSubmit')}
                </Button>
            </form>
        </AppLayout>
    );
}
