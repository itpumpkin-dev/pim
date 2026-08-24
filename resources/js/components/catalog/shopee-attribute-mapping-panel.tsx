import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 only supports free-text Shopee attributes (input_type 3) — see
// ShopeeAttributeMappingController::update(), which rejects a mapping to
// any other input_type. Select/dropdown attributes are still listed (so an
// admin can see they exist) but disabled, since Shopee needs a specific
// value_id for those rather than free text.
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

// All nine of these are single-value, "first mapped attribute with a value
// wins" fields feeding Shopee's own add_item/update_item payload directly
// (item_name/original_price/seller_stock/weight/dimension/description/
// video_upload_id) — see ShopeeProductSyncService::resolveMappedField().
// Distinct from `shopee_attribute` below, which feeds one entry of
// Shopee's own `attribute_list[]` instead — a structurally different
// destination, kept in its own dropdown group (and its own status caption)
// so the two are never confused for each other.
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

// The target Select's value is a plain TargetField string for every fixed
// payload field, but a Shopee attribute_list mapping needs to also carry
// *which* Shopee attribute — encoded as this prefix + its id (e.g.
// "shopee_attribute:7") so one MUI Select can represent both without a
// second control.
const SHOPEE_ATTRIBUTE_PREFIX = 'shopee_attribute:';

// Field identifiers are snake_case (matching the backend's target_field
// values) but this app's i18n keys are camelCase — these are the same keys
// woocommerce-attribute-mapping-panel.tsx uses for the same fields.
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

    // Backend reports payloadFields.missing as raw target_field keys — same
    // translation the picker's own dropdown uses, so the tooltip matches.
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
                            // Shopee's video field expects an uploaded file, not an
                            // external URL (see this field's backend guard) — only a
                            // PIM attribute of type `video` may ever target it.
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
