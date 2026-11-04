import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/close-command-field.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/navigation-left-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/notes.js';
import '@ui5/webcomponents-icons/dist/open-command-field.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Button, Icon, Input, Option, ProgressIndicator, Select, Tab, TabContainer, Tag, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './locale-pages.module.css';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
type TranslationStatus = 'not_started' | 'queued' | 'translating' | 'completed' | 'partial' | 'failed';

interface LocaleRow {
    id: number;
    code: string;
    display_name?: string | null;
    enabled: boolean;
    translation_status: TranslationStatus;
    translation_total: number;
    translation_translated: number;
    [key: string]: unknown;
}

function translationPercent(row: LocaleRow): number {
    if (!row.translation_total) {
        return 0;
    }

    return Math.round((row.translation_translated / row.translation_total) * 100);
}

const TRANSLATION_STATUS_TONE: Record<TranslationStatus, FioriTone> = {
    not_started: 'neutral',
    queued: 'information',
    translating: 'information',
    completed: 'success',
    partial: 'warning',
    failed: 'error',
};

const TRANSLATION_STATUS_LABEL_KEY: Record<TranslationStatus, string> = {
    not_started: 'translationNotStarted',
    queued: 'translationQueued',
    translating: 'translationTranslating',
    completed: 'translationCompleted',
    partial: 'translationPartial',
    failed: 'translationFailed',
};

// FioriTone → UI5 ProgressIndicator valueState (progress bar colour).
const TONE_VALUE_STATE: Record<FioriTone, 'None' | 'Positive' | 'Critical' | 'Negative' | 'Information'> = {
    success: 'Positive',
    warning: 'Critical',
    error: 'Negative',
    neutral: 'None',
    information: 'Information',
};

interface GridData {
    data: LocaleRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface TranslationJob {
    id: number;
    entity_type: string;
    reference: string;
    status: JobStatus;
    queued: number;
    completed: number;
    errors: number;
    user: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
}

interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
    translationJobs: TranslationJob[];
}

const ACTIVE_TRANSLATION_STATUSES: TranslationStatus[] = ['queued', 'translating'];
const ACTIVE_JOB_STATUSES: JobStatus[] = ['pending', 'processing'];

const JOB_STATUS_TONE: Record<JobStatus, FioriTone> = {
    pending: 'information',
    processing: 'information',
    completed: 'success',
    failed: 'error',
};

const JOB_STATUS_LABEL_KEY: Record<JobStatus, string> = {
    pending: 'translationQueued',
    processing: 'translationTranslating',
    completed: 'translationCompleted',
    failed: 'translationFailed',
};

export default function LocaleIndex({ gridData, filters, translationJobs }: Props) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('locales'), href: '/system/locales' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('locales.create_locales') || true;
    const canEdit = permissions.includes('locales.edit_locales') || true;
    const canDelete = permissions.includes('locales.delete_locales') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(10);
    const [deleteLocaleId, setDeleteLocaleId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [view, setView] = useState<'locales' | 'jobs'>('locales');
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/system/locales', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    // Auto-refresh while any locale is mid-translation so progress/status
    // updates without the admin having to reload the page manually.
    useEffect(() => {
        const hasActiveTranslation = gridData.data.some((row) => ACTIVE_TRANSLATION_STATUSES.includes(row.translation_status));

        if (!hasActiveTranslation) {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['gridData'] });
        }, 3000);

        return () => clearInterval(interval);
    }, [gridData]);

    // Poll while any translation job is still running so its progress bar and
    // status update live — same 3s cadence as the per-locale translation
    // above. Only the translationJobs prop is refetched, not the whole page.
    useEffect(() => {
        if (view !== 'jobs') {
            return;
        }

        const hasActive = translationJobs.some((job) => ACTIVE_JOB_STATUSES.includes(job.status));
        if (!hasActive) {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['translationJobs'] });
        }, 3000);

        return () => clearInterval(interval);
    }, [view, translationJobs]);

    const startTranslation = (localeId: number) => {
        router.post(`/system/locales/${localeId}/translate`, {}, { preserveScroll: true, preserveState: true });
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    // Column pop-in priority (SAP Fiori responsive table): the locale code
    // identifies the row and row actions stay reachable at every width;
    // display name/status are secondary identity/meta and the translation
    // progress (with its own "start/retry" control) reflows in the middle;
    // the numeric id is the least useful column on a phone.
    const columns: FioriResponsiveColumn<LocaleRow>[] = [
        {
            key: 'id',
            header: t('fields.id'),
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: t('fields.code'),
            priority: 'always',
            render: (row) => <span style={{ fontWeight: 500 }}>{row.code}</span>,
        },
        {
            key: 'display_name',
            header: t('fields.displayName'),
            priority: 'medium',
            render: (row) => row.display_name || '-',
        },
        {
            key: 'status',
            header: t('fields.status'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'neutral'} />,
        },
        {
            key: 'translation',
            header: tSystem('translationColumn'),
            priority: 'high',
            minWidth: 220,
            render: (row) =>
                row.code === 'en' ? (
                    <span className={styles.mutedText}>—</span>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FioriStatus
                                label={`${translationPercent(row)}% · ${tSystem(TRANSLATION_STATUS_LABEL_KEY[row.translation_status])}`}
                                tone={TRANSLATION_STATUS_TONE[row.translation_status]}
                            />
                            <ProgressIndicator
                                value={translationPercent(row)}
                                hideValue
                                valueState={TONE_VALUE_STATE[TRANSLATION_STATUS_TONE[row.translation_status]]}
                                title={`${row.translation_translated} / ${row.translation_total}`}
                                style={{ flex: 1, minWidth: 60 }}
                            />
                        </div>
                        {canEdit && (
                            <Button
                                design="Transparent"
                                icon="translate"
                                disabled={ACTIVE_TRANSLATION_STATUSES.includes(row.translation_status)}
                                onClick={() => startTranslation(row.id)}
                                style={{ alignSelf: 'flex-start' }}
                            >
                                {row.translation_status === 'not_started' ? tSystem('startTranslation') : tSystem('retryTranslation')}
                            </Button>
                        )}
                    </div>
                ),
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="notes"
                            tooltip={tSystem('editTranslations')}
                            accessibleName={tSystem('editTranslations')}
                            onClick={() => router.visit(`/system/locales/${row.id}/translations`)}
                        />
                    )}
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            accessibleName={t('rowActions.edit')}
                            onClick={() => router.visit(`/system/locales/${row.id}/edit`)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            accessibleName={t('rowActions.delete')}
                            onClick={() => setDeleteLocaleId(row.id)}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('localesTitle')} />
            <div className={styles.page}>
                {/* Header Title & Create Button */}
                <div className={styles.header} style={{ marginBottom: '1rem' }}>
                    <Title level="H2" size="H4">
                        {tSystem('localesTitle')}
                    </Title>
                    {canCreate && view === 'locales' && (
                        <Button design="Emphasized" onClick={() => router.visit('/system/locales/create')}>
                            {tSystem('createLocale')}
                        </Button>
                    )}
                </div>

                <TabContainer
                    collapsed
                    onTabSelect={(e) => setView(e.detail.tab.dataset.key === 'jobs' ? 'jobs' : 'locales')}
                    style={{ marginBottom: '1.5rem' }}
                >
                    <Tab data-key="locales" text={tSystem('localesTitle')} selected={view === 'locales'} />
                    <Tab data-key="jobs" text={tSystem('translationJobsTab')} selected={view === 'jobs'} />
                </TabContainer>

                {view === 'jobs' ? (
                    <TranslationJobsPanel jobs={translationJobs} tSystem={tSystem} tGrid={t} />
                ) : (
                    <>
                        {/* Search & Controls Row */}
                        <div className={styles.toolbar}>
                            <div className={styles.toolbarGroup}>
                                <Input
                                    value={search}
                                    onInput={(e) => setSearch(e.target.value ?? '')}
                                    placeholder={tSystem('searchByCode')}
                                    icon={<Icon name="search" />}
                                    style={{ minWidth: 240 }}
                                />
                                <span className={styles.mutedText}>{t('results', { count: gridData.total })}</span>
                            </div>

                            <div className={`${styles.toolbarGroup} ${styles.toolbarGroupEnd}`}>
                                <Button icon="filter">{t('filter')}</Button>

                                <Select
                                    value={String(perPage)}
                                    onChange={(e) => setPerPage(Number(e.detail.selectedOption.value))}
                                    style={{ width: '5rem', minWidth: 0 }}
                                >
                                    <Option value="10">10</Option>
                                    <Option value="25">25</Option>
                                    <Option value="50">50</Option>
                                </Select>

                                <span className={styles.mutedText}>{t('perPage')}</span>

                                <div className={styles.pageBox}>{currentPage}</div>

                                <span className={styles.mutedText}>{t('pageOf', { lastPage })}</span>

                                <div style={{ display: 'flex', gap: '0.125rem' }}>
                                    <Button design="Transparent" icon="close-command-field" disabled={currentPage <= 1} />
                                    <Button design="Transparent" icon="navigation-left-arrow" disabled={currentPage <= 1} />
                                    <Button design="Transparent" icon="navigation-right-arrow" disabled={currentPage >= lastPage} />
                                    <Button design="Transparent" icon="open-command-field" disabled={currentPage >= lastPage} />
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <FioriResponsiveTable
                            columns={columns}
                            rows={gridData.data}
                            getRowKey={(row) => row.id}
                            emptyMessage={tSystem('noLocalesFound')}
                        />
                    </>
                )}
            </div>

            {/* Delete Dialog */}
            <FioriMessageBox
                open={deleteLocaleId !== null}
                onCancel={() => setDeleteLocaleId(null)}
                onConfirm={() => {
                    if (deleteLocaleId !== null) {
                        setDeleting(true);
                        router.delete(`/system/locales/${deleteLocaleId}`, {
                            onSuccess: () => setDeleteLocaleId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }}
                title={t('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tSystem('confirmDeleteLocaleMessage')}
            </FioriMessageBox>
        </AppLayout>
    );
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
    attributes: 'Attributes',
    attribute_options: 'Attribute Options',
    categories: 'Categories',
    category_fields: 'Category Fields',
    brands: 'Brands',
    product_groups: 'Product Groups',
    products: 'Products',
};

function jobDateTime(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString();
}

function TranslationJobsPanel({
    jobs,
    tSystem,
    tGrid,
}: {
    jobs: TranslationJob[];
    tSystem: (key: string) => string;
    tGrid: (key: string) => string;
}) {
    const columns: FioriResponsiveColumn<TranslationJob>[] = [
        {
            key: 'entity_type',
            header: tSystem('tjType'),
            priority: 'always',
            render: (row) => <span style={{ fontWeight: 500 }}>{ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type}</span>,
        },
        {
            key: 'reference',
            header: tSystem('tjReference'),
            priority: 'medium',
            render: (row) => <span className={styles.monoText}>{row.reference}</span>,
        },
        {
            key: 'status',
            header: tGrid('fields.status'),
            priority: 'high',
            render: (row) => <FioriStatus label={tSystem(JOB_STATUS_LABEL_KEY[row.status])} tone={JOB_STATUS_TONE[row.status]} />,
        },
        {
            key: 'progress',
            header: tSystem('tjProgress'),
            priority: 'high',
            minWidth: 160,
            render: (row) => {
                const percent = row.queued > 0 ? Math.round((row.completed / row.queued) * 100) : 100;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={styles.mutedText} style={{ fontSize: 'var(--sapFontSmallSize)' }}>
                                {row.completed} / {row.queued}
                            </span>
                            {row.errors > 0 && <Tag design="Negative">{`${row.errors} ${tSystem('tjErrors')}`}</Tag>}
                        </div>
                        <ProgressIndicator value={percent} hideValue valueState={TONE_VALUE_STATE[JOB_STATUS_TONE[row.status]]} />
                    </div>
                );
            },
        },
        {
            key: 'user',
            header: tSystem('tjBy'),
            priority: 'low',
            render: (row) => <span>{row.user ?? '—'}</span>,
        },
        {
            key: 'started_at',
            header: tSystem('tjStarted'),
            priority: 'low',
            render: (row) => <span className={styles.mutedText}>{jobDateTime(row.started_at)}</span>,
        },
        {
            key: 'completed_at',
            header: tSystem('tjFinished'),
            priority: 'low',
            render: (row) => <span className={styles.mutedText}>{jobDateTime(row.completed_at)}</span>,
        },
    ];

    return <FioriResponsiveTable columns={columns} rows={jobs} getRowKey={(row) => row.id} emptyMessage={tSystem('translationJobsEmpty')} />;
}
