import { FioriPdfViewer } from '@/components/fiori-pdf-viewer';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { HistoryPanel } from '@/components/history-panel';
import { TimelinePanel } from '@/components/timeline-panel';
import { useLocale } from '@/hooks/use-locale';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { localizedLabel, type Translation } from '@/lib/localized-label';
import { isProductStatus, PRODUCT_STATUS_LABEL_KEYS, PRODUCT_STATUS_TONES } from '@/lib/product-status';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action-settings.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/popup-window.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import {
    Avatar,
    Button,
    Form,
    FormItem,
    Label,
    Menu,
    MenuItem,
    MenuItemGroup,
    ObjectPage,
    ObjectPageHeader,
    ObjectPageSection,
    type ObjectPageSectionPropTypes,
    ObjectPageTitle,
    Tag,
    Text,
    Title,
    Toolbar,
    ToolbarButton,
} from '@ui5/webcomponents-react';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './show.module.css';

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
    return <span className={styles.empty}>(ไม่ได้กรอก)</span>;
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
        return <span className={styles.bodyText}>{match ? optionLabel(match) : value}</span>;
    }

    if (attr.type === 'textarea') {
        // Rich text is stored as HTML (see edit.tsx's RichTextControl) — render
        // it as-is so formatting (bold/lists/etc.) survives, same as what the
        // editor showed while it was being entered.
        return <div className={styles.richText} dangerouslySetInnerHTML={{ __html: value }} />;
    }

    if (attr.type === 'boolean' || attr.type === 'checkbox') {
        const checked = value === '1' || value === 'true';
        return (
            <Tag design={checked ? 'Positive' : 'Neutral'} hideStateIcon>
                {checked ? 'ใช่' : 'ไม่ใช่'}
            </Tag>
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return <span className={styles.bodyText}>{formatLocalDateTime(value) === value ? value : formatLocalDateTime(value)}</span>;
    }

    if (attr.type === 'gallery') {
        const paths = parseGalleryPaths(value);
        if (paths.length === 0) return <EmptyValue />;

        return (
            <div className={styles.wrapRow} style={{ gap: '0.5rem' }}>
                {paths.map((path, i) => (
                    <img
                        key={i}
                        src={resolveStorageUrl(path)}
                        alt={`${attr.name} ${i + 1}`}
                        className={styles.thumb}
                        style={{ width: 56, height: 56 }}
                    />
                ))}
            </div>
        );
    }

    if (attr.type === 'video') {
        const paths = parseVideoPaths(value);
        if (paths.length === 0) return <EmptyValue />;

        return (
            <div className={styles.wrapRow} style={{ gap: '0.75rem' }}>
                {paths.map((path, i) => (
                    <video key={i} controls src={resolveStorageUrl(path)} style={{ maxWidth: 320, maxHeight: 200, borderRadius: 4 }} />
                ))}
            </div>
        );
    }

    if (attr.type === 'image') {
        return <img src={resolveStorageUrl(value)} alt={attr.name} className={styles.thumb} style={{ width: 72, height: 72 }} />;
    }

    if (attr.type === 'file') {
        const filename = value.split('/').pop() || value;

        // attribute แบบ 'file' รับได้ทุกชนิดไฟล์ (ดู AttributeValueFormatter::format())
        // — preview เป็น FioriPdfViewer ให้เฉพาะไฟล์ที่เป็น .pdf จริงๆ ไฟล์ชนิดอื่น
        // ยังคงเป็นลิงก์เปิดแท็บใหม่ธรรมดาเหมือนเดิม
        if (filename.toLowerCase().endsWith('.pdf')) {
            return (
                <div style={{ maxWidth: 480 }}>
                    <FioriPdfViewer src={resolveStorageUrl(value)} title={filename} height={320} />
                </div>
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

    return <span className={styles.bodyText}>{value}</span>;
}

/**
 * แอตทริบิวต์ที่ค่ายาว/เป็นสื่อ — แยกไปอยู่ฟอร์มคอลัมน์เดียวใต้ฟอร์มหลัก เพราะ UI5 Form ที่ไม่มี
 * FormGroup จัดวางด้วย CSS column-count และไม่สน FormItem.columnSpan เลย (ใช้ได้เฉพาะกับ FormGroup)
 * ถ้าอยู่ฟอร์มเดียวกัน rich text / gallery / PDF จะถูกอัดอยู่ในคอลัมน์แคบๆ คอลัมน์เดียว
 */
const WIDE_ATTRIBUTE_TYPES = new Set(['textarea', 'gallery', 'video', 'file']);

// ฟอร์มแบบแสดงผล (Display) ของ Fiori: ป้ายอยู่เหนือค่า, 2–3 คอลัมน์บนจอกว้าง
const FORM_LAYOUT = 'S1 M2 L2 XL3';
const WIDE_FORM_LAYOUT = 'S1 M1 L1 XL1';
const FORM_LABEL_SPAN = 'S12 M12 L12 XL12';

const HISTORY_SECTION_ID = 'section-history';

/** "ป้าย + ค่า" หนึ่งชุดในพื้นที่ header ของ Object Page (Fiori: header facet แบบ key-value) */
function HeaderFact({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <div className={styles.headerFact}>
            <Label showColon>{label}</Label>
            <div>{children}</div>
        </div>
    );
}

/** FormItem แบบอ่านอย่างเดียว — ป้ายเป็น UI5 Label, ค่าเป็นอะไรก็ได้ */
function DisplayItem({ label, children }: { label: string; children: ReactNode }) {
    return <FormItem labelContent={<Label showColon>{label}</Label>}>{children}</FormItem>;
}

/**
 * หน้าดูสินค้า (อ่านอย่างเดียว) ตาม floorplan "Object Page" ของ SAP Fiori:
 *  - Title: ชื่อ/SKU + ปุ่มคำสั่ง (แก้ไข · ภาษา · ดูหน้าร้าน)
 *  - Header: รูปสินค้า + key facts (การเผยแพร่ สถานะ ประเภท หมวดหมู่ วันที่) ยุบเองตอนเลื่อน
 *  - Anchor bar: 1 section ต่อกลุ่มแอตทริบิวต์ + ช่องทางขาย + ประวัติ (ObjectPage ทำ scroll-spy ให้เอง)
 *  - เนื้อหาแต่ละกลุ่มเป็น UI5 Form แบบ Display
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
    const [localeMenuOpener, setLocaleMenuOpener] = useState<HTMLElement | null>(null);
    // HistoryPanel ดึงข้อมูลทันทีที่ mount — รอให้ผู้ใช้ไปถึง section นั้นก่อนค่อยโหลด
    const [historyRequested, setHistoryRequested] = useState(false);

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
        // ภาษาที่เลือก → ภาษาไทย (th — ภาษาหลัก) → 'default' (ข้อมูลเก่า) ตามกติกา LocaleFallback ฝั่ง PHP
        const baseLocaleKey = String(locales.find((l) => l.code === 'th')?.id ?? '');
        return scope?.[localeKey] ?? (baseLocaleKey ? scope?.[baseLocaleKey] : undefined) ?? scope?.['default'] ?? '';
    };

    const groupKeyOf = (group: GroupWithAttributes) => (group.id === 0 ? 'ungrouped' : String(group.id));

    // รูปบน header: แอตทริบิวต์ image ตัวแรกที่มีค่า ไม่มีก็ใช้รูปแรกของ gallery
    const headerImage = (() => {
        let galleryFallback: string | null = null;
        for (const group of assignedGroups) {
            for (const attr of group.attributes) {
                const value = getValue(attr, groupKeyOf(group));
                if (!value) continue;
                if (attr.type === 'image') return resolveStorageUrl(value);
                if (attr.type === 'gallery' && !galleryFallback) {
                    const first = parseGalleryPaths(value)[0];
                    if (first) galleryFallback = resolveStorageUrl(first);
                }
            }
        }
        return galleryFallback;
    })();

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
    const productTypeLabel = productTypeCode ? (productTypeOption ? optionLabel(productTypeOption) : productTypeCode) : '';

    const title = t('viewProductHeading', { sku: product.sku });
    const publishingStatus = (
        <FioriStatus label={product.enabled ? t('published') : t('unpublished')} tone={product.enabled ? 'success' : 'neutral'} />
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />
            <ObjectPage
                className={styles.objectPage}
                image={
                    headerImage ? (
                        <Avatar size="L" shape="Square">
                            <img src={headerImage} alt={product.sku} />
                        </Avatar>
                    ) : (
                        <Avatar size="L" shape="Square" icon="product" colorScheme="Placeholder" />
                    )
                }
                onSelectedSectionChange={(e) => {
                    if (e.detail.selectedSectionId === HISTORY_SECTION_ID) setHistoryRequested(true);
                }}
                titleArea={
                    <ObjectPageTitle
                        header={
                            <Title level="H2" size="H3" wrappingType="Normal">
                                {title}
                            </Title>
                        }
                        snappedHeader={
                            <Title level="H2" size="H5" wrappingType="Normal">
                                {title}
                            </Title>
                        }
                        subHeader={productTypeLabel ? <Text>{productTypeLabel}</Text> : undefined}
                        snappedContent={publishingStatus}
                        navigationBar={
                            <Toolbar design="Transparent">
                                <ToolbarButton
                                    design="Transparent"
                                    icon="nav-back"
                                    tooltip={t('back')}
                                    accessibleName={t('back')}
                                    onClick={() => router.visit('/catalog/products')}
                                />
                            </Toolbar>
                        }
                        actionsBar={
                            <Toolbar design="Transparent">
                                <ToolbarButton
                                    design="Emphasized"
                                    icon="edit"
                                    text={t('editAction')}
                                    onClick={() => router.visit(`/catalog/products/${product.id}/edit`)}
                                />
                                <ToolbarButton
                                    design="Transparent"
                                    icon="action-settings"
                                    endIcon="slim-arrow-down"
                                    text={activeLocale ? activeLocale.display_name || activeLocale.code : ''}
                                    tooltip={t('editingLocaleHelp')}
                                    onClick={(e) => {
                                        // UI5's typings resolve ToolbarButton's click detail to `never`;
                                        // at runtime it is ToolbarItemEventDetail ({ targetRef }).
                                        const target = (e.detail as unknown as { targetRef: HTMLElement }).targetRef;
                                        setLocaleMenuOpener((prev) => (prev ? null : target));
                                    }}
                                />
                                <ToolbarButton
                                    design="Transparent"
                                    icon="popup-window"
                                    text={t('previewOnStorefront')}
                                    onClick={() => window.open(`/products/${product.id}`, '_blank', 'noreferrer')}
                                />
                            </Toolbar>
                        }
                    />
                }
                headerArea={
                    <ObjectPageHeader>
                        <div className={styles.headerFacts}>
                            <HeaderFact label={t('publishing')}>{publishingStatus}</HeaderFact>
                            <HeaderFact label={t('productStatus')}>
                                {isProductStatus(product.status) ? (
                                    <FioriStatus label={t(PRODUCT_STATUS_LABEL_KEYS[product.status])} tone={PRODUCT_STATUS_TONES[product.status]} />
                                ) : (
                                    <EmptyValue />
                                )}
                            </HeaderFact>
                            <HeaderFact label={t('showOnHome')}>
                                <FioriStatus
                                    label={product.show_on_home ? t('showOnHomeYes') : t('showOnHomeNo')}
                                    tone={product.show_on_home ? 'success' : 'neutral'}
                                />
                            </HeaderFact>
                            {productTypeAttribute && (
                                <HeaderFact label={t('masterProductTypeFieldLabel')}>
                                    {productTypeLabel ? <Text>{productTypeLabel}</Text> : <EmptyValue />}
                                </HeaderFact>
                            )}
                            {/* หมวดหมู่ / หมวดหมู่ย่อย / กลุ่มสินค้า — ค่าเก็บที่ 'ungrouped'/'default' เสมอ */}
                            {masterCategoryAttributes.map((attr) => (
                                <HeaderFact key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                    <RenderAttributeValue attr={attr} value={getValue(attr)} />
                                </HeaderFact>
                            ))}
                            <HeaderFact label={t('updatedAt')}>
                                <Text>{formatLocalDateTime(product.updated_at)}</Text>
                            </HeaderFact>
                            <HeaderFact label={t('createdAt')}>
                                <Text>{formatLocalDateTime(product.created_at)}</Text>
                            </HeaderFact>
                        </div>
                    </ObjectPageHeader>
                }
            >
                {[
                    ...assignedGroups.map((group) => {
                        const isGeneral = group.code.toLowerCase() === 'general';
                        const isSales = group.code.toLowerCase() === 'pricing_packaging';
                        const groupKey = groupKeyOf(group);
                        const families = group.families ?? [];
                        const isEmpty = group.attributes.length === 0 && !isGeneral && !(isSales && variants.length > 0);
                        const simpleAttributes = group.attributes.filter((attr) => !WIDE_ATTRIBUTE_TYPES.has(attr.type));
                        const wideAttributes = group.attributes.filter((attr) => WIDE_ATTRIBUTE_TYPES.has(attr.type));
                        const renderItem = (attr: AttributeItem) => (
                            <DisplayItem key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                <RenderAttributeValue attr={attr} value={getValue(attr, groupKey)} />
                            </DisplayItem>
                        );

                        return (
                            <ObjectPageSection key={group.id} id={`group-${group.id}`} titleText={localizedLabel(group, activeLocaleId)}>
                                {/* ตระกูลที่ฟิลด์ในกลุ่มนี้มาจาก — แบบเดียวกับหน้าแก้ไข */}
                                {families.length > 0 && (
                                    <div className={styles.familyRow}>
                                        {families.map((family) => (
                                            <Tag key={family.id} design="Information" hideStateIcon>
                                                {family.name ?? family.code}
                                            </Tag>
                                        ))}
                                    </div>
                                )}

                                {isEmpty && <span className={styles.muted}>{t('noAttributesInGroup')}</span>}

                                {(isGeneral || simpleAttributes.length > 0) && (
                                    <Form layout={FORM_LAYOUT} labelSpan={FORM_LABEL_SPAN}>
                                        {isGeneral && (
                                            <DisplayItem label={t('sku')}>
                                                <Text>{product.sku}</Text>
                                            </DisplayItem>
                                        )}
                                        {simpleAttributes.map(renderItem)}
                                    </Form>
                                )}

                                {wideAttributes.length > 0 && (
                                    <Form layout={WIDE_FORM_LAYOUT} labelSpan={FORM_LABEL_SPAN}>
                                        {wideAttributes.map(renderItem)}
                                    </Form>
                                )}

                                {/* ไม่ใช้ ObjectPageSubSection: ถ้า section มี subsection ปนกับเนื้อหาอื่น
                                    แท็บของ section จะกลายเป็น dropdown ที่มีแค่ "ตัวเลือกสินค้า" ตัวเดียว */}
                                {isSales && variants.length > 0 && (
                                    <div className={styles.variants}>
                                        <Title level="H4" size="H5" className={styles.variantsTitle}>
                                            {t('variantsTitle')}
                                        </Title>
                                        <FioriResponsiveTable
                                            variant="plain"
                                            size="small"
                                            columns={variantColumns}
                                            rows={variants.map((v, index) => ({ v, index }))}
                                            getRowKey={(row) => row.v.id ?? `new-${row.index}`}
                                        />
                                    </div>
                                )}
                            </ObjectPageSection>
                        );
                    }),

                    // ช่องทางขาย — มีสิทธิ์แยกของตัวเอง (sales_channels) ดู routes/catalog.php
                    canViewSalesChannels && (
                        <ObjectPageSection key="sales-channels" id="section-sales-channels" titleText={t('salesChannels')}>
                            {publishedChannels.length > 0 ? (
                                <Form layout={FORM_LAYOUT} labelSpan={FORM_LABEL_SPAN}>
                                    {publishedChannels.map((group) => (
                                        <DisplayItem key={group.platform} label={group.platform}>
                                            <div className={styles.wrapRow}>
                                                {group.channels.map((ch) => (
                                                    <Tag key={ch.id} design={ch.is_live ? 'Positive' : 'Neutral'} hideStateIcon>
                                                        {ch.is_live ? `${ch.name || ch.code} · ${t('liveLabel')}` : ch.name || ch.code}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </DisplayItem>
                                    ))}
                                </Form>
                            ) : (
                                <span className={styles.muted}>{t('noPublishedChannels')}</span>
                            )}
                        </ObjectPageSection>
                    ),

                    canViewHistory && (
                        <ObjectPageSection key="timeline" id="section-timeline" titleText={t('timelineTitle')}>
                            <div className={styles.timeline}>
                                <TimelinePanel timelineUrl={`/catalog/products/${product.id}/timeline`} />
                            </div>
                        </ObjectPageSection>
                    ),

                    canViewHistory && (
                        <ObjectPageSection key="history" id={HISTORY_SECTION_ID} titleText={t('historyTab')}>
                            {historyRequested ? (
                                <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />
                            ) : (
                                <Button design="Transparent" onClick={() => setHistoryRequested(true)}>
                                    {t('historyTab')}
                                </Button>
                            )}
                        </ObjectPageSection>
                    ),
                    // ObjectPage นับจำนวน section ด้วย Children.count ซึ่งนับ `false` ด้วย —
                    // ต้องกรองทิ้ง ไม่งั้นหน้าที่มี section เดียวจะได้แถบแท็บเกินมา
                ].filter((section): section is ReactElement<ObjectPageSectionPropTypes> => section !== false)}
            </ObjectPage>

            <Menu
                opener={localeMenuOpener}
                open={localeMenuOpener !== null}
                onClose={() => setLocaleMenuOpener(null)}
                onItemClick={(e) => {
                    const code = e.detail.item.dataset.code;
                    setLocaleMenuOpener(null);
                    if (code) setLocale(code);
                }}
            >
                <MenuItemGroup checkMode="Single">
                    {locales.map((loc) => (
                        <MenuItem key={loc.id} data-code={loc.code} text={loc.display_name || loc.code} checked={loc.id === activeLocaleId} />
                    ))}
                </MenuItemGroup>
            </Menu>
        </AppLayout>
    );
}
