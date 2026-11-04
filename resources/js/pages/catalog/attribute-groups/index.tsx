import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue } from '@/components/grid-filter-drawer';
import AppLayout from '@/layouts/app-layout';
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
import { Button, FlexBox, Icon, Input, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
    filterable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface AttributeGroupRow {
    id: number;
    code: string;
    name?: string;
    [key: string]: unknown;
}
interface GridData {
    data: AttributeGroupRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> };
}

export default function AttributeGroupIndex({ gridConfig, gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeGroups'), href: '/catalog/attributeGroups' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_groups.create_attribute_groups');
    const canEdit = permissions.includes('attribute_groups.edit_attribute_groups');
    const canDelete = permissions.includes('attribute_groups.delete_attribute_groups');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteUsage, setDeleteUsage] = useState<{ family_count: number; attribute_count: number; product_value_count: number } | null>(null);
    const [deleteUsageLoading, setDeleteUsageLoading] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributeGroups', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    // ดึงจำนวนตระกูล/attribute/สินค้าที่กำลังใช้ group นี้อยู่มาโชว์ในไดอะล็อก
    // ยืนยันลบก่อนกดยืนยันจริง — family_attributes.attribute_group_id เป็น
    // cascadeOnDelete() และ product_values.attribute_group_id เป็น
    // nullOnDelete() (ดู AttributeGroupController::usage()) ลบไปแล้วทั้งความ
    // ผูกกับทุก family และค่าที่กรอกไว้ในกลุ่มนี้จะกู้คืนไม่ได้
    useEffect(() => {
        if (deleteGroupId === null) {
            setDeleteUsage(null);
            return undefined;
        }

        const controller = new AbortController();
        setDeleteUsageLoading(true);
        setDeleteUsage(null);

        fetch(`/catalog/attributeGroups/${deleteGroupId}/usage`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => setDeleteUsage(json))
            .catch(() => undefined)
            .finally(() => setDeleteUsageLoading(false));

        return () => controller.abort();
    }, [deleteGroupId]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributeGroups', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributeGroups', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/attributeGroups', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): id คือสิ่งที่
    // มีประโยชน์น้อยสุดสำหรับคนดูบนจอแคบ เลยโดนซ่อนก่อนเป็นอันดับแรก ส่วน code
    // ใช้ระบุแถวเลยตรึงไว้ตลอด ส่วน name จะโชว์ตามพื้นที่ที่เหลือ
    // คอลัมน์ actions ก็ตรึงไว้เหมือนคอลัมน์ที่ใช้ระบุแถวเช่นกัน
    const columns: FioriResponsiveColumn<AttributeGroupRow>[] = [
        { key: 'id', header: t('fields.id'), priority: 'low', render: (row) => row.id },
        { key: 'code', header: t('fields.code'), priority: 'always', render: (row) => <Text style={{ fontWeight: 500 }}>{row.code}</Text> },
        { key: 'name', header: t('fields.name'), priority: 'high', render: (row) => row.name || ucfirst(row.code) },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            tooltip={t('edit')}
                            accessibleName={t('edit')}
                            onClick={() => router.visit(`/catalog/attributeGroups/${row.id}/edit`)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            tooltip={t('delete')}
                            accessibleName={t('delete')}
                            onClick={() => setDeleteGroupId(row.id)}
                        />
                    )}
                </FlexBox>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributeGroupsTitle')} />
            <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                {/* หัวข้อและปุ่มสร้างใหม่ */}
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H3">{tCatalog('attributeGroupsTitle')}</Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem', display: 'block' }}>
                            {t('results', { count: gridData.total })}
                        </Text>
                    </div>
                    {canCreate && (
                        <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/attributeGroups/create')}>
                            {tCatalog('createAttributeGroup')}
                        </Button>
                    )}
                </FlexBox>

                {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                <div
                    style={{
                        background: 'var(--sapGroup_ContentBackground)',
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        overflow: 'hidden',
                    }}
                >
                    {/* แถบเครื่องมือ */}
                    <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', padding: '1rem' }}>
                        <Input
                            value={search}
                            onInput={(e) => setSearch(e.target.value)}
                            placeholder={tCatalog('search')}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 240 }}
                        />

                        <FlexBox alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', rowGap: '0.5rem' }}>
                            <Button icon="filter" onClick={() => setFilterDrawerOpen(true)}>
                                {t('filter')}
                                {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                            </Button>

                            <Select
                                value={String(perPage)}
                                onChange={(e) => handlePerPageChange(Number(e.detail.selectedOption.value))}
                                style={{ width: '5rem' }}
                            >
                                <Option value="10">10</Option>
                                <Option value="25">25</Option>
                                <Option value="50">50</Option>
                            </Select>

                            <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('perPage')}</Text>
                            <Text>{currentPage}</Text>
                            <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('pageOf', { lastPage })}</Text>

                            <FlexBox style={{ gap: '0.125rem' }}>
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
                            </FlexBox>
                        </FlexBox>
                    </FlexBox>

                    <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }} />

                    {/* ตาราง */}
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={tCatalog('noAttributeGroupsFound')}
                    />
                </div>
            </div>

            {/* ไดอะล็อกยืนยันการลบ */}
            <FioriMessageBox
                open={deleteGroupId !== null}
                onCancel={() => setDeleteGroupId(null)}
                onConfirm={() => {
                    if (deleteGroupId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributeGroups/${deleteGroupId}`, {
                            onSuccess: () => setDeleteGroupId(null),
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
                confirmDisabled={deleteUsageLoading}
            >
                <FlexBox direction="Column" style={{ gap: '0.5rem' }}>
                    <span>{tCatalog('confirmDeleteAttributeGroupMessage')}</span>
                    {deleteUsageLoading && <span style={{ color: 'var(--sapContent_LabelColor)' }}>{tCatalog('checkingAttributeGroupUsage')}</span>}
                    {!deleteUsageLoading && deleteUsage && (deleteUsage.family_count > 0 || deleteUsage.product_value_count > 0) && (
                        <span style={{ color: 'var(--sapNegativeColor)', fontWeight: 600 }}>
                            {tCatalog('attributeGroupInUseWarning', {
                                families: deleteUsage.family_count,
                                attributes: deleteUsage.attribute_count,
                                products: deleteUsage.product_value_count,
                            })}
                        </span>
                    )}
                    {!deleteUsageLoading && deleteUsage && deleteUsage.family_count === 0 && deleteUsage.product_value_count === 0 && (
                        <span style={{ color: 'var(--sapContent_LabelColor)' }}>{tCatalog('attributeGroupNotInUse')}</span>
                    )}
                </FlexBox>
            </FioriMessageBox>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={gridConfig.columns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}

function ucfirst(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
