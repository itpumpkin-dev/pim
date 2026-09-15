import { AssignPimCategoryPanel } from '@/components/catalog/assign-pim-category-panel';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { MarketplaceCategoryPicker } from '@/components/marketplace-category-picker';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import {
    ShopeeAttributeOptionMappingDialog,
    type ShopeeAttributeOptionMappingInfo,
} from '@/components/catalog/shopee-attribute-option-mapping-dialog';
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PublishIcon from '@mui/icons-material/Publish';
import SearchIcon from '@mui/icons-material/Search';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
    Alert,
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
    Drawer,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Link,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ProductFilter = 'all' | 'mapped' | 'unmapped';

interface MasterCategoryInfo {
    id: number;
    name: string;
    path: string;
    shopee_category_id: number | null;
}

interface ShopeeCategoryInfo {
    id: number;
    name: string;
    path: string;
}

interface ShopeeSyncedShop {
    name: string;
    last_synced_at: string | null;
}

interface ProductRow {
    id: number;
    sku: string;
    name: string;
    variants_count: number;
    master_category: MasterCategoryInfo | null;
    shopee_category: ShopeeCategoryInfo | null;
    category_mapped: boolean;
    attribute_stats: { total: number; mapped: number } | null;
    /** เคย push แล้วยืนยันว่า live จริงบน Shopee หรือยัง (คนละเรื่องกับ
     * category_mapped ด้านบน ซึ่งเป็นแค่ "ตั้งค่า mapping ไว้ครบหรือยัง")
     * — ดู ShopeeAttributeMappingController::shopeeProducts() */
    shopee_sync: { synced: boolean; shops: ShopeeSyncedShop[] };
}

interface ProductDetailAttributeRow {
    label: string;
    mandatory: boolean;
    /** null = ยังไม่มีค่า (ไม่ว่าจะเพราะยังไม่ได้ผูก PIM attribute เลย หรือผูกแล้วแต่ค่าว่าง — ทั้งสองแบบแปลว่า push ไม่ผ่านเหมือนกัน เลยแสดงผลรวมเป็นแบบเดียวกัน) */
    value: string | null;
    /** Shopee's input_type แปลเป็น label อ่านง่ายแล้ว (text/singleSelect/multiSelect/...) — null ถ้าไม่รู้ */
    type?: string | null;
}

interface ProductDetailSyncHistoryRow {
    action: string;
    status: string;
    message: string | null;
    shop_name: string | null;
    created_at: string;
}

/** ทุกร้าน Shopee ที่มีในระบบ (ไม่ใช่แค่ร้านที่สินค้านี้ publish อยู่แล้ว) — ให้แท็บ "ร้านค้า" ติ๊ก publish/push/deactivate ได้เองในที่เดียว */
interface ProductDetailShop {
    id: number;
    name: string;
    published: boolean;
    is_live: boolean;
    last_synced_at: string | null;
}

interface ProductDetailPlatformField {
    label: string;
    /** null = ยังไม่มีค่าให้ส่ง (attribute ยังไม่ได้ map หรือ map แล้วแต่ค่าว่าง) */
    value: string | null;
    type?: string | null;
}

/** ผลลัพธ์จาก ShopeeAttributeMappingController::productDetail() — sidebar ด้านขวา (quick view) เท่านั้น คนละอย่างกับ Object Page เต็มหน้าที่ activeProduct เปิด */
interface ProductDetailData {
    id: number;
    sku: string;
    name: string;
    variants_count: number;
    enabled: boolean;
    shopee_category_path: string | null;
    attributes: ProductDetailAttributeRow[];
    /** ฟิลด์ตายตัวที่ Shopee ทุกหมวดหมู่ต้องมี (ราคา/สต็อก/น้ำหนัก-ขนาด) — คนละกลุ่มกับ attributes ด้านบน (custom category attribute เฉพาะหมวดหมู่นี้ + แบรนด์) */
    platform_fields: ProductDetailPlatformField[];
    platform_images: string[];
    sync_history: ProductDetailSyncHistoryRow[];
    shopee_shops: ProductDetailShop[];
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
    /** ทุกร้าน Shopee ในระบบ — ใช้เป็นตัวเลือกใน dialog "Push ที่เลือก" (bulk) ด้านล่างตาราง */
    shopeeShops: { id: number; name: string }[];
}

/** ป้ายภาษาไทยของ ProductMarketplaceSyncJob.action/.status — ใช้ในแท็บ "ประวัติ Sync" ของ quick-view sidebar เท่านั้น — mirror ของ lazada-products.tsx */
const SYNC_ACTION_LABEL_TH: Record<string, string> = {
    push: 'ส่งไป Shopee',
    deactivate: 'ปิดการขาย',
    delete: 'ลบประกาศขาย',
};
const SYNC_STATUS_LABEL_TH: Record<string, string> = {
    completed: 'สำเร็จ',
    failed: 'ล้มเหลว',
    queued: 'กำลังรอคิว',
    processing: 'กำลังดำเนินการ',
};

interface ShopeeAttributeOptionInfo {
    value: string;
    label: string;
}

interface ShopeeAttributeRow {
    id: number;
    name: string;
    // 1=SINGLE_DROP_DOWN, 2=SINGLE_COMBO_BOX, 3=FREE_TEXT_FILED,
    // 4=MULTI_DROP_DOWN, 5=MULTI_COMBO_BOX — ตรงกับ
    // ShopeeAttributeMappingController::MAPPABLE_INPUT_TYPES ฝั่ง backend
    input_type: number | null;
    mandatory: boolean;
    mapped: { id: number; name: string } | null;
    // ตัวเลือกที่ Shopee กำหนดไว้ล่วงหน้าสำหรับแถวนี้ — ไม่ว่างเฉพาะ input_type
    // แบบ dropdown/combo-box (SELECT_SHOPEE_INPUT_TYPES ด้านล่าง) ชนิดของค่าตอบ
    // กลับยังไม่เคยยืนยัน shape จริงจาก sandbox — ดู
    // ShopeeAttributeMappingController::encodeShopeeOptions()'s docblock
    options: ShopeeAttributeOptionInfo[];
    // ตั้งค่าเมื่อมี PIM attribute ผูกไว้แล้ว (`mapped` non-null) — ใช้เขียน
    // shopee_attribute_option_mappings ผ่าน updateOptionMappings()
    shopee_attribute_mapping_id: number | null;
    option_mappings: ShopeeAttributeOptionMappingInfo[];
}

// ทุก input_type รับแมปได้แล้ว (ต่างจาก Lazada ที่มี allowlist ตาม input_type
// string หลายแบบ — Shopee's enum แคบกว่ามาก แค่ 1-5)
const MAPPABLE_SHOPEE_INPUT_TYPES = [1, 2, 3, 4, 5];

// input_type ที่ต้อง "จับคู่ตัวเลือก" เพิ่ม (มีตัวเลือกที่กำหนดไว้ล่วงหน้า) — ตรงกับ
// ShopeeAttributeMappingController::SELECT_INPUT_TYPES ฝั่ง backend
const SELECT_SHOPEE_INPUT_TYPES = [1, 2, 4, 5];

const SHOPEE_INPUT_TYPE_LABELS: Record<number, string> = {
    1: 'dropdown (เลือกได้ 1)',
    2: 'combo box (เลือกได้ 1 หรือพิมพ์เอง)',
    3: 'ข้อความอิสระ',
    4: 'dropdown (เลือกได้หลายค่า)',
    5: 'combo box (เลือกได้หลายค่า หรือพิมพ์เอง)',
};

// ฟิลด์ payload ตายตัวของ Shopee เอง (ไม่ผูกกับหมวดหมู่ไหนเลย) — ตรงกับ
// ShopeeAttributeMappingController::STRUCTURED_TARGET_FIELDS ฝั่ง backend
// (มี `description` เพิ่มจาก Lazada)
type PayloadTargetField = 'name' | 'price' | 'qty' | 'weight' | 'length' | 'width' | 'height' | 'description' | 'video';

const PAYLOAD_FIELD_LABELS: Record<PayloadTargetField, string> = {
    name: 'ชื่อสินค้า (Product Name)',
    price: 'ราคา (Price)',
    qty: 'จำนวนสต็อก (Quantity)',
    weight: 'น้ำหนักพัสดุ (Package Weight)',
    length: 'ความยาวพัสดุ (Package Length)',
    width: 'ความกว้างพัสดุ (Package Width)',
    height: 'ความสูงพัสดุ (Package Height)',
    description: 'รายละเอียดสินค้า (Description)',
    video: 'วิดีโอสินค้า (Product Video)',
};

interface PayloadFieldRow {
    target_field: PayloadTargetField;
    mapped: { id: number; name: string } | null;
}

// ความสูงของแถบแท็บ anchor ที่ sticky อยู่บนสุดของ scroll body (บวก slack เล็กน้อย)
// ใช้เป็นทั้ง scroll-margin-top ของแต่ละ section และ threshold ของ scroll-spy —
// mirror ของ lazada-products.tsx เป๊ะ
const SECTION_SCROLL_MARGIN = 72;

export default function ShopeeProductsMapping({ products, stats, filters, shopeeShops }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ProductFilter>(filters.filter ?? 'all');
    const [perPage, setPerPage] = useState<number>(products.per_page ?? 25);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    // Bulk "Push ที่เลือก" — เรียก ProductController::pushBulk() ตัวเดียวกับที่
    // products/index.tsx's "Share" dialog ใช้ (ดู index.tsx's shareSelectedProducts())
    // แค่เปิดทางลัดให้กดจากหน้านี้ได้เลย ไม่ต้องสลับไปหน้า list สินค้าทั่วไปก่อน
    const [bulkPushDialogOpen, setBulkPushDialogOpen] = useState(false);
    const [bulkPushShopId, setBulkPushShopId] = useState<number | ''>('');
    const [bulkPushing, setBulkPushing] = useState(false);
    const firstRender = useRef(true);

    // Active product being viewed as an Object Page (null = list view)
    const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);

    // Quick-view sidebar (Drawer) — เปิดจากปุ่มลูกศรในตาราง คนละอย่างกับ
    // activeProduct ด้านบน (Object Page เต็มหน้าไว้แก้ mapping จริงจัง) ตัวนี้
    // แค่สรุปเร็วๆ ว่า field ไหนของ Shopee ยังขาดอยู่บ้างสำหรับสินค้าตัวนี้ +
    // ประวัติ sync ล่าสุด ก่อนตัดสินใจว่าจะเข้าไปแก้ที่ Object Page/Edit Product
    // หรือกด sync จากตรงนี้เลยถ้าข้อมูลครบแล้ว — mirror ของ lazada-products.tsx เป๊ะ
    const [detailProductId, setDetailProductId] = useState<number | null>(null);
    const [detailData, setDetailData] = useState<ProductDetailData | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detailTab, setDetailTab] = useState(0);
    const [detailPushResult, setDetailPushResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
    // ร้านที่กำลัง push/deactivate อยู่ตอนนี้ (null = ไม่มี) — ทำได้ทีละร้านเท่านั้น
    // ต่อ 1 sidebar (ปุ่มร้านอื่นๆ ใน "แท็บร้านค้า" ยัง disabled ไม่ได้ระหว่างนี้)
    const [actingShopId, setActingShopId] = useState<number | null>(null);
    // ร้านที่กำลังติ๊ก publish/unpublish อยู่ (แยกจาก actingShopId — คนละ action)
    const [togglingShopId, setTogglingShopId] = useState<number | null>(null);
    // confirm dialog ก่อน push/deactivate จริง — เก็บทั้งร้านและ action ไว้ในก้อน
    // เดียว (ต่างจากเดิมที่ hardcode ไว้แค่ "ร้านเดียว, push อย่างเดียว")
    const [shopActionConfirm, setShopActionConfirm] = useState<{ shopId: number; shopName: string; action: 'push' | 'deactivate' } | null>(null);
    // ผลเช็คสถานะ live ล่าสุดของร้านที่กำลังจะ confirm อยู่ — โชว์ในตัว dialog
    // เดียวกับที่ products/edit.tsx's push-confirm dialog ทำ (เตือน "ยังไม่เคย push"/
    // "live อยู่แล้ว จะอัปเดต" ก่อนกดยืนยันจริง)
    const [shopStatusCheck, setShopStatusCheck] = useState<{
        shopId: number;
        loading: boolean;
        is_live?: boolean;
        never_pushed?: boolean;
        status?: string | null;
        error?: string;
    } | null>(null);

    // สินค้าที่ drawer "กำลังเปิดดูอยู่จริง" ตอนนี้ — แยกจาก detailProductId (state)
    // เพราะ closure ของ pollShopActionStatus/refreshDetail ด้านล่างถูกสร้างไว้
    // ตอน push ครั้งนั้นๆ (จำ productId เดิมไว้ใน closure) ถ้าผู้ใช้ปิด drawer แล้ว
    // เปิดสินค้าอื่นก่อน poll รอบเก่าจะ resolve, poll รอบเก่าจะยังทำงานต่อและเผลอ
    // เอาผลของสินค้าเก่าไปทับ state ของสินค้าใหม่ที่กำลังโชว์อยู่ — เช็ค ref นี้
    // ก่อนทุกครั้งที่จะ setState กันไว้ ถ้าไม่ตรงกันแล้วคือ drawer ย้ายไปสินค้าอื่น
    // แล้วจริงๆ ให้เงียบๆ หยุด ไม่ setState ทับและไม่ schedule poll รอบถัดไปอีก
    const detailProductIdRef = useRef<number | null>(null);

    const openDetail = (productId: number) => {
        detailProductIdRef.current = productId;
        setDetailProductId(productId);
        setDetailData(null);
        setDetailTab(0);
        setDetailPushResult(null);
        // เผื่อสินค้าตัวก่อนหน้ายังมี poll ค้างอยู่ตอนสลับมาที่นี่ — รีเซ็ตสถานะ
        // ปุ่มต่างๆ ของ sidebar ใหม่ให้เริ่มจากปกติเสมอ ไม่ใช่ค้างจากสินค้าเดิม
        setActingShopId(null);
        setTogglingShopId(null);
        setShopActionConfirm(null);
        setShopStatusCheck(null);
        setLoadingDetail(true);
        fetch(`/catalog/marketplace/shopee/products/${productId}/detail`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: ProductDetailData | null) => {
                if (detailProductIdRef.current === productId) {
                    setDetailData(body);
                }
            })
            .finally(() => {
                if (detailProductIdRef.current === productId) {
                    setLoadingDetail(false);
                }
            });
    };

    const closeDetail = () => {
        detailProductIdRef.current = null;
        setDetailProductId(null);
        setDetailData(null);
        setDetailPushResult(null);
    };

    // เรียกใหม่แบบเงียบๆ (ไม่เคลียร์ detailData/เปิด loading spinner ก่อน) —
    // ใช้หลัง toggle publish/push เสร็จ เพื่อให้ค่า attribute/ประวัติ sync/สถานะ
    // ร้านที่โชว์อยู่ใน drawer อัปเดตเป็นสถานะล่าสุดโดยไม่กระพริบทั้ง panel
    const refreshDetail = (productId: number) => {
        fetch(`/catalog/marketplace/shopee/products/${productId}/detail`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: ProductDetailData | null) => {
                if (body && detailProductIdRef.current === productId) {
                    setDetailData(body);
                }
            });
    };

    // ปุ่ม checkbox publish/unpublish ต่อร้านใน "แท็บร้านค้า" — เขียนผ่าน
    // ProductController::toggleShopPublished() (endpoint ใหม่ที่ปลอดภัยให้เรียก
    // จากหน้าที่รู้จักแค่ร้านของ platform เดียว ต่างจาก updateChannels() ที่
    // sync() ทั้งชุดของทุก platform) แล้ว refresh sidebar เงียบๆ
    const toggleShopPublished = (shopId: number, published: boolean) => {
        const productId = detailProductId;
        if (!productId) return;
        setTogglingShopId(shopId);
        fetch(`/catalog/products/${productId}/shops/${shopId}/toggle-published`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ published }),
        })
            .then((res) => {
                if (!res.ok) throw new Error();
                if (detailProductIdRef.current === productId) {
                    refreshDetail(productId);
                    router.reload({ only: ['products'] });
                }
            })
            .catch(() => {
                if (detailProductIdRef.current === productId) {
                    setDetailPushResult({ severity: 'error', message: 'บันทึกสถานะ publish ไม่สำเร็จ' });
                }
            })
            .finally(() => {
                if (detailProductIdRef.current === productId) {
                    setTogglingShopId(null);
                }
            });
    };

    // เหมือน checkPlatformStatus() ของ products/edit.tsx — เรียกทันทีที่เปิด
    // confirm dialog ของร้านหนึ่งๆ เพื่อโชว์สถานะ live สดๆ ก่อนกดยืนยันจริง
    const checkShopStatus = (productId: number, shopId: number) => {
        setShopStatusCheck({ shopId, loading: true });
        fetch(`/catalog/products/${productId}/shopee-status/${shopId}`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();
                // เช็ค detailProductIdRef ก่อน setState เสมอ เหมือน fetch handler อื่นๆ
                // ในไฟล์นี้ — ไม่งั้นถ้าปิด drawer แล้วเปิดสินค้าอื่นที่มีร้านเดียวกัน
                // (shopId ซ้ำ) ก่อน response เก่าจะกลับมา ผลเช็คสถานะของสินค้าเก่าจะ
                // ทับ state ของสินค้าใหม่ที่กำลังเปิด confirm dialog อยู่ (บั๊กที่เจอ
                // จาก code review — mirror ของ lazada-products.tsx's fix เป๊ะ)
                if (detailProductIdRef.current !== productId) return;
                setShopStatusCheck(res.ok ? { shopId, loading: false, ...body } : { shopId, loading: false, error: body.message });
            })
            .catch(() => {
                if (detailProductIdRef.current !== productId) return;
                setShopStatusCheck({ shopId, loading: false, error: 'ตรวจสอบสถานะไม่สำเร็จ' });
            });
    };

    const openShopActionConfirm = (shopId: number, shopName: string, action: 'push' | 'deactivate') => {
        if (!detailProductId) return;
        setShopActionConfirm({ shopId, shopName, action });
        checkShopStatus(detailProductId, shopId);
    };

    // Poll เดียวกับที่ products/edit.tsx ทำ (SyncProductToMarketplaceJob ทำงาน
    // เป็น background job — ดู ProductController::queueMarketplaceSync()) แค่
    // เขียนแยกชุดเองที่นี่เพราะหน้านี้ไม่มี state ของ push dialog ชุดเดิมให้ใช้ร่วม
    const pollShopActionStatus = (productId: number, jobId: number, shopId: number, attempts = 0) => {
        // drawer ย้ายไปสินค้าอื่น (หรือปิดไปแล้ว) ตั้งแต่ก่อนจะยิง request รอบนี้ด้วยซ้ำ
        // — หยุดเงียบๆ ไม่ต้อง setState หรือ schedule รอบถัดไปอีกเลย
        if (detailProductIdRef.current !== productId) return;

        fetch(`/catalog/products/${productId}/sync-jobs/${jobId}`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                if (detailProductIdRef.current !== productId) return;
                const body = await res.json();

                if (!res.ok) {
                    setDetailPushResult({ severity: 'error', message: body.message ?? 'ตรวจสอบสถานะไม่สำเร็จ' });
                    setActingShopId(null);
                    return;
                }
                if (body.status === 'completed') {
                    setDetailPushResult({ severity: 'success', message: body.message });
                    setActingShopId(null);
                    refreshDetail(productId);
                    router.reload({ only: ['products'] });
                    return;
                }
                if (body.status === 'failed') {
                    setDetailPushResult({ severity: 'error', message: body.message ?? 'sync ไม่สำเร็จ' });
                    setActingShopId(null);
                    return;
                }
                if (attempts >= 40) {
                    setDetailPushResult({ severity: 'error', message: 'ยังไม่เสร็จภายในเวลาที่กำหนด ตรวจสอบภายหลังที่หน้า Edit Product' });
                    setActingShopId(null);
                    return;
                }
                setTimeout(() => pollShopActionStatus(productId, jobId, shopId, attempts + 1), 1500);
            })
            .catch(() => {
                if (detailProductIdRef.current !== productId) return;
                if (attempts >= 40) {
                    setDetailPushResult({ severity: 'error', message: 'เครือข่ายมีปัญหา ตรวจสอบภายหลัง' });
                    setActingShopId(null);
                    return;
                }
                setTimeout(() => pollShopActionStatus(productId, jobId, shopId, attempts + 1), 1500);
            });
    };

    const confirmShopAction = () => {
        if (!shopActionConfirm || !detailProductId) return;
        const { shopId, action } = shopActionConfirm;
        const productId = detailProductId;
        const routeSegment = action === 'push' ? 'push-shopee' : 'deactivate-shopee';
        setShopActionConfirm(null);
        setActingShopId(shopId);
        setDetailPushResult(null);

        fetch(`/catalog/products/${productId}/${routeSegment}/${shopId}`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                if (detailProductIdRef.current !== productId) return;
                const body = await res.json();
                if (!res.ok || !body.job_id) {
                    setDetailPushResult({
                        severity: 'error',
                        message: body.message ?? (action === 'push' ? 'ส่งไป Shopee ไม่สำเร็จ' : 'ปิดการขายบน Shopee ไม่สำเร็จ'),
                    });
                    setActingShopId(null);
                    return;
                }
                pollShopActionStatus(productId, body.job_id, shopId);
            })
            .catch(() => {
                if (detailProductIdRef.current !== productId) return;
                setDetailPushResult({ severity: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
                setActingShopId(null);
            });
    };

    // Category mapping section state
    const [selectedShopeeCatId, setSelectedShopeeCatId] = useState<number | null>(null);
    const [savingCatMap, setSavingCatMap] = useState(false);
    // "Sync Categories" — ดึงต้นไม้หมวดหมู่ทั้งหมดจาก Shopee จริงมา refresh
    // แคช shopee_categories (คนละอย่างกับ saveCategoryMapping ด้านล่าง ซึ่งแค่
    // "เลือก" จากที่ sync ไว้แล้ว) — เดิมปุ่มนี้อยู่ที่หน้า
    // categories/shopee-mapping.tsx เท่านั้น ตอนนี้การ์ด "จับคู่หมวดหมู่" ที่
    // ลิงก์ไปหน้านั้นถูกซ่อนออกจาก platform-hub.tsx แล้ว (Shopee ใช้การ์ด
    // "สินค้า" นี้เป็นทางเข้าเดียว) เลยต้องมีปุ่มนี้ในหน้านี้ด้วย ไม่งั้นไม่มีทางเข้าถึง
    // การ sync ต้นไม้หมวดหมู่ได้เลยจาก UI (บั๊กที่เจอจากคำถามผู้ใช้)
    const [syncingCategoryTree, setSyncingCategoryTree] = useState(false);
    const [categorySyncMessage, setCategorySyncMessage] = useState<{ text: string; isError: boolean } | null>(null);
    // "แนะนำหมวดหมู่จาก Shopee" — เรียก v2.product.category_recommend จริง (ดู
    // ShopeeAttributeMappingController::categorySuggestions()) mirror ของ
    // Lazada เป๊ะ แค่เสนอตัวเลือกให้กดเลือกแทนการเดินหา manual ใน
    // MarketplaceCategoryPicker เอง — ไม่ได้บันทึกอะไรทันทีที่กด แค่ set
    // selectedShopeeCatId (ค่าเดียวกับที่ picker เขียน) ผู้ใช้ยังต้องกด
    // "บันทึก Category Mapping" ตามปกติเหมือนเดิม
    const [categorySuggestions, setCategorySuggestions] = useState<{ category_id: number; name: string | null; path: string }[] | null>(null);
    const [loadingCategorySuggestions, setLoadingCategorySuggestions] = useState(false);
    const [categorySuggestionError, setCategorySuggestionError] = useState<string | null>(null);

    // Attribute mapping section state
    const [shopeeAttributes, setShopeeAttributes] = useState<ShopeeAttributeRow[] | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState(false);
    const [savingAttributeId, setSavingAttributeId] = useState<number | null>(null);
    const [syncingAttributes, setSyncingAttributes] = useState(false);
    // "สร้าง/อัปเดต Attribute Family" — auto-generate ตระกูลแอตทริบิวต์จาก PIM
    // attribute ที่แมปไว้แล้ว แล้วผูกกับ PIM Category นี้ ให้ฟิลด์โผล่ในหน้า Edit
    // Product ทันที (ดู ShopeeAttributeFamilyGenerator ฝั่ง backend)
    const [syncingFamily, setSyncingFamily] = useState(false);
    const [familySyncResult, setFamilySyncResult] = useState<{ name: string; count: number; newlyCreatedCount: number; editUrl: string } | null>(null);
    const [familySyncError, setFamilySyncError] = useState<string | null>(null);
    // แถวที่กำลังเปิด dialog "จับคู่ตัวเลือก" อยู่ (null = ปิด) — เฉพาะแถวที่เป็น
    // select-type (SELECT_SHOPEE_INPUT_TYPES) และมี PIM attribute ผูกไว้แล้ว
    const [optionMappingRow, setOptionMappingRow] = useState<ShopeeAttributeRow | null>(null);
    // กรองตารางให้เหลือแค่แถวที่ Shopee บังคับ (mandatory)
    const [showMandatoryOnly, setShowMandatoryOnly] = useState(false);

    // Payload Shopee section state (section 3) — ฟิลด์ payload ตายตัวของ Shopee
    // เอง ไม่ผูกกับหมวดหมู่ไหนเลย เลยโหลดครั้งเดียวตอนเปิดสินค้า ไม่ต้องรอ
    // category_mapped เหมือน section 2
    const [payloadFields, setPayloadFields] = useState<PayloadFieldRow[] | null>(null);
    const [loadingPayloadFields, setLoadingPayloadFields] = useState(false);
    const [savingPayloadField, setSavingPayloadField] = useState<string | null>(null);

    // Object Page anchor bar — mirror ของ lazada-products.tsx เป๊ะ (scroll-spy nav
    // ไม่ใช่การสลับซ่อน/โชว์ panel)
    const [sectionIndex, setSectionIndex] = useState(0);
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const anchorBarRef = useRef<HTMLDivElement | null>(null);
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const suppressScrollSpy = useRef(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'Shopee', href: '/catalog/marketplace/shopee' },
        { title: 'สินค้า', href: '/catalog/marketplace/shopee/products' },
        ...(activeProduct ? [{ title: activeProduct.name, href: '#' }] : []),
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/marketplace/shopee/products', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const applyFilter = (value: ProductFilter) => {
        setFilter(value);
        router.get('/catalog/marketplace/shopee/products', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/shopee/products', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/marketplace/shopee/products', { search, filter, per_page: perPage, page }, { preserveState: true });
    };

    // Load category attributes when active product has a Shopee category
    const loadAttributes = (shopeeCatId: number) => {
        setLoadingAttributes(true);
        fetch(`/catalog/categories/${shopeeCatId}/shopee-attributes`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: ShopeeAttributeRow[] }) => setShopeeAttributes(body.data))
            .finally(() => setLoadingAttributes(false));
    };

    const loadPayloadFields = () => {
        setLoadingPayloadFields(true);
        fetch('/catalog/attributes/shopee-mapping/payload-fields', { headers: { Accept: 'application/json' } })
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
        setSelectedShopeeCatId(product.shopee_category?.id ?? null);
        // ล้าง state ค้างจากสินค้าตัวก่อนหน้าด้วย — ไม่งั้นเปิดสินค้าตัวใหม่จะ
        // ยังเห็น alert/dialog ของสินค้าตัวเก่าค้างอยู่ (พบจาก code review:
        // ปุ่ม "สร้าง/อัปเดต Attribute Family" ของสินค้า A โชว์ alert สำเร็จไว้
        // แล้วสลับไปเปิดสินค้า B ทันที — alert ของ A ยังค้างอยู่จนกว่าจะกดปิดเอง)
        setFamilySyncResult(null);
        setFamilySyncError(null);
        setOptionMappingRow(null);
        setCategorySyncMessage(null);
        setCategorySuggestions(null);
        setCategorySuggestionError(null);

        if (product.category_mapped && product.shopee_category) {
            loadAttributes(product.shopee_category.id);
        } else {
            setShopeeAttributes(null);
        }

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

    // เรียกเฉพาะตอนกดปุ่มเอง (ไม่ auto-fetch ตอนเปิดสินค้า) เพราะเป็น live API
    // call ไป Shopee จริงทุกครั้ง — เผื่อ rate limit เหมือนกับฝั่ง Lazada
    const loadCategorySuggestions = () => {
        if (!activeProduct) return;
        setLoadingCategorySuggestions(true);
        setCategorySuggestionError(null);
        fetch(`/catalog/marketplace/shopee/products/${activeProduct.id}/category-suggestions`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message ?? 'โหลดคำแนะนำไม่สำเร็จ');
                setCategorySuggestions(body.data);
            })
            .catch((e: Error) => setCategorySuggestionError(e.message))
            .finally(() => setLoadingCategorySuggestions(false));
    };

    const saveCategoryMapping = () => {
        if (!activeProduct || !activeProduct.master_category || !selectedShopeeCatId) return;

        setSavingCatMap(true);
        const shopeeCategoryId = selectedShopeeCatId;
        const mappings = [
            {
                category_id: activeProduct.master_category.id,
                shopee_category_id: shopeeCategoryId,
            },
        ];

        router.post(
            '/catalog/categories/shopee-mapping',
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSavingCatMap(false);
                    fetch(`/catalog/marketplace-categories/shopee/path?id=${shopeeCategoryId}`, { headers: { Accept: 'application/json' } })
                        .then((res) => (res.ok ? res.json() : []))
                        .then((path: { id: number; name: string }[]) => {
                            const last = path[path.length - 1];
                            setActiveProduct((prev) =>
                                prev
                                    ? {
                                          ...prev,
                                          category_mapped: true,
                                          shopee_category: {
                                              id: shopeeCategoryId,
                                              name: last?.name ?? String(shopeeCategoryId),
                                              path: path.map((n) => n.name).join(' > '),
                                          },
                                      }
                                    : prev,
                            );
                        });
                    loadAttributes(shopeeCategoryId);
                    scrollToSection(1);
                },
                onError: () => setSavingCatMap(false),
            },
        );
    };

    const syncCategoryTree = () => {
        setSyncingCategoryTree(true);
        setCategorySyncMessage(null);

        fetch('/catalog/categories/sync-shopee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
        })
            .then(async (res) => {
                const body = await res.json();
                setCategorySyncMessage(
                    res.ok
                        ? { text: `ซิงค์หมวดหมู่ Shopee สำเร็จ ${body.count} หมวดหมู่`, isError: false }
                        : { text: body.message || 'เกิดข้อผิดพลาด ไม่สามารถซิงค์หมวดหมู่ได้', isError: true },
                );
            })
            .catch(() => setCategorySyncMessage({ text: 'เกิดข้อผิดพลาด ไม่สามารถซิงค์หมวดหมู่ได้', isError: true }))
            .finally(() => setSyncingCategoryTree(false));
    };

    const syncAttributes = () => {
        if (!activeProduct?.shopee_category) return;
        setSyncingAttributes(true);

        fetch('/catalog/categories/shopee-mapping/sync-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ shopee_category_id: activeProduct.shopee_category.id }),
        })
            .then(async (res) => {
                if (res.ok) {
                    loadAttributes(activeProduct.shopee_category!.id);
                }
            })
            .finally(() => setSyncingAttributes(false));
    };

    const syncAttributeFamily = () => {
        if (!activeProduct?.master_category) return;
        if (!window.confirm('การกดปุ่มนี้อาจสร้าง PIM Attribute ใหม่หลายตัวสำหรับ Shopee attribute ที่ยังไม่มีใครแมป ต้องการดำเนินการต่อหรือไม่?')) {
            return;
        }

        setSyncingFamily(true);
        setFamilySyncResult(null);
        setFamilySyncError(null);

        fetch('/catalog/attributes/shopee-mapping/attribute-family', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ category_id: activeProduct.master_category.id }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (res.ok) {
                    setFamilySyncResult({
                        name: body.family.name,
                        count: body.attribute_count,
                        newlyCreatedCount: body.newly_created_count,
                        editUrl: body.edit_url,
                    });
                    if (body.newly_created_count > 0 && activeProduct.shopee_category) {
                        loadAttributes(activeProduct.shopee_category.id);
                    }
                } else {
                    setFamilySyncError(body.message || 'เกิดข้อผิดพลาด ไม่สามารถสร้าง/อัปเดต Attribute Family ได้');
                }
            })
            .catch(() => setFamilySyncError('เกิดข้อผิดพลาด ไม่สามารถสร้าง/อัปเดต Attribute Family ได้'))
            .finally(() => setSyncingFamily(false));
    };

    const assignAttribute = (shopeeAttributeId: number, pimAttribute: PimAttributeOption) => {
        setSavingAttributeId(shopeeAttributeId);
        fetch('/catalog/attributes/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttribute.id,
                        target_field: 'shopee_attribute',
                        shopee_attribute_id: shopeeAttributeId,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setShopeeAttributes((prev) =>
                    prev ? prev.map((a) => (a.id === shopeeAttributeId ? { ...a, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : a)) : prev,
                );
            })
            .finally(() => setSavingAttributeId(null));
    };

    const clearAttribute = (shopeeAttributeId: number, pimAttributeId: number) => {
        setSavingAttributeId(shopeeAttributeId);
        fetch('/catalog/attributes/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: null,
                        shopee_attribute_id: null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setShopeeAttributes((prev) => (prev ? prev.map((a) => (a.id === shopeeAttributeId ? { ...a, mapped: null } : a)) : prev));
            })
            .finally(() => setSavingAttributeId(null));
    };

    const assignPayloadField = (field: PayloadTargetField, pimAttribute: PimAttributeOption, previousAttributeId: number | null) => {
        setSavingPayloadField(field);

        const mappings: { attribute_id: number; target_field: string | null; shopee_attribute_id: null; sort_order: number }[] = [
            { attribute_id: pimAttribute.id, target_field: field, shopee_attribute_id: null, sort_order: 0 },
        ];
        if (previousAttributeId && previousAttributeId !== pimAttribute.id) {
            mappings.push({ attribute_id: previousAttributeId, target_field: null, shopee_attribute_id: null, sort_order: 0 });
        }

        fetch('/catalog/attributes/shopee-mapping', {
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
        fetch('/catalog/attributes/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [{ attribute_id: pimAttributeId, target_field: null, shopee_attribute_id: null, sort_order: 0 }],
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

    const confirmBulkPush = () => {
        if (!bulkPushShopId || selectedRows.length === 0) return;
        setBulkPushing(true);
        router.post(
            '/catalog/products/push-bulk',
            { product_ids: selectedRows, shop_ids: [bulkPushShopId] },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setBulkPushDialogOpen(false);
                    setBulkPushShopId('');
                    setSelectedRows([]);
                },
                onFinish: () => setBulkPushing(false),
            },
        );
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
            key: 'shopee_category',
            header: 'Shopee Category',
            priority: 'high',
            minWidth: 240,
            render: (row) =>
                row.shopee_category ? (
                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary, fontSize: '0.8125rem' }}>
                            {row.shopee_category.path || row.shopee_category.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                            sp:{row.shopee_category.id}
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
            key: 'shopee_sync',
            header: 'สถานะ Sync',
            priority: 'medium',
            minWidth: 170,
            render: (row) =>
                row.shopee_sync.synced ? (
                    <Tooltip
                        arrow
                        title={
                            <Box>
                                {row.shopee_sync.shops.map((shop) => (
                                    <Typography key={shop.name} variant="caption" component="div">
                                        {shop.name}
                                        {shop.last_synced_at
                                            ? ` — ${new Date(shop.last_synced_at).toLocaleString()}`
                                            : ''}
                                    </Typography>
                                ))}
                            </Box>
                        }
                    >
                        <Box sx={{ display: 'inline-block' }}>
                            <FioriStatus
                                label={
                                    row.shopee_sync.shops.length === 1
                                        ? `Sync แล้ว: ${row.shopee_sync.shops[0].name}`
                                        : `Sync แล้ว: ${row.shopee_sync.shops.length} ร้าน`
                                }
                                tone="success"
                            />
                        </Box>
                    </Tooltip>
                ) : (
                    <FioriStatus label="ยังไม่ sync" tone="neutral" />
                ),
        },
        {
            key: 'action',
            header: 'Action',
            priority: 'always',
            align: 'right',
            minWidth: 180,
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
                    {/* เปิด quick-view sidebar (ดูรายละเอียด attribute/สถานะ sync แบบ
                    เร็วๆ) — คนละปุ่มกับด้านบนที่พาไปหน้า Object Page เต็มหน้า */}
                    <Tooltip title="ดูรายละเอียดสินค้านี้">
                        <IconButton size="small" onClick={() => openDetail(row.id)} sx={fioriIconButtonSx}>
                            <KeyboardArrowRightIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            ),
        },
    ];

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;

    // Check mandatory attributes status for active product
    const unmappedMandatoryCount = shopeeAttributes
        ? shopeeAttributes.filter((a) => a.mandatory && !a.mapped).length
        : 0;
    const mandatoryAttributesCount = shopeeAttributes ? shopeeAttributes.filter((a) => a.mandatory).length : 0;
    const visibleShopeeAttributes = shopeeAttributes
        ? showMandatoryOnly
            ? shopeeAttributes.filter((a) => a.mandatory)
            : shopeeAttributes
        : null;

    // ──────────────────────────────────────────────────────────────────────
    // Object Page — mirror ของ lazada-products.tsx เป๊ะ (ดูตัวนั้นๆ docblock)
    // ──────────────────────────────────────────────────────────────────────
    if (activeProduct) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={`Shopee Mapping | ${activeProduct.sku}`} />
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
                                            activeProduct.shopee_category
                                                ? `Shopee: ${activeProduct.shopee_category.path || activeProduct.shopee_category.name}`
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
                                <Tab label="3. Payload Shopee" />
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
                                                เลือก Shopee Category ปลายทางสำหรับ Master Category นี้
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
                                            Sync Categories จาก Shopee
                                        </Button>
                                    </Stack>

                                    {categorySyncMessage && (
                                        <Alert severity={categorySyncMessage.isError ? 'error' : 'success'} onClose={() => setCategorySyncMessage(null)}>
                                            {categorySyncMessage.text}
                                        </Alert>
                                    )}

                                    {/* สินค้ายังไม่มีหมวดหมู่ PIM เลย — ปุ่ม "บันทึก Category
                                    Mapping" ด้านล่างจะกดไปก็ไม่มีผลอะไร (saveCategoryMapping()
                                    เช็ค master_category ก่อนเสมอ) เปิดทางกำหนดให้ตรงนี้เลย
                                    แทนที่จะให้กดแล้วเงียบๆ ไม่มีอะไรเกิดขึ้น — ดู
                                    AssignPimCategoryPanel's docblock */}
                                    {!activeProduct.master_category && (
                                        <AssignPimCategoryPanel
                                            productId={activeProduct.id}
                                            onAssigned={(category) =>
                                                setActiveProduct((prev) =>
                                                    prev
                                                        ? { ...prev, master_category: { id: category.id, name: category.name, path: category.path, shopee_category_id: null } }
                                                        : prev,
                                                )
                                            }
                                        />
                                    )}

                                    <Box sx={{ maxWidth: 420 }}>
                                        <MarketplaceCategoryPicker
                                            platform="shopee"
                                            label="Shopee Category"
                                            value={selectedShopeeCatId}
                                            onChange={setSelectedShopeeCatId}
                                        />
                                    </Box>

                                    {/* แนะนำหมวดหมู่จาก Shopee จริง (v2.product.category_recommend)
                                    — เลือกจากชื่อสินค้าตัวนี้ กดแล้วแค่ตั้งค่า
                                    selectedShopeeCatId เหมือน picker ด้านบน ยังต้อง
                                    กด "บันทึก Category Mapping" ต่อเองเหมือนเดิม */}
                                    <Box>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            disabled={loadingCategorySuggestions}
                                            startIcon={loadingCategorySuggestions ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                                            onClick={loadCategorySuggestions}
                                            sx={fioriDefaultSx}
                                        >
                                            {loadingCategorySuggestions ? 'กำลังค้นหา...' : 'แนะนำหมวดหมู่จาก Shopee'}
                                        </Button>

                                        {categorySuggestionError && (
                                            <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setCategorySuggestionError(null)}>
                                                {categorySuggestionError}
                                            </Alert>
                                        )}

                                        {categorySuggestions && (
                                            categorySuggestions.length === 0 ? (
                                                <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 1 }}>
                                                    Shopee ไม่มีคำแนะนำให้สำหรับสินค้านี้
                                                </Typography>
                                            ) : (
                                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                                                    {categorySuggestions.map((s) => (
                                                        <Chip
                                                            key={s.category_id}
                                                            label={s.path || s.name || String(s.category_id)}
                                                            onClick={() => setSelectedShopeeCatId(s.category_id)}
                                                            sx={
                                                                selectedShopeeCatId === s.category_id
                                                                    ? { bgcolor: FIORI.brand, color: '#fff', fontWeight: 600 }
                                                                    : { bgcolor: FIORI.brandBg, color: FIORI.brand }
                                                            }
                                                        />
                                                    ))}
                                                </Stack>
                                            )
                                        )}
                                    </Box>

                                    <Box>
                                        <Button
                                            variant="contained"
                                            disabled={!selectedShopeeCatId || savingCatMap}
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
                                {!activeProduct.category_mapped || !activeProduct.shopee_category ? (
                                    <Stack alignItems="center" spacing={1} sx={{ py: 4, color: FIORI.textSecondary }}>
                                        <LockOutlinedIcon fontSize="small" />
                                        <Typography variant="body2">กรุณาบันทึก Category Mapping (Section 1) ก่อน ถึงจะแมป Attributes ได้</Typography>
                                    </Stack>
                                ) : (
                                    <Stack spacing={3}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                    {activeProduct.shopee_category.path || activeProduct.shopee_category.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontFamily: 'monospace' }}>
                                                    sp:{activeProduct.shopee_category.id}
                                                </Typography>
                                            </Box>
                                            <Stack direction="row" spacing={1}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    disabled={syncingFamily || !(shopeeAttributes ?? []).some((a) => a.mapped)}
                                                    startIcon={syncingFamily ? <CircularProgress size={14} /> : <CollectionsBookmarkIcon fontSize="small" />}
                                                    onClick={syncAttributeFamily}
                                                    sx={fioriDefaultSx}
                                                >
                                                    สร้าง/อัปเดต Attribute Family
                                                </Button>
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
                                        </Stack>

                                        {familySyncResult && (
                                            <Alert severity="success" onClose={() => setFamilySyncResult(null)}>
                                                สร้าง/อัปเดต Attribute Family &quot;{familySyncResult.name}&quot; แล้ว ({familySyncResult.count} attributes
                                                {familySyncResult.newlyCreatedCount > 0 && `, สร้างใหม่ ${familySyncResult.newlyCreatedCount} attribute`}) —{' '}
                                                <Link href={familySyncResult.editUrl} target="_blank" rel="noopener noreferrer">
                                                    เปิดหน้าตรวจสอบ
                                                </Link>
                                            </Alert>
                                        )}
                                        {familySyncError && (
                                            <Alert severity="error" onClose={() => setFamilySyncError(null)}>
                                                {familySyncError}
                                            </Alert>
                                        )}

                                        {unmappedMandatoryCount > 0 && (
                                            <Alert severity="error" icon={<WarningAmberIcon />}>
                                                มี {unmappedMandatoryCount} attribute ที่ Shopee บังคับ (Required) แต่ยังไม่ได้แมป — สินค้าในหมวดหมู่นี้จะ sync ไม่ผ่าน
                                            </Alert>
                                        )}

                                        {shopeeAttributes && shopeeAttributes.length > 0 && (
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
                                                        แสดงเฉพาะที่ Shopee บังคับ (Required) ({mandatoryAttributesCount})
                                                    </Typography>
                                                }
                                                sx={{ ml: 0 }}
                                            />
                                        )}

                                        {loadingAttributes ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                <CircularProgress size={24} sx={{ color: FIORI.brand }} />
                                            </Box>
                                        ) : visibleShopeeAttributes && visibleShopeeAttributes.length > 0 ? (
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
                                                            Shopee Attribute
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
                                                    {visibleShopeeAttributes.map((attr) => {
                                                        const isMappable = attr.input_type !== null && MAPPABLE_SHOPEE_INPUT_TYPES.includes(attr.input_type);

                                                        return (
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
                                                                        {attr.name} {attr.mandatory && <span style={{ color: FIORI.error as unknown as string }}>*</span>}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                                                        {attr.input_type !== null ? SHOPEE_INPUT_TYPE_LABELS[attr.input_type] ?? attr.input_type : 'ไม่ทราบชนิด'}
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
                                                                            {attr.input_type !== null && SELECT_SHOPEE_INPUT_TYPES.includes(attr.input_type) && attr.mapped && (
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
                                        ) : shopeeAttributes && shopeeAttributes.length > 0 ? (
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                                                ไม่มี attribute ที่ Shopee บังคับ (Required) เลยในหมวดหมู่นี้
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                                                ยังไม่มีข้อมูล Attributes ในระบบ กรุณากด "Sync Attributes"
                                            </Typography>
                                        )}
                                    </Stack>
                                )}
                            </Paper>

                            {/* Section 3 — Payload Shopee: ฟิลด์ payload ตายตัวของ Shopee เอง
                                (name/price/qty/weight/length/width/height/description/video)
                                ไม่ผูกกับหมวดหมู่ไหนเลย ต่างจาก section 2 ที่เป็น category
                                attribute — เลยไม่ต้อง lock ไว้จนกว่าจะแมป Category ก่อนเหมือน
                                section 2 */}
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
                                            แมป PIM Attribute เข้ากับฟิลด์ payload ของ Shopee
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            ฟิลด์ตายตัวของ Shopee เอง (ไม่ใช่ attribute เฉพาะหมวดหมู่แบบ section 2) — ใช้ร่วมกันทุกสินค้า
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
                                                        Shopee Payload Field
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

                            {/* Section 4 — History: audit trail รวมของทุกขั้นตอนการแมพ Shopee
                                ของ master category นี้ — ดู ShopeeMappingTimelineBuilder ฝั่ง
                                backend สำหรับขอบเขต/ที่มาของแต่ละแหล่งข้อมูล */}
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
                                            เส้นทางการแมพ Shopee ของ Master Category นี้
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            รวมทุกการเปลี่ยนแปลงของ Category Mapping (Section 1), Attribute Mapping (Section 2) —
                                            รวมถึงตัวเลือกที่จับคู่ไว้ และการสร้าง/sync Attribute Family ที่เกี่ยวข้อง เรียงใหม่สุดก่อน
                                        </Typography>
                                    </Box>

                                    {!activeProduct.master_category ? (
                                        <Stack alignItems="center" spacing={1} sx={{ py: 4, color: FIORI.textSecondary }}>
                                            <LockOutlinedIcon fontSize="small" />
                                            <Typography variant="body2">สินค้านี้ยังไม่มี Master Category — ไม่มีประวัติให้แสดง</Typography>
                                        </Stack>
                                    ) : (
                                        <TimelinePanel
                                            timelineUrl={`/catalog/attributes/shopee-mapping/timeline?category_id=${activeProduct.master_category.id}`}
                                        />
                                    )}
                                </Stack>
                            </Paper>
                        </Stack>
                    </Box>
                </Box>

                {optionMappingRow && optionMappingRow.mapped && (
                    <ShopeeAttributeOptionMappingDialog
                        open={Boolean(optionMappingRow)}
                        onClose={() => setOptionMappingRow(null)}
                        shopeeAttributeLabel={optionMappingRow.name}
                        pimAttributeId={optionMappingRow.mapped.id}
                        pimAttributeName={optionMappingRow.mapped.name}
                        shopeeAttributeMappingId={optionMappingRow.shopee_attribute_mapping_id}
                        shopeeOptions={optionMappingRow.options}
                        initialMappings={optionMappingRow.option_mappings}
                        onSaved={(newMappings: ShopeeAttributeOptionMappingInfo[]) => {
                            const rowId = optionMappingRow.id;
                            setShopeeAttributes((prev) =>
                                prev ? prev.map((a) => (a.id === rowId ? { ...a, option_mappings: newMappings } : a)) : prev,
                            );
                        }}
                    />
                )}
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="แมปสินค้า Shopee" />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* ──── Page Header ──── */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            สินค้า ({products.total})
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            จัดการการแมปหมวดหมู่และ Attributes ของ Shopee ตั้งแต่ระดับสินค้า
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        startIcon={<ArrowBackIcon fontSize="small" />}
                        onClick={() => router.visit('/catalog/marketplace/shopee')}
                        sx={fioriGhostSx}
                    >
                        Shopee Hub
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

                    {selectedRows.length > 0 && (
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ px: 2, py: 1, bgcolor: FIORI.brandBg, borderTop: `1px solid ${FIORI.border}`, borderBottom: `1px solid ${FIORI.border}` }}
                        >
                            <Typography variant="body2" sx={{ color: FIORI.brand, fontWeight: 600 }}>
                                เลือกอยู่ {selectedRows.length} รายการ
                            </Typography>
                            <Button size="small" variant="contained" startIcon={<PublishIcon fontSize="small" />} onClick={() => setBulkPushDialogOpen(true)} sx={fioriEmphasizedSx}>
                                Push ที่เลือก
                            </Button>
                        </Stack>
                    )}

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

            {/* ──────────────────────────────────────────────────────────────
                Quick-view sidebar — เปิดจากปุ่มลูกศรในตาราง (openDetail()) คนละ
                อย่างกับ Object Page เต็มหน้าด้านบน (activeProduct) ตัวนี้แค่
                สรุปเร็วๆ ว่า field ไหนของ Shopee ยังขาดอยู่บ้าง + ประวัติ sync —
                mirror ของ lazada-products.tsx เป๊ะ
                ────────────────────────────────────────────────────────────── */}
            <Drawer anchor="right" open={detailProductId !== null} onClose={closeDetail} PaperProps={{ sx: { width: { xs: '100%', sm: 640 } } }}>
                {detailProductId !== null && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: FIORI.pageBg }}>
                        {/* Header */}
                        <Box sx={{ p: 2, bgcolor: FIORI.surface, borderBottom: `1px solid ${FIORI.border}` }}>
                            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                <Box
                                    sx={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 1,
                                        bgcolor: FIORI.headerBg,
                                        border: `1px solid ${FIORI.border}`,
                                        flexShrink: 0,
                                    }}
                                />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: FIORI.textPrimary, lineHeight: 1.3 }}>
                                        {detailData?.name ?? '...'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                        {detailData?.sku}
                                        {detailData && detailData.variants_count > 0 ? ` · ${detailData.variants_count} variants` : ''}
                                    </Typography>
                                </Box>
                                <IconButton size="small" onClick={closeDetail}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Stack>

                            {detailData && (
                                <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                            สถานะ
                                        </Typography>
                                        <FioriStatus label={detailData.enabled ? 'ขายอยู่' : 'ปิดขาย'} tone={detailData.enabled ? 'success' : 'neutral'} />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                            Shopee category
                                        </Typography>
                                        <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.brand }}>
                                            {detailData.shopee_category_path ?? '— ยังไม่ได้ map —'}
                                        </Typography>
                                    </Box>
                                </Stack>
                            )}
                        </Box>

                        {/* Tabs */}
                        <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={fioriTabsSx}>
                            <Tab label="Attribute" />
                            <Tab label="ข้อมูลสินค้า (Platform)" />
                            <Tab label="ร้านค้า" />
                            <Tab label="ประวัติ Sync" />
                        </Tabs>

                        {/* Body */}
                        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                            {loadingDetail ? (
                                <Stack alignItems="center" sx={{ py: 4 }}>
                                    <CircularProgress size={24} />
                                </Stack>
                            ) : !detailData ? (
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    โหลดข้อมูลไม่สำเร็จ
                                </Typography>
                            ) : detailTab === 0 ? (
                                <Stack divider={<Divider sx={{ borderColor: FIORI.border }} />} spacing={0}>
                                    {detailData.attributes.map((attr, idx) => (
                                        <Stack
                                            key={idx}
                                            direction="row"
                                            justifyContent="space-between"
                                            alignItems="flex-start"
                                            spacing={2}
                                            sx={{ py: 1 }}
                                        >
                                            <Box sx={{ flexShrink: 0 }}>
                                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                                    {attr.label}{' '}
                                                    {attr.mandatory && (
                                                        <Typography component="span" variant="caption" sx={{ color: FIORI.warning, fontWeight: 700 }}>
                                                            จำเป็น
                                                        </Typography>
                                                    )}
                                                </Typography>
                                                {attr.type && (
                                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                                        {attr.type}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: attr.value ? FIORI.textPrimary : FIORI.error,
                                                    fontWeight: attr.value ? 400 : 600,
                                                    textAlign: 'right',
                                                }}
                                            >
                                                {attr.value ?? '— ยังไม่ได้กรอก —'}
                                            </Typography>
                                        </Stack>
                                    ))}
                                    {detailData.attributes.length === 0 && (
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, py: 2 }}>
                                            ยังไม่ได้ map หมวดหมู่ Shopee ให้สินค้านี้ เลยยังไม่รู้ว่ามี field อะไรบ้าง
                                        </Typography>
                                    )}
                                </Stack>
                            ) : detailTab === 1 ? (
                                <>
                                    <Stack divider={<Divider sx={{ borderColor: FIORI.border }} />} spacing={0}>
                                        {detailData.platform_fields.map((field, idx) => (
                                            <Stack
                                                key={idx}
                                                direction="row"
                                                justifyContent="space-between"
                                                alignItems="flex-start"
                                                spacing={2}
                                                sx={{ py: 1 }}
                                            >
                                                <Box sx={{ flexShrink: 0 }}>
                                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                                        {field.label}
                                                    </Typography>
                                                    {field.type && (
                                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                                            {field.type}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: field.value ? FIORI.textPrimary : FIORI.error,
                                                        fontWeight: field.value ? 400 : 600,
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    {field.value ?? '— ยังไม่ได้กรอก —'}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>

                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block', mt: 2, mb: 1 }}>
                                        รูปสินค้า ({detailData.platform_images.length})
                                    </Typography>
                                    {detailData.platform_images.length === 0 ? (
                                        <Typography variant="body2" sx={{ color: FIORI.error }}>
                                            — ยังไม่มีรูปสินค้าให้ส่งไป Shopee —
                                        </Typography>
                                    ) : (
                                        <Stack direction="row" flexWrap="wrap" gap={1}>
                                            {detailData.platform_images.map((url, idx) => (
                                                <Box
                                                    key={idx}
                                                    component="img"
                                                    src={url}
                                                    alt={`รูปสินค้า ${idx + 1}`}
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                                                    }}
                                                    sx={{
                                                        width: 72,
                                                        height: 72,
                                                        borderRadius: 1,
                                                        objectFit: 'cover',
                                                        border: `1px solid ${FIORI.border}`,
                                                        bgcolor: FIORI.headerBg,
                                                    }}
                                                />
                                            ))}
                                        </Stack>
                                    )}
                                </>
                            ) : detailTab === 2 ? (
                                <Stack spacing={1}>
                                    {detailData.shopee_shops.map((shop) => (
                                        <Box
                                            key={shop.id}
                                            sx={{
                                                p: 1.5,
                                                border: `1px solid ${FIORI.border}`,
                                                borderRadius: 1,
                                                bgcolor: FIORI.surface,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 1,
                                            }}
                                        >
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                                                <Checkbox
                                                    size="small"
                                                    checked={shop.published}
                                                    disabled={togglingShopId === shop.id}
                                                    onChange={() => toggleShopPublished(shop.id, !shop.published)}
                                                />
                                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }} noWrap>
                                                    {shop.name}
                                                </Typography>
                                                {shop.is_live && <FioriStatus label="Live" tone="success" />}
                                            </Stack>
                                            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                                {shop.published && (
                                                    <Tooltip title={`Push to ${shop.name}`}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                disabled={actingShopId === shop.id}
                                                                onClick={() => openShopActionConfirm(shop.id, shop.name, 'push')}
                                                            >
                                                                {actingShopId === shop.id ? (
                                                                    <CircularProgress size={16} />
                                                                ) : (
                                                                    <PublishIcon fontSize="small" />
                                                                )}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {shop.published && shop.is_live && (
                                                    <Tooltip title={`Deactivate on ${shop.name}`}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                disabled={actingShopId === shop.id}
                                                                onClick={() => openShopActionConfirm(shop.id, shop.name, 'deactivate')}
                                                            >
                                                                <UnpublishedIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </Box>
                                    ))}
                                    {detailData.shopee_shops.length === 0 && (
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                            ยังไม่มีร้าน Shopee เชื่อมต่อไว้ในระบบเลย
                                        </Typography>
                                    )}
                                </Stack>
                            ) : (
                                <Stack spacing={1.5}>
                                    {detailData.sync_history.length === 0 && (
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                            ยังไม่เคย sync สินค้านี้ไป Shopee เลย
                                        </Typography>
                                    )}
                                    {detailData.sync_history.map((h, idx) => (
                                        <Box key={idx} sx={{ p: 1.5, border: `1px solid ${FIORI.border}`, borderRadius: 1, bgcolor: FIORI.surface }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                                <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                                    {SYNC_ACTION_LABEL_TH[h.action] ?? h.action}
                                                    {h.shop_name ? ` — ${h.shop_name}` : ''}
                                                </Typography>
                                                <FioriStatus
                                                    label={SYNC_STATUS_LABEL_TH[h.status] ?? h.status}
                                                    tone={h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'neutral'}
                                                />
                                            </Stack>
                                            {h.message && (
                                                <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block', mt: 0.5 }}>
                                                    {h.message}
                                                </Typography>
                                            )}
                                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block', mt: 0.5 }}>
                                                {new Date(h.created_at).toLocaleString()}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            )}

                            {detailPushResult && (
                                <Alert severity={detailPushResult.severity} sx={{ mt: 2 }} onClose={() => setDetailPushResult(null)}>
                                    {detailPushResult.message}
                                </Alert>
                            )}
                        </Box>

                        {/* Footer — ปุ่ม push/deactivate ย้ายไปอยู่ในแท็บ "ร้านค้า" แล้ว
                        (รองรับได้หลายร้านพร้อมกัน) footer นี้เหลือแค่ทางลัดไปแก้
                        ข้อมูลเต็มรูปแบบ/ปิด sidebar เท่านั้น */}
                        <Stack
                            direction="row"
                            spacing={1}
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ p: 2, bgcolor: FIORI.surface, borderTop: `1px solid ${FIORI.border}` }}
                        >
                            <Button size="small" onClick={() => router.visit(`/catalog/products/${detailProductId}/edit`)} sx={fioriGhostSx}>
                                แก้ไข
                            </Button>
                            <Button size="small" onClick={closeDetail} sx={fioriGhostSx}>
                                ปิด
                            </Button>
                        </Stack>
                    </Box>
                )}
            </Drawer>

            {/* Push = เปิดเป็นหน้า "ตรวจสอบข้อมูลก่อนส่ง" เต็มรูปแบบ (เหมือนหน้า view
            product ย่อยๆ) เพราะกดครั้งเดียวมีผลจริงกับ listing บน Shopee เลย — ใช้
            ข้อมูลชุดเดียวกับแท็บ Attribute/ข้อมูลสินค้า/รูปสินค้า มาเรียงต่อกันให้เห็น
            "ทุกอย่างที่กำลังจะส่งไป" ในที่เดียว ไม่ต้องสลับแท็บเอง — Deactivate ไม่มี
            อะไรให้ตรวจ (แค่ปิดของเดิม) เลยยังคงเป็น dialog สั้นๆ เหมือนเดิม */}
            <Dialog
                open={shopActionConfirm !== null}
                onClose={() => setShopActionConfirm(null)}
                fullWidth
                maxWidth={shopActionConfirm?.action === 'push' ? 'sm' : 'xs'}
            >
                <DialogTitle>
                    {shopActionConfirm?.action === 'push' ? 'ตรวจสอบข้อมูลก่อนส่งไป Shopee' : 'ปิดการขายบน Shopee?'}
                    {detailData && (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, fontWeight: 400, mt: 0.25 }}>
                            {detailData.name} · {detailData.sku} · ร้าน &quot;{shopActionConfirm?.shopName}&quot;
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    {shopActionConfirm?.action === 'deactivate' && (
                        <DialogContentText>
                            การดำเนินการนี้จะปิดการขาย (ไม่ลบ) ประกาศขายบน Shopee สำหรับร้าน &quot;{shopActionConfirm?.shopName}&quot;
                        </DialogContentText>
                    )}

                    {shopStatusCheck && shopActionConfirm && shopStatusCheck.shopId === shopActionConfirm.shopId && (
                        <Box sx={{ mb: shopActionConfirm.action === 'push' ? 2 : 0 }}>
                            {shopStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                        กำลังตรวจสอบสถานะบน Shopee...
                                    </Typography>
                                </Stack>
                            ) : shopStatusCheck.error ? (
                                <Alert severity="warning">ตรวจสอบสถานะไม่สำเร็จ: {shopStatusCheck.error}</Alert>
                            ) : shopStatusCheck.never_pushed ? (
                                <Alert severity="info">ยังไม่เคยส่งมาก่อน — การดำเนินการนี้จะสร้างประกาศขายใหม่</Alert>
                            ) : shopStatusCheck.is_live ? (
                                <Alert severity="success">กำลังขายอยู่บน Shopee แล้ว — การดำเนินการนี้จะอัปเดตของเดิม</Alert>
                            ) : (
                                <Alert severity="info">มีประกาศขายอยู่แล้วแต่ไม่ active (สถานะ: {shopStatusCheck.status ?? 'ไม่ทราบ'})</Alert>
                            )}
                        </Box>
                    )}

                    {shopActionConfirm?.action === 'push' &&
                        detailData &&
                        (() => {
                            const missing = detailData.attributes.filter((a) => a.mandatory && !a.value);

                            return (
                                <>
                                    {missing.length > 0 ? (
                                        <Alert severity="error" sx={{ mb: 2 }}>
                                            <Typography variant="body2" fontWeight={600}>
                                                ยังกรอกข้อมูลที่ Shopee บังคับไม่ครบ {missing.length} รายการ: {missing.map((a) => a.label).join(', ')}
                                            </Typography>
                                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                                ยังกด &quot;ยืนยันส่ง&quot; ต่อได้ แต่ Shopee อาจปฏิเสธถ้าข้อมูลไม่ครบจริง
                                            </Typography>
                                        </Alert>
                                    ) : (
                                        <Alert severity="success" sx={{ mb: 2 }}>ข้อมูลที่ Shopee บังคับครบถ้วนแล้ว</Alert>
                                    )}

                                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                        ข้อมูลสินค้า (Platform)
                                    </Typography>
                                    <Stack divider={<Divider sx={{ borderColor: FIORI.border }} />} spacing={0} sx={{ mb: 2 }}>
                                        {detailData.platform_fields.map((field, idx) => (
                                            <Stack key={idx} direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ py: 0.75 }}>
                                                <Box sx={{ flexShrink: 0 }}>
                                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                                        {field.label}
                                                    </Typography>
                                                    {field.type && (
                                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                                            {field.type}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: field.value ? FIORI.textPrimary : FIORI.error,
                                                        fontWeight: field.value ? 400 : 600,
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    {field.value ?? '— ยังไม่ได้กรอก —'}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>

                                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                        รูปสินค้า ({detailData.platform_images.length})
                                    </Typography>
                                    {detailData.platform_images.length === 0 ? (
                                        <Typography variant="body2" sx={{ color: FIORI.error, mb: 2 }}>
                                            — ยังไม่มีรูปสินค้าให้ส่งไป Shopee —
                                        </Typography>
                                    ) : (
                                        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                                            {detailData.platform_images.map((url, idx) => (
                                                <Box
                                                    key={idx}
                                                    component="img"
                                                    src={url}
                                                    alt={`รูปสินค้า ${idx + 1}`}
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                                                    }}
                                                    sx={{
                                                        width: 64,
                                                        height: 64,
                                                        borderRadius: 1,
                                                        objectFit: 'cover',
                                                        border: `1px solid ${FIORI.border}`,
                                                        bgcolor: FIORI.headerBg,
                                                    }}
                                                />
                                            ))}
                                        </Stack>
                                    )}

                                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                        Attribute
                                    </Typography>
                                    <Stack divider={<Divider sx={{ borderColor: FIORI.border }} />} spacing={0}>
                                        {detailData.attributes.map((attr, idx) => (
                                            <Stack key={idx} direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ py: 0.75 }}>
                                                <Box sx={{ flexShrink: 0 }}>
                                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                                        {attr.label}{' '}
                                                        {attr.mandatory && (
                                                            <Typography component="span" variant="caption" sx={{ color: FIORI.warning, fontWeight: 700 }}>
                                                                จำเป็น
                                                            </Typography>
                                                        )}
                                                    </Typography>
                                                    {attr.type && (
                                                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                                            {attr.type}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: attr.value ? FIORI.textPrimary : FIORI.error,
                                                        fontWeight: attr.value ? 400 : 600,
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    {attr.value ?? '— ยังไม่ได้กรอก —'}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </>
                            );
                        })()}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShopActionConfirm(null)} sx={fioriGhostSx}>
                        ยกเลิก
                    </Button>
                    <Button onClick={confirmShopAction} variant="contained" sx={fioriEmphasizedSx}>
                        {shopActionConfirm?.action === 'push' ? 'ยืนยันส่ง' : 'ปิดการขาย'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={bulkPushDialogOpen} onClose={() => setBulkPushDialogOpen(false)}>
                <DialogTitle>Push {selectedRows.length} รายการที่เลือกไป Shopee?</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        เลือกร้าน Shopee ที่จะ push สินค้าทั้ง {selectedRows.length} รายการไปด้วยกัน — สินค้าที่ยังไม่ได้ publish ไว้กับร้านนี้จะถูก publish ให้อัตโนมัติก่อน push
                    </DialogContentText>
                    <Select
                        fullWidth
                        size="small"
                        displayEmpty
                        value={bulkPushShopId}
                        onChange={(e) => setBulkPushShopId(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                        <MenuItem value="" disabled>
                            เลือกร้าน...
                        </MenuItem>
                        {shopeeShops.map((shop) => (
                            <MenuItem key={shop.id} value={shop.id}>
                                {shop.name}
                            </MenuItem>
                        ))}
                    </Select>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBulkPushDialogOpen(false)} sx={fioriGhostSx}>
                        ยกเลิก
                    </Button>
                    <Button
                        onClick={confirmBulkPush}
                        variant="contained"
                        disabled={!bulkPushShopId || bulkPushing}
                        startIcon={bulkPushing ? <CircularProgress size={14} color="inherit" /> : undefined}
                        sx={fioriEmphasizedSx}
                    >
                        {bulkPushing ? 'กำลังส่ง...' : 'Push'}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
