import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import AppLayout from '@/layouts/app-layout';
import { DEFAULT_MASTER_THUMBNAIL } from '@/lib/default-thumbnail';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sort-ascending.js';
import '@ui5/webcomponents-icons/dist/sort-descending.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, Icon, Input, Link, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './category-pages.module.css';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    slug: string | null;
    thumbnail_url: string | null;
    description: string | null;
    parent_id: number | null;
    parent?: CategoryItem | null;
    children_count?: number;
    products_count?: number;
    is_active: boolean;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

interface Props {
    categories: PaginatedData<CategoryItem>;
    /** Set when drilling into a root category to list its subcategories. */
    parentCategory: { id: number; name: string } | null;
    filters: { search?: string; filters?: Record<string, FilterValue>; sort?: string; dir?: string };
    filterColumns: Record<string, GridColumn>;
}

const PER_PAGE_OPTIONS = [10, 15, 25, 50];

/** Clickable column header that toggles sorting on `field` (replaces MUI TableSortLabel). */
function SortHeader({
    field,
    sortField,
    sortDir,
    onSort,
    children,
}: {
    field: string;
    sortField: string;
    sortDir: 'asc' | 'desc';
    onSort: (field: string) => void;
    children: ReactNode;
}) {
    const active = sortField === field;

    return (
        <button
            type="button"
            className={styles.sortHeader}
            aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            onClick={() => onSort(field)}
        >
            {children}
            {active && <Icon name={sortDir === 'asc' ? 'sort-ascending' : 'sort-descending'} className={styles.sortIcon} />}
        </button>
    );
}

export default function CategoryIndex({ categories, parentCategory, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const parentId = parentCategory?.id;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        ...(parentCategory ? [{ title: parentCategory.name, href: `/catalog/categories?parent=${parentCategory.id}` }] : []),
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('categories.create_categories');
    const canEdit = permissions.includes('categories.edit_categories');
    const canDelete = permissions.includes('categories.delete_categories');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 15);
    const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/categories',
                { search, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir, parent: parentId },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = categories.current_page ?? 1;
    const lastPage = categories.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get(
            '/catalog/categories',
            { search, page, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir, parent: parentId },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/categories',
            { search, page: 1, per_page: value, filters: activeFilters, sort: sortField, dir: sortDir, parent: parentId },
            { preserveState: true },
        );
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get(
            '/catalog/categories',
            { search, per_page: perPage, filters: next, sort: sortField, dir: sortDir, parent: parentId },
            { preserveState: true },
        );
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get(
            '/catalog/categories',
            { search, per_page: perPage, filters: activeFilters, sort: field, dir: nextDir, parent: parentId },
            { preserveState: true },
        );
    };

    const sortHeader = (field: string, label: string) => (
        <SortHeader field={field} sortField={sortField} sortDir={sortDir} onSort={handleSort}>
            {label}
        </SortHeader>
    );

    // ลำดับความสำคัญคอลัมน์ตอนย่อจอ (SAP Fiori responsive table): ชื่อหมวดหมู่
    // เป็นตัวบ่งบอกแถวและปุ่ม action ต้องโชว์ตลอดแม้จอมือถือ; ลิงก์จำนวนสินค้ากับ
    // สถานะ active เป็นสิ่งที่ต้องกดดู/สแกนรองลงมา ตามด้วย parent/description/
    // แพลตฟอร์มที่ผูกไว้ ส่วนรูปตัวอย่างที่เป็นแค่ของตกแต่งกับ slug ที่ไม่ค่อยสำคัญ
    // จะถูกซ่อนก่อนเพื่อน (รูปตัวอย่างไม่มีข้อมูลที่คุ้มค่าจะโชว์เป็น label/value เลยตัดออก
    // จากการ pop-in ไปเลย)
    const columns: FioriResponsiveColumn<CategoryItem>[] = [
        {
            key: 'thumbnail',
            header: t('thumbnail'),
            priority: 'low',
            hideInPopin: true,
            render: (row) => <ClickableThumbnail src={row.thumbnail_url || DEFAULT_MASTER_THUMBNAIL} alt={row.name} size={36} radius={1} />,
        },
        {
            key: 'name',
            header: sortHeader('name', t('name')),
            popinText: t('name'),
            priority: 'always',
            render: (row) => <span className={styles.strong}>{row.name}</span>,
        },
        {
            key: 'code',
            header: sortHeader('code', t('code')),
            popinText: t('code'),
            priority: 'medium',
            render: (row) => <span className={styles.muted}>{row.code || '-'}</span>,
        },
        {
            key: 'parent',
            header: t('parent'),
            priority: 'medium',
            render: (row) =>
                row.parent ? (
                    <span className={styles.brandText}>{row.parent.name}</span>
                ) : (
                    <span className={styles.italicDisabled}>{t('rootCategory')}</span>
                ),
        },
        {
            key: 'subcategories',
            header: t('subcategoriesColumn'),
            priority: 'high',
            render: (row) => (
                <Link
                    href={`/catalog/categories?parent=${row.id}`}
                    className={styles.link}
                    onClick={(e) => {
                        e.preventDefault();
                        router.visit(`/catalog/categories?parent=${row.id}`);
                    }}
                >
                    {t('subcategoriesCount', { count: row.children_count ?? 0 })}
                </Link>
            ),
        },
        {
            key: 'description',
            header: sortHeader('description', t('description')),
            popinText: t('description'),
            priority: 'medium',
            render: (row) => <span className={styles.ellipsis}>{row.description || '-'}</span>,
        },
        {
            key: 'slug',
            header: sortHeader('slug', t('slug')),
            popinText: t('slug'),
            priority: 'low',
            render: (row) => <span className={styles.muted}>{row.slug || '-'}</span>,
        },
        {
            key: 'products_count',
            header: sortHeader('products_count', t('productsCount')),
            popinText: t('productsCount'),
            priority: 'high',
            align: 'right',
            render: (row) => {
                if (!row.products_count) return <span className={styles.disabled}>0</span>;
                const href = `/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`;
                return (
                    <Link
                        href={href}
                        className={styles.link}
                        onClick={(e) => {
                            e.preventDefault();
                            router.visit(href);
                        }}
                    >
                        {row.products_count}
                    </Link>
                );
            },
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        ...(canEdit || canDelete
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CategoryItem) => (
                          <div className={styles.rowActions}>
                              {canEdit && (
                                  <Button
                                      design="Transparent"
                                      icon="edit"
                                      tooltip={tGrid('rowActions.edit')}
                                      accessibleName={tGrid('rowActions.edit')}
                                      onClick={() => router.visit(`/catalog/categories/${row.id}/edit`)}
                                  />
                              )}
                              {/* {canDelete && (
                                  <Button design="Transparent" icon="delete" tooltip={tGrid('rowActions.delete')} onClick={() => setDeleteCategoryId(row.id)} />
                              )} */}
                          </div>
                      ),
                  },
              ]
            : []),
    ];

    const filterCount = Object.keys(activeFilters).length;

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={tNav('categories')} />
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerText}>
                            <Title level="H3" wrappingType="Normal">
                                {parentCategory ? t('subcategoriesOf', { name: parentCategory.name }) : tNav('categories')}
                            </Title>
                            <Text className={styles.subtitle}>{tGrid('results', { count: categories.total })}</Text>
                            {parentCategory && (
                                <Link
                                    href="/catalog/categories"
                                    style={{ marginTop: '0.25rem' }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        router.visit('/catalog/categories');
                                    }}
                                >
                                    ← {t('backToCategories')}
                                </Link>
                            )}
                        </div>
                        <div className={styles.actions}>
                            <Button
                                icon="download"
                                onClick={() => {
                                    window.location.href = '/catalog/categories/export';
                                }}
                            >
                                {t('exportCategoriesCsv')}
                            </Button>
                            {canCreate && (
                                <Button
                                    design="Emphasized"
                                    icon="add"
                                    onClick={() =>
                                        router.visit(
                                            parentCategory ? `/catalog/categories/create?parent=${parentCategory.id}` : '/catalog/categories/create',
                                        )
                                    }
                                >
                                    {parentCategory ? t('createSubcategory') : t('createCategory')}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className={styles.toolbar}>
                        <Input
                            className={styles.search}
                            value={search}
                            onInput={(event) => setSearch(event.target.value)}
                            placeholder={t('searchCategories')}
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
                                <Button
                                    design="Transparent"
                                    icon="sys-last-page"
                                    disabled={currentPage >= lastPage}
                                    onClick={() => goToPage(lastPage)}
                                />
                            </div>
                        </div>
                    </div>

                    <FioriResponsiveTable
                        columns={columns}
                        rows={categories.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noCategoriesFound')}
                    />
                </div>

                <FioriMessageBox
                    open={deleteCategoryId !== null}
                    onCancel={() => setDeleteCategoryId(null)}
                    onConfirm={() => {
                        if (deleteCategoryId !== null) {
                            setDeleting(true);
                            router.delete(`/catalog/categories/${deleteCategoryId}`, {
                                onSuccess: () => setDeleteCategoryId(null),
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
                    {t('confirmDeleteCategory')}
                    {(() => {
                        const target = categories.data.find((c) => c.id === deleteCategoryId);
                        if (!target) return null;
                        const childCount = target.children_count ?? 0;
                        const productCount = target.products_count ?? 0;
                        if (childCount === 0 && productCount === 0) return null;

                        return (
                            <div className={styles.warning}>
                                {childCount > 0 && t('deleteCategoryChildWarning', { count: childCount })}
                                {childCount > 0 && productCount > 0 && ' '}
                                {productCount > 0 && t('deleteCategoryProductWarning', { count: productCount })}
                            </div>
                        );
                    })()}
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
        </ImagePreviewProvider>
    );
}
