import AppLogoIcon from '@/components/app-logo-icon';
import styles from './shell-loading.module.css';

const DOT_DELAYS = [0, 0.15, 0.3];

export default function SplashScreen({ exiting = false }: { exiting?: boolean }) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                background: '#fff',
                opacity: exiting ? 0 : 1,
                transition: 'opacity 0.5s ease',
                pointerEvents: exiting ? 'none' : 'auto',
            }}
        >
            <div className={styles.breathe}>
                <AppLogoIcon style={{ width: 124, height: 124 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                {DOT_DELAYS.map((delay) => (
                    <div key={delay} className={styles.splashDot} style={{ animationDelay: `${delay}s` }} />
                ))}
            </div>
        </div>
    );
}
