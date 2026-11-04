import { Title } from '@ui5/webcomponents-react';

export default function HeadingSmall({ title, description }: { title: string; description?: string }) {
    return (
        <header>
            <Title level="H3" size="H5" wrappingType="Normal" style={{ marginBottom: '0.25rem' }}>
                {title}
            </Title>
            {description && <div style={{ color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSize)' }}>{description}</div>}
        </header>
    );
}
