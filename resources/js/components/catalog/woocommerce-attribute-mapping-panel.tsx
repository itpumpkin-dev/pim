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

// Three resolution modes, not just three groups of labels — see
// WooCommerceProductSyncService::buildContentFields() (compose every
// mapped attribute), resolveMappedField() (first mapped attribute with a
// value wins), and buildWooCommerceAttributes() (first-match-wins per
// distinct woocommerce_attribute_id). The grouping below exists to make
// that distinction visible in the picker, not just for tidiness. Video has
// no type restriction here (unlike Shopee/Lazada/TikTok's video fields) —
// WooCommerce pushes it as a plain `meta_data[key=youtube_url]` URL string,
// no upload/transcode API involved, so any text-shaped attribute works.
const CONTENT_FIELDS: TargetField[] = ['description', 'short_description'];
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video'];

// The target Select's value is a plain TargetField string for every fixed
// target, but a WooCommerce Product Attribute mapping needs to also carry
// *which* one — encoded as this prefix + its id (e.g. "wc_attribute:7") so
// one MUI Select can represent both without a second control.
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

// Field identifiers are snake_case (matching the backend's target_field
// values) but this app's i18n keys are camelCase — map explicitly rather
// than assuming `t(field)` resolves, which would silently fail for
// short_description.
// 'wc_attribute' has no fixed label here — its MenuItem is rendered from
// the synced WooCommerce attribute's own name instead (see WC_ATTRIBUTE_PREFIX).
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

    // Backend reports payloadFields.missing as raw target_field keys (e.g.
    // "short_description") — translate through the same FIELD_LABEL_KEYS
    // map the picker itself uses, so the tooltip reads like the UI does.
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
