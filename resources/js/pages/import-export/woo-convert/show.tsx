import { FioriMessageStrip } from '@/components/fiori-form';
import { followLink } from '@/components/import-export/follow-link';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/message-warning.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/status-positive.js';
import { Button, Icon, Menu, MenuItem, Title } from '@ui5/webcomponents-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface Conversion {
    id: number;
    original_filename: string;
    row_count: number;
    sku_missing_count: number;
    category_matched_count: number;
    category_unmatched_count: number;
    brand_new_count: number;
    brand_new_names: string[];
    brand_new_names_total: number;
    type_warnings: string[];
    type_warnings_total: number;
    emitted_name: boolean;
    emitted_description: boolean;
    has_unmatched: boolean;
    creator: UserSummary | null;
    created_at: string;
}

interface Props {
    conversion: Conversion;
}

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function WooConvertShow({ conversion }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
        { title: `#${conversion.id}`, href: '#' },
    ];

    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

    const creatorLabel = (() => {
        if (!conversion.creator) return '-';
        const fullName = [conversion.creator.first_name, conversion.creator.last_name].filter(Boolean).join(' ').trim();
        return fullName || conversion.creator.username;
    })();

    const stat = (label: string, value: number, tone: 'neutral' | 'good' | 'warn' = 'neutral', icon?: ReactNode) => {
        const toneColor = tone === 'warn' ? 'var(--sapCriticalTextColor)' : tone === 'good' ? 'var(--sapPositiveTextColor)' : 'var(--sapTextColor)';
        const borderColor = tone === 'warn' ? 'var(--sapCriticalColor)' : tone === 'good' ? 'var(--sapPositiveColor)' : undefined;
        return (
            <div className={styles.cardPadded} style={{ padding: '1rem', textAlign: 'center', borderColor }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}>
                    {icon}
                    <span className={styles.statValue} style={{ color: toneColor }}>
                        {value}
                    </span>
                </div>
                <span className={styles.secondaryText}>{label}</span>
            </div>
        );
    };

    const goodIcon = <Icon name="status-positive" style={{ width: '1.25rem', height: '1.25rem', color: 'var(--sapPositiveColor)' }} />;
    const warnIcon = <Icon name="message-warning" style={{ width: '1.25rem', height: '1.25rem', color: 'var(--sapCriticalColor)' }} />;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertResultTitle')} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('wooConvertResultTitle')}
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/import-export/woo-convert')}>
                            {tCatalog('back')}
                        </Button>
                        <Button icon="add" onClick={() => router.visit('/import-export/woo-convert/create')}>
                            {t('wooConvertAnother')}
                        </Button>
                    </div>
                </div>

                <FioriMessageStrip severity="success" style={{ marginBottom: '0.5rem' }}>
                    {t('wooConvertResultSummary', {
                        file: conversion.original_filename,
                        count: conversion.row_count,
                        skipped: conversion.sku_missing_count,
                    })}
                </FioriMessageStrip>
                <span className={styles.smallText} style={{ display: 'block', marginBottom: '1.5rem' }}>
                    {formatLocalDateTime(conversion.created_at)} · {creatorLabel}
                </span>

                <div className={styles.statGrid4}>
                    {stat(t('wooConvertRowsConverted'), conversion.row_count, 'good', goodIcon)}
                    {stat(
                        t('wooConvertRowsSkipped'),
                        conversion.sku_missing_count,
                        conversion.sku_missing_count > 0 ? 'warn' : 'neutral',
                        conversion.sku_missing_count > 0 ? warnIcon : undefined,
                    )}
                    {stat(t('wooConvertCategoriesMatched'), conversion.category_matched_count, 'good', goodIcon)}
                    {stat(
                        t('wooConvertCategoriesUnmatched'),
                        conversion.category_unmatched_count,
                        conversion.category_unmatched_count > 0 ? 'warn' : 'neutral',
                        conversion.category_unmatched_count > 0 ? warnIcon : undefined,
                    )}
                    {stat(
                        t('wooConvertBrandsCreated'),
                        conversion.brand_new_count,
                        conversion.brand_new_count > 0 ? 'warn' : 'neutral',
                        conversion.brand_new_count > 0 ? warnIcon : undefined,
                    )}
                </div>

                <div className={styles.stack}>
                    <div className={styles.cardPadded}>
                        <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '1rem' }}>
                            {t('wooConvertDownloadsTitle')}
                        </Title>
                        <div className={styles.actions} style={{ gap: '1rem' }}>
                            <Button
                                id="woo-convert-download-opener"
                                design="Emphasized"
                                icon="download"
                                endIcon="slim-arrow-down"
                                onClick={() => setDownloadMenuOpen((open) => !open)}
                            >
                                {t('wooConvertDownloadButton')}
                            </Button>
                            <Menu
                                opener="woo-convert-download-opener"
                                open={downloadMenuOpen}
                                onClose={() => setDownloadMenuOpen(false)}
                                onItemClick={(e) => {
                                    const suffix = e.detail.item.dataset.suffix ?? 'download';
                                    setDownloadMenuOpen(false);
                                    followLink(`/import-export/woo-convert/${conversion.id}/${suffix}`);
                                }}
                            >
                                <MenuItem text={t('wooConvertDownloadCsv')} data-suffix="download" />
                                <MenuItem text={t('wooConvertDownloadXlsx')} data-suffix="download-xlsx" />
                            </Menu>
                            {conversion.has_unmatched && (
                                <Button icon="download" onClick={() => followLink(`/import-export/woo-convert/${conversion.id}/download-unmatched`)}>
                                    {t('wooConvertDownloadUnmatched')}
                                </Button>
                            )}
                        </div>
                        {conversion.has_unmatched && (
                            <FioriMessageStrip severity="warning" style={{ marginTop: '1rem' }}>
                                {t('wooConvertUnmatchedHelp')}
                            </FioriMessageStrip>
                        )}
                        <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)', margin: '1rem 0' }} />
                        <span className={styles.secondaryText} style={{ display: 'block', marginBottom: '0.75rem' }}>
                            {t('wooConvertNextStep')}
                        </span>
                        <Button design="Transparent" endIcon="navigation-right-arrow" onClick={() => router.visit('/import-export/imports/create')}>
                            {t('wooConvertGoToImport')}
                        </Button>
                    </div>

                    {(conversion.emitted_name || conversion.emitted_description) && (
                        <FioriMessageStrip severity="information" style={{ whiteSpace: 'pre-line' }}>
                            {t('wooConvertLocaleCaveat')}
                        </FioriMessageStrip>
                    )}

                    {conversion.brand_new_names.length > 0 && (
                        <div className={styles.cardPadded}>
                            <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '0.5rem' }}>
                                {t('wooConvertNewBrandsTitle', { count: conversion.brand_new_names_total })}
                            </Title>
                            <span className={styles.secondaryText} style={{ display: 'block', marginBottom: '1rem' }}>
                                {t('wooConvertNewBrandsHelp')}
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                                {conversion.brand_new_names.map((name, i) => (
                                    <span key={i} className={styles.chip}>
                                        {name}
                                    </span>
                                ))}
                            </div>
                            {conversion.brand_new_names_total > conversion.brand_new_names.length && (
                                <span className={styles.smallText} style={{ display: 'block', marginTop: '0.5rem' }}>
                                    {t('wooConvertTypeWarningsTruncated', {
                                        remaining: conversion.brand_new_names_total - conversion.brand_new_names.length,
                                    })}
                                </span>
                            )}
                        </div>
                    )}

                    {conversion.type_warnings.length > 0 && (
                        <div className={styles.cardPadded}>
                            <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '1rem' }}>
                                {t('wooConvertTypeWarningsTitle', { count: conversion.type_warnings_total })}
                            </Title>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                                {conversion.type_warnings.map((warning, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <Icon
                                            name="message-warning"
                                            style={{ width: 16, height: 16, color: 'var(--sapCriticalColor)', marginTop: 2, flexShrink: 0 }}
                                        />
                                        <span className={styles.secondaryText}>{warning}</span>
                                    </div>
                                ))}
                            </div>
                            {conversion.type_warnings_total > conversion.type_warnings.length && (
                                <span className={styles.smallText} style={{ display: 'block', marginTop: '0.5rem' }}>
                                    {t('wooConvertTypeWarningsTruncated', {
                                        remaining: conversion.type_warnings_total - conversion.type_warnings.length,
                                    })}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
