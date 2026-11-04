import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue } from '@/components/grid-filter-drawer';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, FlexBox, Icon, Input, Option, Select, Tab, TabContainer, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BulkGenerateDialog } from './bulk-generate-dialog';
import { ManageDefaultsTab } from './manage-defaults-tab';

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
    per_page?: { default?: number; options?: number[] };
}
interface AttributeFamilyRow {
    id: number;
    code: string;
    name?: string;
    [key: string]: unknown;
}
interface GridData {
    data: AttributeFamilyRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface OtherFamily {
    id: number;
    code: string;
    name?: string;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> };
    otherFamilies: OtherFamily[];
}

export default function AttributeFamilyIndex({ gridConfig, gridData, filters, otherFamilies }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeFamilies'), href: '/catalog/attributeFamilies' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_families.create_attribute_families');
    const canEdit = permissions.includes('attribute_families.edit_attribute_families');
    const canDelete = permissions.includes('attribute_families.delete_attribute_families');
    const canAssignDefault = permissions.includes('attribute_families.assign_default_family');
    const canEditProductGroup = permissions.includes('product_groups.edit_product_groups');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? gridConfig.per_page?.default ?? 15);
    const perPageOptions = gridConfig.per_page?.options ?? [10, 15, 25, 50];
    const [deleteFamilyId, setDeleteFamilyId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteUsage, setDeleteUsage] = useState<{ product_group_count: number; product_count: number } | null>(null);
    const [deleteUsageLoading, setDeleteUsageLoading] = useState(false);
    const [duplicateFamilyId, setDuplicateFamilyId] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [bulkGenerateOpen, setBulkGenerateOpen] = useState(false);
    const [tab, setTab] = useState<'list' | 'manage'>('list');
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributeFamilies', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    // ดึงจำนวนกลุ่มสินค้า/สินค้าที่กำลังใช้ตระกูลนี้อยู่มาโชว์ในไดอะล็อกยืนยันลบ
    // ก่อนกดยืนยันจริง — category_attribute_family.family_id เป็น cascadeOnDelete
    // (ดู AttributeFamilyController::usage()) ลบไปแล้วความผูกกับกลุ่มสินค้าเหล่านี้
    // หายทันทีแบบกู้คืนไม่ได้ ผู้ใช้ควรเห็นผลกระทบก่อนกดยืนยัน
    useEffect(() => {
        if (deleteFamilyId === null) {
            setDeleteUsage(null);
            return undefined;
        }

        const controller = new AbortController();
        setDeleteUsageLoading(true);
        setDeleteUsage(null);

        fetch(`/catalog/attributeFamilies/${deleteFamilyId}/usage`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => setDeleteUsage(json))
            .catch(() => undefined)
            .finally(() => setDeleteUsageLoading(false));

        return () => controller.abort();
    }, [deleteFamilyId]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributeFamilies', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributeFamilies', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/attributeFamilies', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): id คือสิ่งที่
    // มีประโยชน์น้อยสุดสำหรับคนดูบนจอแคบ เลยโดนซ่อนก่อนเป็นอันดับแรก ส่วน code
    // ใช้ระบุแถวเลยตรึงไว้ตลอด ส่วน name จะโชว์ตามพื้นที่ที่เหลือ
    // คอลัมน์ actions ก็ตรึงไว้เหมือนคอลัมน์ที่ใช้ระบุแถวเช่นกัน
    const columns: FioriResponsiveColumn<AttributeFamilyRow>[] = [
        { key: 'id', header: t('fields.id'), priority: 'low', render: (row) => row.id },
        { key: 'code', header: t('fields.code'), priority: 'always', render: (row) => <Text style={{ fontWeight: 'bold' }}>{row.code}</Text> },
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
                            tooltip={t('rowActions.edit')}
                            accessibleName={t('rowActions.edit')}
                            onClick={() => router.visit(`/catalog/attributeFamilies/${row.id}/edit`)}
                        />
                    )}
                    {canCreate && (
                        <Button
                            design="Transparent"
                            icon="copy"
                            tooltip={t('rowActions.duplicate')}
                            accessibleName={t('rowActions.duplicate')}
                            onClick={() => setDuplicateFamilyId(row.id)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            tooltip={t('rowActions.delete')}
                            accessibleName={t('rowActions.delete')}
                            onClick={() => setDeleteFamilyId(row.id)}
                        />
                    )}
                </FlexBox>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributeFamiliesTitle')} />
            <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                {/* หัวข้อและปุ่มสร้างใหม่ */}
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H3">{tCatalog('attributeFamiliesTitle')}</Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem', display: 'block' }}>
                            {t('results', { count: gridData.total })}
                        </Text>
                    </div>
                    {canCreate && (
                        <FlexBox wrap="Wrap" style={{ gap: '0.75rem', rowGap: '0.5rem' }}>
                            <Button onClick={() => setBulkGenerateOpen(true)}>{tCatalog('generateFromProductGroups')}</Button>
                            <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/attributeFamilies/create')}>
                                {tCatalog('createAttributeFamily')}
                            </Button>
                        </FlexBox>
                    )}
                </FlexBox>

                <TabContainer
                    collapsed
                    onTabSelect={(event) => setTab(event.detail.tabIndex === 1 ? 'manage' : 'list')}
                    style={{ marginBottom: '1.5rem' }}
                >
                    <Tab text={tCatalog('attributeFamiliesListTab')} selected={tab === 'list'} />
                    <Tab text={tCatalog('attributeFamiliesManageTab')} selected={tab === 'manage'} />
                </TabContainer>

                {tab === 'manage' && (
                    <ManageDefaultsTab
                        families={otherFamilies}
                        canEdit={canEdit}
                        canAssignDefault={canAssignDefault}
                        canEditProductGroup={canEditProductGroup}
                    />
                )}

                {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                {tab === 'list' && (
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
                                onInput={(event) => setSearch(event.target.value)}
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
                                    {perPageOptions.map((n) => (
                                        <Option key={n} value={String(n)}>
                                            {n}
                                        </Option>
                                    ))}
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
                            emptyMessage={tCatalog('noAttributeFamiliesFound')}
                        />
                    </div>
                )}
            </div>

            {/* ไดอะล็อกยืนยันการลบ */}
            <FioriMessageBox
                open={deleteFamilyId !== null}
                onCancel={() => setDeleteFamilyId(null)}
                onConfirm={() => {
                    if (deleteFamilyId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributeFamilies/${deleteFamilyId}`, {
                            onSuccess: () => setDeleteFamilyId(null),
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
                    <Text>{tCatalog('confirmDeleteAttributeFamilyMessage')}</Text>
                    {deleteUsageLoading && <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{tCatalog('checkingAttributeFamilyUsage')}</Text>}
                    {!deleteUsageLoading && deleteUsage && (deleteUsage.product_group_count > 0 || deleteUsage.product_count > 0) && (
                        <Text style={{ color: 'var(--sapNegativeColor)', fontWeight: 'bold' }}>
                            {tCatalog('attributeFamilyInUseWarning', {
                                groups: deleteUsage.product_group_count,
                                products: deleteUsage.product_count,
                            })}
                        </Text>
                    )}
                    {!deleteUsageLoading && deleteUsage && deleteUsage.product_group_count === 0 && deleteUsage.product_count === 0 && (
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{tCatalog('attributeFamilyNotInUse')}</Text>
                    )}
                </FlexBox>
            </FioriMessageBox>

            {/* ไดอะล็อกยืนยันการทำสำเนา */}
            <FioriMessageBox
                open={duplicateFamilyId !== null}
                onCancel={() => setDuplicateFamilyId(null)}
                onConfirm={() => {
                    if (duplicateFamilyId !== null) {
                        setDuplicating(true);
                        router.post(
                            `/catalog/attributeFamilies/${duplicateFamilyId}/duplicate`,
                            {},
                            {
                                onSuccess: () => setDuplicateFamilyId(null),
                                onFinish: () => setDuplicating(false),
                            },
                        );
                    }
                }}
                title={tCatalog('confirmDuplication')}
                severity="confirm"
                confirmLabel={t('rowActions.duplicate')}
                cancelLabel={t('cancel')}
                confirmLoading={duplicating}
            >
                {tCatalog('confirmDuplicateAttributeFamilyMessage')}
            </FioriMessageBox>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={gridConfig.columns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />

            <BulkGenerateDialog open={bulkGenerateOpen} onClose={() => setBulkGenerateOpen(false)} otherFamilies={otherFamilies} />
        </AppLayout>
    );
}

function ucfirst(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
