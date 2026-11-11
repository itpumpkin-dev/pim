import { NewProductSkuField, useSkuAvailability } from '@/components/catalog/new-product-sku-field';
import { FioriField } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable, type FioriColumnPriority } from '@/components/fiori-responsive-table';
import { FLOATING_STRIP_STYLE } from '@/components/flash-toast';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { ManageColumnsDialog, type ManageColumnOption } from '@/components/manage-columns-dialog';
import { ProductFilterDrawer, type AttributeFilterRow, type ProductFamilyOption, type ProductFilters } from '@/components/product-filter-drawer';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus, percentToneFiori } from '@/lib/fiori-style';
import { isProductStatus, PRODUCT_STATUS_LABEL_KEYS, PRODUCT_STATUS_TONES } from '@/lib/product-status';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/arrow-bottom.js';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/inspection.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import '@ui5/webcomponents-icons/dist/table-column.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import {
    Bar,
    Button,
    ComboBox,
    ComboBoxItem,
    Dialog,
    Icon,
    Input,
    MessageStrip,
    MultiComboBox,
    MultiComboBoxItem,
    Option,
    Select,
    Title,
} from '@ui5/webcomponents-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SortableHeader } from '../master-crud';
import styles from './index.module.css';

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
    default_sort?: { field: string; dir?: 'asc' | 'desc' };
}
interface ProductRow {
    id: number;
    sku: string;
    type: string;
    enabled: boolean;
    status?: string | null;
    parent_id?: number | null;
    parent_sku?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    family_code?: string;
    family?: { id: number; code: string };
    name?: string | null;
    image_url?: string | null;
    completeness?: number | null;
    translation_completeness?: number | null;
    /** ผู้ใช้ของ audit log รายการล่าสุด (ProductController::index()) */
    updated_by_name?: string | null;
    attribute_values?: Record<string, unknown>;
    sales_channels?: { total: number; platforms: Record<string, number> };
    published_shop_ids?: number[];
    [key: string]: unknown;
}
interface GridData {
    data: ProductRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface AttributeMeta {
    id: number;
    code: string;
    label: string;
    type: string;
    is_filterable?: boolean;
}
interface ExportColumnOption {
    code: string;
    label: string;
}
interface ExportCategoryOption {
    id: number;
    label: string;
}
interface CategoryTreeNode {
    id: number;
    code: string;
    name: string;
    children: CategoryTreeNode[];
}
interface SalesChannelGroup {
    platform: string;
    shops: { id: number; name: string }[];
}

function flattenCategoryTree(nodes: CategoryTreeNode[], depth = 0): ExportCategoryOption[] {
    return nodes.flatMap((node) => [{ id: node.id, label: `${'— '.repeat(depth)}${node.name}` }, ...flattenCategoryTree(node.children, depth + 1)]);
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
        filters?: ProductFilters;
        attribute_filters?: AttributeFilterRow[];
        category_id?: string | number;
        category_name?: string;
    };
    attributes: AttributeMeta[];
    families: ProductFamilyOption[];
    salesChannels: SalesChannelGroup[];
}

// v2: เปลี่ยนชุดคอลัมน์ตั้งต้น — bump key ให้ทุกคนได้ชุดใหม่ครั้งหนึ่ง (ชุดเดิมที่เคยเก็บไว้ใน v1 ไม่ถูกใช้แล้ว)
const PRODUCT_COLUMNS_STORAGE_KEY = 'pim.products.columns.v2';
/**
 * คอลัมน์ตั้งต้นตามลำดับที่แสดง — attribute อ้างด้วย "attr:{code}" (id ของ attribute ต่างกันได้
 * ระหว่าง environment) แล้วแปลงเป็น key จริง `attr_{id}` ใน defaultColumnKeys()
 * สถานะ, รหัสสินค้า, ชื่อสินค้า, ประเภทสินค้า, หน่วย, ชื่อหมวดสินค้า, ชื่อหมวดย่อย, กลุ่มสินค้า,
 * ชื่อแบรนด์, แก้ไขล่าสุดเมื่อ, แก้ไขล่าสุดโดย
 */
const DEFAULT_COLUMN_SPEC = [
    'product_status',
    'sku',
    'name',
    'attr:producttype',
    'attr:pbaseunit',
    'attr:pcatname',
    'attr:psubcatname',
    'attr:productgroupname',
    'attr:pbrand',
    'updated_at',
    'updated_by',
];

const PRODUCT_TYPE_OPTIONS = ['simple', 'configurable'] as const;

function defaultColumnKeys(attributes: { id: number; code: string }[]): string[] {
    const idByCode = new Map(attributes.map((a) => [a.code, a.id]));
    return DEFAULT_COLUMN_SPEC.flatMap((spec) => {
        if (!spec.startsWith('attr:')) return [spec];
        const id = idByCode.get(spec.slice(5));
        return id === undefined ? [] : [`attr_${id}`];
    });
}

/** map key คอลัมน์ที่โชว์ใน UI -> คอลัมน์จริงในตาราง `products` ที่ sort ได้ (อ้างอิงจาก resources/grids/product_grid.yml) */
const SORTABLE_FIELDS: Record<string, string> = {
    sku: 'sku',
    status: 'enabled',
    product_status: 'status',
    type: 'type',
    created_at: 'created_at',
    updated_at: 'updated_at',
};

function formatAttributeCellValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function AttributeThumbnail({ src, alt }: { src: string; alt: string }) {
    return <ClickableThumbnail src={src} alt={alt} />;
}

function renderAttributeCellValue(attrType: string, value: unknown, alt: string): ReactNode {
    if (attrType === 'image') {
        return typeof value === 'string' && value ? <AttributeThumbnail src={value} alt={alt} /> : <span className={styles.disabledText}>-</span>;
    }

    if (attrType === 'gallery') {
        const urls = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        if (urls.length === 0) return <span className={styles.disabledText}>-</span>;
        return (
            <span className={styles.inlineRow}>
                <AttributeThumbnail src={urls[0]} alt={alt} />
                {urls.length > 1 && <span className={styles.caption}>+{urls.length - 1}</span>}
            </span>
        );
    }

    return formatAttributeCellValue(value);
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

interface ColumnDef {
    key: string;
    label: string;
    render: (row: ProductRow) => ReactNode;
    headerRender?: () => ReactNode;
    /** ส่งต่อไป FioriResponsiveColumn.minWidth */
    minWidth?: number | string;
}

/**
 * ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table) สำหรับตาราง products
 * เนื่องจากคอลัมน์ในหน้านี้ผู้ใช้ปรับเองได้ (ดูที่ ManageColumnsDialog) ไม่ได้ตายตัว
 * เลยต้องคำนวณ priority จาก key ของคอลัมน์แทนตำแหน่ง:
 * image/name เป็นตัวระบุแถวเลยปักหมุดไว้ตลอด, sku/family เป็นข้อมูลที่มีประโยชน์รองลงมา,
 * status/type/completeness เป็นสถานะรอง ส่วนที่เหลือ (id, วันที่, ความสมบูรณ์ของคำแปล,
 * ช่องทางขาย, คอลัมน์ attribute ต่างๆ) มีประโยชน์น้อยสุดตอนจอแคบเลยซ่อนก่อนเพื่อน
 */
function productColumnPriority(key: string): FioriColumnPriority {
    if (key === 'image' || key === 'name') return 'always';
    if (key === 'sku' || key === 'family') return 'high';
    if (key === 'status' || key === 'type' || key === 'complete') return 'medium';
    return 'low';
}

export default function ProductIndex({ gridConfig, gridData, filters, attributes, families }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');
    const { auth } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog').toUpperCase(), href: '#' },
        { title: tNav('products').toUpperCase(), href: '/catalog/products' },
    ];
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('products.create_products');
    const canEdit = permissions.includes('products.edit_products');
    const canDelete = permissions.includes('products.delete_products');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    // ต้อง confirm ก่อนถึงจะทำงานจริง เหมือนแพทเทิร์น deleteProductId/deleting ด้านบน —
    // เพราะ dialog เป็น modal ทำให้ทำการ duplicate ได้ทีละอันเท่านั้น เลยใช้แค่ id เดี่ยวๆ
    // (ไม่ต้องเป็น Set) ก็พอ
    const [duplicateProductId, setDuplicateProductId] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    // SKU ของสินค้าใหม่ — บังคับกรอกเองและต้องไม่ซ้ำก่อนถึงจะกดทำสำเนาได้
    const [duplicateSku, setDuplicateSku] = useState('');
    const [duplicateSkuError, setDuplicateSkuError] = useState<string | null>(null);
    const duplicateSkuStatus = useSkuAvailability(duplicateSku, duplicateProductId !== null);

    const openDuplicateDialog = (id: number) => {
        setDuplicateSku('');
        setDuplicateSkuError(null);
        setDuplicateProductId(id);
    };

    const duplicateProduct = () => {
        if (duplicateProductId === null) return;
        setDuplicating(true);
        router.post(
            `/catalog/products/${duplicateProductId}/duplicate`,
            { sku: duplicateSku.trim() },
            {
                onSuccess: () => setDuplicateProductId(null),
                onError: (errs) =>
                    setDuplicateSkuError(
                        (errs.sku as string | undefined) ?? (Object.values(errs)[0] as string | undefined) ?? t('duplicateProductError'),
                    ),
                onFinish: () => setDuplicating(false),
            },
        );
    };

    // ปุ่ม "Share" (push / ปิดการขายหลายรายการ) ถูกเอาออกแล้ว — การเขียนขึ้น marketplace
    // ทำได้ที่ step "Push" ของหน้า Map สินค้าทีละสินค้าเท่านั้น (ดู PlatformPushController)

    // "Check Live Status" — ยิงถาม marketplace แต่ละที่ตรงๆ (เรียก API จริงผ่าน
    // ProductController::checkLiveStatus()) ไม่ใช้ router.post() เพราะ endpoint นี้
    // คืนค่าเป็น JSON ธรรมดา ไม่ใช่ Inertia response ใช้แพทเทิร์น Set(...) แบบเดียวกับ
    // duplicatingIds ด้านบน ด้วยเหตุผลเดียวกัน: หลายแถวเช็คสถานะพร้อมกันได้
    // โดยไม่ทับ spinner/disabled ของกันและกัน ผลลัพธ์เก็บไว้ใน map แยกต่างหาก
    // (override) แทนที่จะโหลด grid ใหม่ทั้งหมด เพื่อไม่ให้กระทบส่วนอื่นของลิสต์
    // (ตำแหน่ง scroll, แถวอื่นๆ)
    const [checkingLiveIds, setCheckingLiveIds] = useState<Set<number>>(new Set());
    const [liveStatusOverrides, setLiveStatusOverrides] = useState<Record<number, { total: number; platforms: Record<string, number> }>>({});
    const [liveStatusError, setLiveStatusError] = useState<string | null>(null);
    // เช็คแล้วไม่ live ที่ไหนเลย (total === 0) แถวในตารางจะยังโชว์ป้าย "ยังไม่ Live"
    // เหมือนก่อนกด เลยดูจากภายนอกเหมือนกดแล้วไม่มีอะไรเกิดขึ้น — โชว์ toast ยืนยันว่า
    // เช็คจริงแล้ว แค่ผลลัพธ์คือไม่มีช่องทางไหน live (ตามที่ user ขอ)
    const [liveStatusInfo, setLiveStatusInfo] = useState<string | null>(null);

    const checkLiveStatus = (productId: number) => {
        setCheckingLiveIds((prev) => new Set(prev).add(productId));

        // แอปนี้ไม่มี <meta name="csrf-token">; แต่ VerifyCsrfToken ของ Laravel
        // ก็รับ cookie XSRF-TOKEN ที่มันเซ็ตมาให้ทุก response อยู่แล้ว (ส่งกลับมาเป็น
        // header ด้วย) เลยอ่านจากตรงนั้นแทน
        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${productId}/check-live-status`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken, Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) {
                    setLiveStatusError(body.message ?? t('checkLiveStatusFailed'));
                    return;
                }
                setLiveStatusOverrides((prev) => ({ ...prev, [productId]: body.sales_channels }));
                if (Array.isArray(body.errors) && body.errors.length > 0) {
                    setLiveStatusError(body.errors.join('; '));
                } else if (!body.sales_channels?.total) {
                    setLiveStatusInfo(t('checkLiveStatusNotLive'));
                }
            })
            .catch(() => setLiveStatusError(t('checkLiveStatusFailed')))
            .finally(() =>
                setCheckingLiveIds((prev) => {
                    const next = new Set(prev);
                    next.delete(productId);
                    return next;
                }),
            );
    };
    const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
    const [quickExportOpen, setQuickExportOpen] = useState(false);
    const [exportColumns, setExportColumns] = useState<ExportColumnOption[]>([]);
    const [exportTypes, setExportTypes] = useState<('simple' | 'configurable')[]>([]);
    const [exportCategory, setExportCategory] = useState<ExportCategoryOption | null>(null);
    const [exportCategoryOptions, setExportCategoryOptions] = useState<ExportCategoryOption[]>([]);
    const [activeFilters, setActiveFilters] = useState<ProductFilters>(filters.filters ?? {});
    const [activeAttributeFilters, setActiveAttributeFilters] = useState<AttributeFilterRow[]>(filters.attribute_filters ?? []);
    // มาจากการคลิกตัวเลขจำนวนสินค้าในหน้า Categories list (ดู
    // resources/js/pages/catalog/categories/index.tsx) — ไม่ได้เป็นส่วนหนึ่งของ
    // activeFilters/ProductFilterDrawer เพราะเป็นแค่ลิงก์เข้ามาครั้งเดียว ไม่ใช่
    // filter ที่ผู้ใช้ตั้งเองผ่าน UI ของ drawer
    const [categoryId, setCategoryId] = useState(filters.category_id ? String(filters.category_id) : '');
    const [categoryName] = useState(filters.category_name ?? '');
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    // filters.sort/dir จะมีค่าก็ต่อเมื่อผู้ใช้คลิกที่คอลัมน์เองแล้วเท่านั้น — ฝั่ง backend
    // จะใช้ ORDER BY ค่า default ของตัวเอง (gridConfig.default_sort เช่น
    // "updated_at desc" สำหรับ products) เมื่อไม่ได้ตั้งค่าไว้ทั้งคู่ แต่ไม่ได้ส่งค่านั้น
    // กลับมาใน filters ด้วย เลยต้อง fallback มาใช้ config ตัวเดียวกันตรงนี้ เพื่อให้
    // header ของคอลัมน์ที่ sort อยู่โชว์สถานะ active/ทิศทางที่ถูกต้องตั้งแต่โหลดครั้งแรก
    // แทนที่จะไม่มีคอลัมน์ไหนโชว์ว่ากำลัง sort อยู่เลย
    const requestedSort = typeof filters.sort === 'string' ? filters.sort : '';
    const defaultSort = gridConfig.default_sort;
    const [sortField, setSortField] = useState(requestedSort || defaultSort?.field || '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
        requestedSort ? (filters.dir === 'desc' ? 'desc' : 'asc') : defaultSort?.dir === 'desc' ? 'desc' : 'asc',
    );
    const [exportFormat, setExportFormat] = useState<'CSV' | 'XLS' | 'XLSX'>('CSV');
    const firstRender = useRef(true);

    const allColumns: ColumnDef[] = useMemo(() => {
        const systemColumns: ColumnDef[] = [
            { key: 'id', label: t('id'), render: (row) => row.id },
            { key: 'parent', label: t('parent'), render: (row) => row.parent_sku || '-' },
            {
                key: 'sku',
                label: t('sku'),
                // SKU เช่น "SP50446-10" เคยถูกตัดเป็น 2 บรรทัดที่ขีด — กว้างขั้นต่ำ + ไม่ขึ้นบรรทัดใหม่
                minWidth: 140,
                // ลิงก์ไปหน้าดูสินค้า (catalog/products/{id}) — เป็น <a> จริง จะได้ ctrl/กลางคลิกเปิดแท็บใหม่ได้
                render: (row) => (
                    <Link href={`/catalog/products/${row.id}`} className={styles.skuLink}>
                        {row.sku}
                    </Link>
                ),
            },
            {
                key: 'image',
                label: t('image'),
                render: (row) => (
                    <ClickableThumbnail
                        src={row.image_url}
                        alt={row.name || row.sku}
                        fallback={<Icon name="product" style={{ color: 'var(--sapContent_IconColor)', width: 20, height: 20 }} />}
                    />
                ),
            },
            { key: 'name', label: t('name'), render: (row) => (typeof row.name === 'string' && row.name ? row.name : '-') },
            {
                key: 'family',
                label: t('attributeFamily'),
                render: (row) => row.family_code || row.family?.code || t('defaultFamily'),
                headerRender: () => (
                    <span className={styles.inlineRow}>
                        <span>{t('attributeFamily')}</span>
                        <Icon name="arrow-bottom" style={{ width: 14, height: 14 }} />
                    </span>
                ),
            },
            {
                key: 'status',
                label: t('publishing'),
                render: (row) => <FioriStatus label={row.enabled ? t('published') : t('unpublished')} tone={row.enabled ? 'success' : 'neutral'} />,
            },
            {
                key: 'product_status',
                label: t('productStatus'),
                render: (row) =>
                    isProductStatus(row.status) ? (
                        <FioriStatus label={t(PRODUCT_STATUS_LABEL_KEYS[row.status])} tone={PRODUCT_STATUS_TONES[row.status]} />
                    ) : (
                        '-'
                    ),
            },
            {
                key: 'type',
                label: t('type'),
                render: (row) => (row.type === 'configurable' ? t('configurable') : t('simple')),
            },
            {
                key: 'complete',
                label: t('complete'),
                render: (row) => {
                    const completeness = row.completeness;
                    if (completeness === null || completeness === undefined) {
                        return <FioriStatus label={t('notApplicable')} tone="neutral" />;
                    }
                    return <FioriStatus label={`${completeness}%`} tone={percentToneFiori(completeness)} />;
                },
            },
            {
                key: 'translation_complete',
                label: t('translationComplete'),
                render: (row) => {
                    const completeness = row.translation_completeness;
                    if (completeness === null || completeness === undefined) {
                        return <FioriStatus label={t('notApplicable')} tone="neutral" />;
                    }
                    return <FioriStatus label={`${completeness}%`} tone={percentToneFiori(completeness)} />;
                },
            },
            {
                key: 'sales_channels',
                label: t('salesChannels'),
                render: (row) => {
                    const channels = liveStatusOverrides[row.id] ?? row.sales_channels;
                    const total = channels?.total ?? 0;
                    if (total === 0) {
                        return <FioriStatus label={t('notLive')} tone="neutral" />;
                    }
                    const platforms = channels?.platforms ?? {};
                    const tooltip = Object.entries(platforms)
                        .map(([platform, count]) => `${platform}: ${count}`)
                        .join(', ');
                    return <FioriStatus label={t('liveOnCount', { count: total })} tone="information" title={tooltip} />;
                },
            },
            { key: 'created_at', label: t('createdAt'), render: (row) => formatDateTime(row.created_at) },
            { key: 'updated_at', label: t('updatedAt'), render: (row) => formatDateTime(row.updated_at) },
            { key: 'updated_by', label: t('updatedBy'), render: (row) => row.updated_by_name || '-' },
        ];

        const attributeColumns: ColumnDef[] = attributes
            .filter((attr) => attr.code !== 'name')
            .map((attr) => ({
                key: `attr_${attr.id}`,
                // producttype: ชื่อของ attribute ใน DB เป็น "หมวดหมู่สินค้า" ซึ่งชนกับหมวดหมู่ (pcatname) —
                // ใช้ข้อความเดียวกับหน้าแก้ไขสินค้า ("ประเภทสินค้า") แทน
                label: attr.code === 'producttype' ? t('masterProductTypeFieldLabel') : attr.label,
                render: (row) => renderAttributeCellValue(attr.type, row.attribute_values?.[attr.id], row.name || row.sku),
            }));

        return [...systemColumns, ...attributeColumns];
    }, [attributes, t, liveStatusOverrides]);

    const columnsCatalog: ManageColumnOption[] = useMemo(() => allColumns.map((col) => ({ key: col.key, label: col.label })), [allColumns]);

    // ตรงกับ ProductRowExporter::columns() (sku, type, enabled, status,
    // แล้วตามด้วยทุก attribute ที่ view ได้) — เป็นชุดคอลัมน์จริงของไฟล์ export CSV
    // คนละชุดกับ columnsCatalog ที่ใช้แสดงผลใน grid ด้านบน
    const exportColumnCatalog: ExportColumnOption[] = useMemo(
        () => [
            { code: 'sku', label: t('sku') },
            { code: 'family_code', label: t('attributeFamily') },
            { code: 'type', label: t('type') },
            { code: 'enabled', label: t('publishing') },
            { code: 'status', label: t('productStatus') },
            ...attributes.map((a) => ({ code: a.code, label: a.label || a.code })),
        ],
        [attributes, t],
    );

    const defaultSelectedColumns = useMemo(() => defaultColumnKeys(attributes), [attributes]);
    const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() => {
        if (typeof window === 'undefined') return defaultSelectedColumns;
        try {
            const stored = window.localStorage.getItem(PRODUCT_COLUMNS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) return parsed;
            }
        } catch {
            // ข้อมูลใน storage เพี้ยน ก็ข้ามไปเลย
        }
        return defaultSelectedColumns;
    });

    useEffect(() => {
        const validKeys = new Set(allColumns.map((c) => c.key));
        const filtered = selectedColumnKeys.filter((k) => validKeys.has(k));
        if (filtered.length !== selectedColumnKeys.length) {
            setSelectedColumnKeys(filtered.length > 0 ? filtered : defaultSelectedColumns);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allColumns]);

    useEffect(() => {
        if (!quickExportOpen || exportCategoryOptions.length > 0) {
            return;
        }
        fetch('/catalog/categories/tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryTreeNode[]) => setExportCategoryOptions(flattenCategoryTree(data)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickExportOpen]);

    const handleApplyColumns = (keys: string[]) => {
        setSelectedColumnKeys(keys);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(PRODUCT_COLUMNS_STORAGE_KEY, JSON.stringify(keys));
        }
    };

    const columnsByKey = new Map(allColumns.map((col) => [col.key, col]));
    const visibleColumns = selectedColumnKeys.map((key) => columnsByKey.get(key)).filter((c): c is ColumnDef => !!c);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/products',
                { search, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const goToPage = (page: number) => {
        router.get(
            '/catalog/products',
            {
                search,
                page,
                per_page: perPage,
                sort: sortField,
                dir: sortDir,
                filters: activeFilters,
                attribute_filters: activeAttributeFilters,
                category_id: categoryId,
            },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/products',
            {
                search,
                page: 1,
                per_page: value,
                sort: sortField,
                dir: sortDir,
                filters: activeFilters,
                attribute_filters: activeAttributeFilters,
                category_id: categoryId,
            },
            { preserveState: true },
        );
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get(
            '/catalog/products',
            { search, sort: field, dir: nextDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const applyFilters = (next: ProductFilters, nextAttributeFilters: AttributeFilterRow[]) => {
        setActiveFilters(next);
        setActiveAttributeFilters(nextAttributeFilters);
        router.get(
            '/catalog/products',
            { search, sort: sortField, dir: sortDir, filters: next, attribute_filters: nextAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const clearCategoryFilter = () => {
        setCategoryId('');
        router.get(
            '/catalog/products',
            { search, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: '' },
            { preserveState: true },
        );
    };

    // สร้างไฟล์ในคิว (QuickExportProductsJob) แล้วแจ้งที่กระดิ่งเมื่อพร้อม — เดิมดาวน์โหลดตรงๆ
    // (window.location) ไฟล์ทั้งระบบเกินเวลาของ request ตอนนี้ backend redirect กลับมาพร้อม flash
    // "กำลังเตรียมไฟล์" เลยใช้ router.get ให้อยู่หน้าเดิม ไม่โหลดหน้าใหม่
    const [queuingExport, setQueuingExport] = useState(false);
    const handleQuickExport = () => {
        const params: Record<string, string | string[] | number> = {
            format: exportFormat.toLowerCase(),
            columns: exportColumns.map((col) => col.code),
        };
        if (selectedIds.length > 0) {
            // ถ้าเลือกแถวไว้ชัดเจนแล้ว หมายความว่าต้องการแค่สินค้าเหล่านี้เท่านั้น —
            // ตัวเลือก type/category ด้านล่างจะถูก disable ไว้ในสถานะนี้ (ดู prop
            // `disabled` ของ ComboBox) เลยไม่ต้องส่งไปด้วย
            params.ids = selectedIds.map(String);
        } else {
            if (search) params.search = search;
            params.types = exportTypes;
            if (exportCategory) params.category_id = exportCategory.id;
        }
        setQueuingExport(true);
        router.get('/catalog/products/quick-export', params, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: () => setQuickExportOpen(false),
            onFinish: () => setQueuingExport(false),
        });
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    // Snackbar เดิม (MUI autoHideDuration) — ปิดแถบแจ้งเตือนเองหลัง 10 วิ (error) / 6 วิ (info)
    useEffect(() => {
        if (!liveStatusError) return;
        const timer = setTimeout(() => setLiveStatusError(null), 10000);
        return () => clearTimeout(timer);
    }, [liveStatusError]);

    useEffect(() => {
        if (!liveStatusInfo) return;
        const timer = setTimeout(() => setLiveStatusInfo(null), 6000);
        return () => clearTimeout(timer);
    }, [liveStatusInfo]);

    const activeFilterCount = Object.keys(activeFilters).length + activeAttributeFilters.length;

    const tableColumns: FioriResponsiveColumn<ProductRow>[] = [
        ...visibleColumns.map((col): FioriResponsiveColumn<ProductRow> => {
            const sortKey = SORTABLE_FIELDS[col.key];
            return {
                key: col.key,
                header: col.headerRender ? (
                    col.headerRender()
                ) : sortKey ? (
                    <SortableHeader label={col.label} active={sortField === sortKey} direction={sortDir} onSort={() => handleSort(sortKey)} />
                ) : (
                    col.label
                ),
                popinText: col.label,
                priority: productColumnPriority(col.key),
                minWidth: col.minWidth,
                render: col.render,
            };
        }),
        {
            key: 'actions',
            header: t('actions'),
            priority: 'always',
            align: 'right',
            render: (row: ProductRow) => (
                <div className={styles.rowActions}>
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            tooltip={tGrid('rowActions.edit')}
                            accessibleName={tGrid('rowActions.edit')}
                            onClick={() => router.visit(`/catalog/products/${row.id}/edit`)}
                        />
                    )}
                    {canCreate && (
                        <Button
                            design="Transparent"
                            icon="copy"
                            tooltip={t('duplicateProduct')}
                            accessibleName={t('duplicateProduct')}
                            onClick={() => openDuplicateDialog(row.id)}
                        />
                    )}
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="inspection"
                            tooltip={t('checkLiveStatus')}
                            accessibleName={t('checkLiveStatus')}
                            loading={checkingLiveIds.has(row.id)}
                            loadingDelay={0}
                            disabled={checkingLiveIds.has(row.id)}
                            onClick={() => checkLiveStatus(row.id)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            tooltip={tGrid('rowActions.delete')}
                            accessibleName={tGrid('rowActions.delete')}
                            onClick={() => setDeleteProductId(row.id)}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={t('products')} />
                <div className={styles.page}>
                    {/* หัวหน้า: ชื่อหน้า + ปุ่ม action ต่างๆ */}
                    <div className={styles.header}>
                        <div>
                            <Title level="H2" size="H4">
                                {t('products')}
                            </Title>
                            <span className={styles.results}>{t('results', { count: gridData.total })}</span>
                        </div>

                        <div className={styles.headerActions}>
                            <Button design="Transparent" icon="upload-to-cloud" onClick={() => setQuickExportOpen(true)}>
                                {t('quickExport')}
                            </Button>
                            {canCreate && (
                                <Button design="Emphasized" onClick={() => router.visit('/catalog/products/create')}>
                                    {t('createProduct')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                    <div className={styles.card}>
                        {/* แถบเครื่องมือ (Toolbar) */}
                        <div className={styles.toolbar}>
                            <div className={styles.toolbarStart}>
                                <Input
                                    className={styles.search}
                                    value={search}
                                    onInput={(e) => setSearch(e.target.value)}
                                    placeholder={t('search')}
                                    accessibleName={t('search')}
                                    icon={<Icon name="search" />}
                                />
                                {categoryId && (
                                    <span className={styles.categoryFilter}>
                                        {t('filteredByCategory', { name: categoryName || categoryId })}
                                        <Button
                                            design="Transparent"
                                            icon="decline"
                                            tooltip={t('close')}
                                            accessibleName={t('close')}
                                            onClick={clearCategoryFilter}
                                        />
                                    </span>
                                )}
                            </div>

                            <div className={styles.toolbarEnd}>
                                <Button icon="table-column" onClick={() => setColumnsDialogOpen(true)}>
                                    {t('columns')}
                                </Button>
                                <Button icon="filter" onClick={() => setFilterDrawerOpen(true)}>
                                    {t('filter')}
                                    {activeFilterCount > 0 && ` (${activeFilterCount})`}
                                </Button>

                                <Select
                                    className={styles.perPage}
                                    accessibleName={t('perPage')}
                                    value={String(perPage)}
                                    onChange={(e) => handlePerPageChange(Number(e.detail.selectedOption.value))}
                                >
                                    <Option value="10">10</Option>
                                    <Option value="25">25</Option>
                                    <Option value="50">50</Option>
                                </Select>

                                <span className={styles.muted}>{t('perPage')}</span>

                                <span className={styles.currentPage}>{currentPage}</span>

                                <span className={styles.muted}>{t('pageOf', { lastPage })}</span>

                                <div className={styles.pagerButtons}>
                                    <Button
                                        design="Transparent"
                                        icon="sys-first-page"
                                        accessibleName="«"
                                        disabled={currentPage <= 1}
                                        onClick={() => goToPage(1)}
                                    />
                                    <Button
                                        design="Transparent"
                                        icon="slim-arrow-left"
                                        accessibleName="‹"
                                        disabled={currentPage <= 1}
                                        onClick={() => goToPage(currentPage - 1)}
                                    />
                                    <Button
                                        design="Transparent"
                                        icon="slim-arrow-right"
                                        accessibleName="›"
                                        disabled={currentPage >= lastPage}
                                        onClick={() => goToPage(currentPage + 1)}
                                    />
                                    <Button
                                        design="Transparent"
                                        icon="sys-last-page"
                                        accessibleName="»"
                                        disabled={currentPage >= lastPage}
                                        onClick={() => goToPage(lastPage)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ตารางข้อมูล */}
                        <FioriResponsiveTable
                            variant="plain"
                            columns={tableColumns}
                            rows={gridData.data}
                            getRowKey={(row: ProductRow) => row.id}
                            selectedKeys={selectedIds}
                            onSelectionChange={(keys) => setSelectedIds(keys.map(Number))}
                            emptyMessage={t('noProductsFound')}
                        />
                    </div>
                </div>

                {/* Dialog สำหรับ Export แบบด่วน */}
                <Dialog
                    open={quickExportOpen}
                    className={styles.dialog}
                    onClose={() => setQuickExportOpen(false)}
                    header={
                        <Bar
                            startContent={<Title level="H5">{t('quickExport')}</Title>}
                            endContent={
                                <Button
                                    design="Transparent"
                                    icon="decline"
                                    tooltip={t('close')}
                                    accessibleName={t('close')}
                                    onClick={() => setQuickExportOpen(false)}
                                />
                            }
                        />
                    }
                    footer={
                        <Bar
                            design="Footer"
                            endContent={
                                <>
                                    <Button design="Transparent" onClick={() => setQuickExportOpen(false)}>
                                        {t('cancel')}
                                    </Button>
                                    <Button
                                        design="Emphasized"
                                        onClick={handleQuickExport}
                                        disabled={queuingExport}
                                        loading={queuingExport}
                                        loadingDelay={0}
                                    >
                                        {t('download')}
                                    </Button>
                                </>
                            }
                        />
                    }
                >
                    <div className={styles.dialogBody}>
                        <FioriField label={t('selectOption')} htmlFor="quick-export-format" labelWidth={160} fullWidth>
                            <Select
                                id="quick-export-format"
                                className={styles.fullWidth}
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.detail.selectedOption.value as 'CSV' | 'XLS' | 'XLSX')}
                            >
                                {(['CSV', 'XLS', 'XLSX'] as const).map((format) => (
                                    <Option key={format} value={format}>
                                        {format}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        {/* placeholder โชว์เฉพาะตอนช่องว่าง — hint บอกให้เห็นตลอดว่าไม่เลือก = ส่งออกทุกคอลัมน์ */}
                        <FioriField
                            label={t('exportColumns')}
                            htmlFor="quick-export-columns"
                            labelWidth={160}
                            fullWidth
                            hint={exportColumns.length === 0 ? t('exportAllColumnsHint') : undefined}
                        >
                            <MultiComboBox
                                id="quick-export-columns"
                                className={styles.fullWidth}
                                placeholder={exportColumns.length === 0 ? t('exportAllColumns') : undefined}
                                selectedValues={exportColumns.map((col) => col.code)}
                                onSelectionChange={(e) => {
                                    const codes = new Set(e.detail.items.map((item) => item.value));
                                    setExportColumns(exportColumnCatalog.filter((col) => codes.has(col.code)));
                                }}
                            >
                                {exportColumnCatalog.map((col) => (
                                    <MultiComboBoxItem key={col.code} value={col.code} text={col.label} />
                                ))}
                            </MultiComboBox>
                        </FioriField>

                        <FioriField
                            label={t('exportProductTypes')}
                            htmlFor="quick-export-types"
                            labelWidth={160}
                            fullWidth
                            hint={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                        >
                            <MultiComboBox
                                id="quick-export-types"
                                className={styles.fullWidth}
                                disabled={selectedIds.length > 0}
                                placeholder={exportTypes.length === 0 ? t('exportAllProductTypes') : undefined}
                                selectedValues={exportTypes}
                                onSelectionChange={(e) => {
                                    const values = new Set(e.detail.items.map((item) => item.value));
                                    setExportTypes(PRODUCT_TYPE_OPTIONS.filter((type) => values.has(type)));
                                }}
                            >
                                {PRODUCT_TYPE_OPTIONS.map((type) => (
                                    <MultiComboBoxItem key={type} value={type} text={t(type)} />
                                ))}
                            </MultiComboBox>
                        </FioriField>

                        <FioriField
                            label={t('exportCategory')}
                            htmlFor="quick-export-category"
                            labelWidth={160}
                            fullWidth
                            hint={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                        >
                            <ComboBox
                                id="quick-export-category"
                                className={styles.fullWidth}
                                disabled={selectedIds.length > 0}
                                showClearIcon
                                placeholder={!exportCategory ? t('exportAllCategories') : undefined}
                                selectedValue={exportCategory ? String(exportCategory.id) : undefined}
                                value={exportCategory ? exportCategory.label : ''}
                                onInput={(e) => {
                                    // ช่องถูกล้าง (ปุ่ม clear หรือลบจนว่าง) = ไม่กรองตามหมวดหมู่
                                    if ((e.target.value ?? '') === '' && exportCategory) setExportCategory(null);
                                }}
                                onSelectionChange={(e) => {
                                    const id = e.detail.item?.value;
                                    setExportCategory(id ? (exportCategoryOptions.find((opt) => String(opt.id) === id) ?? null) : null);
                                }}
                            >
                                {exportCategoryOptions.map((opt) => (
                                    <ComboBoxItem key={opt.id} value={String(opt.id)} text={opt.label} />
                                ))}
                            </ComboBox>
                        </FioriField>
                    </div>
                </Dialog>

                <ManageColumnsDialog
                    open={columnsDialogOpen}
                    onClose={() => setColumnsDialogOpen(false)}
                    columns={columnsCatalog}
                    selected={selectedColumnKeys}
                    onApply={handleApplyColumns}
                />

                {/* Dialog ยืนยันการลบ */}
                <FioriMessageBox
                    open={deleteProductId !== null}
                    onCancel={() => setDeleteProductId(null)}
                    onConfirm={() => {
                        if (deleteProductId !== null) {
                            setDeleting(true);
                            router.delete(`/catalog/products/${deleteProductId}`, {
                                onSuccess: () => setDeleteProductId(null),
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
                    {t('confirmDeleteMessage')}
                </FioriMessageBox>

                {/* Dialog ยืนยันการทำสำเนา (Duplicate) */}
                <FioriMessageBox
                    open={duplicateProductId !== null}
                    onCancel={() => setDuplicateProductId(null)}
                    onConfirm={duplicateProduct}
                    title={t('confirmDuplication')}
                    severity="confirm"
                    confirmLabel={t('duplicateProduct')}
                    cancelLabel={t('cancel')}
                    confirmLoading={duplicating}
                    confirmDisabled={duplicateSkuStatus !== 'available'}
                >
                    {t('confirmDuplicateMessage')}
                    <div style={{ marginTop: '1rem' }}>
                        <NewProductSkuField
                            value={duplicateSku}
                            onChange={(value) => {
                                setDuplicateSku(value);
                                setDuplicateSkuError(null);
                            }}
                            status={duplicateSkuStatus}
                            serverError={duplicateSkuError}
                        />
                    </div>
                </FioriMessageBox>
                <ProductFilterDrawer
                    open={filterDrawerOpen}
                    onClose={() => setFilterDrawerOpen(false)}
                    families={families}
                    attributes={attributes}
                    filters={activeFilters}
                    attributeFilters={activeAttributeFilters}
                    onApply={applyFilters}
                />

                {liveStatusError && (
                    <MessageStrip design="Negative" onClose={() => setLiveStatusError(null)} style={FLOATING_STRIP_STYLE}>
                        {liveStatusError}
                    </MessageStrip>
                )}

                {liveStatusInfo && (
                    <MessageStrip design="Information" onClose={() => setLiveStatusInfo(null)} style={FLOATING_STRIP_STYLE}>
                        {liveStatusInfo}
                    </MessageStrip>
                )}
            </AppLayout>
        </ImagePreviewProvider>
    );
}
