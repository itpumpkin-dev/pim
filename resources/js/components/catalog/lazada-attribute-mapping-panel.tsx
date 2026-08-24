import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 supports free-value Lazada attributes (input_type text/numeric) and
// richText fields (e.g. description/short_description, which accept real
// HTML) — see LazadaAttributeMappingController::update(), which rejects a
// mapping to any other input_type. singleSelect/multiSelect/enumInput
// attributes are still listed (so an admin can see they exist) but
// disabled, since Lazada needs a specific predefined option for those
// rather than an arbitrary value.
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

// Single-value, "first mapped attribute with a value wins" fields feeding
// Lazada's own payload directly (SellerSku/quantity/price/package_*/
// attributes.video) — see LazadaProductSyncService::resolveMappedField().
// Distinct from `lazada_attribute` below, which feeds one Lazada category
// attribute instead (payload.attributes or payload.skus[0], depending on
// that attribute's own attribute_type) — a structurally different
// destination, kept in its own dropdown group (and its own status caption).
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video'];

// The target Select's value is a plain TargetField string for every fixed
// payload field, but a Lazada category-attribute mapping needs to also
// carry *which* attribute — encoded as this prefix + its name (Lazada
// attributes are identified by name, not a numeric id) — e.g.
// "lazada_attribute:product_warranty".
const LAZADA_ATTRIBUTE_PREFIX = 'lazada_attribute:';

// Field identifiers are snake_case (matching the backend's target_field
// values) but this app's i18n keys are camelCase — same keys
// woocommerce-/shopee-attribute-mapping-panel.tsx use for the same fields.
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

    // Backend reports payloadFields.missing as raw target_field keys — same
    // translation the picker's own dropdown uses, so the tooltip matches.
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
                            // Lazada rejects external video URLs (see this field's
                            // backend guard) — only a PIM attribute of type `video`
                            // (an uploaded file) may ever target the Video field.
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
