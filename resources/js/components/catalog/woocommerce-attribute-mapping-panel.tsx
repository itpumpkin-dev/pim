import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

type TargetField =
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
    | 'video'
    | 'wc_attribute'
    | '';

// มี resolution mode อยู่ 3 แบบ ไม่ใช่แค่แบ่งกลุ่ม label เฉยๆ — ดูที่
// WooCommerceProductSyncService::buildContentFields() (รวมทุก attribute ที่
// map ไว้เข้าด้วยกัน), resolveMappedField() (attribute ตัวแรกที่ map ไว้แล้ว
// มีค่าจะชนะ) และ buildWooCommerceAttributes() (แบบ first-match-wins ต่อ
// woocommerce_attribute_id แต่ละตัว) การจัดกลุ่มด้านล่างนี้มีไว้เพื่อให้เห็น
// ความต่างนี้ชัดๆ ใน picker ไม่ใช่แค่จัดให้เรียบร้อยเฉยๆ ฟิลด์วิดีโอตรงนี้ไม่มี
// ข้อจำกัดเรื่องประเภท (ต่างจากฟิลด์วิดีโอของ Shopee/Lazada/TikTok) — เพราะ
// WooCommerce ส่งมันเป็นแค่ string URL ธรรมดาใน
// `meta_data[key=youtube_url]` ไม่ได้ผ่าน API อัปโหลด/แปลงไฟล์ใดๆ เลย
// เพราะฉะนั้น attribute ประเภทข้อความแบบไหนก็ใช้ได้
const CONTENT_FIELDS: TargetField[] = ['description', 'short_description'];
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video'];

// ค่าของ target Select จะเป็น string ของ TargetField ธรรมดาสำหรับ target
// ที่ตายตัวทุกตัว แต่ถ้าเป็นการ mapping ไป WooCommerce Product Attribute
// ต้องแนบด้วยว่า *ตัวไหน* — เลยเข้ารหัสเป็น prefix นี้ + id (เช่น
// "wc_attribute:7") เพื่อให้ MUI Select ตัวเดียวแทนทั้งสองแบบได้ โดยไม่ต้อง
// มี control ตัวที่สอง
const WC_ATTRIBUTE_PREFIX = 'wc_attribute:';

interface WooCommerceAttributeOption {
    id: number;
    name: string;
    slug: string;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: TargetField | null;
    woocommerce_attribute_id: number | null;
    sort_order: number;
}

export interface WooCommerceAttributeMappingPanelProps {
    attributes: AttributeRow[];
    wooCommerceAttributes: WooCommerceAttributeOption[];
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };
}

// ชื่อฟิลด์เป็น snake_case (ตรงกับค่า target_field ฝั่ง backend) แต่ i18n key
// ของแอปนี้เป็น camelCase — เลยต้อง map ตรงๆ แบบนี้ ไม่ใช้วิธีเดา
// ว่า `t(field)` จะ resolve ได้เอง เพราะจะพังเงียบๆ กับ short_description
// 'wc_attribute' ไม่มี label ตายตัวตรงนี้ — MenuItem ของมันจะแสดงชื่อจริงของ
// WooCommerce attribute ที่ sync มาแทน (ดู WC_ATTRIBUTE_PREFIX)
const FIELD_LABEL_KEYS: Record<Exclude<TargetField, '' | 'wc_attribute'>, string> = {
    description: 'description',
    short_description: 'shortDescription',
    name: 'name',
    price: 'price',
    image: 'image',
    qty: 'qty',
    weight: 'weight',
    length: 'length',
    width: 'width',
    height: 'height',
    video: 'video',
};

export function WooCommerceAttributeMappingPanel({ attributes, wooCommerceAttributes, coverage }: WooCommerceAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const rows: MappingAttributeRow[] = attributes.map((a) => ({
        id: a.id,
        code: a.code,
        label: a.label,
        type: a.type,
        target_field: a.target_field,
        custom_id: a.woocommerce_attribute_id,
        sort_order: a.sort_order,
    }));

    const mapping = useAttributeMapping({
        attributes: rows,
        saveUrl: '/catalog/attributes/woocommerce-mapping',
        syncUrl: '/catalog/attributes/woocommerce-mapping/sync',
        buildSavePayload: (entry) => ({
            attribute_id: entry.attribute_id,
            target_field: entry.target_field,
            woocommerce_attribute_id: entry.custom_id,
            sort_order: entry.sort_order,
        }),
    });

    // Backend ส่ง payloadFields.missing มาเป็น target_field key ดิบๆ (เช่น
    // "short_description") — แปลผ่าน FIELD_LABEL_KEYS ชุดเดียวกับที่ picker
    // เองใช้ เพื่อให้ tooltip อ่านแล้วตรงกับที่ UI แสดง
    const payloadFieldsCoverage = {
        ...coverage.payloadFields,
        missing: coverage.payloadFields.missing.map((field) => t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'wc_attribute'>])),
    };

    const buildTargetValue = (row: MappingAttributeRow): string => {
        const entry = mapping.valueFor(row);
        return entry.target_field === 'wc_attribute' && entry.custom_id ? `${WC_ATTRIBUTE_PREFIX}${entry.custom_id}` : entry.target_field;
    };

    const applySelectValue = (row: MappingAttributeRow, raw: string) => {
        if (raw.startsWith(WC_ATTRIBUTE_PREFIX)) {
            mapping.setEntry(row, { target_field: 'wc_attribute', custom_id: Number(raw.slice(WC_ATTRIBUTE_PREFIX.length)) });
        } else {
            mapping.setEntry(row, { target_field: raw, custom_id: null });
        }
    };

    return (
        <AttributeMappingTable
            platform="woocommerce"
            helpTextKey="woocommerceContentMappingHelp"
            syncLabelKey="syncFromWoocommerce"
            coverage={{ payloadFields: payloadFieldsCoverage, platformAttributes: coverage.platformAttributes }}
            search={mapping.search}
            onSearchChange={mapping.setSearch}
            status={mapping.status}
            onStatusChange={mapping.setStatus}
            filtered={mapping.filtered}
            isMapped={mapping.isMapped}
            hasPendingChange={mapping.hasPendingChange}
            statusCaption={(row) => (mapping.valueFor(row).target_field === 'wc_attribute' ? t('mappedToWcAttribute') : t('mappedToPayload'))}
            sortOrderFor={(row) => mapping.valueFor(row).sort_order}
            onSortOrderChange={mapping.setSortOrder}
            pendingCount={mapping.pendingCount}
            saving={mapping.saving}
            onSave={mapping.saveChanges}
            syncing={mapping.syncing}
            onSync={mapping.syncFromPlatform}
            renderMapToCell={(row) => (
                <Select value={buildTargetValue(row)} onChange={(e) => applySelectValue(row, e.target.value)} size="small" fullWidth>
                    <MenuItem value="">{t('notUsed')}</MenuItem>
                    <ListSubheader>{t('contentFieldsGroup')}</ListSubheader>
                    {CONTENT_FIELDS.map((field) => (
                        <MenuItem key={field} value={field}>{t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'wc_attribute'>])}</MenuItem>
                    ))}
                    <ListSubheader>{t('productFieldsGroup')}</ListSubheader>
                    {STRUCTURED_FIELDS.map((field) => (
                        <MenuItem key={field} value={field}>{t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'wc_attribute'>])}</MenuItem>
                    ))}
                    <ListSubheader>{t('wcAttributesGroup')}</ListSubheader>
                    {wooCommerceAttributes.map((wa) => (
                        <MenuItem key={`wc_attribute:${wa.id}`} value={`${WC_ATTRIBUTE_PREFIX}${wa.id}`}>{wa.name}</MenuItem>
                    ))}
                </Select>
            )}
        />
    );
}
