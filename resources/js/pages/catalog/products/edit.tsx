import { NewProductSkuField, useSkuAvailability } from '@/components/catalog/new-product-sku-field';
import { QuickAddOptionDialog } from '@/components/catalog/quick-add-option-dialog';
import { FioriFormGroup, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriPdfViewer } from '@/components/fiori-pdf-viewer';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FileUploadRowsList, FioriUploadDropzoneTile } from '@/components/fiori-upload-dropzone';
import { FLOATING_STRIP_STYLE } from '@/components/flash-toast';
import { HistoryPanel } from '@/components/history-panel';
import { type ProductOption } from '@/components/product-picker';
import RichTextEditor from '@/components/rich-text-editor';
import { TimelinePanel } from '@/components/timeline-panel';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import { useFileUploadRows } from '@/hooks/use-file-upload-rows';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { localizedLabel, type Translation } from '@/lib/localized-label';
import { PRODUCT_STATUS_LABEL_KEYS, PRODUCT_STATUS_TONES, PRODUCT_STATUSES, type ProductStatus } from '@/lib/product-status';
import { type BreadcrumbItem, type SharedData } from '@/types';
import type { FormDataConvertible } from '@inertiajs/core';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action-settings.js';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/calendar.js';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/information.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/status-positive.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import '@ui5/webcomponents-icons/dist/write-new-document.js';
import {
    Bar,
    BusyIndicator,
    Button,
    CheckBox,
    ComboBox,
    ComboBoxItem,
    DatePicker,
    DateTimePicker,
    Dialog,
    Icon,
    Input,
    Label,
    Link,
    List,
    ListItemCustom,
    Menu,
    MenuItem,
    MenuSeparator,
    MultiComboBox,
    MultiComboBoxItem,
    Option,
    OptionGroup,
    Panel,
    SegmentedButton,
    SegmentedButtonItem,
    Select,
    Switch,
    Tab,
    TabContainer,
    Tag,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import styles from './edit.module.css';

// ระยะห่างจากขอบบนของพื้นที่ scroll ที่ section ของแต่ละ Attribute Group จะไปจอด
// เมื่อคลิกแท็บ (scrollMarginTop ของ Paper) — ใช้ร่วมกับ scroll-spy ที่คำนวณว่า
// แท็บไหนควรไฮไลต์ ค่าต้องตรงกันสองที่ ไม่งั้นแท็บกับเนื้อหาจะไม่ sync
const GROUP_SECTION_SCROLL_MARGIN = 80;

// ชื่อโชว์ผู้ใช้ของแต่ละ platform key (Props.platformContext, มาจาก ?platform=
// ของ URL ตอนกดแก้ไขจากหน้า Products Mapping) — ตัวพิมพ์ใหญ่-เล็กเป๊ะตามที่
// backend เก็บไว้จริงใน sales_platforms.name (TikTok/WooCommerce ไม่ใช่แค่
// capitalize ตัวแรกเฉยๆ) ใช้ในข้อความ chip "Mapped to {{platform}} payload"
const PLATFORM_DISPLAY_NAMES: Record<'shopee' | 'lazada' | 'tiktok' | 'woocommerce', string> = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};

// attr.platform_field_mapping.target_field (snake_case, ตรงกับ
// ProductController::platformFieldMappingsFor()) → catalog.json translation
// key — ส่วนใหญ่ชื่อตรงกันเป๊ะอยู่แล้ว (price/qty/weight/...) ยกเว้น
// short_description ที่คีย์เป็น camelCase (เหมือนกับ FIELD_LABEL_KEYS ของ
// woocommerce-attribute-mapping-panel.tsx) — target_field ที่ไม่อยู่ในนี้
// (ไม่ควรเกิดขึ้นจริง) fallback ไปโชว์ตัว target_field ดิบๆ แทน
const PAYLOAD_FIELD_LABEL_KEYS: Record<string, string> = {
    name: 'name',
    price: 'price',
    qty: 'qty',
    weight: 'weight',
    length: 'length',
    width: 'width',
    height: 'height',
    description: 'description',
    short_description: 'shortDescription',
    image: 'image',
    video: 'video',
};

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
    /** ตัวเลือกนี้ (เช่น ค่าของ `pbrand`) ถูก map ไปยัง marketplace ไหนแล้วบ้าง — ดูที่ ProductController::decorateOptionsWithMappedPlatforms() */
    mapped_platforms?: string[];
    /** false = ถูกปิดใช้งานจากหน้า Options ของ attribute — ไม่ควรโชว์เป็นตัวเลือกใหม่ในดรอปดาวน์ (แต่ถ้าเป็นค่าที่สินค้านี้เลือกอยู่แล้วต้องยังโชว์ไว้ ไม่งั้นค่าจะหาย) ไม่มีค่า/true = เปิดใช้งานปกติ */
    is_active?: boolean;
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    is_required?: boolean;
    is_unique?: boolean;
    /** true เมื่อ attribute นี้เป็น field ที่ Lazada บังคับต้องมีค่า สำหรับ Lazada category ที่สินค้านี้ผูกอยู่ (ดู ProductController::lazadaMandatoryAttributeIds()) — คนละเรื่องกับ is_required ด้านบน (นั่นเป็น flag ตายตัวของ attribute เอง ไม่ผูกกับ marketplace/category ไหนเป็นการเฉพาะ) */
    lazada_mandatory?: boolean;
    /** เหมือน lazada_mandatory ด้านบนแต่ฝั่ง Shopee (ดู ProductController::shopeeMandatoryAttributeIds()) — คนละ flag กัน สินค้าเดียวกัน attribute เดียวกันอาจถูกทั้งสอง platform บังคับพร้อมกันหรือไม่พร้อมกันก็ได้ */
    shopee_mandatory?: boolean;
    /** เหมือน lazada_mandatory/shopee_mandatory ด้านบนแต่ฝั่ง TikTok (ดู ProductController::tiktokMandatoryAttributeIds()) — คนละ flag กัน สินค้าเดียวกัน attribute เดียวกันอาจถูกหลาย platform บังคับพร้อมกันหรือไม่พร้อมกันก็ได้ */
    tiktok_mandatory?: boolean;
    is_locale_based?: boolean;
    is_channel_based?: boolean;
    swatch_type?: string | null;
    options?: AttributeOption[];
    /** true ระหว่างกำลังดึงตัวเลือกแบบ on-demand อยู่ (ตอนนี้ใช้แค่หมวดหมู่ย่อย/กลุ่มสินค้าของแผง Master Categories — ดู masterCategoryLoadingKeys) ให้ dropdown โชว์ indicator */
    options_loading?: boolean;
    /** เป็น false เมื่อ role ของผู้ใช้ปัจจุบันมีสิทธิ์แค่ดู (ไม่ใช่แก้ไข) ในแอตทริบิวต์นี้ — ดูที่ "Attribute Access" ในฟอร์ม Role ถ้าไม่มีค่าหรือเป็น true คือแก้ไขได้ (เผื่อความเข้ากันได้กับของเก่า) */
    editable?: boolean;
    /** family id ที่แอตทริบิวต์นี้ถูกผูกไว้ด้วย — ใช้จำกัดขอบเขตของ variant-attribute picker ให้ตรงกับ family ของสินค้านั้นๆ */
    family_ids?: number[];
    /** label ของทุก locale — ทำให้ชื่อที่แสดงเปลี่ยนได้ทันทีตอนสลับ locale โดยไม่ต้องรอ round-trip ไปเซิร์ฟเวอร์เพื่อ resolve `name` ใหม่ */
    translations?: Translation[];
    /** โค้ดของ master ที่ตัวเลือกของ attribute นี้ mirror มา (เช่น 'brands', 'currencies') — null/ไม่มีค่า แปลว่าตัวเลือกกรอกเองตรงๆ ไม่ได้มาจาก master ไหน ดู MasterAttributeOptionSync */
    master_source?: string | null;
    /** มีค่าเฉพาะตอนหน้านี้เปิดมาพร้อม ?platform= (ดู Props.platformContext) และ
     * attribute ตัวนี้ถูก map เข้ากับ payload field ของ platform นั้นจริงๆ
     * เท่านั้น — null ทุกกรณีอื่น (รวมถึงตอนไม่มี platformContext เลย) ดู
     * ProductController::platformFieldMappingsFor() */
    platform_field_mapping?: { target_field: string; is_custom: boolean; label: string } | null;
}

/** ตัวเลือก master_source หนึ่งตัว — จับคู่กับ MasterAttributeOptionSync::pickerOptions() ฝั่ง backend */
interface MasterSourceOption {
    value: string;
    labelKey: string;
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    translations?: Translation[];
    attributes: AttributeItem[];
    /** ตระกูลแอตทริบิวต์ที่เป็นต้นตอของฟิลด์ในกลุ่มนี้ (อาจมีมากกว่า 1 ตัว — group
     * เดียวรับฟิลด์จากหลายตระกูลได้ เช่นแท็บ "Lazada" ที่ทุกตระกูลที่มาจาก Lazada
     * ใช้ AttributeGroup row เดียวกันร่วมกันหมด ดู ProductController::buildProductFormProps()) */
    families?: AttributeFamily[];
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
    /** สินค้านี้จับคู่ (Product Matching) กับร้านนี้แล้ว — MarketplaceSyncGate::knownShopIds() */
    matched?: boolean;
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
    show_on_home: boolean;
    status: ProductStatus;
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
    /** หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า — เรียงมาแล้ว (ดู
     * ProductController::MASTER_CATEGORY_ATTRIBUTE_CODES) ไม่ได้ผูก family ไหน
     * เลย เลยไม่ปนอยู่ใน assignedGroups แสดงเป็น panel ของตัวเองแทน */
    masterCategoryAttributes: AttributeItem[];
    /** แอตทริบิวต์ "Product Type" (producttype) — options mirror มาจาก master
     * product_types (ดู ProductController::productTypeAttributeFor()) ไม่ผูก
     * family ตายตัวเหมือนกัน เลยแยก panel field ของตัวเองเหมือน
     * masterCategoryAttributes แทนที่จะปนใน assignedGroups */
    productTypeAttribute?: AttributeItem | null;
    // attribute_id -> groupKey (attribute_group_id เป็น string หรือ 'ungrouped') ->
    // channelKey -> localeKey -> value
    productValues: Record<number | string, Record<string, Record<string, Record<string | number, string>>>>;
    variants?: VariantItem[];
    configurableAttributes?: AttributeItem[];
    channels?: ChannelOption[];
    channelGroups?: ChannelGroup[];
    categoryIds?: number[];
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
    /** สิทธิ์แยกต่างหากของแผง Sales Channels — ไม่ได้พ่วงกับ products.edit_products ทั่วไปอีกต่อไป (ดู routes/catalog.php) */
    canViewSalesChannels?: boolean;
    canEditSalesChannels?: boolean;
    /** สิทธิ์ push/deactivate/delete-listing/เช็คสถานะ แยกต่อแพลตฟอร์ม (marketplace_{platform}.push_products_{platform}) — คนละสิทธิ์กับ canEditSalesChannels ด้านบนที่คุมแค่การติ๊ก/บันทึกว่าช่องทางไหน published อยู่ (ดู ProductController::buildProductFormProps()) */
    canPushProducts?: Record<'lazada' | 'shopee' | 'tiktok' | 'woocommerce', boolean>;
    /** สิทธิ์ "แก้ไข" แยกต่างหากของแผง Master Categories (หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า) — ไม่ได้พ่วงกับ products.edit_products ทั่วไปอีกต่อไป (ดู routes/catalog.php) ตั้งใจไม่มี view แยก (ต่างจาก Sales Channels) เพราะแผงนี้ไม่มีเหตุผลต้องซ่อนจากการดู */
    canEditMasterCategories?: boolean;
    /** config('services.marketplace_sync.auto_enabled') — บันทึกแล้วระบบส่ง/ยกเลิกบน marketplace ให้อัตโนมัติ */
    marketplaceAutoSync?: boolean;
    /** ร้านที่สินค้านี้ผูกไว้ใน Product Matching แล้ว (ทุก platform) — โชว์ ✓ ข้างหัวข้อ */
    matchedShopNames?: string[];
    /** ให้แปล attribute.master_source (เช่น 'brands') เป็นชื่ออ่านง่ายสำหรับ chip "Master: ..." — ดู ProductController::buildProductFormProps() */
    masterSources?: MasterSourceOption[];
    /** มาจาก query param ?platform= ตอนกดปุ่มแก้ไขจากหน้า Products Mapping ของ
     * marketplace ไหนสักตัว (resources/js/pages/catalog/marketplace/
     * {platform}-products.tsx) — null ถ้าเปิดหน้านี้มาแบบปกติ ใช้คู่กับ
     * attr.platform_field_mapping ด้านล่างเพื่อโชว์ chip ว่าฟิลด์ไหนถูก map
     * เข้ากับ payload ของ platform ที่กำลังโฟกัสอยู่ (ดู
     * ProductController::platformFieldMappingsFor()) */
    platformContext?: 'shopee' | 'lazada' | 'tiktok' | 'woocommerce' | null;
}

type AttributeValue = string | File | (string | File)[];

// values: attribute_id -> groupKey (attribute_group_id เป็น string หรือ 'ungrouped',
// เดียวกับ group.id ที่ใช้ render แต่ละ panel — attribute ที่ไม่มี group เลย เช่น
// Master Categories/Product Type ใช้ 'ungrouped' เสมอ) -> channelKey ('global' หรือ
// channel id) -> localeKey ('default' หรือ locale id) -> value
interface ProductForm {
    sku: string;
    family_id: number;
    type: string;
    enabled: boolean;
    show_on_home: boolean;
    status: ProductStatus;
    values: Record<string | number, Record<string, Record<string, Record<string | number, AttributeValue>>>>;
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

// Guard against a cartesian blow-up: some option-bearing attributes have
// hundreds of options, and every combination renders as a table row with
// three text fields, so an unguarded generate can freeze the tab. Past this
// many combinations we refuse and ask the user to narrow the selection.
const MAX_VARIANT_COMBINATIONS = 200;

/** Size of the cartesian product without building it. */
function comboCount(sets: unknown[][]): number {
    return sets.reduce((n, set) => n * Math.max(set.length, 1), 1);
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
    masterCategoryAttributes = [],
    productTypeAttribute = null,
    productValues,
    variants = [],
    configurableAttributes = [],
    channels = [],
    channelGroups = [],
    categoryIds = [],
    publishedShopIds = [],
    associations = { related: [], up_sell: [], cross_sell: [] },
    canViewHistory = false,
    canViewSalesChannels = false,
    canEditSalesChannels = false,
    canPushProducts = { lazada: false, shopee: false, tiktok: false, woocommerce: false },
    canEditMasterCategories = false,
    marketplaceAutoSync = false,
    matchedShopNames = [],
    masterSources = [],
    platformContext = null,
}: Props) {
    const { locales, locale: currentLocaleCode, setLocale } = useLocale();
    const { t } = useTranslation('catalog');
    const { auth } = usePage<SharedData>().props;
    // แยกออกมาจาก attributes.edit_attributes แล้ว (ดู migration
    // split_quick_add_options_permission_from_attributes) — ผู้ใช้ไม่ต้องมีสิทธิ์
    // แก้ไขนิยามของ attribute เต็มรูปแบบ แค่มีสิทธิ์เพิ่ม option ทีละตัวจากหน้า
    // สินค้าก็พอ
    const canAddAttributeOptions = auth.permissions.includes('attributes.quick_add_options');
    // สิทธิ์ของแอ็กชันต่างๆ ใน dropdown ปุ่ม "More" ของ toolbar — คนละสิทธิ์กับ
    // products.edit_products ทั่วไป (ดูแพทเทิร์นเดียวกันในหน้า list: index.tsx)
    const canDuplicateProduct = auth.permissions.includes('products.create_products');
    const canDeleteProduct = auth.permissions.includes('products.delete_products');
    // ปุ่ม "บันทึกสินค้า" หลักบันทึกทั้ง Sales Channels และ Master Categories ไปด้วยอยู่แล้ว
    // (ProductController::update()) — ปุ่ม Save แยกของแต่ละแผงเลยโชว์เฉพาะคนที่แก้แผงนั้น
    // ได้แต่แก้สินค้าไม่ได้ (ปุ่มหลักใช้ไม่ได้) กันผู้ใช้สับสนว่าต้องกดปุ่มไหน
    const canEditProducts = auth.permissions.includes('products.edit_products');
    const canQueueTranslations = auth.permissions.includes('product_translations.edit_product_translations');
    // สิทธิ์แก้ไข "กลุ่มสินค้า" เอง (resource product_groups) — คนละอย่างกับ
    // canEditMasterCategories (resource master_categories, คุมแค่ว่าจะแก้ไข
    // การผูกหมวดหมู่ของ "สินค้าตัวนี้" ได้ไหม) ใช้เฉพาะกับปุ่ม "แก้ไข" ข้างช่อง
    // ชื่อกลุ่มสินค้าของแผง Master Categories ที่พาไปหน้าแก้ไขกลุ่มสินค้านั้นเอง
    // โดยตรง (/catalog/product-groups/{id}/edit) — ต้องเช็คสิทธิ์ของปลายทางจริง
    // แยกต่างหาก ไม่ใช่ยืมสิทธิ์ของแผงนี้
    const canEditProductGroups = auth.permissions.includes('product_groups.edit_product_groups');
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

    // ตัวกรองฟิลด์ — ใช้ค่าเดียวกันทุก group เพราะทุก panel render พร้อมกันหมด
    // อยู่แล้ว (scroll-spy, ไม่ใช่แท็บคลิกสลับ — ดูคอมเมนต์ตรง assignedGroups.map()
    // ด้านล่าง) รวมกันแบบ OR: เลือกหลายตัวพร้อมกัน = โชว์ฟิลด์ที่ตรงกับอย่างน้อย
    // หนึ่งตัวที่เลือกไว้ ไม่ใช่ต้องตรงทุกตัว ค่าเริ่มต้น [] = ไม่กรอง (โชว์ทุกฟิลด์
    // ตามปกติ)
    const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
    // ค้นหาฟิลด์ด้วยชื่อ (label ตาม locale ที่ active อยู่) หรือ code — กรองซ้อนกับ
    // attributeFilters ด้านบน (ต้องตรงทั้งคู่ ถ้าเลือกไว้ทั้งสองอย่าง) ค่าเริ่มต้น
    // '' = ไม่กรอง
    const [attributeSearchQuery, setAttributeSearchQuery] = useState('');

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
            // ของแถบแท็บที่ sticky อยู่ บวก scroll-margin ของ section (80px ที่ตั้งไว้
            // บน Paper แต่ละอัน) เพราะ scrollToGroup() จะจอด section ให้ห่างจากขอบบน
            // เท่านั้น ถ้าไม่บวกกลับ section ที่เพิ่งคลิกไปจะยังนับว่า "ยังมาไม่ถึง"
            // แล้วแท็บที่ไฮไลต์จะค้างอยู่ที่ section ก่อนหน้า (ตามที่เห็นว่าแท็บกับ
            // เนื้อหาไม่ตรงกัน) — บวกเพิ่มอีกนิดเป็น slack ให้สลับแท็บตอนหัวข้อถัดไป
            // เลื่อนมาใกล้แถบแท็บ ตรงกับที่ตาผู้ใช้เห็น
            const barBottom = groupTabBarRef.current ? groupTabBarRef.current.getBoundingClientRect().bottom : 0;
            const threshold = barBottom + GROUP_SECTION_SCROLL_MARGIN + 16;
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
    // platform ที่กด "แสดงร้านอื่น" ไว้ — ปกติแสดงแค่ร้านที่จับคู่แล้ว (ดู visibleShops ในแผง Sales Channels)
    const [showAllShopsFor, setShowAllShopsFor] = useState<Set<string>>(new Set());
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
    // ป้ายของ chip "ภาษา · ช่องทาง" บนแถบเครื่องมือ (ตัวเลือกจริงอยู่ในแผง "เพิ่มเติม")
    const activeLocaleLabel = (() => {
        const loc = locales.find((l) => l.id === activeLocaleId);
        return loc ? loc.display_name || loc.code : '';
    })();
    const activeChannelLabel = (() => {
        if (activeChannelId === null) return t('defaultAllChannelsLabel');
        for (const group of channelGroups) {
            const ch = group.channels.find((c) => c.id === activeChannelId);
            if (ch) return `${group.platform} › ${ch.name || ch.code}`;
        }
        return t('defaultAllChannelsLabel');
    })();

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
    masterCategoryAttributes.forEach((attr) => {
        initialValues[attr.id] = (productValues[attr.id] as any) || {};
    });
    if (productTypeAttribute) {
        initialValues[productTypeAttribute.id] = (productValues[productTypeAttribute.id] as any) || {};
    }

    // สำเนาของ defaults.values ของ useForm() (Inertia ไม่เปิดให้อ่าน defaults) — ใช้ตอนเติมค่าที่
    // โหลดมาตอนสลับภาษา/ช่องทางเข้า baseline ของ isDirty ด้วย (ดู effect ที่ fetch attribute-values)
    const baselineValuesRef = useRef(initialValues);
    const { data, setData, post, transform, processing, errors, isDirty, setDefaults } = useForm<ProductForm>({
        sku: product.sku || '',
        family_id: product.family_id,
        type: (product.type || 'simple').toLowerCase(),
        enabled: Boolean(product.enabled),
        show_on_home: Boolean(product.show_on_home),
        status: product.status ?? 'new',
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

    // useForm() ไม่ได้การันตีว่า setData จะมี identity คงที่ทุก render เลยเก็บมันไว้
    // ใน ref แทนที่จะเป็น dep ของ useCallback — ตัว handler ที่สร้างจาก ref นี้ (เช่น
    // setAttributeValue, handleAddBlankVariant, handleRemoveVariant ด้านล่าง) จะมี
    // identity คงที่ตลอด ไม่ว่า identity ของ setData จะเปลี่ยนหรือไม่ก็ตาม — สำคัญ
    // ตรงที่การส่ง handler เหล่านี้ลงไปเป็น prop ของ component ที่ memo ไว้
    // (RenderAttributeInput, SelectControl, RichTextControl, variantColumns) จะได้
    // ไม่ทำให้ memo bail-out พังเพราะ prop เปลี่ยน reference เฉยๆ ทั้งที่พฤติกรรม
    // เหมือนเดิม
    const setDataRef = useRef(setData);
    setDataRef.current = setData;

    // useForm() อ่าน prop แค่ตอน mount — หลังกด Save ของแผง Master Categories
    // (router.put + preserveState) backend ผูก category ใหม่ให้แล้ว prop categoryIds
    // เปลี่ยน แต่ data.category_ids ยังเป็นชุดเก่าตอนเปิดหน้า พอกด Save Product
    // update() จะ sync() category กลับเป็นชุดเก่า + derive pcatname/psubcatname/
    // productgroupname ย้อนกลับเป็นค่าเดิม (ผู้ใช้ต้องมาเลือกกลุ่มสินค้าใหม่อีกรอบ)
    // เลย sync prop เข้าฟอร์ม (ทั้งค่าและ baseline ของ isDirty) ทุกครั้งที่มันเปลี่ยน
    const categoryIdsKey = categoryIds.join(',');
    useEffect(() => {
        setDataRef.current('category_ids', categoryIds);
        setDefaults('category_ids', categoryIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryIdsKey]);

    // identity คงที่ตลอด (deps ว่างเปล่า) ไม่ว่า identity ของ setData จะเปลี่ยน
    // หรือไม่ก็ตาม ความคงที่นี่แหละคือจุดสำคัญ: การส่งฟังก์ชันนี้ลงไปเป็น onChange
    // ของฟิลด์ที่ memo ไว้ ไม่ควรทำให้ฟิลด์นั้น re-render เองโดยไม่จำเป็น — เช่นตอน
    // สลับแค่ locale เฉยๆ ที่ channelKey/localeKey/value ของฟิลด์ส่วนใหญ่ไม่ได้
    // เปลี่ยนเลย ถึงแม้ฟอร์มรอบๆ จะ re-render ก็ตาม ใช้ channelKey/localeKey ที่
    // resolve มาแล้วโดยตรง แทนที่จะไปคำนวณใหม่ผ่าน getValueKeys() เลยไม่ต้องพึ่ง
    // attr เลย (และไม่โดน invalidate เพราะ attr ด้วย) ประกาศไว้ตรงนี้ (ใกล้
    // setDataRef ให้มากที่สุด) แทนที่จะไว้ใกล้จุดใช้งานจริงด้านล่าง เพราะ
    // handleMasterCategoryChange ที่อยู่ก่อนหน้านี้ในไฟล์ต้องใช้ตัวนี้เป็น
    // dependency ของ useCallback ตัวเอง — ต้อง declare ก่อนถึงจะไม่ชน TDZ
    const setAttributeValue = useCallback((attributeId: number, groupKey: string, channelKey: string, localeKey: string, val: AttributeValue) => {
        setDataRef.current((prev) => {
            const attrValues = prev.values[attributeId] || {};
            const groupValues = attrValues[groupKey] || {};
            return {
                ...prev,
                values: {
                    ...prev.values,
                    [attributeId]: {
                        ...attrValues,
                        [groupKey]: {
                            ...groupValues,
                            [channelKey]: {
                                ...(groupValues[channelKey] || {}),
                                [localeKey]: val,
                            },
                        },
                    },
                },
            };
        });
    }, []);

    // จำกัดตัวเลือกใน variant-attribute picker ให้เหลือแค่ attribute ที่ผูกกับ
    // family ของสินค้านี้จริงๆ — เหตุผลเดียวกับ picker ในหน้า Create
    const familyScopedVariantAttributes = configurableAttributes.filter(
        (attr) => (attr.options || []).length > 0 && (attr.family_ids || []).includes(Number(data.family_id)),
    );

    // บังคับเลือกตาม step: หมวดหมู่ก่อน หมวดหมู่ย่อยถึงจะ "ขึ้น" มาให้เลือก แล้ว
    // ค่อยกลุ่มสินค้า — ไม่ใช่แค่กรองตัวเลือกเฉยๆ แต่ไม่โชว์ฟิลด์ถัดไปเลยจนกว่าตัว
    // ก่อนหน้าจะมีค่า (ตามที่ user ขอ) ตัวเลือกที่โชว์ก็ยังกรองด้วย code prefix
    // เหมือนเดิม (categories.code ของแต่ละ level ต่อกันเป็นสาย เช่น 'a025' ->
    // 'a025001' -> 'a025001001' ดู ProductCategoryLinker) ไม่งั้น productgroupname
    // จะมีตัวเลือกเกือบ 900 ตัวให้เลือกแบบไม่กรองเลย — masterCategoryAttributes
    // เรียงมาจาก backend แล้วเป็น [หมวดหมู่, หมวดหมู่ย่อย, กลุ่มสินค้า] เป๊ะๆ (ดู
    // ProductController::MASTER_CATEGORY_ATTRIBUTE_CODES)
    // หาว่า value ของ attribute ตัวนี้อยู่ใต้ key ไหนบ้าง ตาม channel/locale ที่เลือก
    // อยู่ตอนนี้ โดยดูจาก flag การ scope ของ attribute นั้นเอง — ย้ายมาไว้ตรงนี้
    // (แทนที่จะอยู่ท้ายไฟล์เหมือนเดิม) เพราะ selectedMasterCategoryCode() ด้านล่าง
    // ต้องเรียกใช้ตัวนี้ด้วย ไม่งั้นจะกลายเป็น temporal-dead-zone (เรียก const ที่
    // ยังไม่ถูก declare ในลำดับการ render เดียวกัน) — ทั้ง activeChannelId/
    // activeLocaleId ที่ใช้ก็ประกาศไว้ก่อนจุดนี้อยู่แล้ว เลยย้ายขึ้นมาได้อย่างปลอดภัย
    const getValueKeys = (attr: AttributeItem) => ({
        channelKey: attr.is_channel_based && activeChannelId ? String(activeChannelId) : 'global',
        localeKey: attr.is_locale_based ? String(activeLocaleId) : 'default',
    });

    // หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า เก็บ "รหัส" หมวดหมู่ ไม่ใช่ข้อความที่ต้องแปล — อ่าน/เขียนที่
    // 'global'/'default' เสมอ แม้ attribute จะถูกติ๊ก is_locale_based ไว้ (เป็นอยู่จริงใน DB)
    // เดิมใช้ getValueKeys() ค่าที่เลือกเลยไปลงช่องของภาษาที่กำลังแก้ ขณะที่ backend ผูกหมวดหมู่
    // จากช่อง 'default' (ค่าเก่า) — หน้าจอโชว์กลุ่มสินค้าใหม่แต่สินค้ายังผูกกลุ่มเก่า แอตทริบิวต์
    // เลยยังเป็นของกลุ่มเก่าหลังกดบันทึก (ดู ProductController::update())
    const masterCategoryValueKeys = { channelKey: 'global', localeKey: 'default' } as const;

    // pcatname/psubcatname/productgroupname เป็น system attribute ที่ปกติไม่ใช่
    // channel/locale-based (ค่าอยู่ใต้ 'global'/'default' เสมอ) แต่เผื่อมีใครไปติ๊ก
    // เปิด is_channel_based/is_locale_based ให้ตัวใดตัวหนึ่งทีหลังผ่านหน้าแก้ไข
    // attribute (ไม่มีอะไรกันไว้) เลยอ่านค่าผ่าน getValueKeys() แบบเดียวกับทุก field
    // อื่นในหน้านี้ แทนที่จะ hardcode 'global'/'default' ตรงๆ — ไม่งั้นถ้า flag ถูก
    // เปิดขึ้นมาจริงๆ ฟิลด์นี้จะอ่าน/เขียนคนละ key กับที่ RenderAttributeInput ใช้จริง
    // (ซึ่งอ่าน/เขียนผ่าน getValueKeys() เช่นกัน) ทำให้ cascade และปุ่ม Save ของแผงนี้
    // อ่านค่าว่างเปล่าไปเงียบๆ ทั้งที่ผู้ใช้เลือกไว้แล้วจริงๆ
    const selectedMasterCategoryCode = (attr?: AttributeItem): string => {
        if (!attr) return '';
        const { channelKey, localeKey } = masterCategoryValueKeys;
        // fallback ไปที่ 'default' เหมือน renderMasterCategoryField() ด้านล่าง —
        // pcatname/psubcatname/productgroupname เก็บค่าจริงไว้ที่ channel/locale
        // 'global'/'default' เสมอ (ดู ProductCategoryLinker) แต่ถ้า attribute
        // ตัวไหนดันมี is_locale_based/is_channel_based ติ๊กไว้ (เผลอเปิดทีหลัง
        // ผ่านหน้าแก้ไข attribute) getValueKeys() จะคำนวณ localeKey เป็น locale
        // ปัจจุบันแทน 'default' — ไม่มี fallback ตรงนี้จะทำให้ฟังก์ชันนี้อ่านว่าง
        // เปล่าทั้งที่ renderMasterCategoryField() (ที่มี fallback นี้อยู่แล้ว)
        // โชว์ค่าถูกต้อง ผลคือ cascadedMasterCategoryAttributes ด้านล่าง (ที่เรียก
        // ฟังก์ชันนี้ตัดสินว่าจะโชว์ฟิลด์ "หมวดหมู่ย่อย"/"กลุ่มสินค้า" หรือไม่)
        // มองว่าหมวดหมู่ยังไม่ถูกเลือก เลยซ่อนฟิลด์ถัดไปทั้งชุดไปเลย ทั้งที่ค่าจริง
        // มีอยู่และแสดงผลถูกต้องในฟิลด์แรกอยู่แล้ว
        const val =
            data.values[attr.id]?.['ungrouped']?.[channelKey]?.[localeKey] ?? data.values[attr.id]?.['ungrouped']?.[channelKey]?.['default'] ?? '';
        return typeof val === 'string' ? val : '';
    };

    // ปุ่ม "แก้ไข" ข้างช่อง "ชื่อกลุ่มสินค้า" ของแผง Master Categories — พาไปหน้า
    // แก้ไขกลุ่มสินค้าที่เลือกอยู่ตอนนี้โดยตรง ค่าที่ฟิลด์นี้เก็บไว้เป็นแค่ code
    // (mirror จาก categories.code — ดู ProductCategoryLinker) ไม่ใช่ Category id
    // จริงๆ (id ที่ frontend ถืออยู่ในมือตอนนี้เป็นของ AttributeOption ที่ mirror
    // มา คนละ id กับ Category ตัวจริง) เลยต้อง resolve code -> id ทาง backend
    // ก่อนค่อย navigate — ดู ProductController::resolveCategoryByCode()
    const [resolvingProductGroupEdit, setResolvingProductGroupEdit] = useState(false);
    const goToProductGroupEdit = (code: string) => {
        if (!code || resolvingProductGroupEdit) return;

        setResolvingProductGroupEdit(true);
        fetch(`/catalog/products/resolve-category-by-code?code=${encodeURIComponent(code)}`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: { id: number | null } | null) => {
                if (json?.id) {
                    router.visit(`/catalog/product-groups/${json.id}/edit`);
                }
            })
            .finally(() => setResolvingProductGroupEdit(false));
    };

    // ใช้ร่วมกันทั้งแผง Master Categories หลัก (ในคอลัมน์ขวา) และ dialog
    // "เลือกกลุ่มสินค้า" (เปิดจากลิงก์ใน Tips) เพราะ 2 ที่นี้ render ฟิลด์ชุด
    // เดียวกันเป๊ะ — กันไม่ให้ปุ่มแก้ไขนี้ต้องเขียนซ้ำสองที่แล้วเผลอเบี้ยวกันทีหลัง
    const renderMasterCategoryField = (attr: AttributeItem) => {
        const { channelKey, localeKey } = masterCategoryValueKeys;
        const val = data.values[attr.id]?.['ungrouped']?.[channelKey]?.[localeKey] ?? '';
        const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
        const isProductGroupField = attr.code === 'productgroupname';
        const selectedCode = isProductGroupField ? selectedMasterCategoryCode(attr) : '';

        const field = (
            <RenderAttributeInput
                key={attr.id}
                attr={attr}
                value={val}
                groupKey="ungrouped"
                channelKey={channelKey}
                localeKey={localeKey}
                onValueChange={handleMasterCategoryChange}
                label={localizedLabel(attr, activeLocaleId)}
                activeLocaleCode={activeLocaleCode}
                canAddOptions={canAddAttributeOptions}
                sku={data.sku}
                productId={product.id}
                masterSources={masterSources}
                platformContext={platformContext}
            />
        );

        if (!isProductGroupField || !canEditProductGroups) {
            return field;
        }

        return (
            <div key={attr.id} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{field}</div>
                <Button
                    design="Transparent"
                    icon="edit"
                    tooltip={t('editProductGroup')}
                    accessibleName={t('editProductGroup')}
                    disabled={!selectedCode || resolvingProductGroupEdit}
                    loading={resolvingProductGroupEdit}
                    loadingDelay={0}
                    onClick={() => goToProductGroupEdit(selectedCode)}
                    style={{ marginBottom: '1px' }}
                />
            </div>
        );
    };

    // ตัวเลือกของ 3 ฟิลด์นี้ (หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า) ให้โชว์เป็น
    // "code:name" แทนที่จะเป็นแค่ชื่ออย่างเดียว (ตามที่ user ขอ) — ใส่รหัสนำหน้าไว้ใน
    // admin_label ตรงนี้แค่สำหรับ 3 ฟิลด์นี้เท่านั้น ไม่ไปแตะ SelectControl/
    // RenderAttributeInput ที่ใช้ร่วมกับ attribute แบบ select ตัวอื่นทั้งระบบ
    // เพราะมันอ่าน label จาก opt.admin_label ตรงๆ อยู่แล้ว (ดู getOptionLabel ใน
    // SelectControl) — ตัวเลือกที่ค้นหา/บันทึกยังอ้างอิงจาก opt.code เหมือนเดิม
    // ไม่กระทบ
    const withCodePrefixedLabels = (attr: AttributeItem): AttributeItem => ({
        ...attr,
        options: (attr.options || []).map((opt) => ({
            ...opt,
            admin_label: opt.code ? `${opt.code}:${opt.admin_label || opt.code}` : opt.admin_label,
        })),
    });

    // หมวดหมู่ย่อย/กลุ่มสินค้า (188 / 888 ตัวรวมทั้งระบบ) ไม่ได้ส่งมาเต็มต้นไม้จาก
    // backend อีกต่อไป (ดู ProductController::masterCategoryOptions()) — แนบมา
    // แค่ตัวที่สินค้านี้เลือกอยู่ตอนนี้ (ถ้ามี) เพื่อให้ dropdown โชว์ label ของ
    // ค่าปัจจุบันได้ทันที ส่วนตัวเลือกทั้งหมดของแต่ละระดับ (ลูกของ parent ที่เลือก
    // อยู่) ค่อยดึงตอนนี้แบบ on-demand แคชไว้ด้วย key `${code}:${parentCode}` กัน
    // fetch ซ้ำเวลาผู้ใช้สลับกลับไปมาระหว่าง parent เดิม
    const [masterCategoryChildOptions, setMasterCategoryChildOptions] = useState<Record<string, AttributeOption[]>>({});
    // จำนวน request ที่กำลัง fetch อยู่ต่อ key — แยกจากแคชด้านบนเพราะ fetch ล้มเหลว
    // จะไม่ถูกแคช (ให้ลองใหม่ได้) แต่ indicator ต้องหายไปด้วย นับเป็นตัวเลขแทน flag
    // เพราะ effect ด้านล่าง re-run ได้ระหว่างที่ request เดิมยังไม่จบ (data.values
    // เปลี่ยน) แล้วยิง key เดิมซ้ำ — ใช้ flag ธรรมดา request แรกที่จบจะลบ indicator
    // ทิ้งทั้งที่ request ใหม่ยังโหลดอยู่
    const [masterCategoryLoadingKeys, setMasterCategoryLoadingKeys] = useState<Record<string, number>>({});

    useEffect(() => {
        const [categoryAttr, subcatAttr, groupAttr] = masterCategoryAttributes;
        const categoryCode = selectedMasterCategoryCode(categoryAttr);
        const subcatCode = selectedMasterCategoryCode(subcatAttr);

        const toFetch: { code: string; parent: string }[] = [];
        if (subcatAttr && categoryCode && !(`psubcatname:${categoryCode}` in masterCategoryChildOptions)) {
            toFetch.push({ code: 'psubcatname', parent: categoryCode });
        }
        if (groupAttr && subcatCode && !(`productgroupname:${subcatCode}` in masterCategoryChildOptions)) {
            toFetch.push({ code: 'productgroupname', parent: subcatCode });
        }
        if (toFetch.length === 0) return;

        let cancelled = false;
        const keys = toFetch.map(({ code, parent }) => `${code}:${parent}`);
        const bumpLoading = (delta: number) =>
            setMasterCategoryLoadingKeys((prev) => {
                const next = { ...prev };
                keys.forEach((k) => {
                    next[k] = Math.max(0, (next[k] ?? 0) + delta);
                });
                return next;
            });
        bumpLoading(1);
        Promise.all(
            toFetch.map(({ code, parent }) =>
                fetch(`/catalog/products/master-category-options?code=${code}&parent_code=${encodeURIComponent(parent)}`, {
                    headers: { Accept: 'application/json' },
                })
                    .then((res) => (res.ok ? res.json() : { options: [] }))
                    .then((body: { options: AttributeOption[] }) => ({ key: `${code}:${parent}`, options: body.options })),
            ),
        )
            .then((results) => {
                if (cancelled) return;
                setMasterCategoryChildOptions((prev) => {
                    const next = { ...prev };
                    results.forEach(({ key, options }) => {
                        next[key] = options;
                    });
                    return next;
                });
            })
            .catch(() => undefined)
            .finally(() => bumpLoading(-1));

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterCategoryAttributes, data.values, activeChannelId, activeLocaleId]);

    const cascadedMasterCategoryAttributes = useMemo(() => {
        const [categoryAttr, subcatAttr, groupAttr] = masterCategoryAttributes;
        const categoryCode = selectedMasterCategoryCode(categoryAttr);
        const subcatCode = selectedMasterCategoryCode(subcatAttr);

        const visible: AttributeItem[] = [];
        if (categoryAttr) visible.push(withCodePrefixedLabels(categoryAttr));
        if (subcatAttr && categoryCode) {
            visible.push(
                withCodePrefixedLabels({
                    ...subcatAttr,
                    options: masterCategoryChildOptions[`psubcatname:${categoryCode}`] ?? subcatAttr.options ?? [],
                    options_loading: (masterCategoryLoadingKeys[`psubcatname:${categoryCode}`] ?? 0) > 0,
                }),
            );
        }
        if (groupAttr && subcatCode) {
            visible.push(
                withCodePrefixedLabels({
                    ...groupAttr,
                    options: masterCategoryChildOptions[`productgroupname:${subcatCode}`] ?? groupAttr.options ?? [],
                    options_loading: (masterCategoryLoadingKeys[`productgroupname:${subcatCode}`] ?? 0) > 0,
                }),
            );
        }
        return visible;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterCategoryAttributes, masterCategoryChildOptions, masterCategoryLoadingKeys, data.values, activeChannelId, activeLocaleId]);

    // เปลี่ยนหมวดหมู่/หมวดหมู่ย่อยแล้ว ต้องล้างค่าของฟิลด์ถัดไปทิ้งด้วย เพราะอาจไม่
    // ตรงกับสายใหม่แล้ว (เช่น เปลี่ยนหมวดหมู่ แต่หมวดหมู่ย่อยเดิมที่เลือกไว้เป็นของ
    // หมวดหมู่เก่า) ไม่งั้นจะมีค่าตกค้างที่ไม่สัมพันธ์กันเป็นสายอยู่ — wrap ด้วย
    // useCallback (แทนฟังก์ชันเปล่าๆ) ให้ identity คงที่เหมือน setAttributeValue
    // เอง เพราะถูกส่งเป็น onValueChange ให้ RenderAttributeInput ที่ memo ไว้ด้วย
    // (masterCategoryAttributes เป็น prop ไม่ใช่ state เลย identity คงที่อยู่แล้ว)
    const handleMasterCategoryChange = useCallback(
        (attributeId: number, groupKey: string, channelKey: string, localeKey: string, val: AttributeValue) => {
            setAttributeValue(attributeId, groupKey, channelKey, localeKey, val);

            const [categoryAttr, subcatAttr, groupAttr] = masterCategoryAttributes;
            const clear = (attr?: AttributeItem) => {
                if (!attr) return;
                setAttributeValue(attr.id, 'ungrouped', masterCategoryValueKeys.channelKey, masterCategoryValueKeys.localeKey, '');
            };
            if (attributeId === categoryAttr?.id) {
                clear(subcatAttr);
                clear(groupAttr);
            } else if (attributeId === subcatAttr?.id) {
                clear(groupAttr);
            }
        },
        [setAttributeValue, masterCategoryAttributes],
    );

    // wrap ด้วย useCallback (deps ที่แคบลง) แทนฟังก์ชันเปล่าๆ — เพื่อให้ variantColumns
    // ด้านล่าง (ที่ memo ไว้ด้วย useMemo) มี dependency ที่ไม่เปลี่ยนพร่ำเพรื่อ
    // (configurableAttributes เป็น prop ไม่ใช่ state เลย identity คงที่อยู่แล้วปกติ)
    const optionLabelFor = useCallback(
        (attributeId: number, code: string): string => {
            const attr = configurableAttributes.find((a) => a.id === attributeId);
            const opt = attr?.options?.find((o) => (o.code || o.admin_label || String(o.id)) === code);
            return opt?.admin_label || opt?.code || code;
        },
        [configurableAttributes],
    );

    // variant ที่มีอยู่แล้วจะมีชุดค่าผสม attribute จริงก็ต่อเมื่อถูก generate มาจาก
    // picker นี้ (หรือของหน้า Create) เท่านั้น ส่วนแถวที่เพิ่มเองด้วยมือ หรือแถวที่มี
    // มาก่อนฟีเจอร์นี้จะเกิด ก็จะ fallback ไปเดา label จากส่วนท้ายของ SKU แทน
    const variantLabel = useCallback(
        (v: VariantItem): string => {
            const attrs = v.attributes || {};
            const keys = Object.keys(attrs);
            if (keys.length === 0) {
                const suffix = v.sku.replace(data.sku + '-', '');
                return suffix || v.sku;
            }
            return keys.map((k) => optionLabelFor(Number(k), attrs[Number(k)])).join(' / ');
        },
        [data.sku, optionLabelFor],
    );

    // Configurable products are turned off for new/simple products (the variant
    // matrix can explode on this catalog's option-heavy attributes). A product
    // that's already configurable keeps the type available so it stays editable.
    const isAlreadyConfigurable = (product.type || '').toLowerCase() === 'configurable';

    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [pendingVariantAttrIds, setPendingVariantAttrIds] = useState<number[]>(data.configurable_attributes);
    // Rejected combination count when the pending selection is too large to
    // generate — shown in the dialog, no rows built, dialog stays open.
    const [variantOverflow, setVariantOverflow] = useState<number | null>(null);

    const openVariantDialog = () => {
        setPendingVariantAttrIds(data.configurable_attributes);
        setVariantOverflow(null);
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

        // เหมือน SelectControl ด้านล่าง — ตัวเลือกที่ถูกปิดใช้งาน (is_active === false)
        // ไม่ควรถูกเสนอเป็นค่า variant ใหม่ แต่ถ้า variant ที่มีอยู่แล้วใช้ค่านั้นอยู่
        // ต้องยังคงไว้ใน cartesian ไม่งั้น regenerate จะลบ variant เดิมทิ้งไปเฉยๆ
        const optionSets = selectedAttrs.map((attr) => {
            const usedCodes = new Set(data.variants.map((v) => v.attributes?.[attr.id]).filter((code): code is string => code !== undefined));
            return (attr.options || [])
                .filter((opt) => opt.is_active !== false || usedCodes.has(opt.code || opt.admin_label || String(opt.id)))
                .map((opt) => ({
                    attribute_id: attr.id,
                    option_code: opt.code || opt.admin_label || String(opt.id),
                }));
        });

        if (optionSets.length === 0) {
            setVariantOverflow(null);
            setData((prev) => ({ ...prev, configurable_attributes: [], variants: [] }));
            setVariantDialogOpen(false);
            return;
        }

        const total = comboCount(optionSets);
        if (total > MAX_VARIANT_COMBINATIONS) {
            // Don't build the row set or close the dialog — let the user trim
            // the selection first. This is what was freezing the page.
            setVariantOverflow(total);
            return;
        }
        setVariantOverflow(null);

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

    // ใช้ setDataRef + functional update แทน setData('variants', ...) ตรงๆ — ทำให้
    // identity ของ handler สองตัวนี้คงที่ (deps ว่างเปล่า) ไม่ต้องผูกกับ
    // data.variants ที่เปลี่ยนทุกครั้งที่แก้ variant คนละแถว handleRemoveVariant
    // เอาไปใช้ใน variantColumns ด้านล่างซึ่ง memo ไว้ — ถ้า identity เปลี่ยนทุก
    // render จะทำให้ต้องสร้างคอลัมน์ใหม่ทั้งชุดทุกครั้งโดยไม่จำเป็น
    const handleAddBlankVariant = useCallback(() => {
        setDataRef.current((prev) => ({ ...prev, variants: [...prev.variants, { sku: '', price: '', qty: '', attributes: {} }] }));
    }, []);

    const handleRemoveVariant = useCallback((index: number) => {
        setDataRef.current((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
    }, []);

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // label ของ variant เป็นตัวระบุแถว ส่วน SKU เป็นช่องที่ผู้ใช้ต้องกรอกเอง เลยให้
    // โชว์ทั้งคู่แม้จอมือถือแคบๆ (SKU ตั้งเป็น 'high' ไม่ใช่ 'always' เพื่อให้ยอมหลบ
    // ให้ label ก่อน) ส่วน price/qty เป็นฟิลด์แก้ไขรอง เลยซ่อนก่อนเพื่อน ส่วน action
    // ลบก็ปักหมุดไว้เหมือนคอลัมน์ตัวระบุแถว
    type VariantRow = { v: VariantItem; index: number };
    // memo ไว้ด้วย useMemo — render callback ของแต่ละคอลัมน์ใช้ setDataRef.current
    // (functional update, อ่าน prev.variants สดๆ ตอนกด) แทนการปิด scope ทับ
    // data.variants/setData ตรงๆ เพื่อไม่ให้ต้องพึ่ง identity ของ setData ที่ไม่คงที่
    // ทุก render (ดูคอมเมนต์ setDataRef ด้านบน) ผลคือ variantColumns ทั้งชุดนี้จะไม่
    // ถูกสร้างใหม่ (reference คงที่) ตอนพิมพ์ในฟิลด์ attribute อื่นๆ ที่ไม่เกี่ยวกับ
    // variants เลย — สำคัญเพราะตารางนี้อาจมีได้ถึง 200 แถว (MAX_VARIANT_COMBINATIONS)
    // ถ้า columns เปลี่ยน reference ทุก render ตารางทั้งก้อนจะ re-render ใหม่หมดด้วย
    const variantColumns: FioriResponsiveColumn<VariantRow>[] = useMemo(
        () => [
            {
                key: 'option',
                header: t('variantColumnOption'),
                priority: 'always',
                render: ({ v }: VariantRow) => <span style={{ fontWeight: 600 }}>{variantLabel(v)}</span>,
            },
            {
                key: 'sku',
                header: (
                    <>
                        SKU <span style={{ color: 'var(--sapNegativeColor)' }}>*</span>
                    </>
                ),
                priority: 'high',
                render: ({ v, index }: VariantRow) => (
                    <Input
                        required
                        value={v.sku}
                        style={{ width: '100%' }}
                        onInput={(e) => {
                            const newSku = e.target.value;
                            setDataRef.current((prev) => {
                                const updated = [...prev.variants];
                                updated[index] = { ...updated[index], sku: newSku };
                                return { ...prev, variants: updated };
                            });
                        }}
                        // UI5 change = commit (blur/Enter) — ตรงกับ onBlur trim เดิม
                        onChange={(e) => {
                            const trimmedSku = e.target.value.trim();
                            setDataRef.current((prev) => {
                                const updated = [...prev.variants];
                                updated[index] = { ...updated[index], sku: trimmedSku };
                                return { ...prev, variants: updated };
                            });
                        }}
                    />
                ),
            },
            {
                key: 'price',
                header: t('price'),
                priority: 'medium',
                render: ({ v, index }: VariantRow) => (
                    <Input
                        type="Number"
                        value={v.price}
                        style={{ width: '100%' }}
                        onInput={(e) => {
                            const newPrice = e.target.value;
                            setDataRef.current((prev) => {
                                const updated = [...prev.variants];
                                updated[index] = { ...updated[index], price: newPrice };
                                return { ...prev, variants: updated };
                            });
                        }}
                        placeholder={t('price')}
                    />
                ),
            },
            {
                key: 'qty',
                header: t('variantColumnQty'),
                priority: 'medium',
                render: ({ v, index }: VariantRow) => (
                    <Input
                        type="Number"
                        value={v.qty}
                        style={{ width: '100%' }}
                        onInput={(e) => {
                            const newQty = e.target.value;
                            setDataRef.current((prev) => {
                                const updated = [...prev.variants];
                                updated[index] = { ...updated[index], qty: newQty };
                                return { ...prev, variants: updated };
                            });
                        }}
                        placeholder={t('stockPlaceholder')}
                    />
                ),
            },
            {
                key: 'actions',
                header: t('delete'),
                priority: 'always',
                align: 'right',
                render: ({ index }: VariantRow) => (
                    <Button
                        design="Transparent"
                        icon="delete"
                        style={{ color: 'var(--sapNegativeColor)' }}
                        onClick={() => handleRemoveVariant(index)}
                        accessibleName={t('removeVariantAriaLabel')}
                        tooltip={t('removeVariantAriaLabel')}
                    />
                ),
            },
        ],
        [variantLabel, handleRemoveVariant, t],
    );

    // rows/getRowKey ก็ memo เหมือนกัน — rows ต้อง recompute เฉพาะตอน data.variants
    // เปลี่ยนจริงๆ (ไม่ใช่ทุก render) ส่วน getRowKey ไม่ได้ปิด scope ทับอะไรเลยเลย
    // ให้ identity คงที่ตลอดไปด้วย useCallback deps ว่างเปล่า
    const variantRows: VariantRow[] = useMemo(() => data.variants.map((v, index) => ({ v, index })), [data.variants]);
    const getVariantRowKey = useCallback((row: VariantRow) => row.v.id ?? `new-${row.index}`, []);

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

    // Push / ปิดการขาย / ลบ listing / เช็คสถานะ ย้ายไปอยู่ step "Push" ของหน้า Map สินค้าแล้ว
    // (PlatformPushPanel / PlatformPushController) — หน้านี้เหลือแค่ติ๊กร้านที่จะขาย + ดูสถานะ Live
    // pushResult = แถบแจ้งผลลอยของหน้านี้ (ใช้กับผลการบันทึกด้วย)
    const [pushResult, setPushResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
    // ซ่อนแถบแจ้งผลเองหลัง 20 วินาที (เท่ากับ autoHideDuration ของ Snackbar เดิม)
    useEffect(() => {
        if (!pushResult) return;
        const timer = setTimeout(() => setPushResult(null), 20000);
        return () => clearTimeout(timer);
    }, [pushResult]);

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

                // json.values: attributeId -> groupKey -> value (channel/locale ตายตัว
                // อยู่แล้วจาก query param ด้านบน) — ต้อง merge ทีละ group ของ attribute
                // นั้นๆ แยกกัน ไม่ใช่แค่ attributeId เฉยๆ เหมือนเดิม เพราะ attribute
                // เดียวกันตอนนี้แสดงได้หลาย group พร้อมกัน แต่ละ group ต้องได้ค่าของ
                // placement ตัวเองเท่านั้น ไม่ใช่ทุก group ได้ค่าเดียวกันหมด
                const serverValues = json.values as Record<string, Record<string, string | null> | undefined>;

                const mergeServerValues = (values: ProductForm['values']): ProductForm['values'] => {
                    const nextValues = { ...values };
                    assignedGroups.forEach((g) => {
                        const groupKey = g.id === 0 ? 'ungrouped' : String(g.id);
                        g.attributes.forEach((attr) => {
                            const value = serverValues[attr.id]?.[groupKey];
                            if (value === null || value === undefined) return;
                            const { channelKey, localeKey } = getValueKeys(attr);
                            const attrValues = nextValues[attr.id] || {};
                            const groupValues = attrValues[groupKey] || {};
                            nextValues[attr.id] = {
                                ...attrValues,
                                [groupKey]: {
                                    ...groupValues,
                                    [channelKey]: {
                                        ...(groupValues[channelKey] || {}),
                                        [localeKey]: value,
                                    },
                                },
                            };
                        });
                    });
                    return nextValues;
                };

                // ค่าที่โหลดมาเป็นค่า "ที่บันทึกไว้แล้ว" ของ scope นี้ ไม่ใช่การแก้ไข — ต้องเติมเข้า
                // baseline ของ isDirty ด้วย ไม่งั้นแค่สลับภาษา/ช่องทางก็กลายเป็น "มีการแก้ไขที่ยังไม่
                // บันทึก" (ปุ่มบันทึกกดได้, ออกจากหน้าโดนเตือน, Push โดนบล็อกให้บันทึกก่อน)
                baselineValuesRef.current = mergeServerValues(baselineValuesRef.current);
                setDefaults('values', baselineValuesRef.current);
                setData((prev) => ({ ...prev, values: mergeServerValues(prev.values) }));
            })
            .catch(() => {
                // แค่พยายาม fetch ใหม่ ถ้าพลาดก็ปล่อยค่าที่โหลดไว้แล้วไว้เหมือนเดิม ไม่ต้องทำอะไรเพิ่ม
            })
            .finally(() => setLoadingValues(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChannelId, activeLocaleId]);

    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    // Auto-saves unsaved edits to localStorage (see useDraftAutosave's
    // docblock) — mainly a safety net for the scenario EnsureFreshPermissions
    // creates: a permission change mid-edit force-logs the user out on their
    // very next request, including the Save click itself, losing whatever
    // wasn't persisted yet. `readDraft()` is called once below (not
    // subscribed reactively) since the prompt should only ever appear once
    // per page load, right after mount — not re-appear if the user discards
    // it and then makes the form dirty again themselves.
    // Scoped by user id, not just product id — localStorage is shared by
    // every account that ever signs into this browser, and a draft is
    // someone's unsaved, possibly sensitive edits.
    const draftKey = `product-draft-${auth.user?.id ?? 'anon'}-${product.id}`;
    const { readDraft, clearDraft } = useDraftAutosave(draftKey, data, isDirty);
    const [draftPrompt, setDraftPrompt] = useState<{ data: ProductForm; savedAt: number } | null>(null);
    useEffect(() => {
        setDraftPrompt(readDraft());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const restoreDraft = () => {
        if (!draftPrompt) return;
        setData(draftPrompt.data);
        clearDraft();
        setDraftPrompt(null);
    };
    const discardDraft = () => {
        clearDraft();
        setDraftPrompt(null);
    };

    // Optimistic concurrency: ส่ง updated_at ที่ product prop ถืออยู่ ณ ตอนกด
    // save กลับไปด้วยเสมอ — เป็นค่าล่าสุดที่หน้านี้ "เห็น" จริงๆ ไม่ว่าจะมาจาก
    // ตอนโหลดหน้าครั้งแรก หรือจาก panel save (channels/master-categories) ก่อน
    // หน้านี้เอง เพราะ product prop อัปเดตทุกครั้งที่ Inertia visit เสร็จ ไม่ว่า
    // preserveState จะเป็นอะไรก็ตาม (preserveState คุมแค่ local state ของ
    // component ไม่เกี่ยวกับ props) — ดู ProductController::assertNotStale()
    const [conflictMessage, setConflictMessage] = useState<string | null>(null);

    // submit() ใช้ useForm() ตัวข้างบน (post/transform/errors ผูกกันหมด) ไม่ใช่
    // router ตรงๆ เหมือน saveSection() เลยไม่ได้เรียก setConflictMessage เองตอน
    // error ได้ตรงๆ (errors มาแบบ async ผ่าน useForm's re-render) ต้องจับผ่าน
    // effect นี้แทน เพื่อให้แบนเนอร์เดียวกันโชว์ได้ไม่ว่า conflict จะมาจากฝั่งไหน
    useEffect(() => {
        if (errors.conflict) setConflictMessage(errors.conflict);
    }, [errors.conflict]);

    /**
     * Shared by every "save the full form" variant below (the normal Save
     * Product button, Save Draft, Save as Template) — only what happens
     * before/after the save differs between them.
     *
     * @param forceDisabled  Save Draft's "always leave it unpublished"
     *                        behavior — forced in the outgoing payload
     *                        itself (not just via setData, which wouldn't
     *                        have flushed to state yet by the time transform()
     *                        reads it) so the request is correct regardless
     *                        of React's state-update timing.
     */
    // ---------------------------------------------------------------- เตือนเมื่อเปลี่ยนหมวดหมู่
    // หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า กำหนดตระกูลแอตทริบิวต์ (= ฟิลด์ที่ต้องกรอก) — เปลี่ยนแล้ว
    // บันทึก ฟิลด์ของกลุ่มเดิมอาจถูกซ่อนและมีฟิลด์บังคับใหม่ เลยถามยืนยันพร้อมรายละเอียดก่อนบันทึก
    // (ถามตอนบันทึก ไม่ใช่ทุกครั้งที่เลือก เพราะต้องเลือกไล่ 3 ขั้นกว่าจะรู้ผลจริง)
    const currentMasterCodes = masterCategoryAttributes.map((attr) => selectedMasterCategoryCode(attr));
    const [savedMasterCodes, setSavedMasterCodes] = useState<string[]>(currentMasterCodes);
    const masterCategoryChanged = currentMasterCodes.join('|') !== savedMasterCodes.join('|');
    type SaveOptions = { forceDisabled?: boolean; translateOtherLocales?: boolean; onSuccess?: () => void; skipMasterCategoryCheck?: boolean };
    const [checkingMasterImpact, setCheckingMasterImpact] = useState(false);
    const [masterImpact, setMasterImpact] = useState<{
        options?: SaveOptions;
        error?: boolean;
        removed_families?: { id: number; name: string }[];
        added_families?: { id: number; name: string }[];
        hidden_filled_count?: number;
        hidden_filled?: string[];
        new_required_empty_count?: number;
    } | null>(null);

    const performSave = (options?: SaveOptions) => {
        if (masterCategoryChanged && !options?.skipMasterCategoryCheck) {
            const params = new URLSearchParams();
            currentMasterCodes.forEach((code) => params.append('codes[]', code));
            setCheckingMasterImpact(true);
            fetch(`/catalog/products/${product.id}/master-category-impact?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then(async (res) => {
                    if (!res.ok) throw new Error(String(res.status));
                    const body = await res.json();
                    // ไม่กระทบตระกูลเลย (เช่น ย้ายไปกลุ่มที่ใช้ตระกูลชุดเดียวกัน) — บันทึกได้เลยไม่ต้องถาม
                    if (!body.changes_families) {
                        doSave({ ...options, skipMasterCategoryCheck: true });
                        return;
                    }
                    setMasterImpact({ ...body, options });
                })
                // ตรวจไม่ได้ ก็ยังเตือนแบบทั่วไปไว้ก่อน ไม่ปล่อยให้บันทึกเงียบๆ
                .catch(() => setMasterImpact({ error: true, options }))
                .finally(() => setCheckingMasterImpact(false));
            return;
        }
        doSave(options);
    };

    const doSave = (options?: SaveOptions) => {
        setConflictMessage(null);
        if (options?.forceDisabled) setData('enabled', false);
        // PHP ไม่รองรับการ parse body แบบ multipart/form-data สำหรับ request แบบ PUT
        // เลยต้องส่งเป็น POST พร้อมปลอม _method ไว้ เพื่อให้ Laravel route เป็น PUT ให้
        transform((formData) => ({
            ...formData,
            ...(options?.forceDisabled ? { enabled: false } : {}),
            // "บันทึกและแปลภาษาอื่น" — backend ใช้ภาษาที่กำลังแก้อยู่ (activeLocaleId)
            // เป็นต้นทาง แล้วเติมเฉพาะภาษาที่ยังว่าง ดู ProductController::update()
            ...(options?.translateOtherLocales ? { translate_other_locales: 1, translation_source_locale_id: activeLocaleId } : {}),
            _method: 'put',
            expected_updated_at: product.updated_at,
        }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/products/${product.id}`, {
            onSuccess: () => {
                // Saved for real now — the auto-saved copy would only ever be
                // read back as a *stale* draft from here on.
                clearDraft();
                // backend redirect กลับมาหน้า Edit เดิม (ไม่ใช่หน้า Read แบบเก่า
                // แล้ว — ดู ProductController::update()) เลยต้องมี toast ยืนยันเอง
                // ตรงนี้ว่า save สำเร็จจริง ไม่งั้นฟอร์มจะแค่ reload เงียบๆ โดยไม่มี
                // อะไรบอกผู้ใช้เลยว่าที่กรอกไปถูกบันทึกแล้ว — ใช้ pushResult ตัวเดียว
                // กับ snackbar แจ้งผล push/deactivate ที่มีอยู่แล้ว (ดู duplicateProduct()
                // ด้านบนที่ก็ทำแบบเดียวกัน)
                setPushResult({ severity: 'success', message: t('productSavedSuccess') });
                // useForm()'s post()/put() default preserveState:true (ไม่เหมือน
                // GET) — component instance เดิมไม่ได้ remount ใหม่ตอน redirect
                // กลับมาหน้า Edit นี้ (ต่างจาก object/key เปลี่ยนตอน navigate ไปหน้า
                // อื่นที่ไม่ใช่หน้านี้) ทำให้ isDirty ยังเทียบกับ baseline เดิมตอน
                // โหลดหน้าครั้งแรกอยู่ ไม่ใช่ค่าที่เพิ่ง save ไปสำเร็จแล้ว — ปุ่ม Save
                // Product จะไม่มีวัน disabled กลับเลยหลัง save ถ้าไม่รีเซ็ต baseline
                // ตรงนี้เอง ดู useForm.d.ts's setDefaults()
                setDefaults();
                baselineValuesRef.current = data.values;
                setSavedMasterCodes(currentMasterCodes);
                options?.onSuccess?.();
            },
            // แบนเนอร์ "กรุณาแก้ไขข้อผิดพลาดก่อนบันทึก" (ดู errors block ด้านล่าง)
            // อยู่บนสุดของกล่อง scroll เสมอ — แต่ผู้ใช้มักเลื่อนลงไปแก้ไขฟิลด์
            // ที่อยู่ล่างๆ ของฟอร์มมาก่อนกด Save ทำให้กด Save แล้วดูเหมือนไม่มี
            // อะไรเกิดขึ้นเลย (แบนเนอร์โผล่จริง แค่อยู่นอกจอด้านบน) ต้องเลื่อน
            // กลับขึ้นไปให้เห็นเองตรงนี้
            onError: () => scrollToTop(),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        performSave();
    };

    // "Save Draft" — เหมือนปุ่ม Save ปกติทุกอย่าง ต่างแค่บังคับ enabled:false
    // เสมอ (ระบบนี้ไม่มีสถานะ draft/published แยกจาก `enabled` — ปุ่มนี้ยืมความ
    // หมายจากคอลัมน์เดิมไปเลย แทนที่จะเพิ่ม schema ใหม่) เรียกจากปุ่มยืนยันใน
    // dialog เท่านั้น (คลิกที่ MenuItem แค่เปิด dialog ไว้ก่อน)
    const saveDraft = () => {
        setSaveDraftConfirmOpen(false);
        performSave({ forceDisabled: true });
    };

    // "Save as Template" — บันทึกการแก้ไขปัจจุบันลงสินค้าตัวนี้ก่อน (เหมือน Save
    // ปกติ ไม่บังคับ enabled) แล้วค่อยทำสำเนาสินค้าที่เพิ่ง save ไปหมาดๆ นั้น
    // ต่อทันที (ใช้ endpoint duplicate() เดิมที่มีอยู่แล้ว — เสมอ enabled:false
    // บนสำเนาใหม่ ดู ProductController::duplicate()) แล้วพาไปหน้าแก้ไขสำเนานั้น
    // ต่อ — ได้ "เทมเพลต" ที่เป็นสินค้าจริงตัวหนึ่งในระบบ พร้อมทำสำเนาต่อได้อีก
    // เรื่อยๆ โดยไม่ต้องสร้างตาราง/หน้าจอ "Template" แยกต่างหาก เรียกจากปุ่ม
    // ยืนยันใน dialog เท่านั้น (คลิกที่ MenuItem แค่เปิด dialog ไว้ก่อน)
    //
    // asTemplate:true (ต่างจากปุ่ม "ทำสำเนา" ธรรมดา) — บอก backend ไม่ให้ copy
    // ค่า attribute/หมวดหมู่ใดๆ มาจากต้นฉบับเลย (ดู ProductController::
    // copyProductData()) เทมเพลตที่ได้เลยเป็นแค่โครงสร้างเปล่าๆ ตาม family/
    // type เดิม ไม่มีข้อมูลติดมาด้วย ตามที่ user ต้องการ
    const saveAsTemplate = () => {
        setSaveAsTemplateConfirmOpen(false);
        performSave({
            onSuccess: () =>
                duplicateProduct({
                    asTemplate: true,
                    errorMessage: (fallback) => t('savedButDuplicateFailedError', { error: fallback }),
                }),
        });
    };

    // Per-panel Save (Sales Channels / Master Categories): each hits its own
    // endpoint with only that card's fields — no full-form submit. preserveState
    // keeps the rest of the form as-is; preserveScroll leaves the page put.
    // Categories/Brand (the old ones) used to have their own panels+save here
    // too — removed (see docblock near the "Master Categories" panel below
    // and the pbrand exclusion that used to live in the attribute-groups
    // loop) in favor of the Master pages + this new right-column panel.
    const [savingSection, setSavingSection] = useState<'channels' | 'master-categories' | null>(null);
    // เปิดจากลิงก์ "เลือกกลุ่มสินค้า" ใน Tips ตอนสินค้ายังไม่มีตระกูลแอตทริบิวต์ให้
    // กรอก (ดู noAttributeFamilyBoundYet) — ยกฟิลด์ชุดเดียวกับแผง Master Categories
    // ด้านล่างมาไว้ใน dialog ให้เลือกโดยไม่ต้อง scroll ไปหา ผูกกับ data.values ตัว
    // เดียวกันเลย เปลี่ยนที่ไหนก็สะท้อนอีกที่ทันที
    const [masterCategoryPickerOpen, setMasterCategoryPickerOpen] = useState(false);
    // error อื่นที่ไม่ใช่ conflict ของ panel save (เช่น validation) — เดิมถูกกลืนเงียบๆ
    // dialog เลยค้างเปิดอยู่เฉยๆ ผู้ใช้เข้าใจว่ากดบันทึกไปแล้วทั้งที่ไม่ได้บันทึก
    const [sectionSaveError, setSectionSaveError] = useState<{ section: 'channels' | 'master-categories'; message: string } | null>(null);

    const saveSection = (
        section: 'channels' | 'master-categories',
        payload: Record<string, FormDataConvertible>,
        options?: { onSuccess?: () => void },
    ) => {
        setSavingSection(section);
        setConflictMessage(null);
        setSectionSaveError(null);
        skipNavigationGuardRef.current = true;
        // panel save พวกนี้ไม่ได้ผ่าน useForm() (ใช้ router.put ตรงๆ) เลยไม่มี
        // errors ของตัวเองให้ผูกกับ input ไหนโดยเฉพาะ — ต้องดัก conflict error
        // เองผ่าน onError แล้วโชว์แบนเนอร์เดียวกับที่ submit() ใช้ (ดู errors.conflict
        // useEffect ด้านล่าง) ไม่งั้น error นี้จะเงียบหายไปเฉยๆ ไม่มีที่ไหนแสดงเลย
        router.put(
            `/catalog/products/${product.id}/${section}`,
            { ...payload, expected_updated_at: product.updated_at },
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    // baseline ของคำเตือน "เปลี่ยนหมวดหมู่" ต้องขยับตามค่าที่เพิ่งบันทึกด้วย
                    // ไม่งั้นหลังเลือกกลุ่มสินค้าผ่าน dialog/แผงนี้ จะยังเตือนค้างว่ายังไม่บันทึก
                    if (section === 'master-categories') {
                        setSavedMasterCodes(masterCategoryAttributes.map((attr) => String(payload[attr.code] ?? '')));
                    }
                    options?.onSuccess?.();
                },
                onError: (errs) => {
                    if (errs.conflict) {
                        setConflictMessage(errs.conflict);
                        return;
                    }
                    const message = Object.values(errs)[0];
                    if (message) setSectionSaveError({ section, message });
                },
                onFinish: () => {
                    setSavingSection(null);
                    skipNavigationGuardRef.current = false;
                },
            },
        );
    };

    // เมนู "More" ของ toolbar — รวมแอ็กชันระดับสินค้าตัวนี้ทั้งตัวที่ไม่อยากโชว์
    // เป็นปุ่มถาวรข้าง Save (Duplicate/Delete เพราะเสี่ยงกว่า) กับที่แต่ก่อนต้อง
    // ไปทำจากหน้า list เท่านั้น (Duplicate/Delete) หรือหน้า missing-translations
    // เท่านั้น (Queue Missing Translations) — ตอนนี้เรียกจากหน้า Edit ได้ตรงๆ
    const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
    // Dropdown ของปุ่ม Save Product (ลูกศรข้างๆ) — Save Draft / Save as Template /
    // View Page ดู performSave()/saveDraft()/saveAsTemplate() ด้านล่าง
    const [saveMenuAnchor, setSaveMenuAnchor] = useState<HTMLElement | null>(null);
    // ทั้งสอง action นี้เปลี่ยนสถานะสินค้า (บังคับ disabled / สร้างสำเนาใหม่) —
    // ให้มี dialog ถามยืนยันก่อนเสมอ แบบเดียวกับ Publish/Duplicate/Delete ที่มีอยู่
    // แล้วในหน้านี้ (ต่างจาก View Page ที่แค่เปิดดู ไม่เปลี่ยนอะไร เลยไม่ต้องถาม)
    const [saveDraftConfirmOpen, setSaveDraftConfirmOpen] = useState(false);
    const [saveAsTemplateConfirmOpen, setSaveAsTemplateConfirmOpen] = useState(false);
    const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    // SKU ของสินค้าใหม่ที่ dialog ทำสำเนา/บันทึกเป็นเทมเพลตบังคับให้กรอก (ต้องไม่ซ้ำ)
    // ก่อนถึงจะกดยืนยันได้ — ใช้ state ชุดเดียวร่วมกันเพราะเปิดได้ทีละ dialog
    const [duplicateSku, setDuplicateSku] = useState('');
    const [duplicateSkuError, setDuplicateSkuError] = useState<string | null>(null);
    const duplicateSkuStatus = useSkuAvailability(duplicateSku, duplicateConfirmOpen || saveAsTemplateConfirmOpen);
    const openDuplicateSkuDialog = (open: () => void) => {
        setDuplicateSku('');
        setDuplicateSkuError(null);
        open();
    };
    const duplicateSkuField = (
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
    );
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [queuingTranslations, setQueuingTranslations] = useState(false);

    // $errorMessage: ให้ saveAsTemplate() ปรับข้อความ error ให้บอกด้วยว่าการแก้ไข
    // ของสินค้าเดิมถูกบันทึกไปแล้ว (แค่ขั้นตอนทำสำเนาต่างหากที่พัง) — ไม่งั้นถ้าใช้
    // ข้อความ fallback เฉยๆ ผู้ใช้จะไม่รู้ว่าแก้ไขที่เพิ่ง save ไปหายหรือเปล่า เดิม
    // endpoint นี้ไม่มี onError เลยทั้งสองที่เรียก (ปุ่ม "ทำสำเนา" ตรงๆ กับ
    // saveAsTemplate() นี้) ทำให้ error หายเงียบๆ ไม่มีอะไรบอกผู้ใช้เลยว่าทำไม
    // หน้าไม่ไปไหนต่อ — ใช้ pushResult ตัวเดียวกับ snackbar แจ้งผล push/deactivate
    // อยู่แล้ว แทนที่จะเพิ่ม state ใหม่
    const duplicateProduct = (options?: { asTemplate?: boolean; errorMessage?: (fallback: string) => string }) => {
        setDuplicating(true);
        router.post(
            `/catalog/products/${product.id}/duplicate`,
            { as_template: options?.asTemplate ?? false, sku: duplicateSku.trim() },
            {
                // สำเร็จแล้ว backend redirect ไปหน้า Edit ของสำเนาใหม่เลย (ดู
                // ProductController::duplicate()) เลยไม่ต้อง setDuplicateConfirmOpen(false)
                // เอง — หน้าจะเปลี่ยนไปทั้งหน้าอยู่แล้ว
                onError: (errs) => {
                    // SKU ชน (มีคนแย่งไปใช้หลังเช็คล่วงหน้า) — โชว์ใต้ช่อง SKU ถ้า dialog ยังเปิดอยู่
                    if (errs.sku) setDuplicateSkuError(errs.sku as string);
                    const fallback = (Object.values(errs)[0] as string | undefined) || t('duplicateProductError');
                    setPushResult({ severity: 'error', message: options?.errorMessage ? options.errorMessage(fallback) : fallback });
                },
                onFinish: () => setDuplicating(false),
            },
        );
    };

    const deleteProduct = () => {
        setDeleting(true);
        // สำเร็จแล้ว backend redirect กลับไปหน้า list เลย (ดู ProductController::destroy())
        router.delete(`/catalog/products/${product.id}`, {
            onFinish: () => setDeleting(false),
        });
    };

    // ต่างจาก duplicate/delete ตรงที่ไม่ทำลายอะไร (แค่ queue job แปลภาษา) เลยไม่ต้อง
    // confirm dialog ก่อน ยิงตรงจากเมนูได้เลย — ตามแพทเทิร์นเดียวกับ translateOne()
    // ในหน้า missing-translations.tsx
    const queueMissingTranslations = () => {
        setMoreDrawerOpen(false);
        setQueuingTranslations(true);
        router.post(
            `/catalog/products/${product.id}/queue-missing-translations`,
            {},
            { preserveScroll: true, onFinish: () => setQueuingTranslations(false) },
        );
    };

    // ปุ่ม "Publish" — ยุบขั้นตอนที่ปกติต้องทำแยกกันหลายคลิก (ติ๊ก Sales
    // Channel → กด Save แผงนั้น → ไล่กด Push ทีละร้าน) ให้เหลือคลิกเดียว:
    // เปิดใช้งานสินค้า + sync/push ทุกร้านที่ติ๊กไว้ *ตอนนี้* ในหน้า (ดู
    // ProductController::publish()) — ใช้ data.published_shop_ids ตรงๆ ไม่ใช่
    // publishedShopIds prop (ค่าที่ save ไว้แล้ว) เพราะต้องการให้ยิงตามติ๊ก
    // ล่าสุดในหน้าจอ แม้ว่าจะยังไม่เคยกด Save แผง Sales Channels มาก่อนเลยก็ตาม
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
    const [publishing, setPublishing] = useState(false);

    // รายชื่อร้านที่ติ๊กไว้ตอนนี้ — ใช้แสดงในกล่องยืนยันก่อน publish เท่านั้น
    // (backend เป็นคนตัดสินใจจริงว่าจะ push ร้านไหนบ้าง จาก published_shop_ids
    // ที่ส่งไปพร้อมคำขอ)
    const tickedShopsForPublish = useMemo(() => {
        const shopMeta = new Map<number, { name: string; platform: string }>();
        channelGroups.forEach((group) => {
            group.channels.forEach((ch) => {
                if (ch.shop_id != null) shopMeta.set(ch.shop_id, { name: ch.name || ch.code, platform: group.platform });
            });
        });
        return data.published_shop_ids.map((id) => shopMeta.get(id)).filter((meta): meta is { name: string; platform: string } => Boolean(meta));
    }, [channelGroups, data.published_shop_ids]);
    // ร้านที่จะถูกยกเลิกการขายอัตโนมัติหลังบันทึกร่าง — ร้านที่ติ๊กไว้ (ชุดเดียวกับที่จะ
    // ถูกบันทึกไปพร้อมกัน) เฉพาะเมื่อเปิด auto-sync ไว้เท่านั้น
    const draftTakedownShops = marketplaceAutoSync ? tickedShopsForPublish : [];

    const publishProduct = () => {
        setPublishing(true);
        // อัปเดต Switch "Status" ในเครื่องทันที ไม่ต้องรอ round-trip — เพราะ
        // useForm() ไม่ resync ค่าที่ setData ไว้เองกับ prop ใหม่หลัง redirect
        // กลับมา (preserveState ที่ตั้งไว้ใน request นี้คือสาเหตุ) ถ้าไม่ทำตรงนี้
        // Switch จะยังโชว์ off ค้างอยู่ทั้งที่ backend enabled=true ไปแล้ว
        setData('enabled', true);
        router.post(
            `/catalog/products/${product.id}/publish`,
            { published_shop_ids: data.published_shop_ids },
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    setPublishConfirmOpen(false);
                    // เหตุผลเดียวกับ setDefaults() ใน performSave() ด้านบน — ถ้า
                    // saveAndPublish() เรียกมา (performSave() ก่อนหน้านี้เพิ่งตั้ง
                    // baseline ไว้ตอน enabled ยังเป็นค่าก่อน publish) ไม่ทำตรงนี้ด้วย
                    // ปุ่ม Save Product จะโผล่ enabled กลับมาเฉยๆ ทั้งที่ทุกอย่างที่
                    // เห็นอยู่ถูก save/publish ไปแล้วจริงๆ ครบถ้วน
                    setDefaults();
                    baselineValuesRef.current = data.values;
                },
                onFinish: () => setPublishing(false),
            },
        );
    };

    // "Save and Publish" — เดิมเป็นปุ่ม "เผยแพร่" แยกต่างหากในทูลบาร์ที่เรียก
    // publishProduct() ตรงๆ (ไม่ผ่านฟอร์มหลักเลย) ทำให้ field อื่นที่พิมพ์แก้ไข
    // ค้างอยู่แต่ยังไม่ได้กด Save Product ไม่ถูกบันทึกไปด้วยตอนกด Publish — ย้าย
    // มารวมในเมนู Save Product แทนตามที่ขอมา และให้ save ฟอร์มทั้งหมดก่อน (เหมือน
    // performSave ปกติ) แล้วค่อย publish ต่อ (เหมือน saveAsTemplate() ลง
    // duplicateProduct() ต่อ) เพื่อไม่ให้เกิดเคสนั้นอีก ปุ่ม/dialog ยืนยันยังใช้
    // publishing state ตัวเดิม — disabled ต้องเช็คทั้ง publishing (คั่นตอน publish)
    // และ processing (คั่นตอน save ฟอร์มก่อนหน้านั้น) ไม่งั้นจะกดซ้ำได้ระหว่างรอ
    // save เสร็จ
    // Publish ไม่ push แล้ว (Push ทำที่ step "Push" ของหน้า Map สินค้า) — ไม่ต้องตรวจความพร้อม
    // ของ marketplace ก่อน: บันทึกฟอร์ม แล้วเปิดการเผยแพร่ + บันทึกร้านที่ติ๊กไว้
    const saveAndPublish = () => {
        performSave({ onSuccess: () => publishProduct() });
    };

    const sectionSaveButton = (section: 'channels' | 'master-categories', onClick: () => void) => (
        <Button
            onClick={onClick}
            disabled={savingSection !== null || processing}
            loading={savingSection === section}
            loadingDelay={0}
            style={{ marginLeft: 'auto', minWidth: 0 }}
        >
            {savingSection === section ? t('saving') : t('save')}
        </Button>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('editProductHeading', { sku: data.sku })} />
            <form
                onSubmit={submit}
                style={{ background: 'var(--sapBackgroundColor)', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
                {/* แถบแท็บบนสุด */}
                <div className={styles.pagePad} style={{ background: 'var(--sapGroup_ContentBackground)' }}>
                    <TabContainer
                        collapsed
                        contentBackgroundDesign="Transparent"
                        headerBackgroundDesign="Transparent"
                        onTabSelect={(e) => setTabIndex(e.detail.tabIndex)}
                    >
                        <Tab text={t('generalTitle')} selected={tabIndex === 0} />
                        {canViewHistory && <Tab text={t('historyTab')} selected={tabIndex === 1} />}
                    </TabContainer>
                </div>

                {/* แถบเครื่องมือย่อยใต้หัวข้อ */}
                <div
                    className={styles.pagePad}
                    style={{
                        paddingTop: '0.75rem',
                        paddingBottom: '0.75rem',
                        background: 'var(--sapGroup_ContentBackground)',
                        borderBottom: '1px solid var(--sapGroup_ContentBorderColor)',
                        marginBottom: '0.25rem',
                    }}
                >
                    <div className={styles.toolbar}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {/* ย้ายมาจากปุ่มข้อความฝั่งขวา (เดิมอยู่รวมกับ Publish/Save Product) มา
                                ไว้เป็นไอคอนหน้าหัวข้อแทน ตามที่ขอมาเฉพาะหน้านี้ — หน้า catalog
                                CRUD อื่นๆ (เช่น brands/edit.tsx) ยังใช้ปุ่มข้อความ + icon
                                ฝั่งขวาคู่กับ Save เหมือนเดิม ไม่ได้เปลี่ยนตาม */}
                            <Button
                                design="Transparent"
                                icon="nav-back"
                                tooltip={t('back')}
                                accessibleName={t('back')}
                                onClick={() => router.visit('/catalog/products')}
                            />
                            <Title level="H3" size="H4" wrappingType="Normal">
                                {t('editProductHeading', { sku: data.sku })}
                            </Title>
                            {matchedShopNames.length > 0 && (
                                <span style={{ display: 'inline-flex' }} title={`จับคู่แล้ว (Product Matching): ${matchedShopNames.join(', ')}`}>
                                    <Icon
                                        name="status-positive"
                                        accessibleName="จับคู่แล้ว"
                                        style={{ width: 22, height: 22, color: 'var(--sapPositiveColor)' }}
                                    />
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {/* ขอบเขตการแก้ไขปัจจุบัน (ภาษา · ช่องทาง) — ตัวเลือกจริงย้ายไปอยู่ใน
                                แผง "เพิ่มเติม" แล้ว แต่ยังต้องเห็นตลอดว่ากำลังแก้ค่าของภาษา/ร้านไหนอยู่
                                ไม่งั้นจะแก้ราคาของร้านหนึ่งโดยไม่รู้ตัว — กดแล้วเปิดแผงนั้น
                                (ช่องทางเฉพาะร้าน = design Attention ให้เห็นชัดว่าไม่ใช่ค่า default) */}
                            <Button
                                icon="action-settings"
                                design={activeChannelId !== null ? 'Attention' : 'Default'}
                                tooltip={t('editScopeChipTooltip')}
                                onClick={() => setMoreDrawerOpen(true)}
                                style={{ maxWidth: 360 }}
                            >
                                {activeLocaleLabel} · {activeChannelLabel}
                            </Button>
                            {isFieldAreaBusy && <BusyIndicator active delay={0} size="S" />}
                            <Button onClick={() => setMoreDrawerOpen(true)}>{t('more')}</Button>
                            {/* แผง "เพิ่มเติม" — รวมการตั้งค่าขอบเขตการแก้ไข (ภาษา/ช่องทาง)
                                กับ action ระดับสินค้า (ทำสำเนา/แปลภาษา/ลบ) ไว้ที่เดียว แทนที่จะเรียง
                                เป็น dropdown หลายอันบนแถบเครื่องมือ (UI5 ไม่มี Drawer → Dialog) */}
                            <Dialog
                                open={moreDrawerOpen}
                                onClose={() => setMoreDrawerOpen(false)}
                                className={styles.sidePanel}
                                header={
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0.5rem 0' }}>
                                        <Title level="H5" size="H5" style={{ flex: 1 }}>
                                            {t('more')}
                                        </Title>
                                        <Button
                                            design="Transparent"
                                            icon="decline"
                                            tooltip={t('close')}
                                            accessibleName={t('close')}
                                            onClick={() => setMoreDrawerOpen(false)}
                                        />
                                    </div>
                                }
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>
                                    {/* ขอบเขตการแก้ไข */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <Title level="H6" size="H6">
                                            {t('editScopeTitle')}
                                        </Title>

                                        <div>
                                            <Label for="edit-scope-locale" showColon={false} style={{ display: 'block', marginBottom: '0.25rem' }}>
                                                {t('editingLocale')}
                                            </Label>
                                            <Select
                                                id="edit-scope-locale"
                                                style={{ width: '100%' }}
                                                value={String(activeLocaleId)}
                                                onChange={(e) => {
                                                    // เปลี่ยนตรงนี้จะเปลี่ยนภาษา UI ของทั้งแอปไปด้วย — "ภาษาที่กำลังแก้ไข"
                                                    // ของหน้านี้ตั้งใจให้ตาม global locale ตัวเดียวกันเลย (ดู setLocale
                                                    // ของ useLocale() ด้านล่าง) ไม่ได้เป็นตัวเลือกแยกเฉพาะหน้านี้
                                                    const loc = locales.find((l) => l.id === Number(e.detail.selectedOption.value));
                                                    if (loc) setLocale(loc.code);
                                                }}
                                            >
                                                {locales.map((loc) => (
                                                    <Option key={loc.id} value={String(loc.id)}>
                                                        {loc.display_name || loc.code}
                                                    </Option>
                                                ))}
                                            </Select>
                                            <div className={styles.caption}>{t('editingLocaleHelp')}</div>
                                        </div>

                                        {/* "แก้ค่าสำหรับช่องทาง" — ย้ายมาจากการคลิกแถวร้านในแผง Sales Channels
                                            (เดิมคลิกชื่อร้าน = สลับ scope ของฟิลด์ channel-based ทั้งฟอร์มโดยไม่รู้ตัว) */}
                                        {channelGroups.length > 0 && (
                                            <div>
                                                <Label
                                                    for="edit-scope-channel"
                                                    showColon={false}
                                                    style={{ display: 'block', marginBottom: '0.25rem' }}
                                                >
                                                    {t('editingChannel')}
                                                </Label>
                                                <Select
                                                    id="edit-scope-channel"
                                                    style={{ width: '100%' }}
                                                    value={activeChannelId === null ? '' : String(activeChannelId)}
                                                    onChange={(e) => {
                                                        const v = e.detail.selectedOption.value ?? '';
                                                        handleChannelChange(v === '' ? null : Number(v));
                                                    }}
                                                >
                                                    <Option value="">{t('defaultAllChannelsLabel')}</Option>
                                                    {channelGroups.map((group) => (
                                                        <OptionGroup key={`h-${group.platform}`} headerText={group.platform}>
                                                            {group.channels.map((ch) => (
                                                                <Option key={ch.id} value={String(ch.id)}>
                                                                    {ch.name || ch.code}
                                                                </Option>
                                                            ))}
                                                        </OptionGroup>
                                                    ))}
                                                </Select>
                                                <div className={styles.caption}>{t('editingChannelHelp')}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* action ระดับสินค้า */}
                                    {(canDuplicateProduct || canQueueTranslations) && (
                                        <>
                                            <div className={styles.divider} />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <Title level="H6" size="H6">
                                                    {t('productActionsTitle')}
                                                </Title>
                                                {canDuplicateProduct && (
                                                    <div>
                                                        <Button
                                                            icon="copy"
                                                            className={styles.panelAction}
                                                            onClick={() => {
                                                                setMoreDrawerOpen(false);
                                                                openDuplicateSkuDialog(() => setDuplicateConfirmOpen(true));
                                                            }}
                                                        >
                                                            {t('duplicateProduct')}
                                                        </Button>
                                                        <div className={styles.caption}>{t('duplicateProductHelp')}</div>
                                                    </div>
                                                )}
                                                {/* "ทำสำเนาเฉพาะโครงสร้าง" (เดิม "บันทึกเป็นเทมเพลต" ในเมนูของปุ่มบันทึก) —
                                                    ย้ายมาไว้คู่กับ "ทำสำเนา" เพราะเป็นการทำสำเนาเหมือนกัน ต่างแค่ไม่คัดลอก
                                                    ค่าใดๆ (asTemplate — ดู saveAsTemplate()) gate ด้วย canDuplicateProduct
                                                    ตัวเดียวกันเพราะ endpoint duplicate เช็ค products.create_products */}
                                                {canDuplicateProduct && (
                                                    <div>
                                                        <Button
                                                            icon="copy"
                                                            className={styles.panelAction}
                                                            onClick={() => {
                                                                setMoreDrawerOpen(false);
                                                                openDuplicateSkuDialog(() => setSaveAsTemplateConfirmOpen(true));
                                                            }}
                                                        >
                                                            {t('saveAsTemplate')}
                                                        </Button>
                                                        <div className={styles.caption}>{t('saveAsTemplateHelp')}</div>
                                                    </div>
                                                )}
                                                {canQueueTranslations && (
                                                    <div>
                                                        <Button
                                                            icon="translate"
                                                            className={styles.panelAction}
                                                            disabled={queuingTranslations}
                                                            loading={queuingTranslations}
                                                            loadingDelay={0}
                                                            onClick={queueMissingTranslations}
                                                        >
                                                            {t('missingTranslationsTranslateAction')}
                                                        </Button>
                                                        <div className={styles.caption}>{t('queueTranslationsHelp')}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {/* ลบ — แยกไว้ท้ายสุดเป็นโซนอันตราย */}
                                    {canDeleteProduct && (
                                        <>
                                            <div className={styles.divider} />
                                            <div>
                                                <Button
                                                    icon="delete"
                                                    design="Negative"
                                                    className={styles.panelAction}
                                                    onClick={() => {
                                                        setMoreDrawerOpen(false);
                                                        setDeleteConfirmOpen(true);
                                                    }}
                                                >
                                                    {t('delete')}
                                                </Button>
                                                <div className={styles.caption}>{t('deleteProductHelp')}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </Dialog>

                            {/* Save Product เป็น split-button สไตล์ WordPress: ปุ่มหลัก save
                                ฟอร์มตามปกติ ลูกศรข้างๆ เปิดเมนู Save Draft / Save and Publish /
                                View Page — action ระดับ "วิธี save" ที่ไม่อยากให้ toolbar รกด้วยปุ่ม
                                แยกอีกหลายปุ่ม (ดู saveAndPublish() ด้านล่าง) — ไม่ใช้ UI5 SplitButton
                                เพราะลูกศรต้องกดได้แม้ปุ่มหลักจะ disabled (ยังไม่มีอะไรให้บันทึก) */}
                            <div style={{ display: 'inline-flex', gap: 1 }}>
                                {/* กัน traffic ตอนไม่มีอะไรให้บันทึกจริงๆ — isDirty มาจาก useForm()
                                    เทียบ data ปัจจุบันกับค่าตั้งต้นตอนโหลดหน้า (รวมถึง data.values
                                    ที่ทุกฟิลด์ attribute เขียนผ่าน setAttributeValue อยู่แล้ว) ปุ่มนี้
                                    เลย disabled โดยอัตโนมัติจนกว่าจะมีการแก้ไขจริงสักฟิลด์ */}
                                <Button
                                    design="Emphasized"
                                    disabled={processing || checkingMasterImpact || !isDirty}
                                    loading={processing}
                                    loadingDelay={0}
                                    onClick={() => performSave()}
                                    style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                                >
                                    {processing ? t('saving') : t('saveProduct')}
                                </Button>
                                <Button
                                    design="Emphasized"
                                    icon="slim-arrow-down"
                                    accessibleName={t('more')}
                                    disabled={processing}
                                    onClick={(e) => setSaveMenuAnchor(e.currentTarget as HTMLElement)}
                                    style={{ minWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                                />
                            </div>
                            <Menu opener={saveMenuAnchor ?? undefined} open={Boolean(saveMenuAnchor)} onClose={() => setSaveMenuAnchor(null)}>
                                <MenuItem
                                    icon="write-new-document"
                                    text={t('saveDraft')}
                                    onClick={() => {
                                        setSaveMenuAnchor(null);
                                        setSaveDraftConfirmOpen(true);
                                    }}
                                />
                                {/* บันทึกแล้วสั่งแปลจากภาษาที่กำลังแก้ ไปยังภาษาอื่นที่เปิดใช้งานและยังว่าง —
                                    gate ด้วยสิทธิ์เดียวกับ "สั่งแปลส่วนที่ขาด" ในเมนู More */}
                                {canQueueTranslations && (
                                    <MenuItem
                                        icon="translate"
                                        text={t('saveAndTranslate')}
                                        disabled={processing}
                                        onClick={() => {
                                            setSaveMenuAnchor(null);
                                            performSave({
                                                translateOtherLocales: true,
                                                onSuccess: () => setPushResult({ severity: 'success', message: t('productSavedTranslationQueued') }),
                                            });
                                        }}
                                    />
                                )}
                                {/* ย้ายมาจากปุ่ม "เผยแพร่" แยกต่างหากในทูลบาร์เดิม — gate ด้วย
                                    canEditSalesChannels ตัวเดียวกับปุ่มเดิมนั้น (คุม published_shop_ids
                                    ที่ publish() ใช้) เปิด dialog ยืนยันเดิมไว้ก่อน กด confirm ค่อยเรียก
                                    saveAndPublish() จริง */}
                                {canEditSalesChannels && (
                                    <MenuItem
                                        icon="upload-to-cloud"
                                        text={t('saveAndPublish')}
                                        tooltip={data.status !== 'active' ? t('publishingRequiresActive') : undefined}
                                        additionalText={data.status !== 'active' ? t('publishingRequiresActive') : undefined}
                                        disabled={data.status !== 'active'}
                                        onClick={() => {
                                            setSaveMenuAnchor(null);
                                            setPublishConfirmOpen(true);
                                        }}
                                    />
                                )}
                                <MenuSeparator />
                                {/* เปิดหน้า products.show ของสินค้าที่ id นี้ในแท็บใหม่ (ไม่ทับหน้าฟอร์มที่ยัง
                                    แก้ไขค้างอยู่) — สินค้าตัวนี้ถูกบันทึกไว้แล้ว (มี id ถึงมาถึงหน้า Edit ได้)
                                    ผู้ใช้เลยดูข้อมูลที่บันทึกไว้ล่าสุดได้เลย โดยไม่ต้องกด Save Product ก่อน */}
                                <MenuItem
                                    icon="show"
                                    text={t('viewProduct')}
                                    onClick={() => {
                                        setSaveMenuAnchor(null);
                                        window.open(`/catalog/products/${product.id}`, '_blank', 'noopener,noreferrer');
                                    }}
                                />
                            </Menu>
                        </div>
                    </div>
                </div>

                {/* Scrollable Body — พื้นที่เดียวในหน้านี้ที่ scroll ได้
                    ทุกอย่างที่อยู่เหนือมัน (header breadcrumb จาก layout, แท็บ
                    General/History, toolbar SKU/Save นี้) จะอยู่นอกกล่องนี้ทั้งหมด
                    เลยโชว์ตลอดโดยไม่ต้องใช้ sticky positioning หรือคำนวณความสูง
                    header ตอน runtime เลย */}
                <div ref={scrollBodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '3rem' }}>
                    {/* พบร่างที่ useDraftAutosave เก็บไว้ใน localStorage จากรอบก่อน (เช่น
                        โดน logout กะทันหันตอนสิทธิ์เปลี่ยนกลางคัน) — ถามก่อนเสมอ ไม่กู้คืน
                        ให้อัตโนมัติ เผื่อข้อมูลในระบบเปลี่ยนไปแล้วตั้งแต่ตอนนั้น */}
                    {draftPrompt && (
                        <div className={styles.pagePad} style={{ marginBottom: '1.5rem' }}>
                            <FioriMessageStrip severity="warning">
                                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{t('autosaveDraftFoundTitle')}</div>
                                <div style={{ marginBottom: '0.5rem' }}>
                                    {t('autosaveDraftFoundMessage', { time: new Date(draftPrompt.savedAt).toLocaleString() })}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <Button design="Emphasized" onClick={restoreDraft}>
                                        {t('restoreDraft')}
                                    </Button>
                                    <Button onClick={discardDraft}>{t('discardDraft')}</Button>
                                </div>
                            </FioriMessageStrip>
                        </div>
                    )}

                    {/* Optimistic-concurrency conflict — แยกจากกล่อง error ทั่วไปด้านล่าง
                        เพราะกรณีนี้ "แก้ให้ถูกแล้วกดใหม่" ใช้ไม่ได้ ต้องโหลดหน้าใหม่ก่อน
                        ถึงจะเห็นข้อมูลล่าสุดจริงๆ เลยมีปุ่ม Reload ต่างหากให้ ไม่ใช่แค่ข้อความเฉยๆ */}
                    {conflictMessage && (
                        <div className={styles.pagePad} style={{ marginBottom: '1.5rem' }}>
                            <FioriMessageStrip severity="error">
                                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{conflictMessage}</div>
                                <Button icon="refresh" onClick={() => router.reload()} style={{ marginTop: '0.25rem' }}>
                                    {t('reloadPage')}
                                </Button>
                            </FioriMessageStrip>
                        </div>
                    )}

                    {Object.entries(errors).filter(([key]) => key !== 'conflict').length > 0 && (
                        <div className={styles.pagePad} style={{ marginBottom: '1.5rem' }}>
                            <FioriMessageStrip severity="error">
                                <div style={{ fontWeight: 700 }}>{t('correctErrorsBeforeSaving')}</div>
                                {Object.entries(errors)
                                    .filter(([key]) => key !== 'conflict')
                                    .map(([key, message]) => (
                                        <div key={key}>{message}</div>
                                    ))}
                            </FioriMessageStrip>
                        </div>
                    )}

                    {/* Layout หลักแบบ 2 คอลัมน์ */}
                    {tabIndex === 0 && (
                        <div className={styles.pagePad}>
                            <div
                                ref={groupTabBarRef}
                                style={{
                                    marginBottom: '0.5rem',
                                    background: 'var(--sapGroup_ContentBackground)',
                                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                                    position: 'sticky',
                                    // ติดอยู่บนสุดของ scroll container ของตัวเอง (กล่อง
                                    // "Scrollable Body" ด้านบน) — กล่องนั้นเป็นสิ่งเดียวที่
                                    // scroll ได้ในหน้านี้ เลยตั้ง top:0 ตรงนี้ได้เลยโดยไม่ต้อง
                                    // คำนวณความสูง header อะไรเพิ่ม
                                    top: 0,
                                    zIndex: 1,
                                }}
                            >
                                <TabContainer
                                    collapsed
                                    contentBackgroundDesign="Transparent"
                                    headerBackgroundDesign="Transparent"
                                    style={{ padding: '0 1rem' }}
                                    onTabSelect={(e) => scrollToGroup(e.detail.tabIndex)}
                                >
                                    {assignedGroups.map((group, idx) => (
                                        <Tab key={group.id} text={localizedLabel(group, activeLocaleId)} selected={groupTabIndex === idx} />
                                    ))}
                                </TabContainer>
                                {/* ตัวกรองฟิลด์ — กรองทุก group พร้อมกัน (ไม่ใช่แค่ group ที่ active
                                อยู่) เพราะทุก panel render พร้อมกันหมดอยู่แล้วแบบ scroll-spy วางไว้ใน
                                กล่องเดียวกับแท็บกลุ่ม (sticky ตัวเดียวกัน) เพื่อให้กรองได้ตลอดเวลาที่
                                เลื่อนดูอยู่ ไม่ต้องเลื่อนกลับขึ้นไปบนสุดก่อน ดู attributeFilters'
                                state comment กับ visibleAttrs ใน assignedGroups.map() ด้านล่าง */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '0.5rem',
                                        padding: '0.5rem 1rem',
                                        borderTop: '1px solid var(--sapGroup_ContentBorderColor)',
                                    }}
                                >
                                    <Icon name="filter" style={{ color: 'var(--sapContent_LabelColor)' }} />
                                    <Label showColon={false} style={{ fontWeight: 600 }}>
                                        {t('filterFieldsLabel')}
                                    </Label>
                                    <SegmentedButton
                                        selectionMode="Multiple"
                                        onSelectionChange={(e) =>
                                            setAttributeFilters(
                                                e.detail.selectedItems.map((item) => (item as HTMLElement).dataset.value ?? '').filter(Boolean),
                                            )
                                        }
                                    >
                                        <SegmentedButtonItem data-value="required" selected={attributeFilters.includes('required')}>
                                            {t('filterRequired')}
                                        </SegmentedButtonItem>
                                        <SegmentedButtonItem data-value="locale" selected={attributeFilters.includes('locale')}>
                                            {t('filterLocaleBased')}
                                        </SegmentedButtonItem>
                                        <SegmentedButtonItem data-value="channel" selected={attributeFilters.includes('channel')}>
                                            {t('filterChannelBased')}
                                        </SegmentedButtonItem>
                                        {/* โผล่เฉพาะตอนหน้านี้เปิดมาจากปุ่มแก้ไขในหน้า Products Mapping ของ
                                        marketplace ไหนสักตัว (?platform=, ดู Props.platformContext) — ตัวกรองนี้
                                        ไม่มีความหมายอะไรเลยถ้าไม่มี platform ให้เทียบ เพราะ attr.platform_field_mapping
                                        จะเป็น null ทุกตัวอยู่แล้ว (ดู ProductController::platformFieldMappingsFor()) */}
                                        {platformContext && (
                                            <SegmentedButtonItem data-value="platformMapped" selected={attributeFilters.includes('platformMapped')}>
                                                {t('mappedToPlatformPayloadChip', { platform: PLATFORM_DISPLAY_NAMES[platformContext] })}
                                            </SegmentedButtonItem>
                                        )}
                                    </SegmentedButton>
                                    <Input
                                        value={attributeSearchQuery}
                                        onInput={(e) => setAttributeSearchQuery(e.target.value)}
                                        placeholder={t('searchAttributes')}
                                        showClearIcon
                                        icon={<Icon name="search" />}
                                        style={{ width: 300, maxWidth: '100%' }}
                                    />
                                    {(attributeFilters.length > 0 || attributeSearchQuery.length > 0) && (
                                        <Button
                                            design="Transparent"
                                            onClick={() => {
                                                setAttributeFilters([]);
                                                setAttributeSearchQuery('');
                                            }}
                                        >
                                            {t('clearFilter')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className={styles.mainGrid}>
                                {/* พื้นที่หลักฝั่งซ้าย: กลุ่ม Attribute จริงจากฐานข้อมูล */}
                                <div style={{ position: 'relative', minWidth: 0 }}>
                                    {isFieldAreaBusy && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                zIndex: 1,
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'center',
                                                paddingTop: '4rem',
                                                background: 'color-mix(in srgb, var(--sapBackgroundColor) 60%, transparent)',
                                                borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                            }}
                                        >
                                            <BusyIndicator active delay={0} size="M" />
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1.5rem',
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
                                            const assignedAttrs = group.attributes.filter((attr) => {
                                                if (data.type.toLowerCase() === 'configurable') {
                                                    return attr.code !== 'price' && attr.code !== 'qty';
                                                }
                                                return true;
                                            });
                                            // ตัวกรอง (attributeFilters, ดูคอมเมนต์ตรงประกาศ state) กรองซ้ำจาก
                                            // assignedAttrs อีกที — แยกตัวแปรออกจากกันเพื่อให้ข้อความ "ไม่มี
                                            // attribute ผูกกับกลุ่มนี้" ด้านล่างยังเช็คจาก assignedAttrs (สภาพ
                                            // จริงของกลุ่ม) ไม่ใช่ visibleAttrs ที่โดนกรองไปแล้ว ไม่งั้นกลุ่มที่มี
                                            // field จริงแต่ไม่ตรงตัวกรองที่เลือกไว้จะขึ้นข้อความผิดว่า "ไม่มี
                                            // attribute" ทั้งที่จริงๆ มี แค่ถูกซ่อนเพราะตัวกรอง
                                            const searchQueryNormalized = attributeSearchQuery.trim().toLowerCase();
                                            const visibleAttrs = assignedAttrs
                                                .filter(
                                                    (attr) =>
                                                        attributeFilters.length === 0 ||
                                                        (attributeFilters.includes('required') && attr.is_required) ||
                                                        (attributeFilters.includes('locale') && attr.is_locale_based) ||
                                                        (attributeFilters.includes('channel') && attr.is_channel_based) ||
                                                        (attributeFilters.includes('platformMapped') && Boolean(attr.platform_field_mapping)),
                                                )
                                                .filter(
                                                    (attr) =>
                                                        !searchQueryNormalized ||
                                                        localizedLabel(attr, activeLocaleId).toLowerCase().includes(searchQueryNormalized) ||
                                                        attr.code.toLowerCase().includes(searchQueryNormalized),
                                                );

                                            const isGroupCollapsed = Boolean(collapsedGroupIds[group.id]);
                                            // group.id === 0 คือ group สังเคราะห์ "General" (ดู
                                            // ProductController::buildProductFormProps() — เกิดตอน
                                            // family ยัง resolve ได้แต่ยังไม่มี attribute ผูกไว้เลย
                                            // สักตัว) ไม่ใช่ attribute_group_id จริง — ฝั่ง backend
                                            // เก็บ attribute พวกนี้ไว้ที่ groupKey 'ungrouped' เสมอ
                                            // (attribute_group_id เป็น NULL จริงๆ) ต้อง map ให้ตรงกัน
                                            // ไม่งั้นค่าที่เคย save ไว้จะหาไม่เจอตอนโหลดกลับมา
                                            const groupKey = group.id === 0 ? 'ungrouped' : String(group.id);

                                            return (
                                                <div
                                                    key={group.id}
                                                    ref={(el: HTMLDivElement | null) => {
                                                        groupSectionRefs.current[idx] = el;
                                                    }}
                                                    className={styles.card}
                                                    style={{ scrollMarginTop: `${GROUP_SECTION_SCROLL_MARGIN}px` }}
                                                >
                                                    <div
                                                        onClick={() => toggleGroupCollapse(group.id)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '0.5rem',
                                                            marginBottom: isGroupCollapsed ? 0 : '1.25rem',
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <Icon
                                                                name={isGroupCollapsed ? 'slim-arrow-right' : 'slim-arrow-down'}
                                                                style={{ padding: '0.25rem', color: 'var(--sapContent_IconColor)' }}
                                                            />
                                                            <Title level="H4" size="H5" wrappingType="Normal">
                                                                {localizedLabel(group, activeLocaleId)}
                                                            </Title>
                                                        </div>
                                                        {/* ทำให้เห็นว่าฟิลด์ในกลุ่มนี้มาจากตระกูลแอตทริบิวต์ไหนบ้าง — group
                                                        เดียวรับฟิลด์จากได้หลายตระกูล (เช่นแท็บ "Lazada" ที่ทุกตระกูล
                                                        Lazada ใช้ AttributeGroup row เดียวกันร่วมกันหมด ดู
                                                        LazadaAttributeFamilyGenerator::GROUP_CODE) ไม่งั้นจะไม่มีทาง
                                                        รู้เลยว่าต้องไปแก้ที่หน้า Attribute Family ตัวไหน กดที่ chip
                                                        เพื่อไปหน้าแก้ไขตระกูลนั้นได้เลย — วางไว้ฝั่งขวาสุดของแถบหัวข้อ
                                                        แยกจากชื่อกลุ่มชัดเจน */}
                                                        {(group.families?.length ?? 0) > 0 && (
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    gap: '0.5rem',
                                                                    flexWrap: 'wrap',
                                                                    justifyContent: 'flex-end',
                                                                }}
                                                            >
                                                                {(group.families ?? []).map((family) => (
                                                                    <Tag
                                                                        key={family.id}
                                                                        design="Information"
                                                                        interactive
                                                                        hideStateIcon
                                                                        title={`ไปที่ตระกูลแอตทริบิวต์ "${family.name ?? family.code}"`}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            router.visit(`/catalog/attributeFamilies/${family.id}/edit`);
                                                                        }}
                                                                    >
                                                                        {family.name ?? family.code}
                                                                    </Tag>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* พอ collapse แล้ว ฟิลด์หนักๆ ในกลุ่มนี้ (โดยเฉพาะ RichTextEditor/TinyMCE
                                                    ที่ mount ทุกตัวไว้ตลอดปกติ ดูคอมเมนต์ setDataRef ด้านบนของไฟล์) จะถูกถอด
                                                    ออกจาก DOM จริงๆ ไม่ใช่แค่ซ่อน — ลดจำนวน editor/ResizeObserver ที่ยังทำงาน
                                                    อยู่พร้อมกันทั้งหน้า ข้อแลกเปลี่ยน: กางกลุ่มที่มี rich-text กลับมาอีกครั้งจะ
                                                    ต้อง mount TinyMCE ใหม่ทุกครั้ง (value อ่านจาก data ของฟอร์มเสมอ ไม่หาย) */}
                                                    {!isGroupCollapsed && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                            {isGeneral && (
                                                                <div>
                                                                    <Label
                                                                        for="product-edit-sku"
                                                                        required
                                                                        showColon={false}
                                                                        style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}
                                                                    >
                                                                        SKU
                                                                    </Label>
                                                                    <Input
                                                                        id="product-edit-sku"
                                                                        required
                                                                        disabled
                                                                        style={{ width: '100%' }}
                                                                        value={data.sku}
                                                                        valueState={ui5ValueState(valueStateOf(errors.sku))}
                                                                        valueStateMessage={errors.sku ? <div>{errors.sku}</div> : undefined}
                                                                    />
                                                                    {errors.sku && <div className={styles.errorText}>{errors.sku}</div>}
                                                                </div>
                                                            )}

                                                            {assignedAttrs.length === 0 && isGeneral && assignedGroups.length === 1 && (
                                                                <FioriMessageStrip severity="information">
                                                                    <Trans
                                                                        t={t}
                                                                        i18nKey="noAttributeFamilyBoundYet"
                                                                        components={{
                                                                            groupLink: (
                                                                                <span
                                                                                    role="button"
                                                                                    tabIndex={0}
                                                                                    onClick={() => setMasterCategoryPickerOpen(true)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (
                                                                                            e.code === 'Enter' ||
                                                                                            e.code === 'NumpadEnter' ||
                                                                                            e.code === 'Space'
                                                                                        ) {
                                                                                            e.preventDefault();
                                                                                            setMasterCategoryPickerOpen(true);
                                                                                        }
                                                                                    }}
                                                                                    style={{
                                                                                        color: 'var(--sapLinkColor)',
                                                                                        fontWeight: 700,
                                                                                        textDecoration: 'underline',
                                                                                        cursor: 'pointer',
                                                                                    }}
                                                                                />
                                                                            ),
                                                                        }}
                                                                    />
                                                                </FioriMessageStrip>
                                                            )}

                                                            {assignedAttrs.length === 0 &&
                                                                !isGeneral &&
                                                                !(isSales && data.type.toLowerCase() === 'configurable') && (
                                                                    <div className={styles.emptyText}>{t('noAttributesAssignedToGroup')}</div>
                                                                )}

                                                            {/* กลุ่มนี้มี field จริง แค่ไม่มีตัวไหนตรงกับตัวกรองที่เลือกไว้ —
                                                            คนละข้อความกับ 2 อันด้านบน (ซึ่งคือกลุ่มไม่มี field ผูกไว้เลย
                                                            จริงๆ) ไม่งั้นจะดูเหมือนกลุ่มนี้ไม่มี attribute ทั้งที่มีจริง */}
                                                            {assignedAttrs.length > 0 && visibleAttrs.length === 0 && (
                                                                <div className={styles.emptyText}>{t('noFieldsMatchFilter')}</div>
                                                            )}

                                                            {visibleAttrs.map((attr) => {
                                                                const { channelKey, localeKey } = getValueKeys(attr);
                                                                // ถ้า locale นี้ยังไม่มีค่าของตัวเอง จะ fallback ไปใช้ bucket
                                                                // global ('default') แทน — ฟิลด์ที่เป็น locale-based ที่ import
                                                                // เข้ามาจะไปตกอยู่ตรงนั้นก่อน จนกว่าจะมีคนแปลทีละ locale
                                                                // (ดู ProductRowImporter) ถ้าไม่มี fallback นี้ ฟิลด์ที่เพิ่ง
                                                                // import มาจะดูเหมือนว่างเปล่า
                                                                const val =
                                                                    data.values[attr.id]?.[groupKey]?.[channelKey]?.[localeKey] ??
                                                                    data.values[attr.id]?.[groupKey]?.[channelKey]?.['default'] ??
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
                                                                        ? t('defaultAllChannelsLabel')
                                                                        : (channels.find((c) => c.id === activeChannelId)?.name ?? undefined);
                                                                return (
                                                                    <RenderAttributeInput
                                                                        key={attr.id}
                                                                        attr={attr}
                                                                        value={val}
                                                                        groupKey={groupKey}
                                                                        channelKey={channelKey}
                                                                        localeKey={localeKey}
                                                                        onValueChange={setAttributeValue}
                                                                        label={localizedLabel(attr, activeLocaleId)}
                                                                        activeLocaleCode={activeLocaleCode}
                                                                        activeChannelName={activeChannelName}
                                                                        canAddOptions={canAddAttributeOptions}
                                                                        sku={data.sku}
                                                                        productId={product.id}
                                                                        masterSources={masterSources}
                                                                        platformContext={platformContext}
                                                                    />
                                                                );
                                                            })}

                                                            {isSales && data.type.toLowerCase() === 'configurable' && (
                                                                <div>
                                                                    <div className={styles.variantHeader}>
                                                                        <Title level="H5" size="H6">
                                                                            {t('variantsListSubtitle')}
                                                                        </Title>
                                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                            <Button icon="refresh" onClick={openVariantDialog}>
                                                                                {data.variants.length > 0
                                                                                    ? t('editVariantSetButton')
                                                                                    : t('createVariantSetButton')}
                                                                            </Button>
                                                                            <Button design="Transparent" icon="add" onClick={handleAddBlankVariant}>
                                                                                {t('addBlankRowButton')}
                                                                            </Button>
                                                                        </div>
                                                                    </div>

                                                                    {data.variants.length === 0 ? (
                                                                        <div className={styles.emptyText}>{t('noVariantsEmptyState')}</div>
                                                                    ) : (
                                                                        <FioriResponsiveTable
                                                                            variant="plain"
                                                                            size="small"
                                                                            columns={variantColumns}
                                                                            rows={variantRows}
                                                                            getRowKey={getVariantRowKey}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Sidebar ฝั่งขวา */}
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {/* แผง Product Info — ฟอร์มสไตล์ Fiori: label ด้านบน + control
                                            UI5 (valueState ตอน error). อยู่ใน sidebar แคบ เลยไม่ใช้ FioriField
                                            แบบ label-ซ้าย (จะบีบเกินไป) */}
                                        <FioriFormGroup title={t('productInfo')}>
                                            <div>
                                                <Label showColon={false} className={styles.fieldLabel}>
                                                    {t('publishing')}
                                                </Label>
                                                {/* เผยแพร่ได้เฉพาะสถานะ Active (backend บังคับซ้ำ — ดู Product::canPublishWithStatus()) */}
                                                <Switch
                                                    checked={data.enabled}
                                                    disabled={data.status !== 'active'}
                                                    accessibleName={t('publishing')}
                                                    onChange={(e) => setData('enabled', e.target.checked)}
                                                />
                                            </div>

                                            {/* แสดงที่หน้า Home (products.show_on_home) — แยกจาก "การเผยแพร่"
                                                (enabled) ด้านบนที่คุมแค่การ push/deactivate ไป Marketplace */}
                                            <div>
                                                <Label showColon={false} className={styles.fieldLabel}>
                                                    {t('showOnHome')}
                                                </Label>
                                                <Switch
                                                    checked={data.show_on_home}
                                                    accessibleName={t('showOnHome')}
                                                    onChange={(e) => setData('show_on_home', e.target.checked)}
                                                />
                                            </div>

                                            {/* สถานะสินค้าใน PIM (products.status) — แยกจาก Switch
                                                enabled/show_on_home ด้านบน ตัวนี้เป็นแค่ป้าย
                                                สถานะ ไม่ได้ไป push/deactivate อะไรเอง */}
                                            <div>
                                                <Label for="product-edit-status" showColon={false} className={styles.fieldLabel}>
                                                    {t('productStatus')}
                                                </Label>
                                                <Select
                                                    id="product-edit-status"
                                                    style={{ width: '100%' }}
                                                    value={data.status}
                                                    valueState={ui5ValueState(valueStateOf(errors.status))}
                                                    valueStateMessage={errors.status ? <div>{errors.status}</div> : undefined}
                                                    onChange={(e) => {
                                                        const status = e.detail.selectedOption.value as ProductStatus;
                                                        // ไม่ใช่ Active (Hold/Delete) = ไม่เผยแพร่ทันที
                                                        setData((prev) => ({ ...prev, status, enabled: status === 'active' ? prev.enabled : false }));
                                                    }}
                                                >
                                                    {PRODUCT_STATUSES
                                                        // ออกจาก New ไปแล้ว (สถานะที่บันทึกไว้) เลือก New กลับไม่ได้ — ดู Product::canChangeStatus()
                                                        // (UI5 Option ไม่มี disabled เลยซ่อนตัวเลือกนั้นแทน)
                                                        .filter((status) => !(status === 'new' && product.status !== 'new'))
                                                        .map((status) => (
                                                            <Option key={status} value={status}>
                                                                {t(PRODUCT_STATUS_LABEL_KEYS[status])}
                                                            </Option>
                                                        ))}
                                                </Select>
                                                <div style={{ marginTop: '0.25rem' }}>
                                                    <FioriStatus
                                                        label={t(PRODUCT_STATUS_LABEL_KEYS[data.status])}
                                                        tone={PRODUCT_STATUS_TONES[data.status]}
                                                    />
                                                </div>
                                            </div>

                                            {/* เดิมมีช่อง "Product Type" (Simple/Configurable) เป็น dropdown ให้แก้
                                                ตรงนี้ — ซ่อนออกตามที่ user ขอ เพราะชื่อชนกับฟิลด์ "ประเภทสินค้า"
                                                (แอตทริบิวต์ producttype) ด้านล่าง ทั้งที่เป็นคนละเรื่องกันในระบบ
                                                (ตัวนี้กำหนดว่ามี variant ย่อยหรือไม่ ไม่เกี่ยวกับหมวดหมู่สินค้าเลย)
                                                และ Configurable ก็ปิดใช้งานสำหรับสินค้าใหม่มาตั้งแต่ต้นอยู่แล้ว —
                                                data.type ยังคงอยู่ใน form เดิม (ส่งไปกับ Save Product ตามปกติ ไม่ได้
                                                ถูกบังคับเปลี่ยนค่า) สินค้าที่เคยเป็น configurable อยู่แล้วจะยังทำงาน
                                                เหมือนเดิมทุกอย่าง (ตาราง variants ด้านล่างซ้ายยังโชว์/แก้ไขได้) แค่
                                                ไม่มีช่องให้สลับ Simple ⇄ Configurable จากหน้านี้อีกต่อไปเฉยๆ ถ้าจำเป็น
                                                ต้องสลับจริงๆ ทำผ่าน tinker ได้ */}

                                            {/* ประเภทสินค้า — แอตทริบิวต์ producttype ที่ options mirror
                                                มาจาก catalog/product-types (ดู ProductController::productTypeAttributeFor())
                                                คนละตัวกับ Product Type (Simple/Configurable) ด้านบน — ใช้ label
                                                แยกกันชัดเจนกันสับสน ค่าที่เลือกไปรวมอยู่ใน data.values เหมือน
                                                attribute อื่นๆ ทั่วไป บันทึกพร้อมปุ่ม Save Product หลักไปเลย
                                                ไม่ต้องมีปุ่ม Save แยกของตัวเอง */}
                                            {productTypeAttribute && (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                        <Label for="product-edit-producttype" showColon={false} style={{ fontWeight: 600 }}>
                                                            {t('masterProductTypeFieldLabel')}
                                                        </Label>
                                                        {productTypeAttribute.master_source && (
                                                            <Tag
                                                                design="Information"
                                                                hideStateIcon
                                                                size="S"
                                                                title={t('masterSourceChipTooltip')}
                                                                icon={<Icon name="information" />}
                                                            >
                                                                {t(
                                                                    masterSources.find((s) => s.value === productTypeAttribute.master_source)
                                                                        ?.labelKey ?? productTypeAttribute.master_source,
                                                                )}
                                                            </Tag>
                                                        )}
                                                    </div>
                                                    <Select
                                                        id="product-edit-producttype"
                                                        style={{ width: '100%' }}
                                                        value={
                                                            (data.values[productTypeAttribute.id]?.['ungrouped']?.['global']?.[
                                                                'default'
                                                            ] as string) || ''
                                                        }
                                                        onChange={(e) =>
                                                            setAttributeValue(
                                                                productTypeAttribute.id,
                                                                'ungrouped',
                                                                'global',
                                                                'default',
                                                                e.detail.selectedOption.value ?? '',
                                                            )
                                                        }
                                                        disabled={productTypeAttribute.editable === false}
                                                        valueState={ui5ValueState(valueStateOf(errors[`values.${productTypeAttribute.id}`]))}
                                                        valueStateMessage={
                                                            errors[`values.${productTypeAttribute.id}`] ? (
                                                                <div>{errors[`values.${productTypeAttribute.id}`]}</div>
                                                            ) : undefined
                                                        }
                                                    >
                                                        <Option value="">{t('masterProductTypeNone')}</Option>
                                                        {(productTypeAttribute.options || [])
                                                            .filter(
                                                                (opt) =>
                                                                    opt.is_active !== false ||
                                                                    opt.code ===
                                                                        (data.values[productTypeAttribute.id]?.['ungrouped']?.['global']?.[
                                                                            'default'
                                                                        ] as string),
                                                            )
                                                            .map((opt) => (
                                                                <Option key={opt.id} value={opt.code || ''}>
                                                                    {opt.admin_label || opt.code}
                                                                </Option>
                                                            ))}
                                                    </Select>
                                                </div>
                                            )}

                                            <div>
                                                <Label showColon={false} className={styles.fieldLabel}>
                                                    {t('updatedAt')}
                                                </Label>
                                                <Input
                                                    value={formatLocalDateTime(product.updated_at)}
                                                    disabled
                                                    style={{ width: '100%' }}
                                                    icon={<Icon name="calendar" />}
                                                />
                                            </div>

                                            <div>
                                                <Label showColon={false} className={styles.fieldLabel}>
                                                    {t('createdAt')}
                                                </Label>
                                                <Input
                                                    value={formatLocalDateTime(product.created_at)}
                                                    disabled
                                                    style={{ width: '100%' }}
                                                    icon={<Icon name="calendar" />}
                                                />
                                            </div>
                                        </FioriFormGroup>

                                        {/* แผง "Master Categories" — หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้า ย้ายมา
                                        แทนที่บล็อค Categories/Brand เดิม (จัดการทางหน้า Master แทนแล้ว — ดู
                                        catalog/categories/*, catalog/product-groups/*) เหลือแค่ 3 attribute
                                        ธรรมดา (pcatname/psubcatname/productgroupname) ที่ options mirror ต้นไม้
                                        categories มาเป๊ะๆ ผ่าน categories.code (ดู ProductCategoryLinker) ไม่ได้
                                        ผูก attribute_family ไหนเลย เลยแยก panel ของตัวเองแทนที่จะปนใน groupsData
                                        ทั่วไป (ดู ProductController::buildProductFormProps()) — บังคับเลือกตาม
                                        step (หมวดหมู่ -> หมวดหมู่ย่อย -> กลุ่มสินค้า เห็นทีละขั้นเท่านั้น ดู
                                        cascadedMasterCategoryAttributes/handleMasterCategoryChange ด้านบน) มีปุ่ม
                                        Save แยกของตัวเอง (เหมือน Sales Channels) ไม่ต้อง submit ทั้งฟอร์มใหญ่ —
                                        ฝั่ง backend (ProductController::updateMasterCategories()) จะ sync เข้า
                                        ต้นไม้ categories จริงให้เอง (เรียก ProductCategoryLinker::linkFromCodes())
                                        ซึ่งเป็นตัวที่ effectiveFamilyIds() ใช้อยู่แล้ว — ถ้ากลุ่มสินค้าที่เลือกมี
                                        ตระกูลแอตทริบิวต์ผูกไว้ (ดู Category::attributeFamilies()) แอตทริบิวต์ของ
                                        ตระกูลนั้นจะโผล่มาให้กรอกทันทีตอนเปิดแก้ไขสินค้านี้รอบถัดไป — เหมือนกับที่
                                        field Family เคยมีผลแบบเดียวกันตอน save+reload มาก่อน ไม่ต้อง fetch สดๆ
                                        ก่อน save แต่อย่างใด

                                        สิทธิ์ "แก้ไข" แยกของตัวเอง (resource `master_categories`) ไม่ได้พ่วงกับ
                                        products.edit_products ทั่วไปอีกต่อไป — แผงนี้ยังโชว์ให้ดูได้เสมอ (ไม่มี
                                        view แยกแบบ Sales Channels เพราะไม่มีเหตุผลต้องซ่อนจากการดู) แค่ไม่มีสิทธิ์
                                        แก้จะปิด Save + ปิด interaction ทั้งหมดในแผงแทน (pointerEvents) */}
                                        {cascadedMasterCategoryAttributes.length > 0 && (
                                            <div className={styles.card}>
                                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                                                    <Title level="H4" size="H5" wrappingType="Normal" style={{ flex: 1 }}>
                                                        {t('masterCategoriesBlockTitle')}
                                                    </Title>
                                                    {canEditMasterCategories &&
                                                        !canEditProducts &&
                                                        sectionSaveButton('master-categories', () => {
                                                            const payload: Record<string, FormDataConvertible> = {};
                                                            masterCategoryAttributes.forEach((attr) => {
                                                                payload[attr.code] = selectedMasterCategoryCode(attr);
                                                            });
                                                            saveSection('master-categories', payload);
                                                        })}
                                                </div>
                                                {sectionSaveError?.section === 'master-categories' && !masterCategoryPickerOpen && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <FioriMessageStrip severity="error">{sectionSaveError.message}</FioriMessageStrip>
                                                    </div>
                                                )}
                                                {/* เตือนทันทีที่ค่าต่างจากที่บันทึกไว้ — รายละเอียดจริงจะถามอีกครั้งตอนกดบันทึก */}
                                                {masterCategoryChanged && (
                                                    <FioriMessageStrip severity="warning" style={{ marginBottom: '1rem' }}>
                                                        {t('masterCategoryChangedNotice')}
                                                    </FioriMessageStrip>
                                                )}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '1rem',
                                                        ...(!canEditMasterCategories ? { pointerEvents: 'none', opacity: 0.6 } : {}),
                                                    }}
                                                >
                                                    {cascadedMasterCategoryAttributes.map(renderMasterCategoryField)}
                                                </div>
                                            </div>
                                        )}

                                        {/* แผง Sales Channels — มีสิทธิ์แยกของตัวเอง (sales_channels) ไม่ได้
                                        พ่วงกับ products.edit_products ทั่วไปอีกต่อไป ไม่มี view = ไม่โชว์
                                        แผงนี้เลย มี view แต่ไม่มี edit = โชว์ให้ดูได้แต่กดอะไรไม่ได้เลย
                                        (ปิด Save + ปิด interaction ทั้งหมดในแผงด้วย pointerEvents แทนที่จะ
                                        ไล่แก้ทีละ onClick เพราะแผงนี้มีปุ่ม/checkbox ซ้อนกันหลายชั้นมาก) */}
                                        {canViewSalesChannels && (
                                            <div className={styles.card}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <Title level="H4" size="H5" wrappingType="Normal">
                                                            {t('salesChannels')}
                                                        </Title>
                                                        <Label wrappingType="Normal" style={{ color: 'var(--sapContent_LabelColor)' }}>
                                                            {canEditProducts ? t('salesChannelsHelp') : t('salesChannelsHelpSectionSave')}
                                                        </Label>
                                                    </div>
                                                    {canEditSalesChannels &&
                                                        !canEditProducts &&
                                                        sectionSaveButton('channels', () =>
                                                            saveSection('channels', { published_shop_ids: data.published_shop_ids }),
                                                        )}
                                                </div>
                                                {/* Fiori: แต่ละ platform = Panel พับได้ (header มี checkbox เลือกทั้งหมด +
                                                ตัวนับ) ร้านในนั้น = List แบบ Multiple selection — checkbox ของแต่ละแถว
                                                คือ "published" ปุ่ม Push/ปิดการขาย/ลบ อยู่ท้ายแถว */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem',
                                                        ...(!canEditSalesChannels ? { pointerEvents: 'none', opacity: 0.6 } : {}),
                                                    }}
                                                >
                                                    {channelGroups.map((group) => {
                                                        const isExpanded = expandedPlatforms.has(group.platform);
                                                        const allShops = group.channels.filter((ch) => ch.shop_id != null);
                                                        // แสดงเฉพาะร้านที่สินค้านี้จับคู่แล้ว (+ ร้านที่ติ๊กไว้ จะได้ไม่มีร้านที่ติ๊กแต่มองไม่เห็น)
                                                        // ร้านอื่นกด "แสดงร้านอื่น" ได้ — ถ้ายังไม่จับคู่กับร้านไหนเลยก็แสดงทุกร้าน
                                                        // นับทั้งที่บันทึกไว้ (publishedShopIds) ด้วย ไม่งั้นเอาติ๊กออกแล้วแถวหายไปทันที
                                                        const relevantShops = allShops.filter(
                                                            (ch) =>
                                                                ch.matched ||
                                                                data.published_shop_ids.includes(ch.shop_id as number) ||
                                                                publishedShopIds.includes(ch.shop_id as number),
                                                        );
                                                        const hiddenShopCount = allShops.length - relevantShops.length;
                                                        const filteringShops = allShops.some((ch) => ch.matched) && hiddenShopCount > 0;
                                                        const showingAllShops = showAllShopsFor.has(group.platform);
                                                        const shops = filteringShops && !showingAllShops ? relevantShops : allShops;
                                                        const groupShopIds = shops.map((ch) => ch.shop_id as number);
                                                        const totalShopCount = allShops.length;
                                                        const checkedInGroup = groupShopIds.filter((id) =>
                                                            data.published_shop_ids.includes(id),
                                                        ).length;
                                                        const allInGroupChecked = groupShopIds.length > 0 && checkedInGroup === groupShopIds.length;
                                                        const someInGroupChecked = checkedInGroup > 0 && !allInGroupChecked;
                                                        // แผงนี้เหลือแค่ "ติ๊กร้านที่จะขาย + Push" แล้ว — แพลตฟอร์มที่ไม่มีร้านให้ติ๊ก
                                                        // เลย (channel ล้วนๆ) ไม่มีอะไรให้ทำในแผงนี้ (เลือกแก้ค่าได้ที่ dropdown บนแถบเครื่องมือ)
                                                        if (totalShopCount === 0) return null;

                                                        return (
                                                            <Panel
                                                                key={group.platform}
                                                                collapsed={!isExpanded}
                                                                onToggle={() => togglePlatform(group.platform)}
                                                                accessibleName={group.platform}
                                                                noAnimation
                                                                style={{
                                                                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                                                                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                                                    overflow: 'hidden',
                                                                }}
                                                                header={
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem',
                                                                            width: '100%',
                                                                            minWidth: 0,
                                                                        }}
                                                                    >
                                                                        <CheckBox
                                                                            checked={allInGroupChecked}
                                                                            indeterminate={someInGroupChecked}
                                                                            accessibleName={group.platform}
                                                                            onChange={() =>
                                                                                setData(
                                                                                    'published_shop_ids',
                                                                                    allInGroupChecked
                                                                                        ? data.published_shop_ids.filter(
                                                                                              (id) => !groupShopIds.includes(id),
                                                                                          )
                                                                                        : Array.from(
                                                                                              new Set([...data.published_shop_ids, ...groupShopIds]),
                                                                                          ),
                                                                                )
                                                                            }
                                                                        />
                                                                        <Title level="H5" size="H6" style={{ flex: 1, minWidth: 0 }}>
                                                                            {group.platform}
                                                                        </Title>
                                                                        <Tag
                                                                            design={checkedInGroup > 0 ? 'Information' : 'Neutral'}
                                                                            hideStateIcon
                                                                            size="S"
                                                                        >
                                                                            {t('publishedCountLabel', {
                                                                                checked: data.published_shop_ids.filter((id) =>
                                                                                    allShops.some((ch) => ch.shop_id === id),
                                                                                ).length,
                                                                                total: totalShopCount,
                                                                            })}
                                                                        </Tag>
                                                                    </div>
                                                                }
                                                            >
                                                                <List
                                                                    selectionMode="Multiple"
                                                                    separators="Inner"
                                                                    accessibleName={group.platform}
                                                                    onSelectionChange={(e) => {
                                                                        const selected = e.detail.selectedItems.map((item) =>
                                                                            Number((item as HTMLElement).dataset.shopId),
                                                                        );
                                                                        setData('published_shop_ids', [
                                                                            ...data.published_shop_ids.filter((id) => !groupShopIds.includes(id)),
                                                                            ...selected,
                                                                        ]);
                                                                    }}
                                                                >
                                                                    {shops.map((ch) => {
                                                                        const shopId = ch.shop_id as number;
                                                                        const shopName = ch.name || ch.code;
                                                                        const published = data.published_shop_ids.includes(shopId);
                                                                        // Push/Deactivate จะไปดู published_shop_ids ที่ *บันทึกไว้จริงๆ*
                                                                        // ฝั่ง backend — `published` สะท้อน checkbox ที่ยังไม่ได้ save เลย
                                                                        // โชว์ action ก็ต่อเมื่อสถานะ checkbox ตรงกับที่บันทึกไว้จริงเท่านั้น
                                                                        // (ไม่งั้น backend ปฏิเสธด้วย "not marked as published")
                                                                        const savedPublished = publishedShopIds.includes(shopId);
                                                                        // เฉพาะ platform ที่เชื่อมต่อจริง (PLATFORM_ROUTES) และ role มีสิทธิ์
                                                                        // push ของ platform นั้น (marketplace_{platform}.push_products_{platform}
                                                                        // — คนละสิทธิ์กับ canEditSalesChannels ที่คุมแค่การติ๊ก/บันทึก)
                                                                        const canPushThisPlatform = Boolean(
                                                                            canPushProducts[
                                                                                group.platform.toLowerCase() as keyof typeof canPushProducts
                                                                            ],
                                                                        );
                                                                        const canPushOrDeactivate =
                                                                            published &&
                                                                            savedPublished &&
                                                                            ['lazada', 'shopee', 'tiktok', 'woocommerce'].includes(
                                                                                group.platform.toLowerCase(),
                                                                            ) &&
                                                                            canPushThisPlatform;
                                                                        // ติ๊กแล้วแต่ยังไม่ได้ save = เคสเดียวที่ปุ่ม action ยังใช้ไม่ได้
                                                                        const hasUnsavedPublishChange = published && !savedPublished;

                                                                        return (
                                                                            <ListItemCustom
                                                                                key={ch.id}
                                                                                data-shop-id={shopId}
                                                                                selected={published}
                                                                                accessibleName={shopName}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '0.25rem',
                                                                                        width: '100%',
                                                                                        minWidth: 0,
                                                                                    }}
                                                                                >
                                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                                        <Text maxLines={1}>{shopName}</Text>
                                                                                        {hasUnsavedPublishChange && (
                                                                                            <Label style={{ fontStyle: 'italic' }}>
                                                                                                {t('saveFirstHint')}
                                                                                            </Label>
                                                                                        )}
                                                                                    </div>
                                                                                    {ch.is_live && (
                                                                                        <FioriStatus
                                                                                            label={t('liveLabel')}
                                                                                            tone="success"
                                                                                            showIcon
                                                                                            title={
                                                                                                ch.live_synced_at
                                                                                                    ? t('confirmedLiveAsOf', {
                                                                                                          date: new Date(
                                                                                                              ch.live_synced_at,
                                                                                                          ).toLocaleString(),
                                                                                                      })
                                                                                                    : t('confirmedLiveOnLastSync')
                                                                                            }
                                                                                        />
                                                                                    )}
                                                                                    {canPushOrDeactivate && (
                                                                                        // Push / ปิดการขาย / ลบ listing ย้ายไป step "Push" ของหน้า Map สินค้าแล้ว
                                                                                        <Link
                                                                                            href={`/catalog/marketplace/${group.platform.toLowerCase()}/products?search=${encodeURIComponent(product.sku)}&open=${product.id}&section=push`}
                                                                                            style={{ whiteSpace: 'nowrap' }}
                                                                                        >
                                                                                            ไป Push
                                                                                        </Link>
                                                                                    )}
                                                                                </div>
                                                                            </ListItemCustom>
                                                                        );
                                                                    })}
                                                                </List>
                                                                {filteringShops && (
                                                                    <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <Label wrappingType="Normal" style={{ color: 'var(--sapContent_LabelColor)' }}>
                                                                            {showingAllShops
                                                                                ? `แสดงทุกร้าน (${totalShopCount})`
                                                                                : `แสดงเฉพาะร้านที่จับคู่สินค้าแล้ว (${relevantShops.length} จาก ${totalShopCount} ร้าน)`}
                                                                        </Label>
                                                                        <Link
                                                                            onClick={() =>
                                                                                setShowAllShopsFor((prev) => {
                                                                                    const next = new Set(prev);
                                                                                    if (next.has(group.platform)) next.delete(group.platform);
                                                                                    else next.add(group.platform);
                                                                                    return next;
                                                                                })
                                                                            }
                                                                        >
                                                                            {showingAllShops ? 'ซ่อนร้านที่ยังไม่จับคู่' : `แสดงร้านอื่นอีก ${hiddenShopCount} ร้าน`}
                                                                        </Link>
                                                                    </div>
                                                                )}
                                                            </Panel>
                                                        );
                                                    })}
                                                    {channelGroups.length === 0 && (
                                                        <div className={styles.emptyText}>{t('noSalesChannelsAvailableEdit')}</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* แผง Associations (ปิดไว้) — เดิมเป็น ProductPicker 3 ชุด
                                        (Related / Up-Sell / Cross-Sell) ผูกกับ relatedProducts/upSellProducts/
                                        crossSellProducts + setData('associations', ...) ดู git history ถ้าจะเปิดใช้ใหม่ */}

                                        {/* แผง "เส้นทางสินค้า" — timeline ของสินค้านี้ทั้งหมด (ใครแก้อะไร
                                        ตอนไหน) วางไว้เป็น block ข้าง sidebar ของแท็บ General แทนที่จะเป็น
                                        แท็บแยก จะได้เห็นควบคู่ไปกับฟอร์มหลักโดยไม่ต้องสลับแท็บ — ข้อมูลชุด
                                        เดียวกับแท็บ History เป๊ะ (audit log ของสินค้านี้) แค่จัดรูปแบบเป็น
                                        เส้นเวลาแนวตั้งแทนตาราง (ดู ProductController::timeline()) จำกัด
                                        ความสูงแล้วให้ scroll ในตัวเอง ไม่งั้น sidebar จะยาวเกินไปถ้าสินค้ามี
                                        ประวัติแก้ไขเยอะ */}
                                        {canViewHistory && (
                                            <div className={styles.card}>
                                                <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '1rem' }}>
                                                    {t('timelineTitle')}
                                                </Title>
                                                <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: '0.25rem' }}>
                                                    <TimelinePanel timelineUrl={`/catalog/products/${product.id}/timeline`} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />}
                </div>
            </form>

            {/* Dialog ยืนยันการทำสำเนา (Duplicate) — ยิงจากเมนู "More" */}
            <FioriMessageBox
                open={duplicateConfirmOpen}
                onCancel={() => setDuplicateConfirmOpen(false)}
                onConfirm={() => duplicateProduct()}
                title={t('confirmDuplication')}
                severity="confirm"
                confirmLabel={t('duplicateProduct')}
                cancelLabel={t('cancel')}
                confirmLoading={duplicating}
                confirmDisabled={duplicateSkuStatus !== 'available'}
            >
                {t('confirmDuplicateMessage')}
                {duplicateSkuField}
            </FioriMessageBox>

            {/* Dialog ยืนยันการลบ — ยิงจากเมนู "More" */}
            <FioriMessageBox
                open={deleteConfirmOpen}
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={deleteProduct}
                title={t('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {t('confirmDeleteMessage')}
            </FioriMessageBox>

            {/* Dialog ยืนยันก่อน Publish — สรุปให้ชัดว่าจะเปิดใช้งานสินค้า +
                push ไปร้านไหนบ้าง (หรือไม่ push เลยถ้ายังไม่ได้ติ๊กร้านไหนไว้) */}
            <FioriMessageBox
                open={publishConfirmOpen}
                onCancel={() => setPublishConfirmOpen(false)}
                onConfirm={saveAndPublish}
                title={t('confirmSaveAndPublish')}
                severity="confirm"
                confirmLabel={t('saveAndPublish')}
                cancelLabel={t('cancel')}
                confirmLoading={publishing || processing}
            >
                <div>{tickedShopsForPublish.length > 0 ? t('confirmPublishMessageWithChannels') : t('confirmPublishMessageNoChannels')}</div>
                {tickedShopsForPublish.length > 0 ? (
                    <ul className={styles.shopList}>
                        {tickedShopsForPublish.map((shop) => (
                            <li key={shop.name}>
                                {shop.name} <span className={styles.captionInline}>({shop.platform})</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div style={{ marginTop: '0.5rem' }}>{t('confirmPublishNoChannelsTicked')}</div>
                )}
            </FioriMessageBox>

            {/* ยืนยันการเปลี่ยนหมวดหมู่ — ดู performSave() */}
            <FioriMessageBox
                open={masterImpact !== null}
                onCancel={() => setMasterImpact(null)}
                onConfirm={() => {
                    const options = masterImpact?.options;
                    setMasterImpact(null);
                    doSave({ ...options, skipMasterCategoryCheck: true });
                }}
                title={t('masterCategoryChangeTitle')}
                severity="warning"
                confirmLabel={t('masterCategoryConfirmSave')}
                cancelLabel={t('cancel')}
                confirmLoading={processing}
            >
                <div>{t('masterCategoryChangeIntro')}</div>
                {masterImpact?.error && <div style={{ marginTop: '0.75rem' }}>{t('masterCategoryImpactUnavailable')}</div>}
                {(masterImpact?.removed_families?.length ?? 0) > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{t('masterCategoryRemovedFamilies')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                            {masterImpact?.removed_families?.map((f) => (
                                <Tag key={f.id} design="Negative" hideStateIcon size="S">
                                    {f.name}
                                </Tag>
                            ))}
                        </div>
                    </div>
                )}
                {(masterImpact?.added_families?.length ?? 0) > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{t('masterCategoryAddedFamilies')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                            {masterImpact?.added_families?.map((f) => (
                                <Tag key={f.id} design="Positive" hideStateIcon size="S">
                                    {f.name}
                                </Tag>
                            ))}
                        </div>
                    </div>
                )}
                {(masterImpact?.hidden_filled_count ?? 0) > 0 && (
                    <FioriMessageStrip severity="warning" style={{ marginTop: '1rem' }}>
                        <div style={{ fontWeight: 600 }}>{t('masterCategoryHiddenFilled', { count: masterImpact?.hidden_filled_count ?? 0 })}</div>
                        <div style={{ marginTop: '0.25rem' }}>
                            {(masterImpact?.hidden_filled ?? []).join(', ')}
                            {(masterImpact?.hidden_filled_count ?? 0) > (masterImpact?.hidden_filled?.length ?? 0) ? ' …' : ''}
                        </div>
                        <div className={styles.caption}>{t('masterCategoryHiddenNote')}</div>
                    </FioriMessageStrip>
                )}
                {(masterImpact?.new_required_empty_count ?? 0) > 0 && (
                    <FioriMessageStrip severity="information" style={{ marginTop: '0.75rem' }}>
                        {t('masterCategoryNewRequired', { count: masterImpact?.new_required_empty_count ?? 0 })}
                    </FioriMessageStrip>
                )}
            </FioriMessageBox>

            {/* Dialog ยืนยันก่อน Save Draft — ดู saveDraft()'s docblock */}
            <FioriMessageBox
                open={saveDraftConfirmOpen}
                onCancel={() => setSaveDraftConfirmOpen(false)}
                onConfirm={saveDraft}
                title={t('confirmSaveDraft')}
                severity={draftTakedownShops.length > 0 ? 'warning' : 'confirm'}
                confirmLabel={t('saveDraft')}
                cancelLabel={t('cancel')}
                confirmLoading={processing}
            >
                {t('confirmSaveDraftMessage')}
                {/* บันทึกร่าง = ปิด "การเผยแพร่" → auto-sync จะยกเลิกการขายทุกร้านที่ติ๊กไว้
                    (QueueAutoMarketplaceSync) — บอกให้ชัดว่าร้านไหนบ้างก่อนกดยืนยัน */}
                {draftTakedownShops.length > 0 && (
                    <>
                        <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>{t('saveDraftTakedownWarning')}</div>
                        <ul className={styles.shopList}>
                            {draftTakedownShops.map((shop) => (
                                <li key={shop.name}>
                                    {shop.name} <span className={styles.captionInline}>({shop.platform})</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </FioriMessageBox>

            {/* Dialog ยืนยันก่อน Save as Template — ดู saveAsTemplate()'s docblock */}
            <FioriMessageBox
                open={saveAsTemplateConfirmOpen}
                onCancel={() => setSaveAsTemplateConfirmOpen(false)}
                onConfirm={saveAsTemplate}
                title={t('confirmSaveAsTemplate')}
                severity="confirm"
                confirmLabel={t('saveAsTemplate')}
                cancelLabel={t('cancel')}
                confirmLoading={processing || duplicating}
                confirmDisabled={duplicateSkuStatus !== 'available'}
            >
                {t('confirmSaveAsTemplateMessage')}
                {duplicateSkuField}
            </FioriMessageBox>

            <FioriMessageBox
                open={pendingSimpleConfirm}
                onCancel={() => setPendingSimpleConfirm(false)}
                onConfirm={confirmSwitchToSimple}
                title={t('confirmSwitchToSimpleTitle')}
                severity="warning"
                destructive
                confirmLabel={t('confirmSwitchToSimpleButton')}
                cancelLabel={t('cancel')}
            >
                <Trans t={t} i18nKey="confirmSwitchToSimpleMessage" values={{ count: data.variants.length }} components={{ strong: <strong /> }} />
            </FioriMessageBox>

            <Dialog
                open={masterCategoryPickerOpen}
                style={{ width: 'min(600px, calc(100vw - 2rem))' }}
                onClose={() => setMasterCategoryPickerOpen(false)}
                header={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.5rem 0' }}>
                        <Title level="H5" size="H5" wrappingType="Normal">
                            {t('masterCategoriesBlockTitle')}
                        </Title>
                        <Button
                            design="Transparent"
                            icon="decline"
                            tooltip={t('close')}
                            accessibleName={t('close')}
                            onClick={() => setMasterCategoryPickerOpen(false)}
                        />
                    </div>
                }
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                {canEditMasterCategories && (
                                    <Button
                                        design="Emphasized"
                                        disabled={savingSection === 'master-categories'}
                                        loading={savingSection === 'master-categories'}
                                        loadingDelay={0}
                                        onClick={() => {
                                            const payload: Record<string, FormDataConvertible> = {};
                                            masterCategoryAttributes.forEach((attr) => {
                                                payload[attr.code] = selectedMasterCategoryCode(attr);
                                            });
                                            saveSection('master-categories', payload, { onSuccess: () => setMasterCategoryPickerOpen(false) });
                                        }}
                                    >
                                        {t('save')}
                                    </Button>
                                )}
                                <Button design="Transparent" onClick={() => setMasterCategoryPickerOpen(false)}>
                                    {t('cancel')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                {(sectionSaveError?.section === 'master-categories' || conflictMessage) && (
                    <div style={{ marginBottom: '1rem' }}>
                        <FioriMessageStrip severity="error">{conflictMessage ?? sectionSaveError?.message}</FioriMessageStrip>
                    </div>
                )}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        ...(!canEditMasterCategories ? { pointerEvents: 'none', opacity: 0.6 } : {}),
                    }}
                >
                    {cascadedMasterCategoryAttributes.map(renderMasterCategoryField)}
                </div>
            </Dialog>

            <Dialog
                open={variantDialogOpen}
                style={{ width: 'min(600px, calc(100vw - 2rem))' }}
                onClose={() => setVariantDialogOpen(false)}
                header={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.5rem 0' }}>
                        <Title level="H5" size="H5" wrappingType="Normal">
                            {t('selectVariantAttributesTitle')}
                        </Title>
                        <Button
                            design="Transparent"
                            icon="decline"
                            tooltip={t('close')}
                            accessibleName={t('close')}
                            onClick={() => setVariantDialogOpen(false)}
                        />
                    </div>
                }
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button design="Emphasized" onClick={applyVariantGeneration}>
                                    {t('generateButton')}
                                </Button>
                                <Button design="Transparent" onClick={() => setVariantDialogOpen(false)}>
                                    {t('cancel')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                {variantOverflow !== null && (
                    <FioriMessageStrip severity="error" style={{ marginBottom: '1rem' }}>
                        {t('tooManyVariantCombinations', { count: variantOverflow, max: MAX_VARIANT_COMBINATIONS })}
                    </FioriMessageStrip>
                )}
                {data.variants.length > 0 && (
                    <FioriMessageStrip severity="warning" style={{ marginBottom: '1rem' }}>
                        {t('regenerateVariantsWarning')}
                    </FioriMessageStrip>
                )}
                <MultiComboBox
                    style={{ width: '100%' }}
                    placeholder={t('selectAttributesForVariantPlaceholder')}
                    onSelectionChange={(e) =>
                        setPendingVariantAttrIds(
                            e.detail.items.map((item) => Number((item as HTMLElement).dataset.id)).filter((id) => !Number.isNaN(id)),
                        )
                    }
                >
                    {familyScopedVariantAttributes.map((option) => (
                        <MultiComboBoxItem
                            key={option.id}
                            data-id={option.id}
                            text={option.name || option.code}
                            selected={selectedVariantAttributeObjects.some((attr) => attr.id === option.id)}
                        />
                    ))}
                </MultiComboBox>
            </Dialog>

            {pushResult !== null && (
                <FioriMessageStrip onClose={() => setPushResult(null)} severity={pushResult.severity} style={FLOATING_STRIP_STYLE}>
                    {pushResult.message}
                </FioriMessageStrip>
            )}
        </AppLayout>
    );
}

// แปลง value ของ attribute แบบ gallery ให้เป็นรูปแบบเดียวกัน — ไม่ว่าจะเป็น array
// ของ path ที่ encode เป็น JSON ดิบๆ ที่โหลดมาจาก backend หรือจะเป็น
// (string | File)[] หลังจากผู้ใช้แก้ไขในเซสชันนี้แล้วก็ตาม ให้กลายเป็น list
// แบบแบนๆ ของ path เดิมที่เก็บไว้ / ไฟล์ที่เพิ่งเลือกใหม่
function parseGalleryItems(value: AttributeValue): (string | File)[] {
    if (Array.isArray(value)) {
        // ปกติค่านี้ควรมีแค่ string (path เดิม) กับ File (เพิ่งเลือกใหม่รอ upload)
        // แต่ draft ที่กู้คืนจาก useDraftAutosave (localStorage) อาจมี null ปนมา
        // ได้ — File ไม่รอดการ JSON.stringify เลยถูกแทนด้วย null ไว้ก่อนบันทึก
        // (ดู stripFiles ใน use-draft-autosave.ts) กรองทิ้งตรงนี้ ไม่งั้น null
        // จะไหลไปถึง .map() ของแกลเลอรีด้านล่าง (พังตอนคำนวณ key จาก item.name)
        // และ GalleryThumb (พังตอน URL.createObjectURL(null))
        return value.filter((item): item is string | File => typeof item === 'string' || item instanceof File);
    }
    if (typeof value === 'string' && value) {
        try {
            const parsed = JSON.parse(value);
            // สำคัญกับ video โดยเฉพาะ (ใช้ฟังก์ชันนี้ร่วมกับ gallery แล้ว — ดู
            // attr.type === 'video' ด้านล่าง) เพราะ video เพิ่งมาเป็น array
            // ทีหลัง ค่าเก่าที่มีอยู่แล้วในระบบเป็น path string เดี่ยวๆ มาตลอด —
            // บางเส้นทางบังเอิญ parse เป็น JSON ที่ถูกต้องได้เฉยๆ (เช่น path ที่
            // ดันเป็นตัวเลขล้วนๆ) โดยไม่ throw แต่ผลลัพธ์ไม่ใช่ array เลยต้องห่อ
            // เป็น array เดียวกันกับตอน parse fail ด้านล่าง (ไม่งั้นวิดีโอ/รูปเก่า
            // จะหายไปเงียบๆ แทนที่จะโชว์เป็น 1 รายการ) — เหมือน parseVideoPaths()
            // ของ show.tsx เป๊ะ
            return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p !== '') : [value];
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
        <div style={{ position: 'relative', width: 200, height: 200 }}>
            {src ? (
                <img src={src} alt="" className={styles.thumbMedia} style={{ width: 200, height: 200, objectFit: 'cover' }} />
            ) : (
                <div className={styles.thumbPlaceholder} style={{ width: 200, height: 200 }} />
            )}
            {!disabled && (
                <button type="button" onClick={onRemove} aria-label="Remove image" className={styles.thumbRemove}>
                    <Icon name="decline" style={{ width: 10, height: 10 }} />
                </button>
            )}
        </div>
    );
}

// render preview วิดีโอทีละไฟล์ — เหมือน GalleryThumb ด้านบนทุกประการ แค่เปลี่ยน
// <img> เป็น <video controls> (แคบกว่าเพราะวิดีโอมักเป็นแนวนอน) — ไม่ว่าจะเป็น
// path ที่เก็บไว้อยู่แล้วหรือ File ที่เพิ่งเลือกในเครื่องรอ upload พร้อมปุ่มลบ
function VideoThumb({ item, disabled, onRemove }: { item: string | File; disabled?: boolean; onRemove: () => void }) {
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
        <div style={{ position: 'relative', width: 160 }}>
            {src ? (
                <video src={src} controls className={styles.thumbMedia} style={{ width: 160, maxHeight: 100 }} />
            ) : (
                <div className={styles.thumbPlaceholder} style={{ width: 160, height: 100 }} />
            )}
            {!disabled && (
                <button type="button" onClick={onRemove} aria-label="Remove video" className={styles.thumbRemove}>
                    <Icon name="decline" style={{ width: 10, height: 10 }} />
                </button>
            )}
        </div>
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
    groupKey: string;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, groupKey: string, channelKey: string, localeKey: string, val: AttributeValue) => void;
};

// Autocomplete (popper ของ options, virtualization, filtering) เป็นหนึ่งใน
// control ที่หนักที่สุดในฟอร์มนี้ และ attribute ส่วนใหญ่ไม่ได้ scope ตาม locale
// — value/options ของมันไม่เปลี่ยนตอนสลับแค่ภาษาเฉยๆ ถึงแม้ *label* ของทุกฟิลด์
// จะเปลี่ยน (ชื่อ attribute ถูกแปลไว้) การแยกส่วนนี้ออกจาก label/chip ที่ห่อ
// อยู่รอบๆ แล้ว memoize ด้วย props ที่เปลี่ยนก็ต่อเมื่อ value/options เปลี่ยนจริงๆ
// เท่านั้น ทำให้มันข้าม re-render ได้ แทนที่จะต้องสร้างใหม่ทุกครั้งที่สลับ
const SelectControl = memo(function SelectControl({
    attributeId,
    groupKey,
    channelKey,
    localeKey,
    options,
    value,
    disabled,
    loading = false,
    onValueChange,
}: FieldControlProps & {
    options: AttributeOption[];
    value: string;
    disabled: boolean;
    loading?: boolean;
}) {
    const { t } = useTranslation('catalog');
    const selectedOption = options.find((opt) => optionValue(opt) === value) ?? null;
    // ตัวเลือกที่ถูกปิดใช้งาน (is_active === false) ไม่ควรโชว์เป็นตัวเลือกใหม่ให้เลือก
    // แต่ถ้าสินค้านี้เลือกค่านั้นไว้อยู่แล้วต้องยังคงโชว์ต่อไป ไม่งั้นค่าที่มีอยู่จะหายไปจาก dropdown
    const visibleOptions = options.filter((opt) => opt.is_active !== false || opt === selectedOption);
    return (
        <ComboBox
            style={{ width: '100%' }}
            disabled={disabled}
            loading={loading}
            showClearIcon
            placeholder={loading ? t('loadingOptions') : t('selectOption')}
            // ต้องส่ง value (ข้อความที่โชว์) คู่กับ selectedValue เสมอ — UI5 ComboBox
            // แปลง selectedValue เป็นข้อความให้เองแค่ตอน render ครั้งแรกเท่านั้น ถ้าค่าถูก
            // ตั้งทีหลังจากโค้ด (เช่น เลือกกลุ่มสินค้าใน dialog แล้วแผงด้านข้างได้ค่าตาม หรือ
            // options ของหมวดหมู่ย่อย/กลุ่มสินค้าเพิ่ง fetch มาถึง) ช่องจะว่างทั้งที่มีค่าอยู่
            value={selectedOption ? selectedOption.admin_label || selectedOption.code || '' : ''}
            selectedValue={selectedOption ? optionValue(selectedOption) : ''}
            onSelectionChange={(e) => {
                const item = e.detail.item;
                onValueChange(attributeId, groupKey, channelKey, localeKey, item ? (item.value ?? '') : '');
            }}
        >
            {visibleOptions.map((opt) => (
                <ComboBoxItem key={opt.id} value={optionValue(opt)} text={opt.admin_label || opt.code || ''} />
            ))}
        </ComboBox>
    );
});

// เหตุผลเดียวกับ SelectControl: rich-text editor ตัวหนึ่ง render ใหม่แต่ละครั้ง
// มีต้นทุนสูง และ value ของ attribute ส่วนใหญ่ก็ไม่เปลี่ยนตอนสลับแค่ locale เฉยๆ
// — เปลี่ยนแค่ label (ที่ render แยกต่างหาก) เท่านั้น
const RichTextControl = memo(function RichTextControl({
    attributeId,
    groupKey,
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
            onChange={(val) => onValueChange(attributeId, groupKey, channelKey, localeKey, val)}
            placeholder={placeholder}
            readOnly={readOnly}
            imageUploadUrl={readOnly ? undefined : `/catalog/products/${productId}/upload-description-image`}
        />
    );
});

// memo() ไว้เพื่อลด blast radius ของการ re-render ทั้งฟอร์ม (ดูคอมเมนต์ setDataRef
// ด้านบน) — ก่อนหน้านี้ component ตัวนี้ (ตัวหนักที่สุดของทุก attribute field เพราะ
// สร้าง chip หลายตัว + ห่อ SelectControl/RichTextControl ที่ memo ไว้แล้วก็ตาม)
// ถูกเรียกใหม่ทุกครั้งที่พิมพ์ตรงไหนก็ได้ในฟอร์ม เพราะ parent (ProductEdit ทั้งหน้า)
// re-render ทั้งก้อนเสมอ ตอนนี้ props ทุกตัวที่ส่งเข้ามา (attr, value, channelKey,
// localeKey, onValueChange, masterSources, ...) มี identity คงที่แล้วยกเว้นตอนที่
// attribute ตัวนั้นๆ เปลี่ยนค่าจริงๆ — memo() เลยทำให้ field อื่นๆ ที่ไม่เกี่ยวข้อง
// ข้าม re-render ไปได้จริง แทนที่จะ evaluate ทั้ง function body ใหม่ทุกครั้ง
const RenderAttributeInput = memo(function RenderAttributeInput({
    attr,
    value,
    groupKey,
    channelKey,
    localeKey,
    onValueChange,
    label,
    activeLocaleCode,
    activeChannelName,
    canAddOptions,
    sku,
    productId,
    masterSources = [],
    platformContext = null,
}: {
    attr: AttributeItem;
    value: AttributeValue;
    groupKey: string;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, groupKey: string, channelKey: string, localeKey: string, val: AttributeValue) => void;
    label: string;
    activeLocaleCode?: string;
    activeChannelName?: string;
    canAddOptions?: boolean;
    sku: string;
    productId: number;
    masterSources?: MasterSourceOption[];
    platformContext?: 'shopee' | 'lazada' | 'tiktok' | 'woocommerce' | null;
}) {
    const { t } = useTranslation('catalog');
    // ใช้กับทุกประเภทฟิลด์ด้านล่าง ยกเว้น SelectControl / RichTextControl ที่
    // memoize ไว้ (สองตัวนี้เรียก onValueChange ตรงๆ พร้อม
    // attributeId/groupKey/channelKey/localeKey ที่ resolve แล้วแทน) — เพราะสองฟิลด์นี้
    // มีต้นทุนสูงพอที่ closure identity ใหม่ตรงนี้จะทำลายการ memoize ของมันทุกครั้ง
    // ที่ parent re-render (เช่น ตอนสลับ locale)
    const onChange = (val: AttributeValue) => onValueChange(attr.id, groupKey, channelKey, localeKey, val);
    const stringValue = typeof value === 'string' ? value : '';
    const isReadOnly = attr.editable === false;
    const [addOptionOpen, setAddOptionOpen] = useState(false);

    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [galleryError, setGalleryError] = useState<string | null>(null);

    // อัปโหลดไฟล์จริงทันทีตอนเลือก (ผ่าน FioriUploadDropzone + progress bar) แทนที่จะ
    // แนบ File object ไว้เฉยๆ รอ submit ทั้งฟอร์ม — แยก 3 ชุดเพราะ gallery/video/single
    // file เป็นคนละ endpoint ของ rows ที่กำลังอัปโหลดอยู่ ไม่ปนกัน ประกาศไว้นอก
    // if (attr.type === ...) เสมอเพราะกฎของ hooks ต้องเรียกจำนวนเท่ากันทุก render
    const { rows: galleryUploadRows, upload: uploadGalleryFile, removeRow: removeGalleryUploadRow } = useFileUploadRows();
    const { rows: videoUploadRows, upload: uploadVideoFile, removeRow: removeVideoUploadRow } = useFileUploadRows();
    const { rows: singleFileUploadRows, upload: uploadSingleFile, removeRow: removeSingleFileUploadRow } = useFileUploadRows();
    // อัปโหลดหลายไฟล์พร้อมกันของ gallery/video เสร็จไม่พร้อมกันแน่ๆ (คนละ progress
    // bar คนละ XHR) — ต้องต่อท้าย path ที่เพิ่งได้กลับมาจาก ref นี้ (sync ทุก render
    // จาก items ปัจจุบัน) แทนที่จะอ้าง items จาก closure ตอน render ที่เริ่มอัปโหลด
    // ไม่งั้นไฟล์ที่อัปโหลดเสร็จใกล้ๆ กันจะเขียนทับ path ของกันและกัน
    const galleryItemsRef = useRef<Array<string | File>>([]);
    const videoItemsRef = useRef<Array<string | File>>([]);

    useEffect(() => {
        if ((attr.type === 'image' || attr.type === 'file') && value instanceof File) {
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
                    <Tag design="Set2" colorScheme="10" hideStateIcon size="S">
                        {activeLocaleCode ? activeLocaleCode.toUpperCase() : 'LOCALE'}
                    </Tag>
                ) : attr.is_channel_based ? (
                    // แต่ก่อนตรงนี้จะโชว์ "DEFAULT" ตลอด ไม่ว่า channel ไหนจะ
                    // active อยู่จริง — ฟิลด์ที่เป็น channel-based (เช่น price_std)
                    // เลยไม่มีการยืนยันด้วยภาพเลยว่ากำลังแก้ไขร้านไหนอยู่ พอสลับ
                    // channel active แล้วพิมพ์ค่า ก็จะดูเหมือนกันเป๊ะกับตอนพิมพ์ให้
                    // channel ผิด (หรือไม่มี channel เลย) เลยเปลี่ยนมาโชว์ชื่อ
                    // channel จริงแทน จะได้ไม่คลุมเครือแบบเงียบๆ อีกต่อไป
                    <>
                        <Tag design="Set2" colorScheme="10" hideStateIcon size="S">
                            {activeChannelName ? activeChannelName.toUpperCase() : 'CHANNEL'}
                        </Tag>
                        <Icon name="information" className={styles.chipInfoIcon} showTooltip accessibleName={t('channelValueTooltip')} />
                    </>
                ) : (
                    <>
                        <Tag design="Neutral" hideStateIcon size="S">
                            {t('defaultChipLabel')}
                        </Tag>
                        <Icon name="information" className={styles.chipInfoIcon} showTooltip accessibleName={t('defaultFieldChipTooltip')} />
                    </>
                )}
                {isReadOnly && (
                    <Tag design="Set2" colorScheme="10" hideStateIcon size="S">
                        {t('readOnlyChipLabel')}
                    </Tag>
                )}
                {attr.master_source && (
                    <Tag design="Information" hideStateIcon size="S" title={t('masterSourceChipTooltip')} icon={<Icon name="information" />}>
                        {t(masterSources.find((s) => s.value === attr.master_source)?.labelKey ?? attr.master_source)}
                    </Tag>
                )}
                {platformContext && attr.platform_field_mapping && (
                    <Tag
                        design="Positive"
                        hideStateIcon
                        size="S"
                        icon={<Icon name="upload-to-cloud" />}
                        title={t('mappedToPlatformPayloadTooltip', {
                            platform: PLATFORM_DISPLAY_NAMES[platformContext],
                            field: attr.platform_field_mapping.is_custom
                                ? attr.platform_field_mapping.label
                                : t(PAYLOAD_FIELD_LABEL_KEYS[attr.platform_field_mapping.target_field] ?? attr.platform_field_mapping.target_field),
                        })}
                    >
                        {t('mappedToPlatformPayloadChip', { platform: PLATFORM_DISPLAY_NAMES[platformContext] })}
                    </Tag>
                )}
                {attr.lazada_mandatory && (
                    <Tag design="Critical" hideStateIcon size="S" title={t('lazadaRequiredTooltip')}>
                        {t('lazadaRequiredChip')}
                    </Tag>
                )}
                {attr.shopee_mandatory && (
                    <Tag design="Information" hideStateIcon size="S" title={t('shopeeRequiredTooltip')}>
                        {t('shopeeRequiredChip')}
                    </Tag>
                )}
                {attr.tiktok_mandatory && (
                    <Tag design="Positive" hideStateIcon size="S" title={t('tiktokRequiredTooltip')}>
                        {t('tiktokRequiredChip')}
                    </Tag>
                )}
            </>
        );
    };

    // หัวฟิลด์ (label + * + chip ขอบเขต) ที่ทุกประเภทฟิลด์ด้านล่างใช้ร่วมกัน
    const fieldHeader = (
        <div className={styles.fieldHeader}>
            <span className={styles.fieldLabelText}>
                {label} {attr.is_required && <span style={{ color: 'var(--sapNegativeColor)' }}>*</span>}
            </span>
            {renderChips()}
        </div>
    );

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const options = attr.options ?? [];

        return (
            <div>
                {fieldHeader}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <SelectControl
                        attributeId={attr.id}
                        groupKey={groupKey}
                        channelKey={channelKey}
                        localeKey={localeKey}
                        options={options}
                        value={stringValue}
                        disabled={isReadOnly}
                        loading={attr.options_loading}
                        onValueChange={onValueChange}
                    />
                    {canAddOptions && !isReadOnly && (
                        <Button
                            icon="add"
                            tooltip={t('addOptionToFieldTooltip', { label })}
                            accessibleName={t('addOptionToFieldTooltip', { label })}
                            onClick={() => setAddOptionOpen(true)}
                        />
                    )}
                </div>
                {canAddOptions && (
                    <QuickAddOptionDialog
                        open={addOptionOpen}
                        attributeId={attr.id}
                        attributeLabel={label}
                        activeLocaleCode={activeLocaleCode}
                        swatchType={attr.swatch_type}
                        existingOptions={options}
                        masterSourceLabel={
                            attr.master_source
                                ? t(masterSources.find((s) => s.value === attr.master_source)?.labelKey ?? attr.master_source)
                                : undefined
                        }
                        onClose={() => setAddOptionOpen(false)}
                        onCreated={(code) => onChange(code)}
                    />
                )}
            </div>
        );
    }

    if (attr.type === 'textarea') {
        return (
            <div>
                {fieldHeader}
                <RichTextControl
                    attributeId={attr.id}
                    groupKey={groupKey}
                    channelKey={channelKey}
                    localeKey={localeKey}
                    value={stringValue}
                    placeholder={t('enterFieldPlaceholder', { label: label.toLowerCase() })}
                    readOnly={isReadOnly}
                    productId={productId}
                    onValueChange={onValueChange}
                />
            </div>
        );
    }

    if (attr.type === 'price') {
        return (
            <div>
                {fieldHeader}
                <Input
                    style={{ width: '100%' }}
                    disabled={isReadOnly}
                    value={stringValue}
                    onInput={(e) => onChange(e.target.value)}
                    accessibleName={label}
                    icon={<span className={styles.currencyAdornment}>฿</span>}
                />
            </div>
        );
    }

    if (attr.type === 'number') {
        return (
            <div>
                {fieldHeader}
                <Input
                    style={{ width: '100%' }}
                    type="Number"
                    disabled={isReadOnly}
                    value={stringValue}
                    onInput={(e) => onChange(e.target.value)}
                    placeholder={t('enterFieldPlaceholder', { label: label.toLowerCase() })}
                    accessibleName={label}
                />
            </div>
        );
    }

    if (attr.type === 'boolean') {
        return (
            <div>
                {fieldHeader}
                <Switch
                    disabled={isReadOnly}
                    accessibleName={label}
                    checked={stringValue === '1' || stringValue === 'true'}
                    onChange={(e) => onChange(e.target.checked ? '1' : '0')}
                />
            </div>
        );
    }

    if (attr.type === 'checkbox') {
        return (
            <div>
                <div className={styles.fieldHeader}>
                    <CheckBox
                        disabled={isReadOnly}
                        text={attr.is_required ? `${label} *` : label}
                        checked={stringValue === '1' || stringValue === 'true'}
                        onChange={(e) => onChange(e.target.checked ? '1' : '0')}
                    />
                    {renderChips()}
                </div>
            </div>
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return (
            <div>
                {fieldHeader}
                {/* ค่าเก็บเป็นรูปแบบเดียวกับ <input type="date"/"datetime-local"> เดิม */}
                {attr.type === 'date' ? (
                    <DatePicker
                        style={{ width: '100%' }}
                        disabled={isReadOnly}
                        valueFormat="yyyy-MM-dd"
                        value={stringValue}
                        accessibleName={label}
                        onChange={(e) => onChange(e.detail.value)}
                    />
                ) : (
                    <DateTimePicker
                        style={{ width: '100%' }}
                        disabled={isReadOnly}
                        valueFormat="yyyy-MM-dd'T'HH:mm"
                        value={stringValue}
                        accessibleName={label}
                        onChange={(e) => onChange(e.detail.value)}
                    />
                )}
            </div>
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
        galleryItemsRef.current = items;
        const atLimit = items.length >= MAX_GALLERY_IMAGES;

        const removeAt = (index: number) => {
            setGalleryError(null);
            const next = items.filter((_, i) => i !== index);
            galleryItemsRef.current = next;
            onChange(next);
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

        const uploadUrl = `/catalog/products/${productId}/attributes/${attr.id}/upload`;

        const addFiles = (incoming: File[]) => {
            setGalleryError(null);

            const remainingSlots = MAX_GALLERY_IMAGES - items.length;

            if (remainingSlots <= 0) {
                setGalleryError(t('galleryUploadLimitError', { max: MAX_GALLERY_IMAGES }));
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
                    if (skippedByLimit > 0) messages.push(t('galleryLimitAllowedError', { max: MAX_GALLERY_IMAGES }));
                    if (rejectedByDimension > 0) messages.push(t('galleryMinDimensionError', { dim: MIN_GALLERY_DIMENSION }));
                    setGalleryError(messages.join(' — '));
                }

                // อัปโหลดทีละไฟล์แยกจากกัน (ไม่รวมเป็นคำขอเดียว) เพื่อให้แต่ละไฟล์มี
                // progress bar ของตัวเอง — ไฟล์ที่เสร็จก่อนต้องต่อท้าย
                // galleryItemsRef.current (ไม่ใช่ items ตัวแปรใน closure นี้ที่ค้าง
                // ค่าตอน render รอบนี้) ไม่งั้นสองไฟล์ที่เสร็จเกือบพร้อมกันจะเขียน
                // ทับ path ของกันและกัน
                valid.forEach((file) => {
                    uploadGalleryFile(file, uploadUrl, ({ path }) => {
                        const next = [...galleryItemsRef.current, path];
                        galleryItemsRef.current = next;
                        onChange(next);
                    });
                });
            });
        };

        return (
            <div>
                {fieldHeader}
                <div className={styles.caption} style={{ marginTop: 0, marginBottom: '0.25rem' }}>
                    {t('galleryHelperText', { max: MAX_GALLERY_IMAGES, count: items.length, dim: MIN_GALLERY_DIMENSION })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {items.map((item, index) => (
                        <GalleryThumb
                            key={`${index}-${typeof item === 'string' ? item : item.name}`}
                            item={item}
                            disabled={isReadOnly}
                            onRemove={() => removeAt(index)}
                        />
                    ))}
                    {!atLimit && (
                        <FioriUploadDropzoneTile
                            width={200}
                            height={200}
                            accept="image/*"
                            multiple
                            disabled={isReadOnly}
                            label={t('uploadButtonLabel')}
                            hasError={!!galleryError}
                            onFilesSelected={addFiles}
                        />
                    )}
                </div>
                <FileUploadRowsList
                    error={atLimit ? t('galleryMaxReached', { max: MAX_GALLERY_IMAGES }) : (galleryError ?? undefined)}
                    rows={galleryUploadRows}
                    percentLabel={(percent) => t('uploadPercentComplete', { percent })}
                    onRemoveRow={removeGalleryUploadRow}
                />
            </div>
        );
    }

    if (attr.type === 'video') {
        // video รองรับได้หลายไฟล์แบบเดียวกับ gallery แล้ว (array ของ path/File
        // เดียวกัน — ดู parseGalleryItems()/ProductController::update()) เพดาน
        // ตั้งไว้ต่ำกว่า gallery มาก (ดู MAX_VIDEO_COUNT ฝั่ง backend) เพราะไฟล์
        // นึงใหญ่ได้ถึง 100MB
        const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
        const MAX_VIDEO_COUNT = 3;

        const items = parseGalleryItems(value);
        videoItemsRef.current = items;
        const atLimit = items.length >= MAX_VIDEO_COUNT;

        const removeAt = (index: number) => {
            setVideoError(null);
            const next = items.filter((_, i) => i !== index);
            videoItemsRef.current = next;
            onChange(next);
        };

        // เช็ค type/ขนาดแบบ sync ก่อน แล้วค่อย probe duration/resolution แบบ
        // async ทีละไฟล์ (ต้องรอ <video> โหลด metadata) — ทำงานคล้ายการเช็ค
        // getID3 ฝั่ง server ใน ProductController::validateVideoConstraints()
        // เป็นด่านที่เร็ว ไม่ต้อง round-trip ไปเซิร์ฟเวอร์ ช่วยดักไฟล์เสียส่วนใหญ่
        // ได้ก่อนที่จะเริ่ม upload 100MB ด้วยซ้ำ ส่วนการเช็คฝั่ง server คือด่านที่
        // request ที่ยิงตรงไปที่ endpoint เอง (ข้าม UI นี้ไปเลย) จะผ่านไปไม่ได้
        const probeVideo = (file: File) =>
            new Promise<{ file: File; ok: boolean; error?: string }>((resolve) => {
                if (file.type !== 'video/mp4') {
                    resolve({ file, ok: false, error: t('onlyMp4VideosSupported') });
                    return;
                }
                if (file.size > MAX_VIDEO_BYTES) {
                    resolve({ file, ok: false, error: t('videoTooLargeError') });
                    return;
                }

                const probeUrl = URL.createObjectURL(file);
                const probe = document.createElement('video');
                probe.preload = 'metadata';
                probe.onloadedmetadata = () => {
                    URL.revokeObjectURL(probeUrl);
                    if (probe.duration > 300) {
                        resolve({ file, ok: false, error: t('videoTooLongError') });
                        return;
                    }
                    if (probe.videoWidth < 480 || probe.videoHeight < 480) {
                        resolve({ file, ok: false, error: t('videoTooSmallError') });
                        return;
                    }
                    resolve({ file, ok: true });
                };
                probe.onerror = () => {
                    URL.revokeObjectURL(probeUrl);
                    resolve({ file, ok: false, error: t('videoUnreadableError') });
                };
                probe.src = probeUrl;
            });

        const uploadUrl = `/catalog/products/${productId}/attributes/${attr.id}/upload`;

        const addFiles = (incoming: File[]) => {
            setVideoError(null);

            const remainingSlots = MAX_VIDEO_COUNT - items.length;

            if (remainingSlots <= 0) {
                setVideoError(t('videoUploadLimitError', { max: MAX_VIDEO_COUNT }));
                return;
            }

            const accepted = incoming.slice(0, remainingSlots);
            const skippedByLimit = incoming.length - accepted.length;

            Promise.all(accepted.map(probeVideo)).then((results) => {
                const valid = results.filter((r) => r.ok).map((r) => r.file);
                const firstError = results.find((r) => !r.ok)?.error;

                if (firstError || skippedByLimit > 0) {
                    const messages = [];
                    if (skippedByLimit > 0) messages.push(t('videoLimitAllowedError', { max: MAX_VIDEO_COUNT }));
                    if (firstError) messages.push(firstError);
                    setVideoError(messages.join(' — '));
                }

                valid.forEach((file) => {
                    uploadVideoFile(file, uploadUrl, ({ path }) => {
                        const next = [...videoItemsRef.current, path];
                        videoItemsRef.current = next;
                        onChange(next);
                    });
                });
            });
        };

        return (
            <div>
                {fieldHeader}
                <div className={styles.caption} style={{ marginTop: 0, marginBottom: '0.25rem' }}>
                    {t('videoHelperText', { max: MAX_VIDEO_COUNT, count: items.length })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    {items.map((item, index) => (
                        <VideoThumb
                            key={`${index}-${typeof item === 'string' ? item : item.name}`}
                            item={item}
                            disabled={isReadOnly}
                            onRemove={() => removeAt(index)}
                        />
                    ))}
                    {!atLimit && (
                        <FioriUploadDropzoneTile
                            width={200}
                            height={200}
                            accept="video/mp4"
                            multiple
                            disabled={isReadOnly}
                            label={t('uploadButtonLabel')}
                            hasError={!!videoError}
                            onFilesSelected={addFiles}
                        />
                    )}
                </div>
                <FileUploadRowsList
                    error={atLimit ? t('videoMaxReached', { max: MAX_VIDEO_COUNT }) : (videoError ?? undefined)}
                    rows={videoUploadRows}
                    percentLabel={(percent) => t('uploadPercentComplete', { percent })}
                    onRemoveRow={removeVideoUploadRow}
                />
            </div>
        );
    }

    if (attr.type === 'image' || attr.type === 'file') {
        const isImage = attr.type === 'image';

        const selectedName = value instanceof File ? value.name : '';

        let existingLabel = '';
        let existingImageUrl = '';
        let existingFileUrl = '';
        if (!selectedName && stringValue) {
            existingLabel = stringValue.split('/').pop() || stringValue;
            const resolvedUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/') ? stringValue : `/storage/${stringValue}`;
            if (isImage) {
                existingImageUrl = resolvedUrl;
            } else {
                existingFileUrl = resolvedUrl;
            }
        }

        const previewSrc = filePreviewUrl || existingImageUrl;

        // แสดง FioriPdfViewer ให้เฉพาะ attribute แบบ 'file' (ไม่ใช่ 'image') ที่
        // ไฟล์ปัจจุบัน (เพิ่งเลือกใหม่ยังไม่ได้ save หรือของเดิมที่ save ไว้แล้ว)
        // เป็น .pdf — attribute แบบ 'file' เป็น field ทั่วไปที่รับได้ทุกชนิดไฟล์
        // (ดู AttributeValueFormatter::format()) เลยต้องเช็คนามสกุล/ชนิดไฟล์ก่อน
        // จะ preview เป็น PDF ไม่ใช่ preview ทุกไฟล์แบบ image
        const selectedIsPdf = value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
        const existingIsPdf = !selectedName && existingLabel.toLowerCase().endsWith('.pdf');
        const pdfPreviewSrc = !isImage && (selectedIsPdf || existingIsPdf) ? filePreviewUrl || existingFileUrl : '';

        const uploadUrl = `/catalog/products/${productId}/attributes/${attr.id}/upload`;
        // value เป็น string ทันทีหลังอัปโหลดเสร็จเสมอแล้ว (ไม่ใช่ File object ที่รอ submit
        // เหมือนก่อนหน้านี้อีกต่อไป) — selectedName เลยไม่มีทางไม่ว่างจริง แต่ยังปล่อยให้
        // ผ่าน existingLabel ทางเดียวกันนี้ ทั้งไฟล์ที่เพิ่งอัปโหลดรอบนี้และไฟล์เดิมที่ save
        // ไว้แล้ว — ปุ่มลบต้องโชว์ทั้งสองกรณีเหมือนกัน (เดิมเคยจำกัดไว้แค่ไฟล์ที่เพิ่ง
        // อัปโหลดรอบนี้เท่านั้นผ่าน justUploadedPath ทำให้ไฟล์เดิมที่ save ไว้แล้วลบไม่ได้
        // เลยเอาเงื่อนไขนั้นออก — เงื่อนไข isImage && previewSrc / currentLabel ที่ครอบ
        // ปุ่มนี้อยู่แล้วก็การันตีว่ามีไฟล์ให้ลบจริงอยู่แล้วในตัว)
        const currentLabel = existingLabel ? t('currentFileLabel', { name: existingLabel }) : '';

        return (
            <div>
                {fieldHeader}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {isImage && previewSrc && (
                        <div style={{ position: 'relative', width: 200, height: 200 }}>
                            <img
                                src={previewSrc}
                                alt={label}
                                onClick={() => setLightboxOpen(true)}
                                className={`${styles.thumbMedia} ${styles.thumbClickable}`}
                                style={{ width: 200, height: 200, objectFit: 'cover' }}
                            />
                            {!isReadOnly && (
                                <button type="button" onClick={() => onChange('')} aria-label="remove file" className={styles.thumbRemove}>
                                    <Icon name="decline" style={{ width: 10, height: 10 }} />
                                </button>
                            )}
                        </div>
                    )}
                    {!isImage && pdfPreviewSrc && (
                        <div style={{ width: 400, maxWidth: '100%', flexShrink: 0 }}>
                            <FioriPdfViewer
                                src={pdfPreviewSrc}
                                title={selectedName || existingLabel}
                                height={150}
                                onClose={!isReadOnly ? () => onChange('') : undefined}
                            />
                        </div>
                    )}
                    {!isImage && !pdfPreviewSrc && currentLabel && (
                        <div className={styles.fileChip}>
                            <span className={styles.fileChipLabel}>{currentLabel}</span>
                            {!isReadOnly && (
                                <Button
                                    design="Transparent"
                                    icon="decline"
                                    className={styles.negativeIcon}
                                    onClick={() => onChange('')}
                                    accessibleName="remove file"
                                />
                            )}
                        </div>
                    )}
                    <FioriUploadDropzoneTile
                        width={200}
                        height={200}
                        accept={isImage ? 'image/*' : undefined}
                        disabled={isReadOnly}
                        label={t('uploadButtonLabel')}
                        onFilesSelected={(files) => {
                            const file = files[0];
                            if (!file) return;
                            uploadSingleFile(file, uploadUrl, ({ path }) => {
                                onChange(path);
                            });
                        }}
                    />
                </div>
                <FileUploadRowsList
                    rows={singleFileUploadRows}
                    percentLabel={(percent) => t('uploadPercentComplete', { percent })}
                    onRemoveRow={removeSingleFileUploadRow}
                />
                {isImage && previewSrc && (
                    <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} style={{ padding: 0 }} className={styles.lightbox}>
                        <img src={previewSrc} alt={label} style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }} />
                    </Dialog>
                )}
            </div>
        );
    }

    return (
        <div>
            {fieldHeader}
            <Input
                style={{ width: '100%' }}
                disabled={isReadOnly}
                value={stringValue}
                onInput={(e) => onChange(e.target.value)}
                placeholder={attr.code === 'pid' || attr.code === 'pname' ? sku : t('enterFieldPlaceholder', { label: label.toLowerCase() })}
                accessibleName={label}
            />
        </div>
    );
});
