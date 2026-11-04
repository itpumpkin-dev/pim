import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { percentToneFiori } from '@/lib/fiori-tokens';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Button, CheckBox, Icon, Input, Option, ProgressIndicator, Select, Tag, Title } from '@ui5/webcomponents-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './missing-translations.module.css';

interface LocaleOption {
    id: number;
    code: string;
    display_name: string | null;
}

interface MissingAttribute {
    id: number;
    code: string;
    name: string | null;
}

interface MissingLocaleEntry {
    locale_id: number;
    attribute_ids: number[];
}

interface MissingRow {
    id: number;
    sku: string;
    family: string | null;
    enabled: boolean;
    missing_locales: MissingLocaleEntry[];
}

interface Props {
    rows: MissingRow[];
    totalProducts: number;
    locales: LocaleOption[];
    attributes: MissingAttribute[];
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 250];

/** percentToneFiori → UI5 value state (Tag design / ProgressIndicator valueState). */
const TONE_STATE = { success: 'Positive', warning: 'Critical', error: 'Negative' } as const;

export default function MissingTranslations({ rows, totalProducts, locales, attributes }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('product_translations.edit_product_translations');
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [translatingId, setTranslatingId] = useState<number | null>(null);
    const [bulkTranslating, setBulkTranslating] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: tNav('missingTranslations'), href: '#' },
    ];

    // แต่ละแถวส่งมาแค่ id (ลด payload) — resolve เป็น locale/attribute เต็มๆ ตรงนี้
    const localesById = useMemo(() => new Map(locales.map((locale) => [locale.id, locale])), [locales]);
    const attributesById = useMemo(() => new Map(attributes.map((attribute) => [attribute.id, attribute])), [attributes]);

    const filteredRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;

        return rows.filter((row) => row.sku.toLowerCase().includes(needle) || (row.family ?? '').toLowerCase().includes(needle));
    }, [rows, search]);

    const pagedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    const pageFrom = filteredRows.length === 0 ? 0 : page * rowsPerPage + 1;
    const pageTo = Math.min(filteredRows.length, (page + 1) * rowsPerPage);
    const lastPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);

    const translatedCount = totalProducts - rows.length;
    const percent = totalProducts > 0 ? Math.round((translatedCount / totalProducts) * 100) : 100;
    const progressState = TONE_STATE[percentToneFiori(percent, { high: 100, mid: 50 })];

    const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
    const someFilteredSelected = filteredRows.some((row) => selectedIds.has(row.id));

    const toggleSelectAll = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                filteredRows.forEach((row) => next.delete(row.id));
            } else {
                filteredRows.forEach((row) => next.add(row.id));
            }
            return next;
        });
    };

    const toggleRow = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const translateOne = (id: number) => {
        setTranslatingId(id);
        router.post(`/catalog/products/${id}/queue-missing-translations`, {}, { preserveScroll: true, onFinish: () => setTranslatingId(null) });
    };

    const translateSelected = () => {
        setBulkTranslating(true);
        router.post(
            '/catalog/product-translations/queue-bulk',
            { product_ids: Array.from(selectedIds) },
            {
                preserveScroll: true,
                onSuccess: () => setSelectedIds(new Set()),
                onFinish: () => setBulkTranslating(false),
            },
        );
    };

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // checkbox เลือกแถวกับ sku เป็นตัวระบุ/action ของแถวเลยปักหมุดไว้ตลอด
    // ส่วน chip ของ locale ที่ขาดคำแปลคือใจความหลักของหน้านี้เลยตามมาติดๆ
    // family/status เป็นข้อมูลรองประกอบ ส่วน action ของแถวก็ปักหมุดไว้เหมือนกัน
    const columns: FioriResponsiveColumn<MissingRow>[] = [
        ...(canEdit
            ? [
                  {
                      key: 'select',
                      header: (
                          <CheckBox
                              // UI5 shows the partial state only while `checked` is also true
                              checked={someFilteredSelected}
                              indeterminate={someFilteredSelected && !allFilteredSelected}
                              onChange={toggleSelectAll}
                          />
                      ),
                      popinText: '',
                      priority: 'always' as const,
                      width: 48,
                      render: (row: MissingRow) => <CheckBox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} />,
                  },
              ]
            : []),
        {
            key: 'sku',
            header: t('missingTranslationsColSku'),
            priority: 'always',
            render: (row) => <span className={styles.sku}>{row.sku}</span>,
        },
        {
            key: 'family',
            header: t('missingTranslationsColFamily'),
            priority: 'medium',
            render: (row) => row.family ?? '-',
        },
        {
            key: 'status',
            header: t('publishing'),
            priority: 'medium',
            render: (row) => (
                <Tag design={row.enabled ? 'Positive' : 'Neutral'} hideStateIcon>
                    {row.enabled ? t('published') : t('unpublished')}
                </Tag>
            ),
        },
        {
            key: 'missing_locales',
            header: t('missingTranslationsColMissingLocales'),
            priority: 'high',
            render: (row) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {row.missing_locales.map(({ locale_id, attribute_ids }) => {
                        const locale = localesById.get(locale_id);
                        const attributeLabels = attribute_ids.map((id) => {
                            const attribute = attributesById.get(id);
                            return attribute ? attribute.name || attribute.code : String(id);
                        });

                        return (
                            <span key={locale_id} title={attributeLabels.join(', ')}>
                                <Tag design="Neutral" hideStateIcon>
                                    {`${locale ? locale.display_name || locale.code : locale_id} (${attribute_ids.length})`}
                                </Tag>
                            </span>
                        );
                    })}
                </div>
            ),
        },
        {
            key: 'actions',
            header: t('missingTranslationsColActions'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="translate"
                            tooltip={t('missingTranslationsTranslateAction')}
                            accessibleName={t('missingTranslationsTranslateAction')}
                            loading={translatingId === row.id}
                            disabled={translatingId === row.id}
                            onClick={() => translateOne(row.id)}
                        />
                    )}
                    <Button
                        design="Transparent"
                        icon="edit"
                        tooltip={t('missingTranslationsEditAction')}
                        accessibleName={t('missingTranslationsEditAction')}
                        onClick={() => router.visit(`/catalog/products/${row.id}/edit`)}
                    />
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('missingTranslationsTitle')} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <Title level="H3" wrappingType="Normal">
                            {t('missingTranslationsTitle')}
                        </Title>
                        <span className={styles.subtitle}>{t('missingTranslationsSubtitle')}</span>
                    </div>
                    {canEdit && (
                        <Button
                            design="Emphasized"
                            icon="translate"
                            loading={bulkTranslating}
                            disabled={selectedIds.size === 0 || bulkTranslating}
                            onClick={translateSelected}
                        >
                            {bulkTranslating
                                ? t('missingTranslationsTranslating')
                                : t('missingTranslationsTranslateSelected', { count: selectedIds.size })}
                        </Button>
                    )}
                </div>

                <div className={`${styles.card} ${styles.summary}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Title level="H5" wrappingType="Normal">
                            {t('missingTranslationsSummary', { missing: rows.length, total: totalProducts })}
                        </Title>
                        <Tag design={progressState} hideStateIcon>
                            {`${translatedCount} / ${totalProducts} · ${percent}%`}
                        </Tag>
                    </div>
                    <ProgressIndicator
                        value={percent}
                        valueState={progressState}
                        hideValue
                        style={{ marginTop: '0.75rem', maxWidth: 320, height: 6 }}
                    />
                </div>

                {rows.length === 0 ? (
                    <div className={`${styles.card} ${styles.allTranslated}`}>{t('missingTranslationsAllTranslated')}</div>
                ) : (
                    <>
                        <Input
                            className={styles.search}
                            value={search}
                            onInput={(e) => {
                                setSearch(e.target.value);
                                setPage(0);
                            }}
                            placeholder={t('missingTranslationsSearch')}
                            icon={<Icon name="search" />}
                        />

                        <div className={`${styles.card} ${styles.tableCard}`}>
                            <FioriResponsiveTable
                                variant="plain"
                                size="small"
                                columns={columns}
                                rows={pagedRows}
                                getRowKey={(row) => row.id}
                                rowClassName={(row: MissingRow) => (selectedIds.has(row.id) ? styles.selectedRow : undefined)}
                                emptyMessage={t('missingTranslationsNoMatches')}
                            />
                            <div className={styles.pager}>
                                <span>{t('missingTranslationsRowsPerPage')}</span>
                                <Select
                                    style={{ width: '6rem' }}
                                    value={String(rowsPerPage)}
                                    accessibleName={t('missingTranslationsRowsPerPage')}
                                    onChange={(e) => {
                                        setRowsPerPage(parseInt(e.detail.selectedOption.value ?? '50', 10));
                                        setPage(0);
                                    }}
                                >
                                    {ROWS_PER_PAGE_OPTIONS.map((size) => (
                                        <Option key={size} value={String(size)}>
                                            {size}
                                        </Option>
                                    ))}
                                </Select>
                                <span>{`${pageFrom}–${pageTo} / ${filteredRows.length}`}</span>
                                <Button
                                    design="Transparent"
                                    icon="slim-arrow-left"
                                    accessibleName="‹"
                                    disabled={page <= 0}
                                    onClick={() => setPage(page - 1)}
                                />
                                <Button
                                    design="Transparent"
                                    icon="slim-arrow-right"
                                    accessibleName="›"
                                    disabled={page >= lastPage}
                                    onClick={() => setPage(page + 1)}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
