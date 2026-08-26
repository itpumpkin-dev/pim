import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 รองรับแค่ TikTok attribute ที่ติดแฟล็ก is_customizable เท่านั้น (ผู้ขาย
// พิมพ์ค่าเองได้อิสระ) — ดูที่ TikTokAttributeMappingController::update()
// ซึ่งจะปฏิเสธการ mapping ไป attribute แบบอื่น ส่วน attribute ที่ไม่ใช่
// customizable (เลือกจากลิสต์อย่างเดียว) ยังคงแสดงในลิสต์อยู่ (เพื่อให้แอดมิน
// เห็นว่ามีอยู่จริง) แต่จะกดเลือกไม่ได้ เพราะ TikTok ต้องการค่าที่กำหนดไว้
// ล่วงหน้าเฉพาะเจาะจง ไม่ใช่ค่าอิสระ — เป็น scope decision เดียวกับที่ใช้
// กับหน้า mapping ของ Shopee/Lazada อยู่แล้ว

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
    | 'tiktok_attribute'
    | '';

// ฟิลด์แบบ single-value คือ "attribute ตัวแรกที่ map ไว้แล้วมีค่าจะชนะ"
// ส่งค่าตรงเข้า payload สร้าง/อัปเดตสินค้าของ TikTok เอง (title/price/
// inventory/package_*/description/video) — ดูที่
// TikTokProductSyncService::resolveMappedField() ต่างจาก `tiktok_attribute`
// ด้านล่างนี้ ซึ่งจะไปลงที่ entry หนึ่งใน `product_attributes[]` ของ TikTok
// แทน — ปลายทางต่างกันโดยโครงสร้าง เลยแยกกลุ่ม dropdown ออกจากกัน
// (และมี status caption ของตัวเอง)
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

// ค่าของ target Select จะเป็น string ของ TargetField ธรรมดาสำหรับฟิลด์
// payload ที่ตายตัวทุกตัว แต่ถ้าเป็นการ mapping ไป TikTok product-attribute
// ต้องแนบด้วยว่า *ตัวไหน* — เลยเข้ารหัสเป็น prefix นี้ + id (เช่น
// "tiktok_attribute:100335") เพื่อให้ MUI Select ตัวเดียวแทนทั้งสองแบบได้
// โดยไม่ต้องมี control ตัวที่สอง
const TIKTOK_ATTRIBUTE_PREFIX = 'tiktok_attribute:';

// ชื่อฟิลด์เป็น snake_case (ตรงกับค่า target_field ฝั่ง backend) แต่ i18n key
// ของแอปนี้เป็น camelCase — คีย์เดียวกับที่
// woocommerce-/shopee-/lazada-attribute-mapping-panel.tsx ใช้กับฟิลด์เดียวกัน
const FIELD_LABEL_KEYS: Record<Exclude<TargetField, '' | 'tiktok_attribute'>, string> = {
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

interface TikTokAttributeOption {
    id: string;
    name: string;
    is_customizable: boolean | null;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: TargetField | null;
    tiktok_attribute_id: string | null;
    sort_order: number;
}

export interface TikTokAttributeMappingPanelProps {
    attributes: AttributeRow[];
    tiktokAttributes: TikTokAttributeOption[];
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };
}

export function TikTokAttributeMappingPanel({ attributes, tiktokAttributes, coverage }: TikTokAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const rows: MappingAttributeRow[] = attributes.map((a) => ({
        id: a.id,
        code: a.code,
        label: a.label,
        type: a.type,
        target_field: a.target_field,
        custom_id: a.tiktok_attribute_id,
        sort_order: a.sort_order,
    }));

    const mapping = useAttributeMapping({
        attributes: rows,
        saveUrl: '/catalog/attributes/tiktok-mapping',
        syncUrl: '/catalog/attributes/tiktok-mapping/sync',
        buildSavePayload: (entry) => ({
            attribute_id: entry.attribute_id,
            target_field: entry.target_field,
            tiktok_attribute_id: entry.custom_id,
            sort_order: entry.sort_order,
        }),
    });

    // Backend ส่ง payloadFields.missing มาเป็น target_field key ดิบๆ — ใช้
    // ชุดคำแปลเดียวกับที่ dropdown ของตัว picker เองใช้ เพื่อให้ tooltip ตรงกัน
    const payloadFieldsCoverage = {
        ...coverage.payloadFields,
        missing: coverage.payloadFields.missing.map((field) => t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'tiktok_attribute'>])),
    };

    const buildTargetValue = (row: MappingAttributeRow): string => {
        const entry = mapping.valueFor(row);
        return entry.target_field === 'tiktok_attribute' && entry.custom_id ? `${TIKTOK_ATTRIBUTE_PREFIX}${entry.custom_id}` : entry.target_field;
    };

    const applySelectValue = (row: MappingAttributeRow, raw: string) => {
        if (raw.startsWith(TIKTOK_ATTRIBUTE_PREFIX)) {
            mapping.setEntry(row, { target_field: 'tiktok_attribute', custom_id: raw.slice(TIKTOK_ATTRIBUTE_PREFIX.length) });
        } else {
            mapping.setEntry(row, { target_field: raw, custom_id: null });
        }
    };

    return (
        <AttributeMappingTable
            platform="tiktok"
            helpTextKey="tiktokAttributeMappingHelp"
            syncLabelKey="syncFromTiktok"
            coverage={{ payloadFields: payloadFieldsCoverage, platformAttributes: coverage.platformAttributes }}
            search={mapping.search}
            onSearchChange={mapping.setSearch}
            status={mapping.status}
            onStatusChange={mapping.setStatus}
            filtered={mapping.filtered}
            isMapped={mapping.isMapped}
            hasPendingChange={mapping.hasPendingChange}
            statusCaption={(row) => (mapping.valueFor(row).target_field === 'tiktok_attribute' ? t('mappedToTiktokAttribute') : t('mappedToPayload'))}
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
                    <ListSubheader>{t('tiktokPayloadFieldsGroup')}</ListSubheader>
                    {STRUCTURED_FIELDS.map((field) => (
                        <MenuItem
                            key={field}
                            value={field}
                            // ฟิลด์วิดีโอของ TikTok ต้องการไฟล์ที่อัปโหลดจริงๆ ไม่ใช่
                            // URL จากภายนอก (ดู backend guard ของฟิลด์นี้) — จะมีแค่
                            // PIM attribute ประเภท `video` เท่านั้นที่ map มาที่นี่ได้
                            disabled={field === 'video' && row.type !== 'video'}
                        >
                            {t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'tiktok_attribute'>])}
                        </MenuItem>
                    ))}
                    <ListSubheader>{t('tiktokAttributesGroup')}</ListSubheader>
                    {tiktokAttributes.map((ta) => (
                        <MenuItem key={ta.id} value={`${TIKTOK_ATTRIBUTE_PREFIX}${ta.id}`} disabled={!ta.is_customizable}>
                            {ta.name}
                            {!ta.is_customizable ? ` ${t('tiktokSelectUnsupported')}` : ''}
                        </MenuItem>
                    ))}
                </Select>
            )}
        />
    );
}
