import { AssignPimCategoryPanel } from '@/components/catalog/assign-pim-category-panel';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import {
    ShopeeAttributeOptionMappingDialog,
    type ShopeeAttributeOptionMappingInfo,
} from '@/components/catalog/shopee-attribute-option-mapping-dialog';
import { ShopeeBrandMappingPanel } from '@/components/catalog/shopee-brand-mapping-panel';
import { FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { MarketplaceCategoryPicker } from '@/components/marketplace-category-picker';
import { TimelinePanel } from '@/components/timeline-panel';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { FioriBusyIndicator, FioriStatus, useFioriBusy } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/accept.js';
import '@ui5/webcomponents-icons/dist/ai.js';
import '@ui5/webcomponents-icons/dist/collections-management.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Bar, Button, CheckBox, Dialog, Link, SegmentedButton, SegmentedButtonItem, Tab, TabContainer, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Body,
    Caption,
    CenteredSpinner,
    HStack,
    ImageThumbs,
    KpiTiles,
    LockedNotice,
    MappingTable,
    PageHeader,
    Pager,
    SearchField,
    SectionCard,
    SectionHeading,
    Spinner,
    TONE_TEXT,
    useMediaQuery,
    ValueRows,
    VStack,
} from './marketplace-ui';
import styles from './marketplace.module.css';
import { MatchedListingCell, type ProductMatching } from './matched-listing-cell';
import { PlatformEditPanel } from './platform-edit-panel';
import { PlatformPushPanel } from './platform-push-panel';

type ProductFilter = 'all' | 'mapped' | 'unmapped';
/** ตัวกรอง Product Matching — ดู ProductMatchStatus::applyMatchingFilter() */
type MatchingFilter = 'all' | 'matched' | 'unmatched';

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
    /** มี listing บนร้าน Shopee ผูก (Product Matching) กับสินค้านี้ (หรือ variant) แล้ว
     * — ดู ProductMatchStatus */
    matching: ProductMatching;
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
    stats: { total: number; mapped: number; unmapped: number; matched: number; not_matched: number };
    filters: { filter: ProductFilter; search: string; per_page: number; matching?: MatchingFilter };
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

export default function ShopeeProductsMapping({ products, stats, filters }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    // ไอคอนแก้ไขสินค้าข้างชื่อในตาราง — พาไปหน้า Edit Product ตรงๆ (products/edit.tsx)
    // ไม่ใช่หน้า mapping นี้ — เช็คสิทธิ์แยกจากสิทธิ์ marketplace_shopee ของหน้านี้เอง
    // เพราะเป็นคนละ permission group กัน (ดู routes/catalog.php: products.edit)
    const { auth } = usePage<SharedData>().props;
    const canEditProducts = (auth.permissions || []).includes('products.edit_products');

    // Fiori Message Box แทน window.confirm() ของเบราว์เซอร์ (ดู
    // clearCategoryMapping()/clearAllAttributeMappings() ด้านล่าง) — {confirmElement}
    // ต้อง render ไว้ในต้นไม้ JSX ของหน้านี้ด้วย ไม่งั้น dialog จะไม่โผล่มาเลย
    const { confirm, confirmElement } = useFioriConfirm();

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ProductFilter>(filters.filter ?? 'all');
    const [matching, setMatching] = useState<MatchingFilter>(filters.matching ?? 'all');
    // ตาราง reload แบบ preserveState (กรอง / ค้นหา / เปลี่ยนหน้า) ไม่มี skeleton ของทั้งแอป
    // — โชว์ busy ทับตารางเอง เฉพาะเมื่อโหลดนานกว่า 150ms (โหลดเร็วไม่กระพริบ)
    const [navigating, setNavigating] = useState(false);
    const showNavBusy = useFioriBusy(navigating, 150);
    const navEvents = { onStart: () => setNavigating(true), onFinish: () => setNavigating(false) };
    const [perPage, setPerPage] = useState<number>(products.per_page ?? 25);
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
    // ร้านที่กำลังติ๊ก publish/unpublish อยู่
    const [togglingShopId, setTogglingShopId] = useState<number | null>(null);

    // สินค้าที่ drawer "กำลังเปิดดูอยู่จริง" ตอนนี้ — แยกจาก detailProductId (state)
    // เพราะ closure ของ refreshDetail ด้านล่างถูกสร้างไว้
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
        setTogglingShopId(null);
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

    // Category mapping section state
    const [selectedShopeeCatId, setSelectedShopeeCatId] = useState<number | null>(null);
    const [savingCatMap, setSavingCatMap] = useState(false);
    const [clearingCatMap, setClearingCatMap] = useState(false);
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
    // ล้าง Category Attributes mapping (ตาราง "2. Attribute Mapping") ทั้งหมด
    // ในครั้งเดียว — คนละปุ่มกับ clearingCatMap ด้านบน (ล้าง Category Mapping)
    // ไม่แตะ Payload Shopee (ฟิลด์ตายตัว name/price/qty/... — Section ถัดไป)
    // ตามที่ user ขอ ดู clearAllAttributeMappings() ด้านล่าง
    const [clearingAttributeMappings, setClearingAttributeMappings] = useState(false);
    const [clearAttributeMappingsError, setClearAttributeMappingsError] = useState<string | null>(null);
    // "สร้าง/อัปเดต Attribute Family" — auto-generate ตระกูลแอตทริบิวต์จาก PIM
    // attribute ที่แมปไว้แล้ว แล้วผูกกับ PIM Category นี้ ให้ฟิลด์โผล่ในหน้า Edit
    // Product ทันที (ดู ShopeeAttributeFamilyGenerator ฝั่ง backend)
    const [syncingFamily, setSyncingFamily] = useState(false);
    const [familySyncResult, setFamilySyncResult] = useState<{ name: string; count: number; newlyCreatedCount: number; editUrl: string } | null>(
        null,
    );
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
            router.get(
                '/catalog/marketplace/shopee/products',
                { search, matching, filter, per_page: perPage },
                { preserveState: true, replace: true, ...navEvents },
            );
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const applyFilter = (value: ProductFilter) => {
        setFilter(value);
        router.get(
            '/catalog/marketplace/shopee/products',
            { search, matching, filter: value, per_page: perPage },
            { preserveState: true, ...navEvents },
        );
    };

    const applyMatching = (value: MatchingFilter) => {
        setMatching(value);
        router.get(
            '/catalog/marketplace/shopee/products',
            { search, matching: value, filter, per_page: perPage },
            { preserveState: true, ...navEvents },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/shopee/products', { search, matching, filter, per_page: value }, { preserveState: true, ...navEvents });
    };

    const goToPage = (page: number) => {
        router.get(
            '/catalog/marketplace/shopee/products',
            { search, matching, filter, per_page: perPage, page },
            { preserveState: true, ...navEvents },
        );
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

    // step "นำเข้าและแก้ไขข้อมูลจาก Shopee" — ปุ่มดินสอ (แก้ไข) ทั้งในตารางและบนหัวหน้าพามาที่นี่
    const EDIT_SECTION_INDEX = 4;
    // step "Push ไป Shopee" — ที่เดียวที่ push / ปิดการขาย / ลบ listing ได้
    const PUSH_SECTION_INDEX = 5;
    const [pendingSection, setPendingSection] = useState<number | null>(null);
    const openProductAt = (product: ProductRow, idx: number) => {
        openProduct(product);
        setPendingSection(idx);
    };
    useEffect(() => {
        if (pendingSection === null || !activeProduct) return;
        const idx = pendingSection;
        setPendingSection(null);
        window.setTimeout(() => scrollToSection(idx), 0);
    }, [pendingSection, activeProduct]);

    // เปิด object page ของสินค้า → รีเซ็ตการเลื่อนของ container ชั้นนอก (ค้างมาจากตอนเลื่อนตาราง
    // สินค้ายาวๆ) ไม่งั้น object page จะเปิดมาแบบเลื่อนเกินไปแล้ว header หลุดจอ / body ถูกตัด
    useEffect(() => {
        if (!activeProduct) return;
        for (let node = scrollBodyRef.current?.parentElement ?? null; node; node = node.parentElement) {
            if (node.scrollTop > 0) node.scrollTop = 0;
        }
        window.scrollTo(0, 0);
    }, [activeProduct?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const scrollToSection = (idx: number) => {
        suppressScrollSpy.current = true;
        setSectionIndex(idx);
        // เลื่อนเฉพาะ body ของ object page เอง — scrollIntoView() เลื่อน container ชั้นนอกของแอป
        // ไปด้วย ทำให้ header หลุดจอและเนื้อหาถูกตัดเหลือพื้นเทาด้านล่าง (overflow)
        const body = scrollBodyRef.current;
        const section = sectionRefs.current[idx];
        if (body && section) {
            const top = section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - SECTION_SCROLL_MARGIN;
            body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
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

    // Deep link จากหน้า "จับคู่สินค้า (Product Matching)" (ปุ่ม "ไปหน้าแมพ" ของ
    // listing ที่ผูกแล้ว): ?search=<sku>&open=<product id> — เปิดสินค้านั้นทันที
    // &category=<id> = หมวดหมู่จริงของ listing บน platform — ตั้งเป็นค่าเริ่มต้นใน
    // picker ให้เฉพาะสินค้าที่ยังไม่ได้แมพหมวดหมู่ (ยังต้องกดบันทึกเองเหมือนเดิม)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const openId = Number(params.get('open'));
        const row = openId ? products.data.find((p) => p.id === openId) : undefined;
        if (!row) return;
        openProduct(row);
        // &section=edit|push — เช่นลิงก์ "ไป Push" จากหน้าแก้ไขสินค้า
        const section = params.get('section');
        if (section === 'edit' || section === 'push') setPendingSection(section === 'push' ? PUSH_SECTION_INDEX : EDIT_SECTION_INDEX);
        const categoryId = Number(params.get('category'));
        if (categoryId && !row.category_mapped) setSelectedShopeeCatId(categoryId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // ล้าง Category Mapping ทิ้ง — ยิง shopee_category_id: null ไปที่ endpoint
    // เดียวกับตอนบันทึก (bulkMapMarketplaceCategory ฝั่ง backend รองรับ null
    // อยู่แล้ว ดู CategoryController.php — mirror ของ lazada-products.tsx's
    // clearCategoryMapping() เป๊ะ) เพราะ mapping ผูกกับ Master Category ไม่ใช่
    // ตัวสินค้า การล้างจึงมีผลกับสินค้าทุกตัวในหมวดเดียวกัน และทำให้ push ไป
    // Shopee ไม่ได้จนกว่าจะแมปใหม่ — เตือนก่อนเสมอ
    const clearCategoryMapping = async () => {
        if (!activeProduct || !activeProduct.master_category) return;

        const confirmed = await confirm({
            title: 'ล้าง Category Mapping',
            message:
                'การล้าง Category Mapping นี้จะมีผลกับสินค้าทุกตัวที่อยู่ใน Master Category เดียวกัน และจะทำให้สินค้ากลุ่มนี้ Push ไป Shopee ไม่ได้จนกว่าจะแมปใหม่ ต้องการดำเนินการต่อหรือไม่?',
            severity: 'warning',
            confirmLabel: 'ล้าง Category Mapping',
            destructive: true,
        });
        if (!confirmed) return;

        setClearingCatMap(true);

        // ส่ง product_id ไม่ใช่ category_id ตรงๆ — endpoint นี้ (ต่างจาก
        // categories/shopee-mapping ปกติที่ใช้ตอนบันทึก) จะไปหาเองว่าหมวดหมู่
        // ไหนในสายของสินค้านี้ผูก mapping ไว้จริง แล้วล้างให้ครบทุกตัว ไม่ใช่
        // แค่ master_category.id (ตัวที่ลึกที่สุด สำหรับแสดงผลเท่านั้น) ซึ่งอาจ
        // ไม่ใช่ตัวที่ผูก mapping จริงถ้าข้อมูลมาจากที่อื่น — ดู
        // CategoryController::clearProductMarketplaceCategory()'s docblock
        // เต็มๆ ว่าทำไมถึงเคยกดล้างแล้ว field ที่ Shopee บังคับยังโชว์อยู่ใน
        // หน้า Edit Product เหมือนเดิมทุกอย่าง
        router.post(
            '/catalog/categories/shopee-mapping/clear-for-product',
            { product_id: activeProduct.id },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setClearingCatMap(false);
                    setSelectedShopeeCatId(null);
                    setShopeeAttributes(null);
                    setActiveProduct((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  category_mapped: false,
                                  shopee_category: null,
                              }
                            : prev,
                    );
                },
                onError: () => setClearingCatMap(false),
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

    const syncAttributeFamily = async () => {
        if (!activeProduct?.master_category) return;
        const confirmed = await confirm({
            title: 'สร้าง/อัปเดต Attribute Family',
            message: 'การกดปุ่มนี้อาจสร้าง PIM Attribute ใหม่หลายตัวสำหรับ Shopee attribute ที่ยังไม่มีใครแมป ต้องการดำเนินการต่อหรือไม่?',
            severity: 'warning',
            confirmLabel: 'ดำเนินการต่อ',
        });
        if (!confirmed) return;

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
                    prev
                        ? prev.map((a) => (a.id === shopeeAttributeId ? { ...a, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : a))
                        : prev,
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

    // ล้าง mapping ของทุกแถวใน "2. Attribute Mapping" (attribute_list ของ
    // Shopee) ที่กำลังโชว์อยู่ตอนนี้ในครั้งเดียว — ต่างจาก clearAttribute()
    // ด้านบนที่ล้างทีละแถว ส่ง mappings หลายรายการไปพร้อมกันได้ในคำขอเดียว (ดู
    // ShopeeAttributeMappingController::update() — validate เป็น array อยู่แล้ว)
    // ไม่แตะ Payload Shopee (ฟิลด์ตายตัว name/price/qty/... จัดการแยกด้วย
    // clearPayloadField()) เพราะเป็นคนละกลุ่มกันตามที่ user ขอ — mapping พวกนี้
    // เป็นระดับ global ต่อ PIM attribute ไม่ผูกกับหมวดหมู่ไหนเป็นการเฉพาะ (ดู
    // docblock ของ clearCategoryMapping() ด้านบน) การล้างจากตรงนี้จึงหมายถึง
    // ล้างเฉพาะรายการที่กำลังแมปอยู่ในตารางของหมวดหมู่ที่สินค้านี้ผูกอยู่เท่านั้น
    // ไม่ใช่ mapping ทั้งระบบ
    const clearAllAttributeMappings = async () => {
        const mappedRows = (shopeeAttributes ?? []).filter((a) => a.mapped);
        if (mappedRows.length === 0) return;

        const confirmed = await confirm({
            title: 'ล้าง Attribute Mapping',
            message: `ล้างการแมป PIM attribute ออกจาก Shopee attribute ทั้งหมด ${mappedRows.length} รายการที่แมปไว้ในหมวดหมู่นี้? mapping เป็นระดับ global เลยจะมีผลกับสินค้าทุกตัวที่ใช้ attribute เหล่านี้ ต้องแมปใหม่เองทีละตัว ต้องการดำเนินการต่อหรือไม่?`,
            severity: 'warning',
            confirmLabel: 'ล้าง Attribute Mapping',
            destructive: true,
        });
        if (!confirmed) return;

        setClearingAttributeMappings(true);
        setClearAttributeMappingsError(null);
        fetch('/catalog/attributes/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: mappedRows.map((a) => ({
                    attribute_id: a.mapped!.id,
                    target_field: null,
                    shopee_attribute_id: null,
                    sort_order: 0,
                })),
            }),
        })
            .then((res) => {
                // ต่างจาก clearAttribute()/assignAttribute() ทีละแถวด้านบน
                // (เงียบๆ ปล่อยผ่านตอน error เหมือนกัน) — ตัวนี้เป็น bulk action
                // ล้างได้หลายสิบรายการพร้อมกัน เงียบไปเฉยๆ ตอน error (session
                // หลุด/500) จะทำให้ดูเหมือนล้างสำเร็จทั้งที่ไม่มีอะไรถูกล้างเลย
                // แม้แต่รายการเดียว เลยต้องมี error banner บอกจริงๆ
                if (!res.ok) {
                    setClearAttributeMappingsError('ล้าง Attribute Mapping ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
                    return;
                }
                setShopeeAttributes((prev) => (prev ? prev.map((a) => (a.mapped ? { ...a, mapped: null } : a)) : prev));
            })
            .catch(() => setClearAttributeMappingsError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'))
            .finally(() => setClearingAttributeMappings(false));
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
                    prev
                        ? prev.map((f) => (f.target_field === field ? { ...f, mapped: { id: pimAttribute.id, name: pimAttribute.name } } : f))
                        : prev,
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

    // จอแคบ = quick-view panel เต็มจอ (เดิม Drawer width xs:100%)
    const isNarrow = useMediaQuery('(max-width: 599px)');

    const columns: FioriResponsiveColumn<ProductRow>[] = [
        {
            key: 'product',
            header: 'สินค้า',
            priority: 'always',
            minWidth: 260,
            render: (row) => (
                <div>
                    <HStack gap="0.25rem">
                        <Link onClick={() => openProduct(row)} style={{ fontWeight: 600 }}>
                            {row.name}
                        </Link>
                        {canEditProducts && (
                            <Button
                                design="Transparent"
                                icon="edit"
                                tooltip="แก้ไขสินค้า"
                                accessibleName="แก้ไขสินค้า"
                                onClick={() => openProductAt(row, EDIT_SECTION_INDEX)}
                            />
                        )}
                    </HStack>
                    <HStack gap="0.5rem" style={{ marginTop: '0.125rem' }}>
                        <Caption mono>{row.sku}</Caption>
                        {row.variants_count > 0 && <FioriStatus label={`${row.variants_count} variants`} tone="neutral" />}
                    </HStack>
                </div>
            ),
        },
        {
            key: 'matching',
            header: 'Matching',
            popinText: 'Matching',
            priority: 'high',
            align: 'center',
            width: 96,
            minWidth: 96,
            render: (row) => <MatchedListingCell matching={row.matching} canRefresh={canEditProducts} canOpenProduct={canEditProducts} />,
        },
        {
            key: 'master_category',
            header: 'Master Category',
            priority: 'medium',
            minWidth: 220,
            render: (row) =>
                row.master_category ? (
                    <Body style={{ fontSize: '0.8125rem' }}>{row.master_category.path || row.master_category.name}</Body>
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
                    <div>
                        <Body style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{row.shopee_category.path || row.shopee_category.name}</Body>
                        <Caption mono>sp:{row.shopee_category.id}</Caption>
                    </div>
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
                    <Caption>—</Caption>
                ),
        },
        {
            key: 'shopee_sync',
            header: 'สถานะ Sync',
            priority: 'medium',
            minWidth: 170,
            render: (row) =>
                row.shopee_sync.synced ? (
                    <span
                        style={{ display: 'inline-block' }}
                        title={row.shopee_sync.shops
                            .map((shop) => `${shop.name}${shop.last_synced_at ? ` — ${new Date(shop.last_synced_at).toLocaleString()}` : ''}`)
                            .join('\n')}
                    >
                        <FioriStatus
                            label={
                                row.shopee_sync.shops.length === 1
                                    ? `Sync แล้ว: ${row.shopee_sync.shops[0].name}`
                                    : `Sync แล้ว: ${row.shopee_sync.shops.length} ร้าน`
                            }
                            tone="success"
                        />
                    </span>
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
                <HStack gap="0.5rem" justify="flex-end">
                    <Button design={row.category_mapped ? 'Default' : 'Emphasized'} onClick={() => openProduct(row)}>
                        {row.category_mapped ? 'แก้ไขการแมพ' : 'เริ่มแมพ'}
                    </Button>
                    {/* เปิด quick-view sidebar (ดูรายละเอียด attribute/สถานะ sync แบบ
                    เร็วๆ) — คนละปุ่มกับด้านบนที่พาไปหน้า Object Page เต็มหน้า */}
                    <Button
                        design="Transparent"
                        icon="slim-arrow-right"
                        tooltip="ดูรายละเอียดสินค้านี้"
                        accessibleName="ดูรายละเอียดสินค้านี้"
                        onClick={() => openDetail(row.id)}
                    />
                </HStack>
            ),
        },
    ];

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;

    // Check mandatory attributes status for active product
    const unmappedMandatoryCount = shopeeAttributes ? shopeeAttributes.filter((a) => a.mandatory && !a.mapped).length : 0;
    const mandatoryAttributesCount = shopeeAttributes ? shopeeAttributes.filter((a) => a.mandatory).length : 0;
    const visibleShopeeAttributes = shopeeAttributes ? (showMandatoryOnly ? shopeeAttributes.filter((a) => a.mandatory) : shopeeAttributes) : null;

    // ──────────────────────────────────────────────────────────────────────
    // Object Page — mirror ของ lazada-products.tsx เป๊ะ (ดูตัวนั้นๆ docblock)
    // ──────────────────────────────────────────────────────────────────────
    if (activeProduct) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={`Shopee Mapping | ${activeProduct.sku}`} />
                <div className={styles.objectPage}>
                    {/* Object Page header — ไม่ scroll ไปกับเนื้อหา */}
                    <div className={styles.objectHeader}>
                        <div>
                            <Button design="Transparent" icon="nav-back" onClick={() => setActiveProduct(null)} style={{ marginBottom: '0.5rem' }}>
                                กลับไปหน้ารายการ
                            </Button>
                            <HStack gap="0.25rem">
                                <Title level="H5" size="H5" wrappingType="Normal">
                                    {activeProduct.name}
                                </Title>
                                {canEditProducts && (
                                    <Button
                                        design="Transparent"
                                        icon="edit"
                                        tooltip="แก้ไขสินค้า"
                                        accessibleName="แก้ไขสินค้า"
                                        onClick={() => scrollToSection(EDIT_SECTION_INDEX)}
                                    />
                                )}
                                {activeProduct.matching.matched && (
                                    <MatchedListingCell
                                        matching={activeProduct.matching}
                                        canRefresh={canEditProducts}
                                        canOpenProduct={canEditProducts}
                                    />
                                )}
                            </HStack>
                            <Caption mono>SKU: {activeProduct.sku}</Caption>
                            {/* Object Status facets — สถานะ mapping ของสินค้านี้ ณ ตอนนี้ */}
                            <HStack gap="0.5rem" wrap style={{ marginTop: '0.625rem' }}>
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
                            </HStack>
                        </div>
                    </div>

                    {/* Scrollable Body — พื้นที่เดียวในหน้านี้ที่ scroll ได้ */}
                    <div ref={scrollBodyRef} className={styles.objectBody}>
                        {/* Anchor bar — sticky, ทำหน้าที่เป็น scroll-spy nav ไม่ใช่สลับ panel */}
                        <div ref={anchorBarRef} className={styles.anchorBar}>
                            <TabContainer collapsed onTabSelect={(e) => scrollToSection(e.detail.tabIndex)}>
                                <Tab text="1. Category Mapping" selected={sectionIndex === 0} />
                                <Tab text="2. Attribute Mapping" disabled={!activeProduct.category_mapped} selected={sectionIndex === 1} />
                                <Tab text="3. Brand Mapping" disabled={!activeProduct.category_mapped} selected={sectionIndex === 2} />
                                <Tab text="4. Payload Shopee" selected={sectionIndex === 3} />
                                <Tab text="5. นำเข้าและแก้ไขข้อมูลจาก Shopee" selected={sectionIndex === 4} />
                                <Tab text="6. Push ไป Shopee" selected={sectionIndex === 5} />
                                <Tab text="7. History" disabled={!activeProduct.master_category} selected={sectionIndex === 6} />
                            </TabContainer>
                        </div>

                        <div className={styles.objectSections}>
                            {/* Section 1 — Category Mapping */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[0] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.25rem">
                                    <HStack justify="space-between" align="flex-start" gap="1rem">
                                        <SectionHeading
                                            title="เลือก Shopee Category ปลายทางสำหรับ Master Category นี้"
                                            description="การเปลี่ยน Category Mapping ตรงนี้ จะมีผลกับสินค้าทุกตัวที่อยู่ใน Master Category เดียวกันอัตโนมัติ"
                                        />
                                        <Button
                                            icon="synchronize"
                                            disabled={syncingCategoryTree}
                                            loading={syncingCategoryTree}
                                            loadingDelay={0}
                                            onClick={syncCategoryTree}
                                            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                                        >
                                            Sync Categories จาก Shopee
                                        </Button>
                                    </HStack>

                                    {categorySyncMessage && (
                                        <FioriMessageStrip
                                            severity={categorySyncMessage.isError ? 'error' : 'success'}
                                            onClose={() => setCategorySyncMessage(null)}
                                        >
                                            {categorySyncMessage.text}
                                        </FioriMessageStrip>
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
                                                        ? {
                                                              ...prev,
                                                              master_category: {
                                                                  id: category.id,
                                                                  name: category.name,
                                                                  path: category.path,
                                                                  shopee_category_id: null,
                                                              },
                                                          }
                                                        : prev,
                                                )
                                            }
                                        />
                                    )}

                                    <div style={{ maxWidth: 420 }}>
                                        <MarketplaceCategoryPicker
                                            platform="shopee"
                                            label="Shopee Category"
                                            value={selectedShopeeCatId}
                                            onChange={setSelectedShopeeCatId}
                                        />
                                    </div>

                                    {/* แนะนำหมวดหมู่จาก Shopee จริง (v2.product.category_recommend)
                                    — เลือกจากชื่อสินค้าตัวนี้ กดแล้วแค่ตั้งค่า
                                    selectedShopeeCatId เหมือน picker ด้านบน ยังต้อง
                                    กด "บันทึก Category Mapping" ต่อเองเหมือนเดิม */}
                                    <div>
                                        <Button
                                            icon="ai"
                                            disabled={loadingCategorySuggestions}
                                            loading={loadingCategorySuggestions}
                                            loadingDelay={0}
                                            onClick={loadCategorySuggestions}
                                        >
                                            {loadingCategorySuggestions ? 'กำลังค้นหา...' : 'แนะนำหมวดหมู่จาก Shopee'}
                                        </Button>

                                        {categorySuggestionError && (
                                            <FioriMessageStrip
                                                severity="warning"
                                                style={{ marginTop: '0.5rem' }}
                                                onClose={() => setCategorySuggestionError(null)}
                                            >
                                                {categorySuggestionError}
                                            </FioriMessageStrip>
                                        )}

                                        {categorySuggestions &&
                                            (categorySuggestions.length === 0 ? (
                                                <Body style={{ color: TONE_TEXT.neutral, marginTop: '0.5rem' }}>
                                                    Shopee ไม่มีคำแนะนำให้สำหรับสินค้านี้
                                                </Body>
                                            ) : (
                                                <HStack wrap gap="0.5rem" style={{ marginTop: '0.5rem' }}>
                                                    {categorySuggestions.map((s) => (
                                                        <Button
                                                            key={s.category_id}
                                                            design={selectedShopeeCatId === s.category_id ? 'Emphasized' : 'Default'}
                                                            onClick={() => setSelectedShopeeCatId(s.category_id)}
                                                        >
                                                            {s.path || s.name || String(s.category_id)}
                                                        </Button>
                                                    ))}
                                                </HStack>
                                            ))}
                                    </div>

                                    <HStack gap="0.75rem">
                                        <Button
                                            design="Emphasized"
                                            icon="accept"
                                            disabled={!selectedShopeeCatId || savingCatMap || clearingCatMap}
                                            loading={savingCatMap}
                                            loadingDelay={0}
                                            onClick={saveCategoryMapping}
                                        >
                                            บันทึก Category Mapping & ดำเนินการต่อ
                                        </Button>

                                        {activeProduct.category_mapped && (
                                            <Button
                                                design="Negative"
                                                icon="delete"
                                                disabled={savingCatMap || clearingCatMap}
                                                loading={clearingCatMap}
                                                loadingDelay={0}
                                                onClick={clearCategoryMapping}
                                            >
                                                ล้าง Category Mapping
                                            </Button>
                                        )}
                                    </HStack>
                                </VStack>
                            </SectionCard>

                            {/* Section 2 — Attribute Mapping (locked จนกว่าจะแมป Category ก่อน) */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[1] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                {!activeProduct.category_mapped || !activeProduct.shopee_category ? (
                                    <LockedNotice>กรุณาบันทึก Category Mapping (Section 1) ก่อน ถึงจะแมป Attributes ได้</LockedNotice>
                                ) : (
                                    <VStack gap="1.5rem">
                                        <HStack justify="space-between" wrap gap="1rem">
                                            <div>
                                                <Title level="H6" size="H6" wrappingType="Normal" style={{ display: 'block' }}>
                                                    {activeProduct.shopee_category.path || activeProduct.shopee_category.name}
                                                </Title>
                                                <Caption mono>sp:{activeProduct.shopee_category.id}</Caption>
                                            </div>
                                            <HStack gap="0.5rem" wrap>
                                                <span
                                                    title={
                                                        !syncingFamily && (shopeeAttributes ?? []).length === 0
                                                            ? 'ยังไม่มีข้อมูล Shopee Attributes ในระบบ กด "Sync Attributes" ก่อน'
                                                            : undefined
                                                    }
                                                >
                                                    <Button
                                                        icon="collections-management"
                                                        disabled={syncingFamily || (shopeeAttributes ?? []).length === 0}
                                                        loading={syncingFamily}
                                                        loadingDelay={0}
                                                        onClick={syncAttributeFamily}
                                                    >
                                                        สร้าง/อัปเดต Attribute Family
                                                    </Button>
                                                </span>
                                                <Button
                                                    icon="synchronize"
                                                    disabled={syncingAttributes}
                                                    loading={syncingAttributes}
                                                    loadingDelay={0}
                                                    onClick={syncAttributes}
                                                >
                                                    Sync Attributes
                                                </Button>
                                                {(shopeeAttributes ?? []).some((a) => a.mapped) && (
                                                    <Button
                                                        design="Negative"
                                                        icon="delete"
                                                        disabled={clearingAttributeMappings}
                                                        loading={clearingAttributeMappings}
                                                        loadingDelay={0}
                                                        onClick={clearAllAttributeMappings}
                                                    >
                                                        ล้าง Attribute Mapping
                                                    </Button>
                                                )}
                                            </HStack>
                                        </HStack>

                                        {familySyncResult && (
                                            <FioriMessageStrip severity="success" onClose={() => setFamilySyncResult(null)}>
                                                สร้าง/อัปเดต Attribute Family &quot;{familySyncResult.name}&quot; แล้ว ({familySyncResult.count}{' '}
                                                attributes
                                                {familySyncResult.newlyCreatedCount > 0 &&
                                                    `, สร้างใหม่ ${familySyncResult.newlyCreatedCount} attribute`}
                                                ) —{' '}
                                                <Link href={familySyncResult.editUrl} target="_blank">
                                                    เปิดหน้าตรวจสอบ
                                                </Link>
                                            </FioriMessageStrip>
                                        )}
                                        {familySyncError && (
                                            <FioriMessageStrip severity="error" onClose={() => setFamilySyncError(null)}>
                                                {familySyncError}
                                            </FioriMessageStrip>
                                        )}
                                        {clearAttributeMappingsError && (
                                            <FioriMessageStrip severity="error" onClose={() => setClearAttributeMappingsError(null)}>
                                                {clearAttributeMappingsError}
                                            </FioriMessageStrip>
                                        )}

                                        {unmappedMandatoryCount > 0 && (
                                            <FioriMessageStrip severity="error">
                                                มี {unmappedMandatoryCount} attribute ที่ Shopee บังคับ (Required) แต่ยังไม่ได้แมป —
                                                สินค้าในหมวดหมู่นี้จะ sync ไม่ผ่าน
                                            </FioriMessageStrip>
                                        )}

                                        {shopeeAttributes && shopeeAttributes.length > 0 && (
                                            <CheckBox
                                                checked={showMandatoryOnly}
                                                onChange={(e) => setShowMandatoryOnly(e.target.checked)}
                                                text={`แสดงเฉพาะที่ Shopee บังคับ (Required) (${mandatoryAttributesCount})`}
                                                style={{ alignSelf: 'flex-start' }}
                                            />
                                        )}

                                        {loadingAttributes ? (
                                            <CenteredSpinner />
                                        ) : visibleShopeeAttributes && visibleShopeeAttributes.length > 0 ? (
                                            <MappingTable headers={['Shopee Attribute', 'PIM Attribute (ต้นทาง)']}>
                                                {visibleShopeeAttributes.map((attr) => {
                                                    const isMappable =
                                                        attr.input_type !== null && MAPPABLE_SHOPEE_INPUT_TYPES.includes(attr.input_type);

                                                    return (
                                                        <tr key={attr.id}>
                                                            <td>
                                                                <Body style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                                                                    {attr.name} {attr.mandatory && <span style={{ color: TONE_TEXT.error }}>*</span>}
                                                                </Body>
                                                                <Caption>
                                                                    {attr.input_type !== null
                                                                        ? (SHOPEE_INPUT_TYPE_LABELS[attr.input_type] ?? attr.input_type)
                                                                        : 'ไม่ทราบชนิด'}
                                                                </Caption>
                                                            </td>
                                                            <td>
                                                                {!isMappable ? (
                                                                    <FioriStatus label="ไม่รองรับการแมปอัตโนมัติ" tone="neutral" />
                                                                ) : (
                                                                    <VStack gap="0.5rem">
                                                                        <HStack gap="0.5rem">
                                                                            <div style={{ flex: 1, minWidth: 200 }}>
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
                                                                            </div>
                                                                            {savingAttributeId === attr.id && <Spinner />}
                                                                        </HStack>
                                                                        {attr.input_type !== null &&
                                                                            SELECT_SHOPEE_INPUT_TYPES.includes(attr.input_type) &&
                                                                            attr.mapped && (
                                                                                <Button
                                                                                    onClick={() => setOptionMappingRow(attr)}
                                                                                    style={{ alignSelf: 'flex-start' }}
                                                                                >
                                                                                    จับคู่ตัวเลือก ({attr.option_mappings.length}/
                                                                                    {attr.options.length})
                                                                                </Button>
                                                                            )}
                                                                    </VStack>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </MappingTable>
                                        ) : shopeeAttributes && shopeeAttributes.length > 0 ? (
                                            <Body style={{ color: TONE_TEXT.neutral, textAlign: 'center', padding: '1.5rem 0' }}>
                                                ไม่มี attribute ที่ Shopee บังคับ (Required) เลยในหมวดหมู่นี้
                                            </Body>
                                        ) : (
                                            <Body style={{ color: TONE_TEXT.neutral, textAlign: 'center', padding: '1.5rem 0' }}>
                                                ยังไม่มีข้อมูล Attributes ในระบบ กรุณากด "Sync Attributes"
                                            </Body>
                                        )}
                                    </VStack>
                                )}
                            </SectionCard>

                            {/* Section 3 — Brand Mapping: แยกออกมาจาก Section 2 เป็นของตัวเอง
                                (ไม่ยัดรวมกัน) — Brand ของ Shopee ไม่ได้ sync มาเป็น Shopee
                                attribute ธรรมดา (ผูกกับ pbrand + Brand master แทน — ดู
                                ShopeeProductSyncService::resolveShopeeBrandId()) เลยไม่มีวันโผล่
                                ในตาราง Attribute ของ section 2 ไม่ว่ายังไง — section นี้ย้ายมาจาก
                                categories/shopee-mapping.tsx ทั้งก้อน (ดู
                                ShopeeBrandMappingPanel's docblock) ให้จับคู่ได้ตรงนี้เลย แทนที่จะ
                                ต้องสลับไปอีกหน้า — lock เหมือน section 2 เพราะต้องรู้ shopee_category
                                ก่อนถึงจะรู้ว่าจะ sync/จับคู่แบรนด์ของหมวดหมู่ไหน */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[2] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                {!activeProduct.category_mapped || !activeProduct.shopee_category ? (
                                    <LockedNotice>กรุณาบันทึก Category Mapping (Section 1) ก่อน ถึงจะแมป Brand ได้</LockedNotice>
                                ) : (
                                    <ShopeeBrandMappingPanel
                                        shopeeCategoryId={activeProduct.shopee_category.id}
                                        shopeeCategoryName={activeProduct.shopee_category.path || activeProduct.shopee_category.name}
                                    />
                                )}
                            </SectionCard>

                            {/* Section 4 — Payload Shopee: ฟิลด์ payload ตายตัวของ Shopee เอง
                                (name/price/qty/weight/length/width/height/description/video)
                                ไม่ผูกกับหมวดหมู่ไหนเลย ต่างจาก section 2 ที่เป็น category
                                attribute — เลยไม่ต้อง lock ไว้จนกว่าจะแมป Category ก่อนเหมือน
                                section 2 */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[3] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="แมป PIM Attribute เข้ากับฟิลด์ payload ของ Shopee"
                                        description="ฟิลด์ตายตัวของ Shopee เอง (ไม่ใช่ attribute เฉพาะหมวดหมู่แบบ section 2) — ใช้ร่วมกันทุกสินค้า เปลี่ยนตรงนี้มีผลกับสินค้าทุกตัวในระบบ"
                                    />

                                    {loadingPayloadFields ? (
                                        <CenteredSpinner />
                                    ) : (
                                        <MappingTable headers={['Shopee Payload Field', 'PIM Attribute (ต้นทาง)']}>
                                            {(payloadFields ?? []).map((f) => (
                                                <tr key={f.target_field}>
                                                    <td>
                                                        <Body style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                                                            {PAYLOAD_FIELD_LABELS[f.target_field]}
                                                        </Body>
                                                        <Caption>{f.target_field}</Caption>
                                                    </td>
                                                    <td>
                                                        <HStack gap="0.5rem">
                                                            <div style={{ flex: 1, minWidth: 200 }}>
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
                                                            </div>
                                                            {savingPayloadField === f.target_field && <Spinner />}
                                                        </HStack>
                                                    </td>
                                                </tr>
                                            ))}
                                        </MappingTable>
                                    )}
                                </VStack>
                            </SectionCard>

                            {/* Section 5 — นำเข้าและแก้ไขข้อมูลจาก Shopee: ฟอร์มแก้ค่าใน PIM จัดแท็บย่อยแบบหน้า
                                seller center ของ Shopee + ค่าจาก listing ที่จับคู่ไว้ — ดู PlatformEditPanel / ListingImportService
                                (ปุ่มดินสอ "แก้ไข" ในตารางและบนหัวหน้าพามาที่ step นี้) */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[4] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                                // พื้นหลังสีแยกให้เห็นว่าเป็น step แก้ไขข้อมูล (ไม่ใช่ step ตั้งค่า mapping)
                                style={{
                                    ['--section-bg' as string]: '#f5f8fe',
                                    ['--section-hover-bg' as string]: '#e8effd',
                                }}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="นำเข้าและแก้ไขข้อมูลจาก Shopee"
                                        description='แก้ค่าใน PIM ที่ใช้ส่งขึ้น Shopee — ถ้าจับคู่ listing ไว้ จะเห็นค่าบนร้านใต้แต่ละช่องพร้อมปุ่ม "ใช้ค่านี้"'
                                    />
                                    {!canEditProducts ? (
                                        <LockedNotice>ต้องมีสิทธิ์แก้ไขสินค้าจึงจะแก้ไขข้อมูลได้</LockedNotice>
                                    ) : (
                                        <PlatformEditPanel
                                            key={activeProduct.id}
                                            active={sectionIndex === 4}
                                            productId={activeProduct.id}
                                            platform="shopee"
                                            platformLabel="Shopee"
                                            listings={activeProduct.matching.listings}
                                            platformCategoryId={activeProduct.shopee_category?.id ?? null}
                                            platformCategoryPath={activeProduct.shopee_category?.path ?? null}
                                            onSaved={loadPayloadFields}
                                        />
                                    )}
                                </VStack>
                            </SectionCard>

                            {/* Section 6 — Push ไป Shopee: ที่เดียวที่ส่งข้อมูลขึ้นร้านได้ (Push / ปิดการขาย / ลบ /
                                เช็คสถานะ ทีละร้าน) — ดู PlatformPushPanel / PlatformPushController */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[5] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                                // พื้นหลังเขียวอ่อน — แยกจาก step แก้ไขข้อมูล (ฟ้าอ่อน) ให้เห็นว่าเป็น step ที่ส่งข้อมูลขึ้นร้านจริง
                                style={{
                                    ['--section-bg' as string]: '#f3faf4',
                                    ['--section-hover-bg' as string]: '#e3f3e6',
                                }}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="Push ไป Shopee"
                                        description="ส่งข้อมูลสินค้าจาก PIM ขึ้นร้าน Shopee ทีละร้าน — การ Push / ปิดการขาย / ลบ listing ทำได้จากที่นี่เท่านั้น"
                                    />
                                    <PlatformPushPanel
                                        key={activeProduct.id}
                                        active={sectionIndex === 5}
                                        productId={activeProduct.id}
                                        platform="shopee"
                                        platformLabel="Shopee"
                                    />
                                </VStack>
                            </SectionCard>

                            {/* Section 7 — History: audit trail รวมของทุกขั้นตอนการแมพ Shopee
                                ของ master category นี้ — ดู ShopeeMappingTimelineBuilder ฝั่ง
                                backend สำหรับขอบเขต/ที่มาของแต่ละแหล่งข้อมูล */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[6] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="เส้นทางการแมพ Shopee ของ Master Category นี้"
                                        description="รวมทุกการเปลี่ยนแปลงของ Category Mapping (Section 1), Attribute Mapping (Section 2) — รวมถึงตัวเลือกที่จับคู่ไว้ และการสร้าง/sync Attribute Family ที่เกี่ยวข้อง เรียงใหม่สุดก่อน"
                                    />

                                    {!activeProduct.master_category ? (
                                        <LockedNotice>สินค้านี้ยังไม่มี Master Category — ไม่มีประวัติให้แสดง</LockedNotice>
                                    ) : (
                                        <TimelinePanel
                                            timelineUrl={`/catalog/attributes/shopee-mapping/timeline?category_id=${activeProduct.master_category.id}`}
                                        />
                                    )}
                                </VStack>
                            </SectionCard>
                        </div>
                    </div>
                </div>

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
                {confirmElement}
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="แมปสินค้า Shopee" />
            <div className={styles.page}>
                {/* ──── Page Header ──── */}
                <PageHeader
                    title={`สินค้า (${products.total})`}
                    subtitle="จัดการการแมปหมวดหมู่และ Attributes ของ Shopee ตั้งแต่ระดับสินค้า"
                    actions={
                        <Button design="Transparent" icon="nav-back" onClick={() => router.visit('/catalog/marketplace/shopee')}>
                            Shopee Hub
                        </Button>
                    }
                />

                {/* ──── Stat KPI Tiles ──── */}
                <KpiTiles<ProductFilter>
                    tiles={[
                        { label: 'สินค้าทั้งหมด', value: stats.total, filterValue: 'all' },
                        { label: 'แมป Category แล้ว', value: stats.mapped, tone: 'success', filterValue: 'mapped' },
                        { label: 'ยังไม่ได้แมป Category', value: stats.unmapped, tone: 'warning', filterValue: 'unmapped' },
                    ]}
                    active={filter}
                    onSelect={applyFilter}
                />

                {/* ──── Table Card (Toolbar + Data + Pagination) ──── */}
                <div className={styles.card}>
                    {/* Toolbar */}
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarStart}>
                            <SearchField value={search} onChange={setSearch} placeholder="ค้นหาตามชื่อสินค้า หรือ SKU..." />
                            <SegmentedButton
                                accessibleName="Filter"
                                onSelectionChange={(e) => {
                                    const val = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.filter as ProductFilter | undefined;
                                    if (val) applyFilter(val);
                                }}
                            >
                                <SegmentedButtonItem data-filter="all" selected={filter === 'all'}>
                                    ทั้งหมด ({stats.total})
                                </SegmentedButtonItem>
                                <SegmentedButtonItem data-filter="mapped" selected={filter === 'mapped'}>
                                    แมปแล้ว ({stats.mapped})
                                </SegmentedButtonItem>
                                <SegmentedButtonItem data-filter="unmapped" selected={filter === 'unmapped'}>
                                    ยังไม่ได้แมป ({stats.unmapped})
                                </SegmentedButtonItem>
                            </SegmentedButton>
                            <SegmentedButton
                                accessibleName="Matching"
                                onSelectionChange={(e) => {
                                    const val = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.matching as
                                        | MatchingFilter
                                        | undefined;
                                    if (val) applyMatching(val);
                                }}
                            >
                                <SegmentedButtonItem data-matching="all" selected={matching === 'all'} tooltip="Product Matching: ทั้งหมด">
                                    Matching: ทั้งหมด
                                </SegmentedButtonItem>
                                <SegmentedButtonItem data-matching="matched" selected={matching === 'matched'}>
                                    จับคู่แล้ว ({stats.matched})
                                </SegmentedButtonItem>
                                <SegmentedButtonItem data-matching="unmatched" selected={matching === 'unmatched'}>
                                    ยังไม่จับคู่ ({stats.not_matched})
                                </SegmentedButtonItem>
                            </SegmentedButton>
                        </div>

                        {/* Pagination controls — same pattern as products/index.tsx */}
                        <Pager
                            currentPage={currentPage}
                            lastPage={lastPage}
                            perPage={perPage}
                            perPageLabel={tGrid('perPage') || 'ต่อหน้า'}
                            onPerPageChange={handlePerPageChange}
                            onGoToPage={goToPage}
                        />
                    </div>

                    <div className={styles.divider} />

                    {/* Data Table — busy layer ทับระหว่างโหลดแบบ in-place */}
                    <div className={styles.busyArea} aria-busy={navigating}>
                        {showNavBusy && (
                            <div className={styles.busyLayer}>
                                <FioriBusyIndicator size="M" />
                            </div>
                        )}
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={products.data}
                            getRowKey={(row: ProductRow) => row.id}
                            emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                        />
                    </div>

                    {/* Footer info */}
                    <div className={styles.footer}>
                        <Caption>{tGrid('totalCount', { count: products.total })}</Caption>
                    </div>
                </div>
            </div>

            {/* ──────────────────────────────────────────────────────────────
                Quick-view sidebar — เปิดจากปุ่มลูกศรในตาราง (openDetail()) คนละ
                อย่างกับ Object Page เต็มหน้าด้านบน (activeProduct) ตัวนี้แค่
                สรุปเร็วๆ ว่า field ไหนของ Shopee ยังขาดอยู่บ้าง + ประวัติ sync —
                mirror ของ lazada-products.tsx เป๊ะ (เดิมเป็น MUI Drawer ด้านขวา —
                UI5 ไม่มี Drawer เลยเป็น Dialog เต็มจอบนมือถือ / กว้าง 640px บนจอใหญ่)
                ────────────────────────────────────────────────────────────── */}
            <Dialog
                open={detailProductId !== null}
                onClose={closeDetail}
                stretch={isNarrow}
                className={styles.sidePanel}
                style={isNarrow ? undefined : { width: 640, maxWidth: 'calc(100vw - 2rem)' }}
                accessibleName={detailData?.name ?? 'Product detail'}
            >
                {detailProductId !== null && (
                    <div className={styles.sidePanelInner} style={{ height: isNarrow ? '100%' : '85vh' }}>
                        {/* Header */}
                        <div className={styles.sidePanelHeader}>
                            <HStack gap="0.75rem" align="flex-start">
                                <div className={styles.thumb} style={{ width: 48, height: 48, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <HStack gap="0.25rem">
                                        <Title level="H5" size="H5" wrappingType="Normal">
                                            {detailData?.name ?? '...'}
                                        </Title>
                                        {canEditProducts && (
                                            <Button
                                                design="Transparent"
                                                icon="edit"
                                                tooltip="แก้ไขสินค้า"
                                                accessibleName="แก้ไขสินค้า"
                                                onClick={() => router.visit(`/catalog/products/${detailProductId}/edit?platform=shopee`)}
                                            />
                                        )}
                                    </HStack>
                                    <Caption>
                                        {detailData?.sku}
                                        {detailData && detailData.variants_count > 0 ? ` · ${detailData.variants_count} variants` : ''}
                                    </Caption>
                                </div>
                                <Button design="Transparent" icon="decline" accessibleName="ปิด" onClick={closeDetail} />
                            </HStack>

                            {detailData && (
                                <HStack gap="1.5rem" align="flex-start" style={{ marginTop: '0.75rem' }}>
                                    <div>
                                        <Caption block>สถานะ</Caption>
                                        <FioriStatus
                                            label={detailData.enabled ? 'ขายอยู่' : 'ปิดขาย'}
                                            tone={detailData.enabled ? 'success' : 'neutral'}
                                        />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <Caption block>Shopee category</Caption>
                                        <Body style={{ fontWeight: 600, color: TONE_TEXT.brand }}>
                                            {detailData.shopee_category_path ?? '— ยังไม่ได้ map —'}
                                        </Body>
                                    </div>
                                </HStack>
                            )}
                        </div>

                        {/* Tabs */}
                        <TabContainer collapsed onTabSelect={(e) => setDetailTab(e.detail.tabIndex)}>
                            <Tab text="Attribute" selected={detailTab === 0} />
                            <Tab text="ข้อมูลสินค้า (Platform)" selected={detailTab === 1} />
                            <Tab text="ร้านค้า" selected={detailTab === 2} />
                            <Tab text="ประวัติ Sync" selected={detailTab === 3} />
                        </TabContainer>

                        {/* Body */}
                        <div className={styles.sidePanelBody}>
                            {loadingDetail ? (
                                <CenteredSpinner />
                            ) : !detailData ? (
                                <Body style={{ color: TONE_TEXT.neutral }}>โหลดข้อมูลไม่สำเร็จ</Body>
                            ) : detailTab === 0 ? (
                                <>
                                    <ValueRows rows={detailData.attributes} showRequired />
                                    {detailData.attributes.length === 0 && (
                                        <Body style={{ color: TONE_TEXT.neutral, padding: '1rem 0' }}>
                                            ยังไม่ได้ map หมวดหมู่ Shopee ให้สินค้านี้ เลยยังไม่รู้ว่ามี field อะไรบ้าง
                                        </Body>
                                    )}
                                </>
                            ) : detailTab === 1 ? (
                                <>
                                    <ValueRows rows={detailData.platform_fields} />

                                    <Caption block style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                                        รูปสินค้า ({detailData.platform_images.length})
                                    </Caption>
                                    {detailData.platform_images.length === 0 ? (
                                        <Body style={{ color: TONE_TEXT.error }}>— ยังไม่มีรูปสินค้าให้ส่งไป Shopee —</Body>
                                    ) : (
                                        <ImageThumbs urls={detailData.platform_images} size={72} alt={(idx) => `รูปสินค้า ${idx + 1}`} />
                                    )}
                                </>
                            ) : detailTab === 2 ? (
                                <VStack gap="0.5rem">
                                    <FioriMessageStrip severity="information">
                                        Push / ปิดการขาย / เช็คสถานะ ย้ายไปอยู่ที่ step &quot;Push ไป Shopee&quot; ของหน้า Map สินค้าแล้ว{' '}
                                        <Link
                                            onClick={() => {
                                                const row = products.data.find((r) => r.id === detailProductId);
                                                if (row) openProductAt(row, PUSH_SECTION_INDEX);
                                            }}
                                        >
                                            ไปที่ step Push
                                        </Link>
                                    </FioriMessageStrip>
                                    {detailData.shopee_shops.map((shop) => (
                                        <div
                                            key={shop.id}
                                            className={styles.listCard}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                                        >
                                            <HStack gap="0.5rem" style={{ minWidth: 0 }}>
                                                <CheckBox
                                                    accessibleName={shop.name}
                                                    checked={shop.published}
                                                    disabled={togglingShopId === shop.id}
                                                    onChange={() => toggleShopPublished(shop.id, !shop.published)}
                                                />
                                                <Body style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {shop.name}
                                                </Body>
                                                {shop.is_live && <FioriStatus label="Live" tone="success" />}
                                            </HStack>
                                        </div>
                                    ))}
                                    {detailData.shopee_shops.length === 0 && (
                                        <Body style={{ color: TONE_TEXT.neutral }}>ยังไม่มีร้าน Shopee เชื่อมต่อไว้ในระบบเลย</Body>
                                    )}
                                </VStack>
                            ) : (
                                <VStack gap="0.75rem">
                                    {detailData.sync_history.length === 0 && (
                                        <Body style={{ color: TONE_TEXT.neutral }}>ยังไม่เคย sync สินค้านี้ไป Shopee เลย</Body>
                                    )}
                                    {detailData.sync_history.map((h, idx) => (
                                        <div key={idx} className={styles.listCard}>
                                            <HStack justify="space-between" gap="0.5rem">
                                                <Body style={{ fontWeight: 600 }}>
                                                    {SYNC_ACTION_LABEL_TH[h.action] ?? h.action}
                                                    {h.shop_name ? ` — ${h.shop_name}` : ''}
                                                </Body>
                                                <FioriStatus
                                                    label={SYNC_STATUS_LABEL_TH[h.status] ?? h.status}
                                                    tone={h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'neutral'}
                                                />
                                            </HStack>
                                            {h.message && (
                                                <Caption block style={{ marginTop: '0.25rem' }}>
                                                    {h.message}
                                                </Caption>
                                            )}
                                            <Caption block style={{ marginTop: '0.25rem' }}>
                                                {new Date(h.created_at).toLocaleString()}
                                            </Caption>
                                        </div>
                                    ))}
                                </VStack>
                            )}

                            {detailPushResult && (
                                <FioriMessageStrip
                                    severity={detailPushResult.severity}
                                    style={{ marginTop: '1rem' }}
                                    onClose={() => setDetailPushResult(null)}
                                >
                                    {detailPushResult.message}
                                </FioriMessageStrip>
                            )}
                        </div>

                        {/* Footer — ปุ่ม push/deactivate ย้ายไปอยู่ในแท็บ "ร้านค้า" แล้ว
                        (รองรับได้หลายร้านพร้อมกัน) footer นี้เหลือแค่ทางลัดไปแก้
                        ข้อมูลเต็มรูปแบบ/ปิด sidebar เท่านั้น */}
                        <Bar
                            design="Footer"
                            startContent={
                                canEditProducts ? (
                                    <Button
                                        design="Transparent"
                                        onClick={() => router.visit(`/catalog/products/${detailProductId}/edit?platform=shopee`)}
                                    >
                                        แก้ไข
                                    </Button>
                                ) : undefined
                            }
                            endContent={
                                <Button design="Transparent" onClick={closeDetail}>
                                    ปิด
                                </Button>
                            }
                        />
                    </div>
                )}
            </Dialog>
        </AppLayout>
    );
}
