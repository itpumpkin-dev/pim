import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { MarketplaceCategoryPicker } from '@/components/marketplace-category-picker';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import { TimelinePanel } from '@/components/timeline-panel';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import {
    FIORI,
    FioriStatus,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTabsSx,
    fioriTableRowSx,
} from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ProductFilter = 'all' | 'mapped' | 'unmapped';

interface MasterCategoryInfo {
    id: number;
    name: string;
    path: string;
    woocommerce_category_id: number | null;
}

interface WooCommerceCategoryInfo {
    id: number;
    name: string;
    path: string;
}

interface ProductRow {
    id: number;
    sku: string;
    name: string;
    variants_count: number;
    master_category: MasterCategoryInfo | null;
    woocommerce_category: WooCommerceCategoryInfo | null;
    category_mapped: boolean;
    // ไม่มีความหมายแบบ per-category สำหรับ WooCommerce (attribute เป็น global
    // ทั้งหมด ไม่ผูก category — ดู WooCommerceAttributeMappingController's
    // docblock) เลย null เสมอ ต่างจาก Lazada/Shopee/TikTok
    attribute_stats: null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    products: PaginatedData<ProductRow>;
    stats: { total: number; mapped: number; unmapped: number };
    filters: { filter: ProductFilter; search: string; per_page: number };
}

interface WooCommerceAttributeRow {
    id: number;
    name: string;
    mapped: { id: number; name: string } | null;
}

// ฟิลด์ payload ตายตัวของ WooCommerce เอง (ไม่ผูกกับหมวดหมู่ไหนเลย) — ตรงกับ
// WooCommerceAttributeMappingController::STRUCTURED_TARGET_FIELDS ฝั่ง
// backend (มี `image`/`short_description` เพิ่มจาก Lazada/Shopee/TikTok
// เพราะ schema จริงของ WooCommerce ต่างกัน)
type PayloadTargetField =
    | 'description'
    | 'short_description'
    | 'name'
    | 'price'
    | 'image'
    | 'qty'
    | 'weight'
    | 'length'
    | 'width'
    | 'height'
    | 'video';

const PAYLOAD_FIELD_LABELS: Record<PayloadTargetField, string> = {
    description: 'รายละเอียดสินค้า (Description)',
    short_description: 'รายละเอียดย่อ (Short Description)',
    name: 'ชื่อสินค้า (Product Name)',
    price: 'ราคา (Price)',
    image: 'รูปภาพสินค้า (Image)',
    qty: 'จำนวนสต็อก (Quantity)',
    weight: 'น้ำหนักพัสดุ (Package Weight)',
    length: 'ความยาวพัสดุ (Package Length)',
    width: 'ความกว้างพัสดุ (Package Width)',
    height: 'ความสูงพัสดุ (Package Height)',
    video: 'วิดีโอสินค้า (Product Video)',
};

interface PayloadFieldRow {
    target_field: PayloadTargetField;
    // true เฉพาะ description/short_description — 2 ฟิลด์นี้เท่านั้นที่รับ PIM
    // attribute ได้หลายตัวพร้อมกัน (WooCommerceProductSyncService::
    // buildContentFields() ประกอบทุกตัวที่แมปไว้เป็น section ต่อกัน) ฟิลด์อื่น
    // ใช้แค่ตัวแรกเสมอ (resolveMappedField()) — ดู backend's
    // MULTI_VALUE_TARGET_FIELDS docblock
    multi: boolean;
    mapped: { id: number; name: string }[];
}

// ความสูงของแถบแท็บ anchor ที่ sticky อยู่บนสุดของ scroll body (บวก slack เล็กน้อย)
// ใช้เป็นทั้ง scroll-margin-top ของแต่ละ section และ threshold ของ scroll-spy —
// mirror ของ shopee-products.tsx เป๊ะ
const SECTION_SCROLL_MARGIN = 72;

export default function WooCommerceProductsMapping({ products, stats, filters }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ProductFilter>(filters.filter ?? 'all');
    const [perPage, setPerPage] = useState<number>(products.per_page ?? 25);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const firstRender = useRef(true);

    // Active product being viewed as an Object Page (null = list view)
    const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);

    // Category mapping section state
    const [selectedWooCatId, setSelectedWooCatId] = useState<number | null>(null);
    const [savingCatMap, setSavingCatMap] = useState(false);
    // "Sync Categories" — ดึงต้นไม้หมวดหมู่ทั้งหมดจาก WooCommerce จริงมา refresh
    // แคช woocommerce_categories (คนละอย่างกับ saveCategoryMapping ด้านล่าง)
    const [syncingCategoryTree, setSyncingCategoryTree] = useState(false);
    const [categorySyncMessage, setCategorySyncMessage] = useState<{ text: string; isError: boolean } | null>(null);

    // Attribute mapping section state — WooCommerce attribute เป็น global
    // ทั้งหมด ไม่ผูก category (ต่างจาก Lazada/Shopee/TikTok) เลยโหลดได้ทันทีไม่
    // ต้องรอ Category Mapping (section 1) เสร็จก่อน และไม่มีปุ่ม "สร้าง/อัปเดต
    // Attribute Family"/checkbox "แสดงเฉพาะที่บังคับ"/ปุ่ม "จับคู่ตัวเลือก" เลย
    // (ไม่มี concept เหล่านี้จริงสำหรับ WooCommerce)
    const [wooAttributes, setWooAttributes] = useState<WooCommerceAttributeRow[] | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState(false);
    const [savingAttributeId, setSavingAttributeId] = useState<number | null>(null);
    const [syncingAttributes, setSyncingAttributes] = useState(false);

    // Payload WooCommerce section state (section 3) — ฟิลด์ payload ตายตัวของ
    // WooCommerce เอง ไม่ผูกกับหมวดหมู่ไหนเลย เลยโหลดครั้งเดียวตอนเปิดสินค้า
    const [payloadFields, setPayloadFields] = useState<PayloadFieldRow[] | null>(null);
    const [loadingPayloadFields, setLoadingPayloadFields] = useState(false);
    const [savingPayloadField, setSavingPayloadField] = useState<string | null>(null);

    // Object Page anchor bar — mirror ของ shopee-products.tsx เป๊ะ (scroll-spy
    // nav ไม่ใช่การสลับซ่อน/โชว์ panel)
    const [sectionIndex, setSectionIndex] = useState(0);
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const anchorBarRef = useRef<HTMLDivElement | null>(null);
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const suppressScrollSpy = useRef(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'WooCommerce', href: '/catalog/marketplace/woocommerce' },
        { title: 'สินค้า', href: '/catalog/marketplace/woocommerce/products' },
        ...(activeProduct ? [{ title: activeProduct.name, href: '#' }] : []),
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/marketplace/woocommerce/products', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const applyFilter = (value: ProductFilter) => {
        setFilter(value);
        router.get('/catalog/marketplace/woocommerce/products', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/woocommerce/products', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/marketplace/woocommerce/products', { search, filter, per_page: perPage, page }, { preserveState: true });
    };

    // ต่างจาก Lazada/Shopee/TikTok ตรงที่โหลด "list กลาง" ของ WooCommerce
    // attribute ทั้งหมด ไม่ใช่แค่ของหมวดหมู่ใดหมวดหมู่หนึ่ง — เลยไม่มีพารามิเตอร์
    // category ให้ส่งเลย
    const loadAttributes = () => {
        setLoadingAttributes(true);
        fetch('/catalog/attributes/woocommerce-mapping/attributes-list', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: WooCommerceAttributeRow[] }) => setWooAttributes(body.data))
            .finally(() => setLoadingAttributes(false));
    };

    const loadPayloadFields = () => {
        setLoadingPayloadFields(true);
        fetch('/catalog/attributes/woocommerce-mapping/payload-fields', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: PayloadFieldRow[] }) => setPayloadFields(body.data))
            .finally(() => setLoadingPayloadFields(false));
    };

    const scrollToSection = (idx: number) => {
        suppressScrollSpy.current = true;
        setSectionIndex(idx);
        sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            suppressScrollSpy.current = false;
        }, 700);
    };

    const openProduct = (product: ProductRow) => {
        setActiveProduct(product);
        setSectionIndex(0);
        setSelectedWooCatId(product.woocommerce_category?.id ?? null);
        // ล้าง state ค้างจากสินค้าตัวก่อนหน้าด้วย — ไม่งั้นเปิดสินค้าตัวใหม่จะยัง
        // เห็น alert ของสินค้าตัวเก่าค้างอยู่ (บั๊กที่เจอจาก code review รอบ
        // Shopee — ใส่ไว้ตั้งแต่ต้นให้ WooCommerce เลย)
        setCategorySyncMessage(null);

        // โหลด attribute list (global) ทันทีเสมอ ไม่ต้องรอ category_mapped
        loadAttributes();
        loadPayloadFields();
    };

    // Scroll-spy: เปิดทำงานเฉพาะตอนอยู่ใน Object Page (มี activeProduct)
    useEffect(() => {
        if (!activeProduct) return;
        const scrollParent = scrollBodyRef.current;
        if (!scrollParent) return;

        const handleScroll = () => {
            if (suppressScrollSpy.current) return;

            const barBottom = anchorBarRef.current ? anchorBarRef.current.getBoundingClientRect().bottom : 0;
            const threshold = barBottom + SECTION_SCROLL_MARGIN + 16;
            let activeIdx = 0;
            for (let i = 0; i < sectionRefs.current.length; i++) {
                const el = sectionRefs.current[i];
                if (!el) continue;
                if (el.getBoundingClientRect().top <= threshold) {
                    activeIdx = i;
                }
            }
            setSectionIndex(activeIdx);
        };

        scrollParent.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => scrollParent.removeEventListener('scroll', handleScroll);
    }, [activeProduct]);

    const saveCategoryMapping = () => {
        if (!activeProduct || !activeProduct.master_category || !selectedWooCatId) return;

        setSavingCatMap(true);
        const wooCategoryId = selectedWooCatId;
        const mappings = [
            {
                category_id: activeProduct.master_category.id,
                woocommerce_category_id: wooCategoryId,
            },
        ];

        router.post(
            '/catalog/categories/woocommerce-mapping',
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSavingCatMap(false);
                    fetch(`/catalog/marketplace-categories/woocommerce/path?id=${wooCategoryId}`, { headers: { Accept: 'application/json' } })
                        .then((res) => (res.ok ? res.json() : []))
                        .then((path: { id: number; name: string }[]) => {
                            const last = path[path.length - 1];
                            setActiveProduct((prev) =>
                                prev
                                    ? {
                                          ...prev,
                                          category_mapped: true,
                                          woocommerce_category: {
                                              id: wooCategoryId,
                                              name: last?.name ?? String(wooCategoryId),
                                              path: path.map((n) => n.name).join(' > '),
                                          },
                                      }
                                    : prev,
                            );
                        });
                    scrollToSection(1);
                },
                onError: () => setSavingCatMap(false),
            },
        );
    };

    const syncCategoryTree = () => {
        setSyncingCategoryTree(true);
        setCategorySyncMessage(null);

        fetch('/catalog/categories/sync-woocommerce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
        })
            .then(async (res) => {
                const body = await res.json();
                setCategorySyncMessage(
                    res.ok
                        ? { text: `ซิงค์หมวดหมู่ WooCommerce สำเร็จ ${body.count} หมวดหมู่`, isError: false }
                        : { text: body.message || 'เกิดข้อผิดพลาด ไม่สามารถซิงค์หมวดหมู่ได้', isError: true },
                );
            })
            .catch(() => setCategorySyncMessage({ text: 'เกิดข้อผิดพลาด ไม่สามารถซิงค์หมวดหมู่ได้', isError: true }))
            .finally(() => setSyncingCategoryTree(false));
    };

    // Global sync — ไม่มี category_id ให้ส่งเหมือน 3 platform อื่น
    const syncAttributes = () => {
        setSyncingAttributes(true);

        fetch('/catalog/attributes/woocommerce-mapping/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
        })
            .then((res) => {
                if (res.ok) {
                    loadAttributes();
                }
            })
            .finally(() => setSyncingAttributes(false));
    };

    const assignAttribute = (wooAttributeId: number, pimAttribute: PimAttributeOption) => {
        setSavingAttributeId(wooAttributeId);
        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttribute.id,
                        target_field: 'wc_attribute',
                        woocommerce_attribute_id: wooAttributeId,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setWooAttributes((prev) =>
                    prev ? prev.map((a) => (a.id === wooAttributeId ? { ...a, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : a)) : prev,
                );
            })
            .finally(() => setSavingAttributeId(null));
    };

    const clearAttribute = (wooAttributeId: number, pimAttributeId: number) => {
        setSavingAttributeId(wooAttributeId);
        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: null,
                        woocommerce_attribute_id: null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setWooAttributes((prev) => (prev ? prev.map((a) => (a.id === wooAttributeId ? { ...a, mapped: null } : a)) : prev));
            })
            .finally(() => setSavingAttributeId(null));
    };

    // ใช้กับฟิลด์ payload แบบ single-value เท่านั้น (ทุกฟิลด์ยกเว้น
    // description/short_description) — แทนที่ attribute ตัวเดิม (ถ้ามี) ด้วย
    // ตัวใหม่ที่เลือก
    const assignPayloadField = (field: PayloadTargetField, pimAttribute: PimAttributeOption, previousAttributeId: number | null) => {
        setSavingPayloadField(field);

        const mappings: { attribute_id: number; target_field: string | null; woocommerce_attribute_id: null; sort_order: number }[] = [
            { attribute_id: pimAttribute.id, target_field: field, woocommerce_attribute_id: null, sort_order: 0 },
        ];
        if (previousAttributeId && previousAttributeId !== pimAttribute.id) {
            mappings.push({ attribute_id: previousAttributeId, target_field: null, woocommerce_attribute_id: null, sort_order: 0 });
        }

        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) =>
                    prev ? prev.map((f) => (f.target_field === field ? { ...f, mapped: [{ id: pimAttribute.id, name: pimAttribute.name }] } : f)) : prev,
                );
            })
            .finally(() => setSavingPayloadField(null));
    };

    const clearPayloadField = (field: PayloadTargetField, pimAttributeId: number) => {
        setSavingPayloadField(field);
        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [{ attribute_id: pimAttributeId, target_field: null, woocommerce_attribute_id: null, sort_order: 0 }],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) => (prev ? prev.map((f) => (f.target_field === field ? { ...f, mapped: [] } : f)) : prev));
            })
            .finally(() => setSavingPayloadField(null));
    };

    // ใช้กับฟิลด์ payload แบบ multi-value เท่านั้น (description/short_description)
    // — เพิ่ม attribute ใหม่เข้าไปในรายการ ไม่แทนที่ตัวเดิม เพราะ
    // WooCommerceProductSyncService::buildContentFields() ประกอบทุกตัวที่แมปไว้
    // เข้าด้วยกัน
    const addPayloadFieldAttribute = (field: PayloadTargetField, pimAttribute: PimAttributeOption) => {
        setSavingPayloadField(field);
        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [{ attribute_id: pimAttribute.id, target_field: field, woocommerce_attribute_id: null, sort_order: 0 }],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) =>
                    prev
                        ? prev.map((f) =>
                              f.target_field === field ? { ...f, mapped: [...f.mapped, { id: pimAttribute.id, name: pimAttribute.name }] } : f,
                          )
                        : prev,
                );
            })
            .finally(() => setSavingPayloadField(null));
    };

    const removePayloadFieldAttribute = (field: PayloadTargetField, pimAttributeId: number) => {
        setSavingPayloadField(field);
        fetch('/catalog/attributes/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [{ attribute_id: pimAttributeId, target_field: null, woocommerce_attribute_id: null, sort_order: 0 }],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) =>
                    prev ? prev.map((f) => (f.target_field === field ? { ...f, mapped: f.mapped.filter((m) => m.id !== pimAttributeId) } : f)) : prev,
                );
            })
            .finally(() => setSavingPayloadField(null));
    };

    const toggleSelectAll = () => {
        if (selectedRows.length === products.data.length) {
            setSelectedRows([]);
        } else {
            setSelectedRows(products.data.map((p) => p.id));
        }
    };

    const toggleSelectRow = (id: number) => {
        setSelectedRows((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    };

    const columns: FioriResponsiveColumn<ProductRow>[] = [
        {
            key: 'selection',
            header: (
                <Checkbox
                    size="small"
                    checked={products.data.length > 0 && selectedRows.length === products.data.length}
                    indeterminate={selectedRows.length > 0 && selectedRows.length < products.data.length}
                    onChange={toggleSelectAll}
                />
            ),
            priority: 'always',
            width: 48,
            render: (row) => (
                <Checkbox
                    size="small"
                    checked={selectedRows.includes(row.id)}
                    onChange={() => toggleSelectRow(row.id)}
                />
            ),
        },
        {
            key: 'product',
            header: 'สินค้า',
            priority: 'always',
            minWidth: 260,
            render: (row) => (
                <Box>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: FIORI.brand, cursor: 'pointer' }}
                        onClick={() => openProduct(row)}
                    >
                        {row.name}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                            {row.sku}
                        </Typography>
                        {row.variants_count > 0 && (
                            <FioriStatus label={`${row.variants_count} variants`} tone="neutral" />
                        )}
                    </Stack>
                </Box>
            ),
        },
        {
            key: 'master_category',
            header: 'Master Category',
            priority: 'medium',
            minWidth: 220,
            render: (row) =>
                row.master_category ? (
                    <Typography variant="body2" sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                        {row.master_category.path || row.master_category.name}
                    </Typography>
                ) : (
                    <FioriStatus label="ไม่มีหมวดหมู่ PIM" tone="neutral" />
                ),
        },
        {
            key: 'woocommerce_category',
            header: 'WooCommerce Category',
            priority: 'high',
            minWidth: 240,
            render: (row) =>
                row.woocommerce_category ? (
                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                            {row.woocommerce_category.path || row.woocommerce_category.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                            wc:{row.woocommerce_category.id}
                        </Typography>
                    </Box>
                ) : (
                    <FioriStatus label="ยังไม่ได้ map" tone="warning" />
                ),
        },
        {
            key: 'action',
            header: 'Action',
            priority: 'always',
            align: 'right',
            minWidth: 140,
            render: (row) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                    <Button
                        size="small"
                        variant={row.category_mapped ? 'outlined' : 'contained'}
                        onClick={() => openProduct(row)}
                        sx={{
                            ...(row.category_mapped ? fioriDefaultSx : fioriEmphasizedSx),
                            fontSize: '0.8125rem',
                            px: 1.5,
                            py: 0.5,
                        }}
                    >
                        {row.category_mapped ? 'แก้ไขการแมพ' : 'เริ่มแมพ'}
                    </Button>
                </Stack>
            ),
        },
    ];

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;

    // ──────────────────────────────────────────────────────────────────────
    // Object Page — mirror ของ shopee-products.tsx เป๊ะ (ดูตัวนั้นๆ docblock)
    // ──────────────────────────────────────────────────────────────────────
    if (activeProduct) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={`WooCommerce Mapping | ${activeProduct.sku}`} />
                <Box sx={{ bgcolor: FIORI.pageBg, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* Object Page header — ไม่ scroll ไปกับเนื้อหา */}
                    <Box sx={{ px: { xs: 2, md: 4 }, py: 2.5, bgcolor: FIORI.surface, borderBottom: `1px solid ${FIORI.border}` }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                            <Box>
                                <Button
                                    size="small"
                                    startIcon={<ArrowBackIcon fontSize="small" />}
                                    onClick={() => setActiveProduct(null)}
                                    sx={{ ...fioriGhostSx, mb: 1, px: 0.5 }}
                                >
                                    กลับไปหน้ารายการ
                                </Button>
                                <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                    {activeProduct.name}
                                </Typography>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                                    SKU: {activeProduct.sku}
                                </Typography>
                                {/* Object Status facets — สถานะ mapping ของสินค้านี้ ณ ตอนนี้ */}
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                                    <FioriStatus
                                        label={`PIM: ${activeProduct.master_category?.path || activeProduct.master_category?.name || 'ไม่มีหมวดหมู่'}`}
                                        tone={activeProduct.master_category ? 'neutral' : 'warning'}
                                    />
                                    <FioriStatus
                                        label={
                                            activeProduct.woocommerce_category
                                                ? `WooCommerce: ${activeProduct.woocommerce_category.path || activeProduct.woocommerce_category.name}`
                                                : 'ยังไม่ได้แมป Category'
                                        }
                                        tone={activeProduct.category_mapped ? 'success' : 'warning'}
                                    />
                                </Stack>
                            </Box>
                        </Stack>
                    </Box>

                    {/* Scrollable Body — พื้นที่เดียวในหน้านี้ที่ scroll ได้ */}
                    <Box ref={scrollBodyRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 6 }}>
                        {/* Anchor bar — sticky, ทำหน้าที่เป็น scroll-spy nav ไม่ใช่สลับ panel */}
                        <Paper
                            ref={anchorBarRef}
                            variant="outlined"
                            sx={{
                                borderRadius: 0,
                                bgcolor: FIORI.surface,
                                borderColor: FIORI.border,
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                px: { xs: 2, md: 4 },
                            }}
                        >
                            <Tabs value={sectionIndex} onChange={(_, v) => scrollToSection(v)} sx={fioriTabsSx}>
                                <Tab label="1. Category Mapping" />
                                <Tab label="2. Attribute Mapping" />
                                <Tab label="3. Payload WooCommerce" />
                                <Tab label="4. History" disabled={!activeProduct.master_category} />
                            </Tabs>
                        </Paper>

                        <Stack spacing={3} sx={{ px: { xs: 2, md: 4 }, pt: 3 }}>
                            {/* Section 1 — Category Mapping */}
                            <Paper
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[0] = el;
                                }}
                                elevation={0}
                                sx={{ ...(fioriCardSx as Record<string, unknown>), p: 3, scrollMarginTop: `${SECTION_SCROLL_MARGIN}px` }}
                            >
                                <Stack spacing={2.5}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                เลือก WooCommerce Category ปลายทางสำหรับ Master Category นี้
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                                การเปลี่ยน Category Mapping ตรงนี้ จะมีผลกับสินค้าทุกตัวที่อยู่ใน Master Category เดียวกันอัตโนมัติ
                                            </Typography>
                                        </Box>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            disabled={syncingCategoryTree}
                                            startIcon={syncingCategoryTree ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                            onClick={syncCategoryTree}
                                            sx={{ ...fioriDefaultSx, whiteSpace: 'nowrap', flexShrink: 0 }}
                                        >
                                            Sync Categories จาก WooCommerce
                                        </Button>
                                    </Stack>

                                    {categorySyncMessage && (
                                        <Alert severity={categorySyncMessage.isError ? 'error' : 'success'} onClose={() => setCategorySyncMessage(null)}>
                                            {categorySyncMessage.text}
                                        </Alert>
                                    )}

                                    <Box sx={{ maxWidth: 420 }}>
                                        <MarketplaceCategoryPicker
                                            platform="woocommerce"
                                            label="WooCommerce Category"
                                            value={selectedWooCatId}
                                            onChange={setSelectedWooCatId}
                                        />
                                    </Box>

                                    <Box>
                                        <Button
                                            variant="contained"
                                            disabled={!selectedWooCatId || savingCatMap}
                                            onClick={saveCategoryMapping}
                                            startIcon={savingCatMap ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon fontSize="small" />}
                                            sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                                        >
                                            บันทึก Category Mapping & ดำเนินการต่อ
                                        </Button>
                                    </Box>
                                </Stack>
                            </Paper>

                            {/* Section 2 — Attribute Mapping: WooCommerce attribute เป็น global
                                ทั้งหมด ไม่ผูก category — ไม่ lock รอ Category Mapping (section 1)
                                เหมือน 3 platform อื่น */}
                            <Paper
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[1] = el;
                                }}
                                elevation={0}
                                sx={{ ...(fioriCardSx as Record<string, unknown>), p: 3, scrollMarginTop: `${SECTION_SCROLL_MARGIN}px` }}
                            >
                                <Stack spacing={3}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                WooCommerce Product Attributes (global)
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                                Attribute ของ WooCommerce ไม่ผูกกับหมวดหมู่ — แมปที่นี่มีผลกับสินค้าทุกตัวในระบบ ไม่ใช่แค่ตัวนี้
                                            </Typography>
                                        </Box>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            disabled={syncingAttributes}
                                            startIcon={syncingAttributes ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                            onClick={syncAttributes}
                                            sx={fioriDefaultSx}
                                        >
                                            Sync Attributes
                                        </Button>
                                    </Stack>

                                    {loadingAttributes ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                            <CircularProgress size={24} sx={{ color: FIORI.brand }} />
                                        </Box>
                                    ) : wooAttributes && wooAttributes.length > 0 ? (
                                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                            <Box component="thead" sx={{ bgcolor: FIORI.headerBg }}>
                                                <Box component="tr">
                                                    <Box
                                                        component="th"
                                                        sx={{ p: 1.5, textAlign: 'left', fontWeight: 600, color: FIORI.textPrimary, borderBottom: `1px solid ${FIORI.border}` }}
                                                    >
                                                        WooCommerce Attribute
                                                    </Box>
                                                    <Box
                                                        component="th"
                                                        sx={{ p: 1.5, textAlign: 'left', fontWeight: 600, color: FIORI.textPrimary, borderBottom: `1px solid ${FIORI.border}` }}
                                                    >
                                                        PIM Attribute (ต้นทาง)
                                                    </Box>
                                                </Box>
                                            </Box>
                                            <Box component="tbody">
                                                {wooAttributes.map((attr) => (
                                                    <Box
                                                        component="tr"
                                                        key={attr.id}
                                                        sx={{
                                                            borderTop: `1px solid ${FIORI.border}`,
                                                            '&:hover': { bgcolor: FIORI.hover },
                                                            transition: 'background-color 0.1s ease',
                                                        }}
                                                    >
                                                        <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                            <Typography fontWeight={600} variant="body2" sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                                                                {attr.name}
                                                            </Typography>
                                                        </Box>
                                                        <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                                <Box sx={{ flex: 1, minWidth: 200 }}>
                                                                    <PimAttributePicker
                                                                        value={attr.mapped}
                                                                        disabled={savingAttributeId === attr.id}
                                                                        onChange={(val) => {
                                                                            if (val) {
                                                                                assignAttribute(attr.id, val);
                                                                            } else if (attr.mapped) {
                                                                                clearAttribute(attr.id, attr.mapped.id);
                                                                            }
                                                                        }}
                                                                        placeholder="เลือก PIM attribute..."
                                                                    />
                                                                </Box>
                                                                {savingAttributeId === attr.id && <CircularProgress size={14} sx={{ color: FIORI.brand }} />}
                                                            </Stack>
                                                        </Box>
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                                            ยังไม่มีข้อมูล Attributes ในระบบ กรุณากด "Sync Attributes"
                                        </Typography>
                                    )}
                                </Stack>
                            </Paper>

                            {/* Section 3 — Payload WooCommerce: ฟิลด์ payload ตายตัวของ
                                WooCommerce เอง ไม่ผูกกับหมวดหมู่ไหนเลย */}
                            <Paper
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[2] = el;
                                }}
                                elevation={0}
                                sx={{ ...(fioriCardSx as Record<string, unknown>), p: 3, scrollMarginTop: `${SECTION_SCROLL_MARGIN}px` }}
                            >
                                <Stack spacing={2.5}>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                            แมป PIM Attribute เข้ากับฟิลด์ payload ของ WooCommerce
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            ฟิลด์ตายตัวของ WooCommerce เอง — ใช้ร่วมกันทุกสินค้า เปลี่ยนตรงนี้มีผลกับสินค้าทุกตัวในระบบ
                                        </Typography>
                                    </Box>

                                    {loadingPayloadFields ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                            <CircularProgress size={24} sx={{ color: FIORI.brand }} />
                                        </Box>
                                    ) : (
                                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                            <Box component="thead" sx={{ bgcolor: FIORI.headerBg }}>
                                                <Box component="tr">
                                                    <Box component="th" sx={{ p: 1.5, textAlign: 'left', fontWeight: 600, color: FIORI.textPrimary, borderBottom: `1px solid ${FIORI.border}` }}>
                                                        WooCommerce Payload Field
                                                    </Box>
                                                    <Box component="th" sx={{ p: 1.5, textAlign: 'left', fontWeight: 600, color: FIORI.textPrimary, borderBottom: `1px solid ${FIORI.border}` }}>
                                                        PIM Attribute (ต้นทาง)
                                                    </Box>
                                                </Box>
                                            </Box>
                                            <Box component="tbody">
                                                {(payloadFields ?? []).map((f) => (
                                                    <Box
                                                        component="tr"
                                                        key={f.target_field}
                                                        sx={{ borderTop: `1px solid ${FIORI.border}`, '&:hover': { bgcolor: FIORI.hover }, transition: 'background-color 0.1s ease' }}
                                                    >
                                                        <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                            <Typography fontWeight={600} variant="body2" sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                                                                {PAYLOAD_FIELD_LABELS[f.target_field]}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                                                {f.target_field}
                                                            </Typography>
                                                        </Box>
                                                        <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                            {f.multi ? (
                                                                // description/short_description — รับได้หลาย attribute พร้อมกัน
                                                                // (แต่ละตัวถูกประกอบเป็นหนึ่ง section ต่อกันฝั่ง WooCommerce จริง)
                                                                // แสดงเป็นรายการที่ลบทีละตัวได้ + ช่องเพิ่มตัวใหม่
                                                                <Stack spacing={1}>
                                                                    {f.mapped.length > 0 && (
                                                                        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                                                                            {f.mapped.map((m) => (
                                                                                <Chip
                                                                                    key={m.id}
                                                                                    label={m.name}
                                                                                    size="small"
                                                                                    onDelete={() => removePayloadFieldAttribute(f.target_field, m.id)}
                                                                                    disabled={savingPayloadField === f.target_field}
                                                                                />
                                                                            ))}
                                                                        </Stack>
                                                                    )}
                                                                    <Stack direction="row" alignItems="center" spacing={1}>
                                                                        <Box sx={{ flex: 1, minWidth: 200 }}>
                                                                            <PimAttributePicker
                                                                                value={null}
                                                                                disabled={savingPayloadField === f.target_field}
                                                                                onChange={(val) => {
                                                                                    if (val && !f.mapped.some((m) => m.id === val.id)) {
                                                                                        addPayloadFieldAttribute(f.target_field, val);
                                                                                    }
                                                                                }}
                                                                                placeholder="เพิ่ม PIM attribute..."
                                                                            />
                                                                        </Box>
                                                                        {savingPayloadField === f.target_field && <CircularProgress size={14} sx={{ color: FIORI.brand }} />}
                                                                    </Stack>
                                                                </Stack>
                                                            ) : (
                                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                                    <Box sx={{ flex: 1, minWidth: 200 }}>
                                                                        <PimAttributePicker
                                                                            value={f.mapped[0] ?? null}
                                                                            disabled={savingPayloadField === f.target_field}
                                                                            typeFilter={f.target_field === 'video' ? ['video'] : undefined}
                                                                            onChange={(val) => {
                                                                                if (val) {
                                                                                    assignPayloadField(f.target_field, val, f.mapped[0]?.id ?? null);
                                                                                } else if (f.mapped[0]) {
                                                                                    clearPayloadField(f.target_field, f.mapped[0].id);
                                                                                }
                                                                            }}
                                                                            placeholder="เลือก PIM attribute..."
                                                                        />
                                                                    </Box>
                                                                    {savingPayloadField === f.target_field && <CircularProgress size={14} sx={{ color: FIORI.brand }} />}
                                                                </Stack>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Box>
                                    )}
                                </Stack>
                            </Paper>

                            {/* Section 4 — History: WooCommerceMappingTimelineBuilder ขอบเขต
                                แคบกว่า 3 platform อื่น — แค่ audit trail ของ Category Mapping
                                (section 1) เท่านั้น เพราะ attribute mapping เป็น global ไม่ผูก
                                กับ category นี้เจาะจง */}
                            <Paper
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[3] = el;
                                }}
                                elevation={0}
                                sx={{ ...(fioriCardSx as Record<string, unknown>), p: 3, scrollMarginTop: `${SECTION_SCROLL_MARGIN}px` }}
                            >
                                <Stack spacing={2.5}>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                            เส้นทางการแมพ WooCommerce ของ Master Category นี้
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            รวมการเปลี่ยนแปลงของ Category Mapping (Section 1) — attribute mapping (Section 2/3) เป็น global ไม่ผูกกับ
                                            category นี้เจาะจง เลยไม่รวมอยู่ในนี้
                                        </Typography>
                                    </Box>

                                    {!activeProduct.master_category ? (
                                        <Stack alignItems="center" spacing={1} sx={{ py: 4, color: FIORI.textSecondary }}>
                                            <LockOutlinedIcon fontSize="small" />
                                            <Typography variant="body2">สินค้านี้ยังไม่มี Master Category — ไม่มีประวัติให้แสดง</Typography>
                                        </Stack>
                                    ) : (
                                        <TimelinePanel
                                            timelineUrl={`/catalog/attributes/woocommerce-mapping/timeline?category_id=${activeProduct.master_category.id}`}
                                        />
                                    )}
                                </Stack>
                            </Paper>
                        </Stack>
                    </Box>
                </Box>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="แมปสินค้า WooCommerce" />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* ──── Page Header ──── */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            สินค้า ({products.total})
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            จัดการการแมปหมวดหมู่และ Attributes ของ WooCommerce ตั้งแต่ระดับสินค้า
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        startIcon={<ArrowBackIcon fontSize="small" />}
                        onClick={() => router.visit('/catalog/marketplace/woocommerce')}
                        sx={fioriGhostSx}
                    >
                        WooCommerce Hub
                    </Button>
                </Stack>

                {/* ──── Stat KPI Tiles ──── */}
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={0}
                    sx={{
                        mb: 3,
                        borderRadius: '8px',
                        border: `1px solid ${FIORI.border}`,
                        overflow: 'hidden',
                        bgcolor: FIORI.border,
                        gap: '1px',
                    }}
                >
                    {[
                        { label: 'สินค้าทั้งหมด', value: stats.total, tone: undefined, filterValue: 'all' as ProductFilter },
                        { label: 'แมป Category แล้ว', value: stats.mapped, tone: 'success' as const, filterValue: 'mapped' as ProductFilter },
                        { label: 'ยังไม่ได้แมป Category', value: stats.unmapped, tone: 'warning' as const, filterValue: 'unmapped' as ProductFilter },
                    ].map((kpi) => (
                        <Box
                            key={kpi.label}
                            onClick={() => applyFilter(kpi.filterValue)}
                            sx={{
                                flex: 1,
                                p: 2,
                                cursor: 'pointer',
                                transition: 'background-color 0.1s ease',
                                ...(filter === kpi.filterValue ? { bgcolor: FIORI.brandBg } : { bgcolor: FIORI.surface, '&:hover': { bgcolor: FIORI.hover } }),
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: FIORI.textSecondary,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    fontSize: '0.6875rem',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {kpi.label}
                            </Typography>
                            <Typography
                                variant="h5"
                                fontWeight={700}
                                sx={{
                                    color: kpi.tone ? FIORI[kpi.tone] : FIORI.textPrimary,
                                    mt: 0.5,
                                }}
                            >
                                {kpi.value}
                            </Typography>
                        </Box>
                    ))}
                </Stack>

                {/* ──── Table Card (Toolbar + Data + Pagination) ──── */}
                <Paper elevation={0} sx={fioriCardSx}>
                    {/* Toolbar */}
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={2}
                        sx={{ p: 2 }}
                    >
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                            <TextField
                                size="small"
                                placeholder="ค้นหาตามชื่อสินค้า หรือ SKU..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ ...fioriSearchFieldSx, minWidth: 260 }}
                            />
                            <ToggleButtonGroup
                                size="small"
                                exclusive
                                value={filter}
                                onChange={(_, val) => val && applyFilter(val)}
                                sx={{
                                    '& .MuiToggleButton-root': {
                                        textTransform: 'none',
                                        fontWeight: 500,
                                        fontSize: '0.8125rem',
                                        px: 1.5,
                                        py: 0.5,
                                        color: FIORI.textSecondary,
                                        borderColor: FIORI.borderStrong,
                                        transition: 'background-color 0.1s ease, color 0.1s ease',
                                        '&:hover': { backgroundColor: FIORI.hover, color: FIORI.textPrimary },
                                        '&.Mui-selected': {
                                            backgroundColor: FIORI.brandBg,
                                            color: FIORI.brand,
                                            borderColor: FIORI.brand,
                                            fontWeight: 700,
                                            zIndex: 1,
                                            '&:hover': { backgroundColor: FIORI.brandBg, color: FIORI.brand },
                                        },
                                    },
                                }}
                            >
                                <ToggleButton value="all">ทั้งหมด ({stats.total})</ToggleButton>
                                <ToggleButton value="mapped">แมปแล้ว ({stats.mapped})</ToggleButton>
                                <ToggleButton value="unmapped">ยังไม่ได้แมป ({stats.unmapped})</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>

                        {/* Pagination controls — same pattern as products/index.tsx */}
                        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'space-between', md: 'flex-end' } }}>
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
                                <MenuItem value={100}>100</MenuItem>
                            </Select>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {tGrid('perPage') || 'ต่อหน้า'}
                            </Typography>

                            <Paper
                                variant="outlined"
                                sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}
                            >
                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                            </Paper>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                / {lastPage}
                            </Typography>

                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                    <FirstPageIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    {/* Data Table */}
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={products.data}
                        getRowKey={(row: ProductRow) => row.id}
                        rowSx={(row) => fioriTableRowSx(selectedRows.includes(row.id))}
                        emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                    />

                    {/* Footer info */}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            borderTop: `1px solid ${FIORI.border}`,
                        }}
                    >
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            {tGrid('totalCount', { count: products.total })}
                        </Typography>
                    </Box>
                </Paper>
            </Box>
        </AppLayout>
    );
}
