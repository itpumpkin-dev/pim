import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 รองรับ Lazada attribute แบบใส่ค่าอิสระ (input_type text/numeric) และ
// ฟิลด์ richText (เช่น description/short_description ที่รับ HTML จริงๆ ได้)
// — ดูที่ LazadaAttributeMappingController::update() ซึ่งจะปฏิเสธการ mapping
// ไปยัง input_type แบบอื่น ส่วน attribute แบบ singleSelect/multiSelect/
// enumInput ยังคงแสดงในลิสต์อยู่ (เพื่อให้แอดมินเห็นว่ามีอยู่จริง) แต่จะกด
// เลือกไม่ได้ เพราะ Lazada ต้องการตัวเลือกที่กำหนดไว้ล่วงหน้าเฉพาะเจาะจง
// ไม่ใช่ค่าอิสระ
const MAPPABLE_INPUT_TYPES = ['text', 'numeric', 'richText'];

type TargetField =
    | 'name'
    | 'price'
    | 'qty'
    | 'weight'
    | 'length'
    | 'width'
    | 'height'
    | 'video'
    | 'lazada_attribute'
    | '';

// ฟิลด์แบบ single-value คือ "attribute ตัวแรกที่ map ไว้แล้วมีค่าจะชนะ"
// ส่งค่าตรงเข้า payload ของ Lazada เอง (SellerSku/quantity/price/package_*/
// attributes.video) — ดูที่ LazadaProductSyncService::resolveMappedField()
// ต่างจาก `lazada_attribute` ด้านล่างนี้ ซึ่งจะไปลงที่ category attribute
// ของ Lazada แทน (payload.attributes หรือ payload.skus[0] แล้วแต่
// attribute_type ของตัว attribute นั้นๆ) — ปลายทางต่างกันโดยโครงสร้าง
// เลยแยกกลุ่ม dropdown ออกจากกัน (และมี status caption ของตัวเอง)
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video'];

// ค่าของ target Select จะเป็น string ของ TargetField ธรรมดาสำหรับฟิลด์
// payload ที่ตายตัวทุกตัว แต่ถ้าเป็นการ mapping ไป Lazada category attribute
// ต้องแนบด้วยว่า *attribute ไหน* — เลยเข้ารหัสเป็น prefix นี้ + ชื่อ (attribute
// ของ Lazada ระบุด้วยชื่อ ไม่ใช่ id ตัวเลข) เช่น
// "lazada_attribute:product_warranty"
const LAZADA_ATTRIBUTE_PREFIX = 'lazada_attribute:';

// ชื่อฟิลด์เป็น snake_case (ตรงกับค่า target_field ฝั่ง backend) แต่ i18n key
// ของแอปนี้เป็น camelCase — คีย์เดียวกับที่
// woocommerce-/shopee-attribute-mapping-panel.tsx ใช้กับฟิลด์เดียวกัน
const FIELD_LABEL_KEYS: Record<Exclude<TargetField, '' | 'lazada_attribute'>, string> = {
    name: 'name',
    price: 'price',
    qty: 'qty',
    weight: 'weight',
    length: 'length',
    width: 'width',
    height: 'height',
    video: 'video',
};

interface LazadaAttributeOption {
    name: string;
    label: string | null;
    input_type: string | null;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: TargetField | null;
    lazada_attribute_name: string | null;
    sort_order: number;
}

export interface LazadaAttributeMappingPanelProps {
    attributes: AttributeRow[];
    lazadaAttributes: LazadaAttributeOption[];
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };
}

export function LazadaAttributeMappingPanel({ attributes, lazadaAttributes, coverage }: LazadaAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const rows: MappingAttributeRow[] = attributes.map((a) => ({
        id: a.id,
        code: a.code,
        label: a.label,
        type: a.type,
        target_field: a.target_field,
        custom_id: a.lazada_attribute_name,
        sort_order: a.sort_order,
    }));

    const mapping = useAttributeMapping({
        attributes: rows,
        saveUrl: '/catalog/attributes/lazada-mapping',
        syncUrl: '/catalog/attributes/lazada-mapping/sync',
        buildSavePayload: (entry) => ({
            attribute_id: entry.attribute_id,
            target_field: entry.target_field,
            lazada_attribute_name: entry.custom_id,
            sort_order: entry.sort_order,
        }),
    });

    // Backend ส่ง payloadFields.missing มาเป็น target_field key ดิบๆ — ใช้
    // ชุดคำแปลเดียวกับที่ dropdown ของตัว picker เองใช้ เพื่อให้ tooltip ตรงกัน
    const payloadFieldsCoverage = {
        ...coverage.payloadFields,
        missing: coverage.payloadFields.missing.map((field) => t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'lazada_attribute'>])),
    };

    const buildTargetValue = (row: MappingAttributeRow): string => {
        const entry = mapping.valueFor(row);
        return entry.target_field === 'lazada_attribute' && entry.custom_id ? `${LAZADA_ATTRIBUTE_PREFIX}${entry.custom_id}` : entry.target_field;
    };

    const applySelectValue = (row: MappingAttributeRow, raw: string) => {
        if (raw.startsWith(LAZADA_ATTRIBUTE_PREFIX)) {
            mapping.setEntry(row, { target_field: 'lazada_attribute', custom_id: raw.slice(LAZADA_ATTRIBUTE_PREFIX.length) });
        } else {
            mapping.setEntry(row, { target_field: raw, custom_id: null });
        }
    };

    return (
        <AttributeMappingTable
            platform="lazada"
            helpTextKey="lazadaAttributeMappingHelp"
            syncLabelKey="syncFromLazada"
            coverage={{ payloadFields: payloadFieldsCoverage, platformAttributes: coverage.platformAttributes }}
            search={mapping.search}
            onSearchChange={mapping.setSearch}
            status={mapping.status}
            onStatusChange={mapping.setStatus}
            filtered={mapping.filtered}
            isMapped={mapping.isMapped}
            hasPendingChange={mapping.hasPendingChange}
            statusCaption={(row) => (mapping.valueFor(row).target_field === 'lazada_attribute' ? t('mappedToLazadaAttribute') : t('mappedToPayload'))}
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
                    <ListSubheader>{t('lazadaPayloadFieldsGroup')}</ListSubheader>
                    {STRUCTURED_FIELDS.map((field) => (
                        <MenuItem
                            key={field}
                            value={field}
                            // Lazada ไม่รับ URL วิดีโอจากภายนอก (ดู backend guard ของ
                            // ฟิลด์นี้) — จะมีแค่ PIM attribute ประเภท `video`
                            // (ไฟล์ที่อัปโหลดจริง) เท่านั้นที่ map มาที่ฟิลด์ Video ได้
                            disabled={field === 'video' && row.type !== 'video'}
                        >
                            {t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'lazada_attribute'>])}
                        </MenuItem>
                    ))}
                    <ListSubheader>{t('lazadaAttributesGroup')}</ListSubheader>
                    {lazadaAttributes.map((la) => (
                        <MenuItem
                            key={la.name}
                            value={`${LAZADA_ATTRIBUTE_PREFIX}${la.name}`}
                            disabled={!la.input_type || !MAPPABLE_INPUT_TYPES.includes(la.input_type)}
                        >
                            {la.label ?? la.name}
                            {!la.input_type || !MAPPABLE_INPUT_TYPES.includes(la.input_type) ? ` ${t('lazadaSelectUnsupported')}` : ''}
                        </MenuItem>
                    ))}
                </Select>
            )}
        />
    );
}
