import { router, usePage } from '@inertiajs/react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { KeyboardEvent, useState } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { type SharedData } from '@/types';

export interface ExistingOption {
    id: number;
    code?: string;
    admin_label?: string;
}

/**
 * ให้ผู้ใช้เพิ่ม option ใหม่ให้ attribute แบบ select/multiselect ได้โดยไม่ต้อง
 * ออกจากฟอร์มสินค้า — เปิดจาก field ของ attribute นั้นในหน้าแก้ไขสินค้า ยิง
 * ไปที่ endpoint เดียวกับหน้า CRUD options เต็มรูปแบบในหน้าแก้ไข attribute
 * (attribute-options-panel.tsx) เพื่อให้สิทธิ์การใช้งานและ validation
 * เหมือนกันเป๊ะๆ ตัวนี้แค่เป็นทางเข้าแบบแคบๆ สำหรับเพิ่มทีละ option เท่านั้น
 *
 * เก็บ label แค่ของ locale ที่กำลังแก้อยู่ในหน้าสินค้าตอนนั้น (ไม่เก็บทุก
 * locale พร้อมกัน) — locale อื่นค่อยไปกรอกทีหลังจากหน้า options panel เต็ม
 * ส่วน `code` ไม่ได้เก็บเลย เพราะ backend จะ generate ให้เองเสมอ (ดูที่
 * CodeGenerator) ไม่สนใจค่าที่ส่งมาจาก client อยู่แล้ว ดังนั้นถ้าจะให้กรอกตรงนี้
 * ก็ไม่มีประโยชน์อะไร
 */
export function QuickAddOptionDialog({
    open,
    attributeId,
    attributeLabel,
    activeLocaleCode,
    swatchType,
    existingOptions = [],
    onClose,
    onCreated,
}: {
    open: boolean;
    attributeId: number;
    attributeLabel: string;
    activeLocaleCode?: string;
    swatchType?: string | null;
    existingOptions?: ExistingOption[];
    onClose: () => void;
    onCreated: (code: string) => void;
}) {
    const { locales } = useLocale();
    const { props } = usePage<SharedData>();
    const activeLocale = locales.find((l) => l.code === activeLocaleCode) ?? locales[0];
    const [label, setLabel] = useState('');
    const [swatchText, setSwatchText] = useState('');
    const [swatchImage, setSwatchImage] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setLabel('');
        setSwatchText('');
        setSwatchImage(null);
        setError(null);
    };

    const handleClose = () => {
        if (processing) return;
        reset();
        onClose();
    };

    const submit = () => {
        if (!label.trim()) {
            setError('Label is required.');
            return;
        }

        setProcessing(true);
        setError(null);

        router.post(
            `/catalog/attributes/${attributeId}/options`,
            {
                translations: activeLocale ? { [String(activeLocale.id)]: label } : {},
                swatch_value: swatchType === 'color' ? swatchText : undefined,
                swatch_image: swatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                preserveState: true,
                forceFormData: true,
                onSuccess: (page) => {
                    const newCode = (page.props as { created_option_code?: string | null }).created_option_code ?? props.created_option_code;
                    if (newCode) onCreated(newCode);
                    reset();
                    onClose();
                },
                onError: (errors) => {
                    setError((Object.values(errors)[0] as string) ?? 'Could not add option.');
                },
                onFinish: () => setProcessing(false),
            },
        );
    };

    const submitOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    };

    // ลิสต์ดูอย่างเร็วนี้มีแค่ 2 คอลัมน์ (Code, Label) — โชว์ตลอดทั้งคู่เลย
    // ไม่มีอะไรต้องลดความสำคัญลง
    const existingOptionColumns: FioriResponsiveColumn<ExistingOption>[] = [
        {
            key: 'code',
            header: 'Code',
            priority: 'always',
            render: (option) => option.code,
        },
        {
            key: 'label',
            header: 'Label',
            priority: 'always',
            render: (option) => option.admin_label || '—',
        },
    ];

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add option — {attributeLabel}</DialogTitle>
            <DialogContent>
                {existingOptions.length > 0 && (
                    <>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1, mb: 1 }}>
                            Existing options ({existingOptions.length})
                        </Typography>
                        <Box sx={{ maxHeight: 220, mb: 2, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <FioriResponsiveTable
                                variant="plain"
                                size="small"
                                columns={existingOptionColumns}
                                rows={existingOptions}
                                getRowKey={(option) => option.id}
                            />
                        </Box>
                    </>
                )}

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                    New option
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    <TextField
                        label={`Label (${activeLocale?.display_name ?? activeLocale?.code ?? 'default'})`}
                        size="small"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={submitOnEnter}
                        autoFocus
                        sx={{ minWidth: 220, flex: 1 }}
                    />
                    {swatchType === 'color' && (
                        <TextField
                            label="Color (hex)"
                            size="small"
                            value={swatchText}
                            onChange={(e) => setSwatchText(e.target.value)}
                            onKeyDown={submitOnEnter}
                            sx={{ width: 140 }}
                        />
                    )}
                    {swatchType === 'image' && (
                        <TextField
                            type="file"
                            size="small"
                            onChange={(e) => setSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                            slotProps={{ htmlInput: { accept: 'image/*' } }}
                            sx={{ width: 220 }}
                        />
                    )}
                    {error && (
                        <Typography variant="caption" color="error">
                            {error}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={processing}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={submit}
                    disabled={processing || !label.trim()}
                    startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    {processing ? 'Adding…' : 'Add'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
