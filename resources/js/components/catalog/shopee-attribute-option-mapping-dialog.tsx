import '@ui5/webcomponents-icons/dist/decline.js';
import { Bar, BusyIndicator, Button, Dialog, Label, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';

import { xsrfToken } from '@/lib/csrf';

export interface ShopeeAttributeOptionInfo {
    value: string;
    label: string;
}

export interface ShopeeAttributeOptionMappingInfo {
    attribute_option_id: number;
    shopee_option_value: string;
}

interface PimOptionRow {
    id: number;
    code: string;
    label: string;
}

/**
 * Mirror ของ LazadaAttributeOptionMappingDialog เป๊ะ — ดูตัวนั้นๆ docblock
 * สำหรับ "จับคู่ตัวเลือก" ต่างกันแค่ endpoint/field name (shopee_ แทน lazada_)
 * เขียนผ่าน ShopeeAttributeMappingController::updateOptionMappings()
 */
export function ShopeeAttributeOptionMappingDialog({
    open,
    onClose,
    shopeeAttributeLabel,
    pimAttributeId,
    pimAttributeName,
    shopeeAttributeMappingId,
    shopeeOptions,
    initialMappings,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    shopeeAttributeLabel: string;
    pimAttributeId: number;
    pimAttributeName: string;
    shopeeAttributeMappingId: number | null;
    shopeeOptions: ShopeeAttributeOptionInfo[];
    initialMappings: ShopeeAttributeOptionMappingInfo[];
    onSaved: (mappings: ShopeeAttributeOptionMappingInfo[]) => void;
}) {
    const [pimOptions, setPimOptions] = useState<PimOptionRow[] | null>(null);
    const [values, setValues] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPimOptions(null);
        fetch(`/catalog/attributes/${pimAttributeId}/options-list`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: PimOptionRow[] }) => setPimOptions(body.data));
    }, [open, pimAttributeId]);

    useEffect(() => {
        if (!open) return;
        const map: Record<number, string> = {};
        initialMappings.forEach((m) => {
            map[m.attribute_option_id] = m.shopee_option_value;
        });
        setValues(map);
    }, [open, initialMappings]);

    const handleSave = () => {
        if (!shopeeAttributeMappingId || !pimOptions) return;

        setSaving(true);
        const mappings = pimOptions.map((o) => {
            const value = values[o.id] || null;
            const label = value ? (shopeeOptions.find((so) => so.value === value)?.label ?? null) : null;

            return {
                shopee_attribute_mapping_id: shopeeAttributeMappingId,
                attribute_option_id: o.id,
                shopee_option_value: value,
                shopee_option_label: label,
            };
        });

        fetch('/catalog/attributes/shopee-mapping/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings }),
        })
            .then((res) => {
                if (!res.ok) return;
                onSaved(
                    mappings
                        .filter((m): m is typeof m & { shopee_option_value: string } => Boolean(m.shopee_option_value))
                        .map((m) => ({ attribute_option_id: m.attribute_option_id, shopee_option_value: m.shopee_option_value })),
                );
                onClose();
            })
            .finally(() => setSaving(false));
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            style={{ width: 'min(600px, calc(100vw - 2rem))' }}
            header={
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.5rem 0',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <Title level="H5" size="H5" wrappingType="Normal">
                            จับคู่ตัวเลือก — {shopeeAttributeLabel}
                        </Title>
                        <Text style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>
                            PIM attribute ต้นทาง: {pimAttributeName}
                        </Text>
                    </div>
                    <Button design="Transparent" icon="decline" tooltip="ปิด" accessibleName="ปิด" onClick={onClose} />
                </div>
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button
                                design="Emphasized"
                                onClick={handleSave}
                                disabled={saving || !pimOptions || pimOptions.length === 0}
                                loading={saving}
                                loadingDelay={0}
                            >
                                บันทึก
                            </Button>
                            <Button design="Transparent" onClick={onClose}>
                                ยกเลิก
                            </Button>
                        </>
                    }
                />
            }
        >
            {!pimOptions ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
                    <BusyIndicator active delay={0} size="M" />
                </div>
            ) : pimOptions.length === 0 ? (
                <Text style={{ display: 'block', padding: '1rem 0', color: 'var(--sapContent_LabelColor)' }}>
                    PIM attribute นี้ยังไม่มีตัวเลือก (option) เลย — ไปเพิ่มที่หน้าแก้ไข attribute ก่อน
                </Text>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {pimOptions.map((o) => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <Label for={`option-map-${o.id}`} showColon={false} wrappingType="Normal" style={{ minWidth: 160, flexShrink: 0 }}>
                                {o.label}
                            </Label>
                            <Select
                                id={`option-map-${o.id}`}
                                style={{ flex: 1, minWidth: 0 }}
                                value={values[o.id] ?? ''}
                                onChange={(e) => {
                                    const next = e.detail.selectedOption.value ?? '';
                                    setValues((prev) => ({ ...prev, [o.id]: next }));
                                }}
                            >
                                <Option value="">— ไม่แมป —</Option>
                                {shopeeOptions.map((so) => (
                                    <Option key={so.value} value={so.value}>
                                        {so.label}
                                    </Option>
                                ))}
                            </Select>
                        </div>
                    ))}
                </div>
            )}
        </Dialog>
    );
}
