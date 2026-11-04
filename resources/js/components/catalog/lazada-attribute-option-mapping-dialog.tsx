import '@ui5/webcomponents-icons/dist/decline.js';
import { Bar, BusyIndicator, Button, Dialog, Label, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';

import { xsrfToken } from '@/lib/csrf';

export interface LazadaAttributeOptionInfo {
    value: string;
    label: string;
}

export interface LazadaAttributeOptionMappingInfo {
    attribute_option_id: number;
    lazada_option_value: string;
}

interface PimOptionRow {
    id: number;
    code: string;
    label: string;
}

/**
 * "จับคู่ตัวเลือก" — สำหรับ Lazada attribute ที่ input_type เป็น singleSelect/
 * multiSelect/enumInput/multiEnumInput (ต้องมี PIM attribute ที่เป็น select/
 * multiselect ผูกไว้แล้วผ่าน PimAttributePicker ก่อน ดู lazada-products.tsx)
 * ต้องเลือกต่อว่า option แต่ละตัวของ PIM attribute นั้น (ซ้าย) ตรงกับตัวเลือก
 * ไหนที่ Lazada กำหนดไว้ล่วงหน้า (ขวา) — เขียนผ่าน
 * LazadaAttributeMappingController::updateOptionMappings()
 */
export function LazadaAttributeOptionMappingDialog({
    open,
    onClose,
    lazadaAttributeLabel,
    pimAttributeId,
    pimAttributeName,
    lazadaAttributeMappingId,
    lazadaOptions,
    initialMappings,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    lazadaAttributeLabel: string;
    pimAttributeId: number;
    pimAttributeName: string;
    lazadaAttributeMappingId: number | null;
    lazadaOptions: LazadaAttributeOptionInfo[];
    initialMappings: LazadaAttributeOptionMappingInfo[];
    onSaved: (mappings: LazadaAttributeOptionMappingInfo[]) => void;
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
            map[m.attribute_option_id] = m.lazada_option_value;
        });
        setValues(map);
    }, [open, initialMappings]);

    const handleSave = () => {
        if (!lazadaAttributeMappingId || !pimOptions) return;

        setSaving(true);
        const mappings = pimOptions.map((o) => {
            const value = values[o.id] || null;
            // ส่ง label ของตัวเลือกที่เลือกไว้ตอนนี้แนบไปด้วย — backend เก็บคู่กับ
            // value เพื่อไม่ต้องพึ่ง lazada_attributes.options (global cache ที่
            // sync ของ category อื่นทับได้ตลอดเวลา) ตอน resolve ชื่อจริงกลับตอน push
            const label = value ? (lazadaOptions.find((lo) => lo.value === value)?.label ?? null) : null;

            return {
                lazada_attribute_mapping_id: lazadaAttributeMappingId,
                attribute_option_id: o.id,
                lazada_option_value: value,
                lazada_option_label: label,
            };
        });

        fetch('/catalog/attributes/lazada-mapping/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings }),
        })
            .then((res) => {
                if (!res.ok) return;
                onSaved(
                    mappings
                        .filter((m): m is typeof m & { lazada_option_value: string } => Boolean(m.lazada_option_value))
                        .map((m) => ({ attribute_option_id: m.attribute_option_id, lazada_option_value: m.lazada_option_value })),
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
                            จับคู่ตัวเลือก — {lazadaAttributeLabel}
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
                                {lazadaOptions.map((lo) => (
                                    <Option key={lo.value} value={lo.value}>
                                        {lo.label}
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
