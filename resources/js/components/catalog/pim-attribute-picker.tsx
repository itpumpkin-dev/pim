import '@ui5/webcomponents-icons/dist/accept.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/value-help.js';
import {
    Bar,
    BusyIndicator,
    Button,
    Dialog,
    FlexBox,
    Icon,
    Input,
    List,
    ListItemStandard,
    SegmentedButton,
    SegmentedButtonItem,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';

export interface PimAttributeOption {
    id: number;
    name: string;
    /** null = สร้างเองในระบบ PIM ตามปกติ — ไม่ null = สร้างอัตโนมัติตอนกด
     * "สร้าง/อัปเดต Attribute Family" ของแพลตฟอร์มนั้น (ดู
     * {Platform}MappedAttributeCreator::findOrCreateAttribute()) — ใช้โชว์
     * chip บอกที่มาในดรอปดาวน์ด้านล่าง ไม่มีค่า (undefined) เมื่อ endpoint ที่
     * เรียกยังไม่ได้ส่งฟิลด์นี้มา (เช่น response เก่าที่แคชไว้) ให้ถือว่าไม่รู้
     * ที่มา ไม่โชว์ chip เลยดีกว่าโชว์ผิด */
    auto_created_platform?: 'shopee' | 'lazada' | 'tiktok' | null;
}

/** แถวจาก listAllPimAttributes() — มี code/type เพิ่มมาจาก PimAttributeOption
 * เฉยๆ เพราะหน้าต่าง "ดู attributes ทั้งหมด" มีที่ว่างพอจะโชว์รายละเอียด
 * มากกว่าดรอปดาวน์ค้นหาแบบย่อ */
interface PimAttributeRow extends PimAttributeOption {
    code: string;
    type: string;
}

type SourceFilter = 'all' | 'pim' | 'shopee' | 'lazada' | 'tiktok';

/** ป้ายบอกที่มาของ attribute (ท้ายแถวในหน้าต่างรายการทั้งหมด) — สร้างเองในระบบ
 * PIM ตามปกติ ("PIM", ไม่มีสี) หรือถูกสร้างอัตโนมัติตอนกด "สร้าง/อัปเดต
 * Attribute Family" ของแพลตฟอร์มไหน (สีตามแพลตฟอร์มนั้น) */
const PLATFORM_CHIP: Record<'shopee' | 'lazada' | 'tiktok', { label: string; state: 'Information' | 'Critical' | 'Positive' }> = {
    shopee: { label: 'Shopee', state: 'Information' },
    lazada: { label: 'Lazada', state: 'Critical' },
    tiktok: { label: 'TikTok', state: 'Positive' },
};

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'pim', label: 'PIM' },
    { value: 'shopee', label: 'Shopee' },
    { value: 'lazada', label: 'Lazada' },
    { value: 'tiktok', label: 'TikTok' },
];

/**
 * หน้าต่าง "Attributes ทั้งหมด" — ทางเลือก PIM attribute ทางเดียวของ <PimAttributePicker>
 * (กดปุ่ม value help แล้วเปิดหน้าต่างนี้) ไล่ดู/ค้นหา/กรองทั้งรายการเพื่อหา attribute ที่
 * เหมาะสม (เช่น กรองดูเฉพาะที่ระบบสร้างอัตโนมัติให้ Shopee ไว้ก่อนหน้านี้)
 * โหลดทั้งหมดครั้งเดียวตอนเปิด (จำนวน attribute ทั้งระบบหลักร้อยเท่านั้น —
 * ดู ShopeeAttributeMappingController::listAllPimAttributes()'s docblock)
 * แล้วกรองด้วยคำค้นหา/แหล่งที่มาแบบ client-side ทั้งหมด ไม่ยิง request ซ้ำ
 */
function PimAttributeBrowserDialog({
    open,
    onClose,
    onSelect,
    typeFilter,
    selectedId = null,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (attr: PimAttributeOption) => void;
    typeFilter?: string[];
    /** attribute ที่เลือกอยู่ตอนนี้ — มีเครื่องหมาย ✓ ในรายการ */
    selectedId?: number | null;
}) {
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState<PimAttributeRow[]>([]);
    const [search, setSearch] = useState('');
    const [source, setSource] = useState<SourceFilter>('all');

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const params = new URLSearchParams();
        if (typeFilter && typeFilter.length > 0) {
            params.set('type', typeFilter.join(','));
        }

        fetch(`/catalog/attributes/list-all-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: PimAttributeRow[] }) => setAttributes(body.data))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, typeFilter?.join(',')]);

    // เคลียร์ตัวกรองทุกครั้งที่ปิด ไม่งั้นเปิดใหม่รอบหน้าจะเห็นตัวกรองเดิมค้าง
    // อยู่โดยไม่ได้ตั้งใจ
    useEffect(() => {
        if (!open) {
            setSearch('');
            setSource('all');
        }
    }, [open]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return attributes.filter((attr) => {
            const matchesSearch = needle === '' || attr.name.toLowerCase().includes(needle) || attr.code.toLowerCase().includes(needle);
            const matchesSource = source === 'all' || (source === 'pim' ? !attr.auto_created_platform : attr.auto_created_platform === source);

            return matchesSearch && matchesSource;
        });
    }, [attributes, search, source]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            style={{ width: '37.5rem', maxWidth: '100%', height: '80vh' }}
            header={
                <Bar
                    startContent={<Title level="H5">Attributes ทั้งหมด</Title>}
                    endContent={<Button design="Transparent" icon="decline" tooltip="Close" accessibleName="Close" onClick={onClose} />}
                />
            }
        >
            <FlexBox direction="Column" style={{ height: '100%', margin: '-1rem' }}>
                <FlexBox direction="Column" style={{ gap: '0.75rem', padding: '1rem' }}>
                    <Input
                        placeholder="ค้นหาด้วยชื่อหรือโค้ด..."
                        value={search}
                        onInput={(e) => setSearch(e.target.value)}
                        icon={<Icon name="search" />}
                        style={{ width: '100%' }}
                    />
                    <SegmentedButton
                        style={{ flexWrap: 'wrap' }}
                        onSelectionChange={(e) => {
                            const val = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as SourceFilter | undefined;
                            if (val) setSource(val);
                        }}
                    >
                        {SOURCE_FILTERS.map((opt) => (
                            <SegmentedButtonItem key={opt.value} data-value={opt.value} selected={source === opt.value}>
                                {opt.label}
                            </SegmentedButtonItem>
                        ))}
                    </SegmentedButton>
                </FlexBox>

                <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }}>
                    {loading ? (
                        <FlexBox alignItems="Center" justifyContent="Center" style={{ height: '100%' }}>
                            <BusyIndicator active size="M" />
                        </FlexBox>
                    ) : filtered.length === 0 ? (
                        <Text style={{ display: 'block', textAlign: 'center', padding: '2rem 0', color: 'var(--sapContent_LabelColor)' }}>
                            ไม่พบ attribute ที่ตรงกับตัวกรอง
                        </Text>
                    ) : (
                        <List>
                            {filtered.map((attr) => {
                                const meta = attr.auto_created_platform ? PLATFORM_CHIP[attr.auto_created_platform] : null;

                                return (
                                    <ListItemStandard
                                        key={attr.id}
                                        text={attr.name}
                                        icon={attr.id === selectedId ? 'accept' : undefined}
                                        description={`${attr.code} · ${attr.type}`}
                                        additionalText={attr.auto_created_platform === undefined ? undefined : meta ? meta.label : 'PIM'}
                                        additionalTextState={meta ? meta.state : 'None'}
                                        onClick={() => {
                                            onSelect(attr);
                                            onClose();
                                        }}
                                    />
                                );
                            })}
                        </List>
                    )}
                </div>
            </FlexBox>
        </Dialog>
    );
}

/**
 * ตัวเลือก PIM attribute (ต้นทาง) ของตาราง mapping — เป็นปุ่มเดียว (Fiori value help):
 * โชว์ชื่อ attribute ที่เลือกอยู่ กดแล้วเปิดหน้าต่าง "Attributes ทั้งหมด"
 * (<PimAttributeBrowserDialog>) ให้ค้นหา/กรองตามแหล่งที่มาแล้วคลิกเลือก — เดิมเป็น
 * dropdown ค้นหา (AsyncSearchComboBox) + ลิงก์ "ดู attributes ทั้งหมด" แยกกัน
 * ปุ่ม ✕ ข้างๆ ใช้ล้างการแมพ (เหมือนปุ่ม clear ของ dropdown เดิม)
 */
export function PimAttributePicker({
    value,
    onChange,
    placeholder,
    disabled,
    typeFilter,
}: {
    value: PimAttributeOption | null;
    onChange: (next: PimAttributeOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
    // จำกัดรายการให้เหลือแค่ PIM attribute type ที่ระบุ (เช่น ['image','file']
    // สำหรับ Lazada `img`-type attribute — ดู LazadaAttributeMappingController's
    // update() ที่บังคับเงื่อนไขเดียวกันฝั่ง backend) ไม่ระบุ = ทุก type
    typeFilter?: string[];
}) {
    const [browserOpen, setBrowserOpen] = useState(false);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
            <Button
                design="Default"
                icon="value-help"
                disabled={disabled}
                tooltip={value ? `${value.name} — คลิกเพื่อเปลี่ยน` : 'คลิกเพื่อเลือก PIM attribute'}
                accessibleName={value ? `PIM attribute: ${value.name}` : (placeholder ?? 'เลือก PIM attribute')}
                onClick={() => setBrowserOpen(true)}
                style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'start', fontStyle: value ? 'normal' : 'italic' }}
            >
                {value ? value.name : (placeholder ?? 'เลือก PIM attribute...')}
            </Button>
            {value && (
                <Button
                    design="Transparent"
                    icon="decline"
                    disabled={disabled}
                    tooltip="ล้างการแมพ"
                    accessibleName="ล้างการแมพ"
                    onClick={() => onChange(null)}
                />
            )}
            <PimAttributeBrowserDialog
                open={browserOpen}
                onClose={() => setBrowserOpen(false)}
                onSelect={onChange}
                typeFilter={typeFilter}
                selectedId={value?.id ?? null}
            />
        </div>
    );
}
