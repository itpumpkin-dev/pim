import { FioriField, FioriFormGroup, FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import RichTextEditor from '@/components/rich-text-editor';
import '@ui5/webcomponents-icons/dist/accept.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/reset.js';
import '@ui5/webcomponents-icons/dist/save.js';
import {
    Button,
    ComboBox,
    ComboBoxItem,
    Input,
    Label,
    Link,
    MultiComboBox,
    MultiComboBoxItem,
    ObjectStatus,
    Option,
    Panel,
    Select,
    Tab,
    TabContainer,
    Tag,
    Text,
    Toolbar,
    ToolbarSpacer,
} from '@ui5/webcomponents-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { GalleryEditor, ImageImport, type GalleryState, type ImagePlan } from './listing-image-import';
import type { MatchedListing } from './matched-listing-cell';
import { useFullscreenPanel } from './use-fullscreen-panel';

export type EditPlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

type RowStatus = 'ok' | 'unmapped' | 'unsupported' | 'not_in_family' | 'no_permission';
type FormValue = string | string[];

interface FormRow {
    key: string;
    group: string;
    label: string;
    attribute: { id: number; code: string; name: string; type: string; is_channel_based: boolean; is_locale_based: boolean } | null;
    scope: 'channel' | 'default' | null;
    current: string | null;
    proposed: string | null;
    source: string | null;
    options: { value: string; label: string }[];
    editable: boolean;
    required: boolean;
    status: RowStatus;
    reason: string | null;
    hint: string | null;
    differs: boolean;
}

interface ListingVariant {
    variant_id?: string | null;
    seller_sku?: string | null;
    name?: string | null;
    options?: Record<string, string>;
    price?: number | string | null;
    special_price?: number | string | null;
    quantity?: number | null;
    status?: string | null;
}

interface FormResponse {
    listing: { id: number; item_id: string; seller_sku: string | null; shop: string } | null;
    detail: {
        has_data: boolean;
        fetched_at: string | null;
        fetch_error: string | null;
        category_id: string | null;
        category_name: string | null;
        status: string | null;
        listing_url: string | null;
        variants: ListingVariant[];
    } | null;
    rows: FormRow[];
    images: ImagePlan | null;
    gallery: GalleryState;
}

/** sub-tabs per platform — laid out like each platform's own seller-centre product form */
const TABS: Record<EditPlatform, { key: string; label: string }[]> = {
    shopee: [
        { key: 'general', label: 'ข้อมูลทั่วไป' },
        { key: 'specs', label: 'คุณลักษณะของสินค้า' },
        { key: 'details', label: 'รายละเอียด' },
        { key: 'sales', label: 'ข้อมูลการขาย' },
        { key: 'shipping', label: 'การจัดส่ง' },
        { key: 'promotion', label: 'ส่งเสริมการขาย' },
        { key: 'other', label: 'อื่นๆ' },
    ],
    lazada: [
        { key: 'general', label: 'ข้อมูลสินค้า' },
        { key: 'key', label: 'คุณสมบัติ' },
        { key: 'specs', label: 'ข้อมูลเฉพาะของสินค้า' },
        { key: 'sales', label: 'ราคาสต็อคสินค้าและตัวเลือกย่อย' },
        { key: 'details', label: 'คำอธิบายสินค้า' },
        { key: 'shipping', label: 'การจัดส่งและรับประกัน' },
    ],
    tiktok: [
        { key: 'basic', label: 'ข้อมูลพื้นฐาน' },
        { key: 'details', label: 'รายละเอียดสินค้า' },
        { key: 'sales', label: 'ข้อมูลการขาย' },
        { key: 'shipping', label: 'การจัดส่ง' },
    ],
    woocommerce: [
        { key: 'general', label: 'ทั่วไป' },
        { key: 'description', label: 'คำอธิบาย' },
        { key: 'attributes', label: 'คุณสมบัติ (Attributes)' },
        { key: 'shipping', label: 'การจัดส่ง' },
    ],
};

/** tab that also shows images + category (first tab) and the read-only variant table */
const MEDIA_TAB: Record<EditPlatform, string> = { shopee: 'general', lazada: 'general', tiktok: 'basic', woocommerce: 'general' };
const SALES_TAB: Record<EditPlatform, string> = { shopee: 'sales', lazada: 'sales', tiktok: 'sales', woocommerce: 'general' };

const xsrfToken = () =>
    decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );

/** HTML → readable text */
const plain = (value: string | null) =>
    (value ?? '')
        .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();

/** stored value → form value (multiselect = list of codes) */
const toForm = (row: FormRow, stored: string | null): FormValue => {
    if (row.attribute?.type === 'multiselect') {
        try {
            const parsed = JSON.parse(stored ?? '[]');
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }
    return stored ?? '';
};

const sameValue = (a: FormValue, b: FormValue) =>
    Array.isArray(a) || Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b;

/** stored value → text shown in the "บนร้าน" line */
const displayOf = (row: FormRow, stored: string | null): string => {
    if (stored === null || stored === '') return '';
    const label = (code: string) => row.options.find((o) => o.value === code)?.label ?? code;
    switch (row.attribute?.type) {
        case 'select':
            return label(stored);
        case 'multiselect':
            return (toForm(row, stored) as string[]).map(label).join(', ');
        case 'textarea':
            return plain(stored);
        default:
            return stored;
    }
};

/**
 * Step "นำเข้าและแก้ไขข้อมูลจาก {platform}" ของหน้า Map สินค้า (ก่อน History) — ฟอร์มแก้ไข
 * ค่าใน PIM ที่ push ไป platform นี้ใช้ จัดแท็บย่อยแบบหน้า seller center ของแต่ละ platform;
 * ถ้าผูก listing ไว้ ใต้แต่ละช่องจะโชว์ค่าบนร้านพร้อมปุ่ม "ใช้ค่านี้" (ListingImportController /
 * ListingImportService) บันทึกลง PIM อย่างเดียว (push แยกเหมือนเดิม) — attribute ที่แยกตาม
 * ช่องทางเขียนเฉพาะช่องทางของร้านต้นทาง ที่ไม่แยกเขียนค่ากลาง, ภาษา th, ไม่ trigger auto-sync
 */
export function PlatformEditPanel({
    active,
    productId,
    platform,
    platformLabel,
    listings,
    platformCategoryId,
    platformCategoryPath,
    onSaved,
}: {
    /** the step is (or has been) on screen — data loads only then, so opening the page never calls the platform API by itself */
    active: boolean;
    productId: number;
    platform: EditPlatform;
    platformLabel: string;
    listings: MatchedListing[];
    platformCategoryId: number | null;
    platformCategoryPath: string | null;
    onSaved?: () => void;
}) {
    const sourceListings = useMemo(() => listings.filter((l) => l.direct), [listings]);
    const [listingId, setListingId] = useState<number | null>(sourceListings[0]?.id ?? null);
    const [data, setData] = useState<FormResponse | null>(null);
    const [values, setValues] = useState<Record<string, FormValue>>({});
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [tab, setTab] = useState(TABS[platform][0].key);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [activated, setActivated] = useState(active);
    const [openLocked, setOpenLocked] = useState<Record<string, boolean>>({});
    const fs = useFullscreenPanel(`นำเข้าและแก้ไขข้อมูลจาก ${platformLabel}`);
    const { confirm, confirmElement } = useFioriConfirm();

    useEffect(() => {
        if (active) setActivated(true);
    }, [active]);

    const load = useCallback(
        (refresh = false) => {
            setLoading(true);
            setError(null);
            const params = new URLSearchParams();
            if (listingId !== null) params.set('listing', String(listingId));
            if (platformCategoryId !== null) params.set('category_id', String(platformCategoryId));
            if (refresh) params.set('refresh', '1');
            fetch(`/catalog/marketplace/products/${productId}/platform-edit/${platform}?${params}`, { headers: { Accept: 'application/json' } })
                .then(async (res) => {
                    const body = await res.json();
                    if (!res.ok) throw new Error(body.message || 'โหลดข้อมูลไม่สำเร็จ');
                    const response = body as FormResponse;
                    setData(response);
                    setValues(Object.fromEntries(response.rows.filter((r) => r.editable).map((r) => [r.key, toForm(r, r.current)])));
                    setFieldErrors({});
                })
                .catch((e: Error) => setError(e.message))
                .finally(() => setLoading(false));
        },
        [productId, platform, listingId, platformCategoryId],
    );

    useEffect(() => {
        if (activated) {
            setResult(null);
            load();
        }
    }, [activated, load]);

    const rows = useMemo(() => data?.rows ?? [], [data]);
    const dirtyRows = rows.filter((r) => r.editable && !sameValue(values[r.key] ?? '', toForm(r, r.current)));
    const fillableRows = rows.filter((r) => r.editable && r.proposed !== null && r.differs);
    const hasListing = Boolean(data?.listing && data.detail?.has_data);

    const setValue = (key: string, value: FormValue) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setFieldErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const applyListingValue = (row: FormRow) => setValue(row.key, toForm(row, row.proposed));

    const fillEmptyFromListing = () =>
        setValues((prev) => {
            const next = { ...prev };
            for (const row of fillableRows) {
                const currentValue = next[row.key];
                if (currentValue === undefined || currentValue === '' || (Array.isArray(currentValue) && currentValue.length === 0)) {
                    next[row.key] = toForm(row, row.proposed);
                }
            }
            return next;
        });

    const reset = () => setValues(Object.fromEntries(rows.filter((r) => r.editable).map((r) => [r.key, toForm(r, r.current)])));

    const save = async () => {
        if (dirtyRows.length === 0) return;
        const defaultScope = data?.listing ? dirtyRows.filter((r) => r.scope === 'default') : [];
        if (defaultScope.length > 0) {
            const ok = await confirm({
                title: 'บันทึกค่ากลาง (ทุกช่องทาง)?',
                message: `${defaultScope.map((r) => r.label).join(', ')} — attribute เหล่านี้ไม่แยกตามช่องทาง ค่าที่บันทึกจะมีผลกับทุกช่องทาง ไม่ใช่เฉพาะ ${data?.listing?.shop ?? 'ร้านนี้'}`,
                confirmLabel: 'บันทึก',
            });
            if (!ok) return;
        }

        setSaving(true);
        setError(null);
        setResult(null);
        fetch(`/catalog/marketplace/products/${productId}/platform-edit/${platform}`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                values: Object.fromEntries(dirtyRows.map((r) => [r.key, values[r.key]])),
                listing_id: data?.listing?.id ?? null,
                category_id: platformCategoryId,
            }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) {
                    if (body.errors && typeof body.errors === 'object') setFieldErrors(body.errors);
                    throw new Error(body.message || 'บันทึกไม่สำเร็จ');
                }
                setResult(body.message);
                onSaved?.();
                load();
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setSaving(false));
    };

    const scopeTag = (row: FormRow) =>
        row.scope === 'channel' ? (
            <Tag design="Information" hideStateIcon size="S" title="attribute นี้แยกตามช่องทาง — บันทึกเฉพาะช่องทางของร้านต้นทาง">
                เฉพาะร้านนี้
            </Tag>
        ) : row.scope === 'default' ? (
            <Tag design="Neutral" hideStateIcon size="S" title="attribute นี้ไม่แยกตามช่องทาง — ค่ากลาง มีผลกับทุกช่องทาง">
                ทุกช่องทาง
            </Tag>
        ) : null;

    const control = (row: FormRow) => {
        const value = values[row.key] ?? '';
        const disabled = saving || loading;
        const id = `pe-${row.key}`;
        switch (row.attribute?.type) {
            case 'textarea':
                return (
                    <RichTextEditor
                        value={String(value)}
                        onChange={(html) => setValue(row.key, html)}
                        readOnly={disabled}
                        valueState={fieldErrors[row.key] ? 'error' : 'none'}
                    />
                );
            case 'select': {
                const selected = row.options.find((o) => o.value === value);
                return (
                    <ComboBox
                        id={id}
                        style={{ width: '100%' }}
                        disabled={disabled}
                        showClearIcon
                        placeholder="เลือก..."
                        value={selected?.label ?? ''}
                        selectedValue={selected?.value ?? ''}
                        valueState={fieldErrors[row.key] ? 'Negative' : 'None'}
                        onSelectionChange={(e) => setValue(row.key, e.detail.item ? (e.detail.item.value ?? '') : '')}
                    >
                        {row.options.map((o) => (
                            <ComboBoxItem key={o.value} value={o.value} text={o.label} />
                        ))}
                    </ComboBox>
                );
            }
            case 'multiselect': {
                const selectedCodes = Array.isArray(value) ? value : [];
                return (
                    <MultiComboBox
                        id={id}
                        style={{ width: '100%' }}
                        disabled={disabled}
                        placeholder="เลือก..."
                        valueState={fieldErrors[row.key] ? 'Negative' : 'None'}
                        onSelectionChange={(e) =>
                            setValue(
                                row.key,
                                e.detail.items.map((item) => String((item as HTMLElement).dataset.value)),
                            )
                        }
                    >
                        {row.options.map((o) => (
                            <MultiComboBoxItem key={o.value} data-value={o.value} text={o.label} selected={selectedCodes.includes(o.value)} />
                        ))}
                    </MultiComboBox>
                );
            }
            default:
                return (
                    <Input
                        id={id}
                        type={row.attribute?.type === 'number' ? 'Number' : 'Text'}
                        style={{ width: '100%' }}
                        disabled={disabled}
                        value={String(value)}
                        valueState={fieldErrors[row.key] ? 'Negative' : 'None'}
                        onInput={(e) => setValue(row.key, e.target.value)}
                    />
                );
        }
    };

    /** "บน {platform}: …" line under a field */
    const listingLine = (row: FormRow) => {
        if (!hasListing) return null;
        if (row.proposed === null) {
            return row.source ? (
                <Label wrappingType="Normal">
                    บน {platformLabel}: {row.source}
                </Label>
            ) : (
                <Label>บน {platformLabel}: —</Label>
            );
        }
        const matchesForm = sameValue(values[row.key] ?? '', toForm(row, row.proposed));
        return (
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.25rem', flexWrap: 'wrap' }}>
                <Text maxLines={2} style={{ color: 'var(--sapContent_LabelColor)', flex: 1, minWidth: 0 }}>
                    บน {platformLabel}: {displayOf(row, row.proposed)}
                </Text>
                {row.editable &&
                    (matchesForm ? (
                        <Tag design="Positive" size="S" hideStateIcon>
                            ตรงกับร้าน
                        </Tag>
                    ) : (
                        <Link onClick={() => applyListingValue(row)}>ใช้ค่านี้</Link>
                    ))}
            </span>
        );
    };

    const field = (row: FormRow) => {
        const label = row.label;
        const below = (
            <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                {row.attribute && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <Text style={{ fontFamily: 'var(--sapFontFamilyMono, monospace)', fontSize: 'var(--sapFontSmallSize)' }}>
                            {row.attribute.code}
                        </Text>
                        {scopeTag(row)}
                    </span>
                )}
                {listingLine(row)}
                {row.hint && (
                    <Label wrappingType="Normal" style={{ color: 'var(--sapCriticalTextColor)' }}>
                        {row.hint}
                    </Label>
                )}
            </span>
        );

        return (
            <FioriField
                key={row.key}
                label={label}
                htmlFor={`pe-${row.key}`}
                required={row.required}
                valueState={fieldErrors[row.key] ? 'error' : 'none'}
                message={fieldErrors[row.key]}
                hint={below}
                fullWidth={row.attribute?.type === 'textarea'}
                fieldMaxWidth={520}
            >
                {control(row)}
            </FioriField>
        );
    };

    /** ฟิลด์ที่แก้ไม่ได้ — สถานะ + วิธีแก้ (ตารางอ่านอย่างเดียว แทนการวาดเป็นช่องฟอร์ม) */
    const LOCKED_STATUS: Record<Exclude<RowStatus, 'ok'>, { label: string; state: 'Critical' | 'Negative' | 'None' | 'Information'; fix: string }> = {
        unmapped: { label: 'ยังไม่ได้แมพ', state: 'Critical', fix: `แมพกับ PIM attribute ที่ step Attribute Mapping / Payload ${platformLabel}` },
        not_in_family: { label: 'ไม่อยู่ใน family', state: 'Information', fix: 'เพิ่ม attribute นี้เข้าตระกูล (family) ของสินค้า' },
        unsupported: { label: 'ยังไม่รองรับ', state: 'None', fix: 'แก้ที่หน้าแก้ไขสินค้าแบบเต็ม' },
        no_permission: { label: 'ไม่มีสิทธิ์', state: 'Negative', fix: 'ขอสิทธิ์แก้ไข attribute นี้' },
    };
    const lockedColumns: FioriResponsiveColumn<FormRow>[] = [
        {
            key: 'field',
            header: `ฟิลด์บน ${platformLabel}`,
            priority: 'always',
            minWidth: 200,
            render: (row) => (
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
                    <Text style={{ fontWeight: 600 }}>
                        {row.label}
                        {row.required && (
                            <span style={{ color: 'var(--sapNegativeColor)', marginLeft: '0.125rem' }} title="บังคับกรอก">
                                *
                            </span>
                        )}
                    </Text>
                    {row.attribute && (
                        <Text
                            style={{
                                fontFamily: 'var(--sapFontFamilyMono, monospace)',
                                fontSize: 'var(--sapFontSmallSize)',
                                color: 'var(--sapContent_LabelColor)',
                            }}
                        >
                            {row.attribute.code}
                        </Text>
                    )}
                </span>
            ),
        },
        {
            key: 'value',
            header: `ค่าบน ${platformLabel}`,
            priority: 'high',
            minWidth: 160,
            render: (row) => <Text maxLines={2}>{row.source || '—'}</Text>,
        },
        {
            key: 'status',
            header: 'สถานะ',
            priority: 'always',
            minWidth: 220,
            render: (row) => {
                const status = LOCKED_STATUS[row.status as Exclude<RowStatus, 'ok'>];
                return (
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                        <ObjectStatus state={status?.state ?? 'None'} showDefaultIcon>
                            {status?.label ?? row.reason}
                        </ObjectStatus>
                        {status && <Label wrappingType="Normal">{status.fix}</Label>}
                    </span>
                );
            },
        },
    ];

    const variants = data?.detail?.variants ?? [];
    const money = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? '—' : `฿${Number(v).toLocaleString()}`);
    const variantColumns: FioriResponsiveColumn<ListingVariant>[] = [
        { key: 'sku', header: 'SKU', priority: 'always', minWidth: 140, render: (v) => <Text>{v.seller_sku || '—'}</Text> },
        {
            key: 'options',
            header: 'ตัวเลือก',
            priority: 'high',
            minWidth: 160,
            render: (v) => <Text>{Object.values(v.options ?? {}).join(' / ') || v.name || '—'}</Text>,
        },
        { key: 'price', header: 'ราคา', priority: 'always', align: 'right', minWidth: 90, render: (v) => <Text>{money(v.price)}</Text> },
        {
            key: 'special',
            header: 'ราคาพิเศษ',
            priority: 'medium',
            align: 'right',
            minWidth: 90,
            render: (v) => <Text>{money(v.special_price)}</Text>,
        },
        { key: 'qty', header: 'สต็อก', priority: 'high', align: 'right', minWidth: 70, render: (v) => <Text>{v.quantity ?? '—'}</Text> },
        { key: 'status', header: 'สถานะ', priority: 'low', minWidth: 90, render: (v) => <Text>{v.status ?? '—'}</Text> },
    ];

    const needListing = (what: string) => (
        <FioriMessageStrip severity="information">
            {sourceListings.length === 0
                ? `จับคู่สินค้านี้กับ listing บน ${platformLabel} ก่อน (หน้าจับคู่สินค้า) จึงจะเห็น${what}`
                : `โหลด${what}จาก ${platformLabel} ไม่ได้`}
        </FioriMessageStrip>
    );

    const tabContent = (key: string) => {
        const tabRows = rows.filter((r) => r.group === key);
        const parts: React.ReactNode[] = [];

        if (key === MEDIA_TAB[platform]) {
            parts.push(
                <FioriFormGroup key="category" title="หมวดหมู่">
                    <FioriField label={`หมวดหมู่บน ${platformLabel}`} hint="แก้ไขได้ที่ step 1. Category Mapping">
                        <Text>{platformCategoryPath || '— ยังไม่ได้แมพ'}</Text>
                    </FioriField>
                    {hasListing && data?.detail?.category_name && (
                        <FioriField label="หมวดหมู่ของ listing บนร้าน">
                            <Text>{data.detail.category_name}</Text>
                        </FioriField>
                    )}
                </FioriFormGroup>,
            );
            parts.push(
                <FioriFormGroup key="images" title="รูปภาพสินค้า">
                    {data?.gallery && (
                        <GalleryEditor
                            key={data.gallery.current.map((i) => i.path).join('|')}
                            gallery={data.gallery}
                            productId={productId}
                            platform={platform}
                            onDone={(message) => {
                                setResult(message);
                                onSaved?.();
                                load();
                            }}
                        />
                    )}
                    <Label showColon style={{ display: 'block', marginTop: '1.5rem' }}>
                        นำเข้ารูปจาก {platformLabel}
                    </Label>
                    {data?.images && data.listing ? (
                        <ImageImport
                            key={`${data.listing.id}:${data.detail?.fetched_at}`}
                            plan={data.images}
                            productId={productId}
                            listingId={data.listing.id}
                            platformLabel={platformLabel}
                            onDone={(message) => {
                                setResult(message);
                                onSaved?.();
                                load();
                            }}
                        />
                    ) : (
                        needListing('รูปภาพ')
                    )}
                </FioriFormGroup>,
            );
        }

        const editableRows = tabRows.filter((r) => r.editable);
        const lockedRows = tabRows.filter((r) => !r.editable);
        if (editableRows.length > 0) {
            parts.push(
                <FioriFormGroup key="fields" title={TABS[platform].find((t) => t.key === key)?.label}>
                    {editableRows.map(field)}
                </FioriFormGroup>,
            );
        }
        // เปิดไว้ให้เลยถ้าแท็บนี้ไม่มีช่องที่แก้ได้ ไม่งั้นพับไว้ (ผู้ใช้เปิด/ปิดเองได้)
        const lockedOpen = openLocked[key] ?? editableRows.length === 0;
        if (lockedRows.length > 0) {
            parts.push(
                <Panel
                    key="locked"
                    headerText={`ฟิลด์ที่ยังแก้ไขไม่ได้ (${lockedRows.length})`}
                    collapsed={!lockedOpen}
                    onToggle={() => setOpenLocked((prev) => ({ ...prev, [key]: !lockedOpen }))}
                    noAnimation
                    style={{
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        overflow: 'hidden',
                    }}
                >
                    <FioriResponsiveTable columns={lockedColumns} rows={lockedRows} getRowKey={(r) => r.key} variant="plain" />
                </Panel>,
            );
        }

        if (key === SALES_TAB[platform]) {
            parts.push(
                <FioriFormGroup
                    key="variants"
                    title="ราคา / สต็อก / ตัวเลือกย่อย บนร้าน"
                    description="ดูอย่างเดียว — การแก้ราคา/สต็อกยังไม่รองรับในหน้านี้"
                >
                    {hasListing ? (
                        <FioriResponsiveTable
                            columns={variantColumns}
                            rows={variants}
                            getRowKey={(v) => `${v.variant_id ?? ''}:${v.seller_sku ?? ''}`}
                            variant="plain"
                            emptyMessage="ไม่มีข้อมูล"
                        />
                    ) : (
                        needListing('ข้อมูลการขาย')
                    )}
                </FioriFormGroup>,
            );
        }

        if (key === 'promotion') {
            const promo = variants.filter((v) => v.special_price !== null && v.special_price !== undefined && v.special_price !== '');
            parts.push(
                <FioriFormGroup
                    key="promotion"
                    title="ราคาส่งเสริมการขาย"
                    description="ดูอย่างเดียว — โปรโมชันประเภทอื่น (โค้ดส่วนลด / Flash Sale) ยังไม่รองรับ"
                >
                    {!hasListing ? (
                        needListing('ข้อมูลส่งเสริมการขาย')
                    ) : promo.length === 0 ? (
                        <Text>ไม่มีราคาพิเศษบน listing นี้</Text>
                    ) : (
                        <FioriResponsiveTable
                            columns={variantColumns}
                            rows={promo}
                            getRowKey={(v) => `${v.variant_id ?? ''}:${v.seller_sku ?? ''}`}
                            variant="plain"
                        />
                    )}
                </FioriFormGroup>,
            );
        }

        if (parts.length === 0) {
            parts.push(
                <Text key="empty" style={{ padding: '1rem 0', display: 'block' }}>
                    ไม่มีฟิลด์ในหมวดนี้
                </Text>,
            );
        }

        return <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.75rem' }}>{parts}</div>;
    };

    const panel = (
        // ดอกจันบังคับกรอก (UI5 Label required) เป็นสีแดงทั้ง step — ตัวแปรธีมสืบทอดเข้า shadow DOM ของ Label
        <div
            ref={fs.panelRef}
            className={fs.panelClassName}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', ['--sapField_RequiredColor' as string]: 'var(--sapNegativeColor)' }}
        >
            {confirmElement}
            {fs.title}
            <Toolbar design="Transparent" className={fs.toolbarClassName} style={{ padding: 0, flexWrap: 'wrap' }}>
                <Label for="platform-edit-source" showColon>
                    ข้อมูลจากร้าน
                </Label>
                <Select
                    id="platform-edit-source"
                    accessibleName="listing ต้นทาง"
                    disabled={sourceListings.length < 2 || loading || saving}
                    onChange={(e) => setListingId(Number(e.detail.selectedOption.value) || null)}
                    style={{ minWidth: '16rem' }}
                >
                    {sourceListings.length === 0 && <Option value="">— ยังไม่ได้จับคู่ listing</Option>}
                    {sourceListings.map((l) => (
                        <Option key={l.id} value={String(l.id)} selected={l.id === listingId}>
                            {`${l.shop} · ${l.seller_sku || `Item ${l.item_id}`}`}
                        </Option>
                    ))}
                </Select>
                {data?.detail?.fetched_at && <Label>ข้อมูล ณ {new Date(data.detail.fetched_at).toLocaleString()}</Label>}
                <ToolbarSpacer />
                {data?.listing && (
                    <Button
                        design="Transparent"
                        icon="refresh"
                        disabled={loading || saving}
                        onClick={() => load(true)}
                        tooltip="ดึงรายละเอียดล่าสุดจากแพลตฟอร์ม"
                    >
                        ดึงข้อมูลล่าสุด
                    </Button>
                )}
                {fillableRows.length > 0 && (
                    <Button
                        design="Transparent"
                        icon="accept"
                        disabled={loading || saving}
                        onClick={fillEmptyFromListing}
                        tooltip="เติมเฉพาะช่องที่ยังว่างด้วยค่าจากร้าน"
                    >
                        เติมช่องว่างจากร้าน
                    </Button>
                )}
                <Button design="Transparent" icon="reset" disabled={dirtyRows.length === 0 || saving} onClick={reset}>
                    ยกเลิกการแก้ไข
                </Button>
                <Button
                    design="Emphasized"
                    icon="save"
                    disabled={dirtyRows.length === 0 || loading || saving}
                    loading={saving}
                    loadingDelay={0}
                    onClick={save}
                >
                    บันทึกลง PIM ({dirtyRows.length})
                </Button>
                {fs.toggleButton}
            </Toolbar>

            <FioriMessageStrip severity="information">
                แก้ค่าใน PIM ที่ใช้ส่งขึ้น {platformLabel} — บันทึกแล้วยังไม่ส่งขึ้นร้าน (ใช้ปุ่ม Push ตามปกติ) · ภาษาไทย · attribute ที่
                "เฉพาะร้านนี้" บันทึกแยกต่อร้าน ที่ "ทุกช่องทาง" เป็นค่ากลาง ·{' '}
                <Link href={`/catalog/products/${productId}/edit?platform=${platform}`}>เปิดหน้าแก้ไขสินค้าแบบเต็ม</Link>
            </FioriMessageStrip>

            {error && (
                <FioriMessageStrip severity="error" onClose={() => setError(null)}>
                    {error}
                </FioriMessageStrip>
            )}
            {result && (
                <FioriMessageStrip severity="success" onClose={() => setResult(null)}>
                    {result}
                </FioriMessageStrip>
            )}
            {data?.detail?.fetch_error && (
                <FioriMessageStrip severity="warning">ดึงรายละเอียดล่าสุดไม่สำเร็จ: {data.detail.fetch_error}</FioriMessageStrip>
            )}

            <TabContainer
                onTabSelect={(e) => setTab(TABS[platform][e.detail.tabIndex]?.key ?? TABS[platform][0].key)}
                contentBackgroundDesign="Transparent"
                headerBackgroundDesign="Transparent"
            >
                {TABS[platform].map((t) => {
                    const dirtyInTab = dirtyRows.filter((r) => r.group === t.key).length;
                    return <Tab key={t.key} text={t.label} additionalText={dirtyInTab > 0 ? `${dirtyInTab}` : undefined} selected={tab === t.key} />;
                })}
            </TabContainer>

            {loading && !data ? <Text>กำลังโหลด...</Text> : tabContent(tab)}
        </div>
    );

    return panel;
}
