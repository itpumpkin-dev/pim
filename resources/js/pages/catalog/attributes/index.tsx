import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn as FilterableGridColumn } from '@/components/grid-filter-drawer';
import { useLocale } from '@/hooks/use-locale';
import AppLayout from '@/layouts/app-layout';
import { FioriBusyOverlay, FioriStatus } from '@/lib/fiori-style';
import { encodeQueryParams } from '@/lib/query-string';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/navigation-down-arrow.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, FlexBox, Icon, Input, Menu, MenuItem, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type GridColumn = FilterableGridColumn;
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface GridData {
    data: Array<Record<string, unknown> & { id: number }>;
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> };
}

function cellValue(value: unknown, type: string, t: (key: string) => string) {
    if (type === 'boolean') return <FioriStatus label={value ? t('yes') : t('no')} tone={value ? 'success' : 'neutral'} />;
    if (type === 'datetime' && typeof value === 'string') return new Date(value).toLocaleDateString();
    return String(value ?? '-');
}

export default function AttributeIndex({ gridConfig, gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locale } = useLocale();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attributes.create_attributes');
    const canEdit = permissions.includes('attributes.edit_attributes');
    const canDelete = permissions.includes('attributes.delete_attributes');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [deleteAttributeId, setDeleteAttributeId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    // ตัวนี้ควบคุม Busy State ของตาราง (FioriBusyOverlay) ระหว่างที่มี request
    // ค้นหา/เรียงลำดับ/กรอง/เปลี่ยนหน้า กำลังทำงานอยู่ — เพราะ request พวกนี้เป็น visit
    // แบบ `preserveState` ซึ่ง RouteLoadingSkeleton (loading placeholder เต็มหน้าจอของแอป)
    // จะไม่แสดงให้เห็นโดยตั้งใจ ถ้าไม่มีตัวนี้ ตาราง
    // จะไม่มีอะไรบอกผู้ใช้เลยเวลา request ช้า
    const [isFetching, setIsFetching] = useState(false);
    const visitOptions = { onStart: () => setIsFetching(true), onFinish: () => setIsFetching(false) };
    const firstRender = useRef(true);

    const handleExport = (format: 'csv' | 'xlsx') => {
        // ส่ง locale ไปตรงๆ แบบนี้ดีกว่าปล่อยให้ server เดาเอาจาก session/cookie —
        // ถ้าผู้ใช้คนไหนที่โปรไฟล์ไม่มี UI locale บันทึกไว้ และคุกกี้ `locale` ก็ไม่ได้
        // แนบมากับ request นี้พอดี (เจอเคสแบบนี้จริงๆ) มันจะเงียบๆ ตกไปใช้
        // locale เริ่มต้นของแอปแทน ซึ่งไม่ตรงกับที่ผู้ใช้เห็นอยู่บนจอ
        const params = encodeQueryParams({ format, search, filters: activeFilters, locale });
        window.location.href = `/catalog/attributes/export?${params.join('&')}`;
        setExportOpen(false);
    };

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): คอลัมน์ของ
    // ตารางนี้มาจาก gridConfig ที่ฝั่ง server กำหนดมา ไม่ใช่ลิสต์ตายตัว ดังนั้นลำดับ
    // ความสำคัญเลยอิงตามลำดับคอลัมน์ — คอลัมน์แรกใช้ระบุแถวเลยตรึงไว้เสมอ สองคอลัมน์
    // ถัดมาจะโชว์ตามพื้นที่ที่เหลือ ส่วนที่เหลือจะถูกซ่อนเข้า pop-in ก่อนเป็นอันดับแรก
    // คอลัมน์ actions ก็ตรึงไว้เหมือนคอลัมน์ที่ใช้ระบุแถว เพราะตามแพทเทิร์นของ Fiori
    // ต้องกดถึงได้เสมอเช่นกัน
    type AttributeRow = GridData['data'][number];
    const columns: FioriResponsiveColumn<AttributeRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row) => cellValue(row[key], column.type, t),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {visibleActions.map(([actionKey, action]) => {
                        const icon = action.icon === 'delete' ? 'delete' : 'edit';

                        const handleClick = () => {
                            if (actionKey === 'update') {
                                router.visit(`/catalog/attributes/${row.id}/edit`);
                            } else if (actionKey === 'delete') {
                                setDeleteAttributeId(row.id);
                            }
                        };

                        return (
                            <Button
                                key={actionKey}
                                design="Transparent"
                                icon={icon}
                                tooltip={t(action.label)}
                                accessibleName={t(action.label)}
                                onClick={handleClick}
                            />
                        );
                    })}
                </FlexBox>
            ),
        });
    }

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(
            () =>
                router.get(
                    '/catalog/attributes',
                    { search, per_page: perPage, filters: activeFilters },
                    { preserveState: true, replace: true, ...visitOptions },
                ),
            300,
        );
        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributes', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true, ...visitOptions });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributes', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true, ...visitOptions });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/attributes', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributesTitle')} />
            <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H3">{tCatalog('attributesTitle')}</Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem', display: 'block' }}>
                            {t('results', { count: gridData.total })}
                        </Text>
                    </div>
                    <FlexBox wrap="Wrap" style={{ gap: '0.75rem', rowGap: '0.5rem' }}>
                        {/* {canEdit && (
                            <Button onClick={() => router.visit('/catalog/attributes/woocommerce-mapping')}>
                                {tCatalog('woocommerceContentMapping')}
                            </Button>
                        )} */}
                        <Button id="attributes-export-btn" icon="download" endIcon="navigation-down-arrow" onClick={() => setExportOpen(true)}>
                            {tCatalog('quickExport')}
                        </Button>
                        <Menu opener="attributes-export-btn" open={exportOpen} onClose={() => setExportOpen(false)}>
                            <MenuItem text="CSV" onClick={() => handleExport('csv')} />
                            <MenuItem text="XLSX" onClick={() => handleExport('xlsx')} />
                        </Menu>
                        {canCreate && (
                            <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/attributes/create')}>
                                {tCatalog('createAttribute')}
                            </Button>
                        )}
                    </FlexBox>
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
                            onInput={(event) => setSearch(event.target.value)}
                            placeholder={tCatalog('searchAttributes')}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 280 }}
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

                    <FioriBusyOverlay busy={isFetching}>
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={gridData.data}
                            getRowKey={(row) => row.id}
                            emptyMessage={tCatalog('noAttributesFound')}
                        />
                    </FioriBusyOverlay>
                </div>
            </div>
            <FioriMessageBox
                open={deleteAttributeId !== null}
                onCancel={() => setDeleteAttributeId(null)}
                onConfirm={() => {
                    if (deleteAttributeId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributes/${deleteAttributeId}`, {
                            onSuccess: () => setDeleteAttributeId(null),
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
                {tCatalog('confirmDeleteAttributeMessage')}
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
