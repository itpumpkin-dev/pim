import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 รองรับแค่ Shopee attribute แบบพิมพ์ข้อความเอง (input_type 3) เท่านั้น — ดูที่
// ShopeeAttributeMappingController::update() ซึ่งจะปฏิเสธการ mapping ไปยัง
// input_type แบบอื่น ส่วน attribute แบบ select/dropdown ยังคงแสดงในลิสต์อยู่
// (เพื่อให้แอดมินเห็นว่ามีอยู่จริง) แต่จะกดเลือกไม่ได้ เพราะ Shopee ต้องการ
// value_id เฉพาะเจาะจงสำหรับแบบนั้น ไม่ใช่ข้อความอิสระ
const MAPPABLE_INPUT_TYPE = 3;

type TargetField =
    | 'name'
    | 'price'
    | 'qty'
    | 'weight'
    | 'length'
    | 'width'
    | 'height'
    | 'description'
    | 'video'
    | 'shopee_attribute'
    | '';

// ทั้ง 9 ฟิลด์นี้เป็นแบบ single-value คือ "attribute ตัวแรกที่ map ไว้แล้วมีค่า
// จะชนะ" ส่งค่าตรงเข้า payload ของ Shopee เอง (add_item/update_item)
// (item_name/original_price/seller_stock/weight/dimension/description/
// video_upload_id) — ดูที่ ShopeeProductSyncService::resolveMappedField()
// ต่างจาก `shopee_attribute` ด้านล่างนี้ ซึ่งจะไปลงที่ entry หนึ่งใน
// `attribute_list[]` ของ Shopee แทน — ปลายทางต่างกันโดยโครงสร้าง เลยแยก
// กลุ่ม dropdown ออกจากกัน (และมี status caption ของตัวเอง) เพื่อไม่ให้
// สับสนกันระหว่างสองแบบนี้
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

// ค่าของ target Select จะเป็น string ของ TargetField ธรรมดาสำหรับฟิลด์
// payload ที่ตายตัวทุกตัว แต่ถ้าเป็นการ mapping ไป Shopee attribute_list
// ต้องแนบด้วยว่า *attribute ไหน* ของ Shopee — เลยเข้ารหัสเป็น prefix นี้ + id
// (เช่น "shopee_attribute:7") เพื่อให้ MUI Select ตัวเดียวแทนทั้งสองแบบได้
// โดยไม่ต้องมี control ตัวที่สอง
const SHOPEE_ATTRIBUTE_PREFIX = 'shopee_attribute:';

// ชื่อฟิลด์เป็น snake_case (ตรงกับค่า target_field ฝั่ง backend) แต่ i18n key
// ของแอปนี้เป็น camelCase — คีย์พวกนี้เป็นคีย์เดียวกับที่
// woocommerce-attribute-mapping-panel.tsx ใช้กับฟิลด์เดียวกัน
const FIELD_LABEL_KEYS: Record<Exclude<TargetField, '' | 'shopee_attribute'>, string> = {
    name: 'name',
    price: 'price',
    qty: 'qty',
    weight: 'weight',
    length: 'length',
    width: 'width',
    height: 'height',
    description: 'description',
    video: 'video',
};

interface ShopeeAttributeOption {
    id: number;
    name: string;
    input_type: number | null;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: TargetField | null;
    shopee_attribute_id: number | null;
    sort_order: number;
}

export interface ShopeeAttributeMappingPanelProps {
    attributes: AttributeRow[];
    shopeeAttributes: ShopeeAttributeOption[];
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };
}

export function ShopeeAttributeMappingPanel({ attributes, shopeeAttributes, coverage }: ShopeeAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const rows: MappingAttributeRow[] = attributes.map((a) => ({
        id: a.id,
        code: a.code,
        label: a.label,
        type: a.type,
        target_field: a.target_field,
        custom_id: a.shopee_attribute_id,
        sort_order: a.sort_order,
    }));

    const mapping = useAttributeMapping({
        attributes: rows,
        saveUrl: '/catalog/attributes/shopee-mapping',
        syncUrl: '/catalog/attributes/shopee-mapping/sync',
        buildSavePayload: (entry) => ({
            attribute_id: entry.attribute_id,
            target_field: entry.target_field,
            shopee_attribute_id: entry.custom_id,
            sort_order: entry.sort_order,
        }),
    });

    // Backend ส่ง payloadFields.missing มาเป็น target_field key ดิบๆ — ใช้
    // ชุดคำแปลเดียวกับที่ dropdown ของตัว picker เองใช้ เพื่อให้ tooltip ตรงกัน
    const payloadFieldsCoverage = {
        ...coverage.payloadFields,
        missing: coverage.payloadFields.missing.map((field) => t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'shopee_attribute'>])),
    };

    const buildTargetValue = (row: MappingAttributeRow): string => {
        const entry = mapping.valueFor(row);
        return entry.target_field === 'shopee_attribute' && entry.custom_id ? `${SHOPEE_ATTRIBUTE_PREFIX}${entry.custom_id}` : entry.target_field;
    };

    const applySelectValue = (row: MappingAttributeRow, raw: string) => {
        if (raw.startsWith(SHOPEE_ATTRIBUTE_PREFIX)) {
            mapping.setEntry(row, { target_field: 'shopee_attribute', custom_id: Number(raw.slice(SHOPEE_ATTRIBUTE_PREFIX.length)) });
        } else {
            mapping.setEntry(row, { target_field: raw, custom_id: null });
        }
    };

    return (
        <AttributeMappingTable
            platform="shopee"
            helpTextKey="shopeeAttributeMappingHelp"
            syncLabelKey="syncFromShopee"
            coverage={{ payloadFields: payloadFieldsCoverage, platformAttributes: coverage.platformAttributes }}
            search={mapping.search}
            onSearchChange={mapping.setSearch}
            status={mapping.status}
            onStatusChange={mapping.setStatus}
            filtered={mapping.filtered}
            isMapped={mapping.isMapped}
            hasPendingChange={mapping.hasPendingChange}
            statusCaption={(row) => (mapping.valueFor(row).target_field === 'shopee_attribute' ? t('mappedToAttribute') : t('mappedToPayload'))}
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
                    <ListSubheader>{t('shopeePayloadFieldsGroup')}</ListSubheader>
                    {STRUCTURED_FIELDS.map((field) => (
                        <MenuItem
                            key={field}
                            value={field}
                            // ฟิลด์วิดีโอของ Shopee ต้องการไฟล์ที่อัปโหลดจริงๆ ไม่ใช่
                            // URL จากภายนอก (ดู backend guard ของฟิลด์นี้) — จะมีแค่
                            // PIM attribute ประเภท `video` เท่านั้นที่ map มาที่นี่ได้
                            disabled={field === 'video' && row.type !== 'video'}
                        >
                            {t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'shopee_attribute'>])}
                        </MenuItem>
                    ))}
                    <ListSubheader>{t('shopeeAttributesGroup')}</ListSubheader>
                    {shopeeAttributes.map((sa) => (
                        <MenuItem key={sa.id} value={`${SHOPEE_ATTRIBUTE_PREFIX}${sa.id}`} disabled={sa.input_type !== MAPPABLE_INPUT_TYPE}>
                            {sa.name}
                            {sa.input_type !== MAPPABLE_INPUT_TYPE ? ` ${t('shopeeDropdownUnsupported')}` : ''}
                        </MenuItem>
                    ))}
                </Select>
            )}
        />
    );
}
