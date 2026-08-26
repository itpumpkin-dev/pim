import { Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';

/**
 * ลิสต์เพิ่ม/ลบค่า option แบบข้อความล้วนๆ ง่ายๆ ใช้กับ category field ประเภท
 * Select และ Multiselect (ไม่มีสวอตช์สี — เรื่องสวอตช์เป็นของระบบ option ของ
 * Attribute สินค้า ซึ่งเป็นฟีเจอร์แยกที่ซับซ้อนกว่านี้)
 */
export function OptionListEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    const [draft, setDraft] = useState('');

    const addOption = () => {
        const trimmed = draft.trim();
        if (!trimmed || value.includes(trimmed)) return;
        onChange([...value, trimmed]);
        setDraft('');
    };

    const removeOption = (option: string) => {
        onChange(value.filter((o) => o !== option));
    };

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
                <TextField
                    size="small"
                    fullWidth
                    label="Add option"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addOption();
                        }
                    }}
                />
                <Button variant="outlined" onClick={addOption}>
                    Add
                </Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {value.map((option) => (
                    <Chip key={option} label={option} onDelete={() => removeOption(option)} />
                ))}
                {value.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                        No options yet
                    </Typography>
                )}
            </Stack>
        </Stack>
    );
}
