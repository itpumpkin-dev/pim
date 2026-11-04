import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/picture.js';
import { Link, Option, Select, Tag } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { FioriStatus } from '@/lib/fiori-style';

import { MasterListPage, MasterListToolbar, MasterPagination, masterStyles, RowActions, StrongText } from '../master-crud';

interface GroupItem {
    id: number;
    code: string;
    name: string;
    category_name: string | null;
    subcategory_name: string | null;
    thumbnail_url: string | null;
    products_count?: number;
    mapped_platforms?: string[];
    is_active: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
    lazada: 'Lazada',
    shopee: 'Shopee',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};
const PLATFORM_VALUES = ['lazada', 'shopee', 'tiktok', 'woocommerce'] as const;

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    groups: PaginatedData<GroupItem>;
    categories: { id: number; name: string }[];
    filters: { search?: string; category?: number | ''; subcategory?: number | ''; platform?: string };
}

export default function ProductGroupIndex({ groups, categories, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('product_groups.create_product_groups');
    const canEdit = permissions.includes('product_groups.edit_product_groups');
    const canDelete = permissions.includes('product_groups.delete_product_groups');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [category, setCategory] = useState<string>(filters.category ? String(filters.category) : '');
    const [platform, setPlatform] = useState<string>(filters.platform ?? '');
    const [perPage, setPerPage] = useState<number>(groups.per_page ?? 15);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    const query = (extra: Record<string, unknown>) => ({
        search,
        category,
        platform,
        per_page: perPage,
        ...extra,
    });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/product-groups', query({}), { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = groups.current_page ?? 1;
    const lastPage = groups.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/product-groups', query({ page }), { preserveState: true });

    const applyCategory = (value: string) => {
        setCategory(value);
        router.get('/catalog/product-groups', query({ category: value }), { preserveState: true });
    };
    const applyPlatform = (value: string) => {
        setPlatform(value);
        router.get('/catalog/product-groups', query({ platform: value }), { preserveState: true });
    };
    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/product-groups', query({ page: 1, per_page: value }), { preserveState: true });
    };

    const confirmDelete = () => {
        if (deleteId == null) return;
        setDeleting(true);
        router.delete(`/catalog/product-groups/${deleteId}`, {
            onFinish: () => {
                setDeleting(false);
                setDeleteId(null);
            },
        });
    };

    const columns: FioriResponsiveColumn<GroupItem>[] = [
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
            render: (row) => <span className={masterStyles.secondary}>{row.code}</span>,
        },
        {
            key: 'name',
            header: t('productGroupName'),
            priority: 'always',
            render: (row) => <StrongText>{row.name}</StrongText>,
        },
        {
            key: 'category',
            header: t('category'),
            priority: 'high',
            render: (row) => row.category_name || '-',
        },
        {
            key: 'subcategory',
            header: t('subcategory'),
            priority: 'high',
            render: (row) => row.subcategory_name || '-',
        },
        {
            key: 'products_count',
            header: t('productsCount'),
            priority: 'medium',
            align: 'right',
            render: (row) =>
                row.products_count ? (
                    <Link
                        href={`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`}
                        onClick={(e) => {
                            e.preventDefault();
                            router.visit(`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`);
                        }}
                        style={{ fontWeight: 600 }}
                    >
                        {row.products_count}
                    </Link>
                ) : (
                    <span className={masterStyles.dash}>0</span>
                ),
        },
        {
            key: 'mappedPlatforms',
            header: t('mappedPlatforms'),
            priority: 'medium',
            render: (row) =>
                row.mapped_platforms && row.mapped_platforms.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {row.mapped_platforms.map((p) => (
                            <Tag key={p} design="Neutral">
                                {PLATFORM_LABELS[p] ?? p}
                            </Tag>
                        ))}
                    </div>
                ) : (
                    <span style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>{t('notMapped')}</span>
                ),
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
                      render: (row: GroupItem) => (
                          // ปุ่มลบปิดไว้ (เดิม comment out ไว้) — เหลือแค่แก้ไข
                          <RowActions onEdit={canEdit ? () => router.visit(`/catalog/product-groups/${row.id}/edit`) : undefined} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={tNav('productGroups')} />
                <MasterListPage
                    title={tNav('productGroups')}
                    addLabel={t('createProductGroup')}
                    onAdd={canCreate ? () => router.visit('/catalog/product-groups/create') : undefined}
                >
                    <MasterListToolbar
                        resultsLabel={tGrid('results', { count: groups.total })}
                        search={search}
                        onSearchChange={setSearch}
                        searchPlaceholder={t('searchProductGroups')}
                        end={
                            <>
                                <Select
                                    style={{ minWidth: 200 }}
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
                                    style={{ minWidth: 180 }}
                                    value={platform}
                                    accessibleName={t('mappedPlatforms')}
                                    onChange={(e) => applyPlatform(e.detail.selectedOption.value ?? '')}
                                >
                                    <Option value="">{t('allPlatforms')}</Option>
                                    {PLATFORM_VALUES.map((p) => (
                                        <Option key={p} value={p}>
                                            {PLATFORM_LABELS[p]}
                                        </Option>
                                    ))}
                                    <Option value="mapped">{t('mappedToAny')}</Option>
                                    <Option value="unmapped">{t('notMapped')}</Option>
                                </Select>
                            </>
                        }
                    />

                    <FioriResponsiveTable columns={columns} rows={groups.data} getRowKey={(row) => row.id} emptyMessage={t('noProductGroupsFound')} />

                    <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage}>
                        <Select
                            style={{ width: '5rem' }}
                            value={String(perPage)}
                            accessibleName={tGrid('perPage')}
                            onChange={(e) => handlePerPageChange(Number(e.detail.selectedOption.value))}
                        >
                            {[10, 15, 25, 50].map((n) => (
                                <Option key={n} value={String(n)}>
                                    {n}
                                </Option>
                            ))}
                        </Select>
                    </MasterPagination>
                </MasterListPage>

                <FioriMessageBox
                    open={deleteId !== null}
                    onCancel={() => setDeleteId(null)}
                    onConfirm={confirmDelete}
                    title={tGrid('confirmDeletion')}
                    severity="warning"
                    destructive
                    confirmLabel={tGrid('confirmDeletion')}
                    cancelLabel={t('back')}
                    confirmLoading={deleting}
                >
                    {t('confirmDeleteProductGroup')}
                </FioriMessageBox>
            </AppLayout>
        </ImagePreviewProvider>
    );
}
