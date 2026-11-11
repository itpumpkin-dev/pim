import { FioriMessageStrip } from '@/components/fiori-form';
import '@ui5/webcomponents-icons/dist/download.js';
import { Button, CheckBox, Label, SegmentedButton, SegmentedButtonItem, Text, Toolbar, ToolbarSpacer } from '@ui5/webcomponents-react';
import { useState, type CSSProperties } from 'react';

const xsrfToken = () =>
    decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );

export interface ImagePlan {
    status: 'ready' | 'empty' | 'unsupported' | 'not_in_family' | 'no_permission';
    reason: string | null;
    current: { path: string; url: string }[];
    source: string[];
    default_mode: 'replace' | 'append';
}

const THUMB = 88;

const thumbStyle = (selected: boolean): CSSProperties => ({
    width: THUMB,
    height: THUMB,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 'var(--sapElement_BorderCornerRadius)',
    border: `2px solid ${selected ? 'var(--sapSelectedColor)' : 'var(--sapGroup_ContentBorderColor)'}`,
    background: 'var(--sapField_Background)',
});

/**
 * เฟส 2 — รูปภาพ (ListingImageImportService): เลือกรูปบน platform (ลำดับที่คลิก =
 * ลำดับในแกลเลอรี) แล้วดาวน์โหลดเข้า pgallery ของ PIM แบบแทนที่ / ต่อท้าย
 */
export function ImageImport({
    plan,
    productId,
    listingId,
    platformLabel,
    onDone,
}: {
    plan: ImagePlan;
    productId: number;
    listingId: number;
    platformLabel: string;
    onDone: (message: string) => void;
}) {
    // แกลเลอรียังว่าง → เลือกทุกรูปไว้ให้ (แทนที่) / มีรูปแล้ว → ไม่เลือกอะไร (ต่อท้าย)
    const [order, setOrder] = useState<string[]>(plan.current.length === 0 ? plan.source : []);
    const [mode, setMode] = useState<'replace' | 'append'>(plan.default_mode);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (url: string) => setOrder((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));

    const save = () => {
        setSaving(true);
        setError(null);
        fetch(`/catalog/marketplace/products/${productId}/listing-import/${listingId}/images`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: order, mode }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || 'บันทึกรูปภาพไม่สำเร็จ');
                onDone(body.message);
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setSaving(false));
    };

    if (plan.status !== 'ready') {
        return <FioriMessageStrip severity={plan.status === 'empty' ? 'information' : 'warning'}>{plan.reason}</FioriMessageStrip>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
                <Label showColon>ใน PIM ตอนนี้ ({plan.current.length})</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {plan.current.length === 0 && <Text>— ยังไม่มีรูปในแกลเลอรี</Text>}
                    {plan.current.map((img) => (
                        <img key={img.path} src={img.url} alt="" loading="lazy" style={thumbStyle(false)} />
                    ))}
                </div>
            </div>

            <div>
                <Toolbar design="Transparent" style={{ padding: 0 }}>
                    <Label showColon>
                        บน {platformLabel} ({plan.source.length}) — คลิกเพื่อเลือก ลำดับที่คลิก = ลำดับในแกลเลอรี
                    </Label>
                    <ToolbarSpacer />
                    <Button design="Transparent" disabled={saving} onClick={() => setOrder(plan.source)}>
                        เลือกทั้งหมด
                    </Button>
                    <Button design="Transparent" disabled={saving || order.length === 0} onClick={() => setOrder([])}>
                        ล้าง
                    </Button>
                </Toolbar>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {plan.source.map((url, i) => {
                        const position = order.indexOf(url);
                        const isSelected = position !== -1;
                        return (
                            <div key={url} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img
                                    src={url}
                                    alt={`รูปที่ ${i + 1} บน ${platformLabel}`}
                                    loading="lazy"
                                    style={{ ...thumbStyle(isSelected), cursor: saving ? 'default' : 'pointer' }}
                                    onClick={() => !saving && toggle(url)}
                                />
                                <CheckBox
                                    text={isSelected ? `ลำดับ ${position + 1}` : 'เลือก'}
                                    checked={isSelected}
                                    disabled={saving}
                                    accessibleName={`รูปที่ ${i + 1}`}
                                    onChange={() => toggle(url)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <Toolbar design="Transparent" style={{ padding: 0 }}>
                <SegmentedButton
                    accessibleName="วิธีบันทึกรูป"
                    onSelectionChange={(e) =>
                        setMode((e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.mode === 'append' ? 'append' : 'replace')
                    }
                >
                    <SegmentedButtonItem data-mode="replace" selected={mode === 'replace'}>
                        แทนที่แกลเลอรีเดิม
                    </SegmentedButtonItem>
                    <SegmentedButtonItem data-mode="append" selected={mode === 'append'}>
                        ต่อท้ายแกลเลอรีเดิม
                    </SegmentedButtonItem>
                </SegmentedButton>
                <ToolbarSpacer />
                <Button design="Emphasized" icon="download" disabled={order.length === 0 || saving} loading={saving} loadingDelay={0} onClick={save}>
                    บันทึกรูปลง PIM ({order.length})
                </Button>
            </Toolbar>

            {mode === 'replace' && plan.current.length > 0 && (
                <FioriMessageStrip severity="warning">
                    "แทนที่" จะเอารูปเดิม {plan.current.length} รูปออกจากแกลเลอรี (ใช้กับทุกช่องทาง)
                </FioriMessageStrip>
            )}
            {error && (
                <FioriMessageStrip severity="error" onClose={() => setError(null)}>
                    {error}
                </FioriMessageStrip>
            )}
        </div>
    );
}
