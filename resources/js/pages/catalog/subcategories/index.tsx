import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, Icon, Input, Link, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { FioriStatus } from '@/lib/fiori-style';

import styles from '../categories/category-pages.module.css';

interface SubcategoryItem {
    id: number;
    code: string;
    name: string;
    category_name: string | null;
    thumbnail_url: string | null;
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
}

interface Props {
    subcategories: PaginatedData<SubcategoryItem>;
    categories: { id: number; name: string }[];
    filters: { search?: string; category?: number | '' };
}

const PER_PAGE_OPTIONS = [10, 15, 25, 50];

export default function SubcategoryIndex({ subcategories, categories, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('subcategories.create_subcategories');
    const canEdit = permissions.includes('subcategories.edit_subcategories');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('subCategories'), href: '/catalog/subcategories' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [category, setCategory] = useState<string>(filters.category ? String(filters.category) : '');
    const [perPage, setPerPage] = useState<number>(subcategories.per_page ?? 15);
    const firstRender = useRef(true);

    const query = (extra: Record<string, unknown>) => ({ search, category, per_page: perPage, ...extra });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/subcategories', query({}), { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = subcategories.current_page ?? 1;
    const lastPage = subcategories.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/subcategories', query({ page }), { preserveState: true });

    const applyCategory = (value: string) => {
        setCategory(value);
        router.get('/catalog/subcategories', query({ category: value }), { preserveState: true });
    };
    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/subcategories', query({ page: 1, per_page: value }), { preserveState: true });
    };

    const columns: FioriResponsiveColumn<SubcategoryItem>[] = [
        {
            key: 'thumbnail',
            header: t('thumbnail'),
            priority: 'low',
            hideInPopin: true,
            render: (row) => <ClickableThumbnail src={row.thumbnail_url} alt={row.name} size={36} radius={1} />,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => <span className={styles.muted}>{row.code}</span>,
        },
        {
            key: 'name',
            header: t('subcategoryName'),
            priority: 'always',
            render: (row) => <span className={styles.strong}>{row.name}</span>,
        },
        {
            key: 'category',
            header: t('category'),
            priority: 'high',
            render: (row) => <span>{row.category_name || '-'}</span>,
        },
        {
            key: 'groups_count',
            header: tNav('productGroups'),
            priority: 'medium',
            align: 'right',
            render: (row) =>
                row.children_count ? (
                    <Link
                        href={`/catalog/product-groups?subcategory=${row.id}`}
                        className={styles.link}
                        onClick={(e) => {
                            e.preventDefault();
                            router.visit(`/catalog/product-groups?subcategory=${row.id}`);
                        }}
                    >
                        {row.children_count}
                    </Link>
                ) : (
                    <span className={styles.disabled}>0</span>
                ),
        },
        {
            key: 'products_count',
            header: t('productsCount'),
            priority: 'medium',
            align: 'right',
            render: (row) =>
                row.products_count ? <span className={styles.strong}>{row.products_count}</span> : <span className={styles.disabled}>0</span>,
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: SubcategoryItem) => (
                          <div className={styles.rowActions}>
                              <Button
                                  design="Transparent"
                                  icon="edit"
                                  tooltip={tGrid('rowActions.edit')}
                                  accessibleName={tGrid('rowActions.edit')}
                                  onClick={() => router.visit(`/catalog/subcategories/${row.id}/edit`)}
                              />
                          </div>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={tNav('subCategories')} />
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerText}>
                            <Title level="H3" wrappingType="Normal">
                                {tNav('subCategories')}
                            </Title>
                            <Text className={styles.subtitle}>{tGrid('results', { count: subcategories.total })}</Text>
                        </div>
                        {canCreate && (
                            <div className={styles.actions}>
                                <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/subcategories/create')}>
                                    {t('createSubcategory')}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className={styles.toolbar}>
                        <Input
                            className={styles.search}
                            value={search}
                            onInput={(e) => setSearch(e.target.value)}
                            placeholder={t('searchSubcategories')}
                            icon={<Icon name="search" />}
                            showClearIcon
                        />
                        <div className={styles.toolbarEnd}>
                            <Select
                                className={styles.categorySelect}
                                value={category}
                                accessibleName={t('category')}
                                onChange={(e) => applyCategory(e.detail.selectedOption.value ?? '')}
                            >
                                <Option value="">{t('allCategories')}</Option>
                                {categories.map((c) => (
                                    <Option key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </Option>
                                ))}
                            </Select>
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
                        rows={subcategories.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noSubcategoriesFound')}
                    />
                </div>
            </AppLayout>
        </ImagePreviewProvider>
    );
}
