import { Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';

/**
 * Simple add/remove list of plain-text option values, used by Select and
 * Multiselect category fields (no swatches — that's the product Attribute
 * option system, which is a separate, richer feature).
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
