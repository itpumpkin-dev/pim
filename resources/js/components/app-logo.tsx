import AppLogoIcon from './app-logo-icon';

export default function AppLogo({ collapsed = false }: { collapsed?: boolean }) {
    return (
        <>
            <span
                style={{
                    display: 'flex',
                    aspectRatio: '1 / 1',
                    width: 46,
                    height: 46,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                    color: 'var(--sapBrandColor)',
                    flexShrink: 0,
                }}
            >
                <AppLogoIcon style={{ width: 46, height: 46, fill: 'currentColor' }} />
            </span>
            {!collapsed && (
                <span style={{ marginLeft: '0.5rem', display: 'grid', flex: 1, textAlign: 'left' }}>
                    <span
                        style={{
                            fontFamily: 'var(--sapFontFamily)',
                            fontWeight: 900,
                            lineHeight: 1,
                            fontSize: 24,
                            color: 'var(--sapTextColor)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        PIM<span style={{ color: 'var(--sapBrandColor)' }}>Pumpkin</span>
                    </span>
                </span>
            )}
        </>
    );
}
