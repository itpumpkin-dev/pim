import {
    CheckBox,
    DatePicker,
    DateTimePicker,
    FileUploader,
    Input,
    MultiComboBox,
    MultiComboBoxItem,
    Option,
    Select,
    Switch,
    TextArea,
} from '@ui5/webcomponents-react';

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

const FULL_WIDTH = { width: '100%' } as const;

/**
 * เรนเดอร์อินพุตที่เหมาะกับ Category field แบบไดนามิก โดยดูจาก `type`
 * (เป็นหนึ่งใน 10 ชนิดของ CategoryField ที่ UnoPim เอกสารไว้) ใช้ร่วมกันทั้ง
 * ฟอร์มสร้างและแก้ไข category เพื่อให้ switch นี้มีอยู่ที่เดียว ไม่ต้องเขียนซ้ำ
 *
 * ข้อความ error เองแสดงโดย FioriField ที่ห่ออยู่ — ตรงนี้แค่ตั้ง valueState
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
    const valueState = error ? ('Negative' as const) : ('None' as const);

    switch (field.type) {
        case 'Textarea':
            return <TextArea rows={4} style={FULL_WIDTH} value={value ?? ''} valueState={valueState} onInput={(e) => onChange(e.target.value)} />;
        case 'Boolean':
            return <Switch checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
        case 'Checkbox':
            return <CheckBox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
        case 'Select':
            return (
                <Select
                    style={FULL_WIDTH}
                    value={value ?? ''}
                    valueState={valueState}
                    onChange={(e) => onChange(e.detail.selectedOption.value ?? '')}
                >
                    <Option value="">None</Option>
                    {options.map((opt) => (
                        <Option key={opt} value={opt}>
                            {opt}
                        </Option>
                    ))}
                </Select>
            );
        case 'Multiselect': {
            const selected: string[] = Array.isArray(value) ? value : [];
            return (
                <MultiComboBox
                    style={FULL_WIDTH}
                    valueState={valueState}
                    onSelectionChange={(e) => onChange(e.detail.items.map((item) => item.text ?? ''))}
                >
                    {options.map((opt) => (
                        <MultiComboBoxItem key={opt} text={opt} selected={selected.includes(opt)} />
                    ))}
                </MultiComboBox>
            );
        }
        case 'Datetime':
            return (
                <DateTimePicker
                    style={FULL_WIDTH}
                    valueFormat="yyyy-MM-dd'T'HH:mm"
                    value={value ?? ''}
                    valueState={valueState}
                    onChange={(e) => onChange(e.detail.value)}
                />
            );
        case 'Date':
            return (
                <DatePicker
                    style={FULL_WIDTH}
                    valueFormat="yyyy-MM-dd"
                    value={value ?? ''}
                    valueState={valueState}
                    onChange={(e) => onChange(e.detail.value)}
                />
            );
        case 'Image':
        case 'File':
            return (
                <FileUploader
                    style={FULL_WIDTH}
                    accept={field.type === 'Image' ? 'image/*' : undefined}
                    valueState={valueState}
                    onChange={(e) => onChange(e.detail.files?.[0] ?? null)}
                />
            );
        default:
            return <Input style={FULL_WIDTH} value={value ?? ''} valueState={valueState} onInput={(e) => onChange(e.target.value)} />;
    }
}
