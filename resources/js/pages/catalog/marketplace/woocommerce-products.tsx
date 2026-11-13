import { AssignPimCategoryPanel } from '@/components/catalog/assign-pim-category-panel';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
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
import '@ui5/webcomponents-icons/dist/collections-management.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import { Button, CheckBox, Link, SegmentedButton, SegmentedButtonItem, Tab, TabContainer, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Body,
    Caption,
    CenteredSpinner,
    HStack,
    KpiTiles,
    LockedNotice,
    MappingCell,
    MappingFieldLabel,
    MappingRow,
    MappingTable,
    PageHeader,
    Pager,
    SearchField,
    SectionCard,
    SectionHeading,
    Spinner,
    TONE_TEXT,
    VStack,
    MappingPlatformSwitch,
} from './marketplace-ui';
import styles from './marketplace.module.css';
import { MatchedListingCell, type ProductMatching } from './matched-listing-cell';
import { PlatformEditPanel } from './platform-edit-panel';
import { PlatformPushPanel } from './platform-push-panel';
import { useListingCategoryPrefill } from './use-listing-category-prefill';

type ProductFilter = 'all' | 'mapped' | 'unmapped';
/** ตัวกรอง Product Matching — ดู ProductMatchStatus::applyMatchingFilter() */
type MatchingFilter = 'all' | 'matched' | 'unmatched';

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
    /** มี listing บนร้าน WooCommerce ผูก (Product Matching) กับสินค้านี้ (หรือ variant) แล้ว
     * — ดู ProductMatchStatus */
    matching: ProductMatching;
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
    stats: { total: number; mapped: number; unmapped: number; matched: number; not_matched: number };
    filters: { filter: ProductFilter; search: string; per_page: number; matching?: MatchingFilter; ids?: number[] };
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

    // ไอคอนแก้ไขสินค้าข้างชื่อในตาราง — พาไปหน้า Edit Product ตรงๆ (products/edit.tsx)
    // ไม่ใช่หน้า mapping นี้ — เช็คสิทธิ์แยกจากสิทธิ์ marketplace_woocommerce ของหน้านี้เอง
    // เพราะเป็นคนละ permission group กัน (ดู routes/catalog.php: products.edit)
    const { auth } = usePage<SharedData>().props;
    const canEditProducts = (auth.permissions || []).includes('products.edit_products');

    const { confirm, confirmElement } = useFioriConfirm();

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ProductFilter>(filters.filter ?? 'all');
    const [matching, setMatching] = useState<MatchingFilter>(filters.matching ?? 'all');
    // ?ids= — สินค้าที่เลือกมาจาก Marketplace Product Master: ทุกการโหลดตารางคงตัวกรองนี้ไว้จนกด "แสดงทั้งหมด"
    const idsParam = filters.ids && filters.ids.length > 0 ? filters.ids.join(',') : undefined;
    // ตาราง reload แบบ preserveState (กรอง / ค้นหา / เปลี่ยนหน้า) ไม่มี skeleton ของทั้งแอป
    // — โชว์ busy ทับตารางเอง เฉพาะเมื่อโหลดนานกว่า 150ms (โหลดเร็วไม่กระพริบ)
    const [navigating, setNavigating] = useState(false);
    const showNavBusy = useFioriBusy(navigating, 150);
    const navEvents = { onStart: () => setNavigating(true), onFinish: () => setNavigating(false) };
    const [perPage, setPerPage] = useState<number>(products.per_page ?? 25);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const firstRender = useRef(true);

    // Active product being viewed as an Object Page (null = list view)
    const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);

    // Category mapping section state
    const [selectedWooCatId, setSelectedWooCatId] = useState<number | null>(null);
    // สินค้าที่จับคู่ listing แล้วแต่ยังไม่ได้แมปหมวดหมู่ → ตั้งหมวดหมู่ของ listing เป็นค่าเริ่มต้นใน picker
    const categoryPrefillNote = useListingCategoryPrefill('woocommerce', activeProduct, selectedWooCatId, setSelectedWooCatId);
    const [savingCatMap, setSavingCatMap] = useState(false);
    // "Sync Categories" — ดึงต้นไม้หมวดหมู่ทั้งหมดจาก WooCommerce จริงมา refresh
    // แคช woocommerce_categories (คนละอย่างกับ saveCategoryMapping ด้านล่าง)
    const [syncingCategoryTree, setSyncingCategoryTree] = useState(false);
    const [categorySyncMessage, setCategorySyncMessage] = useState<{ text: string; isError: boolean } | null>(null);

    // Attribute mapping section state — WooCommerce attribute เป็น global
    // ทั้งหมด ไม่ผูก category (ต่างจาก Lazada/Shopee/TikTok) เลยโหลดได้ทันทีไม่
    // ต้องรอ Category Mapping (section 1) เสร็จก่อน และไม่มีcheckbox "แสดงเฉพาะ
    // ที่บังคับ"/ปุ่ม "จับคู่ตัวเลือก" เลย (ไม่มี concept เหล่านี้จริงสำหรับ
    // WooCommerce) — "สร้าง/อัปเดต Attribute Family" มีได้ (ดู
    // syncAttributeFamily() ด้านล่าง) auto-create PIM attribute ใหม่ให้
    // WooCommerce attribute ที่ยังไม่มีใครแมปด้วย แล้วรวมทุก PIM attribute ที่
    // แมปไว้ (global ทั้งระบบ) เป็น family เดียว ไม่ใช่ต่อ category แบบ 3
    // platform อื่น
    const [wooAttributes, setWooAttributes] = useState<WooCommerceAttributeRow[] | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState(false);
    const [savingAttributeId, setSavingAttributeId] = useState<number | null>(null);
    const [syncingAttributes, setSyncingAttributes] = useState(false);
    // "สร้าง/อัปเดต Attribute Family" — auto-generate ตระกูลแอตทริบิวต์จาก PIM
    // attribute ที่แมปไว้แล้วทั้งหมด (global) แล้วผูกกับ PIM Category นี้ ให้
    // ฟิลด์โผล่ในหน้า Edit Product ทันที (ดู WooCommerceAttributeFamilyGenerator
    // ฝั่ง backend) — mirror ของ lazada-products.tsx เป๊ะ
    const [syncingFamily, setSyncingFamily] = useState(false);
    const [familySyncResult, setFamilySyncResult] = useState<{ name: string; count: number; newlyCreatedCount: number; editUrl: string } | null>(
        null,
    );
    const [familySyncError, setFamilySyncError] = useState<string | null>(null);

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
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: 'WooCommerce', href: '/catalog/marketplace/product-master?platform=woocommerce' },
        { title: 'สินค้า', href: '/catalog/marketplace/woocommerce/products' },
        ...(activeProduct ? [{ title: activeProduct.name, href: '#' }] : []),
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/marketplace/woocommerce/products',
                { search, ids: idsParam, matching, filter, per_page: perPage },
                { preserveState: true, replace: true, ...navEvents },
            );
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const applyFilter = (value: ProductFilter) => {
        setFilter(value);
        router.get(
            '/catalog/marketplace/woocommerce/products',
            { search, ids: idsParam, matching, filter: value, per_page: perPage },
            { preserveState: true, ...navEvents },
        );
    };

    const applyMatching = (value: MatchingFilter) => {
        setMatching(value);
        router.get(
            '/catalog/marketplace/woocommerce/products',
            { search, ids: idsParam, matching: value, filter, per_page: perPage },
            { preserveState: true, ...navEvents },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/marketplace/woocommerce/products',
            { search, ids: idsParam, matching, filter, per_page: value },
            { preserveState: true, ...navEvents },
        );
    };

    const goToPage = (page: number) => {
        router.get(
            '/catalog/marketplace/woocommerce/products',
            { search, ids: idsParam, matching, filter, per_page: perPage, page },
            { preserveState: true, ...navEvents },
        );
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

    // สร้าง/อัปเดต Attribute Family จาก PIM attribute ที่แมปไว้แล้วทั้งหมด
    // (global — ไม่ใช่แค่ของหมวดหมู่นี้ เพราะ WooCommerce attribute ไม่ผูก
    // category) — ผูกกับ PIM Category นี้ผ่าน category_attribute_family
    // (backend เป็นคน sync ให้ ไม่ทับตระกูลอื่นที่ผูกอยู่ก่อนหน้า) แล้วโชว์ลิงก์
    // ให้ไปตรวจสอบเอง — mirror ของ lazada-products.tsx's syncAttributeFamily()
    // เต็มรูปแบบแล้ว: ปุ่มนี้ auto-create PIM Attribute ใหม่ให้ WooCommerce
    // attribute ที่ยังไม่มีใครแมปด้วย (ดู WooCommerceMappedAttributeCreator
    // ฝั่ง backend) — เตือนก่อนเสมอเหมือนกัน เพราะเป็นการเขียน schema จริง
    // ถาวรกว่าจัดกลุ่มเฉยๆ
    const syncAttributeFamily = async () => {
        if (!activeProduct?.master_category) return;

        const confirmed = await confirm({
            title: 'สร้าง/อัปเดต Attribute Family',
            message:
                'การกดปุ่มนี้อาจสร้าง PIM Attribute ใหม่หลายตัวสำหรับ WooCommerce attribute ที่ยังไม่มีใครแมป แล้วรวมทุก attribute ที่แมปไว้ (ทั้งระบบ) เข้าเป็น Attribute Family เดียว ผูกกับหมวดหมู่นี้ ต้องการดำเนินการต่อหรือไม่?',
            severity: 'warning',
            confirmLabel: 'ดำเนินการต่อ',
        });
        if (!confirmed) return;

        setSyncingFamily(true);
        setFamilySyncResult(null);
        setFamilySyncError(null);

        fetch('/catalog/attributes/woocommerce-mapping/attribute-family', {
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
                    // มี attribute ใหม่เกิดขึ้นจริง — reload ลิสต์ให้เห็นว่า "mapped" แล้ว
                    if (body.newly_created_count > 0) {
                        loadAttributes();
                    }
                } else {
                    setFamilySyncError(body.message || 'เกิดข้อผิดพลาด ไม่สามารถสร้าง/อัปเดต Attribute Family ได้');
                }
            })
            .catch(() => setFamilySyncError('เกิดข้อผิดพลาด ไม่สามารถสร้าง/อัปเดต Attribute Family ได้'))
            .finally(() => setSyncingFamily(false));
    };

    // step "นำเข้าและแก้ไขข้อมูลจาก WooCommerce" — ปุ่มดินสอ (แก้ไข) ทั้งในตารางและบนหัวหน้าพามาที่นี่
    const EDIT_SECTION_INDEX = 3;
    // step "Push ไป WooCommerce" — ที่เดียวที่ push / ปิดการขาย / ลบ listing ได้
    const PUSH_SECTION_INDEX = 4;
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
        setSelectedWooCatId(product.woocommerce_category?.id ?? null);
        // ล้าง state ค้างจากสินค้าตัวก่อนหน้าด้วย — ไม่งั้นเปิดสินค้าตัวใหม่จะยัง
        // เห็น alert ของสินค้าตัวเก่าค้างอยู่ (บั๊กที่เจอจาก code review รอบ
        // Shopee — ใส่ไว้ตั้งแต่ต้นให้ WooCommerce เลย)
        setCategorySyncMessage(null);

        // โหลด attribute list (global) ทันทีเสมอ ไม่ต้องรอ category_mapped
        loadAttributes();
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
        if (categoryId && !row.category_mapped) setSelectedWooCatId(categoryId);
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
                    prev
                        ? prev.map((f) => (f.target_field === field ? { ...f, mapped: [{ id: pimAttribute.id, name: pimAttribute.name }] } : f))
                        : prev,
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
                <CheckBox
                    accessibleName="Select all"
                    checked={products.data.length > 0 && selectedRows.length > 0}
                    indeterminate={selectedRows.length > 0 && selectedRows.length < products.data.length}
                    onChange={toggleSelectAll}
                />
            ),
            popinText: 'Select',
            priority: 'always',
            width: 48,
            minWidth: 48,
            render: (row) => <CheckBox accessibleName={row.sku} checked={selectedRows.includes(row.id)} onChange={() => toggleSelectRow(row.id)} />,
        },
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
            key: 'woocommerce_category',
            header: 'WooCommerce Category',
            priority: 'high',
            minWidth: 240,
            render: (row) =>
                row.woocommerce_category ? (
                    <div>
                        <Body style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                            {row.woocommerce_category.path || row.woocommerce_category.name}
                        </Body>
                        <Caption mono>wc:{row.woocommerce_category.id}</Caption>
                    </div>
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
                <HStack gap="0.5rem" justify="flex-end">
                    <Button design={row.category_mapped ? 'Default' : 'Emphasized'} onClick={() => openProduct(row)}>
                        {row.category_mapped ? 'แก้ไขการแมพ' : 'เริ่มแมพ'}
                    </Button>
                </HStack>
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
                                        activeProduct.woocommerce_category
                                            ? `WooCommerce: ${activeProduct.woocommerce_category.path || activeProduct.woocommerce_category.name}`
                                            : 'ยังไม่ได้แมป Category'
                                    }
                                    tone={activeProduct.category_mapped ? 'success' : 'warning'}
                                />
                            </HStack>
                        </div>
                    </div>

                    {/* Scrollable Body — พื้นที่เดียวในหน้านี้ที่ scroll ได้ */}
                    <div ref={scrollBodyRef} className={styles.objectBody}>
                        {/* Anchor bar — sticky, ทำหน้าที่เป็น scroll-spy nav ไม่ใช่สลับ panel */}
                        <div ref={anchorBarRef} className={styles.anchorBar}>
                            <TabContainer collapsed onTabSelect={(e) => scrollToSection(e.detail.tabIndex)}>
                                <Tab text="1. Category Mapping" selected={sectionIndex === 0} />
                                <Tab text="2. Attribute Mapping" selected={sectionIndex === 1} />
                                <Tab text="3. Payload WooCommerce" selected={sectionIndex === 2} />
                                <Tab text="4. นำเข้าและแก้ไขข้อมูลจาก WooCommerce" selected={sectionIndex === 3} />
                                <Tab text="5. Push ไป WooCommerce" selected={sectionIndex === 4} />
                                <Tab text="6. History" disabled={!activeProduct.master_category} selected={sectionIndex === 5} />
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
                                            title="เลือก WooCommerce Category ปลายทางสำหรับ Master Category นี้"
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
                                            Sync Categories จาก WooCommerce
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
                                                                  woocommerce_category_id: null,
                                                              },
                                                          }
                                                        : prev,
                                                )
                                            }
                                        />
                                    )}

                                    <div style={{ maxWidth: 420 }}>
                                        <MarketplaceCategoryPicker
                                            platform="woocommerce"
                                            label="WooCommerce Category"
                                            value={selectedWooCatId}
                                            onChange={setSelectedWooCatId}
                                        />
                                    </div>
                                    {categoryPrefillNote}

                                    <div>
                                        <Button
                                            design="Emphasized"
                                            icon="accept"
                                            disabled={!selectedWooCatId || savingCatMap}
                                            loading={savingCatMap}
                                            loadingDelay={0}
                                            onClick={saveCategoryMapping}
                                        >
                                            บันทึก Category Mapping & ดำเนินการต่อ
                                        </Button>
                                    </div>
                                </VStack>
                            </SectionCard>

                            {/* Section 2 — Attribute Mapping: WooCommerce attribute เป็น global
                                ทั้งหมด ไม่ผูก category — ไม่ lock รอ Category Mapping (section 1)
                                เหมือน 3 platform อื่น */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[1] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.5rem">
                                    <HStack justify="space-between" wrap gap="1rem">
                                        <SectionHeading
                                            title="WooCommerce Product Attributes (global)"
                                            description="Attribute ของ WooCommerce ไม่ผูกกับหมวดหมู่ — แมปที่นี่มีผลกับสินค้าทุกตัวในระบบ ไม่ใช่แค่ตัวนี้"
                                        />
                                        <HStack gap="0.5rem" wrap>
                                            <Button
                                                icon="collections-management"
                                                disabled={syncingFamily || !activeProduct.master_category || (wooAttributes ?? []).length === 0}
                                                loading={syncingFamily}
                                                loadingDelay={0}
                                                onClick={syncAttributeFamily}
                                            >
                                                สร้าง/อัปเดต Attribute Family
                                            </Button>
                                            <Button
                                                icon="synchronize"
                                                disabled={syncingAttributes}
                                                loading={syncingAttributes}
                                                loadingDelay={0}
                                                onClick={syncAttributes}
                                            >
                                                Sync Attributes
                                            </Button>
                                        </HStack>
                                    </HStack>

                                    {familySyncResult && (
                                        <FioriMessageStrip severity="success" onClose={() => setFamilySyncResult(null)}>
                                            สร้าง/อัปเดต Attribute Family &quot;{familySyncResult.name}&quot; แล้ว ({familySyncResult.count}{' '}
                                            attributes
                                            {familySyncResult.newlyCreatedCount > 0 && `, สร้างใหม่ ${familySyncResult.newlyCreatedCount} attribute`})
                                            —{' '}
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

                                    {loadingAttributes ? (
                                        <CenteredSpinner />
                                    ) : wooAttributes && wooAttributes.length > 0 ? (
                                        <MappingTable headers={['WooCommerce Attribute', 'PIM Attribute (ต้นทาง)']}>
                                            {wooAttributes.map((attr) => (
                                                <MappingRow key={attr.id}>
                                                    <MappingCell>
                                                        <MappingFieldLabel label={attr.name} />
                                                    </MappingCell>
                                                    <MappingCell>
                                                        <HStack gap="0.5rem">
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
                                                            {savingAttributeId === attr.id && <Spinner />}
                                                        </HStack>
                                                    </MappingCell>
                                                </MappingRow>
                                            ))}
                                        </MappingTable>
                                    ) : (
                                        <Body style={{ color: TONE_TEXT.neutral, textAlign: 'center', padding: '1.5rem 0' }}>
                                            ยังไม่มีข้อมูล Attributes ในระบบ กรุณากด "Sync Attributes"
                                        </Body>
                                    )}
                                </VStack>
                            </SectionCard>

                            {/* Section 3 — Payload WooCommerce: ฟิลด์ payload ตายตัวของ
                                WooCommerce เอง ไม่ผูกกับหมวดหมู่ไหนเลย */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[2] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="แมป PIM Attribute เข้ากับฟิลด์ payload ของ WooCommerce"
                                        description="ฟิลด์ตายตัวของ WooCommerce เอง — ใช้ร่วมกันทุกสินค้า เปลี่ยนตรงนี้มีผลกับสินค้าทุกตัวในระบบ"
                                    />

                                    {loadingPayloadFields ? (
                                        <CenteredSpinner />
                                    ) : (
                                        <MappingTable headers={['WooCommerce Payload Field', 'PIM Attribute (ต้นทาง)']}>
                                            {(payloadFields ?? []).map((f) => (
                                                <MappingRow key={f.target_field}>
                                                    <MappingCell>
                                                        <MappingFieldLabel label={PAYLOAD_FIELD_LABELS[f.target_field]} meta={f.target_field} />
                                                    </MappingCell>
                                                    <MappingCell>
                                                        {f.multi ? (
                                                            // description/short_description — รับได้หลาย attribute พร้อมกัน
                                                            // (แต่ละตัวถูกประกอบเป็นหนึ่ง section ต่อกันฝั่ง WooCommerce จริง)
                                                            // แสดงเป็นรายการที่ลบทีละตัวได้ + ช่องเพิ่มตัวใหม่
                                                            <VStack gap="0.5rem">
                                                                {f.mapped.length > 0 && (
                                                                    <HStack wrap gap="0.5rem">
                                                                        {f.mapped.map((m) => (
                                                                            <span key={m.id} className={styles.chip}>
                                                                                {m.name}
                                                                                <Button
                                                                                    design="Transparent"
                                                                                    icon="decline"
                                                                                    accessibleName={`ลบ ${m.name}`}
                                                                                    tooltip={`ลบ ${m.name}`}
                                                                                    disabled={savingPayloadField === f.target_field}
                                                                                    onClick={() => removePayloadFieldAttribute(f.target_field, m.id)}
                                                                                    style={{ minWidth: 0, height: '1.5rem', width: '1.5rem' }}
                                                                                />
                                                                            </span>
                                                                        ))}
                                                                    </HStack>
                                                                )}
                                                                <HStack gap="0.5rem">
                                                                    <div style={{ flex: 1, minWidth: 200 }}>
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
                                                                    </div>
                                                                    {savingPayloadField === f.target_field && <Spinner />}
                                                                </HStack>
                                                            </VStack>
                                                        ) : (
                                                            <HStack gap="0.5rem">
                                                                <div style={{ flex: 1, minWidth: 200 }}>
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
                                                                </div>
                                                                {savingPayloadField === f.target_field && <Spinner />}
                                                            </HStack>
                                                        )}
                                                    </MappingCell>
                                                </MappingRow>
                                            ))}
                                        </MappingTable>
                                    )}
                                </VStack>
                            </SectionCard>

                            {/* Section 4 — นำเข้าและแก้ไขข้อมูลจาก WooCommerce: ฟอร์มแก้ค่าใน PIM จัดแท็บย่อยแบบหน้า
                                seller center ของ WooCommerce + ค่าจาก listing ที่จับคู่ไว้ — ดู PlatformEditPanel / ListingImportService
                                (ปุ่มดินสอ "แก้ไข" ในตารางและบนหัวหน้าพามาที่ step นี้) */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[3] = el;
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
                                        title="นำเข้าและแก้ไขข้อมูลจาก WooCommerce"
                                        description='แก้ค่าใน PIM ที่ใช้ส่งขึ้น WooCommerce — ถ้าจับคู่ listing ไว้ จะเห็นค่าบนร้านใต้แต่ละช่องพร้อมปุ่ม "ใช้ค่านี้"'
                                    />
                                    {!canEditProducts ? (
                                        <LockedNotice>ต้องมีสิทธิ์แก้ไขสินค้าจึงจะแก้ไขข้อมูลได้</LockedNotice>
                                    ) : (
                                        <PlatformEditPanel
                                            key={activeProduct.id}
                                            active={sectionIndex === 3}
                                            productId={activeProduct.id}
                                            platform="woocommerce"
                                            platformLabel="WooCommerce"
                                            listings={activeProduct.matching.listings}
                                            platformCategoryId={activeProduct.woocommerce_category?.id ?? null}
                                            platformCategoryPath={activeProduct.woocommerce_category?.path ?? null}
                                            onSaved={loadPayloadFields}
                                        />
                                    )}
                                </VStack>
                            </SectionCard>

                            {/* Section 5 — Push ไป WooCommerce: ที่เดียวที่ส่งข้อมูลขึ้นร้านได้ (Push / ปิดการขาย / ลบ /
                                เช็คสถานะ ทีละร้าน) — ดู PlatformPushPanel / PlatformPushController */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[4] = el;
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
                                        title="Push ไป WooCommerce"
                                        description="ส่งข้อมูลสินค้าจาก PIM ขึ้นร้าน WooCommerce ทีละร้าน — การ Push / ปิดการขาย / ลบ listing ทำได้จากที่นี่เท่านั้น"
                                    />
                                    <PlatformPushPanel
                                        key={activeProduct.id}
                                        active={sectionIndex === 4}
                                        productId={activeProduct.id}
                                        platform="woocommerce"
                                        platformLabel="WooCommerce"
                                    />
                                </VStack>
                            </SectionCard>

                            {/* Section 6 — History: WooCommerceMappingTimelineBuilder ขอบเขต
                                แคบกว่า 3 platform อื่น — แค่ audit trail ของ Category Mapping
                                (section 1) เท่านั้น เพราะ attribute mapping เป็น global ไม่ผูก
                                กับ category นี้เจาะจง */}
                            <SectionCard
                                ref={(el: HTMLDivElement | null) => {
                                    sectionRefs.current[5] = el;
                                }}
                                scrollMarginTop={SECTION_SCROLL_MARGIN}
                            >
                                <VStack gap="1.25rem">
                                    <SectionHeading
                                        title="เส้นทางการแมพ WooCommerce ของ Master Category นี้"
                                        description="รวมการเปลี่ยนแปลงของ Category Mapping (Section 1) — attribute mapping (Section 2/3) เป็น global ไม่ผูกกับ category นี้เจาะจง เลยไม่รวมอยู่ในนี้"
                                    />

                                    {!activeProduct.master_category ? (
                                        <LockedNotice>สินค้านี้ยังไม่มี Master Category — ไม่มีประวัติให้แสดง</LockedNotice>
                                    ) : (
                                        <TimelinePanel
                                            timelineUrl={`/catalog/attributes/woocommerce-mapping/timeline?category_id=${activeProduct.master_category.id}`}
                                        />
                                    )}
                                </VStack>
                            </SectionCard>
                        </div>
                    </div>
                </div>
                {confirmElement}
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="แมปสินค้า WooCommerce" />
            <div className={styles.page}>
                {/* ──── Page Header ──── */}
                <PageHeader
                    title={`สินค้า (${products.total})`}
                    subtitle="จัดการการแมปหมวดหมู่และ Attributes ของ WooCommerce ตั้งแต่ระดับสินค้า"
                    actions={
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <MappingPlatformSwitch current="woocommerce" />
                            <Button
                                design="Transparent"
                                icon="nav-back"
                                onClick={() => router.visit('/catalog/marketplace/product-master?platform=woocommerce')}
                            >
                                WooCommerce Hub
                            </Button>
                        </div>
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

                    {idsParam && (
                        <FioriMessageStrip severity="information" style={{ margin: '0.75rem 1.25rem 0' }}>
                            แสดงเฉพาะ {filters.ids?.length} สินค้าที่เลือกมาจาก Marketplace Product Master{' '}
                            <Link
                                onClick={() =>
                                    router.get(
                                        '/catalog/marketplace/woocommerce/products',
                                        { search, matching, filter, per_page: perPage },
                                        { preserveState: true, ...navEvents },
                                    )
                                }
                            >
                                แสดงทั้งหมด
                            </Link>
                        </FioriMessageStrip>
                    )}

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
                            rowClassName={(row: ProductRow) => (selectedRows.includes(row.id) ? styles.selectedRow : undefined)}
                            emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                        />
                    </div>

                    {/* Footer info */}
                    <div className={styles.footer}>
                        <Caption>{tGrid('totalCount', { count: products.total })}</Caption>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
