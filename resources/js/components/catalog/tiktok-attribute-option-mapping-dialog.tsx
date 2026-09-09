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

export interface TikTokAttributeOptionInfo {
    value: string;
    label: string;
}

export interface TikTokAttributeOptionMappingInfo {
    attribute_option_id: number;
    tiktok_option_value: string;
}

interface PimOptionRow {
    id: number;
    code: string;
    label: string;
}

/**
 * Mirror ของ ShopeeAttributeOptionMappingDialog เป๊ะ — ดูตัวนั้นๆ docblock
 * สำหรับ "จับคู่ตัวเลือก" ต่างกันแค่ endpoint/field name (tiktok_ แทน shopee_)
 * เขียนผ่าน TikTokAttributeMappingController::updateOptionMappings()
 */
export function TikTokAttributeOptionMappingDialog({
    open,
    onClose,
    tiktokAttributeLabel,
    pimAttributeId,
    pimAttributeName,
    tiktokAttributeMappingId,
    tiktokOptions,
    initialMappings,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    tiktokAttributeLabel: string;
    pimAttributeId: number;
    pimAttributeName: string;
    tiktokAttributeMappingId: number | null;
    tiktokOptions: TikTokAttributeOptionInfo[];
    initialMappings: TikTokAttributeOptionMappingInfo[];
    onSaved: (mappings: TikTokAttributeOptionMappingInfo[]) => void;
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
            map[m.attribute_option_id] = m.tiktok_option_value;
        });
        setValues(map);
    }, [open, initialMappings]);

    const handleSave = () => {
        if (!tiktokAttributeMappingId || !pimOptions) return;

        setSaving(true);
        const mappings = pimOptions.map((o) => {
            const value = values[o.id] || null;
            const label = value ? (tiktokOptions.find((to) => to.value === value)?.label ?? null) : null;

            return {
                tiktok_attribute_mapping_id: tiktokAttributeMappingId,
                attribute_option_id: o.id,
                tiktok_option_value: value,
                tiktok_option_label: label,
            };
        });

        fetch('/catalog/attributes/tiktok-mapping/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings }),
        })
            .then((res) => {
                if (!res.ok) return;
                onSaved(
                    mappings
                        .filter((m): m is typeof m & { tiktok_option_value: string } => Boolean(m.tiktok_option_value))
                        .map((m) => ({ attribute_option_id: m.attribute_option_id, tiktok_option_value: m.tiktok_option_value })),
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
                        จับคู่ตัวเลือก — {tiktokAttributeLabel}
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
                                    {tiktokOptions.map((to) => (
                                        <MenuItem key={to.value} value={to.value}>
                                            {to.label}
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
