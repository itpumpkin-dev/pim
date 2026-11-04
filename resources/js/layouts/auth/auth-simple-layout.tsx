import AppLogoIcon from '@/components/app-logo-icon';
import { Link } from '@inertiajs/react';
import { Text, Title } from '@ui5/webcomponents-react';
import { type ReactNode } from 'react';

interface AuthLayoutProps {
    children: ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div
            style={{
                background: 'var(--sapBackgroundColor)',
                display: 'flex',
                minHeight: '100vh',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.5rem',
                padding: 'clamp(1.5rem, 4vw, 2.5rem)',
                boxSizing: 'border-box',
            }}
        >
            <div style={{ width: '100%', maxWidth: 384, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Link
                        href={route('home')}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem',
                            textDecoration: 'none',
                            color: 'inherit',
                        }}
                    >
                        <span style={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                            <AppLogoIcon style={{ width: 36, height: 36, fill: 'currentColor' }} />
                        </span>
                        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{title}</span>
                    </Link>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                        <Title level="H1" size="H5">
                            {title}
                        </Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{description}</Text>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
