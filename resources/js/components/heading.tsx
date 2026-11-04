import { Title } from '@ui5/webcomponents-react';

export default function Heading({ title, description }: { title: string; description?: string }) {
    return (
        <div style={{ marginBottom: '2rem' }}>
            <Title level="H2" size="H4" wrappingType="Normal">
                {title}
            </Title>
            {description && (
                <div style={{ marginTop: '0.25rem', color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSize)' }}>{description}</div>
            )}
        </div>
    );
}
