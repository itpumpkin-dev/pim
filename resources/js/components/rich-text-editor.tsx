import { Box } from '@mui/material';
import { useEffect, useState, type ComponentType } from 'react';
import 'react-quill-new/dist/quill.snow.css';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
    const [Quill, setQuill] = useState<ComponentType<any> | null>(null);

    useEffect(() => {
        import('react-quill-new').then((module) => {
            setQuill(() => module.default);
        });
    }, []);

    if (!Quill) {
        return <Box sx={{ minHeight: 200, border: 1, borderColor: 'divider', borderRadius: 1 }} />;
    }

    return (
        <Box sx={{
            '& .ql-container': {
                minHeight: 200,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.9rem',
            },
            '& .ql-toolbar': {
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
            }
        }}>
            <Quill
                theme="snow"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
        </Box>
    );
}
