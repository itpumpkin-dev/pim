import { QuickAddOptionDialog } from '@/components/catalog/quick-add-option-dialog';
import { CategoryCascadeSelect } from '@/components/category-cascade-select';
import { MarketplaceBrandPicker } from '@/components/marketplace-brand-picker';
import { MarketplaceCategoryPicker } from '@/components/marketplace-category-picker';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { HistoryPanel } from '@/components/history-panel';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import RichTextEditor from '@/components/rich-text-editor';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { localizedLabel, type Translation } from '@/lib/localized-label';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';
import { mappedChipSx, solidActionSx, UI_BORDER, UI_BORDER_STRONG } from '@/lib/ui-style';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkIcon from '@mui/icons-material/Link';
import PublishIcon from '@mui/icons-material/Publish';
import TranslateIcon from '@mui/icons-material/Translate';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';

// ใช้ชุดสีวนซ้ำ 4 สีแบบเดียวกับ MAPPED_PLATFORMS ใน category-cascade-select.tsx /
// MAPPED_PLATFORMS ใน categories/index.tsx (Lazada, Shopee, TikTok,
// WooCommerce) — ที่นี่แยกก็อปปี้เก็บไว้เอง ตามแนวทางเดิมที่ "เล็กพอจะก็อปปี้ซ้ำได้"
const BRAND_MAPPED_PLATFORMS: { value: string; label: string; color: string }[] = [
    { value: 'lazada', label: 'Lazada', color: PALETTE.accent },
    { value: 'shopee', label: 'Shopee', color: PALETTE.highlight },
    { value: 'tiktok', label: 'TikTok', color: PALETTE.primary },
    { value: 'woocommerce', label: 'WooCommerce', color: PALETTE.secondary },
];

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
    /** ตัวเลือกนี้ (เช่น ค่าของ `pbrand`) ถูก map ไปยัง marketplace ไหนแล้วบ้าง — ดูที่ ProductController::decorateOptionsWithMappedPlatforms() */
    mapped_platforms?: string[];
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    is_required?: boolean;
    is_unique?: boolean;
    is_locale_based?: boolean;
    is_channel_based?: boolean;
    swatch_type?: string | null;
    options?: AttributeOption[];
    /** เป็น false เมื่อ role ของผู้ใช้ปัจจุบันมีสิทธิ์แค่ดู (ไม่ใช่แก้ไข) ในแอตทริบิวต์นี้ — ดูที่ "Attribute Access" ในฟอร์ม Role ถ้าไม่มีค่าหรือเป็น true คือแก้ไขได้ (เผื่อความเข้ากันได้กับของเก่า) */
    editable?: boolean;
    /** family id ที่แอตทริบิวต์นี้ถูกผูกไว้ด้วย — ใช้จำกัดขอบเขตของ variant-attribute picker ให้ตรงกับ family ของสินค้านั้นๆ */
    family_ids?: number[];
    /** label ของทุก locale — ทำให้ชื่อที่แสดงเปลี่ยนได้ทันทีตอนสลับ locale โดยไม่ต้องรอ round-trip ไปเซิร์ฟเวอร์เพื่อ resolve `name` ใหม่ */
    translations?: Translation[];
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    translations?: Translation[];
    attributes: AttributeItem[];
}

interface AttributeFamily {
    id: number;
    code: string;
    name?: string;
    translations?: Translation[];
}

interface ChannelOption {
    id: number;
    code: string;
    name: string | null;
    shop_id?: number | null;
    is_live?: boolean;
    live_synced_at?: string | null;
}

interface ChannelGroup {
    platform: string;
    channels: ChannelOption[];
}

interface Product {
    id: number;
    sku: string;
    family_id: number;
    family_code: string;
    type: string;
    enabled: boolean;
    configurable_attributes?: number[];
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
    translation_completeness?: number | null;
}

interface VariantItem {
    id?: number;
    sku: string;
    price: string;
    qty: string;
    /** attribute_id -> option code บอกว่า variant นี้เป็นชุดค่าผสมไหน (เช่น สี: แดง, ไซส์: M) ถ้าว่างหรือไม่มีค่าแปลว่าเป็น variant ที่เพิ่มเองด้วยมือ ไม่ได้ผูกกับชุดค่าผสมที่ generate ไว้ */
    attributes?: Record<number, string>;
}

interface Props {
    product: Product;
    families: AttributeFamily[];
    assignedGroups: GroupWithAttributes[];
    productValues: Record<number | string, Record<string, Record<string | number, string>>>;
    variants?: VariantItem[];
    configurableAttributes?: AttributeItem[];
    channels?: ChannelOption[];
    channelGroups?: ChannelGroup[];
    categoryIds?: number[];
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
}

type AttributeValue = string | File | (string | File)[];

// values: attribute_id -> channelKey ('global' หรือ channel id) -> localeKey ('default' หรือ locale id) -> value
interface ProductForm {
    sku: string;
    family_id: number;
    type: string;
    enabled: boolean;
    values: Record<string | number, Record<string, Record<string | number, AttributeValue>>>;
    variants: VariantItem[];
    configurable_attributes: number[];
    category_ids: number[];
    shopee_category_id: number | null;
    lazada_category_id: number | null;
    tiktok_category_id: number | null;
    woocommerce_category_id: number | null;
    shopee_brand_id: number | null;
    lazada_brand_id: number | null;
    tiktok_brand_id: number | null;
    woocommerce_brand_id: number | null;
    published_shop_ids: number[];
    associations: { related: number[]; up_sell: number[]; cross_sell: number[] };
    [key: string]: any;
}

// `product.created_at`/`updated_at` เป็นรูปแบบ ISO 8601 ที่ระบุ UTC offset ชัดเจน
// (ดูที่ ProductController::edit()) ฟังก์ชันนี้แปลงให้เป็นเวลาท้องถิ่นของผู้ดู
// แทนที่จะโชว์ค่า UTC ดิบๆ ตรงๆ
function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function cartesian(sets: any[][]): any[][] {
    return sets.reduce((acc, set) => acc.flatMap((x) => set.map((y) => [...x, y])), [[]]);
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'EDIT PRODUCT', href: '#' },
];

export default function ProductEdit({
    product,
    families,
    assignedGroups,
    productValues,
    variants = [],
    configurableAttributes = [],
    channels = [],
    channelGroups = [],
    categoryIds = [],
    publishedShopIds = [],
    associations = { related: [], up_sell: [], cross_sell: [] },
    canViewHistory = false,
}: Props) {
    const { locales, locale: currentLocaleCode, setLocale } = useLocale();
    const { t } = useTranslation('catalog');
    const { auth } = usePage<SharedData>().props;
    const canAddAttributeOptions = auth.permissions.includes('attributes.edit_attributes');
    // pbrand จะอยู่ใน family group ไหนก็ได้ที่มันถูกผูกไว้ เหมือน attribute ทั่วไป —
    // ที่ดึงออกมาตรงนี้เพื่อให้ render เป็น panel ของตัวเอง (ต่อจาก Categories)
    // แทนที่จะวนแสดงในลูปของ attribute-groups ทั่วไป ดูเงื่อนไข
    // `attr.code === 'pbrand'` ที่กันมันออกในลูปด้านล่างประกอบด้วย
    const brandAttr = useMemo(() => {
        for (const group of assignedGroups) {
            const found = group.attributes.find((attr) => attr.code === 'pbrand');
            if (found) return found;
        }
        return null;
    }, [assignedGroups]);
    const [tabIndex, setTabIndex] = useState(0);
    // แท็บย่อยภายในแท็บหลัก "General" ใช้จัดกลุ่มเนื้อหาฟอร์มฝั่งคอลัมน์ซ้าย —
    // ลำดับอ้างอิงตาม layout ต้นแบบ: General info -> Attributes -> Details ->
    // Sales info -> Shipping -> Others ส่วน sidebar ฝั่งขวา (Product Info/
    // Categories/Associations/Sales Channels) ไม่เกี่ยวกับแท็บพวกนี้ — จะโชว์
    // ตลอดไม่ว่าแท็บย่อยไหนจะ active อยู่ ตามที่ตกลงกันไว้ชัดเจนแล้ว (คงไว้แบบเดิม
    // ไม่เอาไปรวมกับแท็บ)
    //
    // ทุกกลุ่ม (group) จะ render เรียงต่อกันในหน้าเดียวพร้อมกันหมด (ไม่ได้สลับโชว์
    // ทีละกลุ่ม) — แถบแท็บทำหน้าที่เป็น scroll-spy nav: คลิกแท็บจะ smooth-scroll
    // ไปยัง section นั้น และตอน scroll หน้าเอง แท็บที่ไฮไลต์ก็จะเปลี่ยนตามว่า
    // section ไหนอยู่ใต้แถบแท็บที่ sticky อยู่ตอนนั้น
    const [groupTabIndex, setGroupTabIndex] = useState(0);
    const groupSectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const groupTabBarRef = useRef<HTMLDivElement | null>(null);
    // พื้นที่ที่ scroll ได้ของเนื้อหาทั้งหน้านี้ — ดู JSX ด้านล่าง ("Scrollable Body")
    // ทุกอย่างที่อยู่เหนือมัน (header breadcrumb จาก layout, แท็บบนสุดของหน้านี้ +
    // toolbar SKU/Save) จะอยู่นอกกล่องนี้ทั้งหมด เลยโชว์ตลอดโดยไม่ต้องใช้ sticky
    // positioning หรือคำนวณความสูง header ตอน runtime เลย — มีแค่ส่วนที่ตั้งใจ
    // ให้ scroll ได้จริงๆ (แท็บกลุ่ม + section ที่เรียงต่อกัน + sidebar) เท่านั้นที่
    // อยู่ข้างในนี้
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    // การไฮไลต์แท็บตาม scroll จะถูกปิดชั่วคราวหลังจากคลิกแท็บแล้วเรียก
    // scrollIntoView เอง — ไม่งั้น event scroll ที่เกิดจาก smooth-scroll จะมาแย่งกับ
    // การคลิกว่าสุดท้ายแท็บไหนจะถูกไฮไลต์
    const suppressScrollSpy = useRef(false);
    // ปุ่มลอย "กลับขึ้นบนสุด" — จะโผล่มาก็ต่อเมื่อผู้ใช้ scroll ลงมาไกลพอสมควรแล้ว
    // เพราะปุ่มลอยแบบนี้ควรมีพื้นที่หน้าจอก็ต่อเมื่อการ scroll กลับขึ้นไปเองมันเริ่มลำบากจริงๆ
    const [showScrollTop, setShowScrollTop] = useState(false);
    // เปิด/ปิด (collapse) เนื้อหาของแต่ละ group panel (ข้อมูลทั่วไป/คุณลักษณะ/ฯลฯ)
    // แยกอิสระต่อ group — คลิกที่ header ของ panel เพื่อพับ/กาง เก็บด้วย group.id
    // เป็น key, ค่าเริ่มต้น (key ไม่มีใน object) ถือว่ากางอยู่ (ไม่ collapsed) ผลคือ
    // ทุก panel เปิดโชว์ตามปกติจนกว่าผู้ใช้จะคลิกพับเอง — ref บน Paper (ใช้โดย
    // scroll-spy ด้านบน) ยังอยู่ที่กล่องนอกเหมือนเดิม ไม่ถูกกระทบตอน collapse
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<number, boolean>>({});
    const toggleGroupCollapse = (groupId: number) => {
        setCollapsedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const scrollToGroup = (idx: number) => {
        suppressScrollSpy.current = true;
        setGroupTabIndex(idx);
        groupSectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            suppressScrollSpy.current = false;
        }, 700);
    };

    const scrollToTop = () => {
        scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    useEffect(() => {
        const scrollParent = scrollBodyRef.current;
        if (!scrollParent) return;

        const handleScroll = () => {
            setShowScrollTop(scrollParent.scrollTop > 400);

            if (suppressScrollSpy.current) return;

            // section ที่ขอบบนเพิ่งจะข้ามเส้นนี้ล่าสุด (คือ section สุดท้ายที่ยัง <=
            // threshold) คือ section ที่ผู้ใช้กำลังอ่านอยู่ — threshold คือขอบล่าง
            // ของแถบแท็บที่ sticky อยู่ ดังนั้น section จะถือว่า "active" ทันทีที่มัน
            // เลื่อนเข้าไปซ่อนใต้แถบแท็บ ไม่ต้องรอให้เลื่อนขึ้นไปสุดจริงๆ ก่อน
            const threshold = groupTabBarRef.current ? groupTabBarRef.current.getBoundingClientRect().bottom : 0;
            let activeIdx = 0;
            for (let i = 0; i < groupSectionRefs.current.length; i++) {
                const el = groupSectionRefs.current[i];
                if (!el) continue;
                if (el.getBoundingClientRect().top <= threshold) {
                    activeIdx = i;
                }
            }
            setGroupTabIndex(activeIdx);
        };

        scrollParent.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => scrollParent.removeEventListener('scroll', handleScroll);
    }, [assignedGroups.length]);

    const [relatedProducts, setRelatedProducts] = useState<ProductOption[]>(associations.related);
    const [upSellProducts, setUpSellProducts] = useState<ProductOption[]>(associations.up_sell);
    const [crossSellProducts, setCrossSellProducts] = useState<ProductOption[]>(associations.cross_sell);

    // หา locale ID ที่ตรงกับภาษาของระบบตอนนี้
    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);

    // ซิงค์ activeLocaleId เมื่อ currentLocaleCode เปลี่ยน (ผู้ใช้เปลี่ยนภาษาระบบที่ dropdown ด้านบน)
    useEffect(() => {
        const matched = locales.find((l) => l.code === currentLocaleCode);
        if (matched && matched.id !== activeLocaleId) {
            startScopeTransition(() => setActiveLocaleId(matched.id));
        }
    }, [currentLocaleCode, locales]);

    // ฝั่งเซิร์ฟเวอร์จะ preload ค่าของ channel นี้ (channel แรก) ให้ครบทุก locale
    // (ดู $defaultChannelId ใน ProductController::edit()) นอกเหนือจากค่าของ scope
    // Default (All Channels) ที่ preload มาให้เสมออยู่แล้ว — พอสลับไปช่องทางอื่นถึงจะ
    // ยิง fetch ค่าฟิลด์ที่ scope ได้ใหม่
    const defaultChannelId = channels.length > 0 ? channels[0].id : null;
    // เริ่มต้นที่ Default (All Channels) แทนที่จะเป็น channel แรก — เพราะการแก้ไข
    // ส่วนใหญ่ตั้งใจให้มีผลกับทุกช่องทาง เลยเป็นค่าเริ่มต้นที่ปลอดภัยกว่าให้แก้ไข
    // ส่วนการเลือก channel เฉพาะเจาะจงคือการ override แบบตั้งใจ ไม่ใช่กรณีปกติทั่วไป
    const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

    // ทุกกลุ่ม platform จะเริ่มแบบพับเก็บไว้ก่อน — เพราะ scope ที่ active ตอนโหลด
    // หน้าคือ "Default (All Channels)" (ดู activeChannelId ด้านบน) ซึ่งไม่ได้
    // อยู่ใน platform group ไหนเลย เลยไม่มีกลุ่มไหนที่ควรกางไว้เป็น "ตัวที่ active" อีกต่อไป
    const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
    const togglePlatform = (platform: string) => {
        setExpandedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    };

    // การสลับ locale/channel จะทำให้ทุกฟิลด์ในฟอร์มใหญ่นี้ re-render ใหม่หมด การเลื่อน
    // อัปเดตนี้ออกไปผ่าน transition ช่วยให้ตัว select เองยัง responsive ทันทีอยู่
    // และเราโชว์ indicator ว่ากำลังโหลดได้ แทนที่ UI จะค้างเงียบๆ
    const [isSwitchingScope, startScopeTransition] = useTransition();
    const handleChannelChange = (nextChannelId: number | null) => {
        startScopeTransition(() => setActiveChannelId(nextChannelId));
    };

    // รวบรวมค่าเริ่มต้นของ attribute จริงทั้งหมด (ฝั่ง backend จัดเป็น channel -> locale ให้แล้ว)
    const initialValues: Record<string, Record<string, Record<string | number, any>>> = {};
    assignedGroups.forEach((group) => {
        group.attributes.forEach((attr) => {
            initialValues[attr.id] = (productValues[attr.id] as any) || {};
        });
    });

    const { data, setData, post, transform, processing, errors, isDirty } = useForm<ProductForm>({
        sku: product.sku || '',
        family_id: product.family_id,
        type: (product.type || 'simple').toLowerCase(),
        enabled: Boolean(product.enabled),
        values: initialValues,
        variants: variants,
        configurable_attributes: product.configurable_attributes ?? [],
        category_ids: categoryIds,
        shopee_category_id: product.shopee_category_id ?? null,
        lazada_category_id: product.lazada_category_id ?? null,
        tiktok_category_id: product.tiktok_category_id ?? null,
        woocommerce_category_id: product.woocommerce_category_id ?? null,
        shopee_brand_id: product.shopee_brand_id ?? null,
        lazada_brand_id: product.lazada_brand_id ?? null,
        tiktok_brand_id: product.tiktok_brand_id ?? null,
        woocommerce_brand_id: product.woocommerce_brand_id ?? null,
        published_shop_ids: publishedShopIds,
        associations: {
            related: associations.related.map((p) => p.id),
            up_sell: associations.up_sell.map((p) => p.id),
            cross_sell: associations.cross_sell.map((p) => p.id),
        },
    });

    // สลับได้แค่ทางเดียวว่าจะให้ "System Categories" (PIM category tree ด้านล่าง
    // ที่ผูก mapping ระดับ category กับทุก platform ไว้เป็นค่า default) หรือ
    // "Marketplace Categories" (override เฉพาะรายสินค้าต่อแพลตฟอร์ม) เป็นตัวที่
    // ใช้งานจริงสำหรับสินค้านี้ — อีกฝั่งจะแค่ถูก disable (ไม่ถูกล้างค่า) ไม่ใช่ซ่อนไป
    // ค่าเริ่มต้นตั้งเป็น "marketplace" เสมอ (ไม่ว่าสินค้านี้จะเคยตั้ง override ไว้
    // หรือไม่ก็ตาม) ตามที่ต้องการให้หน้า Edit เปิดมาที่แท็บนี้เป็นค่าเริ่มต้น
    const [categorySource, setCategorySource] = useState<'system' | 'marketplace'>('marketplace');

    // เหตุผลเดียวกับ categorySource ด้านบน แต่สำหรับ Brand แยกต่างหาก — สินค้าอาจ
    // ใช้ System Categories สำหรับหมวดหมู่ แต่ยังอยาก override เฉพาะ Brand ต่อ
    // แพลตฟอร์มก็ได้ (หรือกลับกัน) เลยไม่ผูกโหมดทั้งสองไว้ด้วยกัน — ค่าเริ่มต้นเป็น
    // "marketplace" เสมอเหมือนกัน
    const [brandSource, setBrandSource] = useState<'system' | 'marketplace'>('marketplace');

    const toggleShopPublished = (shopId: number) => {
        const current = data.published_shop_ids;
        setData('published_shop_ids', current.includes(shopId) ? current.filter((id) => id !== shopId) : [...current, shopId]);
    };

    // จำกัดตัวเลือกใน variant-attribute picker ให้เหลือแค่ attribute ที่ผูกกับ
    // family ของสินค้านี้จริงๆ — เหตุผลเดียวกับ picker ในหน้า Create
    const familyScopedVariantAttributes = configurableAttributes.filter(
        (attr) => (attr.options || []).length > 0 && (attr.family_ids || []).includes(Number(data.family_id)),
    );

    const optionLabelFor = (attributeId: number, code: string): string => {
        const attr = configurableAttributes.find((a) => a.id === attributeId);
        const opt = attr?.options?.find((o) => (o.code || o.admin_label || String(o.id)) === code);
        return opt?.admin_label || opt?.code || code;
    };

    // variant ที่มีอยู่แล้วจะมีชุดค่าผสม attribute จริงก็ต่อเมื่อถูก generate มาจาก
    // picker นี้ (หรือของหน้า Create) เท่านั้น ส่วนแถวที่เพิ่มเองด้วยมือ หรือแถวที่มี
    // มาก่อนฟีเจอร์นี้จะเกิด ก็จะ fallback ไปเดา label จากส่วนท้ายของ SKU แทน
    const variantLabel = (v: VariantItem): string => {
        const attrs = v.attributes || {};
        const keys = Object.keys(attrs);
        if (keys.length === 0) {
            const suffix = v.sku.replace(data.sku + '-', '');
            return suffix || v.sku;
        }
        return keys.map((k) => optionLabelFor(Number(k), attrs[Number(k)])).join(' / ');
    };

    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [pendingVariantAttrIds, setPendingVariantAttrIds] = useState<number[]>(data.configurable_attributes);

    const openVariantDialog = () => {
        setPendingVariantAttrIds(data.configurable_attributes);
        setVariantDialogOpen(true);
    };

    const selectedVariantAttributeObjects = familyScopedVariantAttributes.filter((attr) => pendingVariantAttrIds.includes(attr.id));

    // การ regenerate จะแทนที่ตาราง variants ทั้งตารางด้วยชุดค่าผสมแบบ cartesian
    // ใหม่จาก options ของ attribute ที่เลือก ชุดค่าผสมไหนที่ยังมีอยู่เหมือนเดิม
    // (เทียบจากชุด attribute_id -> option code ที่ตรงกันเป๊ะ) จะคง id/sku/price/qty
    // เดิมไว้ ส่วนที่เหลือกลายเป็นแถวใหม่หมด และ variant เดิมที่ชุดค่าผสมไม่ถูก
    // generate ออกมาอีกแล้วก็จะถูกตัดทิ้ง (ตอนกด Save จะลบทิ้งจริง เหมือนลบแถวเอง)
    const applyVariantGeneration = () => {
        const selectedAttrs = familyScopedVariantAttributes.filter((attr) => pendingVariantAttrIds.includes(attr.id));

        const optionSets = selectedAttrs.map((attr) =>
            (attr.options || []).map((opt) => ({
                attribute_id: attr.id,
                option_code: opt.code || opt.admin_label || String(opt.id),
            })),
        );

        if (optionSets.length === 0) {
            setData((prev) => ({ ...prev, configurable_attributes: [], variants: [] }));
            setVariantDialogOpen(false);
            return;
        }

        const combos = cartesian(optionSets);
        const generated: VariantItem[] = combos.map((combo) => {
            const combinationAttrs = combo.reduce((acc: Record<number, string>, c: any) => {
                acc[c.attribute_id] = c.option_code;
                return acc;
            }, {});

            const existing = data.variants.find((v) => {
                const vAttrs = v.attributes || {};
                const vKeys = Object.keys(vAttrs);
                return vKeys.length === combo.length && combo.every((c: any) => vAttrs[c.attribute_id] === c.option_code);
            });

            const suffix = combo.map((c: any) => String(c.option_code).toUpperCase()).join('-');

            return {
                id: existing?.id,
                sku: existing?.sku || (data.sku ? `${data.sku}-${suffix}` : suffix),
                price: existing?.price ?? '',
                qty: existing?.qty ?? '',
                attributes: combinationAttrs,
            };
        });

        setData((prev) => ({ ...prev, configurable_attributes: pendingVariantAttrIds, variants: generated }));
        setVariantDialogOpen(false);
    };

    const handleAddBlankVariant = () => {
        setData('variants', [...data.variants, { sku: '', price: '', qty: '', attributes: {} }]);
    };

    const handleRemoveVariant = (index: number) => {
        setData(
            'variants',
            data.variants.filter((_, i) => i !== index),
        );
    };

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // label ของ variant เป็นตัวระบุแถว ส่วน SKU เป็นช่องที่ผู้ใช้ต้องกรอกเอง เลยให้
    // โชว์ทั้งคู่แม้จอมือถือแคบๆ (SKU ตั้งเป็น 'high' ไม่ใช่ 'always' เพื่อให้ยอมหลบ
    // ให้ label ก่อน) ส่วน price/qty เป็นฟิลด์แก้ไขรอง เลยซ่อนก่อนเพื่อน ส่วน action
    // ลบก็ปักหมุดไว้เหมือนคอลัมน์ตัวระบุแถว
    type VariantRow = { v: VariantItem; index: number };
    const variantColumns: FioriResponsiveColumn<VariantRow>[] = [
        {
            key: 'option',
            header: 'ตัวเลือก',
            priority: 'always',
            render: ({ v }) => (
                <Typography component="span" fontWeight={600}>
                    {variantLabel(v)}
                </Typography>
            ),
        },
        {
            key: 'sku',
            header: 'SKU *',
            priority: 'high',
            render: ({ v, index }) => (
                <TextField
                    size="small"
                    required
                    value={v.sku}
                    onChange={(e) => {
                        const updated = [...data.variants];
                        updated[index] = { ...v, sku: e.target.value };
                        setData('variants', updated);
                    }}
                />
            ),
        },
        {
            key: 'price',
            header: 'ราคา',
            priority: 'medium',
            render: ({ v, index }) => (
                <TextField
                    size="small"
                    type="number"
                    value={v.price}
                    onChange={(e) => {
                        const updated = [...data.variants];
                        updated[index] = { ...v, price: e.target.value };
                        setData('variants', updated);
                    }}
                    placeholder="ราคา"
                />
            ),
        },
        {
            key: 'qty',
            header: 'จำนวนสต๊อก (Qty)',
            priority: 'medium',
            render: ({ v, index }) => (
                <TextField
                    size="small"
                    type="number"
                    value={v.qty}
                    onChange={(e) => {
                        const updated = [...data.variants];
                        updated[index] = { ...v, qty: e.target.value };
                        setData('variants', updated);
                    }}
                    placeholder="สต๊อก"
                />
            ),
        },
        {
            key: 'actions',
            header: 'ลบ',
            priority: 'always',
            align: 'right',
            render: ({ index }) => (
                <IconButton size="small" color="error" onClick={() => handleRemoveVariant(index)} aria-label="Remove variant">
                    <DeleteOutlineIcon fontSize="small" />
                </IconButton>
            ),
        },
    ];

    // ถ้าเปลี่ยนประเภทออกจาก Configurable จะลบ variant ลูกทั้งหมดตอน Save
    // (ดู ProductController::update()) เลยต้องให้ confirm ก่อน เพราะย้อนกลับไม่ได้
    // แล้วเมื่อ save ไปแล้ว
    const [pendingSimpleConfirm, setPendingSimpleConfirm] = useState(false);

    const handleTypeChange = (newType: string) => {
        if (data.type.toLowerCase() === 'configurable' && newType.toLowerCase() === 'simple' && data.variants.length > 0) {
            setPendingSimpleConfirm(true);
            return;
        }
        setData('type', newType);
    };

    const confirmSwitchToSimple = () => {
        setData((prev) => ({ ...prev, type: 'simple', variants: [], configurable_attributes: [] }));
        setPendingSimpleConfirm(false);
    };

    // การ push คือการยิง create/update จริงๆ ไปที่ marketplace แบบ live เลย —
    // เลยตั้งใจให้ต้อง confirm ก่อนและต้องกดเองเสมอ (ไม่มีทำอัตโนมัติ) ออกแบบให้
    // ใช้ได้กับทุก platform (Lazada, Shopee, ...) — แต่ละ group ของร้านจะมีชื่อ
    // platform ของตัวเอง (group.platform) ซึ่งใช้เลือก route `delete` เป็น
    // ออปชันเสริม ตอนนี้รองรับแค่ Shopee เท่านั้น (ดู
    // ShopeeProductSyncService::delete() / เงื่อนไข method_exists() ใน
    // SyncProductToMarketplaceJob) — การลบ listing แบบถาวรยังไม่ได้เชื่อมกับ
    // platform อื่นๆ
    const PLATFORM_ROUTES: Record<string, { push: string; deactivate: string; status: string; delete?: string }> = {
        lazada: { push: 'push-lazada', deactivate: 'deactivate-lazada', status: 'lazada-status' },
        shopee: { push: 'push-shopee', deactivate: 'deactivate-shopee', status: 'shopee-status', delete: 'delete-shopee' },
        tiktok: { push: 'push-tiktok', deactivate: 'deactivate-tiktok', status: 'tiktok-status' },
        woocommerce: { push: 'push-woocommerce', deactivate: 'deactivate-woocommerce', status: 'woocommerce-status' },
    };

    const [pushConfirmShop, setPushConfirmShop] = useState<{ id: number; name: string; platform: string } | null>(null);
    const [pushing, setPushing] = useState(false);
    const [pushResult, setPushResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

    // เฉพาะ WooCommerce เท่านั้น: push แค่ชื่อภาษาอังกฤษของสินค้านี้เข้า dictionary
    // ของ TranslatePress — เป็นคนละ action กับการ push listing ด้านบน แต่โชว์อยู่
    // ใน dialog เดียวกัน จะทำได้ก็ต่อเมื่อคำแปลครบ 100% เท่านั้น ทั้งฝั่งนี้ (disable
    // ปุ่ม) และฝั่ง server (บังคับจริงๆ — ดู
    // ProductController::fillWoocommerceTranslationsForProduct())
    const [fillingTranslation, setFillingTranslation] = useState(false);
    const [fillTranslationResult, setFillTranslationResult] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
    const translationComplete = product.translation_completeness === 100;
    // ค่า null แปลว่า "ไม่มีอะไรให้วัด" (เช่น มี locale active แค่ตัวเดียว หรือ
    // family ของสินค้านี้ไม่มี attribute ที่แปลได้เลย) — ต่างจาก 0% ที่แปลว่ายังมีงาน
    // แปลที่วัดได้จริงๆ เหลืออยู่ ถ้าเอาสองกรณีนี้มารวมกันจะกลายเป็นปุ่มที่ disable
    // ถาวรพร้อมข้อความ "0%" ที่ทำให้เข้าใจผิด แทนที่จะบอกตรงๆ ว่าไม่มีอะไรให้ push
    const translationBlockedReason =
        product.translation_completeness == null
            ? t('noTranslatableContentToPush')
            : t('translationMustBeComplete', { percent: product.translation_completeness });

    const closePushDialog = () => {
        setPushConfirmShop(null);
        setFillTranslationResult(null);
    };

    const confirmFillTranslation = () => {
        setFillingTranslation(true);
        setFillTranslationResult(null);

        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/fill-woocommerce-translations`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();
                const messages: Record<string, string> = {
                    upserted: t('translationPushedSuccess'),
                    skipped_no_english_name: t('translationSkippedNoEnglishName'),
                    skipped_not_tracked: t('translationSkippedNotTracked'),
                    not_live_on_woocommerce: t('translationNotLiveOnWoocommerce'),
                };
                const status = body.status as string | undefined;

                if (!res.ok) {
                    setFillTranslationResult({ severity: 'error', message: body.message ?? t('couldNotPushTranslation') });
                } else if (status === 'upserted') {
                    setFillTranslationResult({ severity: 'success', message: messages.upserted });
                } else if (status && messages[status]) {
                    setFillTranslationResult({ severity: 'info', message: messages[status] });
                } else {
                    setFillTranslationResult({ severity: 'error', message: t('unexpectedResponse') });
                }
            })
            .catch(() => {
                setFillTranslationResult({ severity: 'error', message: t('networkErrorPushingTranslation') });
            })
            .finally(() => setFillingTranslation(false));
    };

    // จะทำงานทันทีที่ dialog confirm ของ Push/Deactivate เปิดขึ้นมา — เช็คกับ
    // marketplace ตรงๆ เลย (ไม่ใช้ badge "Live" ที่ cache ไว้ ซึ่งอาจเก่าเท่าที่ sync
    // ครั้งล่าสุด หรืออาจจะยังไม่เคย sync กับสินค้านี้เลยด้วยซ้ำ) เพื่อให้ dialog
    // สะท้อนสถานะจริงล่าสุดก่อนที่จะยืนยันเขียนข้อมูลแบบ live ใช้ร่วมกันทั้งสอง
    // dialog เพราะเปิดได้ทีละอันเท่านั้นอยู่แล้ว
    const [statusCheck, setStatusCheck] = useState<{
        shopId: number;
        loading: boolean;
        is_live?: boolean;
        never_pushed?: boolean;
        status?: string | null;
        error?: string;
    } | null>(null);

    const checkPlatformStatus = (shopId: number, platform: string) => {
        setStatusCheck({ shopId, loading: true });
        const routes = PLATFORM_ROUTES[platform.toLowerCase()];
        if (!routes) {
            setStatusCheck({ shopId, loading: false, error: t('unsupportedPlatform', { platform }) });
            return;
        }

        fetch(`/catalog/products/${product.id}/${routes.status}/${shopId}`, {
            headers: { Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();
                setStatusCheck(res.ok ? { shopId, loading: false, ...body } : { shopId, loading: false, error: body.message });
            })
            .catch(() => setStatusCheck({ shopId, loading: false, error: t('networkErrorCheckingStatus', { platform }) }));
    };

    // Push/deactivate ตอนนี้ทำงานเป็น background job (ดู
    // ProductController::queueMarketplaceSync()) แทนที่จะรันตรงๆ ใน request เลย —
    // เพราะแต่ก่อนถ้า Shopee หรือ Lazada ตอบช้า/ค้าง จะทำให้ web worker ถูกจองไว้
    // นานตามนั้น ตอน POST แรกจะได้แค่ job id กลับมา แล้วฟังก์ชันนี้จะ poll
    // marketplaceSyncJobStatus() ไปเรื่อยๆ จนกว่า job จะพ้นสถานะ queued/processing
    // ใช้ setTimeout ต่อกันเป็นเชน (ไม่ใช้ setInterval) เพื่อไม่ให้ response ที่ตอบช้า
    // มาซ้อนทับกับรอบถัดไป จำกัดไว้ที่ประมาณ 60 วินาที — เกินนั้น job ก็ยังรันอยู่ที่
    // server ต่อไป แค่ไม่รอผลตรงนี้อีกแล้ว
    const POLL_INTERVAL_MS = 1500;
    const POLL_MAX_ATTEMPTS = 40;

    const pollSyncJobStatus = (jobId: number, onDone: (result: { severity: 'success' | 'error'; message: string }) => void) => {
        let attempts = 0;

        const poll = () => {
            attempts++;
            fetch(`/catalog/products/${product.id}/sync-jobs/${jobId}`, {
                headers: { Accept: 'application/json' },
            })
                .then(async (res) => {
                    const body = await res.json();

                    if (!res.ok) {
                        onDone({ severity: 'error', message: body.message ?? t('couldNotCheckSyncJobStatus') });
                        return;
                    }
                    if (body.status === 'completed') {
                        onDone({ severity: 'success', message: body.message });
                        return;
                    }
                    if (body.status === 'failed') {
                        onDone({ severity: 'error', message: body.message ?? t('syncFailed') });
                        return;
                    }

                    if (attempts >= POLL_MAX_ATTEMPTS) {
                        onDone({
                            severity: 'error',
                            message: t('syncStillProcessing'),
                        });
                        return;
                    }
                    setTimeout(poll, POLL_INTERVAL_MS);
                })
                .catch(() => {
                    if (attempts >= POLL_MAX_ATTEMPTS) {
                        onDone({ severity: 'error', message: t('networkErrorCheckingSyncStatus') });
                        return;
                    }
                    setTimeout(poll, POLL_INTERVAL_MS);
                });
        };

        poll();
    };

    const confirmPush = () => {
        if (!pushConfirmShop) return;
        const { id: shopId, platform } = pushConfirmShop;
        const routes = PLATFORM_ROUTES[platform.toLowerCase()];
        if (!routes) return;
        setPushing(true);

        // แอปนี้ไม่มี <meta name="csrf-token">; แต่ VerifyCsrfToken ของ Laravel
        // ก็รับ cookie XSRF-TOKEN ที่มันเซ็ตมาให้ทุก response อยู่แล้ว (ส่งกลับมาเป็น
        // header ด้วย) เลยอ่านจากตรงนั้นแทน
        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/${routes.push}/${shopId}`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_id) {
                    setPushResult({ severity: 'error', message: body.message ?? t('couldNotQueuePush', { platform }) });
                    setPushing(false);
                    closePushDialog();
                    return;
                }

                pollSyncJobStatus(body.job_id, (result) => {
                    setPushResult(result);
                    setPushing(false);
                    closePushDialog();
                });
            })
            .catch(() => {
                setPushResult({ severity: 'error', message: t('networkErrorPushingToPlatform', { platform }) });
                setPushing(false);
                closePushDialog();
            });
    };

    // เหตุผลเดียวกับ push ด้านบนเรื่องเขียนข้อมูลจริง — ต้อง confirm เอง ไม่มี
    // ทำอัตโนมัติ ใช้ pushResult ตัวเดียวกันสำหรับ snackbar แจ้งผล (ข้อความจาก
    // response จะบอกเองว่า "Pushed" หรือ "Deactivated")
    const [deactivateConfirmShop, setDeactivateConfirmShop] = useState<{ id: number; name: string; platform: string } | null>(null);
    const [deactivating, setDeactivating] = useState(false);

    const confirmDeactivate = () => {
        if (!deactivateConfirmShop) return;
        const { id: shopId, platform } = deactivateConfirmShop;
        const routes = PLATFORM_ROUTES[platform.toLowerCase()];
        if (!routes) return;
        setDeactivating(true);

        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/${routes.deactivate}/${shopId}`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_id) {
                    setPushResult({ severity: 'error', message: body.message ?? t('couldNotQueueDeactivation', { platform }) });
                    setDeactivating(false);
                    setDeactivateConfirmShop(null);
                    return;
                }

                pollSyncJobStatus(body.job_id, (result) => {
                    setPushResult(result);
                    setDeactivating(false);
                    setDeactivateConfirmShop(null);
                });
            })
            .catch(() => {
                setPushResult({ severity: 'error', message: t('networkErrorDeactivatingOnPlatform', { platform }) });
                setDeactivating(false);
                setDeactivateConfirmShop(null);
            });
    };

    // ลบแบบถาวร — อันตรายกว่าการ deactivate ชัดเจน (ย้อนกลับไม่ได้เลยแม้แต่จะ
    // push ใหม่) เลยนอกจากต้องผ่าน dialog confirm แบบเดิมแล้ว ยังบังคับให้พิมพ์
    // SKU ของสินค้าเองก่อนถึงจะกดยืนยันได้ (deleteConfirmText) และจะรีเซ็ตทุกครั้ง
    // ที่เปิด/ปิด dialog เพื่อไม่ให้ค่าเก่าค้างไปปนกับร้านอื่น
    const [deleteListingConfirmShop, setDeleteListingConfirmShop] = useState<{ id: number; name: string; platform: string } | null>(null);
    const [deletingListing, setDeletingListing] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const closeDeleteListingDialog = () => {
        setDeleteListingConfirmShop(null);
        setDeleteConfirmText('');
    };

    const confirmDeleteListing = () => {
        if (!deleteListingConfirmShop || deleteConfirmText !== product.sku) return;
        const { id: shopId, platform } = deleteListingConfirmShop;
        const routes = PLATFORM_ROUTES[platform.toLowerCase()];
        if (!routes?.delete) return;
        setDeletingListing(true);

        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/${routes.delete}/${shopId}`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_id) {
                    setPushResult({ severity: 'error', message: body.message ?? t('couldNotQueueDeletion', { platform }) });
                    setDeletingListing(false);
                    closeDeleteListingDialog();
                    return;
                }

                pollSyncJobStatus(body.job_id, (result) => {
                    setPushResult(result);
                    setDeletingListing(false);
                    closeDeleteListingDialog();
                });
            })
            .catch(() => {
                setPushResult({ severity: 'error', message: t('networkErrorDeletingFromPlatform', { platform }) });
                setDeletingListing(false);
                closeDeleteListingDialog();
            });
    };

    // ตัวแปรย่อยของ statusCheck สำหรับแต่ละ dialog — การใช้ `statusCheck &&` แบบตรงๆ
    // (แทนที่จะเทียบแบบ optional-chain ที่ใช้คำนวณค่านี้) คือสิ่งที่ทำให้ TypeScript
    // narrow ตัด case `null` ออกได้จริงๆ ทุกจุดที่เอาไปใช้ด้านล่าง
    const pushStatusCheck = statusCheck && pushConfirmShop && statusCheck.shopId === pushConfirmShop.id ? statusCheck : null;
    const deactivateStatusCheck = statusCheck && deactivateConfirmShop && statusCheck.shopId === deactivateConfirmShop.id ? statusCheck : null;
    const deleteListingStatusCheck =
        statusCheck && deleteListingConfirmShop && statusCheck.shopId === deleteListingConfirmShop.id ? statusCheck : null;

    // หาว่า value ของ attribute ตัวนี้อยู่ใต้ key ไหนบ้าง ตาม channel/locale ที่เลือก
    // อยู่ตอนนี้ โดยดูจาก flag การ scope ของ attribute นั้นเอง
    const getValueKeys = (attr: AttributeItem) => ({
        channelKey: attr.is_channel_based && activeChannelId ? String(activeChannelId) : 'global',
        localeKey: attr.is_locale_based ? String(activeLocaleId) : 'default',
    });

    // useForm() ไม่ได้การันตีว่า setData จะมี identity คงที่ทุก render เลยเก็บมันไว้
    // ใน ref แทนที่จะเป็น dep ของ useCallback — วิธีนี้ทำให้ identity ของ
    // setAttributeValue เองคงที่ตลอด (deps ว่างเปล่า) ไม่ว่า identity ของ setData
    // จะเปลี่ยนหรือไม่ก็ตาม ความคงที่นี่แหละคือจุดสำคัญ: การส่งฟังก์ชันนี้ลงไปเป็น
    // onChange ของฟิลด์ที่ memo ไว้ ไม่ควรทำให้ฟิลด์นั้น re-render เองโดยไม่จำเป็น —
    // เช่นตอนสลับแค่ locale เฉยๆ ที่ channelKey/localeKey/value ของฟิลด์ส่วนใหญ่
    // ไม่ได้เปลี่ยนเลย ถึงแม้ฟอร์มรอบๆ จะ re-render ก็ตาม ใช้ channelKey/localeKey
    // ที่ resolve มาแล้วโดยตรง แทนที่จะไปคำนวณใหม่ผ่าน getValueKeys() เลยไม่ต้อง
    // พึ่ง attr เลย (และไม่โดน invalidate เพราะ attr ด้วย)
    const setDataRef = useRef(setData);
    setDataRef.current = setData;
    const setAttributeValue = useCallback((attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => {
        setDataRef.current((prev) => {
            const attrValues = prev.values[attributeId] || {};
            return {
                ...prev,
                values: {
                    ...prev.values,
                    [attributeId]: {
                        ...attrValues,
                        [channelKey]: {
                            ...(attrValues[channelKey] || {}),
                            [localeKey]: val,
                        },
                    },
                },
            };
        });
    }, []);

    // ตอนสลับ scope จะ re-fetch แค่ฟิลด์ที่เป็น channel/locale-based เท่านั้น
    // ฟิลด์ที่ scope ไม่ได้จะอยู่ใต้ key คงที่ 'global'/'default' เสมอ ไม่มีวันเปลี่ยน
    // ทั้ง scope Default (All Channels) ('none' — preload ไว้ให้เสมอ ไม่มีการกรอง
    // channel ใน query เริ่มต้นของ ProductController::edit()) และ channel แรก
    // (preload มาพร้อมกันเลย) ถูกครอบคลุมไว้ตรงนี้แล้ว ครบทุก locale เพราะตอนนี้
    // หน้าเริ่มที่ Default แทนที่จะเป็น channel แรก แต่ทั้งสองอย่างก็มากับ payload
    // เริ่มต้นอยู่แล้วทั้งคู่
    const visitedCombosRef = useRef<Set<string>>(
        new Set(locales.flatMap((l) => [`none:${l.id}`, ...(defaultChannelId ? [`${defaultChannelId}:${l.id}`] : [])])),
    );
    const [loadingValues, setLoadingValues] = useState(false);

    // เป็น true ตลอดช่วงที่พื้นที่ฟิลด์ยังโชว์ข้อมูลเก่าค้างอยู่: ไม่ว่าจะเป็นตอนกำลัง
    // fetch ค่าใหม่สำหรับคู่ channel/locale (loadingValues) หรือตอน re-render
    // ในเครื่อง ที่มันไป trigger (isSwitchingScope) ส่วน label ของ attribute/group/
    // family/category ตอนนี้ไม่ต้องพึ่งการโหลดเบื้องหลังของ useLocale()
    // (switchingLocale) อีกแล้ว — เพราะ resolve ได้ทันทีจาก `translations` ที่
    // preload มาแล้วของแต่ละ entity เลยไม่มีอะไรต้องรอตอนสลับแค่ภาษาเฉยๆ
    // เลยตั้งใจไม่เอา switchingLocale มารวมไว้ตรงนี้อีกต่อไป
    const isFieldAreaBusy = loadingValues || isSwitchingScope;

    useEffect(() => {
        const comboKey = `${activeChannelId ?? 'none'}:${activeLocaleId}`;
        if (visitedCombosRef.current.has(comboKey)) {
            return;
        }
        visitedCombosRef.current.add(comboKey);

        const params = new URLSearchParams();
        if (activeChannelId) params.set('channel_id', String(activeChannelId));
        params.set('locale_id', String(activeLocaleId));

        setLoadingValues(true);
        fetch(`/catalog/products/${product.id}/attribute-values?${params.toString()}`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (!json?.values) return;

                const allAttributes = assignedGroups.flatMap((g) => g.attributes);

                setData((prev) => {
                    const nextValues = { ...prev.values };
                    Object.entries(json.values as Record<string, string | null>).forEach(([attributeId, value]) => {
                        if (value === null) return;
                        const attr = allAttributes.find((a) => String(a.id) === attributeId);
                        if (!attr) return;
                        const { channelKey, localeKey } = getValueKeys(attr);
                        nextValues[attributeId] = {
                            ...(nextValues[attributeId] || {}),
                            [channelKey]: {
                                ...((nextValues[attributeId] || {})[channelKey] || {}),
                                [localeKey]: value,
                            },
                        };
                    });
                    return { ...prev, values: nextValues };
                });
            })
            .catch(() => {
                // แค่พยายาม fetch ใหม่ ถ้าพลาดก็ปล่อยค่าที่โหลดไว้แล้วไว้เหมือนเดิม ไม่ต้องทำอะไรเพิ่ม
            })
            .finally(() => setLoadingValues(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChannelId, activeLocaleId]);

    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        // PHP ไม่รองรับการ parse body แบบ multipart/form-data สำหรับ request แบบ PUT
        // เลยต้องส่งเป็น POST พร้อมปลอม _method ไว้ เพื่อให้ Laravel route เป็น PUT ให้
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/products/${product.id}`, {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Product | SKU: ${data.sku}`} />
            <Box
                component="form"
                onSubmit={submit}
                sx={{ bgcolor: 'background.default', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
                {/* แถบแท็บบนสุด */}
                <Box
                    sx={{
                        bgcolor: '#fff',
                        // borderBottom: `1px solid ${UI_BORDER}`,
                        px: { xs: 2, md: 4 },
                    }}
                >
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{
                            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem', minWidth: 100 },
                            '& .Mui-selected': { color: 'text.primary' },
                            '& .MuiTabs-indicator': { bgcolor: 'grey.800', height: 3 },
                        }}
                    >
                        <Tab label="General" />
                        {canViewHistory && <Tab label="History" />}
                    </Tabs>
                </Box>

                {/* แถบเครื่องมือย่อยใต้หัวข้อ */}
                <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, bgcolor: '#fff', borderBottom: '1px solid #f1f5f9', mb: 0.5 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                        <Typography variant="h5" fontWeight={700} color="text.primary">
                            Edit Product | SKU: {data.sku}
                        </Typography>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 2,
                                    py: 0.5,
                                    bgcolor: 'grey.100',
                                    border: `1px solid ${UI_BORDER}`,
                                    borderRadius: 1.5,
                                    minHeight: 38,
                                }}
                            >
                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                    {t('editingLocale') || 'Editing Language'}:
                                </Typography>
                                <Select
                                    size="small"
                                    variant="standard"
                                    disableUnderline
                                    value={activeLocaleId}
                                    onChange={(e) => {
                                        // เปลี่ยนตรงนี้จะเปลี่ยนภาษา UI ของทั้งแอปไปด้วย — "ภาษาที่กำลังแก้ไข"
                                        // ของหน้านี้ตั้งใจให้ตาม global locale ตัวเดียวกันเลย (ดู setLocale
                                        // ของ useLocale() ด้านล่าง) ไม่ได้เป็นตัวเลือกแยกเฉพาะหน้านี้
                                        const loc = locales.find((l) => l.id === Number(e.target.value));
                                        if (loc) setLocale(loc.code);
                                    }}
                                    sx={{ fontWeight: 700, color: 'text.primary', '& .MuiSelect-select': { py: 0 } }}
                                >
                                    {locales.map((loc) => (
                                        <MenuItem key={loc.id} value={loc.id}>
                                            {loc.display_name || loc.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>
                            {isFieldAreaBusy && <CircularProgress size={18} thickness={5} />}
                            <Button variant="outlined" size="small" sx={{ color: 'text.secondary', borderColor: UI_BORDER, textTransform: 'none' }}>
                                More
                            </Button>

                            <Button
                                component={Link}
                                href="/catalog/products"
                                variant="outlined"
                                sx={{
                                    color: 'text.secondary',
                                    borderColor: UI_BORDER_STRONG,
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    '&:hover': { borderColor: UI_BORDER_STRONG, bgcolor: 'grey.100' },
                                }}
                            >
                                Back
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{ ...solidActionSx, textTransform: 'none', fontWeight: 700, px: 2.5 }}
                            >
                                {processing ? 'Saving…' : 'Save Product'}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                {/* Scrollable Body — พื้นที่เดียวในหน้านี้ที่ scroll ได้
                    ทุกอย่างที่อยู่เหนือมัน (header breadcrumb จาก layout, แท็บ
                    General/History, toolbar SKU/Save นี้) จะอยู่นอกกล่องนี้ทั้งหมด
                    เลยโชว์ตลอดโดยไม่ต้องใช้ sticky positioning หรือคำนวณความสูง
                    header ตอน runtime เลย */}
                <Box ref={scrollBodyRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 6 }}>
                    {Object.keys(errors).length > 0 && (
                        <Box sx={{ px: { xs: 2, md: 4 }, mb: 3 }}>
                            <Alert severity="error">
                                <Typography variant="body2" fontWeight={700}>
                                    {t('correctErrorsBeforeSaving')}
                                </Typography>
                                {Object.values(errors).map((message, index) => (
                                    <Typography key={index} variant="body2">
                                        {message}
                                    </Typography>
                                ))}
                            </Alert>
                        </Box>
                    )}

                    {/* Layout หลักแบบ 2 คอลัมน์ */}
                    {tabIndex === 0 && (
                        <Box sx={{ px: { xs: 2, md: 4 } }}>
                            <Paper
                                ref={groupTabBarRef}
                                variant="outlined"
                                sx={{
                                    mb: 3,
                                    borderRadius: 0,
                                    bgcolor: '#fff',
                                    position: 'sticky',
                                    // ติดอยู่บนสุดของ scroll container ของตัวเอง (กล่อง
                                    // "Scrollable Body" ด้านบน) — กล่องนั้นเป็นสิ่งเดียวที่
                                    // scroll ได้ในหน้านี้ เลยตั้ง top:0 ตรงนี้ได้เลยโดยไม่ต้อง
                                    // คำนวณความสูง header อะไรเพิ่ม
                                    top: 0,
                                    zIndex: 1,
                                }}
                            >
                                <Tabs
                                    value={groupTabIndex}
                                    onChange={(_, v) => scrollToGroup(v)}
                                    variant="scrollable"
                                    scrollButtons="auto"
                                    sx={{
                                        px: 2,
                                        '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 48 },
                                        '& .Mui-selected': { color: 'text.primary' },
                                        '& .MuiTabs-indicator': { bgcolor: 'grey.800' },
                                    }}
                                >
                                    {assignedGroups.map((group) => (
                                        <Tab key={group.id} label={localizedLabel(group, activeLocaleId)} />
                                    ))}
                                </Tabs>
                            </Paper>
                            <Grid container spacing={3}>
                                {/* พื้นที่หลักฝั่งซ้าย: กลุ่ม Attribute จริงจากฐานข้อมูล */}
                                <Grid item xs={12} md={8.5} sx={{ position: 'relative' }}>
                                    {isFieldAreaBusy && (
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                zIndex: 1,
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'center',
                                                pt: 8,
                                                bgcolor: 'rgba(255,255,255,0.6)',
                                                borderRadius: 2,
                                            }}
                                        >
                                            <CircularProgress size={32} />
                                        </Box>
                                    )}
                                    <Stack
                                        spacing={3}
                                        sx={{
                                            opacity: isFieldAreaBusy ? 0.5 : 1,
                                            pointerEvents: isFieldAreaBusy ? 'none' : 'auto',
                                            transition: 'opacity 0.15s',
                                        }}
                                    >
                                        {/* หนึ่ง panel ต่อหนึ่ง Attribute Group จริง เรียงตามลำดับที่ฝั่ง
                                    backend จัดมาให้แล้ว (ลำดับ group มาตรฐานจาก
                                    ProductController::edit()) — ทุก group จะ render พร้อมกันหมด
                                    (เป็น scroll-spy nav ไม่ใช่แท็บแบบคลิกสลับ) การจับคู่ index กับ
                                    แท็บด้านบนเลยตรงกันเป๊ะโดยธรรมชาติของโค้ด SKU ถูกปักไว้ใน panel
                                    ของ group 'general' (เพราะไม่มีที่อื่นที่เหมาะกว่านี้แล้ว)
                                    ส่วนตาราง variants ถูกปักไว้ใน panel ของ group 'pricing_packaging'
                                    (ข้อมูลราคา/การขาย) เฉพาะสินค้าแบบ configurable เท่านั้น */}
                                        {assignedGroups.map((group, idx) => {
                                            const isGeneral = group.code.toLowerCase() === 'general';
                                            const isSales = group.code.toLowerCase() === 'pricing_packaging';
                                            const visibleAttrs = group.attributes.filter((attr) => {
                                                // pbrand มี panel แยกของตัวเองต่อจาก Categories เลย (ดูด้านล่าง)
                                                // แทนที่จะไปอยู่ตรงไหนก็ได้ที่ลำดับ group ของ family นี้บังเอิญวางไว้
                                                if (attr.code === 'pbrand') {
                                                    return false;
                                                }
                                                if (data.type.toLowerCase() === 'configurable') {
                                                    return attr.code !== 'price' && attr.code !== 'qty';
                                                }
                                                return true;
                                            });

                                            const isGroupCollapsed = Boolean(collapsedGroupIds[group.id]);

                                            return (
                                                <Paper
                                                    key={group.id}
                                                    ref={(el: HTMLDivElement | null) => {
                                                        groupSectionRefs.current[idx] = el;
                                                    }}
                                                    variant="outlined"
                                                    sx={{ p: 3, borderRadius: 2, bgcolor: '#fff', scrollMarginTop: '80px' }}
                                                >
                                                    <Stack
                                                        direction="row"
                                                        alignItems="center"
                                                        spacing={0.5}
                                                        onClick={() => toggleGroupCollapse(group.id)}
                                                        sx={{ mb: isGroupCollapsed ? 0 : 2.5, cursor: 'pointer', userSelect: 'none' }}
                                                    >
                                                        <IconButton size="small" sx={{ p: 0.5 }}>
                                                            {isGroupCollapsed ? (
                                                                <ChevronRightIcon fontSize="small" />
                                                            ) : (
                                                                <ExpandMoreIcon fontSize="small" />
                                                            )}
                                                        </IconButton>
                                                        <Typography variant="h6" fontWeight={700} color="text.primary">
                                                            {localizedLabel(group, activeLocaleId)}
                                                        </Typography>
                                                    </Stack>
                                                    <Collapse in={!isGroupCollapsed}>
                                                        <Stack spacing={2.5}>
                                                            {isGeneral && (
                                                                <TextField
                                                                    label="SKU *"
                                                                    required
                                                                    fullWidth
                                                                    size="small"
                                                                    value={data.sku}
                                                                    onChange={(e) => setData('sku', e.target.value)}
                                                                    error={Boolean(errors.sku)}
                                                                    helperText={errors.sku}
                                                                />
                                                            )}

                                                            {visibleAttrs.length === 0 &&
                                                                !isGeneral &&
                                                                !(isSales && data.type.toLowerCase() === 'configurable') && (
                                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                        No attributes assigned to this group yet.
                                                                    </Typography>
                                                                )}

                                                            {visibleAttrs.map((attr) => {
                                                                const { channelKey, localeKey } = getValueKeys(attr);
                                                                // ถ้า locale นี้ยังไม่มีค่าของตัวเอง จะ fallback ไปใช้ bucket
                                                                // global ('default') แทน — ฟิลด์ที่เป็น locale-based ที่ import
                                                                // เข้ามาจะไปตกอยู่ตรงนั้นก่อน จนกว่าจะมีคนแปลทีละ locale
                                                                // (ดู ProductRowImporter) ถ้าไม่มี fallback นี้ ฟิลด์ที่เพิ่ง
                                                                // import มาจะดูเหมือนว่างเปล่า
                                                                const val =
                                                                    data.values[attr.id]?.[channelKey]?.[localeKey] ??
                                                                    data.values[attr.id]?.[channelKey]?.['default'] ??
                                                                    '';
                                                                const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                                // activeChannelId เป็น null แปลว่า scope "Default (All Channels)"
                                                                // กำลัง active อยู่ (ดูที่ panel Sales Channels) — ฟิลด์ที่เป็น
                                                                // channel-based ที่บันทึกตรงนั้นจะ resolve เป็น channel_id = null
                                                                // ซึ่ง ResolvesProductAttributeValues (ตัว sync Lazada/Shopee/TikTok)
                                                                // จะ fallback มาใช้ค่านี้เมื่อ channel ไหนไม่มี override เป็นของ
                                                                // ตัวเอง เลยถือเป็นค่า default จริงๆ ไม่ใช่ข้อมูลที่ไม่ได้ใช้
                                                                const activeChannelName =
                                                                    activeChannelId === null
                                                                        ? 'Default (All Channels)'
                                                                        : (channels.find((c) => c.id === activeChannelId)?.name ?? undefined);
                                                                return (
                                                                    <RenderAttributeInput
                                                                        key={attr.id}
                                                                        attr={attr}
                                                                        value={val}
                                                                        channelKey={channelKey}
                                                                        localeKey={localeKey}
                                                                        onValueChange={setAttributeValue}
                                                                        label={localizedLabel(attr, activeLocaleId)}
                                                                        activeLocaleCode={activeLocaleCode}
                                                                        activeChannelName={activeChannelName}
                                                                        canAddOptions={canAddAttributeOptions}
                                                                        sku={data.sku}
                                                                        productId={product.id}
                                                                    />
                                                                );
                                                            })}

                                                            {isSales && data.type.toLowerCase() === 'configurable' && (
                                                                <Box>
                                                                    <Stack
                                                                        direction={{ xs: 'column', sm: 'row' }}
                                                                        justifyContent="space-between"
                                                                        alignItems={{ sm: 'center' }}
                                                                        spacing={1.5}
                                                                        sx={{ mb: 2 }}
                                                                    >
                                                                        <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                                                                            ตัวเลือกสินค้าย่อย (Variants List)
                                                                        </Typography>
                                                                        <Stack direction="row" spacing={1}>
                                                                            <Button
                                                                                size="small"
                                                                                variant="outlined"
                                                                                startIcon={<AutorenewIcon fontSize="small" />}
                                                                                onClick={openVariantDialog}
                                                                            >
                                                                                {data.variants.length > 0 ? 'แก้ไขชุด Variant' : 'สร้าง Variant'}
                                                                            </Button>
                                                                            <Button
                                                                                size="small"
                                                                                variant="text"
                                                                                startIcon={<AddIcon fontSize="small" />}
                                                                                onClick={handleAddBlankVariant}
                                                                            >
                                                                                เพิ่มแถวว่าง
                                                                            </Button>
                                                                        </Stack>
                                                                    </Stack>

                                                                    {data.variants.length === 0 ? (
                                                                        <Typography
                                                                            variant="body2"
                                                                            color="text.secondary"
                                                                            sx={{ fontStyle: 'italic' }}
                                                                        >
                                                                            ยังไม่มี variant — กด &quot;สร้าง Variant&quot; เพื่อเลือก attribute (เช่น
                                                                            สี, ไซส์) แล้ว generate ชุดตัวเลือกทั้งหมด
                                                                        </Typography>
                                                                    ) : (
                                                                        <FioriResponsiveTable
                                                                            variant="plain"
                                                                            size="small"
                                                                            columns={variantColumns}
                                                                            rows={data.variants.map((v, index) => ({ v, index }))}
                                                                            getRowKey={(row) => row.v.id ?? `new-${row.index}`}
                                                                        />
                                                                    )}
                                                                </Box>
                                                            )}
                                                        </Stack>
                                                    </Collapse>
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                </Grid>

                                {/* Sidebar ฝั่งขวา */}
                                <Grid item xs={12} md={3.5}>
                                    <Stack spacing={3}>
                                        {/* แผง Product Info */}
                                        <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                            <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                Product Info
                                            </Typography>
                                            <Stack spacing={2}>
                                                <Box>
                                                    <Typography
                                                        variant="caption"
                                                        fontWeight={600}
                                                        color="text.secondary"
                                                        display="block"
                                                        sx={{ mb: 0.5 }}
                                                    >
                                                        Status
                                                    </Typography>
                                                    <Switch
                                                        checked={data.enabled}
                                                        onChange={(e) => setData('enabled', e.target.checked)}
                                                        color="default"
                                                    />
                                                </Box>

                                                <TextField
                                                    select
                                                    label="Family"
                                                    value={data.family_id}
                                                    onChange={(e) => setData('family_id', Number(e.target.value))}
                                                    size="small"
                                                    fullWidth
                                                    error={Boolean(errors.family_id)}
                                                    helperText={
                                                        errors.family_id ||
                                                        'Attribute groups below update the next time you open this product after saving.'
                                                    }
                                                >
                                                    {families.map((fam) => (
                                                        <MenuItem key={fam.id} value={fam.id}>
                                                            {localizedLabel(fam, activeLocaleId)}
                                                        </MenuItem>
                                                    ))}
                                                </TextField>

                                                <TextField
                                                    select
                                                    label="Product Type"
                                                    value={data.type}
                                                    onChange={(e) => handleTypeChange(e.target.value)}
                                                    size="small"
                                                    fullWidth
                                                    error={Boolean(errors.type)}
                                                    helperText={errors.type}
                                                >
                                                    <MenuItem value="simple">Simple</MenuItem>
                                                    <MenuItem value="configurable">Configurable</MenuItem>
                                                </TextField>

                                                <TextField
                                                    label="Updated At"
                                                    value={formatLocalDateTime(product.updated_at)}
                                                    disabled
                                                    size="small"
                                                    fullWidth
                                                    InputProps={{
                                                        endAdornment: <CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                                    }}
                                                />

                                                <TextField
                                                    label="Created At"
                                                    value={formatLocalDateTime(product.created_at)}
                                                    disabled
                                                    size="small"
                                                    fullWidth
                                                    InputProps={{
                                                        endAdornment: <CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                                    }}
                                                />
                                            </Stack>
                                        </Paper>

                                        {/* แผง Categories — สลับได้ว่าจะให้ System Categories (PIM category tree
                                        ที่ mapping ระดับ category เป็นค่า default ให้ทุก platform) หรือ
                                        Marketplace Categories (override เฉพาะรายสินค้าต่อแพลตฟอร์ม) เป็นตัวที่
                                        ใช้งานจริง — ฝั่ง System Categories แค่ disable ไว้เฉยๆ ไม่ล้างค่า
                                        (category_ids มีประโยชน์อื่นนอกเหนือจาก push เช่น storefront/grid filter
                                        เลยต้องคงอยู่เสมอ) แต่สลับกลับไป "System Categories" จะล้างค่า override
                                        ทั้ง 4 platform ทิ้งจริงๆ (ไม่ใช่แค่ disable เฉยๆ) เพราะ field พวกนั้นมีไว้
                                        ทำหน้าที่ override การ push อย่างเดียว ไม่งั้นค่าเก่าจะยังถูกใช้จริงตอน push
                                        อยู่ดี (resolve*CategoryId() ฝั่ง backend เลือก override ก่อนเสมอ) ทั้งที่
                                        UI บอกว่าเปลี่ยนไปใช้ System Categories แล้ว ดู categorySource ด้านบนของ
                                        component นี้ */}
                                        <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }}>
                                                <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                    {t('categoriesBlockTitle')}
                                                </Typography>
                                                <Tooltip
                                                    title={t('categoriesSourceInfoTooltip')}
                                                    arrow
                                                >
                                                    <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                                                </Tooltip>
                                            </Stack>

                                            <ToggleButtonGroup
                                                exclusive
                                                fullWidth
                                                size="small"
                                                value={categorySource}
                                                onChange={(_, next) => {
                                                    if (!next) return;
                                                    setCategorySource(next);
                                                    // เคลียร์ override ทั้ง 4 platform ทิ้งจริงๆ ตอนสลับกลับไปใช้
                                                    // System Categories — field พวกนี้มีหน้าที่ override การ push
                                                    // อย่างเดียว ไม่งั้นค่าเก่าจะยังถูกใช้จริงอยู่ (resolve*CategoryId()
                                                    // ฝั่ง backend เลือก override ก่อนเสมอถ้ายังมีค่าอยู่) ทั้งที่ UI
                                                    // บอกว่าเปลี่ยนมาใช้ System Categories แล้ว — category_ids (PIM)
                                                    // ไม่ต้องเคลียร์แบบเดียวกัน เพราะมีประโยชน์อื่นอยู่ (storefront/
                                                    // grid filter) นอกเหนือจาก push
                                                    if (next === 'system') {
                                                        setData('shopee_category_id', null);
                                                        setData('lazada_category_id', null);
                                                        setData('tiktok_category_id', null);
                                                        setData('woocommerce_category_id', null);
                                                    }
                                                }}
                                                sx={{
                                                    mb: 2.5,
                                                    '& .MuiToggleButton-root': {
                                                        textTransform: 'none',
                                                        fontWeight: 600,
                                                        color: FIORI.textSecondary,
                                                        borderColor: FIORI.border,
                                                        '&.Mui-selected': { bgcolor: FIORI.brand, color: '#fff', '&:hover': { bgcolor: FIORI.brandDark } },
                                                    },
                                                }}
                                            >
                                                <ToggleButton value="system">
                                                    {t('systemCategoriesLabel')}
                                                </ToggleButton>
                                                <ToggleButton value="marketplace">
                                                    {t('marketplaceCategoriesLabel')}
                                                </ToggleButton>
                                            </ToggleButtonGroup>

                                            <Divider sx={{ my: 1 }} />
                                            
                                            <Stack spacing={1}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                        {t('systemCategoriesLabel')}
                                                    </Typography>
                                                    <Button
                                                        component={Link}
                                                        href="/catalog/categories/marketplace-sync"
                                                        size="small"
                                                        startIcon={<LinkIcon fontSize="small" />}
                                                        sx={{ textTransform: 'none' }}
                                                    >
                                                        {t('marketplaceMappingButton')}
                                                    </Button>
                                                </Stack>
                                                <CategoryCascadeSelect
                                                    value={data.category_ids}
                                                    onChange={(ids) => setData('category_ids', ids)}
                                                    disabled={categorySource !== 'system'}
                                                />
                                            </Stack>
                                            <Divider sx={{ mt: 3 }} />
                                            <Stack spacing={1} sx={{ mt: 3 }}>
                                                <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                    {t('marketplaceCategoriesLabel')}
                                                </Typography>
                                                <MarketplaceCategoryPicker
                                                    platform="shopee"
                                                    label="Shopee"
                                                    value={data.shopee_category_id}
                                                    onChange={(id) => setData('shopee_category_id', id)}
                                                    disabled={categorySource !== 'marketplace'}
                                                />
                                                <MarketplaceCategoryPicker
                                                    platform="lazada"
                                                    label="Lazada"
                                                    value={data.lazada_category_id}
                                                    onChange={(id) => setData('lazada_category_id', id)}
                                                    disabled={categorySource !== 'marketplace'}
                                                />
                                                <MarketplaceCategoryPicker
                                                    platform="tiktok"
                                                    label="TikTok"
                                                    value={data.tiktok_category_id}
                                                    onChange={(id) => setData('tiktok_category_id', id)}
                                                    disabled={categorySource !== 'marketplace'}
                                                />
                                                <MarketplaceCategoryPicker
                                                    platform="woocommerce"
                                                    label="WooCommerce"
                                                    value={data.woocommerce_category_id}
                                                    onChange={(id) => setData('woocommerce_category_id', id)}
                                                    disabled={categorySource !== 'marketplace'}
                                                />
                                            </Stack>
                                        </Paper>

                                        {/* แผง Brand — ใช้หลักการเดียวกับ Categories ทุกประการ: สลับได้ว่าจะให้
                                        System Brand (pbrand ที่แยกออกมาจากลูปของ attribute ทั่วไป — ดูเงื่อนไข
                                        `attr.code === 'pbrand'` ที่กันออกด้านบน — mapping ระดับ brand option
                                        เป็นค่า default ให้ทุก platform) หรือ Marketplace Brand (override เฉพาะ
                                        รายสินค้าต่อแพลตฟอร์ม จากชุดแบรนด์จริงที่ sync มา) เป็นตัวที่ใช้งานจริง
                                        ฝั่งที่ไม่ได้เลือกจะถูก dim ไว้เฉยๆ (ไม่ล้างค่า) ยกเว้นสลับกลับไป System
                                        Brand จะล้างค่า override ทั้ง 4 platform ทิ้งจริงๆ เหตุผลเดียวกับ
                                        categorySource: field พวกนี้มีหน้าที่ override การ push อย่างเดียว */}
                                        {brandAttr && (
                                            <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2 }}>
                                                    <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                        {t('brandBlockTitle')}
                                                    </Typography>
                                                    <Tooltip title={t('brandSourceInfoTooltip')} arrow>
                                                        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                                                    </Tooltip>
                                                </Stack>

                                                <ToggleButtonGroup
                                                    exclusive
                                                    fullWidth
                                                    size="small"
                                                    value={brandSource}
                                                    onChange={(_, next) => {
                                                        if (!next) return;
                                                        setBrandSource(next);
                                                        if (next === 'system') {
                                                            setData('shopee_brand_id', null);
                                                            setData('lazada_brand_id', null);
                                                            setData('tiktok_brand_id', null);
                                                            setData('woocommerce_brand_id', null);
                                                        }
                                                    }}
                                                    sx={{
                                                        mb: 2.5,
                                                        '& .MuiToggleButton-root': {
                                                            textTransform: 'none',
                                                            fontWeight: 600,
                                                            color: FIORI.textSecondary,
                                                            borderColor: FIORI.border,
                                                            '&.Mui-selected': { bgcolor: FIORI.brand, color: '#fff', '&:hover': { bgcolor: FIORI.brandDark } },
                                                        },
                                                    }}
                                                >
                                                    <ToggleButton value="system">{t('systemBrandLabel')}</ToggleButton>
                                                    <ToggleButton value="marketplace">{t('marketplaceBrandLabel')}</ToggleButton>
                                                </ToggleButtonGroup>

                                                <Box sx={{ opacity: brandSource === 'system' ? 1 : 0.5, pointerEvents: brandSource === 'system' ? 'auto' : 'none' }}>
                                                    <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                                        {t('systemBrandLabel')}
                                                    </Typography>
                                                    {(() => {
                                                        const { channelKey, localeKey } = getValueKeys(brandAttr);
                                                        const val =
                                                            data.values[brandAttr.id]?.[channelKey]?.[localeKey] ??
                                                            data.values[brandAttr.id]?.[channelKey]?.['default'] ??
                                                            '';
                                                        const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                        const activeChannelName =
                                                            activeChannelId === null
                                                                ? 'Default (All Channels)'
                                                                : (channels.find((c) => c.id === activeChannelId)?.name ?? undefined);
                                                        const stringValue = typeof val === 'string' ? val : '';
                                                        const selectedOption = brandAttr.options?.find((opt) => optionValue(opt) === stringValue) ?? null;
                                                        const mapped = selectedOption?.mapped_platforms ?? [];

                                                        return (
                                                            <Stack spacing={1.5}>
                                                                <RenderAttributeInput
                                                                    attr={brandAttr}
                                                                    value={val}
                                                                    channelKey={channelKey}
                                                                    localeKey={localeKey}
                                                                    onValueChange={setAttributeValue}
                                                                    label={localizedLabel(brandAttr, activeLocaleId)}
                                                                    activeLocaleCode={activeLocaleCode}
                                                                    activeChannelName={activeChannelName}
                                                                    canAddOptions={canAddAttributeOptions}
                                                                    sku={data.sku}
                                                                    productId={product.id}
                                                                />
                                                                {selectedOption && (
                                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {t('marketplaceMappingLabel')}
                                                                        </Typography>
                                                                        {mapped.length > 0 ? (
                                                                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                                                {BRAND_MAPPED_PLATFORMS.filter((p) => mapped.includes(p.value)).map(
                                                                                    (p) => (
                                                                                        <Chip
                                                                                            key={p.value}
                                                                                            label={p.label}
                                                                                            size="small"
                                                                                            sx={{
                                                                                                bgcolor: p.color,
                                                                                                color: '#fff',
                                                                                                fontWeight: 600,
                                                                                                height: 20,
                                                                                                fontSize: 11,
                                                                                            }}
                                                                                        />
                                                                                    ),
                                                                                )}
                                                                            </Stack>
                                                                        ) : (
                                                                            <Typography
                                                                                variant="caption"
                                                                                color="text.disabled"
                                                                                sx={{ fontStyle: 'italic' }}
                                                                            >
                                                                                {t('notMappedToAnyMarketplace')}
                                                                            </Typography>
                                                                        )}
                                                                    </Stack>
                                                                )}
                                                            </Stack>
                                                        );
                                                    })()}
                                                </Box>
                                                <Divider sx={{ mt: 3, mb: 2 }} />
                                                <Stack
                                                    spacing={1}
                                                    sx={{
                                                        mt: 3,
                                                        opacity: brandSource === 'marketplace' ? 1 : 0.5,
                                                        pointerEvents: brandSource === 'marketplace' ? 'auto' : 'none',
                                                    }}
                                                >
                                                    <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                        {t('marketplaceBrandLabel')}
                                                    </Typography>
                                                    <MarketplaceBrandPicker
                                                        platform="shopee"
                                                        label="Shopee"
                                                        value={data.shopee_brand_id}
                                                        onChange={(id) => setData('shopee_brand_id', id)}
                                                        disabled={brandSource !== 'marketplace'}
                                                        shopeeCategoryId={data.shopee_category_id}
                                                    />
                                                    <MarketplaceBrandPicker
                                                        platform="lazada"
                                                        label="Lazada"
                                                        value={data.lazada_brand_id}
                                                        onChange={(id) => setData('lazada_brand_id', id)}
                                                        disabled={brandSource !== 'marketplace'}
                                                    />
                                                    <MarketplaceBrandPicker
                                                        platform="tiktok"
                                                        label="TikTok"
                                                        value={data.tiktok_brand_id}
                                                        onChange={(id) => setData('tiktok_brand_id', id)}
                                                        disabled={brandSource !== 'marketplace'}
                                                    />
                                                    <MarketplaceBrandPicker
                                                        platform="woocommerce"
                                                        label="WooCommerce"
                                                        value={data.woocommerce_brand_id}
                                                        onChange={(id) => setData('woocommerce_brand_id', id)}
                                                        disabled={brandSource !== 'marketplace'}
                                                    />
                                                </Stack>
                                            </Paper>
                                        )}

                                        {/* แผง Associations */}
                                        {/* <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                            <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                Associations
                                            </Typography>

                                            <Stack spacing={2.5}>
                                                <Box>
                                                    <Typography
                                                        variant="caption"
                                                        fontWeight={600}
                                                        color="text.secondary"
                                                        sx={{ mb: 1, display: 'block' }}
                                                    >
                                                        Related Products
                                                    </Typography>
                                                    <ProductPicker
                                                        value={relatedProducts}
                                                        onChange={(next) => {
                                                            setRelatedProducts(next);
                                                            setData('associations', { ...data.associations, related: next.map((p) => p.id) });
                                                        }}
                                                    />
                                                </Box>

                                                <Box>
                                                    <Typography
                                                        variant="caption"
                                                        fontWeight={600}
                                                        color="text.secondary"
                                                        sx={{ mb: 1, display: 'block' }}
                                                    >
                                                        Up-Sell Products
                                                    </Typography>
                                                    <ProductPicker
                                                        value={upSellProducts}
                                                        onChange={(next) => {
                                                            setUpSellProducts(next);
                                                            setData('associations', { ...data.associations, up_sell: next.map((p) => p.id) });
                                                        }}
                                                    />
                                                </Box>

                                                <Box>
                                                    <Typography
                                                        variant="caption"
                                                        fontWeight={600}
                                                        color="text.secondary"
                                                        sx={{ mb: 1, display: 'block' }}
                                                    >
                                                        Cross-Sell Products
                                                    </Typography>
                                                    <ProductPicker
                                                        value={crossSellProducts}
                                                        onChange={(next) => {
                                                            setCrossSellProducts(next);
                                                            setData('associations', { ...data.associations, cross_sell: next.map((p) => p.id) });
                                                        }}
                                                    />
                                                </Box>
                                            </Stack>
                                        </Paper> */}

                                        {/* แผง Sales Channels */}
                                        <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                            <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                Sales Channels
                                            </Typography>
                                            <Stack spacing={0.5}>
                                                {/* การแก้ไขตรงนี้ (activeChannelId = null) คือการตั้งค่า fallback ของ
                                            ฟิลด์ที่เป็น channel-based — channel ไหนด้านล่างที่ไม่มีค่าของตัวเอง
                                            จะใช้ค่านี้แทน เลยไม่ต้องมากรอกซ้ำทีละ channel */}
                                                <Box
                                                    onClick={() => handleChannelChange(null)}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        py: 0.5,
                                                        px: 1.5,
                                                        mb: 0.5,
                                                        borderRadius: 1,
                                                        cursor: 'pointer',
                                                        bgcolor: activeChannelId === null ? FIORI.brand : 'transparent',
                                                        color: activeChannelId === null ? '#fff' : 'text.primary',
                                                        '&:hover': { bgcolor: activeChannelId === null ? FIORI.brandDark : 'action.hover' },
                                                    }}
                                                >
                                                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                                                        Default (All Channels)
                                                    </Typography>
                                                </Box>
                                                {channelGroups.map((group) => {
                                                    const isExpanded = expandedPlatforms.has(group.platform);
                                                    const groupShopIds = group.channels
                                                        .map((c) => c.shop_id)
                                                        .filter((id): id is number => id != null);
                                                    const checkedInGroup = groupShopIds.filter((id) => data.published_shop_ids.includes(id)).length;
                                                    const allInGroupChecked = groupShopIds.length > 0 && checkedInGroup === groupShopIds.length;
                                                    const someInGroupChecked = checkedInGroup > 0 && !allInGroupChecked;

                                                    return (
                                                        <Box key={group.platform}>
                                                            <Box
                                                                onClick={() => togglePlatform(group.platform)}
                                                                sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 0.5,
                                                                    py: 0.75,
                                                                    px: 1,
                                                                    borderRadius: 1,
                                                                    cursor: 'pointer',
                                                                    '&:hover': { bgcolor: 'action.hover' },
                                                                }}
                                                            >
                                                                {isExpanded ? (
                                                                    <ExpandMoreIcon fontSize="small" />
                                                                ) : (
                                                                    <ChevronRightIcon fontSize="small" />
                                                                )}
                                                                {groupShopIds.length > 0 && (
                                                                    <Checkbox
                                                                        size="small"
                                                                        checked={allInGroupChecked}
                                                                        indeterminate={someInGroupChecked}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={() => {
                                                                            setData(
                                                                                'published_shop_ids',
                                                                                allInGroupChecked
                                                                                    ? data.published_shop_ids.filter(
                                                                                          (id) => !groupShopIds.includes(id),
                                                                                      )
                                                                                    : Array.from(
                                                                                          new Set([...data.published_shop_ids, ...groupShopIds]),
                                                                                      ),
                                                                            );
                                                                        }}
                                                                        sx={{ p: 0.5 }}
                                                                    />
                                                                )}
                                                                <Typography variant="body2" fontWeight={700}>
                                                                    {group.platform}
                                                                </Typography>
                                                                <Chip
                                                                    label={group.channels.length}
                                                                    size="small"
                                                                    sx={{ height: 18, fontSize: '0.7rem' }}
                                                                />
                                                                {groupShopIds.length > 0 && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        ({checkedInGroup}/{groupShopIds.length} published)
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                            <Collapse in={isExpanded}>
                                                                <Stack sx={{ pl: 4 }}>
                                                                    {group.channels.map((ch) => {
                                                                        const active = activeChannelId === ch.id;
                                                                        const isShop = ch.shop_id != null;
                                                                        const published =
                                                                            isShop && data.published_shop_ids.includes(ch.shop_id as number);
                                                                        // Push/Deactivate จะไปดู published_shop_ids ที่ *บันทึกไว้จริงๆ*
                                                                        // ฝั่ง backend (product->platformShops() จะอัปเดตก็ต่อเมื่อกด Save
                                                                        // Product เท่านั้น) — แต่ `published` ด้านบนสะท้อนสถานะ checkbox
                                                                        // ที่ยังไม่ได้ save ในเครื่อง ถ้าโชว์ปุ่ม action ทันทีที่ติ๊กเสร็จ
                                                                        // ก่อน save ผู้ใช้จะติ๊กร้านแล้วกด Push ได้ทันที ซึ่ง backend จะ
                                                                        // ปฏิเสธด้วย "not marked as published" เพราะยังไม่ได้บันทึกอะไร
                                                                        // เลย เลยต้องโชว์ action ก็ต่อเมื่อสถานะ checkbox ตรงกับที่บันทึก
                                                                        // ไว้จริงเท่านั้น
                                                                        const savedPublished =
                                                                            isShop && publishedShopIds.includes(ch.shop_id as number);
                                                                        // เฉพาะ platform ที่เชื่อมต่อจริง (มีอยู่ใน PLATFORM_ROUTES)
                                                                        // เท่านั้นถึงจะมี Push/Deactivate — ร้านบน platform ที่ยังไม่ได้
                                                                        // เชื่อมต่อ (หรือจะเชื่อมในอนาคต) ก็ยังตั้ง "published" ได้
                                                                        // (แค่ติ๊ก checkbox) โดยไม่มี API จริงให้ push
                                                                        const canPushOrDeactivate =
                                                                            published &&
                                                                            savedPublished &&
                                                                            group.platform.toLowerCase() in PLATFORM_ROUTES;
                                                                        // มีแค่ทิศทาง "ติ๊กแล้วแต่ยังไม่ได้ save" เท่านั้นที่ควรมี hint เตือน
                                                                        // — เพราะเป็นเคสเดียวที่ปุ่ม push/deactivate จะดูเหมือนใช้ได้แต่จริงๆ
                                                                        // ยังใช้ไม่ได้ ส่วนทิศทางตรงข้าม (ติ๊กออก) ไม่มี action ไหนถูกบล็อก
                                                                        // อยู่ แค่รอ save เฉยๆ
                                                                        const hasUnsavedPublishChange = published && !savedPublished;
                                                                        return (
                                                                            <Box
                                                                                key={ch.id}
                                                                                onClick={() => handleChannelChange(ch.id)}
                                                                                sx={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    py: 0.25,
                                                                                    pr: 1.5,
                                                                                    pl: isShop ? 0.5 : 1.5,
                                                                                    borderRadius: 1,
                                                                                    cursor: 'pointer',
                                                                                    bgcolor: active ? FIORI.brand : 'transparent',
                                                                                    color: active ? '#fff' : 'text.primary',
                                                                                    '&:hover': { bgcolor: active ? FIORI.brandDark : 'action.hover' },
                                                                                }}
                                                                            >
                                                                                {isShop && (
                                                                                    <Checkbox
                                                                                        size="small"
                                                                                        checked={published}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={() => toggleShopPublished(ch.shop_id as number)}
                                                                                        sx={{
                                                                                            color: active ? '#fff' : undefined,
                                                                                            '&.Mui-checked': { color: active ? '#fff' : undefined },
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                <Typography variant="body2" sx={{ flex: 1 }}>
                                                                                    {ch.name || ch.code}
                                                                                </Typography>
                                                                                {ch.is_live && (
                                                                                    <Chip
                                                                                        label="Live"
                                                                                        size="small"
                                                                                        title={
                                                                                            ch.live_synced_at
                                                                                                ? `Confirmed live as of ${new Date(ch.live_synced_at).toLocaleString()}`
                                                                                                : 'Confirmed live on last sync'
                                                                                        }
                                                                                        sx={{
                                                                                            ...mappedChipSx,
                                                                                            height: 20,
                                                                                            fontSize: '0.65rem',
                                                                                            mr: 1,
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                {hasUnsavedPublishChange && (
                                                                                    <Typography
                                                                                        variant="caption"
                                                                                        sx={{
                                                                                            color: active
                                                                                                ? 'rgba(255,255,255,0.8)'
                                                                                                : 'text.secondary',
                                                                                            fontStyle: 'italic',
                                                                                            whiteSpace: 'nowrap',
                                                                                        }}
                                                                                    >
                                                                                        Save first
                                                                                    </Typography>
                                                                                )}
                                                                                {canPushOrDeactivate && (
                                                                                    <IconButton
                                                                                        size="small"
                                                                                        title={`Push to ${group.platform}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setPushConfirmShop({
                                                                                                id: ch.shop_id as number,
                                                                                                name: ch.name || ch.code,
                                                                                                platform: group.platform,
                                                                                            });
                                                                                            checkPlatformStatus(ch.shop_id as number, group.platform);
                                                                                        }}
                                                                                        sx={{ color: active ? '#fff' : FIORI.textSecondary }}
                                                                                    >
                                                                                        <PublishIcon fontSize="small" />
                                                                                    </IconButton>
                                                                                )}
                                                                                {/* ต่างจาก Push (โชว์ได้ตลอดอย่างปลอดภัย — เพราะมันแค่สร้าง
                                                                            หรืออัปเดต) ปุ่ม Deactivate จะมีความหมายก็ต่อเมื่อมีของ
                                                                            live อยู่จริงให้เอาลงเท่านั้น ถ้าไม่มีเช็ค ch.is_live
                                                                            ปุ่มนี้จะโผล่มาแค่เพราะ "ติ๊กว่าจะ publish" เฉยๆ พอกดกับ
                                                                            ร้านที่ติ๊กไว้แต่ไม่เคย push สำเร็จจริง ก็จะไปเจอ error
                                                                            "never been pushed — nothing to deactivate" จาก
                                                                            backend แทนที่จะไม่โชว์ปุ่มไปเลยตั้งแต่แรก */}
                                                                                {canPushOrDeactivate && ch.is_live && (
                                                                                    <IconButton
                                                                                        size="small"
                                                                                        title={`Deactivate on ${group.platform}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setDeactivateConfirmShop({
                                                                                                id: ch.shop_id as number,
                                                                                                name: ch.name || ch.code,
                                                                                                platform: group.platform,
                                                                                            });
                                                                                            checkPlatformStatus(ch.shop_id as number, group.platform);
                                                                                        }}
                                                                                        sx={{ color: active ? '#fff' : 'text.secondary' }}
                                                                                    >
                                                                                        <UnpublishedIcon fontSize="small" />
                                                                                    </IconButton>
                                                                                )}
                                                                                {/* ตอนนี้รองรับแค่ Shopee เท่านั้น (ดู key `delete` ใน
                                                                            PLATFORM_ROUTES กับ ShopeeProductSyncService::delete()) —
                                                                            แยกให้ดูต่างจาก Push/Deactivate ชัดๆ (สีแดง ไอคอนคนละแบบ)
                                                                            เพราะเป็น action ที่อันตรายกว่าชัดเจน: ต่างจาก Deactivate
                                                                            ตรงที่ย้อนกลับไม่ได้เลยแม้จะ push ใหม่ก็ตาม ต้องสร้าง
                                                                            listing ใหม่ทั้งหมดเท่านั้น ใช้เงื่อนไข ch.is_live เดียวกับ
                                                                            Deactivate ด้วยเหตุผลเดียวกัน (ไม่มีของ live ก็ไม่มีอะไรให้ลบ) */}
                                                                                {canPushOrDeactivate &&
                                                                                    ch.is_live &&
                                                                                    group.platform.toLowerCase() === 'shopee' && (
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            title={t('deleteListingButton') + ` — ${group.platform}`}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setDeleteListingConfirmShop({
                                                                                                    id: ch.shop_id as number,
                                                                                                    name: ch.name || ch.code,
                                                                                                    platform: group.platform,
                                                                                                });
                                                                                                checkPlatformStatus(
                                                                                                    ch.shop_id as number,
                                                                                                    group.platform,
                                                                                                );
                                                                                            }}
                                                                                            sx={{ color: active ? '#fff' : 'error.main' }}
                                                                                        >
                                                                                            <DeleteForeverIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    )}
                                                                            </Box>
                                                                        );
                                                                    })}
                                                                </Stack>
                                                            </Collapse>
                                                        </Box>
                                                    );
                                                })}
                                                {channelGroups.length === 0 && (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        No sales channels available.
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Paper>
                                    </Stack>
                                </Grid>
                            </Grid>
                        </Box>
                    )}

                    {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />}
                </Box>
            </Box>

            <Dialog open={pushConfirmShop !== null} onClose={closePushDialog}>
                <DialogTitle>{t('pushToChannelTitle', { platform: pushConfirmShop?.platform })}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('pushToChannelWarning', { platform: pushConfirmShop?.platform, name: pushConfirmShop?.name })}
                    </DialogContentText>
                    {pushStatusCheck && (
                        <Box sx={{ mt: 2 }}>
                            {pushStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t('checkingStatusOn', { platform: pushConfirmShop?.platform })}
                                    </Typography>
                                </Stack>
                            ) : pushStatusCheck.error ? (
                                <Alert severity="warning" sx={{ py: 0 }}>
                                    {t('statusCheckFailed', { error: pushStatusCheck.error })}
                                </Alert>
                            ) : pushStatusCheck.never_pushed ? (
                                <Alert severity="info" sx={{ py: 0 }}>
                                    {t('neverPushedCreateNew')}
                                </Alert>
                            ) : pushStatusCheck.is_live ? (
                                <Alert severity="success" sx={{ py: 0 }}>
                                    {t('currentlyLiveWillUpdate', { platform: pushConfirmShop?.platform })}
                                </Alert>
                            ) : (
                                <Alert severity="info" sx={{ py: 0 }}>
                                    {t('existsNotActiveWillUpdate', {
                                        platform: pushConfirmShop?.platform,
                                        status: pushStatusCheck.status ?? t('statusUnknown'),
                                    })}
                                </Alert>
                            )}
                        </Box>
                    )}
                    {pushConfirmShop?.platform.toLowerCase() === 'woocommerce' && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                                {t('pushTranslationToTranslatePress')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {t('pushTranslationHelp')}
                            </Typography>
                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Tooltip title={translationComplete ? '' : translationBlockedReason}>
                                    <span>
                                        <Button
                                            onClick={confirmFillTranslation}
                                            variant="outlined"
                                            size="small"
                                            disabled={!translationComplete || fillingTranslation}
                                            startIcon={fillingTranslation ? <CircularProgress size={14} /> : <TranslateIcon fontSize="small" />}
                                        >
                                            {fillingTranslation ? t('pushingEllipsis') : t('pushTranslationButton')}
                                        </Button>
                                    </span>
                                </Tooltip>
                                {!translationComplete && (
                                    <Typography variant="caption" color="text.secondary">
                                        {translationBlockedReason}
                                    </Typography>
                                )}
                            </Stack>
                            {fillTranslationResult && (
                                <Alert severity={fillTranslationResult.severity} sx={{ mt: 1.5, py: 0 }}>
                                    {fillTranslationResult.message}
                                </Alert>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closePushDialog} color="inherit" disabled={pushing}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={confirmPush}
                        variant="contained"
                        disabled={pushing}
                        startIcon={pushing ? <CircularProgress size={16} /> : <PublishIcon />}
                        sx={solidActionSx}
                    >
                        {pushing ? t('pushingEllipsis') : t('push')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deactivateConfirmShop !== null} onClose={() => setDeactivateConfirmShop(null)}>
                <DialogTitle>{t('deactivateOnChannelTitle', { platform: deactivateConfirmShop?.platform })}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('deactivateWarning', { platform: deactivateConfirmShop?.platform, name: deactivateConfirmShop?.name })}
                    </DialogContentText>
                    {deactivateStatusCheck && (
                        <Box sx={{ mt: 2 }}>
                            {deactivateStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t('checkingStatusOn', { platform: deactivateConfirmShop?.platform })}
                                    </Typography>
                                </Stack>
                            ) : deactivateStatusCheck.error ? (
                                <Alert severity="warning" sx={{ py: 0 }}>
                                    {t('statusCheckFailed', { error: deactivateStatusCheck.error })}
                                </Alert>
                            ) : deactivateStatusCheck.never_pushed ? (
                                <Alert severity="error" sx={{ py: 0 }}>
                                    {t('neverPushedNothingToDeactivate')}
                                </Alert>
                            ) : !deactivateStatusCheck.is_live ? (
                                <Alert severity="error" sx={{ py: 0 }}>
                                    {t('alreadyNotActiveNothingToDeactivate', {
                                        platform: deactivateConfirmShop?.platform,
                                        status: deactivateStatusCheck.status ?? t('statusUnknown'),
                                    })}
                                </Alert>
                            ) : (
                                <Alert severity="success" sx={{ py: 0 }}>
                                    {t('confirmedCurrentlyLive', { platform: deactivateConfirmShop?.platform })}
                                </Alert>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeactivateConfirmShop(null)} color="inherit" disabled={deactivating}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={confirmDeactivate}
                        color="error"
                        variant="contained"
                        disabled={
                            deactivating ||
                            !deactivateStatusCheck ||
                            deactivateStatusCheck.loading ||
                            (!deactivateStatusCheck.error && (deactivateStatusCheck.never_pushed || !deactivateStatusCheck.is_live))
                        }
                        startIcon={deactivating ? <CircularProgress size={16} /> : <UnpublishedIcon />}
                    >
                        {deactivating ? t('deactivatingEllipsis') : t('deactivate')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteListingConfirmShop !== null} onClose={closeDeleteListingDialog}>
                <DialogTitle sx={{ color: 'error.main' }}>{t('deleteListingTitle', { platform: deleteListingConfirmShop?.platform })}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('deleteListingWarning', { platform: deleteListingConfirmShop?.platform, name: deleteListingConfirmShop?.name })}
                    </DialogContentText>
                    {deleteListingStatusCheck && (
                        <Box sx={{ mt: 2 }}>
                            {deleteListingStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t('checkingStatusOn', { platform: deleteListingConfirmShop?.platform })}
                                    </Typography>
                                </Stack>
                            ) : deleteListingStatusCheck.error ? (
                                <Alert severity="warning" sx={{ py: 0 }}>
                                    {t('statusCheckFailed', { error: deleteListingStatusCheck.error })}
                                </Alert>
                            ) : deleteListingStatusCheck.never_pushed ? (
                                <Alert severity="error" sx={{ py: 0 }}>
                                    {t('neverPushedNothingToDelete')}
                                </Alert>
                            ) : !deleteListingStatusCheck.is_live ? (
                                <Alert severity="error" sx={{ py: 0 }}>
                                    {t('alreadyNotActiveNothingToDelete', {
                                        platform: deleteListingConfirmShop?.platform,
                                        status: deleteListingStatusCheck.status ?? t('statusUnknown'),
                                    })}
                                </Alert>
                            ) : (
                                <Alert severity="success" sx={{ py: 0 }}>
                                    {t('confirmedCurrentlyLive', { platform: deleteListingConfirmShop?.platform })}
                                </Alert>
                            )}
                        </Box>
                    )}
                    {deleteListingStatusCheck &&
                        !deleteListingStatusCheck.loading &&
                        !deleteListingStatusCheck.error &&
                        deleteListingStatusCheck.is_live && (
                            <TextField
                                fullWidth
                                size="small"
                                sx={{ mt: 2.5 }}
                                label={t('deleteListingTypeToConfirm', { sku: product.sku })}
                                placeholder={t('deleteListingConfirmPlaceholder')}
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                autoComplete="off"
                            />
                        )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDeleteListingDialog} color="inherit" disabled={deletingListing}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={confirmDeleteListing}
                        color="error"
                        variant="contained"
                        disabled={
                            deletingListing ||
                            !deleteListingStatusCheck ||
                            deleteListingStatusCheck.loading ||
                            (!deleteListingStatusCheck.error && (deleteListingStatusCheck.never_pushed || !deleteListingStatusCheck.is_live)) ||
                            deleteConfirmText !== product.sku
                        }
                        startIcon={deletingListing ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
                    >
                        {deletingListing ? t('deletingListingEllipsis') : t('deleteListingButton')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={pendingSimpleConfirm} onClose={() => setPendingSimpleConfirm(false)}>
                <DialogTitle>เปลี่ยนเป็น Simple?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        สินค้านี้มี <strong>{data.variants.length}</strong> variant อยู่ — เปลี่ยน Product Type เป็น Simple แล้วกด Save จะ
                        <strong>ลบ variant ทั้งหมด</strong>ออกจากระบบ การกระทำนี้ย้อนกลับไม่ได้
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPendingSimpleConfirm(false)} color="inherit">
                        ยกเลิก
                    </Button>
                    <Button onClick={confirmSwitchToSimple} color="error" variant="contained">
                        ยืนยัน เปลี่ยนเป็น Simple
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={variantDialogOpen}
                onClose={() => setVariantDialogOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 2 } }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>
                        เลือก Attribute สำหรับสร้าง Variant
                    </Typography>
                    <IconButton onClick={() => setVariantDialogOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    {data.variants.length > 0 && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            การสร้างใหม่จะแทนที่ตารางตัวเลือกสินค้าปัจจุบัน — ตัวเลือกที่ยังคงอยู่ (attribute/ค่าเดิม) จะเก็บ SKU/ราคา/สต๊อกเดิมไว้ให้
                            ส่วนตัวเลือกที่ไม่ได้อยู่ในชุดที่ generate ใหม่จะถูกลบออกเมื่อกด Save
                        </Alert>
                    )}
                    <Autocomplete
                        multiple
                        options={familyScopedVariantAttributes}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedVariantAttributeObjects}
                        onChange={(_, newValue) => setPendingVariantAttrIds(newValue.map((item) => item.id))}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip label={option.name || option.code} {...getTagProps({ index })} key={option.id} sx={mappedChipSx} />
                            ))
                        }
                        renderInput={(params) => <TextField {...params} placeholder="เลือก attribute เช่น สี, ไซส์" variant="outlined" />}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
                    <Button onClick={() => setVariantDialogOpen(false)} sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'none' }}>
                        ยกเลิก
                    </Button>
                    <Button onClick={applyVariantGeneration} variant="contained" sx={{ ...solidActionSx, textTransform: 'none', fontWeight: 700 }}>
                        Generate
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={pushResult !== null}
                autoHideDuration={20000}
                onClose={() => setPushResult(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert onClose={() => setPushResult(null)} severity={pushResult?.severity ?? 'success'} sx={{ width: '100%' }}>
                    {pushResult?.message}
                </Alert>
            </Snackbar>
        </AppLayout>
    );
}

// แปลง value ของ attribute แบบ gallery ให้เป็นรูปแบบเดียวกัน — ไม่ว่าจะเป็น array
// ของ path ที่ encode เป็น JSON ดิบๆ ที่โหลดมาจาก backend หรือจะเป็น
// (string | File)[] หลังจากผู้ใช้แก้ไขในเซสชันนี้แล้วก็ตาม ให้กลายเป็น list
// แบบแบนๆ ของ path เดิมที่เก็บไว้ / ไฟล์ที่เพิ่งเลือกใหม่
function parseGalleryItems(value: AttributeValue): (string | File)[] {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string' && value) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((p): p is string => typeof p === 'string' && p !== '');
            }
        } catch {
            // ไม่ใช่ JSON — เป็น string path เดี่ยวๆ แบบเก่า ให้ถือว่าเป็นรูปที่มีอยู่แล้วหนึ่งรูป
            return [value];
        }
    }
    return [];
}

// render thumbnail ของแกลเลอรีทีละรูป — ไม่ว่าจะเป็น path ที่เก็บไว้อยู่แล้ว
// หรือ File ที่เพิ่งเลือกในเครื่องรอ upload — พร้อมปุ่มลบ Object URL ของแต่ละ
// File จะถูกสร้าง/revoke ทีละรูป เพื่อไม่ให้ leak ข้ามการ render
function GalleryThumb({ item, disabled, onRemove }: { item: string | File; disabled?: boolean; onRemove: () => void }) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (typeof item === 'string') {
            setPreviewUrl(null);
            return undefined;
        }
        const url = URL.createObjectURL(item);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [item]);

    const src = typeof item === 'string' ? (/^https?:\/\//.test(item) || item.startsWith('/') ? item : `/storage/${item}`) : previewUrl;

    return (
        <Box sx={{ position: 'relative', width: 64, height: 64 }}>
            {src ? (
                <Box
                    component="img"
                    src={src}
                    alt=""
                    sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid #e2e8f0' }}
                />
            ) : (
                <Box sx={{ width: 64, height: 64, borderRadius: 1, border: '1px solid #e2e8f0', bgcolor: '#f1f5f9' }} />
            )}
            {!disabled && (
                <IconButton
                    size="small"
                    onClick={onRemove}
                    aria-label="Remove image"
                    sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        bgcolor: '#fff',
                        border: '1px solid #e2e8f0',
                        width: 20,
                        height: 20,
                        '&:hover': { bgcolor: '#fee2e2' },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
            )}
        </Box>
    );
}

// component ที่ render form control ให้เหมาะกับ attribute นั้นๆ แบบไดนามิก
// ตาม definition จริงของระบบ เป็น pure function ไม่มี state เลยแยกออกมาไว้
// นอก RenderAttributeInput แทนที่จะสร้างใหม่ทุกครั้งที่ render — SelectControl
// ด้านล่างต้องการให้ฟังก์ชันนี้มี identity คงที่เพื่อให้ memoize ได้
function optionValue(opt: AttributeOption) {
    return opt.code || opt.admin_label || String(opt.id);
}

type FieldControlProps = {
    attributeId: number;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => void;
};

// Autocomplete (popper ของ options, virtualization, filtering) เป็นหนึ่งใน
// control ที่หนักที่สุดในฟอร์มนี้ และ attribute ส่วนใหญ่ไม่ได้ scope ตาม locale
// — value/options ของมันไม่เปลี่ยนตอนสลับแค่ภาษาเฉยๆ ถึงแม้ *label* ของทุกฟิลด์
// จะเปลี่ยน (ชื่อ attribute ถูกแปลไว้) การแยกส่วนนี้ออกจาก label/chip ที่ห่อ
// อยู่รอบๆ แล้ว memoize ด้วย props ที่เปลี่ยนก็ต่อเมื่อ value/options เปลี่ยนจริงๆ
// เท่านั้น ทำให้มันข้าม re-render ได้ แทนที่จะต้องสร้างใหม่ทุกครั้งที่สลับ
const SelectControl = memo(function SelectControl({
    attributeId,
    channelKey,
    localeKey,
    options,
    value,
    disabled,
    onValueChange,
}: FieldControlProps & {
    options: AttributeOption[];
    value: string;
    disabled: boolean;
}) {
    const selectedOption = options.find((opt) => optionValue(opt) === value) ?? null;
    return (
        <Autocomplete
            size="small"
            fullWidth
            disabled={disabled}
            options={options}
            value={selectedOption}
            getOptionLabel={(opt) => opt.admin_label || opt.code || ''}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            onChange={(_, newValue) => onValueChange(attributeId, channelKey, localeKey, newValue ? optionValue(newValue) : '')}
            renderInput={(params) => <TextField {...params} placeholder="Select option" />}
        />
    );
});

// เหตุผลเดียวกับ SelectControl: rich-text editor ตัวหนึ่ง render ใหม่แต่ละครั้ง
// มีต้นทุนสูง และ value ของ attribute ส่วนใหญ่ก็ไม่เปลี่ยนตอนสลับแค่ locale เฉยๆ
// — เปลี่ยนแค่ label (ที่ render แยกต่างหาก) เท่านั้น
const RichTextControl = memo(function RichTextControl({
    attributeId,
    channelKey,
    localeKey,
    value,
    placeholder,
    readOnly,
    onValueChange,
    productId,
}: FieldControlProps & {
    value: string;
    placeholder: string;
    readOnly: boolean;
    productId: number;
}) {
    return (
        <RichTextEditor
            value={value}
            onChange={(val) => onValueChange(attributeId, channelKey, localeKey, val)}
            placeholder={placeholder}
            readOnly={readOnly}
            imageUploadUrl={readOnly ? undefined : `/catalog/products/${productId}/upload-description-image`}
        />
    );
});

function RenderAttributeInput({
    attr,
    value,
    channelKey,
    localeKey,
    onValueChange,
    label,
    activeLocaleCode,
    activeChannelName,
    canAddOptions,
    sku,
    productId,
}: {
    attr: AttributeItem;
    value: AttributeValue;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => void;
    label: string;
    activeLocaleCode?: string;
    activeChannelName?: string;
    canAddOptions?: boolean;
    sku: string;
    productId: number;
}) {
    // ใช้กับทุกประเภทฟิลด์ด้านล่าง ยกเว้น SelectControl / RichTextControl ที่
    // memoize ไว้ (สองตัวนี้เรียก onValueChange ตรงๆ พร้อม
    // attributeId/channelKey/localeKey ที่ resolve แล้วแทน) — เพราะสองฟิลด์นี้
    // มีต้นทุนสูงพอที่ closure identity ใหม่ตรงนี้จะทำลายการ memoize ของมันทุกครั้ง
    // ที่ parent re-render (เช่น ตอนสลับ locale)
    const onChange = (val: AttributeValue) => onValueChange(attr.id, channelKey, localeKey, val);
    const stringValue = typeof value === 'string' ? value : '';
    const isReadOnly = attr.editable === false;
    const [addOptionOpen, setAddOptionOpen] = useState(false);

    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [galleryError, setGalleryError] = useState<string | null>(null);

    useEffect(() => {
        if ((attr.type === 'image' || attr.type === 'video') && value instanceof File) {
            const url = URL.createObjectURL(value);
            setFilePreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
        setFilePreviewUrl(null);
        return undefined;
    }, [attr.type, value]);

    const renderChips = () => {
        return (
            <>
                {attr.is_locale_based ? (
                    <Chip
                        label={activeLocaleCode ? activeLocaleCode.toUpperCase() : 'LOCALE'}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'grey.600', color: '#fff', fontWeight: 700 }}
                    />
                ) : attr.is_channel_based ? (
                    // แต่ก่อนตรงนี้จะโชว์ "DEFAULT" ตลอด ไม่ว่า channel ไหนจะ
                    // active อยู่จริง — ฟิลด์ที่เป็น channel-based (เช่น price_std)
                    // เลยไม่มีการยืนยันด้วยภาพเลยว่ากำลังแก้ไขร้านไหนอยู่ พอสลับ
                    // channel active แล้วพิมพ์ค่า ก็จะดูเหมือนกันเป๊ะกับตอนพิมพ์ให้
                    // channel ผิด (หรือไม่มี channel เลย) เลยเปลี่ยนมาโชว์ชื่อ
                    // channel จริงแทน จะได้ไม่คลุมเครือแบบเงียบๆ อีกต่อไป
                    <>
                        <Chip
                            label={activeChannelName ? activeChannelName.toUpperCase() : 'CHANNEL'}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'grey.500', color: '#fff', fontWeight: 700 }}
                        />
                        <Tooltip
                            title='This field can have a different value per sales channel. It currently shows the value for the channel selected under "Sales Channels" (or the Default value, used by any channel with no value of its own). Switch channels there to edit another one.'
                            arrow
                        >
                            <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
                        </Tooltip>
                    </>
                ) : (
                    <Chip
                        label="DEFAULT"
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'grey.200', color: 'text.primary', fontWeight: 600 }}
                    />
                )}
                {isReadOnly && (
                    <Chip
                        label="READ ONLY"
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'grey.900', color: '#fff', fontWeight: 700 }}
                    />
                )}
            </>
        );
    };

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const options = attr.options ?? [];

        return (
            <FormControl fullWidth size="small">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <SelectControl
                        attributeId={attr.id}
                        channelKey={channelKey}
                        localeKey={localeKey}
                        options={options}
                        value={stringValue}
                        disabled={isReadOnly}
                        onValueChange={onValueChange}
                    />
                    {canAddOptions && !isReadOnly && (
                        <IconButton
                            size="small"
                            title={`Add option to "${label}"`}
                            onClick={() => setAddOptionOpen(true)}
                            sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
                {canAddOptions && (
                    <QuickAddOptionDialog
                        open={addOptionOpen}
                        attributeId={attr.id}
                        attributeLabel={label}
                        activeLocaleCode={activeLocaleCode}
                        swatchType={attr.swatch_type}
                        existingOptions={options}
                        onClose={() => setAddOptionOpen(false)}
                        onCreated={(code) => onChange(code)}
                    />
                )}
            </FormControl>
        );
    }

    if (attr.type === 'textarea') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <RichTextControl
                    attributeId={attr.id}
                    channelKey={channelKey}
                    localeKey={localeKey}
                    value={stringValue}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    readOnly={isReadOnly}
                    productId={productId}
                    onValueChange={onValueChange}
                />
            </Box>
        );
    }

    if (attr.type === 'price') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <TextField
                    size="small"
                    fullWidth
                    disabled={isReadOnly}
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                />
            </Box>
        );
    }

    if (attr.type === 'boolean') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Switch
                    disabled={isReadOnly}
                    checked={stringValue === '1' || stringValue === 'true'}
                    onChange={(e) => onChange(e.target.checked ? '1' : '0')}
                />
            </Box>
        );
    }

    if (attr.type === 'checkbox') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                disabled={isReadOnly}
                                checked={stringValue === '1' || stringValue === 'true'}
                                onChange={(e) => onChange(e.target.checked ? '1' : '0')}
                            />
                        }
                        label={
                            <Typography variant="caption" fontWeight={600} color="#334155">
                                {label} {attr.is_required && '*'}
                            </Typography>
                        }
                    />
                    {renderChips()}
                </Stack>
            </Box>
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <TextField
                    type={attr.type === 'date' ? 'date' : 'datetime-local'}
                    size="small"
                    fullWidth
                    disabled={isReadOnly}
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                />
            </Box>
        );
    }

    if (attr.type === 'gallery') {
        const MAX_GALLERY_IMAGES = 8;
        const MIN_GALLERY_DIMENSION = 300;

        // รูปที่มีอยู่แล้วจะมาในรูป array ของ path ที่ encode เป็น JSON (คือ string
        // ProductValue ดิบๆ) พอผู้ใช้แตะฟิลด์นี้ปุ๊บ มันจะกลายเป็น array
        // (string | File)[] จริงๆ ที่ผสมทั้ง path เดิมกับไฟล์ที่เพิ่งเลือกเข้ามาใหม่
        // ซึ่ง backend จะ merge กลับเข้าด้วยกันตอน save แทนที่จะแทนที่ทั้งชุด
        // (ดู ProductController::update())
        const items = parseGalleryItems(value);
        const atLimit = items.length >= MAX_GALLERY_IMAGES;

        const removeAt = (index: number) => {
            setGalleryError(null);
            onChange(items.filter((_, i) => i !== index));
        };

        // ทำงานคล้าย handleVideoSelect() ของฟิลด์ video ด้านล่าง — เหตุผลเดียวกัน
        // คือ "เร็ว ไม่ต้อง round-trip" ส่วน
        // ProductController::validateImageConstraints() คือด่านที่ request ที่
        // ยิงตรงไปที่ endpoint เอง (ข้าม UI นี้ไปเลย) จะผ่านไปไม่ได้
        const probeDimensions = (file: File) =>
            new Promise<{ width: number; height: number }>((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve({ width: img.naturalWidth, height: img.naturalHeight });
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('unreadable'));
                };
                img.src = url;
            });

        const addFiles = (fileList: FileList) => {
            setGalleryError(null);

            const incoming = Array.from(fileList);
            const remainingSlots = MAX_GALLERY_IMAGES - items.length;

            if (remainingSlots <= 0) {
                setGalleryError(`You can upload up to ${MAX_GALLERY_IMAGES} images.`);
                return;
            }

            const accepted = incoming.slice(0, remainingSlots);
            const skippedByLimit = incoming.length - accepted.length;

            Promise.all(
                accepted.map((file) =>
                    probeDimensions(file)
                        .then((dim) => ({ file, ok: dim.width >= MIN_GALLERY_DIMENSION && dim.height >= MIN_GALLERY_DIMENSION }))
                        .catch(() => ({ file, ok: false })),
                ),
            ).then((results) => {
                const valid = results.filter((r) => r.ok).map((r) => r.file);
                const rejectedByDimension = results.length - valid.length;

                if (rejectedByDimension > 0 || skippedByLimit > 0) {
                    const messages = [];
                    if (skippedByLimit > 0) messages.push(`up to ${MAX_GALLERY_IMAGES} images allowed`);
                    if (rejectedByDimension > 0) messages.push(`image must be at least ${MIN_GALLERY_DIMENSION}x${MIN_GALLERY_DIMENSION}px`);
                    setGalleryError(messages.join(' — '));
                }

                if (valid.length > 0) {
                    onChange([...items, ...valid]);
                }
            });
        };

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Up to {MAX_GALLERY_IMAGES} images ({items.length}/{MAX_GALLERY_IMAGES}) · Minimum size {MIN_GALLERY_DIMENSION}×
                    {MIN_GALLERY_DIMENSION}px
                </Typography>
                {items.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                        {items.map((item, index) => (
                            <GalleryThumb
                                key={`${index}-${typeof item === 'string' ? item : item.name}`}
                                item={item}
                                disabled={isReadOnly}
                                onRemove={() => removeAt(index)}
                            />
                        ))}
                    </Stack>
                )}
                <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    disabled={isReadOnly || atLimit}
                    startIcon={<CloudUploadIcon fontSize="small" />}
                    sx={{ textTransform: 'none', color: 'text.secondary', borderColor: UI_BORDER }}
                >
                    Add images
                    <input
                        type="file"
                        hidden
                        disabled={isReadOnly || atLimit}
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;
                            addFiles(files);
                            e.target.value = '';
                        }}
                    />
                </Button>
                {galleryError && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                        {galleryError}
                    </Typography>
                )}
            </Box>
        );
    }

    if (attr.type === 'video') {
        const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

        const selectedName = value instanceof File ? value.name : '';

        let existingLabel = '';
        let existingVideoUrl = '';
        if (!selectedName && stringValue) {
            existingLabel = stringValue.split('/').pop() || stringValue;
            existingVideoUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/') ? stringValue : `/storage/${stringValue}`;
        }

        const previewSrc = filePreviewUrl || existingVideoUrl;

        // ทำงานคล้ายการเช็ค getID3 ฝั่ง server ใน ProductController
        // (validateVideoConstraints()) — เป็นด่านที่เร็ว ไม่ต้อง round-trip
        // ไปเซิร์ฟเวอร์ ช่วยดักไฟล์เสียส่วนใหญ่ได้ก่อนที่จะเริ่ม upload 100MB ด้วยซ้ำ
        // ส่วนการเช็คฝั่ง server คือด่านที่ request ที่ยิงตรงไปที่ endpoint เอง
        // (ข้าม UI นี้ไปเลย) จะผ่านไปไม่ได้
        const handleVideoSelect = (file: File) => {
            setVideoError(null);

            if (file.type !== 'video/mp4') {
                setVideoError('Only MP4 videos are supported.');
                return;
            }
            if (file.size > MAX_VIDEO_BYTES) {
                setVideoError('Video must be 100MB or smaller.');
                return;
            }

            const probeUrl = URL.createObjectURL(file);
            const probe = document.createElement('video');
            probe.preload = 'metadata';
            probe.onloadedmetadata = () => {
                URL.revokeObjectURL(probeUrl);
                if (probe.duration > 300) {
                    setVideoError('Video must be 5 minutes or shorter.');
                    return;
                }
                if (probe.videoWidth < 480 || probe.videoHeight < 480) {
                    setVideoError('Video must be at least 480x480px.');
                    return;
                }
                onChange(file);
            };
            probe.onerror = () => {
                URL.revokeObjectURL(probeUrl);
                setVideoError('Could not read this video file.');
            };
            probe.src = probeUrl;
        };

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    {previewSrc && (
                        <Box
                            component="video"
                            src={previewSrc}
                            controls
                            sx={{ width: 160, maxHeight: 100, borderRadius: 1, border: '1px solid #e2e8f0' }}
                        />
                    )}
                    <Button
                        component="label"
                        variant="outlined"
                        size="small"
                        disabled={isReadOnly}
                        startIcon={<CloudUploadIcon fontSize="small" />}
                        sx={{ textTransform: 'none', color: 'text.secondary', borderColor: UI_BORDER }}
                    >
                        Choose file
                        <input
                            type="file"
                            hidden
                            disabled={isReadOnly}
                            accept="video/mp4"
                            onChange={(e) => {
                                const files = e.target.files;
                                if (!files || files.length === 0) return;
                                handleVideoSelect(files[0]);
                                // ต้องรีเซ็ตค่า เพื่อให้เลือกไฟล์เดิม (ที่โดนปฏิเสธไปแล้ว) ซ้ำแล้ว
                                // ยังยิง handler นี้ได้อีก — ไม่งั้น browser จะไม่ยิง event change
                                // ให้ เพราะ value ของ input ไม่ได้เปลี่ยน
                                e.target.value = '';
                            }}
                        />
                    </Button>
                    {selectedName && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            {selectedName}
                        </Typography>
                    )}
                    {existingLabel && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            Current: {existingLabel}
                        </Typography>
                    )}
                </Stack>
                {videoError && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                        {videoError}
                    </Typography>
                )}
            </Box>
        );
    }

    if (attr.type === 'image' || attr.type === 'file') {
        const isImage = attr.type === 'image';

        const selectedName = value instanceof File ? value.name : '';

        let existingLabel = '';
        let existingImageUrl = '';
        if (!selectedName && stringValue) {
            existingLabel = stringValue.split('/').pop() || stringValue;
            if (isImage) {
                existingImageUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/') ? stringValue : `/storage/${stringValue}`;
            }
        }

        const previewSrc = filePreviewUrl || existingImageUrl;

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    {isImage && previewSrc && (
                        <Box
                            component="img"
                            src={previewSrc}
                            alt={label}
                            onClick={() => setLightboxOpen(true)}
                            sx={{
                                width: 48,
                                height: 48,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                '&:hover': { opacity: 0.85 },
                            }}
                        />
                    )}
                    <Button
                        component="label"
                        variant="outlined"
                        size="small"
                        disabled={isReadOnly}
                        startIcon={<CloudUploadIcon fontSize="small" />}
                        sx={{ textTransform: 'none', color: 'text.secondary', borderColor: UI_BORDER }}
                    >
                        Choose file
                        <input
                            type="file"
                            hidden
                            disabled={isReadOnly}
                            accept={isImage ? 'image/*' : undefined}
                            onChange={(e) => {
                                const files = e.target.files;
                                if (!files || files.length === 0) return;
                                onChange(files[0]);
                            }}
                        />
                    </Button>
                    {selectedName && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            {selectedName}
                        </Typography>
                    )}
                    {existingLabel && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            Current: {existingLabel}
                        </Typography>
                    )}
                </Stack>
                {isImage && previewSrc && (
                    <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} maxWidth="md">
                        <DialogContent sx={{ p: 0, lineHeight: 0 }}>
                            <Box component="img" src={previewSrc} alt={label} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }} />
                        </DialogContent>
                    </Dialog>
                )}
            </Box>
        );
    }

    return (
        <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" fontWeight={600} color="#334155">
                    {label} {attr.is_required && '*'}
                </Typography>
                {renderChips()}
            </Stack>
            <TextField
                size="small"
                fullWidth
                disabled={isReadOnly}
                value={stringValue}
                onChange={(e) => onChange(e.target.value)}
                placeholder={attr.code === 'pid' || attr.code === 'pname' ? sku : `Enter ${label.toLowerCase()}`}
            />
        </Box>
    );
}
