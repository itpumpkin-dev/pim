import { Box } from '@mui/material';
import { useEffect, useState, type ComponentType } from 'react';
import 'react-quill-new/dist/quill.snow.css';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder, readOnly }: RichTextEditorProps) {
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
                // Quill fires onChange for ANY content change, including its own
                // internal re-normalization of the `value` prop into its canonical
                // HTML shape (e.g. plain text with literal \n, as raw-imported or
                // seeded data has, gets rewritten into <p> tags on mount). Passing
                // that straight to a controlled `onChange` feeds the "normalized"
                // HTML back in as the new `value`, which can normalize again on the
                // next render — an infinite React "Maximum update depth exceeded"
                // loop that freezes the whole page. `source` distinguishes real
                // typing ('user') from Quill's own programmatic changes ('api'/
                // 'silent') — only the former should ever reach the parent.
                onChange={(content: string, _delta: unknown, source: string) => {
                    if (source === 'user') {
                        onChange(content);
                    }
                }}
                placeholder={placeholder}
                readOnly={readOnly}
            />
        </Box>
    );
}
