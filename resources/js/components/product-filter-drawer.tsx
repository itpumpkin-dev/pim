import { PRODUCT_STATUS_LABEL_KEYS, PRODUCT_STATUSES, type ProductStatus } from '@/lib/product-status';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import { Bar, Button, ComboBox, ComboBoxItem, Dialog, FlexBox, Input, Label, Option, Select } from '@ui5/webcomponents-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ProductFamilyOption {
    id: number;
    code: string;
    name?: string | null;
}

export interface ProductFilterableAttribute {
    id: number;
    code: string;
    label: string;
    type: string;
    is_filterable?: boolean;
}

export interface ProductFilters {
    sku?: string;
    name?: string;
    family_id?: number | '';
    enabled?: '' | '1' | '0';
    status?: '' | ProductStatus;
    type?: '' | 'simple' | 'configurable';
    [key: string]: string | number | undefined;
}

export interface AttributeFilterRow {
    attribute_id: number | '';
    value: string;
    [key: string]: string | number;
}

/**
 * Product-specific filter drawer: SKU/Name/Status/Type are simple fields,
 * Attribute Family is a real column (family_id), and "Add Filter" lets the
 * user filter by any attribute flagged `is_filterable` — those go through a
 * separate EAV (ProductValue) query on the backend since they aren't columns
 * on the `products` table itself.
 */
export function ProductFilterDrawer({
    open,
    onClose,
    families,
    attributes,
    filters,
    attributeFilters,
    onApply,
}: {
    open: boolean;
    onClose: () => void;
    families: ProductFamilyOption[];
    attributes: ProductFilterableAttribute[];
    filters: ProductFilters;
    attributeFilters: AttributeFilterRow[];
    onApply: (filters: ProductFilters, attributeFilters: AttributeFilterRow[]) => void;
}) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const [draftFilters, setDraftFilters] = useState<ProductFilters>(filters);
    const [draftAttrFilters, setDraftAttrFilters] = useState<AttributeFilterRow[]>(attributeFilters);

    useEffect(() => {
        if (open) {
            setDraftFilters(filters);
            setDraftAttrFilters(attributeFilters);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filterableAttributes = attributes.filter((attr) => attr.is_filterable);

    const addFilterRow = () => setDraftAttrFilters((prev) => [...prev, { attribute_id: '', value: '' }]);

    const updateFilterRow = (index: number, patch: Partial<AttributeFilterRow>) =>
        setDraftAttrFilters((prev) => prev.map((row, i) => (i === index ? ({ ...row, ...patch } as AttributeFilterRow) : row)));

    const removeFilterRow = (index: number) => setDraftAttrFilters((prev) => prev.filter((_, i) => i !== index));

    const save = () => {
        const cleaned: ProductFilters = {};
        if (draftFilters.sku) cleaned.sku = draftFilters.sku;
        if (draftFilters.name) cleaned.name = draftFilters.name;
        if (draftFilters.family_id) cleaned.family_id = draftFilters.family_id;
        if (draftFilters.enabled) cleaned.enabled = draftFilters.enabled;
        if (draftFilters.status) cleaned.status = draftFilters.status;
        if (draftFilters.type) cleaned.type = draftFilters.type;

        const cleanedAttrFilters = draftAttrFilters.filter((row) => row.attribute_id !== '' && row.value !== '');

        onApply(cleaned, cleanedAttrFilters);
        onClose();
    };

    // ไม่มี Drawer ใน UI5 → ใช้ Dialog แทน (ESC/ปิดเอง → sync state ผ่าน onClose)
    return (
        <Dialog
            open={open}
            onClose={onClose}
            headerText={t('filterDrawerTitle')}
            style={{ width: 'min(400px, 95vw)' }}
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button design="Transparent" onClick={onClose}>
                                {t('cancel')}
                            </Button>
                            <Button design="Emphasized" onClick={save}>
                                {t('filterDrawerSave')}
                            </Button>
                        </>
                    }
                />
            }
        >
            <FlexBox direction="Column" style={{ gap: '1.25rem' }}>
                <FilterField id="product-filter-sku" label="SKU">
                    <Input
                        id="product-filter-sku"
                        style={{ width: '100%' }}
                        placeholder="SKU"
                        value={draftFilters.sku ?? ''}
                        onInput={(e) => setDraftFilters((prev) => ({ ...prev, sku: e.target.value }))}
                    />
                </FilterField>

                <FilterField id="product-filter-name" label={t('filterDrawerName')}>
                    <Input
                        id="product-filter-name"
                        style={{ width: '100%' }}
                        placeholder={t('filterDrawerName')}
                        value={draftFilters.name ?? ''}
                        onInput={(e) => setDraftFilters((prev) => ({ ...prev, name: e.target.value }))}
                    />
                </FilterField>

                <FilterField id="product-filter-family" label={t('filterDrawerAttributeFamily')}>
                    <Select
                        id="product-filter-family"
                        style={{ width: '100%' }}
                        value={draftFilters.family_id === undefined || draftFilters.family_id === '' ? '' : String(draftFilters.family_id)}
                        onChange={(e) => {
                            const value = e.detail.selectedOption?.value ?? '';
                            setDraftFilters((prev) => ({ ...prev, family_id: value === '' ? '' : Number(value) }));
                        }}
                    >
                        <Option value="">{t('filterDrawerSelectOption')}</Option>
                        {families.map((family) => (
                            <Option key={family.id} value={String(family.id)}>
                                {family.name || family.code}
                            </Option>
                        ))}
                    </Select>
                </FilterField>

                <FilterField id="product-filter-enabled" label={tCatalog('publishing')}>
                    <Select
                        id="product-filter-enabled"
                        style={{ width: '100%' }}
                        value={draftFilters.enabled ?? ''}
                        onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, enabled: (e.detail.selectedOption?.value ?? '') as ProductFilters['enabled'] }))
                        }
                    >
                        <Option value="">{t('filterDrawerSelect')}</Option>
                        <Option value="1">{tCatalog('published')}</Option>
                        <Option value="0">{tCatalog('unpublished')}</Option>
                    </Select>
                </FilterField>

                {/* ว่าง = ทุกสถานะยกเว้น Delete (ฝั่ง backend ซ่อน Delete ไว้
                    โดยตั้งต้น — ดู ProductController::index()) */}
                <FilterField id="product-filter-status" label={tCatalog('productStatus')}>
                    <Select
                        id="product-filter-status"
                        style={{ width: '100%' }}
                        value={draftFilters.status ?? ''}
                        onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, status: (e.detail.selectedOption?.value ?? '') as ProductFilters['status'] }))
                        }
                    >
                        <Option value="">{t('filterDrawerSelect')}</Option>
                        {PRODUCT_STATUSES.map((status) => (
                            <Option key={status} value={status}>
                                {tCatalog(PRODUCT_STATUS_LABEL_KEYS[status])}
                            </Option>
                        ))}
                    </Select>
                </FilterField>

                <FilterField id="product-filter-type" label={t('filterDrawerType')}>
                    <Select
                        id="product-filter-type"
                        style={{ width: '100%' }}
                        value={draftFilters.type ?? ''}
                        onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, type: (e.detail.selectedOption?.value ?? '') as ProductFilters['type'] }))
                        }
                    >
                        <Option value="">{t('filterDrawerSelect')}</Option>
                        <Option value="simple">{t('filterDrawerSimple')}</Option>
                        <Option value="configurable">{t('filterDrawerConfigurable')}</Option>
                    </Select>
                </FilterField>

                {draftAttrFilters.map((row, index) => (
                    <FlexBox key={index} alignItems="Center" style={{ gap: '0.5rem' }}>
                        <ComboBox
                            style={{ flex: 1, minWidth: 0 }}
                            placeholder={t('filterDrawerSearchAttribute')}
                            selectedValue={row.attribute_id === '' ? '' : String(row.attribute_id)}
                            onSelectionChange={(e) => {
                                const value = e.detail.item?.value;
                                updateFilterRow(index, { attribute_id: value ? Number(value) : '' });
                            }}
                        >
                            {filterableAttributes.map((attr) => (
                                <ComboBoxItem key={attr.id} value={String(attr.id)} text={attr.label || attr.code} />
                            ))}
                        </ComboBox>
                        <Input
                            style={{ flex: 1, minWidth: 0 }}
                            placeholder={t('filterDrawerValue')}
                            value={row.value}
                            onInput={(e) => updateFilterRow(index, { value: e.target.value })}
                        />
                        <Button design="Transparent" icon="decline" onClick={() => removeFilterRow(index)} />
                    </FlexBox>
                ))}

                <Button icon="add" onClick={addFilterRow} style={{ width: '100%' }}>
                    {t('filterDrawerAddFilter')}
                </Button>
            </FlexBox>
        </Dialog>
    );
}

function FilterField({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
    return (
        <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
            <Label for={id} showColon={false} style={{ fontWeight: 600 }}>
                {label}
            </Label>
            {children}
        </FlexBox>
    );
}
