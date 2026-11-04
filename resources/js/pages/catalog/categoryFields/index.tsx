import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import { useLocale } from '@/hooks/use-locale';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, Icon, Input, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '../categories/category-pages.module.css';

interface CategoryFieldItem {
    id: number;
    code: string;
    type: string;
    labels: Record<string, string>;
    is_required: boolean;
    status: boolean;
    position: number;
    display_section: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    fields: PaginatedData<CategoryFieldItem>;
    filters: { search?: string; filters?: Record<string, FilterValue> };
    filterColumns: Record<string, GridColumn>;
}

const PER_PAGE_OPTIONS = [10, 15, 25, 50];

export default function CategoryFieldIndex({ fields, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');
    const { locales, locale: currentLocaleCode } = useLocale();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categoryFields'), href: '/catalog/categoryFields' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('category_fields.create_category_fields');
    const canEdit = permissions.includes('category_fields.edit_category_fields');
    const canDelete = permissions.includes('category_fields.delete_category_fields');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(fields.per_page ?? 15);
    const [deleteFieldId, setDeleteFieldId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categoryFields', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = fields.current_page ?? 1;
    const lastPage = fields.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/categoryFields', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categoryFields', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/categoryFields', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    const getFieldLabel = (item: CategoryFieldItem) => {
        const activeLocale = locales.find((l) => l.code === currentLocaleCode);
        if (activeLocale && item.labels[activeLocale.id]) {
            return item.labels[activeLocale.id];
        }
        // ถ้าไม่มี ให้ fallback ไปใช้ label แรกที่เจอ
        return Object.values(item.labels)[0] || item.code;
    };

    // ลำดับความสำคัญคอลัมน์ตอนย่อจอ (SAP Fiori responsive table): label ของฟิลด์
    // เป็นตัวบ่งบอกแถวและปุ่ม action ต้องโชว์ตลอดแม้จอมือถือ; Status เป็นสิ่งที่
    // ต้องสแกนดูรองลงมา ตามด้วย code/type ส่วน id/required/position จะถูกซ่อนก่อนเพื่อน
    // เพราะเป็นคอลัมน์ที่มีประโยชน์น้อยสุดตอนดูผ่านๆ
    const columns: FioriResponsiveColumn<CategoryFieldItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => row.code,
        },
        {
            key: 'label',
            header: 'Label',
            priority: 'always',
            render: (row) => <span className={styles.strong}>{getFieldLabel(row)}</span>,
        },
        {
            key: 'type',
            header: t('type'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.type} tone="information" />,
        },
        {
            key: 'required',
            header: 'Required',
            priority: 'low',
            render: (row) => <FioriStatus label={row.is_required ? 'Yes' : 'No'} tone={row.is_required ? 'information' : 'neutral'} />,
        },
        {
            key: 'status',
            header: 'Status',
            priority: 'high',
            render: (row) => <FioriStatus label={row.status ? 'Active' : 'Inactive'} tone={row.status ? 'success' : 'neutral'} />,
        },
        {
            key: 'position',
            header: 'Position',
            priority: 'low',
            render: (row) => row.position,
        },
        ...(canEdit || canDelete
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CategoryFieldItem) => (
                          <div className={styles.rowActions}>
                              {canEdit && (
                                  <Button
                                      design="Transparent"
                                      icon="edit"
                                      tooltip={tGrid('rowActions.edit')}
                                      accessibleName={tGrid('rowActions.edit')}
                                      onClick={() => router.visit(`/catalog/categoryFields/${row.id}/edit`)}
                                  />
                              )}
                              {canDelete && (
                                  <Button
                                      design="Transparent"
                                      icon="delete"
                                      tooltip={tGrid('rowActions.delete')}
                                      accessibleName={tGrid('rowActions.delete')}
                                      onClick={() => setDeleteFieldId(row.id)}
                                  />
                              )}
                          </div>
                      ),
                  },
              ]
            : []),
    ];

    const filterCount = Object.keys(activeFilters).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categoryFields')} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <div className={styles.headerText}>
                        <Title level="H3" wrappingType="Normal">
                            {tNav('categoryFields')}
                        </Title>
                        <Text className={styles.subtitle}>{tGrid('results', { count: fields.total })}</Text>
                    </div>
                    {canCreate && (
                        <div className={styles.actions}>
                            <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/categoryFields/create')}>
                                Create Field
                            </Button>
                        </div>
                    )}
                </div>

                <div className={styles.toolbar}>
                    <Input
                        className={styles.search}
                        value={search}
                        onInput={(event) => setSearch(event.target.value)}
                        placeholder="Search fields..."
                        icon={<Icon name="search" />}
                        showClearIcon
                    />

                    <div className={styles.toolbarEnd}>
                        <Button icon="filter" onClick={() => setFilterDrawerOpen(true)}>
                            {tGrid('filter')}
                            {filterCount > 0 && ` (${filterCount})`}
                        </Button>
                        <Select
                            className={styles.perPage}
                            value={String(perPage)}
                            accessibleName={tGrid('perPage')}
                            onChange={(e) => handlePerPageChange(Number(e.detail.selectedOption.value))}
                        >
                            {PER_PAGE_OPTIONS.map((n) => (
                                <Option key={n} value={String(n)}>
                                    {n}
                                </Option>
                            ))}
                        </Select>
                        <Text className={styles.subtitle}>{tGrid('perPage')}</Text>

                        <span className={styles.pageBox}>{currentPage}</span>

                        <Text className={styles.subtitle}>{tGrid('pageOf', { lastPage })}</Text>

                        <div className={styles.pager}>
                            <Button design="Transparent" icon="sys-first-page" disabled={currentPage <= 1} onClick={() => goToPage(1)} />
                            <Button
                                design="Transparent"
                                icon="slim-arrow-left"
                                disabled={currentPage <= 1}
                                onClick={() => goToPage(currentPage - 1)}
                            />
                            <Button
                                design="Transparent"
                                icon="slim-arrow-right"
                                disabled={currentPage >= lastPage}
                                onClick={() => goToPage(currentPage + 1)}
                            />
                            <Button design="Transparent" icon="sys-last-page" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)} />
                        </div>
                    </div>
                </div>

                <FioriResponsiveTable columns={columns} rows={fields.data} getRowKey={(row) => row.id} emptyMessage="No category fields found." />
            </div>

            <FioriMessageBox
                open={deleteFieldId !== null}
                onCancel={() => setDeleteFieldId(null)}
                onConfirm={() => {
                    if (deleteFieldId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/categoryFields/${deleteFieldId}`, {
                            onSuccess: () => setDeleteFieldId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }}
                title={tGrid('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={tGrid('delete')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={deleting}
            >
                Are you sure you want to delete this category field?
            </FioriMessageBox>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={filterColumns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}
