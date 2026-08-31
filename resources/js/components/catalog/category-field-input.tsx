import { fioriSwitchSx } from '@/lib/fiori-style';
import { Checkbox, MenuItem, Select, Switch, TextField } from '@mui/material';

export interface CategoryFieldItem {
    id: number;
    code: string;
    type: string;
    labels: Record<string, string>;
    options: string[] | null;
    is_required: boolean;
    status: boolean;
    position: number;
    display_section: string | null;
}

/**
 * เรนเดอร์อินพุตที่เหมาะกับ Category field แบบไดนามิก โดยดูจาก `type`
 * (เป็นหนึ่งใน 10 ชนิดของ CategoryField ที่ UnoPim เอกสารไว้) ใช้ร่วมกันทั้ง
 * ฟอร์มสร้างและแก้ไข category เพื่อให้ switch นี้มีอยู่ที่เดียว ไม่ต้องเขียนซ้ำ
 */
export function CategoryFieldInput({
    field,
    value,
    onChange,
    error,
}: {
    field: CategoryFieldItem;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChange: (value: any) => void;
    error?: string;
}) {
    const options = field.options ?? [];

    switch (field.type) {
        case 'Textarea':
            return (
                <TextField
                    multiline
                    rows={4}
                    fullWidth
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={Boolean(error)}
                    helperText={error}
                />
            );
        case 'Boolean':
            return <Switch sx={fioriSwitchSx} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
        case 'Checkbox':
            return <Checkbox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
        case 'Select':
            return (
                <Select fullWidth size="small" value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={Boolean(error)}>
                    <MenuItem value="">
                        <em>None</em>
                    </MenuItem>
                    {options.map((opt) => (
                        <MenuItem key={opt} value={opt}>
                            {opt}
                        </MenuItem>
                    ))}
                </Select>
            );
        case 'Multiselect':
            return (
                <Select
                    fullWidth
                    size="small"
                    multiple
                    value={Array.isArray(value) ? value : []}
                    onChange={(e) => onChange(e.target.value)}
                    error={Boolean(error)}
                >
                    {options.map((opt) => (
                        <MenuItem key={opt} value={opt}>
                            {opt}
                        </MenuItem>
                    ))}
                </Select>
            );
        case 'Datetime':
            return (
                <TextField
                    type="datetime-local"
                    fullWidth
                    size="small"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={Boolean(error)}
                    helperText={error}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
            );
        case 'Date':
            return (
                <TextField
                    type="date"
                    fullWidth
                    size="small"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={Boolean(error)}
                    helperText={error}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
            );
        case 'Image':
        case 'File':
            return (
                <TextField
                    type="file"
                    fullWidth
                    size="small"
                    onChange={(e) => onChange((e.target as HTMLInputElement).files?.[0] ?? null)}
                    error={Boolean(error)}
                    helperText={error}
                    slotProps={{ htmlInput: { accept: field.type === 'Image' ? 'image/*' : undefined } }}
                />
            );
        default:
            return (
                <TextField
                    size="small"
                    fullWidth
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={Boolean(error)}
                    helperText={error}
                />
            );
    }
}
