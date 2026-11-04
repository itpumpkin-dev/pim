import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import PagePagination from '@/components/import-export/page-pagination';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Button, Icon, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface ConversionItem {
    id: number;
    original_filename: string;
    row_count: number;
    sku_missing_count: number;
    category_matched_count: number;
    category_unmatched_count: number;
    has_unmatched: boolean;
    creator: UserSummary | null;
    created_at: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    conversions: PaginatedData<ConversionItem>;
}

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * The two conversion directions (import a WooCommerce export in, prepare an
 * export to send to WooCommerce) live under one "WooCommerce" menu entry but
 * are otherwise unrelated flows. Presenting them as two clearly-labeled
 * cards up front — rather than a generic "New Conversion" button next to an
 * "Export" button — is what keeps users from picking the wrong one.
 */
function DirectionCard({
    icon,
    title,
    description,
    buttonLabel,
    onClick,
}: {
    /** SAP icon name */
    icon: string;
    title: string;
    description: string;
    buttonLabel: string;
    onClick: () => void;
}) {
    return (
        <div className={styles.directionCard} onClick={onClick}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className={styles.iconCircle}>
                    <Icon name={icon} style={{ width: '1.25rem', height: '1.25rem', color: 'var(--sapBrandColor)' }} />
                </div>
                <Title level="H4" size="H5" wrappingType="Normal">
                    {title}
                </Title>
            </div>
            <span className={styles.secondaryText} style={{ flex: 1 }}>
                {description}
            </span>
            <Button
                design="Transparent"
                endIcon="navigation-right-arrow"
                style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
                onClick={(e) => {
                    // the card itself already navigates on click - don't visit twice
                    e.stopPropagation();
                    onClick();
                }}
            >
                {buttonLabel}
            </Button>
        </div>
    );
}

export default function WooConvertIndex({ conversions }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('woo_conversions.create_woo_conversions');

    const userLabel = (user: UserSummary | null) => {
        if (!user) return '-';
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        return fullName || user.username;
    };

    const handlePageChange = (page: number) => {
        router.get('/import-export/woo-convert', { page }, { preserveState: true });
    };

    // Column pop-in priority (SAP Fiori responsive table): the uploaded
    // filename is the identifying column and stays visible at every width;
    // the category-match status is the primary progress indicator so it
    // follows next; row count/user/date are secondary metadata that reflow
    // into the pop-in area first. The numeric ID is the least useful on a
    // phone. The view action stays pinned like the identifying column.
    const columns: FioriResponsiveColumn<ConversionItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'filename',
            header: t('uploadedFile'),
            priority: 'always',
            render: (row) => <span className={styles.mono}>{row.original_filename}</span>,
        },
        {
            key: 'rowCount',
            header: t('wooConvertRowsConverted'),
            priority: 'medium',
            align: 'right',
            render: (row) => row.row_count,
        },
        {
            key: 'categoriesMatched',
            header: t('wooConvertCategoriesMatched'),
            priority: 'high',
            render: (row) => (
                <FioriStatus
                    label={`${row.category_matched_count} / ${row.category_matched_count + row.category_unmatched_count}`}
                    tone={row.has_unmatched ? 'warning' : 'success'}
                />
            ),
        },
        {
            key: 'user',
            header: t('user'),
            priority: 'medium',
            render: (row) => userLabel(row.creator),
        },
        {
            key: 'startedAt',
            header: t('startedAt'),
            priority: 'medium',
            render: (row) => formatLocalDateTime(row.created_at),
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Button
                    design="Transparent"
                    icon="show"
                    tooltip={t('viewJob')}
                    accessibleName={t('viewJob')}
                    onClick={() => router.visit(`/import-export/woo-convert/${row.id}`)}
                />
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertTitle')} />
            <div className={styles.page}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('wooConvertTitle')}
                    </Title>
                    <div className={styles.secondaryText} style={{ marginTop: '0.125rem' }}>
                        {t('wooHubSubtitle')}
                    </div>
                </div>

                <div className={styles.directionRow}>
                    {canCreate && (
                        <DirectionCard
                            icon="upload"
                            title={t('wooImportCardTitle')}
                            description={t('wooImportCardDesc')}
                            buttonLabel={t('wooConvertNewConversion')}
                            onClick={() => router.visit('/import-export/woo-convert/create')}
                        />
                    )}
                    <DirectionCard
                        icon="download"
                        title={t('wooExportTitle')}
                        description={t('wooExportCardDesc')}
                        buttonLabel={t('wooExportCardButton')}
                        onClick={() => router.visit('/import-export/woo-convert/export')}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
                    <Title level="H4" size="H5" wrappingType="Normal">
                        {t('wooConvertHistoryTitle')}
                    </Title>
                    <span className={styles.secondaryText}>{tGrid('results', { count: conversions.total })}</span>
                </div>

                {conversions.data.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Icon name="upload" style={{ width: 40, height: 40, color: 'var(--sapContent_LabelColor)', marginBottom: '0.5rem' }} />
                        <div className={styles.secondaryText} style={{ marginBottom: canCreate ? '1rem' : 0 }}>
                            {t('wooConvertNoneFound')}
                        </div>
                        {canCreate && (
                            <Button design="Emphasized" icon="add" onClick={() => router.visit('/import-export/woo-convert/create')}>
                                {t('wooConvertNewConversion')}
                            </Button>
                        )}
                    </div>
                ) : (
                    <FioriResponsiveTable
                        columns={columns}
                        rows={conversions.data}
                        getRowKey={(row) => row.id}
                        onRowClick={(row) => router.visit(`/import-export/woo-convert/${row.id}`)}
                    />
                )}

                {conversions.last_page > 1 && (
                    <PagePagination count={conversions.last_page} page={conversions.current_page} onChange={handlePageChange} />
                )}
            </div>
        </AppLayout>
    );
}
