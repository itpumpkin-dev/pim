import { xsrfToken } from '@/lib/csrf';
import { fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';
import CloseIcon from '@mui/icons-material/Close';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

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
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                        จับคู่ตัวเลือก — {lazadaAttributeLabel}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        PIM attribute ต้นทาง: {pimAttributeName}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {!pimOptions ? (
                    <Stack alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={22} />
                    </Stack>
                ) : pimOptions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        PIM attribute นี้ยังไม่มีตัวเลือก (option) เลย — ไปเพิ่มที่หน้าแก้ไข attribute ก่อน
                    </Typography>
                ) : (
                    <Stack spacing={1.5}>
                        {pimOptions.map((o) => (
                            <Stack key={o.id} direction="row" spacing={2} alignItems="center">
                                <Typography variant="body2" sx={{ minWidth: 160, flexShrink: 0 }}>
                                    {o.label}
                                </Typography>
                                <Select
                                    size="small"
                                    fullWidth
                                    displayEmpty
                                    value={values[o.id] ?? ''}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [o.id]: e.target.value }))}
                                >
                                    <MenuItem value="">
                                        <em>— ไม่แมป —</em>
                                    </MenuItem>
                                    {lazadaOptions.map((lo) => (
                                        <MenuItem key={lo.value} value={lo.value}>
                                            {lo.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Stack>
                        ))}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={onClose} sx={fioriDefaultSx}>
                    ยกเลิก
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || !pimOptions || pimOptions.length === 0}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={fioriEmphasizedSx}
                >
                    บันทึก
                </Button>
            </DialogActions>
        </Dialog>
    );
}
