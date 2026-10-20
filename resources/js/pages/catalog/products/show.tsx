import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TuneIcon from '@mui/icons-material/Tune';
// Pilot batch (see resources/js/components/icon.tsx's docblock) — edit/
// chevronRight/expandMore now render via SAP-icons. CalendarToday/OpenInNew
// aren't in the pilot's curated name list yet, so left as MUI icons.
import { Icon } from '@/components/icon';
import {
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
    Tooltip,
    Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/layouts/app-layout';
import { FioriPdfViewer } from '@/components/fiori-pdf-viewer';
import { HistoryPanel } from '@/components/history-panel';
import { TimelinePanel } from '@/components/timeline-panel';
import { localizedLabel, type Translation } from '@/lib/localized-label';
import { useLocale } from '@/hooks/use-locale';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriFormGroup } from '@/components/fiori-form';
import { FIORI, FioriStatus, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriTabsFilledSx } from '@/lib/fiori-style';
import { isProductStatus, PRODUCT_STATUS_LABEL_KEYS, PRODUCT_STATUS_TONES } from '@/lib/product-status';
import { UI_BORDER } from '@/lib/ui-style';

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
    mapped_platforms?: string[];
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    is_required?: boolean;
    is_locale_based?: boolean;
    is_channel_based?: boolean;
    options?: AttributeOption[];
    translations?: Translation[];
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    translations?: Translation[];
    attributes: AttributeItem[];
    /** ตระกูลแอตทริบิวต์ที่ฟิลด์ในกลุ่มนี้มาจาก (ดู ProductController::buildProductFormProps()) */
    families?: { id: number; code: string; name: string | null }[];
}

interface Product {
    id: number;
    sku: string;
    family_id: number;
    family_code: string;
    type: string;
    enabled: boolean;
    show_on_home?: boolean;
    status?: string | null;
    shopee_category_id?: number | null;
    lazada_category_id?: number | null;
    tiktok_category_id?: number | null;
    woocommerce_category_id?: number | null;
    shopee_brand_id?: number | null;
    lazada_brand_id?: number | null;
    tiktok_brand_id?: number | null;
    woocommerce_brand_id?: number | null;
    created_at: string;
    updated_at: string;
}

interface VariantItem {
    id?: number;
    sku: string;
    price: string;
    qty: string;
    attributes?: Record<number, string>;
}

interface ChannelOption {
    id: number;
    code: string;
    name: string | null;
    shop_id?: number | null;
    is_live?: boolean;
}

interface ChannelGroup {
    platform: string;
    channels: ChannelOption[];
}

interface ProductOption {
    id: number;
    sku: string;
    name: string;
}

interface Props {
    product: Product;
    assignedGroups: GroupWithAttributes[];
    /** attribute id → group key ('ungrouped' | group id) → channel key → locale key → value
     * (ดู ProductController::buildProductFormProps() — ชุดเดียวกับหน้าแก้ไข) */
    productValues: Record<number | string, Record<string, Record<string, Record<string | number, string>>>>;
    variants?: VariantItem[];
    channelGroups?: ChannelGroup[];
    /** 3 attribute แบบเดียวกับที่หน้าแก้ไขใช้ (pcatname/psubcatname/productgroupname เรียงตามลำดับนี้เสมอ — ดู ProductController::MASTER_CATEGORY_ATTRIBUTE_CODES) มาเพื่อโชว์แบบอ่านอย่างเดียวคู่กัน 3 ขั้น แทน breadcrumb เดียวแบบเดิม */
    masterCategoryAttributes?: AttributeItem[];
    /** ประเภทสินค้า (producttype) — แสดงในแผงข้อมูลสินค้าเหมือนหน้าแก้ไข */
    productTypeAttribute?: AttributeItem | null;
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
    /** สิทธิ์แยกต่างหากของแผง Sales Channels — ไม่ได้พ่วงกับ products.list_products ทั่วไปอีกต่อไป (ดู routes/catalog.php) */
    canViewSalesChannels?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'VIEW PRODUCT', href: '#' },
];

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function optionValue(opt: AttributeOption): string {
    return opt.code || opt.admin_label || String(opt.id);
}

function optionLabel(opt: AttributeOption): string {
    return opt.admin_label || opt.code || String(opt.id);
}

function resolveStorageUrl(path: string): string {
    return /^https?:\/\//.test(path) || path.startsWith('/') ? path : `/storage/${path}`;
}

function parseGalleryPaths(raw: string): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p !== '') : [];
    } catch {
        return [];
    }
}

// video เพิ่งมาเป็น array ทีหลัง (เดิมเป็น path string เดี่ยวๆ มาตลอด ต่างจาก
// gallery ที่เป็น JSON array มาตั้งแต่ต้น) — ค่าเก่าที่มีอยู่แล้วในระบบตอนนี้
// "ไม่ใช่" JSON เลย ห่อเป็น array ตัวเดียวแทนที่จะคืน [] ว่าง (ไม่งั้นวิดีโอเก่าทุก
// ตัวจะหายไปจากหน้านี้ทันทีที่ deploy ฟีเจอร์นี้)
function parseVideoPaths(raw: string): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p !== '') : [raw];
    } catch {
        return [raw];
    }
}

/** Empty-value placeholder — same wording used everywhere else this file shows "nothing entered". */
function EmptyValue() {
    return (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            (ไม่ได้กรอก)
        </Typography>
    );
}

/**
 * Read-only counterpart to edit.tsx's RenderAttributeInput — same set of
 * `attr.type` branches, but every one just displays the resolved value
 * (text/chip/thumbnail) instead of a form control. Kept as its own function
 * here rather than importing edit.tsx's version since that one is built
 * entirely around editable state (onChange, file pickers, dialogs) that a
 * read page has no use for.
 */
function RenderAttributeValue({ attr, value }: { attr: AttributeItem; value: string }) {
    if (!value) {
        return <EmptyValue />;
    }

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const match = attr.options?.find((opt) => optionValue(opt) === value);
        return <Typography variant="body2">{match ? optionLabel(match) : value}</Typography>;
    }

    if (attr.type === 'textarea') {
        // Rich text is stored as HTML (see edit.tsx's RichTextControl) — render
        // it as-is so formatting (bold/lists/etc.) survives, same as what the
        // editor showed while it was being entered.
        return <Box sx={{ typography: 'body2', '& p': { m: 0 } }} dangerouslySetInnerHTML={{ __html: value }} />;
    }

    if (attr.type === 'boolean' || attr.type === 'checkbox') {
        const checked = value === '1' || value === 'true';
        return (
            <Chip
                label={checked ? 'ใช่' : 'ไม่ใช่'}
                size="small"
                sx={{ bgcolor: checked ? FIORI.successBg : FIORI.neutralBg, color: checked ? FIORI.success : FIORI.textSecondary, fontWeight: 600 }}
            />
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return <Typography variant="body2">{formatLocalDateTime(value) === value ? value : formatLocalDateTime(value)}</Typography>;
    }

    if (attr.type === 'gallery') {
        const paths = parseGalleryPaths(value);
        if (paths.length === 0) return <EmptyValue />;

        return (
            <Stack direction="row" spacing={1} flexWrap="wrap">
                {paths.map((path, i) => (
                    <Box
                        key={i}
                        component="img"
                        src={resolveStorageUrl(path)}
                        alt={`${attr.name} ${i + 1}`}
                        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, border: `1px solid ${UI_BORDER}` }}
                    />
                ))}
            </Stack>
        );
    }

    if (attr.type === 'video') {
        const paths = parseVideoPaths(value);
        if (paths.length === 0) return <EmptyValue />;

        return (
            <Stack direction="row" spacing={1.5} flexWrap="wrap">
                {paths.map((path, i) => (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video key={i} controls src={resolveStorageUrl(path)} style={{ maxWidth: 320, maxHeight: 200, borderRadius: 4 }} />
                ))}
            </Stack>
        );
    }

    if (attr.type === 'image') {
        return (
            <Box
                component="img"
                src={resolveStorageUrl(value)}
                alt={attr.name}
                sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: `1px solid ${UI_BORDER}` }}
            />
        );
    }

    if (attr.type === 'file') {
        const filename = value.split('/').pop() || value;

        // attribute แบบ 'file' รับได้ทุกชนิดไฟล์ (ดู AttributeValueFormatter::format())
        // — preview เป็น FioriPdfViewer ให้เฉพาะไฟล์ที่เป็น .pdf จริงๆ ไฟล์ชนิดอื่น
        // ยังคงเป็นลิงก์เปิดแท็บใหม่ธรรมดาเหมือนเดิม
        if (filename.toLowerCase().endsWith('.pdf')) {
            return (
                <Box sx={{ maxWidth: 480 }}>
                    <FioriPdfViewer src={resolveStorageUrl(value)} title={filename} height={320} />
                </Box>
            );
        }

        return (
            <a href={resolveStorageUrl(value)} target="_blank" rel="noreferrer">
                {filename}
            </a>
        );
    }

    // Default (text/number/price/anything unlisted) — auto-link a bare URL
    // (e.g. a YouTube link stored in a plain text field) since this is a
    // read view with nothing else useful to do with it.
    if (/^https?:\/\//.test(value)) {
        return (
            <a href={value} target="_blank" rel="noreferrer">
                {value}
            </a>
        );
    }

    return <Typography variant="body2">{value}</Typography>;
}

// ระยะเว้นด้านบนของแต่ละ section ตอนเลื่อนไปหา — เท่ากับหน้าแก้ไข (edit.tsx)
const GROUP_SECTION_SCROLL_MARGIN = 80;

/** แถว "ป้าย + ค่า" ของแผงข้อมูลสินค้าด้านขวา */
function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <Box>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                {label}
            </Typography>
            {children}
        </Box>
    );
}

/**
 * หน้าดูสินค้า (อ่านอย่างเดียว) — โครงเดียวกับหน้าแก้ไข (edit.tsx): แท็บ ทั่วไป/ประวัติ แบบพื้นสี,
 * หัวเรื่อง + ปุ่มด้านขวา, แถบแท็บกลุ่มแอตทริบิวต์ที่ติดด้านบน (scroll-spy) และ sidebar เรียง
 * ข้อมูลสินค้า → ช่องทางขาย → หมวดหมู่ → ไทม์ไลน์
 */
export default function ProductShow({
    product,
    assignedGroups,
    productValues,
    variants = [],
    channelGroups = [],
    masterCategoryAttributes = [],
    productTypeAttribute = null,
    publishedShopIds = [],
    canViewHistory = false,
    canViewSalesChannels = false,
}: Props) {
    const { locales, locale: currentLocaleCode, setLocale } = useLocale();
    const { t } = useTranslation('catalog');
    const [tabIndex, setTabIndex] = useState(0);
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<number, boolean>>({});
    const toggleGroupCollapse = (groupId: number) => setCollapsedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
    const [localeMenuAnchor, setLocaleMenuAnchor] = useState<HTMLElement | null>(null);

    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);
    useEffect(() => {
        const matched = locales.find((l) => l.code === currentLocaleCode);
        if (matched && matched.id !== activeLocaleId) {
            setActiveLocaleId(matched.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLocaleCode, locales]);
    const activeLocale = locales.find((l) => l.id === activeLocaleId);

    // ค่าที่ preload มาเป็น scope "ค่าเริ่มต้น (ทุกช่องทาง)" (ดู ProductController::buildProductFormProps())
    // หน้าอ่านอย่างเดียวไม่มีตัวสลับช่องทาง เลยแสดง scope นี้เสมอ
    //
    // ค่าเก็บแยกตามกลุ่มด้วย (attribute เดียวอยู่ได้หลายกลุ่ม แต่ละกลุ่มมีค่าของตัวเอง) — ต้องอ่าน
    // productValues[attr][groupKey]['global'] ไม่ใช่ข้ามชั้นกลุ่มไป
    const getValue = (attr: AttributeItem, groupKey: string = 'ungrouped'): string => {
        const localeKey = attr.is_locale_based ? String(activeLocaleId) : 'default';
        const scope = productValues[attr.id]?.[groupKey]?.['global'];
        return scope?.[localeKey] ?? scope?.['default'] ?? '';
    };

    // ---------------------------------------------------------------- scroll-spy ของแถบแท็บกลุ่ม (เหมือนหน้าแก้ไข)
    const [groupTabIndex, setGroupTabIndex] = useState(0);
    const groupSectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const groupTabBarRef = useRef<HTMLDivElement | null>(null);
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const suppressScrollSpy = useRef(false);

    const scrollToGroup = (idx: number) => {
        suppressScrollSpy.current = true;
        setGroupTabIndex(idx);
        groupSectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            suppressScrollSpy.current = false;
        }, 700);
    };

    useEffect(() => {
        const scrollParent = scrollBodyRef.current;
        if (!scrollParent) return;

        const handleScroll = () => {
            if (suppressScrollSpy.current) return;
            const barBottom = groupTabBarRef.current ? groupTabBarRef.current.getBoundingClientRect().bottom : 0;
            const threshold = barBottom + GROUP_SECTION_SCROLL_MARGIN + 16;
            let activeIdx = 0;
            for (let i = 0; i < groupSectionRefs.current.length; i++) {
                const el = groupSectionRefs.current[i];
                if (el && el.getBoundingClientRect().top <= threshold) activeIdx = i;
            }
            setGroupTabIndex(activeIdx);
        };

        scrollParent.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => scrollParent.removeEventListener('scroll', handleScroll);
    }, [assignedGroups.length, tabIndex]);

    const publishedChannels = channelGroups
        .map((group) => ({
            platform: group.platform,
            channels: group.channels.filter((ch) => ch.shop_id != null && publishedShopIds.includes(ch.shop_id)),
        }))
        .filter((group) => group.channels.length > 0);

    const variantColumns: FioriResponsiveColumn<{ v: VariantItem; index: number }>[] = [
        { key: 'sku', header: t('sku'), priority: 'always', render: (row) => row.v.sku },
        { key: 'price', header: t('price'), priority: 'high', render: (row) => row.v.price || '-' },
        { key: 'qty', header: t('qty'), priority: 'high', render: (row) => row.v.qty || '-' },
    ];

    const productTypeCode = productTypeAttribute ? getValue(productTypeAttribute) : '';
    const productTypeOption = productTypeAttribute?.options?.find((opt) => optionValue(opt) === productTypeCode);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('viewProductHeading', { sku: product.sku })} />
            <Box sx={{ bgcolor: 'background.default', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* แถบแท็บบนสุด */}
                <Box sx={{ bgcolor: FIORI.surface, px: { xs: 2, md: 4 } }}>
                    <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={fioriTabsFilledSx}>
                        <Tab label={t('generalTitle')} />
                        {canViewHistory && <Tab label={t('historyTab')} />}
                    </Tabs>
                </Box>

                {/* หัวเรื่อง + ปุ่ม — โครงเดียวกับหน้าแก้ไข */}
                <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, bgcolor: FIORI.surface, borderBottom: `1px solid ${FIORI.border}`, mb: 0.5 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Tooltip title={t('back')}>
                                <IconButton component={Link} href="/catalog/products" size="small">
                                    <ArrowBackIcon fontSize="small" sx={{ stroke: 'currentColor', strokeWidth: 1 }} />
                                </IconButton>
                            </Tooltip>
                            <Typography variant="h5" fontWeight={700} color="text.primary">
                                {t('viewProductHeading', { sku: product.sku })}
                            </Typography>
                        </Stack>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            {/* ภาษาที่แสดง — ปุ่มขนาดเดียวกับปุ่มอื่นในแถว (เหมือนปุ่ม "ภาษา · ช่องทาง" ของหน้าแก้ไข) */}
                            <Tooltip title={t('editingLocaleHelp')}>
                                <Button
                                    variant="outlined"
                                    startIcon={<TuneIcon fontSize="small" />}
                                    endIcon={<KeyboardArrowDownIcon fontSize="small" />}
                                    onClick={(e) => setLocaleMenuAnchor(e.currentTarget)}
                                    sx={fioriDefaultSx}
                                >
                                    {activeLocale ? activeLocale.display_name || activeLocale.code : ''}
                                </Button>
                            </Tooltip>
                            <Menu anchorEl={localeMenuAnchor} open={Boolean(localeMenuAnchor)} onClose={() => setLocaleMenuAnchor(null)}>
                                {locales.map((loc) => (
                                    <MenuItem
                                        key={loc.id}
                                        selected={loc.id === activeLocaleId}
                                        onClick={() => {
                                            setLocaleMenuAnchor(null);
                                            setLocale(loc.code);
                                        }}
                                    >
                                        {loc.display_name || loc.code}
                                    </MenuItem>
                                ))}
                            </Menu>

                            <Tooltip title={t('previewOnStorefront')}>
                                <Button
                                    variant="outlined"
                                    component="a"
                                    href={`/products/${product.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{ ...fioriDefaultSx, minWidth: 0, px: 1.25 }}
                                    aria-label={t('previewOnStorefront')}
                                >
                                    <OpenInNewIcon fontSize="small" />
                                </Button>
                            </Tooltip>

                            <Button
                                component={Link}
                                href={`/catalog/products/${product.id}/edit`}
                                variant="contained"
                                startIcon={<Icon name="edit" fontSize="small" />}
                                sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                            >
                                {t('editAction')}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                <Box ref={scrollBodyRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 6 }}>
                    {tabIndex === 0 && (
                        <Box sx={{ px: { xs: 2, md: 4 } }}>
                            {/* แถบแท็บกลุ่มแอตทริบิวต์ — ติดด้านบนตอนเลื่อน กดแล้วเลื่อนไปที่กลุ่มนั้น */}
                            {assignedGroups.length > 0 && (
                                <Paper
                                    ref={groupTabBarRef}
                                    variant="outlined"
                                    sx={{ mb: 1, borderRadius: 0, bgcolor: FIORI.surface, position: 'sticky', top: 0, zIndex: 1 }}
                                >
                                    <Tabs
                                        value={groupTabIndex}
                                        onChange={(_, v) => scrollToGroup(v)}
                                        variant="scrollable"
                                        scrollButtons="auto"
                                        sx={{ ...fioriTabsFilledSx, px: 2 }}
                                    >
                                        {assignedGroups.map((group) => (
                                            <Tab key={group.id} label={localizedLabel(group, activeLocaleId)} />
                                        ))}
                                    </Tabs>
                                </Paper>
                            )}

                            <Grid container spacing={3} sx={{ mt: 0 }}>
                                <Grid item xs={12} md={8.5}>
                                    <Stack spacing={3}>
                                        {assignedGroups.map((group, idx) => {
                                            const isGeneral = group.code.toLowerCase() === 'general';
                                            const isSales = group.code.toLowerCase() === 'pricing_packaging';
                                            const groupKey = group.id === 0 ? 'ungrouped' : String(group.id);
                                            const isGroupCollapsed = Boolean(collapsedGroupIds[group.id]);

                                            return (
                                                <Paper
                                                    key={group.id}
                                                    ref={(el: HTMLDivElement | null) => {
                                                        groupSectionRefs.current[idx] = el;
                                                    }}
                                                    sx={{ ...fioriCardSx, p: 3, scrollMarginTop: `${GROUP_SECTION_SCROLL_MARGIN}px` }}
                                                >
                                                    <Stack
                                                        direction="row"
                                                        alignItems="center"
                                                        spacing={0.5}
                                                        onClick={() => toggleGroupCollapse(group.id)}
                                                        sx={{ mb: isGroupCollapsed ? 0 : 2.5, cursor: 'pointer', userSelect: 'none' }}
                                                    >
                                                        <IconButton size="small" sx={{ p: 0.5 }}>
                                                            {isGroupCollapsed ? <Icon name="chevronRight" fontSize="small" /> : <Icon name="expandMore" fontSize="small" />}
                                                        </IconButton>
                                                        <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, flex: 1 }}>
                                                            {localizedLabel(group, activeLocaleId)}
                                                        </Typography>
                                                        {/* ตระกูลที่ฟิลด์ในกลุ่มนี้มาจาก — แบบเดียวกับหน้าแก้ไข */}
                                                        {(group.families ?? []).map((family) => (
                                                            <Chip
                                                                key={family.id}
                                                                size="small"
                                                                variant="outlined"
                                                                label={family.name ?? family.code}
                                                                sx={{ bgcolor: FIORI.brandBg, color: FIORI.brand, fontWeight: 600 }}
                                                            />
                                                        ))}
                                                    </Stack>
                                                    {!isGroupCollapsed && (
                                                        <Stack spacing={2.5}>
                                                            {isGeneral && (
                                                                <InfoRow label={t('sku')}>
                                                                    <Typography variant="body2">{product.sku}</Typography>
                                                                </InfoRow>
                                                            )}

                                                            {group.attributes.length === 0 && !isGeneral && !(isSales && variants.length > 0) && (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                    {t('noAttributesInGroup')}
                                                                </Typography>
                                                            )}

                                                            {group.attributes.map((attr) => (
                                                                <InfoRow key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                                                    <RenderAttributeValue attr={attr} value={getValue(attr, groupKey)} />
                                                                </InfoRow>
                                                            ))}

                                                            {isSales && variants.length > 0 && (
                                                                <Box>
                                                                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                                                        {t('variantsTitle')}
                                                                    </Typography>
                                                                    <FioriResponsiveTable
                                                                        variant="plain"
                                                                        size="small"
                                                                        columns={variantColumns}
                                                                        rows={variants.map((v, index) => ({ v, index }))}
                                                                        getRowKey={(row) => row.v.id ?? `new-${row.index}`}
                                                                    />
                                                                </Box>
                                                            )}
                                                        </Stack>
                                                    )}
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                </Grid>

                                <Grid item xs={12} md={3.5}>
                                    <Stack spacing={3}>
                                        {/* ข้อมูลสินค้า — ชุดเดียวกับแผงของหน้าแก้ไข แบบอ่านอย่างเดียว */}
                                        <FioriFormGroup title={t('productInfo')}>
                                            <InfoRow label={t('publishing')}>
                                                <FioriStatus label={product.enabled ? t('published') : t('unpublished')} tone={product.enabled ? 'success' : 'neutral'} />
                                            </InfoRow>
                                            <InfoRow label={t('showOnHome')}>
                                                <FioriStatus
                                                    label={product.show_on_home ? t('showOnHomeYes') : t('showOnHomeNo')}
                                                    tone={product.show_on_home ? 'success' : 'neutral'}
                                                />
                                            </InfoRow>
                                            <InfoRow label={t('productStatus')}>
                                                {isProductStatus(product.status) ? (
                                                    <FioriStatus label={t(PRODUCT_STATUS_LABEL_KEYS[product.status])} tone={PRODUCT_STATUS_TONES[product.status]} />
                                                ) : (
                                                    <EmptyValue />
                                                )}
                                            </InfoRow>
                                            {productTypeAttribute && (
                                                <InfoRow label={t('masterProductTypeFieldLabel')}>
                                                    {productTypeCode ? (
                                                        <Typography variant="body2">{productTypeOption ? optionLabel(productTypeOption) : productTypeCode}</Typography>
                                                    ) : (
                                                        <EmptyValue />
                                                    )}
                                                </InfoRow>
                                            )}
                                            <InfoRow label={t('updatedAt')}>
                                                <Stack direction="row" spacing={0.75} alignItems="center">
                                                    <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                    <Typography variant="body2">{formatLocalDateTime(product.updated_at)}</Typography>
                                                </Stack>
                                            </InfoRow>
                                            <InfoRow label={t('createdAt')}>
                                                <Stack direction="row" spacing={0.75} alignItems="center">
                                                    <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                    <Typography variant="body2">{formatLocalDateTime(product.created_at)}</Typography>
                                                </Stack>
                                            </InfoRow>
                                        </FioriFormGroup>

                                        {/* ช่องทางขาย — มีสิทธิ์แยกของตัวเอง (sales_channels) ดู routes/catalog.php */}
                                        {canViewSalesChannels && (
                                            <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                                <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                    {t('salesChannels')}
                                                </Typography>
                                                {publishedChannels.length > 0 ? (
                                                    <Stack spacing={1.5}>
                                                        {publishedChannels.map((group) => (
                                                            <InfoRow key={group.platform} label={group.platform}>
                                                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                                    {group.channels.map((ch) => (
                                                                        <Chip
                                                                            key={ch.id}
                                                                            label={ch.is_live ? `${ch.name || ch.code} · ${t('liveLabel')}` : ch.name || ch.code}
                                                                            size="small"
                                                                            sx={{
                                                                                bgcolor: ch.is_live ? FIORI.successBg : FIORI.headerBg,
                                                                                color: ch.is_live ? FIORI.success : FIORI.textSecondary,
                                                                                fontWeight: 600,
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Stack>
                                                            </InfoRow>
                                                        ))}
                                                    </Stack>
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        {t('noPublishedChannels')}
                                                    </Typography>
                                                )}
                                            </Paper>
                                        )}

                                        {/* หมวดหมู่ / หมวดหมู่ย่อย / กลุ่มสินค้า — ค่าเก็บที่ 'ungrouped'/'default' เสมอ */}
                                        {masterCategoryAttributes.length > 0 && (
                                            <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                                <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                    {t('masterCategoriesBlockTitle')}
                                                </Typography>
                                                <Stack spacing={2}>
                                                    {masterCategoryAttributes.map((attr) => (
                                                        <InfoRow key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                                            <RenderAttributeValue attr={attr} value={getValue(attr)} />
                                                        </InfoRow>
                                                    ))}
                                                </Stack>
                                            </Paper>
                                        )}

                                        {canViewHistory && (
                                            <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                                <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                    {t('timelineTitle')}
                                                </Typography>
                                                <Box sx={{ maxHeight: 480, overflowY: 'auto', pr: 0.5 }}>
                                                    <TimelinePanel timelineUrl={`/catalog/products/${product.id}/timeline`} />
                                                </Box>
                                            </Paper>
                                        )}
                                    </Stack>
                                </Grid>
                            </Grid>
                        </Box>
                    )}

                    {tabIndex === 1 && canViewHistory && (
                        <Box sx={{ px: { xs: 2, md: 4 }, pt: 2 }}>
                            <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />
                        </Box>
                    )}
                </Box>
            </Box>
        </AppLayout>
    );
}
