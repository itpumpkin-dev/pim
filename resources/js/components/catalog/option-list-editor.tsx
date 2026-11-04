import '@ui5/webcomponents-icons/dist/add.js';
import { Button, FlexBox, Input, Label, Text, Token, Tokenizer } from '@ui5/webcomponents-react';
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

    const removeOptions = (options: string[]) => {
        onChange(value.filter((o) => !options.includes(o)));
    };

    return (
        <FlexBox direction="Column" style={{ gap: '0.5rem', width: '100%' }}>
            <Label for="option-list-editor-draft" showColon={false}>
                Add option
            </Label>
            <FlexBox alignItems="Center" style={{ gap: '0.5rem' }}>
                <Input
                    id="option-list-editor-draft"
                    style={{ flex: 1, minWidth: 0 }}
                    value={draft}
                    onInput={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addOption();
                        }
                    }}
                />
                <Button icon="add" onClick={addOption}>
                    Add
                </Button>
            </FlexBox>
            {value.length > 0 ? (
                <Tokenizer multiLine style={{ width: '100%' }} onTokenDelete={(e) => removeOptions(e.detail.tokens.map((token) => token.text ?? ''))}>
                    {value.map((option) => (
                        <Token key={option} text={option} />
                    ))}
                </Tokenizer>
            ) : (
                <Text style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>No options yet</Text>
            )}
        </FlexBox>
    );
}
