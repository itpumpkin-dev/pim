import { FioriFormGroup } from '@/components/fiori-form';
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
import '@ui5/webcomponents-icons/dist/calendar.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/popup-window.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Button, Icon, Menu, MenuItem, MenuItemGroup, Tab, TabContainer, Tag, Title } from '@ui5/webcomponents-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './show.module.css';

const LOCALE_BUTTON_ID = 'product-show-locale-button';

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

// ระยะเว้นด้านบนของแต่ละ section ตอนเลื่อนไปหา — เท่ากับหน้าแก้ไข (edit.tsx)
const GROUP_SECTION_SCROLL_MARGIN = 80;

/** แถว "ป้าย + ค่า" ของแผงข้อมูลสินค้าด้านขวา */
function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <div>
            <span className={styles.infoLabel}>{label}</span>
            {children}
        </div>
    );
}

/** วันที่/เวลา + ไอคอนปฏิทิน (แถว "อัปเดตล่าสุด" / "สร้างเมื่อ") */
function DateValue({ value }: { value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="calendar" style={{ width: '1rem', height: '1rem', color: 'var(--sapContent_LabelColor)' }} />
            <span className={styles.bodyText}>{formatLocalDateTime(value)}</span>
        </div>
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
    const [localeMenuOpen, setLocaleMenuOpen] = useState(false);

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
    const groupSectionRefs = useRef<(HTMLElement | null)[]>([]);
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
            <div className={styles.page}>
                {/* แถบแท็บบนสุด */}
                <div className={`${styles.topTabs} ${styles.gutter}`}>
                    <TabContainer collapsed onTabSelect={(e) => setTabIndex(e.detail.tabIndex)}>
                        <Tab text={t('generalTitle')} selected={tabIndex === 0} />
                        {canViewHistory && <Tab text={t('historyTab')} selected={tabIndex === 1} />}
                    </TabContainer>
                </div>

                {/* หัวเรื่อง + ปุ่ม — โครงเดียวกับหน้าแก้ไข */}
                <div className={`${styles.header} ${styles.gutter}`}>
                    <div className={styles.headerTitle}>
                        <Button
                            design="Transparent"
                            icon="nav-back"
                            tooltip={t('back')}
                            accessibleName={t('back')}
                            onClick={() => router.visit('/catalog/products')}
                        />
                        <Title level="H3" wrappingType="Normal">
                            {t('viewProductHeading', { sku: product.sku })}
                        </Title>
                    </div>

                    <div className={styles.headerActions}>
                        {/* ภาษาที่แสดง — ปุ่มขนาดเดียวกับปุ่มอื่นในแถว (เหมือนปุ่ม "ภาษา · ช่องทาง" ของหน้าแก้ไข) */}
                        <Button
                            id={LOCALE_BUTTON_ID}
                            icon="action-settings"
                            endIcon="slim-arrow-down"
                            tooltip={t('editingLocaleHelp')}
                            onClick={() => setLocaleMenuOpen((prev) => !prev)}
                        >
                            {activeLocale ? activeLocale.display_name || activeLocale.code : ''}
                        </Button>
                        <Menu
                            opener={LOCALE_BUTTON_ID}
                            open={localeMenuOpen}
                            onClose={() => setLocaleMenuOpen(false)}
                            onItemClick={(e) => {
                                const code = e.detail.item.dataset.code;
                                setLocaleMenuOpen(false);
                                if (code) setLocale(code);
                            }}
                        >
                            <MenuItemGroup checkMode="Single">
                                {locales.map((loc) => (
                                    <MenuItem
                                        key={loc.id}
                                        data-code={loc.code}
                                        text={loc.display_name || loc.code}
                                        checked={loc.id === activeLocaleId}
                                    />
                                ))}
                            </MenuItemGroup>
                        </Menu>

                        <Button
                            icon="popup-window"
                            tooltip={t('previewOnStorefront')}
                            accessibleName={t('previewOnStorefront')}
                            onClick={() => window.open(`/products/${product.id}`, '_blank', 'noreferrer')}
                        />

                        <Button design="Emphasized" icon="edit" onClick={() => router.visit(`/catalog/products/${product.id}/edit`)}>
                            {t('editAction')}
                        </Button>
                    </div>
                </div>

                <div ref={scrollBodyRef} className={styles.scrollBody}>
                    {tabIndex === 0 && (
                        <div className={styles.gutter}>
                            {/* แถบแท็บกลุ่มแอตทริบิวต์ — ติดด้านบนตอนเลื่อน กดแล้วเลื่อนไปที่กลุ่มนั้น */}
                            {assignedGroups.length > 0 && (
                                <div ref={groupTabBarRef} className={styles.groupTabBar}>
                                    <TabContainer collapsed onTabSelect={(e) => scrollToGroup(e.detail.tabIndex)}>
                                        {assignedGroups.map((group, idx) => (
                                            <Tab key={group.id} text={localizedLabel(group, activeLocaleId)} selected={idx === groupTabIndex} />
                                        ))}
                                    </TabContainer>
                                </div>
                            )}

                            <div className={styles.columns}>
                                <div className={styles.stack}>
                                    {assignedGroups.map((group, idx) => {
                                        const isGeneral = group.code.toLowerCase() === 'general';
                                        const isSales = group.code.toLowerCase() === 'pricing_packaging';
                                        const groupKey = group.id === 0 ? 'ungrouped' : String(group.id);
                                        const isGroupCollapsed = Boolean(collapsedGroupIds[group.id]);
                                        const groupLabel = localizedLabel(group, activeLocaleId);

                                        return (
                                            <section
                                                key={group.id}
                                                ref={(el) => {
                                                    groupSectionRefs.current[idx] = el;
                                                }}
                                                className={styles.card}
                                                style={{ scrollMarginTop: `${GROUP_SECTION_SCROLL_MARGIN}px` }}
                                            >
                                                <div
                                                    className={
                                                        isGroupCollapsed ? styles.groupHeader : `${styles.groupHeader} ${styles.groupHeaderOpen}`
                                                    }
                                                    onClick={() => toggleGroupCollapse(group.id)}
                                                >
                                                    <Button
                                                        design="Transparent"
                                                        icon={isGroupCollapsed ? 'slim-arrow-right' : 'slim-arrow-down'}
                                                        accessibleName={groupLabel}
                                                    />
                                                    <Title level="H5" wrappingType="Normal" style={{ flex: 1 }}>
                                                        {groupLabel}
                                                    </Title>
                                                    {/* ตระกูลที่ฟิลด์ในกลุ่มนี้มาจาก — แบบเดียวกับหน้าแก้ไข */}
                                                    {(group.families ?? []).map((family) => (
                                                        <Tag key={family.id} design="Information" hideStateIcon>
                                                            {family.name ?? family.code}
                                                        </Tag>
                                                    ))}
                                                </div>
                                                {!isGroupCollapsed && (
                                                    <div className={styles.stack} style={{ gap: '1.25rem' }}>
                                                        {isGeneral && (
                                                            <InfoRow label={t('sku')}>
                                                                <span className={styles.bodyText}>{product.sku}</span>
                                                            </InfoRow>
                                                        )}

                                                        {group.attributes.length === 0 && !isGeneral && !(isSales && variants.length > 0) && (
                                                            <span className={styles.muted}>{t('noAttributesInGroup')}</span>
                                                        )}

                                                        {group.attributes.map((attr) => (
                                                            <InfoRow key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                                                <RenderAttributeValue attr={attr} value={getValue(attr, groupKey)} />
                                                            </InfoRow>
                                                        ))}

                                                        {isSales && variants.length > 0 && (
                                                            <div>
                                                                <Title level="H6" style={{ marginBottom: '0.5rem' }}>
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
                                                    </div>
                                                )}
                                            </section>
                                        );
                                    })}
                                </div>

                                <div className={styles.stack}>
                                    {/* ข้อมูลสินค้า — ชุดเดียวกับแผงของหน้าแก้ไข แบบอ่านอย่างเดียว */}
                                    <FioriFormGroup title={t('productInfo')}>
                                        <InfoRow label={t('publishing')}>
                                            <FioriStatus
                                                label={product.enabled ? t('published') : t('unpublished')}
                                                tone={product.enabled ? 'success' : 'neutral'}
                                            />
                                        </InfoRow>
                                        <InfoRow label={t('showOnHome')}>
                                            <FioriStatus
                                                label={product.show_on_home ? t('showOnHomeYes') : t('showOnHomeNo')}
                                                tone={product.show_on_home ? 'success' : 'neutral'}
                                            />
                                        </InfoRow>
                                        <InfoRow label={t('productStatus')}>
                                            {isProductStatus(product.status) ? (
                                                <FioriStatus
                                                    label={t(PRODUCT_STATUS_LABEL_KEYS[product.status])}
                                                    tone={PRODUCT_STATUS_TONES[product.status]}
                                                />
                                            ) : (
                                                <EmptyValue />
                                            )}
                                        </InfoRow>
                                        {productTypeAttribute && (
                                            <InfoRow label={t('masterProductTypeFieldLabel')}>
                                                {productTypeCode ? (
                                                    <span className={styles.bodyText}>
                                                        {productTypeOption ? optionLabel(productTypeOption) : productTypeCode}
                                                    </span>
                                                ) : (
                                                    <EmptyValue />
                                                )}
                                            </InfoRow>
                                        )}
                                        <InfoRow label={t('updatedAt')}>
                                            <DateValue value={product.updated_at} />
                                        </InfoRow>
                                        <InfoRow label={t('createdAt')}>
                                            <DateValue value={product.created_at} />
                                        </InfoRow>
                                    </FioriFormGroup>

                                    {/* ช่องทางขาย — มีสิทธิ์แยกของตัวเอง (sales_channels) ดู routes/catalog.php */}
                                    {canViewSalesChannels && (
                                        <section className={styles.card}>
                                            <Title level="H5" wrappingType="Normal" className={styles.cardTitle}>
                                                {t('salesChannels')}
                                            </Title>
                                            {publishedChannels.length > 0 ? (
                                                <div className={styles.stack} style={{ gap: '0.75rem' }}>
                                                    {publishedChannels.map((group) => (
                                                        <InfoRow key={group.platform} label={group.platform}>
                                                            <div className={styles.wrapRow}>
                                                                {group.channels.map((ch) => (
                                                                    <Tag key={ch.id} design={ch.is_live ? 'Positive' : 'Neutral'} hideStateIcon>
                                                                        {ch.is_live
                                                                            ? `${ch.name || ch.code} · ${t('liveLabel')}`
                                                                            : ch.name || ch.code}
                                                                    </Tag>
                                                                ))}
                                                            </div>
                                                        </InfoRow>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className={styles.muted}>{t('noPublishedChannels')}</span>
                                            )}
                                        </section>
                                    )}

                                    {/* หมวดหมู่ / หมวดหมู่ย่อย / กลุ่มสินค้า — ค่าเก็บที่ 'ungrouped'/'default' เสมอ */}
                                    {masterCategoryAttributes.length > 0 && (
                                        <section className={styles.card}>
                                            <Title level="H5" wrappingType="Normal" className={styles.cardTitle}>
                                                {t('masterCategoriesBlockTitle')}
                                            </Title>
                                            <div className={styles.stack} style={{ gap: '1rem' }}>
                                                {masterCategoryAttributes.map((attr) => (
                                                    <InfoRow key={attr.id} label={localizedLabel(attr, activeLocaleId)}>
                                                        <RenderAttributeValue attr={attr} value={getValue(attr)} />
                                                    </InfoRow>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {canViewHistory && (
                                        <section className={styles.card}>
                                            <Title level="H5" wrappingType="Normal" className={styles.cardTitle}>
                                                {t('timelineTitle')}
                                            </Title>
                                            <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: '0.25rem' }}>
                                                <TimelinePanel timelineUrl={`/catalog/products/${product.id}/timeline`} />
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {tabIndex === 1 && canViewHistory && (
                        <div className={styles.gutter} style={{ paddingTop: '1rem' }}>
                            <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
