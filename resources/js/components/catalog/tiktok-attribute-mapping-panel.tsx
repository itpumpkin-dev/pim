import { ListSubheader, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AttributeMappingTable } from '@/components/catalog/attribute-mapping-table';
import { CoverageStat } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow, useAttributeMapping } from '@/hooks/use-attribute-mapping';

// v1 only supports TikTok attributes marked is_customizable (the seller may
// type a free value) — see TikTokAttributeMappingController::update(),
// which rejects a mapping to any other attribute. Non-customizable
// (select-only) attributes are still listed (so an admin can see they
// exist) but disabled, since TikTok needs a specific predefined value for
// those rather than an arbitrary one — same scope decision already made
// for the Shopee/Lazada mapping pages.

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

// Single-value, "first mapped attribute with a value wins" fields feeding
// TikTok's own create/update product payload directly (title/price/
// inventory/package_*/description/video) — see
// TikTokProductSyncService::resolveMappedField(). Distinct from
// `tiktok_attribute` below, which feeds one entry of TikTok's own
// `product_attributes[]` instead — a structurally different destination,
// kept in its own dropdown group (and its own status caption).
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

// The target Select's value is a plain TargetField string for every fixed
// payload field, but a TikTok product-attribute mapping needs to also carry
// *which* one — encoded as this prefix + its id (e.g. "tiktok_attribute:100335")
// so one MUI Select can represent both without a second control.
const TIKTOK_ATTRIBUTE_PREFIX = 'tiktok_attribute:';

// Field identifiers are snake_case (matching the backend's target_field
// values) but this app's i18n keys are camelCase — same keys
// woocommerce-/shopee-/lazada-attribute-mapping-panel.tsx use for the same
// fields.
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

    // Backend reports payloadFields.missing as raw target_field keys — same
    // translation the picker's own dropdown uses, so the tooltip matches.
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
                            // TikTok's video field expects an uploaded file, not an
                            // external URL (see this field's backend guard) — only a
                            // PIM attribute of type `video` may ever target it.
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
