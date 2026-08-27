import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
// Pilot batch (see resources/js/components/icon.tsx's docblock) — Search/
// Edit/ContentCopy(→copy)/Delete/FilterList(→filter)/FirstPage/LastPage/
// ChevronLeft/ChevronRight/Close now render via SAP-icons instead of MUI's
// icon set. The rest of this file's icons (FactCheckOutlined,
// ViewColumnOutlined, ...) aren't in the pilot's curated name list yet —
// left as MUI icons rather than guessing an unreviewed mapping for them.
import { Icon } from '@/components/icon';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, type FioriColumnPriority, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { ManageColumnsDialog, type ManageColumnOption } from '@/components/manage-columns-dialog';
import {
    ProductFilterDrawer,
    type AttributeFilterRow,
    type ProductFamilyOption,
    type ProductFilters,
} from '@/components/product-filter-drawer';
import {
    FIORI,
    FioriStatus,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableRowSx,
    percentToneFiori,
} from '@/lib/fiori-style';

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
    return nodes.flatMap((node) => [
        { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
        ...flattenCategoryTree(node.children, depth + 1),
    ]);
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

const PRODUCT_COLUMNS_STORAGE_KEY = 'pim.products.columns';
const DEFAULT_SELECTED_COLUMNS = ['sku', 'image', 'name', 'family', 'status', 'type', 'complete', 'translation_complete', 'created_at', 'updated_at'];

/** map key คอลัมน์ที่โชว์ใน UI -> คอลัมน์จริงในตาราง `products` ที่ sort ได้ (อ้างอิงจาก resources/grids/product_grid.yml) */
const SORTABLE_FIELDS: Record<string, string> = {
    sku: 'sku',
    status: 'enabled',
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
        return typeof value === 'string' && value ? (
            <AttributeThumbnail src={value} alt={alt} />
        ) : (
            <Typography variant="body2" color="text.disabled">-</Typography>
        );
    }

    if (attrType === 'gallery') {
        const urls = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        if (urls.length === 0) return <Typography variant="body2" color="text.disabled">-</Typography>;
        return (
            <Stack direction="row" alignItems="center" spacing={0.5}>
                <AttributeThumbnail src={urls[0]} alt={alt} />
                {urls.length > 1 && (
                    <Typography variant="caption" color="text.secondary">+{urls.length - 1}</Typography>
                )}
            </Stack>
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

export default function ProductIndex({ gridConfig, gridData, filters, attributes, families, salesChannels }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
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

    const duplicateProduct = () => {
        if (duplicateProductId === null) return;
        setDuplicating(true);
        router.post(
            `/catalog/products/${duplicateProductId}/duplicate`,
            {},
            {
                onSuccess: () => setDuplicateProductId(null),
                onFinish: () => setDuplicating(false),
            },
        );
    };

    // ปุ่ม "Share" แบบ bulk — publish + push สินค้าที่เลือกทั้งหมดไปยังทุกช่องทางขาย
    // ที่ติ๊กไว้ในคำขอเดียว (ProductController::pushBulk()) ทำงานแบบยิงแล้วไม่รอผล
    // เหมือน translateSelected() ใน missing-translations.tsx: flash message แค่บอก
    // ว่า queue job ไปกี่งาน ส่วนผลจริงว่าแต่ละสินค้า/แต่ละช่องทางสำเร็จหรือพลาด
    // จะไปโชว์ทีหลังที่หน้า Edit ของสินค้านั้นๆ (แผง Sales Channels มี badge สถานะ
    // แบบเรียลไทม์อยู่แล้ว)
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [selectedShopIds, setSelectedShopIds] = useState<number[]>([]);
    const [sharing, setSharing] = useState(false);
    const [deactivating, setDeactivating] = useState(false);

    // 'all' = สินค้าที่เลือกทั้งหมด publish ไปที่ร้านนี้แล้ว, 'some' = publish ไปแค่
    // บางส่วน, 'none' = ยังไม่มีตัวไหน publish เลย คำนวณจาก published_shop_ids
    // (ที่ ProductController::index() แนบมาให้ในแต่ละแถวของ grid) เทียบกับแถวที่
    // เลือกไว้ซึ่งอยู่ในหน้าปัจจุบัน — ไม่ต้องยิง request เพิ่มตอนเปิด dialog เลย
    const shopPublishStatus = (shopId: number): 'all' | 'some' | 'none' => {
        const selectedRows = gridData.data.filter((row) => selectedIds.includes(row.id));
        if (selectedRows.length === 0) return 'none';
        const publishedCount = selectedRows.filter((row) => (row.published_shop_ids ?? []).includes(shopId)).length;
        if (publishedCount === 0) return 'none';
        return publishedCount === selectedRows.length ? 'all' : 'some';
    };

    const openShareDialog = () => {
        const alreadyPublishedEverywhere = salesChannels
            .flatMap((group) => group.shops)
            .filter((shop) => shopPublishStatus(shop.id) === 'all')
            .map((shop) => shop.id);
        setSelectedShopIds(alreadyPublishedEverywhere);
        setShareDialogOpen(true);
    };

    const toggleShareShop = (shopId: number, checked: boolean) => {
        setSelectedShopIds((prev) => (checked ? [...prev, shopId] : prev.filter((id) => id !== shopId)));
    };

    const shareSelectedProducts = () => {
        setSharing(true);
        router.post(
            '/catalog/products/push-bulk',
            { product_ids: selectedIds, shop_ids: selectedShopIds },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setShareDialogOpen(false);
                    setSelectedShopIds([]);
                    setSelectedIds([]);
                },
                onFinish: () => setSharing(false),
            },
        );
    };

    const deactivateSelectedProducts = () => {
        setDeactivating(true);
        router.post(
            '/catalog/products/deactivate-bulk',
            { product_ids: selectedIds, shop_ids: selectedShopIds },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setShareDialogOpen(false);
                    setSelectedShopIds([]);
                    setSelectedIds([]);
                },
                onFinish: () => setDeactivating(false),
            },
        );
    };

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
            { key: 'sku', label: t('sku'), render: (row) => row.sku },
            {
                key: 'image',
                label: t('image'),
                render: (row) => (
                    <ClickableThumbnail
                        src={row.image_url}
                        alt={row.name || row.sku}
                        fallback={<CategoryOutlinedIcon sx={{ color: 'grey.500', fontSize: 20 }} />}
                    />
                ),
            },
            { key: 'name', label: t('name'), render: (row) => (typeof row.name === 'string' && row.name ? row.name : '-') },
            {
                key: 'family',
                label: t('attributeFamily'),
                render: (row) => row.family_code || row.family?.code || t('defaultFamily'),
                headerRender: () => (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>{t('attributeFamily')}</span>
                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                    </Stack>
                ),
            },
            {
                key: 'status',
                label: t('status'),
                render: (row) => (
                    <FioriStatus label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'neutral'} />
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
        ];

        const attributeColumns: ColumnDef[] = attributes
            .filter((attr) => attr.code !== 'name')
            .map((attr) => ({
                key: `attr_${attr.id}`,
                label: attr.label,
                render: (row) => renderAttributeCellValue(attr.type, row.attribute_values?.[attr.id], row.name || row.sku),
            }));

        return [...systemColumns, ...attributeColumns];
    }, [attributes, t, liveStatusOverrides]);

    const columnsCatalog: ManageColumnOption[] = useMemo(
        () => allColumns.map((col) => ({ key: col.key, label: col.label })),
        [allColumns],
    );

    // ตรงกับ ProductRowExporter::columns() (sku, family_code, type, enabled,
    // แล้วตามด้วยทุก attribute ที่ view ได้) — เป็นชุดคอลัมน์จริงของไฟล์ export CSV
    // คนละชุดกับ columnsCatalog ที่ใช้แสดงผลใน grid ด้านบน
    const exportColumnCatalog: ExportColumnOption[] = useMemo(
        () => [
            { code: 'sku', label: t('sku') },
            { code: 'family_code', label: t('attributeFamily') },
            { code: 'type', label: t('type') },
            { code: 'enabled', label: t('status') },
            ...attributes.map((a) => ({ code: a.code, label: a.label || a.code })),
        ],
        [attributes, t],
    );

    const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() => {
        if (typeof window === 'undefined') return DEFAULT_SELECTED_COLUMNS;
        try {
            const stored = window.localStorage.getItem(PRODUCT_COLUMNS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) return parsed;
            }
        } catch {
            // ข้อมูลใน storage เพี้ยน ก็ข้ามไปเลย
        }
        return DEFAULT_SELECTED_COLUMNS;
    });

    useEffect(() => {
        const validKeys = new Set(allColumns.map((c) => c.key));
        const filtered = selectedColumnKeys.filter((k) => validKeys.has(k));
        if (filtered.length !== selectedColumnKeys.length) {
            setSelectedColumnKeys(filtered.length > 0 ? filtered : DEFAULT_SELECTED_COLUMNS);
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
    }, [search]);

    const goToPage = (page: number) => {
        router.get(
            '/catalog/products',
            { search, page, per_page: perPage, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/products',
            { search, page: 1, per_page: value, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
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

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(gridData.data.map((row) => row.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((item) => item !== id));
        }
    };

    const handleQuickExport = () => {
        const params = new URLSearchParams();
        params.set('format', exportFormat.toLowerCase());
        exportColumns.forEach((col) => params.append('columns[]', col.code));
        if (selectedIds.length > 0) {
            // ถ้าเลือกแถวไว้ชัดเจนแล้ว หมายความว่าต้องการแค่สินค้าเหล่านี้เท่านั้น —
            // ตัวเลือก type/category ด้านล่างจะถูก disable ไว้ในสถานะนี้ (ดู prop
            // `disabled` ของ Autocomplete) เลยไม่ต้องส่งไปด้วย ถึงแม้จะยังมีค่าเก่า
            // ค้างอยู่ใน state ก่อนหน้าที่จะเลือกก็ตาม
            selectedIds.forEach((id) => params.append('ids[]', String(id)));
        } else {
            if (search) {
                params.set('search', search);
            }
            exportTypes.forEach((type) => params.append('types[]', type));
            if (exportCategory) {
                params.set('category_id', String(exportCategory.id));
            }
        }
        window.location.href = `/catalog/products/quick-export?${params.toString()}`;
        setQuickExportOpen(false);
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const tableColumns: FioriResponsiveColumn<ProductRow>[] = [
        {
            key: 'select',
            header: (
                <Checkbox
                    indeterminate={selectedIds.length > 0 && selectedIds.length < gridData.data.length}
                    checked={gridData.data.length > 0 && selectedIds.length === gridData.data.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                />
            ),
            priority: 'always',
            width: 48,
            render: (row) => <Checkbox checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(row.id, e.target.checked)} />,
        },
        ...visibleColumns.map((col): FioriResponsiveColumn<ProductRow> => {
            const sortKey = SORTABLE_FIELDS[col.key];
            return {
                key: col.key,
                header: col.headerRender ? (
                    col.headerRender()
                ) : sortKey ? (
                    <TableSortLabel active={sortField === sortKey} direction={sortField === sortKey ? sortDir : 'asc'} onClick={() => handleSort(sortKey)}>
                        {col.label}
                    </TableSortLabel>
                ) : (
                    col.label
                ),
                priority: productColumnPriority(col.key),
                render: col.render,
            };
        }),
        {
            key: 'actions',
            header: t('actions'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canEdit && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/products/${row.id}/edit`)}>
                            <Icon name="edit" fontSize="small" />
                        </IconButton>
                    )}
                    {canCreate && (
                        <Tooltip title={t('duplicateProduct')}>
                            <span>
                                <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDuplicateProductId(row.id)}>
                                    <Icon name="copy" fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}
                    {canEdit && (
                        <Tooltip title={t('checkLiveStatus')}>
                            <span>
                                <IconButton
                                    size="small"
                                    sx={fioriIconButtonSx}
                                    disabled={checkingLiveIds.has(row.id)}
                                    onClick={() => checkLiveStatus(row.id)}
                                >
                                    {checkingLiveIds.has(row.id) ? <CircularProgress size={16} color="inherit" /> : <FactCheckOutlinedIcon fontSize="small" />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}
                    {canDelete && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteProductId(row.id)}>
                            <Icon name="delete" fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
            ),
        },
    ];

    return (
        <ImagePreviewProvider>
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('products')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* หัวหน้า: ชื่อหน้า + ปุ่ม action ต่างๆ */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {t('products')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="text"
                            startIcon={<FileUploadOutlinedIcon />}
                            onClick={() => setQuickExportOpen(true)}
                            sx={fioriGhostSx}
                        >
                            {t('quickExport')}
                        </Button>
                        {canEdit && (
                            <Button
                                variant="outlined"
                                startIcon={<ShareOutlinedIcon />}
                                onClick={openShareDialog}
                                disabled={selectedIds.length === 0}
                                sx={fioriDefaultSx}
                            >
                                {t('share')}
                                {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
                            </Button>
                        )}
                        {canCreate && (
                            <Button
                                variant="contained"
                                onClick={() => router.visit('/catalog/products/create')}
                                sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                            >
                                {t('createProduct')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                <Paper elevation={0} sx={fioriCardSx}>
                    {/* แถบเครื่องมือ (Toolbar) */}
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={2}
                        sx={{ p: 2 }}
                    >
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                            <TextField
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('search')}
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <Icon name="search" sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            {categoryId && (
                                <Chip
                                    label={t('filteredByCategory', { name: categoryName || categoryId })}
                                    size="small"
                                    onDelete={clearCategoryFilter}
                                    variant="outlined"
                                    sx={{ borderColor: FIORI.borderStrong, borderRadius: '6px', color: FIORI.textPrimary }}
                                />
                            )}
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                            <Button
                                variant="outlined"
                                startIcon={<ViewColumnOutlinedIcon />}
                                onClick={() => setColumnsDialogOpen(true)}
                                sx={fioriDefaultSx}
                            >
                                {t('columns')}
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<Icon name="filter" />}
                                onClick={() => setFilterDrawerOpen(true)}
                                sx={fioriDefaultSx}
                            >
                                {t('filter')}
                                {Object.keys(activeFilters).length + activeAttributeFilters.length > 0 &&
                                    ` (${Object.keys(activeFilters).length + activeAttributeFilters.length})`}
                            </Button>

                            <Select
                                value={perPage}
                                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                                size="small"
                                sx={{
                                    bgcolor: FIORI.surface,
                                    borderRadius: '8px',
                                    minWidth: 60,
                                    height: 34,
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: FIORI.border },
                                }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={25}>25</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('perPage')}
                            </Typography>

                            <Paper
                                variant="outlined"
                                sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}
                            >
                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                            </Paper>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('pageOf', { lastPage })}
                            </Typography>

                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                    <Icon name="firstPage" fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                    <Icon name="chevronLeft" fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                    <Icon name="chevronRight" fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <Icon name="lastPage" fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    {/* ตารางข้อมูล */}
                    <FioriResponsiveTable
                        variant="plain"
                        columns={tableColumns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        rowSx={(row) => fioriTableRowSx(selectedIds.includes(row.id))}
                        emptyMessage={t('noProductsFound')}
                    />
                </Paper>
            </Box>

            {/* Dialog สำหรับ Export แบบด่วน */}
            <Dialog open={quickExportOpen} onClose={() => setQuickExportOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                    {t('quickExport')}
                    <IconButton size="small" onClick={() => setQuickExportOpen(false)}>
                        <Icon name="close" fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={2.5}>
                        <Autocomplete
                            disableClearable
                            options={['CSV', 'XLS', 'XLSX'] as const}
                            value={exportFormat}
                            onChange={(_e, value) => value && setExportFormat(value)}
                            renderInput={(params) => (
                                <TextField {...params} label={t('selectOption')} size="small" />
                            )}
                        />
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={exportColumnCatalog}
                            getOptionLabel={(opt) => opt.label}
                            isOptionEqualToValue={(a, b) => a.code === b.code}
                            value={exportColumns}
                            onChange={(_e, value) => setExportColumns(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportColumns')}
                                    placeholder={exportColumns.length === 0 ? t('exportAllColumns') : undefined}
                                    size="small"
                                />
                            )}
                        />
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            disabled={selectedIds.length > 0}
                            options={['simple', 'configurable'] as const}
                            getOptionLabel={(opt) => t(opt)}
                            value={exportTypes}
                            onChange={(_e, value) => setExportTypes(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportProductTypes')}
                                    placeholder={exportTypes.length === 0 ? t('exportAllProductTypes') : undefined}
                                    helperText={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                                    size="small"
                                />
                            )}
                        />
                        <Autocomplete
                            disabled={selectedIds.length > 0}
                            options={exportCategoryOptions}
                            getOptionLabel={(opt) => opt.label}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            value={exportCategory}
                            onChange={(_e, value) => setExportCategory(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportCategory')}
                                    placeholder={!exportCategory ? t('exportAllCategories') : undefined}
                                    helperText={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                                    size="small"
                                />
                            )}
                        />
                    </Stack>
                </DialogContent>
                <Divider />
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setQuickExportOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={handleQuickExport}
                        variant="contained"
                        sx={{ ...fioriEmphasizedSx, px: 3 }}
                    >
                        {t('download')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog Share (push สินค้าไปหลายช่องทางขายพร้อมกัน) */}
            <Dialog open={shareDialogOpen} onClose={() => (sharing || deactivating ? null : setShareDialogOpen(false))} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                    {t('shareToChannels')}
                    <IconButton size="small" onClick={() => setShareDialogOpen(false)} disabled={sharing || deactivating}>
                        <Icon name="close" fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={2.5}>
                        <Typography variant="body2" color="text.secondary">
                            {t('shareSelectChannelsHelp')}
                        </Typography>

                        {salesChannels.length === 0 && (
                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                {t('shareNoChannels')}
                            </Typography>
                        )}

                        {salesChannels.map((group) => (
                            <Box key={group.platform}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                                    {group.platform}
                                </Typography>
                                <Stack spacing={0}>
                                    {group.shops.map((shop) => {
                                        const publishStatus = shopPublishStatus(shop.id);
                                        const checked = selectedShopIds.includes(shop.id);

                                        return (
                                            <Stack key={shop.id} direction="row" alignItems="center" spacing={1}>
                                                <Checkbox
                                                    size="small"
                                                    checked={checked}
                                                    indeterminate={publishStatus === 'some' && !checked}
                                                    onChange={(e) => toggleShareShop(shop.id, e.target.checked)}
                                                    disabled={sharing || deactivating}
                                                />
                                                <Typography variant="body2">{shop.name}</Typography>
                                                {publishStatus === 'all' && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        ({t('alreadyShared')})
                                                    </Typography>
                                                )}
                                                {publishStatus === 'some' && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        ({t('alreadySharedPartial')})
                                                    </Typography>
                                                )}
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </DialogContent>
                <Divider />
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setShareDialogOpen(false)} color="inherit" sx={{ textTransform: 'none' }} disabled={sharing || deactivating}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={deactivateSelectedProducts}
                        variant="outlined"
                        color="error"
                        disabled={selectedShopIds.length === 0 || sharing || deactivating}
                        startIcon={deactivating ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                        {t('deactivate')}
                    </Button>
                    <Button
                        onClick={shareSelectedProducts}
                        variant="contained"
                        disabled={selectedShopIds.length === 0 || sharing || deactivating}
                        startIcon={sharing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ ...fioriEmphasizedSx, px: 3 }}
                    >
                        {t('share')}
                    </Button>
                </DialogActions>
            </Dialog>

            <ManageColumnsDialog
                open={columnsDialogOpen}
                onClose={() => setColumnsDialogOpen(false)}
                columns={columnsCatalog}
                selected={selectedColumnKeys}
                onApply={handleApplyColumns}
            />

            {/* Dialog ยืนยันการลบ */}
            <Dialog open={deleteProductId !== null} onClose={() => setDeleteProductId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteProductId(null)} color="inherit" disabled={deleting}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteProductId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/products/${deleteProductId}`, {
                                    onSuccess: () => setDeleteProductId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog ยืนยันการทำสำเนา (Duplicate) */}
            <Dialog open={duplicateProductId !== null} onClose={() => setDuplicateProductId(null)}>
                <DialogTitle>{t('confirmDuplication')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDuplicateMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDuplicateProductId(null)} color="inherit" disabled={duplicating}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={duplicateProduct}
                        variant="contained"
                        disabled={duplicating}
                        startIcon={duplicating ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={fioriEmphasizedSx}
                    >
                        {t('duplicateProduct')}
                    </Button>
                </DialogActions>
            </Dialog>
            <ProductFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                families={families}
                attributes={attributes}
                filters={activeFilters}
                attributeFilters={activeAttributeFilters}
                onApply={applyFilters}
            />

            <Snackbar
                open={!!liveStatusError}
                autoHideDuration={10000}
                onClose={() => setLiveStatusError(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setLiveStatusError(null)} sx={{ maxWidth: 480 }}>
                    {liveStatusError}
                </Alert>
            </Snackbar>
        </AppLayout>
        </ImagePreviewProvider>
    );
}
