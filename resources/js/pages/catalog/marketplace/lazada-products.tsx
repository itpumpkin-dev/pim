import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { MarketplaceCategoryPicker } from '@/components/marketplace-category-picker';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import {
    LazadaAttributeOptionMappingDialog,
    type LazadaAttributeOptionMappingInfo,
} from '@/components/catalog/lazada-attribute-option-mapping-dialog';
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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Divider,
    FormControlLabel,
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
    lazada_category_id: number | null;
}

interface LazadaCategoryInfo {
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
    lazada_category: LazadaCategoryInfo | null;
    category_mapped: boolean;
    attribute_stats: { total: number; mapped: number } | null;
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

interface LazadaAttributeOptionInfo {
    value: string;
    label: string;
}

interface LazadaAttributeRow {
    name: string;
    label: string;
    input_type: string | null;
    mandatory: boolean;
    mapped: { id: number; name: string } | null;
    // Lazada's own predefined choices for this attribute — only non-empty
    // for a select-type input_type (see SELECT_LAZADA_INPUT_TYPES below).
    options: LazadaAttributeOptionInfo[];
    // Only set once a PIM attribute has been chosen for this row (`mapped`
    // non-null) — needed to write into lazada_attribute_option_mappings via
    // updateOptionMappings(), which is scoped per lazada_attribute_mappings
    // row, not per attribute_id.
    lazada_attribute_mapping_id: number | null;
    option_mappings: LazadaAttributeOptionMappingInfo[];
}

const MAPPABLE_LAZADA_INPUT_TYPES = [
    'text', 'numeric', 'richText', 'date', 'img',
    'singleSelect', 'multiSelect', 'enumInput', 'multiEnumInput',
];

// input_type ที่ต้อง "จับคู่ตัวเลือก" เพิ่ม (มีตัวเลือกที่กำหนดไว้ล่วงหน้า) — ตรงกับ
// LazadaAttributeMappingController::SELECT_INPUT_TYPES ฝั่ง backend
const SELECT_LAZADA_INPUT_TYPES = ['singleSelect', 'multiSelect', 'enumInput', 'multiEnumInput'];

// ฟิลด์ payload ตายตัวของ Lazada เอง (ไม่ผูกกับหมวดหมู่ไหนเลย ต่างจาก section 2
// ที่เป็น category attribute) — ตรงกับ LazadaAttributeMappingController::
// STRUCTURED_TARGET_FIELDS ฝั่ง backend, ใช้ค่า target_field ตรงๆ เป็น key
type PayloadTargetField = 'name' | 'price' | 'qty' | 'weight' | 'length' | 'width' | 'height' | 'video';

const PAYLOAD_FIELD_LABELS: Record<PayloadTargetField, string> = {
    name: 'ชื่อสินค้า (Product Name)',
    price: 'ราคา (Price)',
    qty: 'จำนวนสต็อก (Quantity)',
    weight: 'น้ำหนักพัสดุ (Package Weight)',
    length: 'ความยาวพัสดุ (Package Length)',
    width: 'ความกว้างพัสดุ (Package Width)',
    height: 'ความสูงพัสดุ (Package Height)',
    video: 'วิดีโอสินค้า (Product Video)',
};

interface PayloadFieldRow {
    target_field: PayloadTargetField;
    mapped: { id: number; name: string } | null;
}

// ความสูงของแถบแท็บ anchor ที่ sticky อยู่บนสุดของ scroll body (บวก slack เล็กน้อย)
// ใช้เป็นทั้ง scroll-margin-top ของแต่ละ section และ threshold ของ scroll-spy —
// ตาม pattern เดียวกับ GROUP_SECTION_SCROLL_MARGIN ใน products/edit.tsx
const SECTION_SCROLL_MARGIN = 72;

export default function LazadaProductsMapping({ products, stats, filters }: Props) {
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
    const [selectedLazadaCatId, setSelectedLazadaCatId] = useState<number | null>(null);
    const [savingCatMap, setSavingCatMap] = useState(false);

    // Attribute mapping section state
    const [lazadaAttributes, setLazadaAttributes] = useState<LazadaAttributeRow[] | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState(false);
    const [savingAttributeName, setSavingAttributeName] = useState<string | null>(null);
    const [syncingAttributes, setSyncingAttributes] = useState(false);
    // แถวที่กำลังเปิด dialog "จับคู่ตัวเลือก" อยู่ (null = ปิด) — เฉพาะแถวที่เป็น
    // select-type (SELECT_LAZADA_INPUT_TYPES) และมี PIM attribute ผูกไว้แล้ว
    const [optionMappingRow, setOptionMappingRow] = useState<LazadaAttributeRow | null>(null);
    // กรองตารางให้เหลือแค่แถวที่ Lazada บังคับ (mandatory) — เอาไว้ไล่แมปเฉพาะตัว
    // ที่จำเป็นต้องมีก่อน sync ผ่านได้ ไม่ต้องไล่ทีละแถวทั้งหมด (บาง category มีเป็นสิบๆ)
    const [showMandatoryOnly, setShowMandatoryOnly] = useState(false);

    // Payload Lazada section state (section 3) — ฟิลด์ payload ตายตัวของ Lazada
    // เอง ไม่ผูกกับหมวดหมู่ไหนเลย เลยโหลดครั้งเดียวตอนเปิดสินค้า ไม่ต้องรอ
    // category_mapped เหมือน section 2
    const [payloadFields, setPayloadFields] = useState<PayloadFieldRow[] | null>(null);
    const [loadingPayloadFields, setLoadingPayloadFields] = useState(false);
    const [savingPayloadField, setSavingPayloadField] = useState<string | null>(null);

    // Object Page anchor bar — สอง section (1. Category, 2. Attributes) render ต่อกัน
    // อยู่ในหน้าเดียวเสมอ ตัวแท็บทำหน้าที่แค่เป็น scroll-spy nav (smooth-scroll ไปหา
    // section + ไฮไลต์ตามตำแหน่ง scroll) ไม่ใช่การสลับซ่อน/โชว์ panel เหมือนเดิม —
    // ดู pattern เดียวกันที่ products/edit.tsx (scrollToGroup/groupTabIndex)
    const [sectionIndex, setSectionIndex] = useState(0);
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const anchorBarRef = useRef<HTMLDivElement | null>(null);
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const suppressScrollSpy = useRef(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'Lazada', href: '/catalog/marketplace/lazada' },
        { title: 'สินค้า', href: '/catalog/marketplace/lazada/products' },
        ...(activeProduct ? [{ title: activeProduct.name, href: '#' }] : []),
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/marketplace/lazada/products', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const applyFilter = (value: ProductFilter) => {
        setFilter(value);
        router.get('/catalog/marketplace/lazada/products', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/lazada/products', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/marketplace/lazada/products', { search, filter, per_page: perPage, page }, { preserveState: true });
    };

    // Load category attributes when active product has a Lazada category
    const loadAttributes = (lazadaCatId: number) => {
        setLoadingAttributes(true);
        fetch(`/catalog/categories/${lazadaCatId}/lazada-attributes`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: LazadaAttributeRow[] }) => setLazadaAttributes(body.data))
            .finally(() => setLoadingAttributes(false));
    };

    const loadPayloadFields = () => {
        setLoadingPayloadFields(true);
        fetch('/catalog/attributes/lazada-mapping/payload-fields', { headers: { Accept: 'application/json' } })
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
        setSelectedLazadaCatId(product.lazada_category?.id ?? null);

        if (product.category_mapped && product.lazada_category) {
            loadAttributes(product.lazada_category.id);
        } else {
            setLazadaAttributes(null);
        }

        loadPayloadFields();
    };

    // Scroll-spy: เปิดทำงานเฉพาะตอนอยู่ใน Object Page (มี activeProduct) — ไฮไลต์แท็บ
    // ตาม section ที่อยู่ใต้แถบ anchor ที่ sticky อยู่ตอนนั้น เหมือนกับที่ products/edit.tsx ทำ
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
        if (!activeProduct || !activeProduct.master_category || !selectedLazadaCatId) return;

        setSavingCatMap(true);
        const lazadaCategoryId = selectedLazadaCatId;
        const mappings = [
            {
                category_id: activeProduct.master_category.id,
                lazada_category_id: lazadaCategoryId,
            },
        ];

        router.post(
            '/catalog/categories/lazada-mapping',
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSavingCatMap(false);
                    // อัปเดต object page header ให้ตรงกับที่เพิ่งบันทึกทันที ไม่ต้องรอ
                    // reload หน้ารายการ (ตัว products.data prop จะตามมาทีหลังจาก
                    // Inertia partial reload อยู่แล้ว แต่ activeProduct เป็น snapshot แยก) —
                    // ดึง path มาโชว์ให้ตรง เพราะ MarketplaceCategoryPicker คืนมาแค่ id
                    fetch(`/catalog/marketplace-categories/lazada/path?id=${lazadaCategoryId}`, { headers: { Accept: 'application/json' } })
                        .then((res) => (res.ok ? res.json() : []))
                        .then((path: { id: number; name: string }[]) => {
                            const last = path[path.length - 1];
                            setActiveProduct((prev) =>
                                prev
                                    ? {
                                          ...prev,
                                          category_mapped: true,
                                          lazada_category: {
                                              id: lazadaCategoryId,
                                              name: last?.name ?? String(lazadaCategoryId),
                                              path: path.map((n) => n.name).join(' > '),
                                          },
                                      }
                                    : prev,
                            );
                        });
                    // โหลด attribute schema ของหมวดหมู่ที่เพิ่งแมป แล้วพาไปต่อที่ step 2 เลย
                    loadAttributes(lazadaCategoryId);
                    scrollToSection(1);
                },
                onError: () => setSavingCatMap(false),
            },
        );
    };

    const syncAttributes = () => {
        if (!activeProduct?.lazada_category) return;
        setSyncingAttributes(true);

        fetch('/catalog/categories/lazada-mapping/sync-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ lazada_category_id: activeProduct.lazada_category.id }),
        })
            .then(async (res) => {
                if (res.ok) {
                    loadAttributes(activeProduct.lazada_category!.id);
                }
            })
            .finally(() => setSyncingAttributes(false));
    };

    const assignAttribute = (attributeName: string, pimAttribute: PimAttributeOption) => {
        setSavingAttributeName(attributeName);
        fetch('/catalog/attributes/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttribute.id,
                        target_field: 'lazada_attribute',
                        lazada_attribute_name: attributeName,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setLazadaAttributes((prev) =>
                    prev ? prev.map((a) => (a.name === attributeName ? { ...a, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : a)) : prev,
                );
            })
            .finally(() => setSavingAttributeName(null));
    };

    const clearAttribute = (attributeName: string, pimAttributeId: number) => {
        setSavingAttributeName(attributeName);
        fetch('/catalog/attributes/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: null,
                        lazada_attribute_name: null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setLazadaAttributes((prev) => (prev ? prev.map((a) => (a.name === attributeName ? { ...a, mapped: null } : a)) : prev));
            })
            .finally(() => setSavingAttributeName(null));
    };

    // สลับ PIM attribute ที่แมปไว้กับฟิลด์ payload ตายตัวของ Lazada ("3. Payload
    // Lazada") — ล้างของเดิม (ถ้ามี) แล้วค่อยตั้งของใหม่ เพราะ attribute_id เป็น
    // unique key ของ lazada_attribute_mappings (หนึ่ง PIM attribute ผูกได้แค่หนึ่ง
    // target เท่านั้น) แต่คนละแถวกันยังชี้มาที่ field เดียวกันได้ (ตัวแรกที่มีค่าจะ
    // ชนะ ตาม sort_order — resolveMappedField()) เลยต้องล้างตัวเก่าออกก่อนไม่งั้น
    // จะกลายเป็นสองตัวชี้ field เดียวกันเงียบๆ
    const assignPayloadField = (field: PayloadTargetField, pimAttribute: PimAttributeOption, previousAttributeId: number | null) => {
        setSavingPayloadField(field);

        const mappings: { attribute_id: number; target_field: string | null; lazada_attribute_name: null; sort_order: number }[] = [
            { attribute_id: pimAttribute.id, target_field: field, lazada_attribute_name: null, sort_order: 0 },
        ];
        if (previousAttributeId && previousAttributeId !== pimAttribute.id) {
            mappings.push({ attribute_id: previousAttributeId, target_field: null, lazada_attribute_name: null, sort_order: 0 });
        }

        fetch('/catalog/attributes/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) =>
                    prev ? prev.map((f) => (f.target_field === field ? { ...f, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : f)) : prev,
                );
            })
            .finally(() => setSavingPayloadField(null));
    };

    const clearPayloadField = (field: PayloadTargetField, pimAttributeId: number) => {
        setSavingPayloadField(field);
        fetch('/catalog/attributes/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [{ attribute_id: pimAttributeId, target_field: null, lazada_attribute_name: null, sort_order: 0 }],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setPayloadFields((prev) => (prev ? prev.map((f) => (f.target_field === field ? { ...f, mapped: null } : f)) : prev));
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
            key: 'lazada_category',
            header: 'Lazada Category',
            priority: 'high',
            minWidth: 240,
            render: (row) =>
                row.lazada_category ? (
                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                            {row.lazada_category.path || row.lazada_category.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                            lz:{row.lazada_category.id}
                        </Typography>
                    </Box>
                ) : (
                    <FioriStatus label="ยังไม่ได้ map" tone="warning" />
                ),
        },
        {
            key: 'attribute_stats',
            header: 'Attributes',
            priority: 'medium',
            minWidth: 120,
            render: (row) =>
                row.category_mapped && row.attribute_stats ? (
                    <FioriStatus
                        label={`${row.attribute_stats.mapped}/${row.attribute_stats.total} attr`}
                        tone={row.attribute_stats.mapped === row.attribute_stats.total ? 'success' : 'warning'}
                    />
                ) : (
                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                        —
                    </Typography>
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

    // Check mandatory attributes status for active product
    const unmappedMandatoryCount = lazadaAttributes
        ? lazadaAttributes.filter((a) => a.mandatory && !a.mapped).length
        : 0;
    const mandatoryAttributesCount = lazadaAttributes ? lazadaAttributes.filter((a) => a.mandatory).length : 0;
    // เมื่อติ๊ก "แสดงเฉพาะที่บังคับ" — กรองรายการที่ render จริงในตาราง (ไม่กระทบ
    // unmappedMandatoryCount/mandatoryAttributesCount ด้านบน ซึ่งต้องนับจากทั้งหมดเสมอ)
    const visibleLazadaAttributes = lazadaAttributes
        ? showMandatoryOnly
            ? lazadaAttributes.filter((a) => a.mandatory)
            : lazadaAttributes
        : null;

    // ──────────────────────────────────────────────────────────────────────
    // Object Page — เปิดตอนเลือกสินค้าจากตาราง (แทน Drawer เดิม) เต็มหน้า
    // ตาม floorplan เดียวกับ products/edit.tsx: toolbar บนสุดไม่ scroll, มีแค่
    // กล่อง scroll เดียว ข้างในมีแถบ anchor sticky + section เรียงต่อกันหมด
    // ──────────────────────────────────────────────────────────────────────
    if (activeProduct) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={`Lazada Mapping | ${activeProduct.sku}`} />
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
                                            activeProduct.lazada_category
                                                ? `Lazada: ${activeProduct.lazada_category.path || activeProduct.lazada_category.name}`
                                                : 'ยังไม่ได้แมป Category'
                                        }
                                        tone={activeProduct.category_mapped ? 'success' : 'warning'}
                                    />
                                    {activeProduct.attribute_stats && (
                                        <FioriStatus
                                            label={`Attributes ${activeProduct.attribute_stats.mapped}/${activeProduct.attribute_stats.total}`}
                                            tone={activeProduct.attribute_stats.mapped === activeProduct.attribute_stats.total ? 'success' : 'warning'}
                                        />
                                    )}
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
                                <Tab label="2. Attribute Mapping" disabled={!activeProduct.category_mapped} />
                                <Tab label="3. Payload Lazada" />
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
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                            เลือก Lazada Category ปลายทางสำหรับ Master Category นี้
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            การเปลี่ยน Category Mapping ตรงนี้ จะมีผลกับสินค้าทุกตัวที่อยู่ใน Master Category เดียวกันอัตโนมัติ
                                        </Typography>
                                    </Box>

                                    <Box sx={{ maxWidth: 420 }}>
                                        <MarketplaceCategoryPicker
                                            platform="lazada"
                                            label="Lazada Category"
                                            value={selectedLazadaCatId}
                                            onChange={setSelectedLazadaCatId}
                                        />
                                    </Box>

                                    <Box>
                                        <Button
                                            variant="contained"
                                            disabled={!selectedLazadaCatId || savingCatMap}
                                            onClick={saveCategoryMapping}
                                            startIcon={savingCatMap ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon fontSize="small" />}
                                            sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                                        >
                                            บันทึก Category Mapping & ดำเนินการต่อ
                                        </Button>
                                    </Box>
                                </Stack>
                            </Paper>

                            {/* Section 2 — Attribute Mapping (locked จนกว่าจะแมป Category ก่อน) */}
                            <Paper
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[1] = el;
                                }}
                                elevation={0}
                                sx={{ ...(fioriCardSx as Record<string, unknown>), p: 3, scrollMarginTop: `${SECTION_SCROLL_MARGIN}px` }}
                            >
                                {!activeProduct.category_mapped || !activeProduct.lazada_category ? (
                                    <Stack alignItems="center" spacing={1} sx={{ py: 4, color: FIORI.textSecondary }}>
                                        <LockOutlinedIcon fontSize="small" />
                                        <Typography variant="body2">กรุณาบันทึก Category Mapping (Section 1) ก่อน ถึงจะแมป Attributes ได้</Typography>
                                    </Stack>
                                ) : (
                                    <Stack spacing={3}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                    {activeProduct.lazada_category.path || activeProduct.lazada_category.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontFamily: 'monospace' }}>
                                                    lz:{activeProduct.lazada_category.id}
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

                                        {unmappedMandatoryCount > 0 && (
                                            <Alert severity="error" icon={<WarningAmberIcon />}>
                                                มี {unmappedMandatoryCount} attribute ที่ Lazada บังคับ (Required) แต่ยังไม่ได้แมป — สินค้าในหมวดหมู่นี้จะ sync ไม่ผ่าน
                                            </Alert>
                                        )}

                                        {lazadaAttributes && lazadaAttributes.length > 0 && (
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        size="small"
                                                        checked={showMandatoryOnly}
                                                        onChange={(e) => setShowMandatoryOnly(e.target.checked)}
                                                    />
                                                }
                                                label={
                                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                                        แสดงเฉพาะที่ Lazada บังคับ (Required) ({mandatoryAttributesCount})
                                                    </Typography>
                                                }
                                                sx={{ ml: 0 }}
                                            />
                                        )}

                                        {loadingAttributes ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                <CircularProgress size={24} sx={{ color: FIORI.brand }} />
                                            </Box>
                                        ) : visibleLazadaAttributes && visibleLazadaAttributes.length > 0 ? (
                                            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                                <Box component="thead" sx={{ bgcolor: FIORI.headerBg }}>
                                                    <Box component="tr">
                                                        <Box
                                                            component="th"
                                                            sx={{
                                                                p: 1.5,
                                                                textAlign: 'left',
                                                                fontWeight: 600,
                                                                color: FIORI.textPrimary,
                                                                borderBottom: `1px solid ${FIORI.border}`,
                                                            }}
                                                        >
                                                            Lazada Attribute
                                                        </Box>
                                                        <Box
                                                            component="th"
                                                            sx={{
                                                                p: 1.5,
                                                                textAlign: 'left',
                                                                fontWeight: 600,
                                                                color: FIORI.textPrimary,
                                                                borderBottom: `1px solid ${FIORI.border}`,
                                                            }}
                                                        >
                                                            PIM Attribute (ต้นทาง)
                                                        </Box>
                                                    </Box>
                                                </Box>
                                                <Box component="tbody">
                                                    {visibleLazadaAttributes.map((attr) => {
                                                        const isMappable = attr.input_type && MAPPABLE_LAZADA_INPUT_TYPES.includes(attr.input_type);

                                                        return (
                                                            <Box
                                                                component="tr"
                                                                key={attr.name}
                                                                sx={{
                                                                    borderTop: `1px solid ${FIORI.border}`,
                                                                    '&:hover': { bgcolor: FIORI.hover },
                                                                    transition: 'background-color 0.1s ease',
                                                                }}
                                                            >
                                                                <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                                    <Typography fontWeight={600} variant="body2" sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                                                                        {attr.label} {attr.mandatory && <span style={{ color: FIORI.error as unknown as string }}>*</span>}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                                                        {attr.name} ({attr.input_type ?? 'text'})
                                                                    </Typography>
                                                                </Box>
                                                                <Box component="td" sx={{ p: 1.5, verticalAlign: 'middle' }}>
                                                                    {!isMappable ? (
                                                                        <FioriStatus label="ไม่รองรับการแมปอัตโนมัติ" tone="neutral" />
                                                                    ) : (
                                                                        <Stack spacing={1}>
                                                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                                                <Box sx={{ flex: 1, minWidth: 200 }}>
                                                                                    <PimAttributePicker
                                                                                        value={attr.mapped}
                                                                                        disabled={savingAttributeName === attr.name}
                                                                                        typeFilter={attr.input_type === 'img' ? ['image', 'file'] : undefined}
                                                                                        onChange={(val) => {
                                                                                            if (val) {
                                                                                                assignAttribute(attr.name, val);
                                                                                            } else if (attr.mapped) {
                                                                                                clearAttribute(attr.name, attr.mapped.id);
                                                                                            }
                                                                                        }}
                                                                                        placeholder="เลือก PIM attribute..."
                                                                                    />
                                                                                </Box>
                                                                                {savingAttributeName === attr.name && <CircularProgress size={14} sx={{ color: FIORI.brand }} />}
                                                                            </Stack>
                                                                            {attr.input_type && SELECT_LAZADA_INPUT_TYPES.includes(attr.input_type) && attr.mapped && (
                                                                                <Button
                                                                                    size="small"
                                                                                    variant="outlined"
                                                                                    onClick={() => setOptionMappingRow(attr)}
                                                                                    sx={{ ...fioriDefaultSx, alignSelf: 'flex-start', fontSize: '0.75rem', px: 1.25, py: 0.25 }}
                                                                                >
                                                                                    จับคู่ตัวเลือก ({attr.option_mappings.length}/{attr.options.length})
                                                                                </Button>
                                                                            )}
                                                                        </Stack>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                        );
                                                    })}
                                                </Box>
                                            </Box>
                                        ) : lazadaAttributes && lazadaAttributes.length > 0 ? (
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                                                ไม่มี attribute ที่ Lazada บังคับ (Required) เลยในหมวดหมู่นี้
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                                                ยังไม่มีข้อมูล Attributes ในระบบ กรุณากด "Sync Attributes"
                                            </Typography>
                                        )}
                                    </Stack>
                                )}
                            </Paper>

                            {/* Section 3 — Payload Lazada: ฟิลด์ payload ตายตัวของ Lazada เอง
                                (name/price/qty/weight/length/width/height/video) ไม่ผูกกับ
                                หมวดหมู่ไหนเลย ต่างจาก section 2 ที่เป็น category attribute —
                                เลยไม่ต้อง lock ไว้จนกว่าจะแมป Category ก่อนเหมือน section 2 */}
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
                                            แมป PIM Attribute เข้ากับฟิลด์ payload ของ Lazada
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            ฟิลด์ตายตัวของ Lazada เอง (ไม่ใช่ attribute เฉพาะหมวดหมู่แบบ section 2) — ใช้ร่วมกันทุกสินค้า
                                            เปลี่ยนตรงนี้มีผลกับสินค้าทุกตัวในระบบ
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
                                                        Lazada Payload Field
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
                                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                                <Box sx={{ flex: 1, minWidth: 200 }}>
                                                                    <PimAttributePicker
                                                                        value={f.mapped}
                                                                        disabled={savingPayloadField === f.target_field}
                                                                        typeFilter={f.target_field === 'video' ? ['video'] : undefined}
                                                                        onChange={(val) => {
                                                                            if (val) {
                                                                                assignPayloadField(f.target_field, val, f.mapped?.id ?? null);
                                                                            } else if (f.mapped) {
                                                                                clearPayloadField(f.target_field, f.mapped.id);
                                                                            }
                                                                        }}
                                                                        placeholder="เลือก PIM attribute..."
                                                                    />
                                                                </Box>
                                                                {savingPayloadField === f.target_field && <CircularProgress size={14} sx={{ color: FIORI.brand }} />}
                                                            </Stack>
                                                        </Box>
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Box>
                                    )}
                                </Stack>
                            </Paper>
                        </Stack>
                    </Box>
                </Box>

                {optionMappingRow && optionMappingRow.mapped && (
                    <LazadaAttributeOptionMappingDialog
                        open={Boolean(optionMappingRow)}
                        onClose={() => setOptionMappingRow(null)}
                        lazadaAttributeLabel={optionMappingRow.label}
                        pimAttributeId={optionMappingRow.mapped.id}
                        pimAttributeName={optionMappingRow.mapped.name}
                        lazadaAttributeMappingId={optionMappingRow.lazada_attribute_mapping_id}
                        lazadaOptions={optionMappingRow.options}
                        initialMappings={optionMappingRow.option_mappings}
                        onSaved={(newMappings: LazadaAttributeOptionMappingInfo[]) => {
                            const rowName = optionMappingRow.name;
                            setLazadaAttributes((prev) =>
                                prev ? prev.map((a) => (a.name === rowName ? { ...a, option_mappings: newMappings } : a)) : prev,
                            );
                        }}
                    />
                )}
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="แมปสินค้า Lazada" />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* ──── Page Header ──── */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            สินค้า ({products.total})
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            จัดการการแมปหมวดหมู่และ Attributes ของ Lazada ตั้งแต่ระดับสินค้า
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        startIcon={<ArrowBackIcon fontSize="small" />}
                        onClick={() => router.visit('/catalog/marketplace/lazada')}
                        sx={fioriGhostSx}
                    >
                        Lazada Hub
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
